import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const packageDirectory = resolve(process.cwd());
if (!new Set(["core", "vue"]).has(basename(packageDirectory))) {
  throw new Error(`Refusing to clean a non-package directory: ${packageDirectory}`);
}
await rm(resolve(packageDirectory, "dist"), { force: true, recursive: true });
