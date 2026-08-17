import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const crossOriginIsolationHeaders = {
	"Cross-Origin-Embedder-Policy": "require-corp",
	"Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
	plugins: [react()],
	// Rolldown treats `?url` on the patched ONNX .mjs exports as part of a
	// Windows filename during dependency optimization. Vite can transform the
	// ESM package and its version-matched runtime assets directly instead.
	optimizeDeps: {
		exclude: ["@imgly/background-removal"],
	},
	server: {
		headers: crossOriginIsolationHeaders,
	},
	preview: {
		headers: crossOriginIsolationHeaders,
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
});
