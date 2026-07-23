# AGENTS.md

## Project

Sites Relay is a ChatGPT Sites application for one server-configured HTTPS upstream.

- `/api/proxy/*` is a JSON/SSE API relay with token or exact Sites-user authentication plus method, path, query, size, type, and timeout limits.
- `/web/*` is an optional read-only static mirror of that same upstream. It supports only GET/HEAD and removes active content.
- Arbitrary public-URL browsing with JavaScript, cookies, APIs, and forms is a future Browser Relay architecture, not current behavior.

## Read first

1. `README.md`
2. `docs/README.zh-CN.md` when changing translated copy
3. `docs/static-web-mirror.md` for `/web/*`
4. `docs/examples.md` for supported client patterns
5. `docs/roadmap.md` for product direction and scope
6. `docs/web-compatibility-direction.md` for future browser work
7. `docs/custom-domain.md` for Sites domain binding and named-user access
8. `.agents/skills/operate-sites-relay/SKILL.md`
9. Relevant source, tests, and `git status --short`

## Ground rules

- Use npm and preserve `package-lock.json`; do not introduce pnpm without a separate package-manager migration.
- Keep the fixed-upstream and fail-closed security model. Never add a client-selected target URL to the current relay routes.
- Keep English documents canonical and update their `.zh-CN.md` counterparts in the same change.
- Keep the repository Skill and its metadata in English.
- Do not put secrets in source, logs, public variables, `.openai/hosting.json`, examples, or commits.
- Preserve unrelated work in the shared worktree.

## Validate

Run in order:

```powershell
npm run typecheck
npm run lint
npm test
```

Run `npm ci` first after dependency or lockfile changes.

Do not commit, push, deploy, make a deployment public, or set production secrets without explicit user authorization.
