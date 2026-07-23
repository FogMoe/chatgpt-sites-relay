# Sites Relay

English | [Chinese](./docs/README.zh-CN.md)

[![CI](https://github.com/FogMoe/chatgpt-sites-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/FogMoe/chatgpt-sites-relay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-f4ba6a.svg)](./LICENSE)

![Sites Relay — constrained relay for ChatGPT Sites](./public/og.png)

Sites Relay is a policy-constrained, fixed-upstream relay for ChatGPT Sites, with JSON/SSE streaming and an optional sanitized static web mirror. Server-side runtime values define every upstream destination.

## Why Sites Relay

ChatGPT Sites can keep runtime secrets on the server, but every application still needs a safe boundary between visitors and its upstream. Sites Relay packages that boundary as a reusable, fail-closed project:

- keep upstream credentials in server-side runtime values
- authenticate with either a proxy token or an exact ChatGPT user allowlist
- permit only configured method-path pairs and query keys
- stream JSON and Server-Sent Events as chunks arrive
- optionally expose sanitized, read-only HTML/CSS/image/font content

Typical uses include streaming AI applications, internal dashboards backed by one private API, and authenticated documentation or status mirrors. Read the [copy-paste examples](./docs/examples.md) and [project roadmap](./docs/roadmap.md).

## When to use it

Use Sites Relay when a Site needs one trusted HTTPS upstream, protected credentials, JSON/SSE streaming, and an explicit server-side policy. A dedicated remote-browser architecture provides authenticated, full browser compatibility.

## Scope

The primary API relay is designed for JSON APIs and Server-Sent Events (SSE), including AI APIs with streaming responses. The upstream origin, client access mode, method-path policy, query policy, and upstream credentials are controlled by server-side runtime values.

The optional static web mirror serves sanitized HTML, rewritten CSS, images, and fonts from the same fixed upstream. Enable it explicitly for `GET` and `HEAD` access to policy-approved static content. See [`docs/static-web-mirror.md`](./docs/static-web-mirror.md) for its complete contract.

The current relay remains fixed-upstream and application-layer only. See [`docs/web-compatibility-direction.md`](./docs/web-compatibility-direction.md) for the separate remote-browser architecture proposed for authenticated, full web compatibility.

## Quick start

Node.js 22.13 or later is required.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Edit `.env.local`, then open `http://localhost:3000`. The runtime panel reports static configuration state; use a side-effect-free relay request to verify upstream reachability.

## Configuration

This is the canonical runtime configuration contract. Store production secrets in Sites runtime values and local secrets in `.env.local`.

| Variable | Required | Description |
| --- | --- | --- |
| `PROXY_UPSTREAM_ORIGIN` | Yes | One HTTPS origin using a DNS hostname; no path, query, non-443 port, IP literal, or embedded credentials. |
| `PROXY_AUTH_MODE` | No | `token` (default) or `sites-user`. Token mode suits programmatic clients; Sites-user mode authenticates signed-in ChatGPT visitors. |
| `PROXY_ACCESS_TOKEN` | In token mode | A random 32–256 character base64url value; clients send it in `x-proxy-token`. |
| `PROXY_ALLOWED_USER_EMAILS` | In Sites-user mode | Exact ChatGPT account emails allowed to use the API relay, comma-separated; matching is case-insensitive. |
| `PROXY_ALLOWED_ROUTES` | Yes | Comma-separated `METHOD:/path` rules, such as `GET:/v1/models,POST:/v1/responses`. Both the method and path prefix must match. |
| `PROXY_ALLOWED_QUERY_KEYS` | No | Exact query parameter names allowed upstream, comma-separated; an empty value creates an empty query-key allowlist. |
| `PROXY_ALLOWED_ORIGINS` | No | Exact HTTPS origins allowed for cross-origin calls; HTTP is limited to loopback development origins, and same-origin requests need no entry. |
| `PROXY_UPSTREAM_AUTHORIZATION` | No | Complete upstream `Authorization` value injected by the server; printable ASCII only, up to 4096 characters. |
| `EXPOSE_UPSTREAM_HOST` | No | Set to `true` to show the exact upstream hostname on the home page and in `/api/health`; defaults to `false`. |
| `WEB_RELAY_ENABLED` | No | Enables the optional static web mirror at `/web/*`; defaults to `false`. |
| `WEB_RELAY_ALLOWED_USER_EMAILS` | When enabled | Comma-separated exact ChatGPT account emails allowed to use the static mirror; matching is case-insensitive. |
| `WEB_RELAY_ALLOWED_PATH_PREFIXES` | When enabled | Comma-separated upstream path prefixes available through the static mirror. |
| `WEB_RELAY_ALLOWED_QUERY_KEYS` | No | Exact query parameter names allowed through the static mirror; an empty value creates an empty query-key allowlist. |

`.env.example` mirrors this contract. Manage production values through Sites runtime values.

## Request contract

The endpoint is `/api/proxy/*`. After the method-path policy passes, the proxy path is appended to the fixed upstream origin; every query parameter must be explicitly allowed. Each request retains the server-configured upstream scheme, host, and port.

In the default `token` mode, clients send `x-proxy-token`. In `sites-user` mode, same-origin browser requests authenticate through the Sites identity and the exact `PROXY_ALLOWED_USER_EMAILS` allowlist. Both modes authenticate before route policy is evaluated.

```bash
curl -N "$SITE_URL/api/proxy/v1/responses" \
  -H "x-proxy-token: $PROXY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"model":"your-model","input":"Hello"}'
```

Request limits:

- Forwarded methods: `GET`, `HEAD`, and `POST`; `OPTIONS` terminates locally as CORS preflight.
- The method and path must match `PROXY_ALLOWED_ROUTES`; query access starts from an empty allowlist.
- `POST` bodies use non-empty, uncompressed UTF-8 JSON up to 1 MiB.
- Forwarded request headers: `Accept`, `Content-Type`, `Last-Event-ID`, and a validated `Idempotency-Key`.
- The relay rebuilds upstream headers from the documented forwarded header set and server-side upstream credentials.
- Upstream responses are limited to `application/json`, `application/*+json`, and `text/event-stream`.
- Upstream 3xx responses terminate with `upstream_redirect_blocked`.
- The upstream connection wait is limited to 15 seconds; JSON is limited to 8 MiB/60 seconds and SSE to 64 MiB/15 minutes.

Response bodies stream as chunks arrive. Byte and time limits bound every streamed response.

## Static web mirror

The optional `/web/*` surface provides authenticated, sanitized static content from the same configured upstream.

Read [`docs/static-web-mirror.md`](./docs/static-web-mirror.md) before enabling it. The mirror combines Sites access control with an exact ChatGPT user email allowlist.

## Status and errors

`GET /api/health` returns a secret-free configuration summary:

- `setup_required`: required runtime values are missing
- `invalid`: values are present but invalid
- `ready`: configuration passed static validation; verify reachability with a live side-effect-free request

`ready` returns HTTP 200; `setup_required` and `invalid` return HTTP 503. `OPTIONS` is reported separately as the local preflight method.

Set `EXPOSE_UPSTREAM_HOST=true` to display the exact upstream hostname; the default public status returns `upstreamHost: null`.

API errors use stable English error codes. Common errors include:

| Status | Code | Meaning |
| --- | --- | --- |
| 503 | `proxy_not_configured` | Required configuration is missing. |
| 503 | `proxy_invalid_config` | Configuration validation failed. |
| 401 | `proxy_unauthorized` | The proxy access token is invalid. |
| 401 | `proxy_authentication_required` | Sites-user mode requires a signed-in ChatGPT visitor. |
| 403 | `proxy_user_not_allowed` | The signed-in ChatGPT visitor is outside the API allowlist. |
| 403 | `origin_not_allowed` | The browser origin is not allowed. |
| 403 | `route_not_allowed` | The method-path pair is outside the policy. |
| 403 | `query_not_allowed` | A query parameter is outside the policy. |
| 413 | `payload_too_large` | The body exceeds 1 MiB. |
| 502 | `upstream_unavailable` | The upstream request could not complete. |
| 502 | `upstream_redirect_blocked` | The upstream attempted to redirect. |
| 502 | `unsupported_upstream_content_type` | The upstream returned a disallowed media type. |
| 502 | `upstream_response_too_large` | The declared upstream response exceeds the relay limit. |
| 504 | `upstream_timeout` | The upstream did not answer before the connection timeout. |

## Security boundaries

The proxy fails closed: missing or invalid configuration stops forwarding. It authenticates either a proxy token or an exact Sites user email before applying method-path policy, rebuilds upstream headers, separates client access from upstream credentials, rejects multiply encoded path bypasses and response types that could execute as same-origin content, and marks every response `no-store`.

Sites-user authentication and the static mirror trust identity only when it is supplied behind the Sites dispatcher. A direct local or Worker request can forge an ordinary identity header and must not be treated as an equivalent production boundary. Keep identity-protected deployments behind Sites access controls.

Configure a hostname you control or trust, enforce quotas and rate limits upstream, and pair client authentication with the Sites access policy.

## Repository skill

The repository includes a Codex Skill at `.agents/skills/operate-sites-relay/`. Future agents can invoke `$operate-sites-relay` to load the architecture, security contract, validation commands, and private Sites deployment workflow.

## Contributing

See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for the development setup, validation workflow, pull request checklist, and Conventional Commits rules.

## Documentation

- [Examples](./docs/examples.md)
- [Roadmap](./docs/roadmap.md)
- [Static web mirror contract](./docs/static-web-mirror.md)
- [Custom domains and named-user access](./docs/custom-domain.md)
- [Full web compatibility direction](./docs/web-compatibility-direction.md)
- [Security policy](./.github/SECURITY.md)

## Deploy to Sites

1. Open this project in ChatGPT and build it with the built-in Sites capability.
2. Keep the first deployment owner-only.
3. Set all required runtime values in Sites, then save and deploy a new version.
4. Check `/api/health`, then call a side-effect-free allowed path. Treat the upstream as reachable only after a real request succeeds.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
```

`npm test` runs the production build first.

After deployment, also verify:

- missing config, wrong tokens or disallowed Sites users, out-of-policy paths, and invalid origins all fail as expected
- cookies, client `Authorization`, and identity headers do not reach the upstream
- JSON returns normally and the first SSE chunk arrives before the stream ends
- the API relay does not pass through HTML, redirects, or `Set-Cookie`
- when the static mirror is enabled, anonymous and non-allowlisted users are denied before policy checks, active content is removed, and only allowed paths, queries, assets, and same-policy redirects remain
