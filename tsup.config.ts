import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/std-router.ts"],
	dts: true,
	format: ["esm"],
	platform: "neutral",
});
