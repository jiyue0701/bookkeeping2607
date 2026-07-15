# 米糕记账云备份 Worker

这个目录放 Cloudflare Workers 后端草稿，用于“手机号账号 + 同步密码/PIN”的免费云备份。

## 数据模型

- 手机号和 PIN 只在浏览器本机参与派生。
- Worker 收到的是账号哈希、认证哈希和加密后的账单备份。
- 忘记 PIN 后，云端密文无法解密；需要重新开启一套云备份。

## 接口

- `GET /api/health`：健康检查。
- `POST /api/backup`：上传加密备份。
- `GET /api/backup?account=...`：读取加密备份，需要请求头 `x-migao-auth`。

## 部署步骤

1. 复制 `wrangler.example.toml` 为 `wrangler.toml`。
2. 在 Cloudflare 控制台或 Wrangler 创建 KV namespace，绑定名使用 `MIGAO_BACKUPS`。
3. 把 KV namespace id 填入 `wrangler.toml`。
4. 部署 Worker。
5. 在米糕记账“我的 → 云备份”里填写 Worker 地址、手机号和同步密码/PIN。

当前已部署的 Worker 地址：

```text
https://migao-bookkeeping-cloud.migao-bookkeeping.workers.dev
```

建议部署后把 `CORS_ORIGIN` 设置成你的 GitHub Pages 域名，减少其它网页误调用这个 Worker 的可能。
