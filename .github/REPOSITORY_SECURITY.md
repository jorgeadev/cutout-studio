# Repository security settings

Some protections live in GitHub settings and cannot be enforced by committed files alone. Apply this checklist before merging the security baseline.

## Branch rulesets

Create rulesets for `main` and `develop` that:

- Require pull requests and at least one approving review.
- Require review from CODEOWNERS and dismiss stale approvals after new commits.
- Require approval of the most recent reviewable push from someone other than its author.
- Require all conversations to be resolved before merging.
- Require the CI matrix, dependency review, and CodeQL checks to pass.
- Block force pushes and branch deletion.
- Prevent bypass except for a narrowly controlled emergency maintainer role.

Keep direct pushes available only through an explicit, auditable emergency process. After the first workflow run, select the exact check names GitHub reports rather than typing approximate names into the ruleset.

## Actions

In **Settings → Actions → General**:

- Allow only actions required by this repository (`actions/*` and `github/codeql-action/*`).
- Keep the default `GITHUB_TOKEN` permission read-only.
- Do not allow GitHub Actions to create or approve pull requests.
- Require actions to remain pinned to full commit SHAs. The security regression suite rejects mutable action tags in committed workflows.

Review workflow changes as code execution changes. Never place secrets in workflows triggered by untrusted pull requests, and do not introduce `pull_request_target` without a documented threat model.

## Code and supply-chain security

In **Settings → Code security and analysis** or the repository **Security** area, enable every feature available for the repository:

- Dependency graph, Dependabot alerts, and Dependabot security updates
- CodeQL code scanning using this repository's advanced setup workflow
- Secret scanning and push protection
- Private vulnerability reporting

Keep pnpm's release-age, publisher trust, exotic-source, lockfile, and lifecycle-script policies together with Dependabot, dependency review, and the registry audit as complementary controls. No single scanner replaces dependency provenance review.

## AI-assisted changes

Require contributors and reviewers to follow [AI_CONTRIBUTIONS.md](../AI_CONTRIBUTIONS.md). Review the pull request's AI disclosure, verify new package identities against official sources, and request independent tests for security-sensitive generated code. Treat text retrieved from issues, pull requests, web pages, images, and model metadata as untrusted prompt content.

Review this checklist whenever GitHub adds a protection, a workflow gains permissions, the default branch changes, or a new maintainer receives bypass access.
