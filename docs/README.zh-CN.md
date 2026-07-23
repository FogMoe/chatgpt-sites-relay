# Sites Relay

[英文](../README.md) | 简体中文

[![CI](https://github.com/FogMoe/chatgpt-sites-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/FogMoe/chatgpt-sites-relay/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-f4ba6a.svg)](../LICENSE)

![Sites Relay：面向 ChatGPT Sites 的受限中继](../public/og.png)

Sites Relay 是一个面向 ChatGPT Sites、受策略约束的固定上游中继，支持 JSON/SSE 流式传输和可选的净化静态网页镜像。每个上游目标都由服务端运行时变量定义。

## 为什么使用 Sites Relay

ChatGPT Sites 可以把运行时密钥保存在服务端，但每个应用仍然需要在访问者和上游之间建立安全边界。Sites Relay 把这层边界封装为一个可复用、fail-closed 的项目：

- 上游凭据保存在服务端运行时变量中
- 可选择代理令牌或精确 ChatGPT 用户邮箱白名单鉴权
- 只允许已配置的方法与路径组合及查询参数
- 随数据到达逐块传递 JSON 与 Server-Sent Events
- 可选提供净化后的只读 HTML、CSS、图片和字体

典型用例包括流式 AI 应用、只连接一个私有 API 的内部仪表盘，以及需要身份保护的文档或状态页镜像。可继续阅读[可复制示例](./examples.zh-CN.md)和[项目路线图](./roadmap.zh-CN.md)。

## 何时适合使用

当一个 Site 需要连接一个可信 HTTPS 上游，并希望保护凭据、传递 JSON/SSE 流式响应和建立显式服务端策略时，适合使用 Sites Relay。独立的远程浏览器架构负责面向已认证用户的完整浏览器兼容。

## 项目范围

主要的 API 中继适合转发 JSON API 和 Server-Sent Events（SSE），包括兼容流式响应的 AI API。上游 origin、客户端访问模式、方法与路径策略、查询参数策略和上游凭据都由服务端运行时变量控制。

可选静态网页镜像可以从同一个固定上游提供经过清理的 HTML、重写后的 CSS、图片和字体。显式启用后，它通过 `GET` 和 `HEAD` 提供策略允许的静态内容。完整契约见 [`static-web-mirror.zh-CN.md`](./static-web-mirror.zh-CN.md)。

当前中继保持固定上游和应用层范围。面向已认证用户的完整网页兼容采用独立远程浏览器架构，详见 [`web-compatibility-direction.zh-CN.md`](./web-compatibility-direction.zh-CN.md)。

## 快速开始

需要 Node.js 22.13 或更高版本。

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

编辑 `.env.local` 后访问 `http://localhost:3000`。运行状态页报告静态配置状态；上游连通性通过无副作用中继请求验证。

## 配置

以下是唯一的运行时配置契约。生产密钥保存在 Sites 运行时变量中，本地密钥保存在 `.env.local`。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `PROXY_UPSTREAM_ORIGIN` | 是 | 使用 DNS hostname 的单一 HTTPS origin；不允许路径、查询、非 443 端口、IP literal 或内嵌凭据。 |
| `PROXY_AUTH_MODE` | 否 | `token`（默认）或 `sites-user`。令牌模式适合程序化客户端；Sites 用户模式验证已登录的 ChatGPT 访问者。 |
| `PROXY_ACCESS_TOKEN` | 令牌模式 | 32–256 字符的随机 base64url 值；客户端通过 `x-proxy-token` 提交。 |
| `PROXY_ALLOWED_USER_EMAILS` | Sites 用户模式 | 允许使用 API 中继的精确 ChatGPT 账户邮箱，逗号分隔；匹配不区分大小写。 |
| `PROXY_ALLOWED_ROUTES` | 是 | 逗号分隔的 `METHOD:/path` 规则，例如 `GET:/v1/models,POST:/v1/responses`。方法与路径前缀必须同时匹配。 |
| `PROXY_ALLOWED_QUERY_KEYS` | 否 | 可送往上游的精确查询参数名，逗号分隔；空值表示查询参数白名单为空。 |
| `PROXY_ALLOWED_ORIGINS` | 否 | 允许跨域浏览器调用的精确 HTTPS origin，逗号分隔；HTTP 只允许 loopback 开发 origin，同源请求无需填写。 |
| `PROXY_UPSTREAM_AUTHORIZATION` | 否 | 服务端注入的完整上游 `Authorization` 值；只接受不超过 4096 字符的 printable ASCII。 |
| `EXPOSE_UPSTREAM_HOST` | 否 | 设为 `true` 后才会在首页和 `/api/health` 显示精确上游 hostname；默认为 `false`。 |
| `WEB_RELAY_ENABLED` | 否 | 在 `/web/*` 启用可选静态网页镜像；默认为 `false`。 |
| `WEB_RELAY_ALLOWED_USER_EMAILS` | 启用时 | 允许使用静态镜像的精确 ChatGPT 账户邮箱，逗号分隔；匹配不区分大小写。 |
| `WEB_RELAY_ALLOWED_PATH_PREFIXES` | 启用时 | 允许通过静态镜像访问的上游路径前缀，逗号分隔。 |
| `WEB_RELAY_ALLOWED_QUERY_KEYS` | 否 | 允许通过静态镜像的精确查询参数名；空值表示查询参数白名单为空。 |

`.env.example` 与上述契约保持同步。线上值通过 Sites 的运行时变量管理。

## 请求约定

入口为 `/api/proxy/*`。通过方法与路径策略后，代理路径会追加到固定上游 origin；查询参数必须逐项允许。每个请求都会保持服务端配置的上游协议、主机和端口。

默认 `token` 模式要求客户端提交 `x-proxy-token`。`sites-user` 模式下，同源浏览器请求通过 Sites 身份和精确 `PROXY_ALLOWED_USER_EMAILS` 白名单完成鉴权。两种模式都会先鉴权，再检查路由策略。

```bash
curl -N "$SITE_URL/api/proxy/v1/responses" \
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"model":"your-model","input":"Hello"}'
```

请求限制：

- 转发方法：`GET`、`HEAD`、`POST`；`OPTIONS` 在本地完成 CORS 预检。
- 方法与路径必须匹配 `PROXY_ALLOWED_ROUTES`；查询参数从空白名单开始。
- `POST` 正文采用非空、未压缩的 UTF-8 JSON，最多 1 MiB。
- 可转发请求头：`Accept`、`Content-Type`、`Last-Event-ID`、经验证的 `Idempotency-Key`。
- 中继根据文档列出的请求头和服务端上游凭据重新构造上游请求头。
- 上游响应仅允许 `application/json`、`application/*+json` 和 `text/event-stream`。
- 上游 3xx 通过 `upstream_redirect_blocked` 结束请求。
- 上游连接等待最多 15 秒；JSON 最多 8 MiB/60 秒，SSE 最多 64 MiB/15 分钟。

响应体随数据到达逐块传递；字节与时间限制约束每个流式响应。

## 静态网页镜像

可选的 `/web/*` 为指定用户提供来自同一个固定上游、经过净化的静态内容。

启用前请阅读 [`static-web-mirror.zh-CN.md`](./static-web-mirror.zh-CN.md)。镜像结合 Sites 访问控制与精确 ChatGPT 用户邮箱白名单。

## 状态与错误

`GET /api/health` 返回不含密钥的配置摘要：

- `setup_required`：缺少必需运行时变量
- `invalid`：变量存在但未通过验证
- `ready`：配置通过静态验证；请通过真实的无副作用请求验证连通性

`ready` 返回 HTTP 200；`setup_required` 和 `invalid` 返回 HTTP 503。`OPTIONS` 会单独列为本地预检方法。

设置 `EXPOSE_UPSTREAM_HOST=true` 后可显示精确上游 hostname；默认公开状态返回 `upstreamHost: null`。

API 错误使用稳定英文错误码。常见错误包括：

| 状态 | 错误码 | 含义 |
| --- | --- | --- |
| 503 | `proxy_not_configured` | 缺少必需配置。 |
| 503 | `proxy_invalid_config` | 配置未通过验证。 |
| 401 | `proxy_unauthorized` | 代理访问令牌错误。 |
| 401 | `proxy_authentication_required` | Sites 用户模式要求访问者登录 ChatGPT。 |
| 403 | `proxy_user_not_allowed` | 已登录的 ChatGPT 访问者不在 API 白名单内。 |
| 403 | `origin_not_allowed` | 浏览器 origin 不在允许范围。 |
| 403 | `route_not_allowed` | 方法与路径组合不在允许范围。 |
| 403 | `query_not_allowed` | 查询参数不在允许范围。 |
| 413 | `payload_too_large` | 正文超过 1 MiB。 |
| 502 | `upstream_unavailable` | 无法完成上游请求。 |
| 502 | `upstream_redirect_blocked` | 上游尝试重定向。 |
| 502 | `unsupported_upstream_content_type` | 上游返回不允许的媒体类型。 |
| 502 | `upstream_response_too_large` | 上游声明的响应超过中继上限。 |
| 504 | `upstream_timeout` | 上游未在连接时限内响应。 |

## 安全边界

代理采用 fail-closed 设计：缺少或错误配置会停止转发。它先验证代理令牌或精确 Sites 用户邮箱，再应用方法与路径策略；重建上游请求头、分离客户端访问方式与上游凭据、拒绝多重编码路径绕过和可能形成同源脚本执行的响应，并为所有响应设置 `no-store`。

Sites 用户鉴权和静态镜像都只在 Sites dispatcher 后方信任其提供的身份。本地直连或绕过 dispatcher 的 Worker 请求可以伪造普通身份头，不能视为等价的生产安全边界。使用身份保护的部署必须保留 Sites 访问控制。

请配置你控制或信任的 hostname，在上游实施配额和速率限制，并将客户端鉴权与 Sites 访问策略配合使用。

## 仓库内置 Skill

仓库在 `.agents/skills/operate-sites-relay/` 内置了 Codex Skill。后续 Agent 可使用 `$operate-sites-relay` 快速读取架构、安全契约、验证命令和 Sites 私密部署流程。Skill 文件本身使用英文。

## 参与贡献

开发环境、验证流程、Pull Request 清单和 Conventional Commits 提交规范见 [`CONTRIBUTING.zh-CN.md`](./CONTRIBUTING.zh-CN.md)。

## 文档

- [示例](./examples.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [静态网页镜像契约](./static-web-mirror.zh-CN.md)
- [自定义域名与指定用户访问](./custom-domain.zh-CN.md)
- [完整网页兼容方向](./web-compatibility-direction.zh-CN.md)
- [安全策略](../.github/SECURITY.zh-CN.md)

## 部署到 Sites

1. 在 ChatGPT 中打开本项目并使用内置 Sites 构建。
2. 首次部署保持仅所有者可访问。
3. 在 Sites 中设置全部必需运行时变量，再保存并部署新版本。
4. 检查 `/api/health`，再调用一个无副作用的允许路径。只有真实请求成功后，才能认为上游可用。

## 验证

```powershell
npm run typecheck
npm run lint
npm test
```

`npm test` 会先运行生产构建。

部署后还应验证：

- 未配置、错误令牌或不允许的 Sites 用户、越界路径和非法 origin 均按预期失败
- Cookie、客户端 `Authorization` 和身份头未抵达上游
- JSON 正常返回，SSE 首块在流结束前到达
- API 中继不会透传 HTML、重定向或 `Set-Cookie`
- 启用静态镜像时，匿名和不在白名单的用户会在路径策略检查前被拒绝；主动内容会被移除，只保留允许的路径、查询、资源和策略内重定向
