# Security policy

## Reporting a vulnerability

Please report security concerns privately through GitHub's **Security → Report a vulnerability** flow when it is available. Do not open a public issue containing credentials, private user data, or an exploitable proof of concept.

Include the affected area, reproduction steps, likely impact, and any suggested mitigation. Maintainers should acknowledge a complete report before discussing a public disclosure timeline.

## Maintainer notes

Alam’s Dump is a static browser application connected to Supabase-backed wall and moderation features. Browser-visible publishable keys are not privileged credentials; security must be enforced through Row Level Security, storage policies, narrowly scoped RPCs, and server-side moderation.

Never commit service-role keys, admin credentials, private tokens, or production `.env` files. If a privileged value is committed, revoke or rotate it immediately and then remove it from repository history as appropriate.
