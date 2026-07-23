# Custom domain setup

English | [Chinese](./custom-domain.zh-CN.md)

Sites Relay supports a guided custom-domain workflow through the repository
Agent. Sites management credentials, DNS API tokens, and registrar passwords
remain in their respective control planes.

## What "near one-click" means

Send the Agent one instruction with a bare hostname:

> Connect `relay.example.com` to this published Sites project, preserve its
> current access policy, and return the DNS records I must configure.

The Agent will:

1. Read the exact Sites project ID from `.openai/hosting.json`.
2. Confirm that the Site has a production deployment.
3. Validate the bare hostname and check whether it is already attached.
4. Add the hostname through Sites while preserving deployment access.
5. Return the exact routing and validation records required by Sites.

You then add those records at your DNS provider. After DNS changes are in
place, tell the Agent to refresh the custom-domain status. DNS publication and
certificate validation are asynchronous, so the domain may remain pending for
a while after the records are added.

Provide a bare hostname such as `relay.example.com` or `example.com`; the
hostname field contains the domain name itself.

## DNS boundary

Subdomains normally receive a CNAME routing target. Zone-apex domains normally
receive A record targets. Sites also returns the App Garden and Cloudflare
validation records required for the specific hostname. Copy the exact records
from the Agent's result; the examples in this document illustrate the input
shape.

Complete the returned records at your DNS provider, where DNS credentials
remain. A future DNS-provider connector can perform that external action after
separate authorization.

## Access control

Attaching a custom domain preserves the Site's existing visibility and access
policy.

Sites custom access can allow several named users, but each email must resolve
to an active user in the Site's workspace. The owner always remains allowed.
Ask the Agent to add the complete email list while preserving
`access_mode=custom`. For a new email, invite or add that user to the workspace,
then retry.

Platform access and application authorization are separate layers:

- Sites access control determines who can reach the deployment.
- `PROXY_ALLOWED_USER_EMAILS` authorizes the API relay when
  `PROXY_AUTH_MODE=sites-user`.
- `WEB_RELAY_ALLOWED_USER_EMAILS` authorizes the static web mirror.

A user must pass every enabled layer. Store email allowlists in Sites access
configuration or server-side runtime variables.

## Remove a domain

Schedule a maintenance window, give the Agent the exact hostname, and confirm
the removal before it changes the Sites project. Clean up obsolete DNS records
afterward.
