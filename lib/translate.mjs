import { createHash } from 'node:crypto';
export const translationKey = text => createHash('sha256').update('en|zh-CN\0' + text).digest('hex');
export function freshCache(cache, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return { version: 1, entries: cache?.entries || {}, day, used: cache?.day === day ? Number(cache.used) || 0 : 0 };
}
const hasChinese = text => /[\u3400-\u9fff]/u.test(text);
function candidate(text) {
  if (typeof text !== 'string' || !text.trim() || hasChinese(text) || !/[a-z]{3}/i.test(text)) return '';
  const words = text.replace(/\s+/g, ' ').trim();
  // MyMemory accepts segments of at most 500 UTF-8 bytes. Keep a small margin.
  let segment = words;
  while (Buffer.byteLength(segment, 'utf8') > 480) segment = segment.slice(0, Math.max(0, segment.lastIndexOf(' ')));
  return segment;
}
export async function translateItems(items, originalCache, options = {}) {
  const cache = freshCache(originalCache, options.now || new Date());
  const fetcher = options.fetcher || fetch;
  const budget = Math.max(0, Math.min(Number(options.budget ?? 4000), 4500));
  const stats = { requests: 0, translated: 0, cached: 0, error: null, used: cache.used, dailyBudget: budget };
  const result = items.map(item => ({ ...item }));
  const jobs = [];
  // Translate meaningful news titles first; keep repository names and versions intact.
  for (const item of result) {
    if (item.kind === 'release') {
      item.titleZh = item.title;
      item.descriptionZh = `${item.source} 版本动态。详细改动、修复和升级说明请查看原始发布记录。`;
      item.translationKind = 'category-summary';
    } else if (item.kind === 'project') item.titleZh = item.title;
    else jobs.push({ item, field: 'title', target: 'titleZh' });
  }
  for (const item of result.filter(i => i.kind === 'project')) jobs.push({ item, field: 'description', target: 'descriptionZh' });
  for (const item of result.filter(i => i.kind === 'official')) jobs.push({ item, field: 'description', target: 'descriptionZh' });
  let unavailable = false;
  for (const { item, field, target } of jobs) {
    if (item[target]) { stats.cached++; continue; }
    const source = item[field];
    if (typeof source !== 'string') continue;
    if (hasChinese(source)) { item[target] = source; continue; }
    const segment = candidate(source);
    if (!segment) continue;
    const key = translationKey(segment);
    if (cache.entries[key]?.text) { item[target] = cache.entries[key].text; stats.cached++; continue; }
    if (unavailable || options.enabled === false || stats.requests >= (options.maxRequests ?? Infinity) || cache.used + segment.length > budget) continue;
    cache.used += segment.length;
    stats.requests++;
    try {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', segment);
      url.searchParams.set('langpair', 'en|zh-CN');
      if (options.email) url.searchParams.set('de', options.email);
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`翻译服务 HTTP ${response.status}`);
      const body = await response.json();
      const translated = body.responseData?.translatedText;
      if (Number(body.responseStatus) !== 200 || !translated || /MYMEMORY WARNING|QUOTA|REQUEST LIMIT/i.test(translated)) {
        throw new Error('翻译服务暂不可用或今日免费额度已用完');
      }
      if (!hasChinese(translated) && translated.toLowerCase() === segment.toLowerCase()) continue;
      item[target] = translated;
      cache.entries[key] = { text: translated, at: new Date().toISOString() };
      stats.translated++;
    } catch (error) { stats.error = error.message; unavailable = true; }
  }
  // Bounded persistent cache; these are public article excerpts, never credentials.
  const entries = Object.entries(cache.entries);
  if (entries.length > 4000) cache.entries = Object.fromEntries(entries.slice(-4000));
  stats.used = cache.used;
  return { items: result, cache, stats };
}
