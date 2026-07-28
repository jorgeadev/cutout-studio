<div align="center">
  <img src="public/icon.svg" alt="cutout-studio icon" width="96" height="96" />

  <h1>cutout-studio</h1>

  <p>
    Private, browser-based background removal for individual images and batches.
    Choose an AI model, refine the edges, add a custom backdrop, and export without uploading your photos.
  </p>

  <p>
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" />
    <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" />
    <img alt="Runs locally" src="https://img.shields.io/badge/processing-on--device-06B6D4" />
    <img alt="AGPL-3.0-only license" src="https://img.shields.io/badge/license-AGPL--3.0--only-663399" />
  </p>
</div>

## Why cutout-studio?

Most background-removal tools send images to a remote server. cutout-studio downloads the selected model once and performs inference locally with ONNX Runtime Web. Images remain inside the browser while you process, compare, customize, and export them.

## Features

- Process as many as 40 images in one queue.
- Add images with drag and drop, the file picker, clipboard paste, a device camera, or the included sample.
- Choose between three model sizes to balance download time and cutout quality.
- Apply natural, refined, soft, or hard alpha-edge treatments.
- Select automatic, WebGPU, or CPU processing.
- Preview results with an interactive before-and-after slider.
- Keep transparency or add a solid color or two-color gradient.
- Export PNG, WebP, or JPEG at 50%, 100%, 150%, or 200% scale.
- Download one result or package the completed batch as a ZIP archive.
- Install the app as a PWA and reuse cached model files.
- Use the responsive light or dark interface on desktop and mobile.

## Processing options

### Models

| Model | Precision | Approximate download | Best for |
| --- | ---: | ---: | --- |
| Swift | 8-bit | 42 MB | Drafts, mobile devices, and large batches |
| Studio | 16-bit | 84 MB | The recommended balance of detail and size |
| Max | 32-bit | 168 MB | Difficult edges where maximum precision matters |

The first run for a model takes longer because its assets must be downloaded. Prepared models are cached for later sessions.

### Edge algorithms

| Mode | Behavior |
| --- | --- |
| Natural matte | Preserves the model's original transparency values |
| Edge refine | Tightens semi-transparent edges and reduces pale halos |
| Soft detail | Adds light feathering for portraits, hair, and fur |
| Hard edge | Creates an opaque binary cutout for logos and solid products |

## Quick start

### Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `11.17.0` (the version declared by the project)
- A modern browser with WebAssembly support; a WebGPU-capable browser is recommended for GPU acceleration

Clone the repository, then run:

```bash
cd cutout-studio
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. Use the development server instead of opening `index.html` directly because the app requires cross-origin isolation headers for multithreaded WebAssembly.

## Available scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite development server with cross-origin isolation headers |
| `pnpm typecheck` | Validate the TypeScript project without emitting files |
| `pnpm lint` | Run Biome over the repository |
| `pnpm build` | Type-check and create the production bundle in `dist/` |
| `pnpm preview` | Preview the production bundle locally with the required headers |

## How it works

1. The browser decodes each selected image and queues it for sequential processing to keep lower-powered devices responsive.
2. `@imgly/background-removal` loads the selected IS-Net model and runs it through ONNX Runtime Web.
3. The selected matte algorithm adjusts the resulting alpha channel with Canvas APIs.
4. The cutout is composited onto transparency, a solid color, or a gradient.
5. Canvas encodes the configured output, and JSZip creates batch archives when requested.

No backend or API key is required.

## Privacy

- Selected images are represented by local object URLs and are not sent to an image-processing server.
- Model weights are downloaded from IMG.LY's static asset host and cached by the browser.
- Only processing and export preferences are stored in `localStorage`.
- Production builds include Vercel Analytics for aggregate usage telemetry; image contents are not passed to it by the application.

## Deployment

The app is a static Vite SPA, but production hosting must include these headers on every route:

```text
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

The included `vercel.json` configures both headers for Vercel. If you use another provider, add equivalent rules before deploying. Without them, ONNX Runtime cannot use multithreaded WebAssembly and will fall back to a slower execution path.

After building, deploy the contents of `dist/`:

```bash
pnpm build
```

The production service worker provides offline app-shell support and caches model assets after they are requested.

## Project structure

```text
cutout-studio/
├── public/                  # PWA manifest, service worker, sample, and app icons
├── src/
│   ├── components/
│   │   ├── studio/         # Upload, processing, preview, and export features
│   │   └── ui/             # Reusable shadcn/Base UI primitives
│   ├── lib/                # Background removal, image export, and option data
│   ├── styles/             # Tailwind theme and application styles
│   ├── types/              # Domain and component TypeScript declarations
│   ├── app.tsx             # Application providers
│   └── main.tsx            # Browser entry point
├── vercel.json             # Production isolation headers
└── vite.config.ts          # Vite, React, aliases, and local headers
```

## Technology stack

| Area | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn, Base UI |
| Build tooling | Vite 8, pnpm, Biome |
| Background removal | IMG.LY Background Removal, IS-Net, ONNX Runtime Web |
| Export | Canvas API, JSZip |
| App experience | Service Worker, Web App Manifest, next-themes, Sonner |

## Troubleshooting

| Problem | What to check |
| --- | --- |
| WebAssembly threading warning | Confirm `crossOriginIsolated` is `true` and both required response headers are present. |
| WebGPU is unavailable | Select Auto or CPU processing, or use a browser/device with WebGPU support. |
| First cutout takes a while | The selected model may still be downloading. Swift has the smallest initial download. |
| ONNX runtime or metadata mismatch after an update | Unregister the service worker, clear the site's cached data, and reload so runtime and WASM files come from the same build. |
| Large images exhaust browser memory | Use Swift, process a smaller batch, or resize the source images before importing them. |

## Contributing

Contributions are welcome. Before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Keep image processing client-side, preserve keyboard and screen-reader behavior, and document any new model downloads or network requests.

## License

cutout-studio is open source under the [GNU Affero General Public License v3.0 only](LICENSE.md). This matches the copyleft license used by the bundled `@imgly/background-removal` dependency. Third-party packages remain subject to their respective licenses.

If you operate a modified version over a network, review the AGPL requirements for offering the corresponding source code to its users.

## Acknowledgements

- [IMG.LY Background Removal](https://github.com/imgly/background-removal-js) provides the browser inference pipeline.
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) runs the models in the browser.
- [shadcn](https://ui.shadcn.com/) and [Base UI](https://base-ui.com/) provide the UI primitives.
