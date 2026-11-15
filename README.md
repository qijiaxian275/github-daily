# GitHub 日报 · 中文版

一个不依赖 ChatGPT 账号、会员或大模型 API 的开源资讯聚合站。Node.js 普通脚本抓取公开 RSS/Atom 和 GitHub 仓库搜索；预生成静态 HTML/JSON，由 GitHub Pages 或其他静态主机提供阅读。

## 功能

- 中文优先与原文切换、中英双语搜索、近 24 小时/7 天/30 天筛选。
- 按 UTC+8 日期保存每日 JSON 快照，通过页首「历史日报」切换回看；`?date=2026-11-15` 形式的链接可直接打开指定日期。同一天重复更新会更新当天快照，之后的日期不会覆盖过去日报。存档从启用之日开始，不能恢复此前未抓取的每日快照。
- 官方动态、版本发布、近期热门新项目和浏览器本地收藏。
- MyMemory 免费接口翻译新增新闻标题和短摘要，翻译按文本哈希缓存；版本发布使用中文分类导读，仓库名保留原名。
- 免费翻译默认每天最多提交 4000 字符，不配置付费密钥。翻译服务限流、失败或预算耗尽后保留原文，下次更新继续补充。第三方服务可能更改实际免费限额。
- 来源失败保留旧内容，403/429 尊重 Retry-After；网页显示来源状态和过期提醒。
- 所有 CSS、图标、脚本均在页面中，无需读者访问字体、翻译 API 或其他 CDN。点击原文链接仍需要读者自己的网络能访问来源。

## 本地运行

安装 Node.js 24 后：

```sh
npm test
npm run update
npm run build
npm run preview
```

只为已有新闻补充中文：`node scripts/update.mjs --translate-only`。`public/index.html` 可直接打开，离线时保留生成时的内容；`public/` 可以部署到任何静态主机。

## GitHub Pages 每日部署

1. 在自己的 GitHub 账号创建公开仓库，把本目录全部上传到默认分支 `main`。
2. 仓库 Settings → Pages → Source 选择 GitHub Actions。
3. Actions → GitHub 日报每日更新 → Run workflow，确认 update 和 deploy 都成功。
4. 使用 deploy 输出的网站地址。此后计划在 UTC+8 每天约 09:17 更新；GitHub 调度可能延迟，不能作为准点通知服务。

工作流每天写入快照和翻译缓存，再发布静态页面。标准 GitHub 托管 runner 在公开仓库上免费，Pages 受免费计划的配额及条款限制。无大模型调用、不消耗 ChatGPT/Codex 额度；不承诺第三方服务永久免费。公共仓库计划任务长期没有仓库活动时可能自动暂停，需查看 Actions 状态。

全部历史快照位于 `public/history/YYYY-MM-DD.json`，索引位于 `public/history/index.json`，均随源码提交保存。历史越多，仓库和站点占用空间越大，仍受托管平台配额限制。

## 网络与费用边界

- 不需要 ChatGPT 登录，不需要读者拥有 GitHub 账号。
- 公开访问权限和网络可达性是两件事。GitHub Pages 等境外免费域名在不同大陆网络上的可达性不稳定，不能保证无 VPN 在每个地区都可用。
- 若需要稳定国内直连，应使用经过当地网络实测的托管和域名；可能涉及域名、服务器费用以及适用的备案要求。
- 新闻只保存公开标题和短摘要并指向原文。免费翻译会把这些公开片段发送给 MyMemory，不发送访问者信息或私密文件。
- 不要把访问令牌、Cookie 或任何 `.env` 文件提交到公开仓库。工作流只使用 GitHub 自动提供的短期 `GITHUB_TOKEN`。

## 维护

如果内容过期，先检查 Actions 的最新结果和网页「查看源状态」。单源失败不应清空历史内容；翻译失败不应阻止新闻发布。可通过 `TRANSLATE=0` 关闭翻译，或把 `TRANSLATION_DAILY_CHARS` 下调，最多 4500 字符。
