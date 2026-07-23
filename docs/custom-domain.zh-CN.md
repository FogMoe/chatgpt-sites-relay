# 自定义域名配置

[英文](./custom-domain.md) | 简体中文

Sites Relay 通过仓库 Agent 提供引导式自定义域名流程。Sites 管理凭据、
DNS API token 与注册商密码分别保留在对应控制平面。

## “接近一键”的含义

向 Agent 发送一条包含裸 hostname 的指令：

> 将 `relay.example.com` 连接到这个已发布的 Sites 项目，保持当前访问策略，
> 并返回我需要配置的 DNS 记录。

Agent 会：

1. 从 `.openai/hosting.json` 读取准确的 Sites 项目 ID。
2. 确认 Site 已有生产部署。
3. 验证裸 hostname，并检查它是否已经绑定。
4. 通过 Sites 添加 hostname，同时保留当前部署访问策略。
5. 返回 Sites 要求的准确路由记录和验证记录。

然后你需要在 DNS 服务商处添加这些记录。DNS 修改完成后，让 Agent 刷新
自定义域名状态。DNS 发布和证书验证是异步过程，因此添加记录后，域名可能仍会
保持 pending 一段时间。

请提供 `relay.example.com` 或 `example.com` 这样的裸 hostname；该字段只填写
域名本身。

## DNS 边界

子域名通常会获得一个 CNAME 路由目标，zone apex 域名通常会获得 A 记录目标。
Sites 还会针对具体 hostname 返回所需的 App Garden 与 Cloudflare 验证记录。
请准确复制 Agent 返回的记录；本文示例用于展示输入格式。

请在 DNS 服务商处完成返回的记录，DNS 凭据继续保留在服务商控制平面。未来
如有 DNS 服务商 connector，可在单独授权后完成这项外部操作。

## 访问控制

绑定自定义域名会保留 Site 当前的可见性和 Sites 访问策略。

Sites 自定义访问支持允许多个指定用户，但每个邮箱都必须对应 Site 所在
workspace 中的 active user；所有者始终保留访问权限。可让 Agent 在保持
`access_mode=custom` 的同时添加完整邮箱列表。新邮箱需要先邀请或添加为
workspace active user，再重试。

平台访问控制与应用内授权是两层独立边界：

- Sites 访问控制决定谁可以抵达部署。
- 使用 `PROXY_AUTH_MODE=sites-user` 时，`PROXY_ALLOWED_USER_EMAILS`
  授权 API 中继。
- `WEB_RELAY_ALLOWED_USER_EMAILS` 授权静态网页镜像。

用户必须通过所有已启用的边界。邮箱白名单保存在 Sites 访问配置或服务端
运行时变量中。

## 移除域名

先安排维护窗口，再向 Agent 提供需要移除的准确 hostname，并在修改 Sites
项目前确认操作；之后清理不再使用的 DNS 记录。
