import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {archiveSnapshot,utc8Date} from '../lib/archive.mjs';
const snapshot={updatedAt:'2026-11-15T01:17:00Z',items:[{id:'one',title:'第一天'}],sources:[{status:'ok'}]};
test('archive uses UTC+8 calendar boundaries',()=>{
  assert.equal(utc8Date('2026-11-15T15:59:59Z'),'2026-11-15');
  assert.equal(utc8Date('2026-11-15T16:00:00Z'),'2026-11-16');
});
test('new daily snapshots preserve previous days and index all dates',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'github-daily-archive-'));
  try{
    await archiveSnapshot(snapshot,directory,new Date('2026-11-15T01:17:00Z'));
    const first=await readFile(path.join(directory,'2026-11-15.json'),'utf8');
    const second={...snapshot,items:[{id:'two',title:'第二天'}],updatedAt:'2026-11-16T01:17:00Z'};
    let index=await archiveSnapshot(second,directory,new Date('2026-11-16T01:17:00Z'));
    assert.equal(await readFile(path.join(directory,'2026-11-15.json'),'utf8'),first);
    assert.deepEqual(index.entries.map(e=>e.date),['2026-11-16','2026-11-15']);
    index=await archiveSnapshot({...second,items:[...second.items,{id:'three'}]},directory,new Date('2026-11-16T02:17:00Z'));
    assert.equal(index.entries.length,2);assert.equal(index.entries[0].items,2);
    assert.equal(await readFile(path.join(directory,'2026-11-15.json'),'utf8'),first);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('failed or empty collections do not create misleading daily archives',async()=>{
  await assert.rejects(()=>archiveSnapshot({items:[],sources:[]},os.tmpdir()),/No successful snapshot/);
  await assert.rejects(()=>archiveSnapshot({...snapshot,sources:[{status:'error'}]},os.tmpdir()),/No successful snapshot/);
});
