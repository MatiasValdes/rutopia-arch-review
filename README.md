# rutopia-arch-review

Agent SDK reviewer for `MatiasValdes/rutopia_backend` pull requests.

- Triggers: PR opened / reopened / synchronize / ready_for_review (drafts included)
- Writes: one PR comment (`@author`) + check run `rutopia-arch-review`
- Skips re-review for the same HEAD SHA
- Base `master` → `NO CUMPLE` without a model turn

## Local

```bash
cd /home/ubuntu/rutopia-arch-review
npx @grok/agent-sdk@0.4.0 login
npx @grok/agent-sdk@0.4.0 validate --dir .
npx @grok/agent-sdk@0.4.0 dev --dir . --cursor-events --repo MatiasValdes/rutopia_backend
```

Replay a PR (needs GitHub access):

```bash
npx @grok/agent-sdk@0.4.0 github replay MatiasValdes/rutopia_backend#<n> --dir .
```

## Deploy (operator)

```bash
npx @grok/agent-sdk@0.4.0 deploy --dir . --dry-run --json
npx @grok/agent-sdk@0.4.0 deploy --dir . --cursor-events-repo MatiasValdes/rutopia_backend
```

Require the GitHub status check `rutopia-arch-review` on protected branches if you want merge blocking.
