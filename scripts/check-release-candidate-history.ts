import { resolve } from "node:path";

import { assertReleaseCandidateRegistry } from "./release-candidate-history.ts";

const repoRoot = resolve(import.meta.dirname, "..");

await assertReleaseCandidateRegistry(repoRoot);
process.stdout.write(
  "Release-candidate registry history is append-only; all records are valid and point to source commits in the current ancestry.\n",
);
