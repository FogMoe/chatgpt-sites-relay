# 静态网页镜像

[英文](static-web-mirror.md) | 简体中文

可选静态网页镜像从 API 中继使用的同一个固定 HTTPS 上游提供经过清理的只读内容。入口为 `/web/*`，默认关闭，并且不接受客户端提供的目标 origin。

它适合文档、状态页和其他以静态内容为主的页面。它不是兼容性浏览器、任意 URL 代理，也不能让上游应用原样运行。

## 启用方式

常规必需代理变量必须已经有效，再添加：

```dotenv
WEB_RELAY_ENABLED=true
WEB_RELAY_ALLOWED_PATH_PREFIXES=/docs,/status
WEB_RELAY_ALLOWED_QUERY_KEYS=lang,page
```

启用镜像时必须设置 `WEB_RELAY_ALLOWED_PATH_PREFIXES`。只有在检查完整上游范围后才应使用 `/`。查询参数默认全部拒绝，必须按精确 key 列出。

浏览器访问镜像时不使用 API 客户端的 `x-proxy-token`。任何开放 `/web/*` 的部署都必须继续受到 Sites 访问控制保护；默认采用仅所有者可访问的部署。

## 请求契约

- 只接受 `GET` 和 `HEAD`。`POST`、表单提交、CORS 预检和其他方法都会被拒绝。
- `/web/path` 映射到 `PROXY_UPSTREAM_ORIGIN` 的 `/path`。
- 解码后的路径必须匹配 `WEB_RELAY_ALLOWED_PATH_PREFIXES`。
- 每个查询参数必须匹配 `WEB_RELAY_ALLOWED_QUERY_KEYS`。
- 编码分隔符、编码百分号、NUL、反斜杠、重复斜杠和 dot segment 都会被拒绝。
- 上游始终是唯一配置的 HTTPS origin。客户端无法改变协议、hostname、端口或凭据。
- 只有仍在同一上游 origin 且符合路径与查询策略的重定向才会被重写；其他重定向会被阻止。
- 中继 hop 标记会阻止一个 Sites Relay 递归镜像另一个中继响应。

## 上游请求

镜像会重新构建请求，而不是转发浏览器请求头：

- 发送 `Accept`、`Accept-Encoding: identity`、Sites Relay user agent、请求 ID 和中继 hop 标记。
- 配置后会注入 `PROXY_UPSTREAM_AUTHORIZATION`。
- 不转发客户端 `Authorization`、Cookie、origin、referer、身份头、Cloudflare 头或转发链头。
- 不发送请求正文。

## 允许的响应

镜像接受：

- UTF-8 `text/html`
- UTF-8 `text/css`
- AVIF、GIF、JPEG、PNG、WebP 和常见 icon 媒体类型
- WOFF、WOFF2、EOT 和受支持的旧字体媒体类型

JavaScript、JSON、XML、SVG、音频、视频、manifest、任意二进制文件、压缩响应和不支持的字符集都会被拒绝。

HTML 与 CSS 文档最多 4 MiB，图片与字体最多 20 MiB。上游连接时限为 15 秒，响应时限为 60 秒。

## HTML 清理

镜像会在返回前解析并重新序列化 HTML。HTML 属性采用白名单，未识别的旧式加载属性无法向 `/web/*` 之外发起请求。镜像会移除：

- 脚本、样式、表单、控件、frame、嵌入文档、SVG、MathML、template、媒体、object 和 portal
- 事件属性、内联 `style`、`srcset`、表单属性、`srcdoc`、integrity 元数据、下载行为和导航 target
- refresh 元数据和不支持的 link relation
- 指向固定上游以外，或越过路径与查询策略的链接和资源

符合策略的 anchor、图片、icon 和 stylesheet 链接会被重写到 `/web/*`；anchor 会增加 `nofollow noopener noreferrer`。

## CSS 重写

CSS 会在返回前经过解析：

- 符合策略的 `url(...)` 和 `@import` 会被重写到 `/web/*`
- 外部、data 或其他不允许的引用会被移除
- 包含 CSS escape 的样式表会被拒绝；使用 `src()`、`image()`、`image-set()` 等可接受字符串 URL 的加载函数时，整个声明会被移除
- `behavior` 和 `-moz-binding` 等旧式可执行属性会被移除
- source map 引用会被移除

镜像 HTML 不保留内联 style 属性或 `<style>` 元素。

## 响应隔离

镜像不会透传上游 Cookie 或任意响应头。响应会设置：

- `Cache-Control: private, no-store, no-transform`
- 禁用脚本、表单、连接、frame、Worker、媒体和 object 的严格 CSP；样式、图片和字体只能来自当前 origin 的 `/web/` 路径
- `sandbox allow-same-origin`
- 同源 opener 与 resource 策略
- 禁用摄像头、麦克风、地理位置、支付和 USB 权限
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Robots-Tag: noindex, nofollow, noarchive`

## 限制

依赖 JavaScript、Cookie、登录状态、表单、内联样式、跨域资源、WebSocket、媒体或嵌入内容的页面不会像原网站一样工作。这是有意的安全边界。

未来如果要支持 JavaScript、API、会话 Cookie 和表单，同时不让上游代码在 Sites origin 中执行，请参阅 [`web-compatibility-direction.zh-CN.md`](web-compatibility-direction.zh-CN.md)。
