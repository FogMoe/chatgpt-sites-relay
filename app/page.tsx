import {
  getProxyPublicStatus,
  MAX_REQUEST_BODY_BYTES,
  PROXY_METHODS,
} from "@/lib/proxy-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const guardrails = [
  {
    index: "01",
    titleZh: "固定上游",
    titleEn: "Fixed upstream",
    copyZh: "目标只来自 Sites 运行时配置，客户端不能提交任意网址。",
    copyEn:
      "The destination comes only from Sites runtime values. Clients cannot supply a URL.",
  },
  {
    index: "02",
    titleZh: "凭据隔离",
    titleEn: "Separated credentials",
    copyZh: "代理访问令牌与上游凭据分开保存，客户端 Authorization 不会透传。",
    copyEn:
      "Proxy access tokens and upstream credentials stay separate. Client Authorization is never forwarded.",
  },
  {
    index: "03",
    titleZh: "显式契约",
    titleEn: "Explicit contract",
    copyZh: "仅放行配置过的方法与路径组合、查询参数和少量安全请求头。",
    copyEn:
      "Only configured method-path pairs, query parameters, and a small safe header set are accepted.",
  },
  {
    index: "04",
    titleZh: "安全响应",
    titleEn: "Safe responses",
    copyZh: "API 仅回传 JSON/SSE；可选网页镜像只提供清理后的静态内容。",
    copyEn:
      "The API returns only JSON/SSE; the optional web mirror serves sanitized static content.",
  },
] as const;

const setupSteps = [
  {
    titleZh: "设置固定上游",
    titleEn: "Set the fixed upstream",
    variable: "PROXY_UPSTREAM_ORIGIN",
    copyZh: "填写一个使用 DNS hostname 的 HTTPS origin，不含路径、查询参数或凭据。",
    copyEn:
      "Use an HTTPS origin with a DNS hostname and no path, query string, or embedded credentials.",
  },
  {
    titleZh: "创建代理访问令牌",
    titleEn: "Create a proxy access token",
    variable: "PROXY_ACCESS_TOKEN",
    copyZh: "生成 32–256 字符的随机 base64url 值；客户端通过 x-proxy-token 提交。",
    copyEn:
      "Generate a random 32–256 character base64url value. Clients send it in x-proxy-token.",
  },
  {
    titleZh: "限定路由范围",
    titleEn: "Limit the route surface",
    variable: "PROXY_ALLOWED_ROUTES",
    copyZh: "逐项绑定方法与路径，例如 GET:/v1/models,POST:/v1/responses。",
    copyEn:
      "Bind each method to a path, such as GET:/v1/models,POST:/v1/responses.",
  },
  {
    titleZh: "可选：启用网页镜像",
    titleEn: "Optional: enable the web mirror",
    variable: "WEB_RELAY_*",
    copyZh: "显式启用后，只允许指定 ChatGPT 用户访问同一上游中列入白名单的静态路径。",
    copyEn:
      "When enabled, only named ChatGPT users can access allowlisted static paths from the same upstream.",
  },
  {
    titleZh: "部署后验证",
    titleEn: "Deploy, then verify",
    variable: "/api/health",
    copyZh: "先检查配置状态，再用无副作用请求验证真实上游连接。",
    copyEn:
      "Check configuration state first, then verify the real upstream with a side-effect-free request.",
  },
] as const;

const curlExample = `curl -N "$SITE_URL/api/proxy/v1/responses" \\
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  --data '{"model":"your-model","input":"Hello"}'`;

const errorExample = `{
  "error": "proxy_not_configured",
  "message": "Proxy runtime values are not configured."
}`;

