import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const proxyEnvKeys = [
  "PROXY_ACCESS_TOKEN",
  "PROXY_ALLOWED_ORIGINS",
  "PROXY_ALLOWED_QUERY_KEYS",
  "PROXY_ALLOWED_ROUTES",
  "PROXY_UPSTREAM_AUTHORIZATION",
  "PROXY_UPSTREAM_ORIGIN",
  "WEB_RELAY_ALLOWED_PATH_PREFIXES",
  "WEB_RELAY_ALLOWED_QUERY_KEYS",
  "WEB_RELAY_ENABLED",
];

const readyEnv = {
  PROXY_ACCESS_TOKEN: "sR7pQ2mX9vK4nD8cL1aF6wY3tB5hJ0uE",
  PROXY_ALLOWED_ROUTES:
    "GET:/v1/models,GET:/v1/responses,POST:/v1/responses",
  PROXY_UPSTREAM_AUTHORIZATION: "Bearer upstream-secret",
  PROXY_UPSTREAM_ORIGIN: "https://api.example.com",
};

const webReadyEnv = {
  ...readyEnv,
  WEB_RELAY_ALLOWED_PATH_PREFIXES: "/",
  WEB_RELAY_ALLOWED_QUERY_KEYS: "v",
  WEB_RELAY_ENABLED: "true",
};

const workerBindings = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

async function request(path = "/", init, env = {}) {
  const headers = new Headers(init?.headers);
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", "localhost");
  }
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", "http");
  }

  return withProxyEnv(env, () =>
    worker.fetch(
      new Request(`http://localhost${path}`, { ...init, headers }),
      workerBindings,
      executionContext,
    ),
  );
}

async function withProxyEnv(values, run) {
  const previous = new Map(
    proxyEnvKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of proxyEnvKeys) delete process.env[key];
  Object.assign(process.env, values);

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function assertLocalMarkdownLinksExist(relativePath, markdown) {
  const documentUrl = new URL(relativePath, templateRoot);
  const checks = [];

  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    if (
      href.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(href)
    ) {
      continue;
    }

    const target = href.split("#", 1)[0];
    if (target) checks.push(access(new URL(target, documentUrl)));
  }

  await Promise.all(checks);
}

// Load the optional web route before tests replace global fetch.
await request("/web", undefined, readyEnv);

test("server-renders the finished bilingual product page", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>Sites Relay · API 中继与静态网页镜像<\/title>/,
  );
  assert.match(html, /把一个受控上游/);
  assert.match(html, /Connect one controlled upstream through Sites/);
  assert.match(html, /STATIC WEB RELAY/);
  assert.match(html, /网页镜像/);
  assert.match(html, /WEB_RELAY_\*/);
  assert.match(html, /等待配置/);
  assert.match(html, /Setup required/);
  assert.match(html, /\/api\/proxy\/\*/);
  assert.match(
    html,
    /property="og:image" content="http:\/\/localhost\/og\.png"/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("reports setup-required state without exposing runtime secrets", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 503);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);

  const payload = await response.json();
  assert.equal(payload.status, "setup_required");
  assert.equal(payload.reachability, "not_checked");
  assert.deepEqual(payload.supportedMethods, ["GET", "HEAD", "POST"]);
  assert.equal(payload.preflightMethod, "OPTIONS");
  assert.equal(payload.maxRequestBodyBytes, 1_048_576);
  assert.equal(payload.maxJsonResponseBytes, 8_388_608);
  assert.equal(payload.maxEventStreamResponseBytes, 67_108_864);
  assert.equal(payload.upstreamConnectTimeoutMs, 15_000);
  assert.equal(payload.maxWebDocumentBytes, 4_194_304);
  assert.equal(payload.maxWebAssetBytes, 20_971_520);
  assert.equal(payload.webRelay.enabled, false);
  assert.deepEqual(payload.webRelay.supportedMethods, ["GET", "HEAD"]);
  assert.equal(JSON.stringify(payload).includes("upstream-secret"), false);
});

