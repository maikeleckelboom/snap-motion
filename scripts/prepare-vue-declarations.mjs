import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const declarationsRoot = resolve(process.cwd(), "../../temp/declarations/vue");

async function declarationFiles(directory) {
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

for (const declarationPath of await declarationFiles(declarationsRoot)) {
  if (!declarationPath.endsWith(".d.ts")) continue;

  const source = await readFile(declarationPath, "utf8");
  const compatibleSource = source
    .replace(/(import\("vue"\)\.DefineComponent<[^\r\n]+), any>;/g, "$1>;")
    .replace(
      /import\("vue"\)\.ShallowRef<ControllerSnapshot<Id>, ControllerSnapshot<Id>>/g,
      'import("vue").ShallowRef<ControllerSnapshot<Id>>',
    );

  if (compatibleSource !== source) await writeFile(declarationPath, compatibleSource);

  if (declarationPath.endsWith(".vue.d.ts")) {
    const nodeDeclarationPath = declarationPath.replace(/\.vue\.d\.ts$/, ".d.vue.ts");
    await writeFile(nodeDeclarationPath, compatibleSource);
  }
}
