import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    // The public core is consumed as already-minified ESM. Terser keeps the expanded geometry API
    // inside the existing package ceiling; packed-consumer verification guards the emitted file.
    minify: "terser",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
  },
});
