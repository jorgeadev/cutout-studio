import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
		"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		clearMocks: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "html"],
			include: ["src/lib/**/*.ts"],
			exclude: ["src/**/*.test.ts"],
			thresholds: {
				branches: 75,
				functions: 75,
				lines: 75,
				statements: 75,
			},
		},
	},
});
