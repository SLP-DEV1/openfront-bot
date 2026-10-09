# Security and privacy policy

## Reporting a security issue

Please **do not publish credentials, tokens, private match exports or personal data in a public issue**. Contact the repository maintainers privately through an appropriate GitHub contact channel before sharing sensitive reproduction material.

## Public repository safety

- Never hard-code secrets into source files, scripts, tests or workflows.
- Use environment variables or local files excluded by `.gitignore` for sensitive configuration.
- Before sharing diagnostics or replays, remove player names, identifiers, cookies, match IDs and any unnecessary personal information.
- Keep development and telemetry services listening on `127.0.0.1` where appropriate; do not expose the local relay or monitor publicly.
- Review changes with a secret scanner before committing; `.gitignore` only prevents **new untracked files** from being added automatically. Already tracked files and Git history remain accessible.

## If a secret has already been published

1. **Immediately revoke or rotate** the exposed secret at its provider.
2. Remove the sensitive data from the active branch and review all other branches, tags, pull requests, forks, workflow logs and artifacts.
3. Rewrite affected Git history using a dedicated tool such as `git filter-repo` when necessary, then coordinate forced pushes, clone cleanup and any required GitHub Support cache removal.
4. Do not assume deleting the file in a new commit makes a previously published secret private.

No claim of a complete historical secret audit is made by this policy.
