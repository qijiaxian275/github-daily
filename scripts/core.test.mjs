import test from 'node:test';
import assert from 'node:assert/strict';
import { collect } from './update.mjs';
import { SOURCES, parseFeed } from '../lib/feeds.ts';
import { translateItems, freshCache } from '../lib/translate.mjs';
const now = new Date('2026-11-15T01:17:00Z');
const previous = () => ({ updatedAt: '2026-11-14T01:17:00Z', sources: SOURCES.map(s => ({ id:s.id,label:s.label,url:s.url,status:'ok',updatedAt:'2026-11-14T01:17:00Z',etag:'"old"' })), items: SOURCES.map(s => ({id:s.id,sourceId:s.id,kind:s.kind,title:'Old news',description:'Original',url:'https://example.com/'+s.id,publishedAt:'2026-11-14T00:00:00Z',titleZh:'历史新闻'})) });
test('all-source failure retains content and last successful timestamp', async () => {
  const old=previous(); const result=await collect(old,{now,fetcher:async()=>{throw new Error('Network unavailable');}});
  assert.equal(result.updatedAt,old.updatedAt); assert.equal(result.items.length,6); assert.equal(result.successfulSources,0); assert.ok(result.sources.every(s=>s.status==='error'));
});
test('304 retains translated content, marks sources checked, and clears old errors', async()=>{
  const result=await collect(previous(),{now,fetcher:async()=>new Response(null,{status:304})});
  assert.equal(result.successfulSources,6); assert.equal(result.updatedAt,now.toISOString()); assert.ok(result.items.every(i=>i.titleZh==='历史新闻'));
});
test('rate-limited sources preserve content and respect a future retry time',async()=>{
  const result=await collect(previous(),{now,fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'7200'}})});
  assert.equal(result.items.length,6); assert.ok(result.sources.every(s=>Date.parse(s.retryAt)===now.getTime()+7200000));
  let calls=0; await collect(result,{now:new Date(now.getTime()+1000),fetcher:async()=>{calls++;return new Response('');}}); assert.equal(calls,0);
});
test('feed parser rejects unsafe article links and removes markup',()=>{
  const source=SOURCES.find(s=>s.id==='blog');
  const xml='<rss><channel><item><title>Bad</title><link>javascript:alert(1)</link><pubDate>Sun, 15 Nov 2026 00:00:00 GMT</pubDate></item><item><title>Good &amp; safe</title><link>https://github.blog/good</link><pubDate>Sun, 15 Nov 2026 00:00:00 GMT</pubDate><description><![CDATA[<script>bad()</script><p>Good text</p>]]></description></item></channel></rss>';
  const items=parseFeed(xml,source); assert.equal(items.length,1); assert.equal(items[0].title,'Good & safe'); assert.equal(items[0].description,'Good text');
});
test('translation budget persists across same-day runs and cache avoids repeated calls',async()=>{
  let calls=0; const fetcher=async()=>{calls++;return Response.json({responseStatus:200,responseData:{translatedText:'新的功能'}});};
  const input=[{kind:'official',title:'New feature',description:'',id:'1'}];
  const first=await translateItems(input,{}, {now,fetcher,budget:11}); assert.equal(first.items[0].titleZh,'新的功能'); assert.equal(first.cache.used,11);
  const next=await translateItems(input,first.cache,{now,fetcher,budget:11}); assert.equal(calls,1); assert.equal(next.items[0].titleZh,'新的功能');
  const limited=await translateItems([{kind:'official',title:'Another feature'}],next.cache,{now,fetcher,budget:11});assert.equal(limited.stats.requests,0);
  assert.equal(freshCache(first.cache,new Date('2026-11-16T00:00:00Z')).used,0);
});
test('translation failure preserves original content and stops further service calls',async()=>{
  let calls=0; const result=await translateItems([{kind:'official',title:'One feature'},{kind:'official',title:'Two features'}],{}, {now,fetcher:async()=>{calls++;return new Response('',{status:429});}});
  assert.equal(calls,1); assert.equal(result.items[0].title,'One feature');assert.equal(result.items[0].titleZh,undefined);assert.ok(result.stats.error);
});
test('release guides are marked as category summaries, not claimed as full translations',async()=>{
  const r=await translateItems([{kind:'release',title:'Node.js v24.1',source:'Node.js'}],{}, {enabled:false});
  assert.equal(r.items[0].translationKind,'category-summary');assert.match(r.items[0].descriptionZh,/发布记录/);assert.equal(r.stats.requests,0);
});
