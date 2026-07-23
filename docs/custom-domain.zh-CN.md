# 自定义域名配置

[英文](./custom-domain.md) | 简体中文

Sites Relay 通过仓库 Agent 提供引导式自定义域名流程。Site 本身不会接收
Sites 管理凭据、DNS API token 或注册商密码。

## “接近一键”的含义

向 Agent 发送一条包含裸 hostname 的指令：

> 将 `relay.example.com` 连接到这个已发布的 Sites 项目，保持当前访问策略，
> 并返回我需要配置的 DNS 记录。

Agent 会：

1. 从 `.openai/hosting.json` 读取准确的 Sites 项目 ID。
2. 确认 Site 已有生产部署。
3. 验证裸 hostname，并检查它是否已经绑定。
4. 通过 Sites 添加 hostname，同时保持部署访问策略不变。
5. 返回 Sites 要求的准确路由记录和验证记录。

然后你需要在 DNS 服务商处添加这些记录。DNS 修改完成后，让 Agent 刷新
自定义域名状态。DNS 发布和证书验证是异步过程，因此添加记录后，域名可能仍会
保持 pending 一段时间。

只使用 `relay.example.com` 或 `example.com` 这样的裸 hostname，不要包含
`https://`、路径、查询参数或 fragment。

## DNS 边界

子域名通常会获得一个 CNAME 路由目标，zone apex 域名通常会获得 A 记录目标。
Sites 还会针对具体 hostname 返回所需的 App Garden 与 Cloudflare 验证记录。
请准确复制 Agent 返回的记录，不要根据本文示例猜测目标值。

该流程会停在你的 DNS 服务商处，因为仓库不会保存 DNS 凭据。如果未来会话中
存在 DNS 服务商 connector，修改 DNS 仍属于独立的外部操作，需要单独授权。

## 访问控制

绑定自定义域名不会把 Site 改为公开，也不会绕过现有 Sites 访问策略。

Sites 自定义访问支持允许多个指定用户，但每个邮箱都必须对应 Site 所在
workspace 中的 active user；所有者始终保留访问权限。可让 Agent 在保持
`access_mode=custom` 的同时添加完整邮箱列表。如果某个邮箱不是 workspace
中的 active user，需要先邀请或添加该用户，再重试。

平台访问控制与应用内授权是两层独立边界：

- Sites 访问控制决定谁可以抵达部署。
- 使用 `PROXY_AUTH_MODE=sites-user` 时，`PROXY_ALLOWED_USER_EMAILS`
  授权 API 中继。
- `WEB_RELAY_ALLOWED_USER_EMAILS` 授权静态网页镜像。

用户必须通过所有已启用的边界。邮箱白名单只能进入 Sites 访问配置或服务端
运行时变量，不能写入源码、客户端代码、日志或 `.openai/hosting.json`。

## 移除域名

移除域名是独立的破坏性操作。让 Agent 修改 Sites 项目前，应提供需要移除的
准确 hostname，并确认流量可能中断；之后再清理不再使用的 DNS 记录。
