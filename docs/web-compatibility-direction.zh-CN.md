# 完整网页兼容方向

[英文](./web-compatibility-direction.md) | 简体中文

> 状态：架构提案，尚未实现。当前产品契约仍以 [`README.zh-CN.md`](./README.zh-CN.md) 为准。

## 目标

这个方向允许已认证用户输入任意公网 `http://` 或 `https://` URL，并在隔离环境中使用目标网站的 JavaScript、API 请求、Cookie 和普通表单。

“完整兼容”是架构目标，不是对所有网站的保证。网站自身的反自动化策略、DRM、硬件能力、浏览器扩展依赖或第三方登录限制仍可能阻止正常使用。

## 架构决策

完整兼容模式应使用真实浏览器执行网站，而不是依赖 HTML、CSS 和 JavaScript 文本重写。暂称的新组件为 Browser Relay；它与 Sites Relay 分开部署。

Sites Relay 保留两项职责：

1. 提供 URL 输入、会话状态和结束会话等控制界面。
2. 使用已认证用户身份向 Browser Relay 创建短期会话。

Browser Relay 负责启动临时浏览器、执行目标内容、应用网络出口策略并向控制界面传输画面和输入事件。目标网站代码始终在远端浏览器沙箱中运行，不在 Sites 页面中运行。

```mermaid
flowchart LR
    U["已认证用户"]
    S["Sites Relay<br/>控制界面"]
    G["Browser Relay<br/>会话网关"]
    B["临时 Chromium"]
    E["公网出口策略"]
    W["目标网站"]

    U --> S
    S -->|"创建和结束会话"| G
    G --> B
    B --> E
    E --> W
    B -->|"画面与状态"| G
    G -->|"受认证的流"| S
    S -->|"键盘、鼠标和触控"| G
```

## 为什么不使用资源重写

资源重写可以覆盖静态 HTML、CSS、图片、字体和部分链接，但无法可靠复现现代浏览器的完整行为：

- JavaScript 可以在运行时构造 `fetch`、XHR、模块、Worker 和 WebSocket URL。
- 根相对路径、动态导入、Service Worker、CSP、SRI 和重定向各自需要不同处理。
- 把多个目标网站映射到同一个代理 origin 会破坏浏览器原有的同源隔离。
- Cookie、`SameSite`、`Domain`、`Path`、存储分区和第三方登录语义难以通过字符串重写保持。
- 上游页面代码会在用户浏览器中运行，扩大控制界面、访问令牌和用户数据的暴露面。

远程浏览器保留浏览器原生的 origin、Cookie、重定向、脚本和表单语义，同时把不受信任代码移出 Sites origin。代价是需要独立的长连接、浏览器进程、资源调度和运行隔离基础设施。

## 组件职责

| 组件 | 负责 | 不得承担 |
| --- | --- | --- |
| Sites Relay 控制界面 | URL 输入、用户确认、会话状态、无障碍输入、主动结束会话 | 执行上游 HTML/JavaScript，保存上游 Cookie，暴露浏览器控制凭据 |
| 会话网关 | 身份绑定、短期 capability、并发与时长配额、流连接 | 接受匿名会话，向页面代码暴露控制 API 或长期凭据 |
| 浏览器 Worker | Chromium 生命周期、页面执行、临时 profile、画面与输入 | 复用不同用户的 browser context，使用宿主机网络或持久化 profile |
| 出口策略层 | 公网地址限制、DNS 与重定向复核、协议和端口策略、带宽上限 | 仅依赖前端 URL 校验或单次 DNS 检查 |
| 观测与配额层 | 会话 ID、资源用量、失败类别、滥用信号 | 记录完整 URL 查询、表单内容、Cookie、页面正文或用户输入 |

## 域名与执行隔离

至少使用两个 origin：

- Sites 控制域名，例如 `relay.example.com`
- Browser Relay 隔离域名，例如 `browser.example.net`

独立域名是必要条件，但不是充分条件。Browser Relay 不应把上游 DOM 注入隔离域名页面；隔离域名只承载可信 viewer shell、画面流和输入通道。目标 HTML、JavaScript 和 Cookie 仅存在于远端 Chromium 内。

第一版采用每个会话独立的 browser context；生产多租户环境应优先使用每会话独立进程或容器。会话结束或超时后销毁 profile、内存、临时文件和 capability。

## 会话流程

1. 用户在 Sites Relay 中完成身份验证并输入公网 HTTP(S) URL。
2. Sites Relay 服务端向会话网关提交用户身份、初始 URL 和请求配额。浏览器不直接提交长期服务凭据。
3. 网关创建短期会话，并通过一次性 handoff 建立隔离域名上的 `Secure`、`HttpOnly` 会话。capability 不放入可长期记录的 URL。
4. Browser Worker 在受限网络命名空间中启动，并通过出口策略层访问目标网站。
5. 目标网站的脚本、API 请求、Cookie、跳转和表单在远端浏览器中按原生浏览器语义运行。
6. viewer 只接收画面、可访问状态和必要音频，并发送受限的键盘、鼠标和触控事件。
7. 用户主动结束、断开超过宽限时间或达到绝对时限后，网关撤销 capability 并销毁 Worker。

## 网络与 SSRF 边界

“任意 URL”只表示任意公网 HTTP(S) 目标，不表示任意网络位置。以下规则必须在浏览器所在网络层强制执行：

