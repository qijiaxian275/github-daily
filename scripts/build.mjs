import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const data = JSON.parse(await readFile(path.join(root, 'public/data/news.json'), 'utf8'));
try { data.historyEntries=JSON.parse(await readFile(path.join(root,'public/history/index.json'),'utf8')).entries; } catch { data.historyEntries=[]; }
if (!Array.isArray(data.items) || !data.items.length) throw new Error('No news snapshot to publish');
let html = await readFile(path.join(root, 'src/index.html'), 'utf8');
const seed = JSON.stringify(data).replace(/</g, '\\u003c');
html = html.replace(/(<script\b[^>]*id=["']seed-data["'][^>]*>)[\s\S]*?(<\/script>)/i, (_, open, close) => open + seed + close);
await mkdir(path.join(root, 'public'), { recursive: true });
await writeFile(path.join(root, 'public/index.html'), html);
await writeFile(path.join(root, 'public/.nojekyll'), '');
await writeFile(path.join(root, 'public/robots.txt'), 'User-agent: *\nAllow: /\n');
console.log(JSON.stringify({ built: true, items: data.items.length, translatedTitles: data.items.filter(i => i.titleZh && i.titleZh !== i.title).length, translatedDescriptions: data.items.filter(i => i.descriptionZh && i.descriptionZh !== i.description && i.translationKind !== 'category-summary').length, updatedAt: data.updatedAt }));