test("fails closed until all proxy runtime values are present", async () => {
  const response = await request("/api/proxy/v1/models", {
    headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "proxy_not_configured",
    message: "Proxy runtime values are not configured.",
  });
});

test("reports a statically valid configuration without claiming reachability", async () => {
  const response = await request("/api/health", undefined, readyEnv);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ready");
  assert.equal(payload.upstreamHost, "api.example.com");
  assert.equal(payload.accessTokenConfigured, true);
  assert.equal(payload.allowedRouteCount, 3);
  assert.equal(payload.reachability, "not_checked");
  assert.equal(payload.webRelay.enabled, false);

  const webResponse = await request("/api/health", undefined, webReadyEnv);
  const webPayload = await webResponse.json();
  assert.equal(webResponse.status, 200);
  assert.equal(webPayload.webRelay.enabled, true);
  assert.equal(webPayload.webRelay.allowedPathCount, 1);
});

test("does not echo invalid runtime values from the health endpoint", async () => {
  const response = await request("/api/health", undefined, {
    ...readyEnv,
    PROXY_ALLOWED_ORIGINS:
      "https://user:demo-secret@example.com/not-an-origin",
  });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(body).status, "invalid");
  assert.doesNotMatch(body, /demo-secret|user:/);
  assert.match(body, /PROXY_ALLOWED_ORIGINS/);
});

test("rejects placeholder secrets and unsafe runtime values", async () => {
  const cases = [
    {
      PROXY_ACCESS_TOKEN: "replace-with-a-long-random-token",
    },
    {
      PROXY_UPSTREAM_ORIGIN: "https://api.example.com.",
    },
    {
      PROXY_UPSTREAM_AUTHORIZATION: "Bearer private-secret-雪",
    },
    {
      PROXY_ALLOWED_ORIGINS: "http://client.example",
    },
  ];

  for (const override of cases) {
    const response = await request("/api/health", undefined, {
      ...readyEnv,
      ...override,
    });
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(body).status, "invalid");
    assert.doesNotMatch(
      body,
      /replace-with-a-long-random-token|private-secret|client\.example|api\.example\.com\./,
    );
  }
});

