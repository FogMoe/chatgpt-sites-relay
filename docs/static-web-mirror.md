# Static web mirror

English | [Chinese](./static-web-mirror.zh-CN.md)

The optional static web mirror exposes sanitized, read-only content from the same fixed HTTPS upstream as the API relay. It is implemented at `/web/*`, disabled by default, and never accepts a target origin from the client.

It is suitable for documentation, status pages, and other mostly static content. It is not a compatibility browser, an arbitrary-URL proxy, or a way to run upstream applications unchanged.

## Enable it

The normal required proxy variables must already be valid. Add:

```dotenv
WEB_RELAY_ENABLED=true
WEB_RELAY_ALLOWED_USER_EMAILS=owner@example.com
WEB_RELAY_ALLOWED_PATH_PREFIXES=/docs,/status
WEB_RELAY_ALLOWED_QUERY_KEYS=lang,page
```

`WEB_RELAY_ALLOWED_USER_EMAILS` and `WEB_RELAY_ALLOWED_PATH_PREFIXES` are required when the mirror is enabled. User emails are exact, case-insensitive matches; wildcards are not accepted. Use `/` as a path prefix only after reviewing the complete upstream surface. Query parameters are denied by default and must be listed by exact key.

## Access control

The mirror does not use the API client's `x-proxy-token` for browser navigation. It authenticates the ChatGPT identity supplied by the Sites dispatcher, then checks that identity against `WEB_RELAY_ALLOWED_USER_EMAILS` before evaluating path or query policy or injecting upstream credentials.

- An anonymous top-level document navigation redirects to the dispatcher-owned `/signin-with-chatgpt` flow.
- Anonymous image, stylesheet, font, and `HEAD` requests return 401 instead of following a sign-in redirect as if it were a resource.
- A signed-in user outside the allowlist receives 403. Responses never echo the submitted identity or configured allowlist.

Keep deployments that expose `/web/*` protected by Sites access control; owner-only access is the default deployment posture. The identity header is trusted only when the request passes through the Sites dispatcher. In local development or a direct Worker request that bypasses the dispatcher, an ordinary client can forge that header.

## Request contract

- Only `GET` and `HEAD` are accepted. `POST`, form submissions, CORS preflight, and other methods are rejected.
- Authentication and exact-email authorization happen before path and query policy checks.
- `/web/path` maps to `/path` on `PROXY_UPSTREAM_ORIGIN`.
- The decoded path must match `WEB_RELAY_ALLOWED_PATH_PREFIXES`.
- Every query parameter must match `WEB_RELAY_ALLOWED_QUERY_KEYS`.
- Encoded separators, encoded percent signs, NUL, backslashes, duplicate slashes, and dot segments are rejected.
- The upstream remains the single configured HTTPS origin. Clients cannot change its scheme, hostname, port, or credentials.
- Redirects are rewritten only when they stay on the same upstream origin and remain within the path and query policy. Other redirects are blocked.
- A relay-hop header prevents a Sites Relay instance from recursively mirroring another relay response.

## Upstream requests

The mirror creates a new request instead of forwarding browser headers:

- It sends `Accept`, `Accept-Encoding: identity`, a Sites Relay user agent, a request ID, and the relay-hop marker.
- It injects `PROXY_UPSTREAM_AUTHORIZATION` when configured.
- It does not forward client `Authorization`, cookies, origin, referer, identity headers, Cloudflare headers, or forwarding-chain headers.
- It does not send a request body.

## Allowed responses

The mirror accepts:

- UTF-8 `text/html`
- UTF-8 `text/css`
- AVIF, GIF, JPEG, PNG, WebP, and common icon media types
- WOFF, WOFF2, EOT, and the supported legacy font media types

JavaScript, JSON, XML, SVG, audio, video, manifests, arbitrary binary files, compressed responses, and unsupported charsets are rejected.

HTML and CSS documents are limited to 4 MiB. Images and fonts are limited to 20 MiB. The upstream connection limit is 15 seconds and the response limit is 60 seconds.

## HTML sanitization

The mirror parses and serializes HTML before returning it. HTML attributes use an allowlist so unrecognized legacy loading attributes cannot issue requests outside `/web/*`. It removes:

- scripts, styles, forms, controls, frames, embedded documents, SVG, MathML, templates, media, objects, and portals
- event-handler attributes, inline `style`, `srcset`, form attributes, `srcdoc`, integrity metadata, download behavior, and navigation targets
- refresh metadata and unsupported link relations
- links and resources that resolve outside the fixed upstream or outside the configured path and query policy

Allowed same-policy anchors, image sources, icons, and stylesheet links are rewritten under `/web/*`. Anchor links receive `nofollow noopener noreferrer`.

## CSS rewriting

CSS is parsed before it is returned:

- same-policy `url(...)` and `@import` references are rewritten under `/web/*`
- external, data, or otherwise disallowed references are removed
- stylesheets containing CSS escapes are rejected, and declarations using string-capable fetch functions such as `src()`, `image()`, or `image-set()` are removed
- legacy executable properties such as `behavior` and `-moz-binding` are removed
- source-map references are removed

Inline style attributes and `<style>` elements are not retained in mirrored HTML.

## Response isolation

The mirror does not pass through upstream cookies or arbitrary response headers. Responses use:

- `Cache-Control: private, no-store, no-transform`
- a restrictive CSP with scripts, forms, connections, frames, workers, media, and objects disabled; styles, images, and fonts are limited to the current origin's `/web/` path
- `sandbox allow-same-origin`
- same-origin opener and resource policies
- disabled camera, microphone, geolocation, payment, and USB permissions
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Robots-Tag: noindex, nofollow, noarchive`

## Limitations

Pages that require JavaScript, cookies, login state, forms, inline styles, cross-origin assets, WebSocket, media, or embedded content will not work as the original site does. That is intentional.

For a future architecture that supports JavaScript, APIs, session cookies, and forms without executing upstream code in the Sites origin, see [`web-compatibility-direction.md`](./web-compatibility-direction.md).
