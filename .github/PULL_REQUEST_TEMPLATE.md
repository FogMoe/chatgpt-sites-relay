## Summary

Describe the user-visible behavior and the Sites use case.

## Security boundary

- [ ] Upstream destinations remain fully server-configured.
- [ ] Authentication still occurs before route-policy details.
- [ ] No client credentials, cookies, identity, or forwarding headers reach the upstream.
- [ ] New failure modes fail closed and avoid exposing runtime values.

## Validation

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] English and Chinese user-facing documentation remain aligned.
- [ ] The commit message follows Conventional Commits.

See [`docs/CONTRIBUTING.md`](../docs/CONTRIBUTING.md) for the complete workflow.
