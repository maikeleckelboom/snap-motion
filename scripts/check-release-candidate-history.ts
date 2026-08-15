import { resolve } from "node:path";

import { assertReleaseCandidateHistory } from "./release-candidate-history.ts";

const repoRoot = resolve(import.meta.dirname, "..");

assertReleaseCandidateHistory(repoRoot);
process.stdout.write("Release-candidate registry history is append-only.\n");
