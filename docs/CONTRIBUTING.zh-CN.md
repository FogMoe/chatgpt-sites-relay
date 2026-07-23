# 贡献指南

[英文](./CONTRIBUTING.md) | 简体中文

感谢你帮助改进 Sites Relay。这个仓库体量不大，但处在应用与上游服务之间，任何网络能力、认证或响应处理改动都应被视为安全相关改动。

## 项目边界

Sites Relay 为 ChatGPT Sites 提供受限 JSON/SSE API 中继和可选的只读静态网页镜像。每个部署只连接一个由服务端配置的固定 HTTPS 上游。API 只转发明确允许的方法、路径和查询参数；镜像只提供经过清理并符合策略的静态内容。

以下能力不属于当前项目范围，除非先讨论并接受新的架构与威胁模型：

- 由客户端选择目标、hostname 或上游 URL 的开放代理
- 接受客户端目标，或转发 JavaScript、SVG、XML、表单、嵌入文档等主动内容的网站镜像
- 文件上传、`multipart/form-data`、API 自动重定向、跨策略镜像重定向或任意请求头透传
- 通用 HTTP 正向代理、SOCKS、WebSocket、`CONNECT`、TCP 或 UDP 隧道

如果提案会扩大网络访问能力，请先在 Issue 中说明使用场景、认证模型、SSRF 与 DNS 风险、资源限制和滥用控制，再提交实现。

完整网页兼容的现有架构提案见 [`web-compatibility-direction.zh-CN.md`](./web-compatibility-direction.zh-CN.md)。该提案描述独立的远程浏览器服务，不表示当前 API 中继已经支持任意 URL。

现有固定上游、只读静态镜像的契约另见 [`static-web-mirror.zh-CN.md`](./static-web-mirror.zh-CN.md)。

## 本地开发

需要 Node.js 22.13.0 或更高版本。

```powershell
git clone https://github.com/scarletkc/chatgpt-sites-relay.git
Set-Location chatgpt-sites-relay
npm ci
Copy-Item .env.example .env.local
npm run dev
```

在其他 shell 中，将 `Copy-Item` 替换为 `cp`。根据 `.env.example` 设置本地变量；不要提交 `.env.local`、访问令牌、上游凭据或真实服务 URL。缺少运行时配置时，界面和 `/api/health` 应明确报告未配置状态，而不是静默放宽策略。

## 变更要求

- 保持变更聚焦；不要在同一个 Pull Request 中混入无关重构。
- 保持配对的中英文用户文案和文档语义一致。
- 配置或运行时契约变化时，同步检查 `.env.example`、`README.md`、相关界面、`/api/health`、测试和仓库内置 Skill。
- 保持 fail-closed、固定 HTTPS 上游、凭据隔离、路由白名单、JSON/SSE 响应限制和静态镜像清理策略。
- 可见界面改动应在 Pull Request 中附上变更前后说明和截图。
- 修改依赖时，同时更新并提交 `package-lock.json`。

## 验证

依赖或 lockfile 发生变化后，先运行 `npm ci`。提交 Pull Request 前，按以下顺序运行全部检查：

```powershell
npm run typecheck
npm run lint
npm test
```

`npm test` 会先执行生产构建，再运行 Node.js 测试。不要通过降低安全检查或删除覆盖来让测试通过。
GitHub Actions 会在每次 push 和 Pull Request 中自动运行同一组检查。

## 提交信息

所有提交必须遵循 [Conventional Commits 1.0.0](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

描述应简洁、使用祈使语气且不以句号结尾。推荐使用英文，以保持 Git 历史一致。一个提交只包含一个逻辑变更。

允许的常用类型：

- `feat`：新功能
- `fix`：缺陷修复
- `docs`：仅文档
- `refactor`：不改变行为的代码重构
- `perf`：性能改进
- `test`：新增或修正测试
- `build`：构建系统或依赖
- `ci`：持续集成
- `chore`：其他维护工作
- `style`：不影响行为的格式调整

可选 scope 应简短并使用小写，例如 `proxy`、`config`、`health`、`ui`、`docs`、`tests`、`build` 或 `skill`。

```text
fix(proxy): reject multiply encoded path separators
feat(config): allow exact query parameter keys
docs: add contribution guidelines
test(proxy): cover SSE response limits
chore: rename package to sites-relay
```

破坏性变更必须在类型或 scope 后添加 `!`，并在 footer 中解释迁移影响：

```text
feat(config)!: replace path prefixes with route rules

BREAKING CHANGE: replace PROXY_ALLOWED_PATH_PREFIXES with PROXY_ALLOWED_ROUTES.
```

## Pull Request 清单

- [ ] 变更聚焦且不包含无关文件。
- [ ] 未提交密钥、本地环境文件、缓存或构建产物。
- [ ] 配对的中英文文案和文档保持同步。
- [ ] 没有意外扩大代理、安全或网络边界。
- [ ] `npm run typecheck`、`npm run lint` 和 `npm test` 全部通过。
- [ ] 每个提交都符合 Conventional Commits。
