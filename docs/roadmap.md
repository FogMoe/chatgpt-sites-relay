# Roadmap

English | [Chinese](./roadmap.zh-CN.md)

Sites Relay focuses on fixed-upstream application traffic. This roadmap records product direction and decision boundaries; actionable work belongs in GitHub Issues.

## Product principles

- Lock every destination to server configuration.
- Authenticate before revealing route policy or injecting upstream credentials.
- Use fail-closed handling with explicit errors for incomplete configuration, unsupported content, redirects, size-limit violations, and timeouts.
- Maintain a small, auditable relay contract.
- Place full browser compatibility in a remote-browser architecture with a separate origin.

## Current release line: v0.1

The v0.1 line establishes a production-shaped reference implementation:

- fixed-upstream JSON and SSE relay with method, path, query, header, size, and timeout policy
- token authentication for programmatic clients
- Sites-user authentication with exact email allowlists for same-origin browser applications
- optional authenticated static web mirror with HTML sanitization and CSS rewriting
- secret-free health diagnostics, upstream-host privacy, regression tests, and CI
- paired English and Chinese documentation, deployment examples, and an in-repository Codex Skill

The release remains pre-1.0. Configuration and response-contract changes require a security or usability benefit that justifies migration work.

## Near-term priorities

1. Validate the documented deployment flows against real fixed JSON/SSE upstreams using server-side runtime secrets.
2. Add provider-neutral recipes that demonstrate a distinct policy or streaming pattern.
3. Keep diagnostics secret-free and truthful: `ready` reports static validation, while a live request reports reachability.
4. Use concrete deployment feedback to guide routing and persistence work.

## Under consideration

These research candidates advance after evidence from real deployments:

- multiple named, server-configured upstreams with independent route policies
- extracting the policy and stream-limiting core for additional deployment adapters
- optional aggregate request accounting backed by a durable store, with bodies, credentials, and user identities excluded
- reusable configuration presets that preserve the default-deny model

## Separate Browser Relay direction

Full browser sessions use remote-browser isolation, per-user sessions, navigation policy, abuse controls, and a separate origin. The dedicated architecture owns this capability while `/api/proxy/*` and `/web/*` retain their current contracts. See [Full web compatibility direction](./web-compatibility-direction.md).

## Expansion gate

Roadmap entry criteria are a concrete Sites use case, server-controlled destinations, a testable security boundary, and requests from multiple real deployments. Earlier-stage ideas remain examples, adapters, or independent projects.
