import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import type * as TypeScript from "typescript";

const declarationsRoot = resolve(process.cwd(), "../../temp/declarations/vue");
const requireFromPackage = createRequire(resolve(process.cwd(), "package.json"));
const ts = requireFromPackage("typescript") as typeof TypeScript;

interface SourceReplacement {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

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

function normalizeGeneratedVueTypes(source: string, declarationPath: string): string {
  const sourceFile = ts.createSourceFile(
    declarationPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const replacements: SourceReplacement[] = [];

  function visit(node: TypeScript.Node): void {
    if (ts.isVariableStatement(node)) {
      const generatedSlotDeclarations = node.declarationList.declarations.filter(
        (declaration) =>
          ts.isIdentifier(declaration.name) && /^__VLS_\d+$/.test(declaration.name.text),
      );
      if (generatedSlotDeclarations.length > 0) {
        if (generatedSlotDeclarations.length !== node.declarationList.declarations.length) {
          throw new Error(`Mixed generated slot declaration in ${declarationPath}`);
        }
        replacements.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          text: generatedSlotDeclarations
            .map((declaration) => {
              if (!ts.isIdentifier(declaration.name) || !declaration.type) {
                throw new Error(`Untyped generated slot declaration in ${declarationPath}`);
              }
              return `type ${declaration.name.text} = ${declaration.type.getText(sourceFile)};`;
            })
            .join("\n"),
        });
        return;
      }
    }

    if (
      ts.isTypeQueryNode(node) &&
      ts.isIdentifier(node.exprName) &&
      /^__VLS_\d+$/.test(node.exprName.text)
    ) {
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        text: node.exprName.text,
      });
      return;
    }

    if (
      ts.isImportTypeNode(node) &&
      node.qualifier &&
      ts.isIdentifier(node.qualifier) &&
      node.qualifier.text === "DefineComponent" &&
      node.typeArguments?.length === 20
    ) {
      const compatibilityArgument = node.typeArguments[19];
      const previousArgument = node.typeArguments[18];
      if (
        !compatibilityArgument ||
        !previousArgument ||
        compatibilityArgument.kind !== ts.SyntaxKind.AnyKeyword
      ) {
        throw new Error(
          `Unexpected Vue DefineComponent compatibility argument in ${declarationPath}`,
        );
      }
      replacements.push({
        start: previousArgument.getEnd(),
        end: compatibilityArgument.getEnd(),
        text: "",
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (compatibleSource, replacement) =>
        `${compatibleSource.slice(0, replacement.start)}${replacement.text}${compatibleSource.slice(replacement.end)}`,
      source,
    );
}

for (const declarationPath of await declarationFiles(declarationsRoot)) {
  if (!declarationPath.endsWith(".d.ts")) continue;

  const source = await readFile(declarationPath, "utf8");
  let compatibleSource = source.replace(
    /import\("vue"\)\.ShallowRef<ControllerSnapshot<Id>, ControllerSnapshot<Id>>/g,
    'import("vue").ShallowRef<ControllerSnapshot<Id>>',
  );

  if (declarationPath.endsWith(".vue.d.ts")) {
    compatibleSource = normalizeGeneratedVueTypes(compatibleSource, declarationPath);
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
