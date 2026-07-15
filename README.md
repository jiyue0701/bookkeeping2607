# 米糕记账 PWA

这是给 iPhone 使用的网页版 App（PWA），不需要 App Store、Apple Developer Program、Mac 或每 7 天重签。用 Safari 打开网址后，可以添加到 iPhone 主屏幕，之后以独立网页 App 的样式运行。

## 和原生 iOS 版的区别

| 项目 | PWA 版 | 原生 iOS 版 |
| --- | --- | --- |
| 安装 | Safari 添加到主屏幕 | Xcode/TestFlight/安装包 |
| Apple 年费 | 不需要 | 免费账号有 7 天限制，长期稳定使用通常需要付费账号 |
| Mac | 不需要 | 构建和签名需要 macOS/Xcode |
| 当前功能 | 记账、备注、分类、金额、流水、日历、统计 | 同样的产品目标 |
| 数据 | 保存在当前浏览器本地 | 保存在 App 本地数据库 |
| 更新 | 更新网页代码，不需要重新安装 | 需要构建并安装新版本 |
| 原生能力 | 较少，适合当前记账需求 | 可使用更多系统能力 |

当前需求主要是记录和统计，PWA 已经足够。它不使用服务器，不上传账单，也不会产生大规模日常流量。

## 在 iPhone 上安装

1. 用 Safari 打开 PWA 的 HTTPS 网页地址。
2. 点击分享按钮。
3. 选择“添加到主屏幕”。
4. 确认名称为“米糕记账”，从主屏幕图标打开。

加入主屏幕后，网站清单中的 `display: standalone` 会让它以独立网页 App 形式打开。Apple 对 iPhone 主屏幕网页 App 的说明见：[Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)。

## 发布到网上

最适合当前零费用需求的是 GitHub Pages：公开仓库可以直接托管这组静态文件，并提供 HTTPS。整个发布过程不需要 Mac、服务器或 Apple Developer Program。面向小白的逐步说明在同目录的 [`PWA-DEPLOY.md`](./PWA-DEPLOY.md)。不过 `github.io` 在国内不同网络的访问稳定性不能保证，详情见发布说明。

发布后会得到类似 `https://你的用户名.github.io/仓库名/` 的网址。以后更新网页文件时，继续使用同一个网址和同一个使用环境，账单不会因为换了网页代码而自动清空。

## 主屏幕 Web App 入口

长期使用时，固定从 iPhone 主屏幕上的“米糕记账”图标打开。这样会进入独立 Web App 视窗，不会显示 Safari 地址栏，也会持续使用同一套 Web App 本地账单。

Safari 只建议用于三种场景：

- 第一次打开网址并“添加到主屏幕”。
- Safari 里已经有旧账单时，临时进去导出 JSON 备份。
- 排查发布网址或安装问题。

## 快速记账入口

应用仍支持以下形式的网址直接弹出快速记账界面：

```text
https://你的用户名.github.io/仓库名/?quick=1
```

也支持预填内容，例如 `?quick=1&type=expense&category=food&note=午餐`。不过 iPhone“快捷指令”里的“打开 URL”通常会进入 Safari，不适合作为长期日常入口。

本项目已在 `manifest.webmanifest` 中配置“快速记账”Web App 快捷项。如果你的 iOS 在主屏幕长按“米糕记账”图标时显示“快速记账”，优先使用这个入口；它属于主屏幕 Web App，而不是 Safari 地址栏页面。

## 数据保留约定

- 账单存储在浏览器的 `localStorage` 中，金额使用“分”为整数保存，显示时固定两位小数。
- 应用还会在本机 IndexedDB 中无感保存滚动自动快照：打开或保存后更新，应用保持打开时跨日更新；它用于同一设备的临时恢复，不替代外部 JSON 备份。
- 可选云备份使用“手机号账号 + 同步密码/PIN”。手机号和 PIN 只在本机派生账号与加密密钥，云端只保存加密后的备份。
- 云备份开启后会自动同步：打开时自动从云端拉取并合并，保存账单后自动延迟上传。
- 新版云备份用手机号识别同一个账号，PIN 只用于认证和解密；同一手机号输入不同 PIN 会提示同步密码不匹配，不会再变成另一套账号。
- 应用打开时和网络恢复后会自动检查网页新版本；“我的 → 当前版本”仍可手动刷新。有网时更新代码，无网时保留当前缓存继续记账，不会清空本机账单。
- 存储键 `bookkeeping2607.pwa.state` 和 `schemaVersion` 不要随意删除或改名。
- 后续改数据结构时，只增加迁移逻辑，不直接清空旧数据。
- 不要使用无痕模式，不要清除 Safari 的网站数据；换手机、删除网站数据或设备损坏前，先在“我的 → 数据管理”导出 JSON 备份。
- 导入备份采用合并策略：已有记录不会被整体覆盖，重复记录只在备份版本更新时更新。
- JSON 备份可以保存到 iPhone“文件”、iCloud 云盘或电脑；新设备打开网页后，在同一位置选择“导入 JSON 备份”。
- 主屏幕独立 Web App 和 Safari 可能是两套本地存储。若两边都产生过账单，在两边使用同一个手机号账号和同步密码开启云备份，打开时会自动合并。
- “我的 → 数据管理”不提供一键清空全部账单，避免误触导致长期数据丢失。

## 本地预览

PWA 的离线缓存需要 `http://localhost` 或 HTTPS，不能只用 `file://` 双击打开来判断离线功能。可以把整个文件夹部署到任意支持 HTTPS 的静态网页服务，再用 iPhone Safari 访问。

当前版本是纯 HTML、CSS、JavaScript，没有第三方运行时依赖，也不需要下载大型模型或资源。

## 目录

- `index.html`：页面骨架
- `styles.css`：手账风格和 iPhone 移动端布局
- `app.js`：本地数据、记账、流水、日历和统计逻辑
- `manifest.webmanifest`：主屏幕网页 App 配置
- `service-worker.js`：离线缓存
- `assets/black-shiba-mascot.png`：米糕黑柴默认素材
- `assets/black-shiba-mascot-active.png`：米糕点击互动状态素材
- `cloudflare/`：可选云备份 Worker 草稿
