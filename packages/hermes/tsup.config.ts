import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: ["src/cli.ts", "src/stop-worker.ts", "src/remote-worker.ts"],
    format: ["cjs"],
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
    outDir: "dist",
    clean: false,
  },
]);
