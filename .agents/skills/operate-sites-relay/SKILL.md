---
name: operate-sites-relay
description: Understand, modify, validate, and deploy the repository's constrained fixed-upstream relay on ChatGPT Sites. Use when working on Sites Relay architecture, API proxying, static web mirroring, configuration or security, UI and documentation, tests, runtime variables, release packaging, access control, custom domains, or Sites deployments.
---

# Operate Sites Relay

Treat this repository as a constrained fixed-upstream relay with an explicit security boundary. Confirm current behavior from source before modifying, validating, or deploying it. Do not turn the current relay into a general-purpose open proxy.

## Build context

Read these files in order:

1. `README.md` for product scope, configuration contract, request contract, and deployment workflow.
2. `.openai/hosting.json` for the Sites project identifier. Reuse `project_id` exactly when it exists.
3. `package.json` for the Node.js requirement and canonical commands.
4. `lib/proxy-config.ts` for runtime values, route policy, size limits, and timeouts.
5. `app/chatgpt-auth.ts` for the Sites dispatcher identity contract and safe sign-in return paths.
6. `app/api/proxy/[[...path]]/route.ts`, `app/web/[[...path]]/route.ts`, `lib/web-mirror.ts`, and `app/api/health/route.ts` for API forwarding, static mirroring, transformation, and status behavior.
7. `.github/workflows/ci.yml` for the automated validation contract.
8. `docs/static-web-mirror.md` for the current optional mirror contract.
9. `docs/custom-domain.md` for the guided custom-domain and access-control workflow.
10. `tests/rendered-html.test.mjs` for required regression boundaries.
11. `git status --short` to preserve existing user changes and avoid cleaning unrelated work.

The separate Browser Relay architecture proposed for full web compatibility is documented in `docs/web-compatibility-direction.md`. It does not expand the current API relay contract.

## Preserve the API relay contract

- Accept one runtime-configured HTTPS upstream origin using a DNS hostname. Do not accept client-selected target URLs.
- Use `PROXY_ALLOWED_ROUTES` to bind HTTP methods to path prefixes. Deny query parameters by default and allow only exact keys in `PROXY_ALLOWED_QUERY_KEYS`.
- Validate `x-proxy-token` before returning route-policy results so the policy surface is not exposed.
- Keep the proxy access token separate from upstream `Authorization`. Never forward client `Authorization`, cookies, identity headers, or forwarding-chain headers.
- Forward only `GET`, `HEAD`, and `POST`. Handle `OPTIONS` CORS preflight locally.
- Accept only non-empty UTF-8 JSON POST bodies up to 1 MiB. Fail closed on compressed bodies and file uploads.
- Return only JSON, `+json`, or SSE. Block redirects, compressed responses, dangerous response headers, oversized responses, and timed-out responses.
- Reject encoded percent, slash, backslash, NUL, dot-segment, IP-literal, local-hostname, and trailing-dot hostname bypasses.
- Return 503 for missing or invalid configuration. `ready` means static validation passed; it does not claim upstream reachability.
- Hide the exact upstream hostname from the home page and `/api/health` unless `EXPOSE_UPSTREAM_HOST=true`.
- Do not weaken these boundaries for compatibility, debugging, or examples. Explain risk and obtain explicit authorization before proposing broader capabilities.

## Preserve the static mirror contract

- Keep `/web/*` disabled unless `WEB_RELAY_ENABLED=true`.
- Use the same fixed HTTPS upstream as the API relay. Never accept a client-selected origin or target URL.
- Require at least one exact ChatGPT account email in `WEB_RELAY_ALLOWED_USER_EMAILS`. Authenticate with the Sites dispatcher identity and authorize that allowlist before path policy checks or upstream credential injection.
- Redirect only anonymous top-level document navigation to the dispatcher-owned sign-in flow. Return 401 for anonymous subresources and `HEAD`, and 403 for signed-in users outside the allowlist without echoing identities.
- Forward only `GET` and `HEAD`. Bind paths to `WEB_RELAY_ALLOWED_PATH_PREFIXES` and deny query keys unless explicitly listed in `WEB_RELAY_ALLOWED_QUERY_KEYS`.
- Rebuild upstream headers, prevent relay loops, and never forward client credentials, cookies, identity, origin, referer, or forwarding headers.
- Accept only supported UTF-8 HTML/CSS, image, and font media types within the documented byte and time limits.
- Sanitize HTML with an attribute allowlist. Parse and rewrite CSS, reject CSS escapes, remove declarations using string-capable fetch functions such as `src()`, `image()`, and `image-set()`, keep only same-origin policy-approved resources, and block active content, forms, embedded documents, cookies, and external references.
- Allow redirects only when they remain on the fixed upstream and within path and query policy.
- Keep deployments exposing `/web/*` protected by Sites access control. The static mirror is not authenticated by the API client's `x-proxy-token`.
- Trust `oai-authenticated-user-email` only behind the Sites dispatcher. Local or direct Worker requests can forge an ordinary request header and are not an equivalent production authentication boundary.

## Modify the project

