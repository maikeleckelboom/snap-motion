import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const packageDirectory = resolve(repoRoot, ".artifacts/packages");
const releaseDirectory = resolve(repoRoot, ".artifacts/release");

const verification = spawnSync("pnpm", ["verify"], {
  cwd: repoRoot,
  encoding: "utf8",
  shell: true,
  stdio: "inherit",
});
if (verification.status !== 0) process.exit(verification.status ?? 1);

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });
const artifacts = (await readdir(packageDirectory))
  .filter((file) => file.endsWith(".tgz"))
  .toSorted();
const packages = [];
for (const artifact of artifacts) {
  const data = await readFile(resolve(packageDirectory, artifact));
  packages.push({
    file: artifact,
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}

await writeFile(
  resolve(releaseDirectory, "SHA256SUMS"),
  `${packages.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`,
);
await writeFile(
  resolve(releaseDirectory, "release-manifest.json"),
  `${JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      packages,
      private: true,
      published: false,
      blockers: ["npm-name-ownership", "manual-assistive-technology", "repository-public-status"],
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`Release candidate artifacts created in ${basename(releaseDirectory)}\n`);
