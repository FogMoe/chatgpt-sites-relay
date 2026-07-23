import {
  getProxyPublicStatus,
  MAX_REQUEST_BODY_BYTES,
  PROXY_METHODS,
} from "@/lib/proxy-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const repositoryUrl = "https://github.com/FogMoe/chatgpt-sites-relay";

const useCases = [
  {
    index: "01",
    titleZh: "流式 AI 应用",
    titleEn: "Streaming AI apps",
    copyZh:
      "把 OpenAI 兼容或其他固定 JSON/SSE AI 接口接入 Sites，同时把上游凭据留在服务端。",
    copyEn:
      "Connect an OpenAI-compatible or other fixed JSON/SSE AI API while keeping upstream credentials server-side.",
  },
  {
    index: "02",
    titleZh: "私有业务 API",
    titleEn: "Private application APIs",
    copyZh:
      "让仪表盘、内部工具和轻量应用访问经过方法、路径与查询策略批准的后端能力。",
    copyEn:
      "Give dashboards, internal tools, and lightweight apps access to approved backend methods, paths, and queries.",
  },
  {
    index: "03",
    titleZh: "只读内容镜像",
    titleEn: "Read-only content mirrors",
    copyZh:
      "向指定 ChatGPT 用户提供经过净化、适合静态阅读的文档或状态页。",
    copyEn:
      "Share sanitized documentation or status pages as static content with named ChatGPT users.",
  },
] as const;

const guardrails = [
  {
    index: "01",
    titleZh: "固定上游",
    titleEn: "Fixed upstream",
    copyZh: "Sites 运行时配置定义唯一目标，所有请求沿同一受控路径转发。",
    copyEn:
      "Sites runtime values define one destination for every request.",
  },
  {
    index: "02",
    titleZh: "凭据隔离",
    titleEn: "Separated credentials",
    copyZh: "客户端访问方式与上游凭据相互独立，中继在服务端构造上游认证。",
    copyEn:
      "Client access and upstream credentials stay separate, with upstream authentication built server-side.",
  },
  {
    index: "03",
    titleZh: "显式契约",
    titleEn: "Explicit contract",
    copyZh: "显式许可策略控制方法与路径组合、查询参数和转发请求头。",
    copyEn:
      "An explicit allow policy controls method-path pairs, query parameters, and forwarded headers.",
  },
  {
    index: "04",
    titleZh: "安全响应",
    titleEn: "Safe responses",
    copyZh: "API 回传 JSON/SSE；可选网页镜像提供经过净化的静态内容。",
    copyEn:
      "The API returns JSON/SSE; the optional web mirror serves sanitized static content.",
  },
] as const;

