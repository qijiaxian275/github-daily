(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const offline = location.protocol === 'file:';
  const store = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const persist = (k, value) => { try { localStorage.setItem(k, JSON.stringify(value)); } catch {} };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const icon = name => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', '#i-' + name); svg.append(use); return svg; };
  const link = (url, cls, label) => { const a = el('a', cls, label); try { const u = new URL(url); if (u.protocol === 'https:') { a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } } catch {} return a; };
  const number = value => new Intl.NumberFormat('zh-CN', { notation: Number(value) > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const date = value => { const d = new Date(value); return value && Number.isFinite(d.getTime()) ? d : null; };
  const dateText = value => { const d = date(value); return d ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : '尚未成功更新'; };
  const ago = value => { const d = date(value); if (!d) return '时间未知'; const hours = (Date.now() - d) / 3600000; if (hours >= 0 && hours < 1) return Math.max(1, Math.floor(hours * 60)) + ' 分钟前'; if (hours >= 1 && hours < 24) return Math.floor(hours) + ' 小时前'; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' }).format(d); };
  const labels = { official: '官方动态', release: '版本发布', project: '开源项目' };
  let data = { items: [], sources: [], updatedAt: null };
  try { data = JSON.parse($('seed-data').textContent); } catch {}
  let saved = new Set(store('github-daily-saved', [])), tab = 'all', pageSize = 15, loading = false, toastTimer;
  let language = store('github-daily-language', 'zh'), viewDate = '', historyEntries = data.historyEntries || [];
  const requestedDate=new URLSearchParams(location.search).get('date');
  if (!['zh', 'original'].includes(language)) language = 'zh';
  $('language-select').value = language;
  const translated = (item, field) => language === 'zh' && item[field + 'Zh'] ? item[field + 'Zh'] : item[field] || '';
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
  function setTheme(theme) { document.documentElement.dataset.theme = theme; $('theme-button').replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon')); $('theme-button').setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题'); persist('github-daily-theme', theme); }
  setTheme(store('github-daily-theme', matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
  $('theme-button').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('header-date').textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  function banner(message) { $('status-banner').classList.toggle('show', Boolean(message)); $('banner-text').textContent = message || ''; }
  function freshness() {
    const notices = [];
    if(viewDate) { banner(`正在查看 ${viewDate} 的历史快照。选择「最新日报」返回当前内容。`); return; }
    if (offline) notices.push('离线快照：搜索、收藏和语言切换可用，内容保留下载时的状态。');
    else if (!data.updatedAt || Date.now() - Date.parse(data.updatedAt) > 40 * 3600000) notices.push('这份内容已超过一天未成功更新，请查看来源状态或稍后重新加载。');
    const errors = data.sources.filter(s => s.status === 'error');
    if (errors.length) notices.push(`${errors.length} 个来源暂不可用，继续保留上次成功内容。`);
    if (data.translation?.error) notices.push('本次中文翻译暂不可用，未翻译条目保留原文。');
    banner(notices.join(' '));
  }
  function selectTab(value) {
    tab = value; pageSize = 15;
    document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    renderList();
  }
  function filtered() {
    const q = $('search-input').value.trim().toLocaleLowerCase(), days = Number($('period-select').value);
    return data.items.filter(item => (tab === 'all' || (tab === 'saved' ? saved.has(item.id) : item.kind === tab)) && (!days || Date.now() - Date.parse(item.publishedAt) <= days * 86400000) && (!q || [item.title, item.titleZh, item.description, item.descriptionZh, item.repo, item.language, item.source, item.tag].filter(Boolean).join(' ').toLocaleLowerCase().includes(q))).sort((a, b) => ($('sort-select').value === 'stars' ? (Number(b.stars) || 0) - (Number(a.stars) || 0) : 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
  function card(item) {
    const article = el('article', 'news-card');
    const meta = el('div', 'card-meta'), time = el('time', '', ago(item.publishedAt));
    if (date(item.publishedAt)) time.dateTime = item.publishedAt;
    time.title = dateText(item.publishedAt);
    meta.append(el('span', 'badge ' + item.kind, labels[item.kind]), el('span', '', item.source), el('span', 'meta-dot', '·'), time);
    article.append(meta);
    const save = el('button', 'save-button' + (saved.has(item.id) ? ' saved' : '')); save.type = 'button'; save.append(icon('bookmark'));
    function saveLabel() { save.setAttribute('aria-pressed', String(saved.has(item.id))); save.setAttribute('aria-label', (saved.has(item.id) ? '取消收藏：' : '收藏：') + translated(item, 'title')); }
    saveLabel();
    save.onclick = () => { const was = saved.has(item.id); was ? saved.delete(item.id) : saved.add(item.id); persist('github-daily-saved', [...saved]); $('saved-count').textContent = saved.size || ''; if (tab === 'saved') renderList(); else { save.classList.toggle('saved', !was); saveLabel(); } toast(was ? '已取消收藏' : '已收藏，保存在当前浏览器'); };
    article.append(save);
    const title = el('h2', 'card-title'); title.append(link(item.url, '', translated(item, 'title'))); article.append(title);
    if (language === 'zh' && item.titleZh && item.titleZh !== item.title) article.append(el('p', 'original-title', item.title));
    if (translated(item, 'description')) article.append(el('p', 'card-desc', translated(item, 'description')));
    if (language === 'zh' && item.kind !== 'release') {
      const hasTranslation = (item.titleZh && item.titleZh !== item.title) || (item.descriptionZh && item.descriptionZh !== item.description);
      article.append(el('p', 'translation-note', hasTranslation ? '机器翻译 · 以原文为准' : /[a-z]{3}/i.test(item.title + item.description) ? '原文保留 · 中文翻译陆续补充' : '来源原文'));
    }
    const bottom = el('div', 'card-bottom'), detail = el('div', 'card-detail');
    if (item.language) detail.append(el('span', '', item.language));
    if (item.stars !== undefined) { const n = el('span'); n.append(icon('star'), document.createTextNode(number(item.stars))); detail.append(n); }
    if (!detail.childNodes.length) detail.append(el('span', '', item.tag || '公开来源'));
    const read = link(item.url, 'read-link', item.kind === 'project' ? '查看项目' : '阅读原文'); read.append(icon('external')); bottom.append(detail, read); article.append(bottom);
    return article;
  }
  function renderList() {
    const items = filtered(); $('news-list').replaceChildren();
    $('result-count').textContent = `共 ${items.length} 条${tab === 'saved' ? '收藏' : '动态'}`;
    $('list-hint').textContent = language === 'zh' ? '中文优先 · 原文可核对' : '原始标题与摘要';
    if (!items.length) {
      const empty = el('div', 'empty'); empty.append(icon(tab === 'saved' ? 'bookmark' : 'search'), el('h3', '', tab === 'saved' ? '收藏你想再读的信息' : '没有找到匹配内容'), el('p', '', '试试其他关键词、时间范围或分类。收藏仅保存在当前浏览器。'));
      const reset = el('button', 'small-button', '清除筛选'); reset.onclick = () => { $('search-input').value = ''; $('period-select').value = '0'; selectTab('all'); }; empty.append(reset); $('news-list').append(empty);
    } else items.slice(0, pageSize).forEach(item => $('news-list').append(card(item)));
    $('load-more').hidden = items.length <= pageSize; $('load-more').textContent = `加载更多 · 还有 ${Math.max(0, items.length - pageSize)} 条`; $('end-note').hidden = !items.length || items.length > pageSize;
  }
  function renderRadar() {
    $('radar-list').replaceChildren();
    data.items.filter(i => i.kind === 'project').sort((a, b) => b.stars - a.stars).slice(0, 5).forEach((item, index) => {
      const row = el('div', 'radar-item'), body = el('div'); row.append(el('span', 'rank', String(index + 1).padStart(2, '0')));
      body.append(link(item.url, 'repo-name', item.repo || item.title), el('p', 'repo-desc', translated(item, 'description')), el('div', 'repo-details', '★ ' + number(item.stars) + (item.language ? ' · ' + item.language : ''))); row.append(body); $('radar-list').append(row);
    });
  }
  function renderSources() {
    $('sources-mini').replaceChildren(); $('dialog-sources').replaceChildren();
    data.sources.forEach(source => {
      const row = el('div', 'source-mini'), name = el('span'); name.append(el('i', 'source-state ' + source.status), document.createTextNode(source.label)); row.append(name, el('em', '', source.status === 'ok' ? '正常' : '暂不可用')); $('sources-mini').append(row);
      const detail = el('div', 'dialog-source'), top = el('div', 'dialog-source-top'); top.append(link(source.url, '', source.label), el('span', '', source.status === 'ok' ? '正常' : '保留旧内容')); detail.append(top, el('p', '', '最后成功：' + dateText(source.updatedAt))); if (source.error) detail.append(el('p', '', source.error)); $('dialog-sources').append(detail);
    });
    const active = data.automation?.enabled ?? data.isScheduled;
    $('schedule-label').textContent = viewDate ? '历史日报 · '+viewDate : offline ? '离线快照' : data.runtime?.refreshOnRead ? '每日检查 · 打开即更新' : active ? data.automation?.scheduleLabel || '每日 09:00 · 自动更新' : '更新配置待启用';
    $('update-time').textContent = '上次抓取 ' + dateText(data.updatedAt) + ' · UTC+8';
    const note = $('dialog-note'); note.replaceChildren();
    note.append(el('strong', '', offline ? '当前为离线快照。' : data.runtime?.refreshOnRead ? '网站每天首次访问时检查并抓取新内容。' : active ? '每日自动更新已启用。' : '独立每日更新程序已准备，等待部署启用。'));
    note.append(document.createTextNode(' 更新成功时间和新闻发布时间不同。近期热门项目按近 30 天创建、当前总星标排序，不等同于 GitHub Trending。'));
    note.append(el('br'), document.createTextNode('中文由免费翻译服务生成并缓存，版本发布使用简短中文导读。免费额度耗尽或翻译失败时保留原文，后续更新继续补充。切换「原文」可核对；收藏和主题保存在当前浏览器。'));
  }
  function render() {
    data.items = Array.isArray(data.items) ? data.items.filter(i => i && i.id && labels[i.kind]) : []; data.sources = Array.isArray(data.sources) ? data.sources : [];
    for (const kind of ['official', 'release', 'project']) $('count-' + kind).textContent = number(data.items.filter(i => i.kind === kind).length);
    $('tab-all-count').textContent = data.items.length; $('saved-count').textContent = saved.size || ''; renderList(); renderRadar(); renderSources(); freshness();
  }
  function showHistoryChoices() {
    const control=$('history-select');control.replaceChildren(el('option','','最新日报'));control.firstChild.value='';
    historyEntries.forEach(entry=>{const option=el('option','',entry.date+' · '+entry.items+' 条');option.value=entry.date;control.append(option);});
    control.value=viewDate;
    control.disabled=offline;
    control.title=offline?'离线文件只包含当前快照，请在在线版查看历史日报':'按日期回看每天保存的日报';
  }
  async function loadHistoryChoices() {
    showHistoryChoices();
    if(offline)return;
    try{
      const url=data.runtime?.api?'/api/history':new URL('history/index.json',location.href).href;
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!response.ok)return;
      const result=await response.json();
      if(Array.isArray(result.entries)){historyEntries=result.entries.filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date));showHistoryChoices();}
    }catch{}
  }
  async function reload(archiveDate=viewDate) {
    if (offline) return toast('离线文件保留下载时的内容，请打开在线版获取更新');
    if (loading) return; loading = true; $('refresh-button').disabled = true; $('refresh-button').classList.add('spinning');
    try {
      const endpoint = data.runtime?.api ? archiveDate?'/api/history?date='+encodeURIComponent(archiveDate):'/api/news' : new URL(archiveDate?'history/'+archiveDate+'.json':'data/news.json', location.href).href;
      const response = await fetch(endpoint, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(35000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const next = await response.json(); if (!Array.isArray(next.items) || !next.items.length) throw new Error('快照为空'); data = next;viewDate=archiveDate;showHistoryChoices();render();
      const params=new URLSearchParams(location.search);viewDate?params.set('date',viewDate):params.delete('date');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
      toast(viewDate?'已载入 '+viewDate+' 的日报':'已读取最新可用内容');
    } catch { $('history-select').value=viewDate;banner(archiveDate?'该日期的日报暂时无法载入，已保留当前内容。':'暂时无法读取最新快照，继续显示已保存内容。'); toast('已保留当前内容，请稍后重试'); }
    finally { loading = false; $('refresh-button').disabled = false; $('refresh-button').classList.remove('spinning'); }
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
  $('search-input').oninput = () => { pageSize = 15; renderList(); };
  for (const id of ['sort-select', 'period-select']) $(id).onchange = () => { pageSize = 15; renderList(); };
  $('language-select').onchange = () => { language = $('language-select').value; persist('github-daily-language', language); renderList(); renderRadar(); };
  $('load-more').onclick = () => { pageSize += 15; renderList(); };
  $('refresh-button').onclick = () => reload();
  $('history-select').onchange=()=>reload($('history-select').value);
  $('view-projects').onclick = () => { selectTab('project'); document.querySelector('.feed-controls').scrollIntoView({ behavior: 'smooth' }); };
  function showDialog() { renderSources(); $('source-dialog').showModal(); }
  ['schedule-chip', 'about-button', 'sources-button', 'footer-about'].forEach(id => $(id).onclick = showDialog);
  $('close-dialog').onclick = () => $('source-dialog').close();
  $('source-dialog').onclick = event => { if (event.target !== $('source-dialog')) return; const box = event.target.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close(); };
  document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('source-dialog').open) { e.preventDefault(); $('search-input').focus(); } if (e.key === 'Escape' && document.activeElement === $('search-input')) { $('search-input').value = ''; renderList(); $('search-input').blur(); } });
  render();
  loadHistoryChoices().then(()=>{if(!offline)reload(requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)?requestedDate:'');});
})();
