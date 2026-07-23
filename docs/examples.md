# Examples

English | [Chinese](./examples.zh-CN.md)

These examples use placeholder hosts, users, models, and credentials. Configure an upstream you control or trust, keep upstream credentials in Sites runtime values, and start with owner-only access.

## Same-origin Sites application

Use Sites-user mode when browser code in the deployed Site calls the relay. The Sites dispatcher supplies the signed-in identity to server-side code, and the relay checks an exact email allowlist before revealing route policy.

```dotenv
PROXY_UPSTREAM_ORIGIN=https://api.example.com
PROXY_AUTH_MODE=sites-user
PROXY_ALLOWED_USER_EMAILS=owner@example.com
PROXY_ALLOWED_ROUTES=POST:/v1/responses
PROXY_ALLOWED_QUERY_KEYS=
PROXY_UPSTREAM_AUTHORIZATION=Bearer <set-only-in-runtime-values>
```

The browser makes a same-origin request using the signed-in Sites identity:

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

Keep the Site behind Sites access controls. Treat the authenticated-user header as trusted when the request passes through the Sites dispatcher.

## Programmatic JSON/SSE client

Use token mode for server-side scripts, services, and controlled clients.

```dotenv
PROXY_UPSTREAM_ORIGIN=https://api.example.com
PROXY_AUTH_MODE=token
PROXY_ACCESS_TOKEN=<random-base64url-value>
PROXY_ALLOWED_ROUTES=GET:/v1/models,POST:/v1/responses
PROXY_ALLOWED_QUERY_KEYS=
PROXY_UPSTREAM_AUTHORIZATION=Bearer <set-only-in-runtime-values>
```

```bash
curl -N "$SITE_URL/api/proxy/v1/responses" \
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  --data '{"model":"your-model","input":"Hello"}'
```

Keep `PROXY_ACCESS_TOKEN` in server-side scripts, services, or controlled clients. Pair token authentication with Sites access controls, upstream quotas, and rate limits.

## Authenticated static documentation mirror

The optional mirror uses the same fixed upstream and is designed for sanitized static documentation and status content.

```dotenv
WEB_RELAY_ENABLED=true
WEB_RELAY_ALLOWED_USER_EMAILS=owner@example.com
WEB_RELAY_ALLOWED_PATH_PREFIXES=/docs,/status
WEB_RELAY_ALLOWED_QUERY_KEYS=lang,page
```

After deployment, an allowed user can open:

```text
https://<your-site>/web/docs
```

Review the complete [static web mirror contract](./static-web-mirror.md) before enabling it.

## Verify a deployment

1. Open `/api/health` and confirm that `status` is `ready`; this validates configuration only.
2. Make a side-effect-free request to an allowed upstream path.
3. Confirm that a wrong token or unlisted user is rejected before route-policy details.
4. Confirm that an out-of-policy path and query parameter are rejected.
5. For SSE, confirm that the first event arrives before the upstream stream closes.
