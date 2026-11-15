import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export const utc8Date = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
async function readJson(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } }
async function atomicWrite(file, content) { const tmp=file+'.tmp'; await writeFile(tmp,content); await rename(tmp,file); }
export async function archiveSnapshot(snapshot, historyDirectory, now = new Date()) {
  if (!snapshot.items?.length || !snapshot.sources?.some(source => source.status === 'ok')) throw new Error('No successful snapshot to archive');
  const day=utc8Date(now);
  await mkdir(historyDirectory,{recursive:true});
  const indexPath=path.join(historyDirectory,'index.json');
  const index=await readJson(indexPath,{version:1,entries:[]});
  const data={...snapshot,archiveDate:day};
  const content=JSON.stringify(data,null,2)+'\n';
  await atomicWrite(path.join(historyDirectory,day+'.json'),content);
  const entry={date:day,updatedAt:snapshot.updatedAt,items:snapshot.items.length,sha256:createHash('sha256').update(content).digest('hex')};
  index.entries=[...index.entries.filter(entry=>entry.date!==day),entry].sort((a,b)=>b.date.localeCompare(a.date));
  index.updatedAt=new Date(now).toISOString();
  await atomicWrite(indexPath,JSON.stringify(index,null,2)+'\n');
  return index;
}
