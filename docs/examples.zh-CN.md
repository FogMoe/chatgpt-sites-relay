# 示例

[英文](./examples.md) | 简体中文

以下示例中的主机、用户、模型和凭据都是占位符。请配置你控制或信任的上游；上游凭据保存在 Sites 运行时变量中；首次部署保持仅所有者可访问。

## 同源 Sites 应用

当已部署 Site 中的浏览器代码调用中继时，使用 Sites 用户模式。Sites dispatcher 会把已登录身份提供给服务端代码，中继会先检查精确邮箱白名单，再暴露路由策略。

```dotenv
PROXY_UPSTREAM_ORIGIN=https://api.example.com
PROXY_AUTH_MODE=sites-user
PROXY_ALLOWED_USER_EMAILS=owner@example.com
PROXY_ALLOWED_ROUTES=POST:/v1/responses
PROXY_ALLOWED_QUERY_KEYS=
PROXY_UPSTREAM_AUTHORIZATION=Bearer <仅设置在运行时变量中>
```

浏览器通过同源请求和已登录 Sites 身份完成访问：

```ts
const response = await fetch("/api/proxy/v1/responses", {
  method: "POST",
  headers: {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "your-model",
    input: "Hello",
  }),
});

if (!response.ok || !response.body) {
  throw new Error(`Relay request failed with ${response.status}`);
}

const reader = response.body
  .pipeThrough(new TextDecoderStream())
  .getReader();
```

请保留 Sites 访问控制。请求经过 Sites dispatcher 后，已认证用户身份头可作为可信身份。

## 程序化 JSON/SSE 客户端

服务端脚本、服务和受控客户端使用令牌模式。

```dotenv
PROXY_UPSTREAM_ORIGIN=https://api.example.com
PROXY_AUTH_MODE=token
PROXY_ACCESS_TOKEN=<随机-base64url-值>
PROXY_ALLOWED_ROUTES=GET:/v1/models,POST:/v1/responses
PROXY_ALLOWED_QUERY_KEYS=
PROXY_UPSTREAM_AUTHORIZATION=Bearer <仅设置在运行时变量中>
```

```bash
curl -N "$SITE_URL/api/proxy/v1/responses" \
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"model":"your-model","input":"Hello"}'
```

将 `PROXY_ACCESS_TOKEN` 保存在服务端脚本、服务或受控客户端中，并配合 Sites 访问控制、上游配额和速率限制。

## 带身份保护的静态文档镜像

可选镜像使用同一个固定上游，面向经过净化的静态文档和状态内容。

```dotenv
WEB_RELAY_ENABLED=true
WEB_RELAY_ALLOWED_USER_EMAILS=owner@example.com
WEB_RELAY_ALLOWED_PATH_PREFIXES=/docs,/status
WEB_RELAY_ALLOWED_QUERY_KEYS=lang,page
```

部署后，允许的用户可以访问：

```text
https://<your-site>/web/docs
```

启用前请阅读完整的[静态网页镜像契约](./static-web-mirror.zh-CN.md)。

## 验证部署

1. 打开 `/api/health` 并确认 `status` 为 `ready`；这只验证配置。
2. 向允许的上游路径发送一个无副作用请求。
3. 确认错误令牌或不在白名单的用户会在路由策略细节之前被拒绝。
4. 确认策略外路径和查询参数会被拒绝。
5. 对 SSE 确认首个事件在上游流关闭前到达。
