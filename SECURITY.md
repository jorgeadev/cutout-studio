# Security policy

cutout-studio processes user-selected images locally, so reports involving unexpected data transmission, browser storage, model integrity, service workers, or cross-origin isolation are taken seriously.

## Supported versions

This project is currently pre-1.0. Security fixes are applied to the latest code on the repository's active development branch. Older commits, forks, and third-party deployments are not separately supported.

## Report a vulnerability privately

Do not open a public issue, pull request, or discussion for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow:

<https://github.com/jorgeadev/cutout-studio/security/advisories/new>

If private reporting is unavailable, use a private contact method listed on the [maintainer's GitHub profile](https://github.com/jorgeadev). Do not include exploit details in a public channel.

Include as much of the following as possible:

- A concise description of the vulnerability and its impact
- Affected commit, deployment, browser, operating system, and device
- Reproduction steps or a minimal proof of concept
- Whether the issue affects confidentiality, integrity, or availability
- Any known workarounds or mitigations
- Whether you plan to publish details and your proposed disclosure timeline

Do not include real user images, credentials, tokens, or other sensitive personal data. Use generated or sanitized test material.

## What to report

Examples include:

- User images or metadata being transmitted or persisted unexpectedly
- Cross-site scripting or unsafe rendering of user-controlled content
- Service-worker cache poisoning or unsafe cross-origin caching
- Exposure of credentials, private configuration, or sensitive telemetry
- A dependency or model-asset integrity issue affecting the deployed app
- A bypass of an intended browser security boundary

Model quality problems, unsupported browsers, ordinary processing failures, and public dependency advisories without a project-specific impact should use the normal bug form instead.

## What to expect

The maintainer will review complete reports as availability permits, may request clarification, and will coordinate a reasonable remediation and disclosure plan for confirmed vulnerabilities. Please allow time for investigation before publishing details.

Good-faith research that avoids privacy violations, data destruction, service disruption, and access beyond what is necessary to demonstrate the issue is appreciated.