const setupSteps = [
  {
    titleZh: "设置固定上游",
    titleEn: "Set the fixed upstream",
    variable: "PROXY_UPSTREAM_ORIGIN",
    copyZh: "填写一个使用 DNS hostname 的规范 HTTPS origin。",
    copyEn:
      "Use a canonical HTTPS origin with a DNS hostname.",
  },
  {
    titleZh: "选择访问模式",
    titleEn: "Choose an access mode",
    variable: "PROXY_AUTH_MODE",
    copyZh:
      "浏览器应用使用 sites-user 与精确邮箱白名单；程序化客户端使用默认 token 模式。",
    copyEn:
      "Use sites-user with an exact email allowlist for browser apps, or the default token mode for programmatic clients.",
  },
  {
    titleZh: "配置访问凭据",
    titleEn: "Configure the access credential",
    variable: "PROXY_ACCESS_TOKEN / PROXY_ALLOWED_USER_EMAILS",
    copyZh:
      "按所选模式配置随机令牌或允许访问的 ChatGPT 用户；两种模式都会在路由策略之前鉴权。",
    copyEn:
      "Configure a random token or the allowed ChatGPT users. Both modes authenticate before route policy is evaluated.",
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
    copyZh: "显式启用后，指定 ChatGPT 用户可以访问同一上游中列入白名单的静态路径。",
    copyEn:
      "When enabled, named ChatGPT users can access allowlisted static paths from the same upstream.",
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

const browserExample = `const response = await fetch("/api/proxy/v1/responses", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "your-model", input: "Hello" }),
});`;

export default function Home() {
  const status = getProxyPublicStatus();
  const stateCopy = getStateCopy(status.state);
  const authCopy = getAuthCopy(status);
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
          <a href="#use-cases">用例 <span lang="en">Use cases</span></a>
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
          <p className="eyebrow">
            POLICY-CONSTRAINED · JSON/SSE + STATIC MIRROR
          </p>
          <h1>
            把一个受控上游，
            <br />
            接入 <em>Sites</em>
          </h1>
          <p className="hero-title-en" lang="en">
            Connect one controlled upstream through Sites.
          </p>
          <p className="hero-description">
            面向 ChatGPT Sites 的策略受限固定上游中继，支持 JSON/SSE
            流式传输，并可选择提供经过净化的静态网页镜像。
            <span lang="en">
              A policy-constrained, fixed-upstream relay for ChatGPT Sites,
              with JSON/SSE streaming and an optional sanitized static web
              mirror.
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
            <a
              className="button button-secondary"
              href={repositoryUrl}
              rel="noreferrer"
              target="_blank"
            >
              GitHub 文档 <span lang="en">GitHub docs</span>
              <span aria-hidden="true">↗</span>
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
                    : "需要配置")}
                <small lang="en">
                  {status.upstreamHost
                    ? "Configured host"
                    : status.upstreamConfigured
                      ? status.state === "ready"
                        ? "Configured"
                        : "Provided"
                      : "Setup required"}
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
                {status.webRelayEnabled ? "已启用" : "可选功能"}
                <small lang="en">
                  {status.webRelayEnabled
                    ? `${status.webRelayPathCount} allowed path ${status.webRelayPathCount === 1 ? "prefix" : "prefixes"} · /web/*`
                    : "Optional · WEB_RELAY_ENABLED"}
                </small>
              </dd>
            </div>
            <div>
              <dt>访问边界 <span lang="en">Access boundary</span></dt>
              <dd>
                {authCopy.zh}
                <small lang="en">{authCopy.en}</small>
              </dd>
            </div>
            <div>
              <dt>连通性 <span lang="en">Reachability</span></dt>
              <dd>
                需要验证
                <small lang="en">Verify with a safe request</small>
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
                    : "需要配置")}
              </strong>
              <small lang="en">
                {status.upstreamHost
                  ? "Upstream"
                  : status.upstreamConfigured
                    ? status.state === "ready"
                      ? "Configured upstream"
                      : "Provided"
                    : "Setup required"}
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

      <section className="use-cases-section section-shell" id="use-cases">
        <div className="section-intro section-intro-wide">
          <p className="section-kicker">BUILT FOR A CLEAR JOB · 明确用途</p>
          <h2>
            一个受控入口，三类实际用例
            <span lang="en">One controlled entry point. Three practical uses.</span>
          </h2>
          <p>
            当一个 Site 连接一个可信上游，并希望保护凭据、明确能力或
            传递流式响应时，Sites Relay 最合适。
            <span lang="en">
              Sites Relay fits when a Site needs one trusted upstream with
              protected credentials, an explicit capability policy, or
              streaming responses.
            </span>
          </p>
        </div>

        <div className="use-case-grid">
          {useCases.map((item) => (
            <article className="use-case-card" key={item.index}>
              <span className="use-case-index">{item.index}</span>
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

        <div className="fit-note">
          <p>
            <strong>适合：</strong>一个固定 HTTPS 上游、JSON/SSE API、精确策略、
            服务端凭据或只读静态内容。
            <span lang="en">
              <strong>Good fit:</strong> one fixed HTTPS upstream, JSON/SSE,
              exact policy, server-side credentials, or read-only static
              content.
            </span>
          </p>
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
            上游；显式列出的查询参数可以继续转发，协议、主机与端口始终由运行时配置控制。
            <span lang="en">
              Allowed routes under <code>/api/proxy/*</code> are appended to
              the configured HTTPS upstream. Explicit query keys can continue
              upstream, while runtime values retain control of the scheme,
              host, and port.
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
              <span>sites-user.ts</span>
              <span className="code-label">SAME ORIGIN</span>
            </div>
            <pre>
              <code>{browserExample}</code>
            </pre>
            <p>
              使用 <code>PROXY_AUTH_MODE=sites-user</code> 时，同源浏览器请求
              通过 ChatGPT 身份与精确邮箱白名单完成鉴权。
              <span lang="en">
                With <code>PROXY_AUTH_MODE=sites-user</code>, same-origin
                browser requests use ChatGPT identity and an exact email
                allowlist for access.
              </span>
            </p>
          </article>
        </div>
      </section>

      <section className="guardrails-section section-shell" id="guardrails">
        <div className="section-intro section-intro-wide">
          <p className="section-kicker">SECURITY BOUNDARY · 安全边界</p>
          <h2>
            清晰边界，稳定中继
            <span lang="en">Clear boundaries for a dependable relay.</span>
          </h2>
          <p>
            API 中继与可选静态镜像共享同一个固定上游，并在应用层提供
            JSON/SSE 与净化静态内容。
            <span lang="en">
              The API relay and optional static mirror share one fixed upstream
              and provide JSON/SSE plus sanitized static content at the
              application layer.
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

      </section>

      <section className="setup-section" id="setup">
        <div className="section-shell setup-inner">
          <div className="section-intro">
            <p className="section-kicker">RUNTIME SETUP · 运行时配置</p>
            <h2>
              六步完成配置
              <span lang="en">Configure in six steps.</span>
            </h2>
            <p>
              密钥保存在 Sites 运行时变量中。本地开发使用仅限本机的
              <code>.env.local</code>。
              <span lang="en">
                Keep secrets in Sites runtime values. For local development,
                use a local-only <code>.env.local</code>.
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
          部署完成后，请通过无副作用请求验证上游连通性。
          <span lang="en">
            After deployment, verify upstream reachability with a
            side-effect-free request.
          </span>
        </p>
        <div className="footer-links">
          <a href="/api/health">
            /api/health <span aria-hidden="true">↗</span>
          </a>
          <a href={repositoryUrl} rel="noreferrer" target="_blank">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </footer>
    </main>
  );
}

function getAuthCopy(
  status: ReturnType<typeof getProxyPublicStatus>,
): { en: string; zh: string } {
  if (status.authMode === "sites-user") {
    return status.proxyUserAllowlistConfigured
      ? { en: "Sites user allowlist", zh: "Sites 用户白名单" }
      : { en: "Sites user setup required", zh: "等待用户白名单" };
  }
  if (status.authMode === "token") {
    return status.accessTokenConfigured
      ? { en: "Proxy token", zh: "代理访问令牌" }
      : { en: "Token setup required", zh: "等待访问令牌" };
  }
  return { en: "Invalid authentication mode", zh: "鉴权模式有误" };
}

function getStateCopy(state: "ready" | "setup_required" | "invalid") {
  if (state === "ready") {
    return {
      en: "Configured",
      noteEn:
        "Runtime values are ready. Verify upstream reachability with a safe request.",
      noteZh: "运行时配置已就绪，请使用安全请求验证上游连通性。",
      zh: "已配置",
    };
  }
  if (state === "invalid") {
    return {
      en: "Invalid config",
      noteEn:
        "Review the runtime values. Forwarding resumes after validation succeeds.",
      noteZh: "请检查运行时变量；验证通过后即可恢复转发。",
      zh: "配置有误",
    };
  }
  return {
    en: "Setup required",
    noteEn:
      "Add the remaining runtime values to activate proxy requests.",
    noteZh: "补全运行时变量即可启用代理请求。",
    zh: "等待配置",
  };
}
