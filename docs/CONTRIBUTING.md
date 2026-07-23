# Contributing

English | [Chinese](./CONTRIBUTING.zh-CN.md)

Thank you for helping improve Sites Relay. This repository is small, but it sits between an application and its upstream service, so changes to network capabilities, authentication, or response handling are security-sensitive.

## Project boundaries

Sites Relay combines a constrained JSON/SSE API relay with an optional read-only static web mirror for ChatGPT Sites. Each deployment connects to one fixed, server-configured HTTPS upstream. The API forwards only explicitly allowed methods, paths, and query parameters; the mirror exposes only sanitized, policy-approved static content.

The following capabilities are out of scope unless a new architecture and threat model are discussed and accepted first:

- open proxies with client-selected targets, hostnames, or upstream URLs
- website mirroring that accepts client-selected targets or forwards active content such as JavaScript, SVG, XML, forms, or embedded documents
- file uploads, `multipart/form-data`, automatic API redirects, cross-policy mirror redirects, or arbitrary request-header forwarding
- general-purpose HTTP forward proxying, SOCKS, WebSocket, `CONNECT`, TCP, or UDP tunneling

If a proposal expands network access, open an issue first describing the use case, authentication model, SSRF and DNS risks, resource limits, and abuse controls before submitting an implementation.

The current architecture proposal for full web compatibility is in [`web-compatibility-direction.md`](./web-compatibility-direction.md). It describes a separate remote-browser service and does not mean that the current API relay accepts arbitrary URLs.

The existing fixed-upstream, read-only static mirror is documented separately in [`static-web-mirror.md`](./static-web-mirror.md).

## Local development

Node.js 22.13.0 or later is required.

```powershell
git clone https://github.com/scarletkc/chatgpt-sites-relay.git
Set-Location chatgpt-sites-relay
npm ci
Copy-Item .env.example .env.local
npm run dev
```

In other shells, replace `Copy-Item` with `cp`. Configure local values from `.env.example`; never commit `.env.local`, access tokens, upstream credentials, or private service URLs. When runtime configuration is missing, the UI and `/api/health` should report that state explicitly instead of silently weakening policy.

## Change requirements

- Keep changes focused; do not mix unrelated refactors into the same pull request.
- Keep paired English and Chinese user-facing copy and documentation semantically aligned.
- When configuration or runtime contracts change, review `.env.example`, `README.md`, the relevant UI, `/api/health`, tests, and the repository skill together.
- Preserve fail-closed behavior, the fixed HTTPS upstream, credential isolation, route allowlists, JSON/SSE response restrictions, and static-mirror sanitization.
- Include before/after notes and screenshots in the pull request for visible UI changes.
- When changing dependencies, update and commit `package-lock.json` with them.

## Validation

After dependency or lockfile changes, run `npm ci` first. Before submitting a pull request, run every check in this order:

```powershell
npm run typecheck
npm run lint
npm test
```

`npm test` runs a production build before the Node.js tests. Do not make tests pass by weakening security checks or removing coverage.
GitHub Actions runs the same sequence for every push and pull request.

## Commit messages

Every commit must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

Keep the description concise and imperative, without a trailing period. English is preferred for a consistent Git history. Each commit should contain one logical change.

Common accepted types:

- `feat`: new functionality
- `fix`: bug fix
- `docs`: documentation only
- `refactor`: code restructuring without behavior changes
- `perf`: performance improvement
- `test`: adding or correcting tests
- `build`: build system or dependencies
- `ci`: continuous integration
- `chore`: other maintenance
- `style`: formatting without behavior changes

Optional scopes should be short and lowercase, such as `proxy`, `config`, `health`, `ui`, `docs`, `tests`, `build`, or `skill`.

```text
fix(proxy): reject multiply encoded path separators
feat(config): allow exact query parameter keys
docs: add contribution guidelines
test(proxy): cover SSE response limits
chore: rename package to sites-relay
```

Breaking changes must add `!` after the type or scope and explain the migration impact in a footer:

```text
feat(config)!: replace path prefixes with route rules

BREAKING CHANGE: replace PROXY_ALLOWED_PATH_PREFIXES with PROXY_ALLOWED_ROUTES.
```

## Pull request checklist

- [ ] The change is focused and contains no unrelated files.
- [ ] No secrets, local environment files, caches, or build artifacts are committed.
- [ ] Paired English and Chinese copy and documentation are in sync.
- [ ] Proxy, security, and network boundaries are not expanded accidentally.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all pass.
- [ ] Every commit follows Conventional Commits.