- Keep paired English and Chinese UI and documentation semantically aligned. The default `README.md` is English; translated project documents live under `docs/` and use the `.zh-CN.md` suffix.
- Keep this Skill and its metadata in English only.
- When the runtime contract changes, update `.env.example`, `README.md`, `docs/README.zh-CN.md`, the relevant detailed documentation, the relevant UI, the health endpoint, tests, and this Skill together.
- Never put secrets in source, logs, `.openai/hosting.json`, `NEXT_PUBLIC_*`, commit history, or command output.
- Do not invent upstreams, access tokens, upstream credentials, or production runtime values. `setup_required` is the correct result when those values are absent.
- Change only files within the requested scope. Avoid adding databases, general tunneling, WebSocket, CONNECT, TCP, or UDP capabilities to the current API relay.

## Validate

Run these commands in order:

```powershell
npm run typecheck
npm run lint
npm test
```

`npm test` runs a production build before the Node.js tests. Run `npm ci` first after dependency or lockfile changes.
The repository CI workflow runs the same typecheck, lint, and production-build test sequence for every push and pull request.

For a read-only audit that cannot generate `dist/`, run only typecheck and lint and state that build-backed tests were not run. Do not substitute that reduced check set for full validation before deployment.

At minimum, confirm:

- The bilingual home page, paired repository documents, and `public/og.png` exist, and starter content has not returned.
- Missing or invalid configuration makes `/api/health` return 503 without exposing secrets.
- Complete static configuration makes `/api/health` return 200 while `reachability` remains `not_checked`.
- The exact upstream hostname stays hidden by default and appears only after the explicit exposure switch is enabled.
- A wrong token returns 401 before route policy, and out-of-policy methods, paths, queries, origins, and encoded bypasses fail.
- Header isolation, the 1 MiB request limit, response type/size/timeout policy, and first-chunk SSE streaming pass.
- When the static mirror is enabled, missing or invalid user allowlists fail closed; anonymous and non-allowlisted users are denied before policy checks; and path/query policy, HTML sanitization, CSS rewriting, safe asset handling, redirect policy, and response isolation pass.
- `.gitignore` does not ignore `build/`, `lib/`, or other required deployment source.

## Deploy to Sites

Deploy only when the user requests it:

1. Use the built-in Sites building and hosting capabilities, and read `.openai/hosting.json` first.
2. If no `project_id` exists, create the Sites project only once and immediately write the exact returned ID into `.openai/hosting.json`. Never guess, reformat, or replace it.
3. Fully validate the current source. Create a commit containing only the requested work and ensure `commit_sha` identifies that exact validated state. For an initial project commit with mostly untracked files, inspect `git status --short --untracked-files=all` item by item. Include project source, configuration, tests, documentation, the Skill, and required static assets. Exclude `work/`, local environment files, secrets, caches, and build output.
4. Push the commit using the temporary source-repository credentials returned by Sites. Never save those credentials in a Git remote, file, log, or final response.
5. Build an archive from that commit, save a Sites version, and deploy that version. Default to an owner-only private deployment. Public access requires explicit user authorization.
6. Poll deployment status when the initial result is not terminal. After success, open the exact production URL and confirm the home page is reachable.
7. A deployment may remain in `setup_required` when real runtime values are unavailable. State that the relay is not operational yet and do not fabricate health.
8. Stop the local development server after deployment. Report the production URL, access policy, validation result, and runtime values that still need to be configured.

Do not push to the user's GitHub remote, create a pull request, make the deployment public, or set production secrets unless the user separately authorizes those actions.

## Manage custom domains

Treat domain binding as an Agent operation, not a Site runtime feature:

1. Read and reuse the exact `project_id` from `.openai/hosting.json`.
2. Confirm that the project already has a production deployment. Domain binding does not require a new application version.
3. Accept only a bare hostname such as `relay.example.com`. Reject a scheme, path, query, fragment, missing value, or guessed value.
4. List existing custom domains first. Reuse an existing match instead of adding a duplicate.
5. Add the custom domain with the built-in Sites capability. Do not change the current access mode, runtime variables, deployment, or source.
6. Return every routing and validation record from Sites exactly. Explain that the user must add those records at the DNS provider and that validation can be asynchronous.
7. After the user confirms that DNS is configured, refresh the exact custom-domain ID until its current status can be reported. Do not claim that the domain is ready from DNS lookup alone.

Never put Sites management credentials, DNS API tokens, registrar credentials, custom-domain IDs, or returned DNS records in source, runtime variables, `.openai/hosting.json`, logs, or commits. DNS-provider automation is a separate external action and requires separate authorization.

Removing a custom domain is destructive. Resolve the exact attached domain and obtain explicit confirmation before removal.

## Manage site access

Change Sites access only when the user asks:

- Custom access can include several exact user emails, but each email must resolve to an active user in the Site workspace. The owner always remains allowed.
- Preserve `access_mode=custom` when adding or replacing named users unless the user explicitly requests a different mode.
- Report unresolved emails instead of silently dropping them or making the Site public.
- Keep platform access separate from application authorization. `PROXY_ALLOWED_USER_EMAILS` protects the API relay in `sites-user` mode, and `WEB_RELAY_ALLOWED_USER_EMAILS` protects the static mirror. A user must pass every enabled layer.
- Never make a deployment public as a workaround for an unresolved workspace user without explicit authorization.
