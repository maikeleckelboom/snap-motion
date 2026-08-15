import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { pnpmCliCandidates, resolvePnpm, type PnpmInvocation } from "./pnpm-cli.ts";

const packageManager = "pnpm@11.13.1";
const nodeExecutable = resolve(
  "runtime",
  "bin",
  process.platform === "win32" ? "node.exe" : "node",
);

function resolveWith(
  available: Readonly<Record<string, string>>,
  environment: Readonly<Record<string, string | undefined>> = {},
  platform: NodeJS.Platform = "win32",
): PnpmInvocation {
  return resolvePnpm({
    declaredPackageManager: packageManager,
    environment,
    fileExists: (path) => path in available,
    nodeExecutable,
    platform,
    probeVersion: ({ path }) => available[path] ?? "",
  });
}

describe("repository pnpm CLI resolution", () => {
  const candidates = pnpmCliCandidates({ environment: {}, nodeExecutable });
  const corepack = candidates.find(({ source }) => source === "corepack")!;
  const standalone = candidates.find(({ source }) => source === "standalone")!;

  it("prefers the active lifecycle pnpm CLI when it matches packageManager", () => {
    const active = resolve("active", "pnpm.mjs");
    const resolution = resolveWith(
      { [active]: "11.13.1", [corepack.path]: "11.13.1" },
      { npm_execpath: active },
    );

    expect(resolution).toMatchObject({ path: active, source: "active", version: "11.13.1" });
  });

  it("uses a matching Corepack layout when no active CLI is available", () => {
    expect(resolveWith({ [corepack.path]: "11.13.1" })).toMatchObject({
      path: corepack.path,
      source: "corepack",
    });
  });

  it("uses a matching standalone pnpm-action style layout without Corepack", () => {
    expect(resolveWith({ [standalone.path]: "11.13.1" })).toMatchObject({
      path: standalone.path,
      source: "standalone",
    });
  });

  it("skips missing candidates and rejects mismatched installed versions", () => {
    expect(() => resolveWith({ [standalone.path]: "11.19.0" })).toThrow(
      /reports pnpm 11\.19\.0, expected 11\.13\.1/,
    );
  });

  it("fails closed when no declared package-manager authority exists", () => {
    expect(() => resolveWith({})).toThrow(
      /Could not resolve the repository-declared pnpm@11\.13\.1/,
    );
  });

  it("keeps a POSIX active executable directly invokable", () => {
    const active = resolve("active", "pnpm");
    const resolution = resolveWith({ [active]: "11.13.1" }, { npm_execpath: active }, "linux");

    expect(resolution.command).toBe(active);
    expect(resolution.argsPrefix).toEqual([]);
  });

  it("rejects a non-pnpm or inexact packageManager declaration", () => {
    expect(() =>
      resolvePnpm({
        declaredPackageManager: "pnpm@latest",
        environment: {},
        fileExists: () => false,
        nodeExecutable,
      }),
    ).toThrow(/declare an exact pnpm version/);
  });
});
