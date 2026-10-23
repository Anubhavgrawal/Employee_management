import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/document-*.test.ts"],
		coverage: { reporter: ["text", "html"] },
	},
});
