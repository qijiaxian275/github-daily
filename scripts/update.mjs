import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, parseFeed, parseProjects, projectUrl } from '../lib/feeds.ts';
import { translateItems } from '../lib/translate.mjs';
import { archiveSnapshot } from '../lib/archive.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const snapshotPath = path.join(root, 'public/data/news.json');
const cachePath = path.join(root, 'data/translation-cache.json');
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
export async function collect(previous, options = {}) {
  const now = options.now || new Date(), stamp = now.toISOString(), fetcher = options.fetcher || fetch;
  const old = previous || { items: [], sources: [], updatedAt: null };
  const batches = await Promise.all(SOURCES.map(async source => {
    const prior = old.sources.find(s => s.id === source.id);
    const retained = old.items.filter(i => i.sourceId === source.id);
    const state = { id: source.id, label: source.label, url: source.url, status: 'ok', updatedAt: stamp };
    if (prior?.retryAt && Date.parse(prior.retryAt) > now.getTime()) return { items: retained, state: prior, ok: false };
    try {
      const headers = { 'User-Agent': 'GitHubDaily-CN/2.0 public news reader', Accept: source.format === 'json' ? 'application/vnd.github+json' : 'application/atom+xml, application/rss+xml, application/xml, text/xml' };
      if (prior?.etag && retained.length) headers['If-None-Match'] = prior.etag;
      if (prior?.lastModified && retained.length) headers['If-Modified-Since'] = prior.lastModified;
      if (source.format === 'json' && process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
      const response = await fetcher(source.format === 'json' ? projectUrl(now) : source.url, { headers, signal: AbortSignal.timeout(25000) });
      if (response.status === 304 && retained.length) return { items: retained, state: { ...prior, status: 'ok', updatedAt: stamp, error: undefined, retryAt: undefined }, ok: true };
      if (!response.ok) {
        if ([403, 429].includes(response.status)) {
          const retry = response.headers.get('retry-after');
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          const retryAt = retry ? (/^\d+$/.test(retry) ? now.getTime() + Number(retry) * 1000 : Date.parse(retry)) : reset;
          state.retryAt = new Date(Math.max(now.getTime() + 60000, Number.isFinite(retryAt) && retryAt > now.getTime() ? retryAt : now.getTime() + 3600000)).toISOString();
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const items = source.format === 'json' ? parseProjects(await response.json()) : parseFeed(await response.text(), source);
      if (!items.length) throw new Error('来源未返回可用内容');
      state.etag = response.headers.get('etag') || undefined;
      state.lastModified = response.headers.get('last-modified') || undefined;
      const byUrl = new Map(retained.map(i => [i.url, i]));
      return { items: items.map(i => {
        const before = byUrl.get(i.url);
        return { ...i, ...(before?.title === i.title && before.titleZh ? { titleZh: before.titleZh } : {}), ...(before?.description === i.description && before.descriptionZh ? { descriptionZh: before.descriptionZh } : {}) };
      }), state, ok: true };
    } catch (error) {
      return { items: retained, state: { ...prior, ...state, status: 'error', updatedAt: prior?.updatedAt || null, error: error.message }, ok: false };
    }
  }));
  const seen = new Set();
  const items = batches.flatMap(b => b.items).filter(i => { if (seen.has(i.url)) return false; seen.add(i.url); return true; }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { updatedAt: batches.some(b => b.ok) ? stamp : old.updatedAt, lastAttemptAt: stamp, items, sources: batches.map(b => b.state), successfulSources: batches.filter(b => b.ok).length };
}
async function main() {
  const old = await readJson(snapshotPath, { items: [], sources: [], updatedAt: null });
  const next = process.argv.includes('--translate-only') ? { ...old, successfulSources: old.sources.filter(s => s.status === 'ok').length } : await collect(old);
  const translated = await translateItems(next.items, await readJson(cachePath, {}), {
    budget: process.env.TRANSLATION_DAILY_CHARS || 4000,
    enabled: process.env.TRANSLATE !== '0',
    email: process.env.MYMEMORY_EMAIL,
  });
  next.items = translated.items;
  next.translation = { provider: 'MyMemory', ...translated.stats, checkedAt: new Date().toISOString() };
  next.automation = { enabled: process.env.GITHUB_ACTIONS === 'true', engine: 'github-actions', scheduleLabel: '每日约 09:17（UTC+8）', repository: process.env.GITHUB_REPOSITORY || null };
  next.isScheduled = next.automation.enabled;
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(translated.cache, null, 2) + '\n');
  await writeFile(snapshotPath, JSON.stringify(next, null, 2) + '\n');
  if (next.items.length && next.successfulSources) await archiveSnapshot(next,path.join(root,'public/history'));
  console.log(JSON.stringify({ updatedAt: next.updatedAt, items: next.items.length, translatedTitles: next.items.filter(i => i.titleZh).length, successfulSources: next.successfulSources, translation: next.translation }));
  if (!next.items.length || !next.successfulSources) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
