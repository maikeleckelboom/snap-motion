import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const componentsDirectory = resolve(process.cwd(), "dist/components");

for (const file of await readdir(componentsDirectory)) {
  if (!file.endsWith(".vue.d.ts")) continue;

  const nodeDeclaration = file.replace(/\.vue\.d\.ts$/, ".d.vue.ts");
  const declarationPath = resolve(componentsDirectory, file);
  const source = await readFile(declarationPath, "utf8");
  const compatibleSource = source.replace(
    /(import\("vue"\)\.DefineComponent<[^\r\n]+), any>;/g,
    "$1>;",
  );
  await writeFile(declarationPath, compatibleSource);
  await writeFile(resolve(componentsDirectory, nodeDeclaration), compatibleSource);
}

for (const file of await readdir(resolve(process.cwd(), "dist"))) {
  if (!file.endsWith(".d.ts")) continue;
  const declarationPath = resolve(process.cwd(), "dist", file);
  const source = await readFile(declarationPath, "utf8");
  const compatibleSource = source.replace(
    /import\("vue"\)\.ShallowRef<ControllerSnapshot<Id>, ControllerSnapshot<Id>>/g,
    'import("vue").ShallowRef<ControllerSnapshot<Id>>',
  );
  if (compatibleSource !== source) await writeFile(declarationPath, compatibleSource);
}