export default function Home() {
  const status = getProxyPublicStatus();
  const stateCopy = getStateCopy(status.state);
  const bodyLimitMiB = MAX_REQUEST_BODY_BYTES / 1_048_576;

  return (
    <main>
      <div className="ambient-grid" aria-hidden="true" />

      <header className="site-header">
        <a
          className="brand"
          href="#overview"
          aria-label="Sites Relay / Sites 中继首页 / Home"
        >
          <span className="brand-mark" aria-hidden="true">
            SR
          </span>
          <span>
            <strong>Sites Relay</strong>
            <small>Sites 中继</small>
          </span>
        </a>

        <nav aria-label="页面导航 / Page navigation">
          <a href="#overview">概览 <span lang="en">Overview</span></a>
          <a href="#example">示例 <span lang="en">Example</span></a>
          <a href="#guardrails">边界 <span lang="en">Guardrails</span></a>
          <a href="#setup">配置 <span lang="en">Setup</span></a>
        </nav>

        <a
          className={`status-pill status-${status.state}`}
          href="#runtime-status"
        >
          <span className="status-dot" aria-hidden="true" />
          {stateCopy.zh}
          <span lang="en">{stateCopy.en}</span>
        </a>
      </header>

      <section className="hero section-shell" id="overview">
        <div className="hero-copy">
          <p className="eyebrow">CHATGPT SITES · API + STATIC WEB RELAY</p>
          <h1>
            把一个受控上游，
            <br />
            接入 <em>Sites</em>
          </h1>
          <p className="hero-title-en" lang="en">
            Connect one controlled upstream through Sites.
          </p>
          <p className="hero-description">
            一个部署在 ChatGPT Sites 上的受限 API 中继，并可选择提供同一
            固定上游的只读静态网页镜像；它不是开放代理。
            <span lang="en">
              A constrained API relay for ChatGPT Sites with an optional
              read-only static mirror of the same fixed upstream. It is not an
              open proxy.
            </span>
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="#setup">
              开始配置 <span lang="en">Configure</span>
              <span aria-hidden="true">↘</span>
            </a>
            <a className="button button-secondary" href="#example">
              查看请求示例 <span lang="en">View example</span>
            </a>
          </div>

          <div className={`inline-state state-${status.state}`} role="status">
            <span className="inline-state-icon" aria-hidden="true">
              {status.state === "invalid" ? "!" : "i"}
            </span>
            <span>
              <strong>{stateCopy.noteZh}</strong>
              <small lang="en">{stateCopy.noteEn}</small>
            </span>
          </div>
        </div>

        <aside
          className="runtime-card"
          id="runtime-status"
          aria-labelledby="runtime-heading"
        >
          <div className="card-heading">
            <div>
              <p className="section-kicker">RUNTIME STATUS</p>
              <h2 id="runtime-heading">
                运行状态 <span lang="en">Runtime status</span>
              </h2>
            </div>
            <span className={`signal signal-${status.state}`} aria-hidden="true">
              {status.state === "ready"
                ? "CFG"
                : status.state === "invalid"
                  ? "ERR"
                  : "SET"}
            </span>
          </div>

          <dl className="status-list">
            <div>
              <dt>配置 <span lang="en">Configuration</span></dt>
              <dd className={`value-${status.state}`}>
                {stateCopy.zh}
                <small lang="en">{stateCopy.en}</small>
              </dd>
            </div>
            <div>
              <dt>上游 <span lang="en">Upstream</span></dt>
              <dd>
                {status.upstreamHost ??
                  (status.upstreamConfigured
                    ? status.state === "ready"
                      ? "已配置"
                      : "已提供"
                    : "未设置")}
                <small lang="en">
                  {status.upstreamHost
                    ? "Configured host"
                    : status.upstreamConfigured
                      ? status.state === "ready"
                        ? "Configured"
                        : "Provided"
                      : "Not set"}
                </small>
              </dd>
            </div>
            <div>
              <dt>代理入口 <span lang="en">Endpoint</span></dt>
              <dd className="mono">
                /api/proxy/*
                <small>API 路由 · HTTP API route</small>
              </dd>
            </div>
            <div>
              <dt>网页镜像 <span lang="en">Web mirror</span></dt>
              <dd className={status.webRelayEnabled ? "value-ready" : undefined}>
                {status.webRelayEnabled ? "已启用" : "已关闭"}
                <small lang="en">
                  {status.webRelayEnabled
                    ? `${status.webRelayPathCount} allowed path ${status.webRelayPathCount === 1 ? "prefix" : "prefixes"} · /web/*`
                    : "Disabled by default · /web/*"}
                </small>
              </dd>
            </div>
            <div>
              <dt>
                代理访问令牌 <span lang="en">Proxy access token</span>
              </dt>
              <dd>
                {status.accessTokenConfigured
                  ? status.state === "ready"
                    ? "已配置"
                    : "已提供"
                  : "未设置"}
                <small lang="en">
                  {status.accessTokenConfigured
                    ? status.state === "ready"
                      ? "Configured"
                      : "Provided"
                    : "Not set"}
                </small>
              </dd>
            </div>
            <div>
              <dt>连通性 <span lang="en">Reachability</span></dt>
              <dd>
                尚未检查
                <small lang="en">Not checked</small>
              </dd>
            </div>
          </dl>

          <div className="flow-diagram" aria-label="请求流向 / Request flow">
            <div className="flow-node">
              <span>01</span>
              <strong>客户端</strong>
              <small lang="en">Client</small>
            </div>
            <span className="flow-arrow" aria-hidden="true">→</span>
            <div className="flow-node flow-node-active">
              <span>02</span>
              <strong>Sites 中继</strong>
              <small lang="en">Sites relay</small>
            </div>
            <span className="flow-arrow" aria-hidden="true">→</span>
            <div className={`flow-node flow-node-${status.state}`}>
              <span>03</span>
              <strong>
                {status.upstreamHost ??
                  (status.upstreamConfigured
                    ? status.state === "ready"
                      ? "已配置"
                      : "已提供"
                    : "未配置")}
              </strong>
              <small lang="en">
                {status.upstreamHost
                  ? "Upstream"
                  : status.upstreamConfigured
                    ? status.state === "ready"
                      ? "Configured upstream"
                      : "Provided"
                    : "Not configured"}
              </small>
            </div>
          </div>

          {(status.missing.length > 0 || status.issues.length > 0) && (
            <p className="status-footnote">
              {status.state === "invalid"
                ? `检测到 ${status.issues.length} 项配置错误`
                : `还需设置 ${status.missing.length} 项运行时变量`}
              <span lang="en">
                {status.state === "invalid"
                  ? `${status.issues.length} configuration issue${status.issues.length === 1 ? "" : "s"} detected`
                  : `${status.missing.length} runtime value${status.missing.length === 1 ? "" : "s"} still required`}
              </span>
            </p>
          )}
        </aside>
      </section>

      <section className="contract-strip" aria-label="代理请求约定 / Proxy contract">
        <div>
          <span>方法 · METHODS</span>
          <strong>{PROXY_METHODS.join(" · ")}</strong>
        </div>
        <div>
          <span>请求正文 · REQUEST BODY</span>
          <strong>JSON · ≤ {bodyLimitMiB} MiB</strong>
        </div>
        <div>
          <span>响应 · RESPONSE</span>
          <strong>API: JSON · SSE</strong>
        </div>
        <div>
          <span>网页镜像 · WEB MIRROR</span>
          <strong>STATIC · SANITIZED</strong>
        </div>
      </section>

      <section className="example-section section-shell" id="example">
        <div className="section-intro">
          <p className="section-kicker">REQUEST CONTRACT · 请求约定</p>
          <h2>
            一条入口，固定去向
            <span lang="en">One route. One upstream.</span>
          </h2>
          <p>
            <code>/api/proxy/*</code> 下的允许路由会追加到运行时配置的 HTTPS
            上游；查询参数默认全部拒绝。请求无法改变协议、主机或端口。
            <span lang="en">
              Allowed routes under <code>/api/proxy/*</code> are appended to
              the configured HTTPS upstream; query parameters are denied by
              default. A request cannot change its scheme, host, or port.
            </span>
          </p>
        </div>

        <div className="code-layout">
          <article className="code-card code-card-primary">
            <div className="code-toolbar">
              <span className="window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>request.sh</span>
              <span className="code-label">SSE 示例 · EXAMPLE</span>
            </div>
            <pre>
              <code>{curlExample}</code>
            </pre>
            <p>
              把示例路径替换为允许的上游路径。
              <span lang="en">
                Replace the example path with one allowed by your policy.
              </span>
            </p>
          </article>

          <article className="code-card code-card-muted">
            <div className="code-toolbar">
              <span>setup-required.json</span>
              <span className="code-label code-label-amber">503</span>
            </div>
            <pre>
              <code>{errorExample}</code>
            </pre>
            <p>
              API 使用稳定的英文错误码；页面负责双语解释。
              <span lang="en">
                The API keeps stable English error codes; this page explains
                them bilingually.
              </span>
            </p>
          </article>
        </div>
      </section>

      <section className="guardrails-section section-shell" id="guardrails">
        <div className="section-intro section-intro-wide">
          <p className="section-kicker">SECURITY BOUNDARY · 安全边界</p>
          <h2>
            边界先于便利
            <span lang="en">Guardrails before convenience.</span>
          </h2>
          <p>
            API 中继与可选静态镜像都只连接同一个固定上游；它不是任意 URL
            网页代理、VPN 或 TCP 隧道。
            <span lang="en">
              Both the API relay and optional static mirror connect only to one
              fixed upstream—not arbitrary URLs, a VPN, or a TCP tunnel.
            </span>
          </p>
        </div>

        <div className="guardrail-grid">
          {guardrails.map((item) => (
            <article className="guardrail-card" key={item.index}>
              <span className="guardrail-index">{item.index}</span>
              <h3>
                {item.titleZh}
                <span lang="en">{item.titleEn}</span>
              </h3>
              <p>
                {item.copyZh}
                <span lang="en">{item.copyEn}</span>
              </p>
            </article>
          ))}
        </div>

        <div className="boundary-note">
          <span className="boundary-icon" aria-hidden="true">↳</span>
          <p>
            <strong>明确不支持：</strong>客户端指定任意 URL、API 入口返回
            HTML/JS/SVG、跨策略重定向、WebSocket、CONNECT、上传文件。
            静态镜像会移除脚本、表单、Cookie 与外部资源。
            完整网页兼容属于独立的 Browser Relay 架构，不在当前版本内。
            <span lang="en">
              <strong>Explicitly unsupported:</strong> arbitrary client URLs,
              HTML/JS/SVG on the API endpoint, out-of-policy redirects,
              WebSocket, CONNECT, and file uploads. The static mirror removes
              scripts, forms, cookies, and external resources. Full web
              compatibility belongs to a separate Browser Relay architecture,
              not this release.
            </span>
          </p>
        </div>
      </section>

      <section className="setup-section" id="setup">
        <div className="section-shell setup-inner">
          <div className="section-intro">
            <p className="section-kicker">RUNTIME SETUP · 运行时配置</p>
            <h2>
              五步完成配置
              <span lang="en">Configure in five steps.</span>
            </h2>
            <p>
              密钥只写入 Sites 的运行时变量。本地开发使用未提交的
              <code>.env.local</code>。
              <span lang="en">
                Put secrets only in Sites runtime values. For local
                development, use an uncommitted <code>.env.local</code>.
              </span>
            </p>
          </div>

          <ol className="setup-list">
            {setupSteps.map((step, index) => (
              <li key={step.variable}>
                <span className="step-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>
                    {step.titleZh}
                    <span lang="en">{step.titleEn}</span>
                  </h3>
                  <code>{step.variable}</code>
                  <p>
                    {step.copyZh}
                    <span lang="en">{step.copyEn}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="site-footer section-shell">
        <div>
          <span className="brand-mark" aria-hidden="true">SR</span>
          <p>
            Sites Relay
            <span>受限 API 中继与静态网页镜像 / API relay + static web mirror</span>
          </p>
        </div>
        <p>
          部署成功只代表站点可访问，不代表上游已验证。
          <span lang="en">
            A successful deployment does not mean the upstream has been
            verified.
          </span>
        </p>
        <a href="/api/health">
          /api/health <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}

function getStateCopy(state: "ready" | "setup_required" | "invalid") {
  if (state === "ready") {
    return {
      en: "Configured",
      noteEn:
        "Runtime values are present. Upstream reachability is not verified yet.",
      noteZh: "运行时配置已就绪，但尚未验证上游连通性。",
      zh: "已配置",
    };
  }
  if (state === "invalid") {
    return {
      en: "Invalid config",
      noteEn:
        "One or more runtime values are invalid. The proxy is failing closed.",
      noteZh: "运行时配置有误；代理已按安全策略停止转发。",
      zh: "配置有误",
    };
  }
  return {
    en: "Setup required",
    noteEn:
      "This build has no complete upstream configuration. Requests return 503.",
    noteZh: "此版本尚未完成上游配置；代理请求会返回 503。",
    zh: "等待配置",
  };
}
