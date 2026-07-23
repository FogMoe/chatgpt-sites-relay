# Sites Relay

[英文](../README.md) | 简体中文

![Sites Relay：面向 ChatGPT Sites 的受限中继](../public/og.png)

Sites Relay 是一个面向单一固定上游的受限中继，可直接构建并部署到 ChatGPT Sites。它提供 JSON/SSE API 中继和可选的只读静态网页镜像，不接受客户端提供的任意目标 URL。

## 项目范围

主要的 API 中继适合转发 JSON API 和 Server-Sent Events（SSE），包括兼容流式响应的 AI API。上游 origin、代理访问令牌、方法与路径策略、查询参数策略和上游凭据都由服务端运行时变量控制。

可选静态网页镜像可以从同一个固定上游提供经过清理的 HTML、重写后的 CSS、图片和字体。它默认关闭，只支持 `GET` 和 `HEAD`，并移除脚本、表单、Cookie、内联样式、嵌入内容和外部资源。完整契约见 [`static-web-mirror.zh-CN.md`](static-web-mirror.zh-CN.md)。

当前版本明确不提供：

- 任意 URL 转发
- 执行上游 JavaScript、SVG、XML、表单或其他主动网页内容
- WebSocket、CONNECT、TCP 或 UDP 隧道
- 文件上传、不受策略限制的重定向或客户端 `Authorization` 透传

允许已认证用户输入任意公网 URL，并兼容 JavaScript、API、Cookie 与表单的后续架构方向见 [`web-compatibility-direction.zh-CN.md`](web-compatibility-direction.zh-CN.md)。该提案使用独立的远程浏览器服务，不改变当前 API 中继契约。

## 快速开始

需要 Node.js 22.13 或更高版本。

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

编辑 `.env.local` 后访问 `http://localhost:3000`。运行状态页只说明配置是否完整，不会主动探测上游。

## 配置

以下是唯一的运行时配置契约。密钥不要写入 `.openai/hosting.json`、`NEXT_PUBLIC_*` 或源码。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `PROXY_UPSTREAM_ORIGIN` | 是 | 使用 DNS hostname 的单一 HTTPS origin；不允许路径、查询、非 443 端口、IP literal 或内嵌凭据。 |
| `PROXY_ACCESS_TOKEN` | 是 | 32–256 字符的随机 base64url 值；客户端通过 `x-proxy-token` 提交。 |
| `PROXY_ALLOWED_ROUTES` | 是 | 逗号分隔的 `METHOD:/path` 规则，例如 `GET:/v1/models,POST:/v1/responses`。方法与路径前缀必须同时匹配。 |
| `PROXY_ALLOWED_QUERY_KEYS` | 否 | 可送往上游的精确查询参数名，逗号分隔；空值表示全部拒绝。 |
| `PROXY_ALLOWED_ORIGINS` | 否 | 允许跨域浏览器调用的精确 HTTPS origin，逗号分隔；HTTP 只允许 loopback 开发 origin，同源请求无需填写。 |
| `PROXY_UPSTREAM_AUTHORIZATION` | 否 | 服务端注入的完整上游 `Authorization` 值；只接受不超过 4096 字符的 printable ASCII。 |
| `WEB_RELAY_ENABLED` | 否 | 在 `/web/*` 启用可选静态网页镜像；默认为 `false`。 |
| `WEB_RELAY_ALLOWED_PATH_PREFIXES` | 启用时 | 允许通过静态镜像访问的上游路径前缀，逗号分隔。 |
| `WEB_RELAY_ALLOWED_QUERY_KEYS` | 否 | 允许通过静态镜像的精确查询参数名；空值表示全部拒绝。 |

`.env.example` 与上述契约保持同步。线上值通过 Sites 的运行时变量管理。

## 请求约定

入口为 `/api/proxy/*`。通过方法与路径策略后，代理路径会追加到固定上游 origin；查询参数必须逐项允许。客户端无法更改上游协议、主机或端口。

```bash
curl -N "$SITE_URL/api/proxy/v1/responses" \
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"model":"your-model","input":"Hello"}'
```

请求限制：

- 转发方法：`GET`、`HEAD`、`POST`；`OPTIONS` 仅由代理在本地处理 CORS 预检，不会转发上游。
- 方法与路径必须匹配 `PROXY_ALLOWED_ROUTES`；查询参数默认全部拒绝。
- `POST` 正文必须非空、为有效 UTF-8 JSON、最多 1 MiB，且不接受压缩正文。
- 可转发请求头：`Accept`、`Content-Type`、`Last-Event-ID`、经验证的 `Idempotency-Key`。
- 客户端 `Authorization`、Cookie、身份头、Cloudflare 头和转发链头不会送往上游。
- 上游响应仅允许 `application/json`、`application/*+json` 和 `text/event-stream`。
- 上游 3xx 会被拒绝，不会自动跟随。
- 上游连接等待最多 15 秒；JSON 最多 8 MiB/60 秒，SSE 最多 64 MiB/15 分钟。

响应体使用流式直通；代理不会先把 SSE 响应完整缓冲。流式响应在超限或超时后会被终止。

## 静态网页镜像

可选的 `/web/*` 是同一个固定上游的只读镜像，不是任意 URL 网页代理。它有意放弃 JavaScript、Cookie 和表单，避免不受信任的上游代码在 Sites origin 中运行。

启用前请阅读 [`static-web-mirror.zh-CN.md`](static-web-mirror.zh-CN.md)。对外提供该入口时，部署必须继续受到 Sites 访问控制保护。

## 状态与错误

`GET /api/health` 返回不含密钥的配置摘要：

- `setup_required`：缺少必需运行时变量
- `invalid`：变量存在但未通过验证
- `ready`：配置通过静态验证，但上游连通性仍为 `not_checked`

`ready` 返回 HTTP 200；`setup_required` 和 `invalid` 返回 HTTP 503。`OPTIONS` 会单独列为本地预检方法，不属于上游转发方法。

API 错误使用稳定英文错误码。常见错误包括：

| 状态 | 错误码 | 含义 |
| --- | --- | --- |
| 503 | `proxy_not_configured` | 缺少必需配置。 |
| 503 | `proxy_invalid_config` | 配置未通过验证。 |
| 401 | `proxy_unauthorized` | 代理访问令牌错误。 |
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

代理采用 fail-closed 设计：缺少或错误配置会停止转发。它先验证代理令牌，再应用方法与路径策略；重建上游请求头、分离代理访问令牌与上游凭据、拒绝多重编码路径绕过和可能形成同源脚本执行的响应，并为所有响应设置 `no-store`。

固定 hostname 不能抵御由上游域名控制者实施的恶意 DNS 行为。只配置你控制或信任的上游，并在上游启用配额和速率限制。公开部署时，代理访问令牌不能替代平台访问策略或上游限流。

## 仓库内置 Skill

仓库在 `.agents/skills/operate-sites-relay/` 内置了 Codex Skill。后续 Agent 可使用 `$operate-sites-relay` 快速读取架构、安全契约、验证命令和 Sites 私密部署流程。Skill 文件本身使用英文。

## 参与贡献

开发环境、验证流程、Pull Request 清单和 Conventional Commits 提交规范见 [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)。

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

- 未配置、错误令牌、越界路径和非法 origin 均按预期失败
- Cookie、客户端 `Authorization` 和身份头未抵达上游
- JSON 正常返回，SSE 首块在流结束前到达
- API 中继不会透传 HTML、重定向或 `Set-Cookie`
- 启用静态镜像时，主动内容会被移除，只保留允许的路径、查询、资源和策略内重定向
