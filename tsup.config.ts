import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/std-router.ts"],
	dts: true,
	format: ["cjs", "esm"],
	platform: "neutral",
});
