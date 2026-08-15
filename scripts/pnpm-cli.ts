import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

export interface PnpmCliCandidate {
  readonly path: string;
  readonly source: "active" | "corepack" | "standalone";
}

export interface PnpmInvocation extends PnpmCliCandidate {
  readonly argsPrefix: readonly string[];
  readonly command: string;
  readonly version: string;
}

interface ResolvePnpmOptions {
  readonly declaredPackageManager: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly fileExists?: (path: string) => boolean;
  readonly nodeExecutable?: string;
  readonly platform?: NodeJS.Platform;
  readonly probeVersion?: (invocation: Omit<PnpmInvocation, "version">) => string;
}

interface RepositoryManifest {
  readonly packageManager?: string;
}

function declaredPnpmVersion(packageManager: string): string {
  const match = /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(packageManager);
  if (!match?.[1]) {
    throw new Error(
      `The repository must declare an exact pnpm version in packageManager; received ${JSON.stringify(packageManager)}.`,
    );
  }
  return match[1];
}

export function pnpmCliCandidates({
  environment = process.env,
  nodeExecutable = process.execPath,
}: Pick<ResolvePnpmOptions, "environment" | "nodeExecutable"> = {}): readonly PnpmCliCandidate[] {
  const activeCli = environment.npm_execpath?.trim();
  const candidates: PnpmCliCandidate[] = [];
  if (activeCli) candidates.push({ path: resolve(activeCli), source: "active" });
  candidates.push(
    {
      path: resolve(dirname(nodeExecutable), "node_modules/corepack/dist/pnpm.js"),
      source: "corepack",
    },
    {
      path: resolve(dirname(nodeExecutable), "../node_modules/pnpm/bin/pnpm.mjs"),
      source: "standalone",
    },
  );

  return candidates.filter(
    (candidate, index) =>
      candidates.findIndex((other) => other.path.toLowerCase() === candidate.path.toLowerCase()) ===
      index,
  );
}

function invocationForCandidate(
  candidate: PnpmCliCandidate,
  nodeExecutable: string,
  platform: NodeJS.Platform,
): Omit<PnpmInvocation, "version"> {
  if ([".js", ".cjs", ".mjs"].includes(extname(candidate.path).toLowerCase())) {
    return {
      ...candidate,
      command: nodeExecutable,
      argsPrefix: [candidate.path],
    };
  }
  if (platform === "win32") {
    throw new Error(
      `The ${candidate.source} pnpm authority is not a directly executable JavaScript CLI: ${candidate.path}`,
    );
  }
  return { ...candidate, command: candidate.path, argsPrefix: [] };
}

function probePnpmVersion(invocation: Omit<PnpmInvocation, "version">): string {
  const result = spawnSync(invocation.command, [...invocation.argsPrefix, "--version"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw result.error ?? new Error(result.stderr || "pnpm --version failed.");
  }
  return result.stdout.trim();
}

export function resolvePnpm(options: ResolvePnpmOptions): PnpmInvocation {
  const expectedVersion = declaredPnpmVersion(options.declaredPackageManager);
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const platform = options.platform ?? process.platform;
  const fileExists = options.fileExists ?? existsSync;
  const probeVersion = options.probeVersion ?? probePnpmVersion;
  const diagnostics: string[] = [];

  const candidates = options.environment
    ? pnpmCliCandidates({ environment: options.environment, nodeExecutable })
    : pnpmCliCandidates({ nodeExecutable });
  for (const candidate of candidates) {
    if (!fileExists(candidate.path)) {
      diagnostics.push(`${candidate.source}: missing ${candidate.path}`);
      continue;
    }
    try {
      const invocation = invocationForCandidate(candidate, nodeExecutable, platform);
      const version = probeVersion(invocation);
      if (version !== expectedVersion) {
        diagnostics.push(
          `${candidate.source}: ${candidate.path} reports pnpm ${version || "without a version"}, expected ${expectedVersion}`,
        );
        continue;
      }
      return { ...invocation, version };
    } catch (error) {
      diagnostics.push(
        `${candidate.source}: ${candidate.path} failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  throw new Error(
    `Could not resolve the repository-declared pnpm@${expectedVersion}. Invoke the script through that pnpm installation or make its CLI available beside the active Node.js runtime.\n${diagnostics.join("\n")}`,
  );
}

export function resolveRepositoryPnpm(repoRoot: string): PnpmInvocation {
  const manifest = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8"),
  ) as RepositoryManifest;
  if (!manifest.packageManager) {
    throw new Error("The repository package.json does not declare packageManager.");
  }
  return resolvePnpm({ declaredPackageManager: manifest.packageManager });
}

export function runPnpmSync(
  invocation: PnpmInvocation,
  args: readonly string[],
  options: Pick<SpawnSyncOptions, "cwd" | "env" | "stdio"> = {},
): void {
  const result = spawnSync(invocation.command, [...invocation.argsPrefix, ...args], {
    ...options,
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
  });
  if (result.status !== 0) {
    throw (
      result.error ??
      new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`)
    );
  }
}
