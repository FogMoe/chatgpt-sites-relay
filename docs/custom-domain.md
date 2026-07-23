# Custom domain setup

English | [Chinese](./custom-domain.zh-CN.md)

Sites Relay supports a guided custom-domain workflow through the repository
Agent. The Site itself never receives Sites management credentials, DNS API
tokens, or registrar passwords.

## What "near one-click" means

Send the Agent one instruction with a bare hostname:

> Connect `relay.example.com` to this published Sites project, preserve its
> current access policy, and return the DNS records I must configure.

The Agent will:

1. Read the exact Sites project ID from `.openai/hosting.json`.
2. Confirm that the Site has a production deployment.
3. Validate the bare hostname and check whether it is already attached.
4. Add the hostname through Sites without changing deployment access.
5. Return the exact routing and validation records required by Sites.

You then add those records at your DNS provider. After DNS changes are in
place, tell the Agent to refresh the custom-domain status. DNS publication and
certificate validation are asynchronous, so the domain may remain pending for
a while after the records are added.

Use only a bare hostname such as `relay.example.com` or `example.com`. Do not
include `https://`, a path, query parameters, or fragments.

## DNS boundary

Subdomains normally receive a CNAME routing target. Zone-apex domains normally
receive A record targets. Sites also returns the App Garden and Cloudflare
validation records required for the specific hostname. Copy the records from
the Agent's result exactly; do not infer targets from an example in this
document.

This workflow stops at your DNS provider because the repository does not store
DNS credentials. If a DNS-provider connector is available in a future session,
changing DNS remains a separate external action and requires separate
authorization.

## Access control

Attaching a custom domain does not make a Site public and does not bypass its
existing Sites access policy.

Sites custom access can allow several named users, but each email must resolve
to an active user in the Site's workspace. The owner always remains allowed.
Ask the Agent to add the complete email list while preserving
`access_mode=custom`. If an email is not an active workspace user, invite or add
that user to the workspace before retrying.

Platform access and application authorization are separate layers:

- Sites access control determines who can reach the deployment.
- `PROXY_ALLOWED_USER_EMAILS` authorizes the API relay when
  `PROXY_AUTH_MODE=sites-user`.
- `WEB_RELAY_ALLOWED_USER_EMAILS` authorizes the static web mirror.

A user must pass every enabled layer. Email allowlists belong in Sites access
configuration or server-side runtime variables, never in source files,
client-side code, logs, or `.openai/hosting.json`.

## Remove a domain

Domain removal is a separate destructive action. Give the Agent the exact
hostname to remove and confirm that traffic may stop before it changes the
Sites project. Clean up obsolete DNS records afterward.
