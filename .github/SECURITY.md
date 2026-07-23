# Security policy

English | [Chinese](./SECURITY.zh-CN.md)

Sites Relay handles authentication boundaries and server-side upstream credentials. Please report suspected vulnerabilities privately.

## Supported versions

Sites Relay is pre-1.0. Security fixes target the current `main` branch and the latest tagged release when one exists. Older commits and forks may not receive fixes.

## Report a vulnerability

Use GitHub's private [Report a vulnerability](https://github.com/FogMoe/chatgpt-sites-relay/security/advisories/new) flow. Do not open a public Issue for a suspected vulnerability.

Include:

- the affected commit or release
- the relevant relay surface: `/api/proxy/*`, `/web/*`, configuration, authentication, or build/deployment
- a minimal reproduction using placeholder hosts and redacted values
- the expected security boundary and the observed bypass or exposure
- impact and any known mitigations

Never include real access tokens, upstream credentials, private upstream URLs, authenticated-user headers, email allowlists, or response bodies containing sensitive data.

## Security boundary

Reports are especially useful when they demonstrate:

- a client-selected or policy-bypassing upstream target
- authentication or allowlist bypass before route policy
- leakage of upstream credentials, cookies, identity, forwarding headers, or runtime values
- execution-capable content escaping the API or static-mirror response policy
- path, query, redirect, HTML, or CSS rewriting bypasses
- byte or time limits that fail open

The following are documented product limitations rather than vulnerabilities by themselves:

- a proxy token embedded in public browser JavaScript is visible to visitors
- Sites identity headers are trustworthy only behind the Sites dispatcher
- a trusted upstream domain owner can change DNS behavior
- the relay does not provide upstream quotas, rate limits, or general browser isolation

We will acknowledge a complete report when maintainers review it and coordinate disclosure after a fix or documented resolution is available.
