import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const crossOriginIsolationHeaders = {
	"Cross-Origin-Embedder-Policy": "require-corp",
	"Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
	plugins: [react()],
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
