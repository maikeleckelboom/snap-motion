import { fileURLToPath } from "node:url";

/**
 * Workspace package entrypoints mapped to the source module each one publishes.
 *
 * Development and unit tests resolve packages straight from source so an edit inside
 * `packages/*\/src` reaches the module graph without a package build. Only specifiers that appear in
 * a package's own `exports` map are listed: this is a deliberate entrypoint map rather than a
 * wildcard, so no private module becomes importable through an alias that the published package
 * would reject. Production builds, packing, preview, and packaged-consumer fixtures must keep
 * resolving through `node_modules` and the real distributable artifacts.
 */
export const WORKSPACE_SOURCE_ENTRYPOINTS: Readonly<Record<string, string>> = {
  "@snap-motion/core": sourcePath("packages/core/src/index.ts"),
  "@snap-motion/vue": sourcePath("packages/vue/src/index.ts"),
  "@snap-motion/vue/carousel": sourcePath("packages/vue/src/carousel/index.ts"),
  "@snap-motion/vue/dialog": sourcePath("packages/vue/src/dialog/index.ts"),
  "@snap-motion/vue/localization": sourcePath("packages/vue/src/localization/index.ts"),
  "@snap-motion/vue/media-gallery": sourcePath("packages/vue/src/media-gallery/index.ts"),
  "@snap-motion/vue/motion": sourcePath("packages/vue/src/motion/index.ts"),
  "@snap-motion/vue/sheet": sourcePath("packages/vue/src/sheet/index.ts"),
  "@snap-motion/vue/style.css": sourcePath("packages/vue/src/style.css"),
};

function sourcePath(workspaceRelativePath: string): string {
  return fileURLToPath(new URL(`../${workspaceRelativePath}`, import.meta.url));
}

function escapeSpecifier(specifier: string): string {
  return specifier.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Alias entries for Vite and Vitest. Each pattern is anchored to a whole specifier, so
 * `@snap-motion/vue` can never swallow `@snap-motion/vue/carousel` and no deep path outside the map
 * resolves at all.
 */
export function workspaceSourceAliases(): { find: RegExp; replacement: string }[] {
  return Object.entries(WORKSPACE_SOURCE_ENTRYPOINTS).map(([specifier, replacement]) => ({
    find: new RegExp(`^${escapeSpecifier(specifier)}$`),
    replacement,
  }));
}
