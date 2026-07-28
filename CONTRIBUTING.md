# Contributing to cutout-studio

Thank you for taking the time to improve cutout-studio. Contributions of code, design, documentation, testing, accessibility feedback, and reproducible bug reports are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

1. Search existing issues and pull requests to avoid duplicating work.
2. Open an issue before starting a large feature, architectural change, new model integration, or new network dependency.
3. Keep proposals focused on the project's core goals: private on-device processing, a clear batch workflow, accessible controls, and dependable exports.
4. Never post private images, credentials, security vulnerabilities, or personal data in a public issue.

Small documentation corrections and clearly scoped bug fixes can go directly to a pull request.

## Development setup

Requirements:

- Node.js `>=22.13.0` for local development
- pnpm `11.17.0`
- A modern browser with WebAssembly support

The CI matrix tests Node.js 20.19 through pnpm's standalone executable. Use Node.js 22 or newer when running the regular pnpm 11 CLI locally.

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR-USERNAME/cutout-studio.git
cd cutout-studio
git remote add upstream https://github.com/jorgeadev/cutout-studio.git
npm install --global pnpm@11.17.0
pnpm install --frozen-lockfile
pnpm dev
```

Vite supplies the cross-origin isolation headers required by ONNX Runtime. Do not test by opening `index.html` directly.

## Branches

Create a focused branch from the latest upstream development branch:

```bash
git fetch upstream
git switch develop
git pull --ff-only upstream develop
git switch -c fix/short-description
```

Use a descriptive prefix such as `fix/`, `feature/`, `docs/`, `refactor/`, or `chore/`.

Do not mix unrelated cleanup with a feature or bug fix. Smaller pull requests are easier to review and safer to merge.

## Project conventions

### Privacy and network behavior

- User-selected images must stay in the browser unless a future feature explicitly discloses and obtains consent for different behavior.
- Document every new external request, model asset, persistent storage key, and analytics event.
- Never log image contents, object URLs, file names containing personal information, or user-provided data unnecessarily.
- Preserve the service worker's same-origin checks and the COOP/COEP deployment requirements.

### TypeScript and React

- Keep TypeScript strict and avoid `any` unless there is a documented interoperability reason.
- Use `const` arrow functions for named functions.
- Put reusable interfaces and type aliases in the appropriate file under `src/types`.
- Keep processing logic in `src/lib` and feature UI in `src/components/studio`.
- Reuse existing primitives under `src/components/ui` before adding another dependency or component.
- Revoke object URLs and clean up browser event listeners when their lifecycle ends.

### User interface

- Test affected UI in light and dark themes.
- Test narrow mobile and wide desktop layouts.
- Preserve visible hover, focus, active, selected, loading, error, and disabled states.
- Use semantic HTML, accessible names, and keyboard-operable controls.
- Add `cursor-pointer` to interactive elements unless a native or disabled state requires another cursor.
- Avoid increasing the global border radius without discussing the design change first.

### Image processing

- Test Swift, Studio, and Max when changing model configuration.
- Test Auto, WebGPU, and CPU paths when changing runtime configuration.
- Consider memory usage before adding parallel processing; the queue is intentionally sequential for lower-powered devices.
- Use non-sensitive sample images that contributors are permitted to share.

## Quality checks

Run all required checks before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

`pnpm test:coverage` enforces the repository's coverage floor. Add focused regression tests whenever behavior changes; do not lower thresholds, delete assertions, or skip failures merely to make a change pass.

For user-interface changes, also test manually:

- Light and dark themes
- Keyboard navigation and visible focus
- Mobile and desktop layouts
- At least one successful image-processing and export flow when the change touches runtime behavior

Describe the scenarios you tested in the pull request. Add before-and-after screenshots for visual changes, using non-sensitive content.

## AI-assisted contributions

AI coding tools may help draft a contribution, but the submitting human remains responsible for understanding, validating, licensing, and maintaining everything in the diff. Read and follow [AI_CONTRIBUTIONS.md](AI_CONTRIBUTIONS.md), disclose material assistance in the pull request, and never put secrets, private images, unpublished vulnerabilities, or other confidential data into a prompt.

Verify suggested package names and APIs against official sources before installation. AI tools can hallucinate convincing packages and can repeat the same error across implementation, tests, and documentation. Generated tests are not independent evidence by themselves.

## Commits

Write short, imperative commit subjects that explain the result:

```text
Fix active processor hover contrast
Add model download progress state
Document Vercel isolation headers
```

Keep generated output, `dist/`, local environment files, model caches, and editor-specific files out of commits unless the repository intentionally tracks them.

## Pull requests

When opening a pull request:

1. Complete the pull request template.
2. Link the relevant issue with `Closes #123` when applicable.
3. Explain the motivation and important design decisions.
4. List automated and manual testing.
5. Disclose material AI assistance and how you verified it.
6. Disclose privacy, network, storage, bundle-size, or model-download effects.
7. Respond respectfully to review feedback and update the branch rather than opening replacement pull requests.

A maintainer may ask for a change to be split, redesigned, documented, or tested before it is merged. Submission does not guarantee acceptance.

## Issues and support

- Use the bug form for reproducible defects.
- Use the feature form for focused proposals.
- Use the documentation form for unclear or incorrect docs.
- Use the question form for public usage or development help.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities; never disclose them in public issues.
- Read [SUPPORT.md](SUPPORT.md) for support scope and response expectations.

## Licensing contributions

By submitting a contribution, you agree that it may be distributed under the repository's [GNU Affero General Public License v3.0 only](LICENSE.md). Only submit work you have the right to contribute. Preserve third-party copyright, attribution, and license notices.