test("authenticates before applying route policy and rejects encoded paths", async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ ok: true });
  };

  try {
    const unauthorized = await request(
      "/api/proxy/admin",
      { headers: { "x-proxy-token": "wrong-token" } },
      readyEnv,
    );
    assert.equal(unauthorized.status, 401);

    const forbidden = await request(
      "/api/proxy/admin",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(forbidden.status, 403);

    const encodedSlash = await request(
      "/api/proxy/v1%2Fmodels",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(encodedSlash.status, 400);

    const doubleEncodedDotSegment = await request(
      "/api/proxy/v1/%252e%252e/admin",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(doubleEncodedDotSegment.status, 400);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("binds methods to paths and denies query parameters by default", async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ ok: true });
  };

  try {
    const wrongMethod = await request(
      "/api/proxy/v1/models",
      {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN,
        },
        method: "POST",
      },
      readyEnv,
    );
    assert.equal(wrongMethod.status, 403);

    const blockedQuery = await request(
      "/api/proxy/v1/models?mode=fast",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(blockedQuery.status, 403);
    assert.equal((await blockedQuery.json()).error, "query_not_allowed");

    const allowed = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true });
    assert.equal(upstreamCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rebuilds upstream headers, injects server auth, and preserves JSON", async () => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const upstreamRequest = new Request(input, init);
    captured = {
      body: await upstreamRequest.text(),
      headers: Object.fromEntries(upstreamRequest.headers),
      method: upstreamRequest.method,
      url: upstreamRequest.url,
    };

    return new Response('{"ok":true}', {
      headers: {
        "access-control-allow-origin": "*",
        "content-type": "application/json; charset=utf-8",
        "openai-request-id": "req_test",
        "set-cookie": "session=should-not-pass",
        "x-powered-by": "upstream",
      },
      status: 201,
    });
  };

  try {
    const response = await request(
      "/api/proxy/v1/responses?mode=fast",
      {
        body: '{"input":"hello"}',
        headers: {
          Authorization: "Bearer client-secret",
          "CF-Connecting-IP": "203.0.113.1",
          "Content-Type": "application/json",
          Cookie: "private=value",
          "Idempotency-Key": "request_123",
          Origin: "http://localhost",
          "oai-authenticated-user-email": "person@example.com",
          "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN,
        },
        method: "POST",
      },
      {
        ...readyEnv,
        PROXY_ALLOWED_QUERY_KEYS: "mode",
      },
    );

    assert.equal(response.status, 201);
    assert.equal(captured.url, "https://api.example.com/v1/responses?mode=fast");
    assert.equal(captured.method, "POST");
    assert.equal(captured.body, '{"input":"hello"}');
    assert.equal(captured.headers.authorization, "Bearer upstream-secret");
    assert.equal(captured.headers["idempotency-key"], "request_123");
    assert.equal(captured.headers.cookie, undefined);
    assert.equal(captured.headers["cf-connecting-ip"], undefined);
    assert.equal(captured.headers["oai-authenticated-user-email"], undefined);

    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost",
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("openai-request-id"), "req_test");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stops streaming request bodies after the 1 MiB limit", async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ ok: true });
  };

  try {
    let chunkIndex = 0;
    const oversizedBody = new ReadableStream({
      pull(controller) {
        if (chunkIndex >= 2) {
          controller.close();
          return;
        }
        chunkIndex += 1;
        controller.enqueue(new Uint8Array(600_000).fill(0x20));
      },
    });
    const response = await request(
      "/api/proxy/v1/responses",
      {
        body: oversizedBody,
        duplex: "half",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN,
        },
        method: "POST",
      },
      readyEnv,
    );

    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, "payload_too_large");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an empty POST body", async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({ ok: true });
  };

  try {
    const response = await request(
      "/api/proxy/v1/responses",
      {
        body: "",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN,
        },
        method: "POST",
      },
      readyEnv,
    );

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "empty_request_body");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streams SSE without waiting for the upstream stream to close", async () => {
  let upstreamController;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          upstreamController = controller;
          controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        },
      }),
      {
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      },
    );

  try {
    const response = await request(
      "/api/proxy/v1/responses",
      {
        headers: {
          Accept: "text/event-stream",
          "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN,
        },
      },
      readyEnv,
    );
    assert.equal(response.status, 200);

    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), "data: first\n\n");
    assert.equal(first.done, false);

    upstreamController.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    upstreamController.close();
    const second = await reader.read();
    assert.equal(new TextDecoder().decode(second.value), "data: [DONE]\n\n");
    assert.equal((await reader.read()).done, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects redirects and active upstream content", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(null, {
        headers: { location: "https://other.example/path" },
        status: 302,
      });
    const redirect = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(redirect.status, 502);
    assert.equal((await redirect.json()).error, "upstream_redirect_blocked");

    globalThis.fetch = async () =>
      new Response("<script>alert(1)</script>", {
        headers: {
          "content-type": "text/html",
          "set-cookie": "session=unsafe",
        },
      });
    const html = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(html.status, 502);
    assert.equal(
      (await html.json()).error,
      "unsupported_upstream_content_type",
    );
    assert.equal(html.headers.get("set-cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects upstream responses with an oversized declared length", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{"ok":true}', {
      headers: {
        "content-length": "8388609",
        "content-type": "application/json",
      },
    });

  try {
    const response = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(response.status, 502);
    assert.equal(
      (await response.json()).error,
      "upstream_response_too_large",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("terminates a streamed JSON response that crosses the byte limit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(5_000_000));
          controller.enqueue(new Uint8Array(4_000_000));
          controller.close();
        },
      }),
      {
        headers: { "content-type": "application/json" },
      },
    );

  try {
    const response = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(response.status, 200);
    await assert.rejects(
      response.arrayBuffer(),
      /upstream response exceeded the relay byte limit/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces upstream connection and streamed-response timeouts", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) =>
    originalSetTimeout(
      callback,
      delay === 15_000 || delay === 60_000 ? 5 : delay,
      ...args,
    );

  try {
    globalThis.fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    const connectionTimeout = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(connectionTimeout.status, 504);
    assert.equal(
      (await connectionTimeout.json()).error,
      "upstream_timeout",
    );

    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"partial":'));
          },
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    const responseTimeout = await request(
      "/api/proxy/v1/models",
      { headers: { "x-proxy-token": readyEnv.PROXY_ACCESS_TOKEN } },
      readyEnv,
    );
    assert.equal(responseTimeout.status, 200);
    await assert.rejects(
      responseTimeout.text(),
      /upstream response exceeded the relay time limit/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("answers exact-origin CORS preflight locally", async () => {
  const response = await request(
    "/api/proxy/v1/responses",
    {
      headers: {
        Origin: "https://client.example",
        "Access-Control-Request-Headers": "content-type, x-proxy-token",
        "Access-Control-Request-Method": "POST",
      },
      method: "OPTIONS",
    },
    {
      ...readyEnv,
      PROXY_ALLOWED_ORIGINS: "https://client.example",
    },
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://client.example",
  );
  assert.match(
    response.headers.get("access-control-allow-methods") ?? "",
    /POST.*OPTIONS/,
  );
  assert.match(response.headers.get("vary") ?? "", /Origin/);
});

test("mirrors and sanitizes HTML from the single configured upstream", async () => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    captured = { init, input };
    return new Response(
      `<!doctype html>
      <html><head>
        <base href="https://evil.example/">
        <script src="/assets/app.js"></script>
        <style>body{background:url('/assets/bg.png')}</style>
        <link rel="stylesheet" href="/assets/site.css?v=1">
        <link rel="preconnect" href="https://evil.example">
        <meta http-equiv="refresh" content="0;url=https://evil.example">
      </head><body onload="steal()" style="color:red">
        <a href="/docs/page">Docs</a>
        <a href="https://evil.example/path">External</a>
        <img src="/assets/logo.png" srcset="/assets/logo@2x.png 2x"
          lowsrc="/signout-with-chatgpt" dynsrc="/signout-with-chatgpt">
        <img src="https://evil.example/tracker.png">
        <table background="/signout-with-chatgpt"><tr><td>Unsafe</td></tr></table>
        <form action="/submit"><input name="secret"></form>
        <iframe src="/private"></iframe>
        <applet codebase="/signout-with-chatgpt"></applet>
        <svg><script>alert(1)</script></svg>
      </body></html>`,
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      },
    );
  };

  try {
    const response = await request(
      "/web/docs/index.html?v=2",
      {
        headers: {
          Authorization: "Bearer browser-secret",
          Cookie: "browser=secret",
          Origin: "https://client.example",
          Referer: "https://client.example/private",
          "oai-authenticated-user-email": "person@example.com",
        },
      },
      webReadyEnv,
    );
    const html = await response.text();

    assert.equal(response.status, 200, html);
    assert.equal(
      String(captured.input),
      "https://api.example.com/docs/index.html?v=2",
    );
    assert.equal(captured.init.method, "GET");
    assert.equal(
      captured.init.headers.get("authorization"),
      "Bearer upstream-secret",
    );
    assert.equal(captured.init.headers.get("cookie"), null);
    assert.equal(captured.init.headers.get("origin"), null);
    assert.equal(captured.init.headers.get("referer"), null);
    assert.equal(
      captured.init.headers.get("oai-authenticated-user-email"),
      null,
    );
    assert.equal(captured.init.headers.get("x-sites-relay-hop"), "1");

    assert.match(html, /href="\/web\/assets\/site\.css\?v=1"/);
    assert.match(html, /href="\/web\/docs\/page"/);
    assert.match(html, /src="\/web\/assets\/logo\.png"/);
    assert.doesNotMatch(
      html,
      /<script|<style|<base|<form|<input|<iframe|<applet|<svg|onload=|style=|srcset=|lowsrc=|dynsrc=|background=|evil\.example|signout-with-chatgpt/i,
    );
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-web-mirror"), "static");
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /script-src 'none'; style-src http:\/\/localhost\/web\/; img-src http:\/\/localhost\/web\/; font-src http:\/\/localhost\/web\/;.*sandbox allow-same-origin/,
    );
    assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rewrites safe CSS resources and removes active or external references", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(
      `.hero{background:url("../img/bg.png")}
       .bad{background:url("https://evil.example/tracker.png")}
       .inline{background:url("data:image/png;base64,AAAA")}
       .legacy{behavior:url("/assets/legacy.htc")}
       @import "/assets/theme.css?v=1";
       @import "https://evil.example/theme.css";
       /*# sourceMappingURL=site.css.map */`,
      {
        headers: { "content-type": "text/css; charset=utf-8" },
      },
    );
  };

  try {
    const response = await request(
      "/web/assets/site.css",
      undefined,
      webReadyEnv,
    );
    const css = await response.text();

    assert.equal(response.status, 200);
    assert.equal(fetchCalled, true);
    assert.match(css, /url\("\/web\/img\/bg\.png"\)/);
    assert.match(css, /@import "\/web\/assets\/theme\.css\?v=1"/);
    assert.doesNotMatch(
      css,
      /evil\.example|data:image|behavior|sourceMappingURL/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects disguised CSS fetches and removes image-set string URLs", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const css of [
      String.raw`.unsafe{background:u\72l(/signout-with-chatgpt)}`,
      String.raw`@im\70ort "/signout-with-chatgpt";`,
    ]) {
      globalThis.fetch = async () =>
        new Response(css, {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      const response = await request(
        "/web/assets/site.css",
        undefined,
        webReadyEnv,
      );
      assert.equal(response.status, 502);
      assert.equal(
        (await response.json()).error,
        "upstream_transform_failed",
      );
    }

    globalThis.fetch = async () =>
      new Response(
        `.unsafe{background:image-set("/signout-with-chatgpt" 1x)}
         .legacy{background:-webkit-image-set("/signout-with-chatgpt" 1x)}
         .future-url{background:src("/signout-with-chatgpt")}
         .future-image{background:image("/signout-with-chatgpt")}
         .safe{color:green}`,
        {
          headers: { "content-type": "text/css; charset=utf-8" },
        },
      );
    const response = await request(
      "/web/assets/site.css",
      undefined,
      webReadyEnv,
    );
    const css = await response.text();
    assert.equal(response.status, 200);
    assert.match(css, /\.safe\{color:green\}/);
    assert.doesNotMatch(
      css,
      /image-set|background:src|background:image|signout-with-chatgpt/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enforces static mirror response metadata, size, and time limits", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  try {
    let capturedMethod;
    globalThis.fetch = async (_input, init) => {
      capturedMethod = init.method;
      return new Response(null, {
        headers: { "content-type": "image/png" },
      });
    };
    const head = await request(
      "/web/assets/logo.png",
      { method: "HEAD" },
      webReadyEnv,
    );
    assert.equal(head.status, 200);
    assert.equal(capturedMethod, "HEAD");
    assert.equal(await head.text(), "");

    globalThis.fetch = async () =>
      new Response("<p>compressed</p>", {
        headers: {
          "content-encoding": "gzip",
          "content-type": "text/html; charset=utf-8",
        },
      });
    const compressed = await request(
      "/web/docs",
      undefined,
      webReadyEnv,
    );
    assert.equal(compressed.status, 502);
    assert.equal(
      (await compressed.json()).error,
      "unsupported_upstream_encoding",
    );

    globalThis.fetch = async () =>
      new Response("<p>legacy charset</p>", {
        headers: { "content-type": "text/html; charset=iso-8859-1" },
      });
    const charset = await request("/web/docs", undefined, webReadyEnv);
    assert.equal(charset.status, 502);
    assert.equal(
      (await charset.json()).error,
      "unsupported_upstream_content_type",
    );

    globalThis.fetch = async () =>
      new Response("large", {
        headers: {
          "content-length": "4194305",
          "content-type": "text/html; charset=utf-8",
        },
      });
    const declaredLarge = await request(
      "/web/docs",
      undefined,
      webReadyEnv,
    );
    assert.equal(declaredLarge.status, 502);
    assert.equal(
      (await declaredLarge.json()).error,
      "upstream_response_too_large",
    );

    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20_000_000));
            controller.enqueue(new Uint8Array(2_000_000));
            controller.close();
          },
        }),
        { headers: { "content-type": "image/png" } },
      );
    const streamedLarge = await request(
      "/web/assets/logo.png",
      undefined,
      webReadyEnv,
    );
    assert.equal(streamedLarge.status, 200);
    await assert.rejects(
      streamedLarge.arrayBuffer(),
      /upstream response exceeded the relay byte limit/i,
    );

    globalThis.setTimeout = (callback, delay, ...args) =>
      originalSetTimeout(
        callback,
        delay === 60_000 ? 5 : delay,
        ...args,
      );
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("<p>partial"));
          },
        }),
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    const timedOut = await request("/web/docs", undefined, webReadyEnv);
    assert.equal(timedOut.status, 504);
    assert.equal(
      (await timedOut.json()).error,
      "upstream_response_timeout",
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("fails closed for disabled, out-of-policy, encoded, and non-GET web requests", async () => {
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("<p>ok</p>", {
      headers: { "content-type": "text/html" },
    });
  };

  try {
    const disabled = await request("/web", undefined, readyEnv);
    assert.equal(disabled.status, 503);
    assert.equal((await disabled.json()).error, "web_relay_disabled");

    const enabledWithoutPaths = await request("/api/health", undefined, {
      ...readyEnv,
      WEB_RELAY_ENABLED: "true",
    });
    assert.equal(enabledWithoutPaths.status, 503);
    assert.equal((await enabledWithoutPaths.json()).status, "invalid");

    const restrictedEnv = {
      ...webReadyEnv,
      WEB_RELAY_ALLOWED_PATH_PREFIXES: "/docs",
    };
    const wrongBoundary = await request(
      "/web/docs-private",
      undefined,
      restrictedEnv,
    );
    assert.equal(wrongBoundary.status, 403);

    const deniedQuery = await request(
      "/web/docs?target=https%3A%2F%2Fevil.example",
      undefined,
      restrictedEnv,
    );
    assert.equal(deniedQuery.status, 403);

    const encoded = await request(
      "/web/docs/%252e%252e/private",
      undefined,
      restrictedEnv,
    );
    assert.equal(encoded.status, 400);

    const loop = await request(
      "/web/docs",
      { headers: { "x-sites-relay-hop": "1" } },
      restrictedEnv,
    );
    assert.equal(loop.status, 508);

    const options = await request(
      "/web/docs",
      { method: "OPTIONS" },
      restrictedEnv,
    );
    assert.equal(options.status, 405);
    assert.equal(options.headers.get("allow"), "GET, HEAD");

    const post = await request(
      "/web/docs",
      { body: "x", method: "POST" },
      restrictedEnv,
    );
    assert.equal(post.status, 405);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allows only safe web assets and same-policy redirects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("alert(1)", {
        headers: { "content-type": "application/javascript" },
      });
    const script = await request(
      "/web/assets/app.js",
      undefined,
      webReadyEnv,
    );
    assert.equal(script.status, 502);
    assert.equal(
      (await script.json()).error,
      "unsupported_upstream_content_type",
    );

    globalThis.fetch = async () =>
      new Response(null, {
        headers: { location: "https://evil.example/path" },
        status: 302,
      });
    const externalRedirect = await request(
      "/web/docs",
      undefined,
      webReadyEnv,
    );
    assert.equal(externalRedirect.status, 502);

    globalThis.fetch = async () =>
      new Response(null, {
        headers: { location: "/docs/page?v=1" },
        status: 302,
      });
    const safeRedirect = await request(
      "/web/docs",
      undefined,
      webReadyEnv,
    );
    assert.equal(safeRedirect.status, 302);
    assert.equal(safeRedirect.headers.get("location"), "/web/docs/page?v=1");

    globalThis.fetch = async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      });
    const image = await request(
      "/web/assets/logo.png",
      undefined,
      webReadyEnv,
    );
    assert.equal(image.status, 200);
    assert.deepEqual(
      [...new Uint8Array(await image.arrayBuffer())],
      [137, 80, 78, 71],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("removes the disposable starter surface and keeps project metadata", async () => {
  const [
    page,
    layout,
    packageJson,
    readme,
    readmeZh,
    contributing,
    contributingZh,
    staticWebMirror,
    staticWebMirrorZh,
    webCompatibilityDirection,
    webCompatibilityDirectionZh,
    agents,
    hosting,
    envExample,
    repositorySkill,
    skillMetadata,
  ] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/README.zh-CN.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/CONTRIBUTING.md", import.meta.url), "utf8"),
    readFile(
      new URL("../docs/CONTRIBUTING.zh-CN.md", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../docs/static-web-mirror.md", import.meta.url), "utf8"),
    readFile(
      new URL("../docs/static-web-mirror.zh-CN.md", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../docs/web-compatibility-direction.md", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../docs/web-compatibility-direction.zh-CN.md",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../.agents/skills/operate-sites-relay/SKILL.md",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../.agents/skills/operate-sites-relay/agents/openai.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);
  assert.doesNotMatch(layout, /Starter Project|favicon\.svg/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"name": "sites-relay"/);
  assert.match(readme, /Sites Relay/);
  assert.match(readme, /## Security boundaries/);
  assert.match(
    readme,
    /English \| \[Chinese\]\(\.\/docs\/README\.zh-CN\.md\)/,
  );
  assert.doesNotMatch(readme, /\[English\]\(/);
  assert.match(readme, /!\[Sites Relay [^\]]+\]\(\.\/public\/og\.png\)/);
  assert.match(
    readme,
    /\[`docs\/CONTRIBUTING\.md`\]\(\.\/docs\/CONTRIBUTING\.md\)/,
  );
  assert.match(
    readme,
    /\[`docs\/web-compatibility-direction\.md`\]\(\.\/docs\/web-compatibility-direction\.md\)/,
  );
  assert.match(
    readme,
    /\[`docs\/static-web-mirror\.md`\]\(\.\/docs\/static-web-mirror\.md\)/,
  );
  assert.doesNotMatch(readme, /[\u3400-\u9fff]/);
  assert.match(readmeZh, /## 安全边界/);
  assert.match(readmeZh, /\[英文\]\(\.\.\/README\.md\) \| 简体中文/);
  assert.doesNotMatch(readmeZh, /\[简体中文\]\(/);
  assert.match(readmeZh, /!\[Sites Relay[^\]]+\]\(\.\.\/public\/og\.png\)/);
  assert.match(
    readmeZh,
    /\[`static-web-mirror\.zh-CN\.md`\]\(\.\/static-web-mirror\.zh-CN\.md\)/,
  );
  assert.match(contributing, /Conventional Commits 1\.0\.0/);
  assert.match(contributing, /BREAKING CHANGE:/);
  assert.match(contributing, /general-purpose HTTP forward proxying, SOCKS/);
  assert.match(
    contributing,
    /English \| \[Chinese\]\(\.\/CONTRIBUTING\.zh-CN\.md\)/,
  );
  assert.doesNotMatch(contributing, /\[English\]\(/);
  assert.doesNotMatch(contributing, /[\u3400-\u9fff]/);
  assert.match(contributingZh, /## 项目边界/);
  assert.match(contributingZh, /Conventional Commits 1\.0\.0/);
  assert.match(
    contributingZh,
    /\[英文\]\(\.\/CONTRIBUTING\.md\) \| 简体中文/,
  );
  assert.doesNotMatch(contributingZh, /\[简体中文\]\(/);
  assert.match(staticWebMirror, /disabled by default/);
  assert.match(staticWebMirror, /WEB_RELAY_ALLOWED_PATH_PREFIXES/);
  assert.match(
    staticWebMirror,
    /English \| \[Chinese\]\(\.\/static-web-mirror\.zh-CN\.md\)/,
  );
  assert.doesNotMatch(staticWebMirror, /\[English\]\(/);
  assert.doesNotMatch(staticWebMirror, /[\u3400-\u9fff]/);
  assert.match(staticWebMirrorZh, /# 静态网页镜像/);
  assert.match(staticWebMirrorZh, /WEB_RELAY_ALLOWED_PATH_PREFIXES/);
  assert.match(
    staticWebMirrorZh,
    /\[英文\]\(\.\/static-web-mirror\.md\) \| 简体中文/,
  );
  assert.doesNotMatch(staticWebMirrorZh, /\[简体中文\]\(/);
  assert.match(
    webCompatibilityDirection,
    /Status: Architecture proposal, not implemented/,
  );
  assert.match(
    webCompatibilityDirection,
    /deployed separately from Sites Relay/,
  );
  assert.match(
    webCompatibilityDirection,
    /English \| \[Chinese\]\(\.\/web-compatibility-direction\.zh-CN\.md\)/,
  );
  assert.doesNotMatch(webCompatibilityDirection, /\[English\]\(/);
  assert.doesNotMatch(
    webCompatibilityDirection,
    /[\u3400-\u9fff]/,
  );
  assert.match(
    webCompatibilityDirectionZh,
    /状态：架构提案，尚未实现/,
  );
  assert.match(
    webCompatibilityDirectionZh,
    /\[英文\]\(\.\/web-compatibility-direction\.md\) \| 简体中文/,
  );
  assert.doesNotMatch(webCompatibilityDirectionZh, /\[简体中文\]\(/);
  assert.match(envExample, /PROXY_ALLOWED_ROUTES=/);
  assert.match(envExample, /WEB_RELAY_ENABLED=false/);
  assert.match(envExample, /WEB_RELAY_ALLOWED_PATH_PREFIXES=/);
  assert.doesNotMatch(envExample, /PROXY_ALLOWED_PATH_PREFIXES|replace-with/);
  assert.match(agents, /Use npm and preserve `package-lock\.json`/);
  assert.match(agents, /docs\/static-web-mirror\.md/);
  assert.doesNotMatch(agents, /[^\x00-\x7f]/);
  assert.match(repositorySkill, /name: operate-sites-relay/);
  assert.match(repositorySkill, /## Deploy to Sites/);
  assert.doesNotMatch(repositorySkill, /[^\x00-\x7f]/);
  assert.match(skillMetadata, /\$operate-sites-relay/);
  assert.doesNotMatch(skillMetadata, /[^\x00-\x7f]/);
  await Promise.all([
    assertLocalMarkdownLinksExist("README.md", readme),
    assertLocalMarkdownLinksExist("docs/README.zh-CN.md", readmeZh),
    assertLocalMarkdownLinksExist("docs/CONTRIBUTING.md", contributing),
    assertLocalMarkdownLinksExist(
      "docs/CONTRIBUTING.zh-CN.md",
      contributingZh,
    ),
    assertLocalMarkdownLinksExist(
      "docs/static-web-mirror.md",
      staticWebMirror,
    ),
    assertLocalMarkdownLinksExist(
      "docs/static-web-mirror.zh-CN.md",
      staticWebMirrorZh,
    ),
    assertLocalMarkdownLinksExist(
      "docs/web-compatibility-direction.md",
      webCompatibilityDirection,
    ),
    assertLocalMarkdownLinksExist(
      "docs/web-compatibility-direction.zh-CN.md",
      webCompatibilityDirectionZh,
    ),
  ]);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, null);
  assert.equal(hostingConfig.r2, null);
  if ("project_id" in hostingConfig) {
    assert.equal(typeof hostingConfig.project_id, "string");
    assert.ok(hostingConfig.project_id.length > 0);
  }
  await assert.rejects(access(new URL("app/_sites-preview", templateRoot)));
  await assert.rejects(access(new URL("README.zh-CN.md", templateRoot)));
  await assert.rejects(access(new URL("CONTRIBUTING.md", templateRoot)));
  await assert.rejects(access(new URL("CONTRIBUTING.zh-CN.md", templateRoot)));
  await access(new URL("public/og.png", templateRoot));
});
