import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const declarationsRoot = resolve(process.cwd(), "../../temp/declarations/vue");

async function declarationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? declarationFiles(path) : [path];
      }),
    )
  ).flat();
}

function normalizeVueDefaultExport(source: string): string {
  if (!source.includes("declare const __VLS_export:")) return source;
  return source
    .replace(/^declare const _default: typeof __VLS_export;\r?\n/m, "")
    .replace(/^declare const __VLS_export:/m, "declare const _default:");
}

for (const declarationPath of await declarationFiles(declarationsRoot)) {
  if (!declarationPath.endsWith(".d.ts")) continue;

  const source = await readFile(declarationPath, "utf8");
  let compatibleSource = source
    .replace(/(import\("vue"\)\.DefineComponent<[^\r\n]+), any>;/g, "$1>;")
    .replace(
      /import\("vue"\)\.ShallowRef<ControllerSnapshot<Id>, ControllerSnapshot<Id>>/g,
      'import("vue").ShallowRef<ControllerSnapshot<Id>>',
    );

  if (declarationPath.endsWith(".vue.d.ts")) {
    // Vue language tools name the default component through an unexported `__VLS_export` alias.
    // The alias is harmless to TypeScript but makes API Extractor report a fictitious forgotten
    // public symbol. Preserve the exact component type while naming the declaration `_default`
    // directly, which is the symbol the file actually exports.
    compatibleSource = normalizeVueDefaultExport(compatibleSource);
    if (compatibleSource.includes("__VLS_export")) {
      throw new Error(`Unnormalized Vue default export in ${declarationPath}`);
    }
  }

  if (compatibleSource !== source) await writeFile(declarationPath, compatibleSource);

  if (declarationPath.endsWith(".vue.d.ts")) {
    const nodeDeclarationPath = declarationPath.replace(/\.vue\.d\.ts$/, ".d.vue.ts");
    await writeFile(nodeDeclarationPath, compatibleSource);
  }
}