- 初始导航仅接受 `http:` 和 `https:`；拒绝 `file:`、`ftp:`、`chrome:`、`javascript:` 和自定义 scheme。
- IPv4 与 IPv6 的 loopback、私网、链路本地、ULA、组播、保留地址和云元数据地址全部拒绝。
- 每次 DNS 解析、连接和重定向都重新应用地址策略；仅在应用层检查 hostname 不足以防止 DNS rebinding。
- Browser Worker 不使用 host network，不可访问宿主机、容器控制面、数据库或内部服务网段。
- 不接受用户提供的上游代理、`Authorization`、客户端证书或自定义 DNS。
- 对会话并发、导航频率、响应体、带宽、CPU、内存和总时长设置硬上限。

## JavaScript、API、Cookie 与表单

- JavaScript 在远端 Chromium 中启用，无法访问 Sites Relay DOM、storage 或凭据。
- `fetch`、XHR、模块、Worker 和 WebSocket 由远端浏览器原生处理，并统一经过出口策略。
- Cookie 与 Web Storage 只保存在当前会话 profile 中；第一版不跨会话持久化。
- 普通 GET/POST 表单可在远端浏览器中提交。Sites Relay 不读取、复制或记录字段内容。
- 第一版禁用文件上传、自动下载、剪贴板读取、摄像头、麦克风、地理位置、USB、蓝牙和通知权限。后续能力必须逐项设计授权、配额和内容处理。
- 不导入用户本地浏览器的 Cookie、密码、扩展或证书。

## 身份与 capability

- 创建、查看、控制和结束会话都要求身份验证。
- capability 必须绑定用户、会话、用途、签发时间和到期时间，并且不可跨会话复用。
- viewer capability 与 Worker 管理凭据分离；网页代码不能获得任何一种凭据。
- 默认每个用户只允许少量并发会话，并设置短期空闲与绝对超时。
- 如果未来允许公开注册，必须先完成滥用响应、封禁、配额、成本上限和法律审查。

## 部署边界

Browser Relay 需要长连接、浏览器二进制、进程或容器隔离以及受控网络出口。因此它作为独立容器服务部署；当前 Sites 部署继续托管控制界面和受限 JSON/SSE API 中继。

Browser Worker 的最低运行边界：

- 非 root 用户、只读根文件系统、临时 profile 使用受限 `tmpfs`。
- 保留 Chromium sandbox；不得使用 `--no-sandbox` 作为生产配置。
- 使用 seccomp、capability drop、PID/内存/CPU/磁盘限制和无 host mount 的容器。
- 网关与 Worker 使用内部网络；只有网关暴露受认证的 HTTPS/WSS 入口。
- 所有服务间流量使用独立凭据，生产密钥由部署平台管理。

## 分阶段交付

### 阶段 0：威胁模型与单会话原型

- 固化攻击面、数据流、信任边界和成本上限。
- 证明公网出口策略能够阻止 IPv4、IPv6、重定向和 DNS rebinding 绕过。
- 完成单个临时 Chromium 会话的 URL 导航、画面传输和输入。

### 阶段 1：已认证 MVP

- 接入用户身份、短期 capability、会话结束和超时销毁。
- 支持 JavaScript、API、会话内 Cookie 和普通表单。
- 禁用文件传输和设备权限；设置硬资源配额。

### 阶段 2：多用户加固

- 每会话进程或容器隔离、队列、并发限制和过载保护。
- 增加不记录敏感内容的审计事件、滥用检测和运营告警。
- 完成隔离、SSRF、会话劫持、资源耗尽和跨用户数据泄漏测试。

### 阶段 3：可选体验能力

- 在单独设计后评估加密 profile 持久化、受控下载或文件上传。
- 根据实际可访问性需求评估 DOM 辅助通道；不得把不受信任 DOM 注入控制页面。

## 验收条件

进入生产试用前，至少满足以下条件：

- 任意公网 HTTP(S) URL 可以创建会话，非公网目标在实际网络连接前失败。
- JavaScript、同源 API 请求、跨页面导航、会话内 Cookie 和普通表单在受测站点正常工作。
- loopback、RFC 1918、链路本地、ULA、云元数据、重定向和 DNS rebinding 用例均无法到达。
- 目标页面无法读取控制界面 origin、身份会话、capability 或其他用户会话。
- 会话结束与超时都会撤销控制通道并删除 browser profile 和临时文件。
- 日志不包含完整查询参数、Cookie、表单值、页面正文、键盘输入或截图。
- 资源限制在异常网站和断开客户端下仍然生效，且不会影响其他会话。

## 实现前待定项

1. Browser Relay 的部署平台、隔离域名和公网出口控制方式。
2. 画面协议使用 WebSocket 帧流还是 WebRTC，以及音频和移动端输入范围。
3. 生产身份来源、每用户并发数、空闲超时、绝对时限和成本上限。
4. 第一版是否完全禁用下载与上传，以及后续内容扫描责任。
5. 服务是否仅供所有者或受邀用户使用；公开注册需要独立的滥用与法律评审。

## 与当前项目的关系

这份文档只记录未来方向，不修改当前运行时行为。现有 `/api/proxy/*` 继续使用固定 HTTPS 上游、方法与路径白名单、服务端认证以及 JSON/SSE 响应限制。

后续实现应新增清晰分离的 Browser Relay 服务和控制面集成，不得通过给 `/api/proxy/*` 增加任意 `url` 参数来绕过现有安全契约。
