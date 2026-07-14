# 2607 记账 PWA

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
4. 确认名称为“2607记账”，从主屏幕图标打开。

加入主屏幕后，网站清单中的 `display: standalone` 会让它以独立网页 App 形式打开。Apple 对 iPhone 主屏幕网页 App 的说明见：[Configuring Web Applications](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)。

## 发布到网上

最适合当前零费用需求的是 GitHub Pages：公开仓库可以直接托管这组静态文件，并提供 HTTPS。整个发布过程不需要 Mac、服务器或 Apple Developer Program。面向小白的逐步说明在同目录的 [`PWA-DEPLOY.md`](./PWA-DEPLOY.md)。不过 `github.io` 在国内不同网络的访问稳定性不能保证，详情见发布说明。

发布后会得到类似 `https://你的用户名.github.io/仓库名/` 的网址。以后更新网页文件时，继续使用同一个网址和同一个使用环境，账单不会因为换了网页代码而自动清空。

## 快速记账入口

打开以下形式的网址，会直接弹出快速记账界面：

```text
https://你的用户名.github.io/仓库名/?quick=1
```

也支持给快捷指令预填内容，例如 `?quick=1&type=expense&category=food&note=午餐`。在 iPhone 的“快捷指令”里使用“打开 URL”动作即可；再到“设置 → 辅助功能 → 触控 → 辅助触控 → 双击”中选择这个快捷指令（具体菜单会随 iOS 版本略有差异）。网页会打开金额输入框，保存前仍由你确认金额和备注。

重要：iPhone 的“主屏幕独立 Web App”和 Safari 可能是两套本地存储。当前版本没有云同步和导出，所以如果要使用“双击辅助触控 → 快捷指令 → 快速记账”，建议整个应用都在 Safari 模式使用：添加到主屏幕时关闭“作为 Web App 打开”（如果你的 iOS 显示这个开关），这样日常打开和快捷指令会落在同一个 Safari 数据空间。若选择独立 Web App 模式，则先只从主屏幕图标进入，不要把快捷指令保存的记录当作主屏幕 App 的账单。

## 数据保留约定

- 账单存储在浏览器的 `localStorage` 中，金额使用“分”为整数保存，显示时固定两位小数。
- 存储键 `bookkeeping2607.pwa.state` 和 `schemaVersion` 不要随意删除或改名。
- 后续改数据结构时，只增加迁移逻辑，不直接清空旧数据。
- 不要使用无痕模式，不要清除 Safari 的网站数据；删除网站数据、换手机或设备损坏仍可能造成数据丢失。
- 当前暂不做导出、iCloud 同步和账号系统，之后可以独立增加。

## 本地预览

PWA 的离线缓存需要 `http://localhost` 或 HTTPS，不能只用 `file://` 双击打开来判断离线功能。可以把整个文件夹部署到任意支持 HTTPS 的静态网页服务，再用 iPhone Safari 访问。

当前版本是纯 HTML、CSS、JavaScript，没有第三方运行时依赖，也不需要下载大型模型或资源。

## 目录

- `index.html`：页面骨架
- `styles.css`：手账风格和 iPhone 移动端布局
- `app.js`：本地数据、记账、流水、日历和统计逻辑
- `manifest.webmanifest`：主屏幕网页 App 配置
- `service-worker.js`：离线缓存
- `assets/black-shiba-mascot.png`：米糕黑柴素材
