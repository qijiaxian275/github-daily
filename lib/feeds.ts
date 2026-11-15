export type NewsItem = {
  id: string; kind: "official" | "release" | "project"; title: string;
  description: string; url: string; publishedAt: string; source: string;
  sourceId: string; tag?: string; stars?: number; language?: string; repo?: string;
};
export type SourceState = {
  id: string; label: string; url: string; status: "ok" | "error" | "pending";
  updatedAt: string | null; error?: string; etag?: string; lastModified?: string; retryAt?: string;
};
export const SOURCES = [
  {id:"blog",label:"GitHub Blog",url:"https://github.blog/feed/",kind:"official",format:"rss"},
  {id:"changelog",label:"GitHub Changelog",url:"https://github.blog/changelog/feed/",kind:"official",format:"rss"},
  {id:"cli",label:"GitHub CLI",url:"https://github.com/cli/cli/releases.atom",kind:"release",format:"atom"},
  {id:"node",label:"Node.js",url:"https://github.com/nodejs/node/releases.atom",kind:"release",format:"atom"},
  {id:"vite",label:"Vite",url:"https://github.com/vitejs/vite/releases.atom",kind:"release",format:"atom"},
  {id:"projects",label:"GitHub 近期新项目",url:"https://api.github.com/search/repositories",kind:"project",format:"json"},
] as const;
export function decode(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n) => {const p=n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):parseInt(n,10);return p>0&&p<=0x10ffff?String.fromCodePoint(p):"";})
    .replace(/&(lt|gt|amp|quot|apos|nbsp|#39);/g,(_,n:string)=>(({lt:"<",gt:">",amp:"&",quot:'"',apos:"'",nbsp:" ","#39":"'"} as Record<string,string>)[n]||""));
}
export function plain(value: string) {
  return decode(decode(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," "))
    .replace(/\s+/g," ").trim();
}
function field(xml:string,name:string) { return xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,"i"))?.[1]||""; }
function safeUrl(raw:string) {try {const u=new URL(decode(raw).trim());return u.protocol==="https:"?u.href:"";}catch{return "";}}
export function parseFeed(xml:string, source:typeof SOURCES[number]):NewsItem[] {
  if(!/<(?:rss|feed|rdf:RDF)\b/i.test(xml)) throw new Error("来源返回的内容不是有效 RSS/Atom");
  const atom=source.format==="atom";
  const blocks=xml.match(atom?/<entry\b[^>]*>[\s\S]*?<\/entry>/gi:/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
  return blocks.map<NewsItem|null>(block=>{
    const links=(block.match(/<link\b[^>]*>/gi)||[]).map(tag=>({rel:tag.match(/\brel=["']([^"']+)["']/i)?.[1],href:tag.match(/\bhref=["']([^"']+)["']/i)?.[1]}));
    const link=atom?((links.find(l=>l.rel==="alternate")||links.find(l=>!l.rel))?.href||""):field(block,"link");
    const url=safeUrl(link); const title=plain(field(block,"title"));
    const date=new Date(plain(field(block,atom?"updated":"pubDate")));
    if(!url||!title||!Number.isFinite(date.getTime()))return null;
    const release=source.kind==="release";
    const description=plain(field(block,atom?"content":"description")||field(block,"summary")).replace(/^Git-EVTag-v0-SHA512:\s*[a-f0-9]+\s*/i,"").slice(0,300);
    return {id:source.id+":"+url,kind:source.kind,title:release?source.label+" · "+title:title,
      description:description||(release?"查看完整发布说明与变更记录。":""),
      url,publishedAt:date.toISOString(),source:source.label,sourceId:source.id,tag:release?"版本发布":source.id==="changelog"?"产品更新":"官方博客"};
  }).filter((v):v is NewsItem=>!!v).slice(0,20);
}
export function projectUrl(now=new Date()) {
  const since=new Date(now.getTime()-30*86400000).toISOString().slice(0,10);
  return `https://api.github.com/search/repositories?q=${encodeURIComponent("created:>="+since+" stars:>20 archived:false")}&sort=stars&order=desc&per_page=20`;
}
export function parseProjects(body:any):NewsItem[] {
  if(!Array.isArray(body.items)) throw new Error("项目搜索返回格式异常");
  return body.items.filter((r:any)=>typeof r.full_name==="string"&&Number.isFinite(Date.parse(r.created_at))).map((r:any)=>({id:"projects:"+r.full_name,kind:"project" as const,title:r.full_name,
    repo:r.full_name,description:plain(r.description||"暂无项目描述"),url:safeUrl(r.html_url),
    publishedAt:r.created_at,source:"GitHub 近期新项目",sourceId:"projects",tag:"近 30 天创建",
    stars:Number(r.stargazers_count)||0,language:r.language||"未标注"})).filter((r:NewsItem)=>r.url&&r.title);
}
