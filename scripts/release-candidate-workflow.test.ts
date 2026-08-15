import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");

describe("release-candidate workflow contract", () => {
  it("verifies a selected committed record from full history without branch mutation", async () => {
    const workflow = await readFile(
      resolve(repoRoot, ".github/workflows/release-candidate.yml"),
      "utf8",
    );

    expect(workflow).toMatch(/version:\n\s+description:.*\n\s+required: true/);
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("pnpm release:candidate:verify");
    expect(workflow).not.toContain("pnpm release:candidate:prepare");
    expect(workflow).not.toMatch(/contents:\s*write/);
    expect(workflow).not.toMatch(/\bgit\s+(?:commit|push|tag|merge)\b/);
    expect(workflow).toContain("config/release-candidates/${{ inputs.version }}.json");
  });

  it("runs append-only history enforcement in ordinary CI with full history", async () => {
    const workflow = await readFile(resolve(repoRoot, ".github/workflows/verify.yml"), "utf8");

    expect(workflow).toContain("name: Release-candidate history");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("node scripts/check-release-candidate-history.ts");
  });
});
