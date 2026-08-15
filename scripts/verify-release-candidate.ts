import { resolve } from "node:path";

import { verifyRecordedCandidate } from "./release-candidate-verifier.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const version = process.argv[2] ?? process.env.SNAP_MOTION_CANDIDATE_VERSION;
if (!version) {
  throw new Error(
    "Select a recorded candidate version: pnpm release:candidate:verify -- <version> (or set SNAP_MOTION_CANDIDATE_VERSION).",
  );
}

const verified = await verifyRecordedCandidate(repoRoot, version);
process.stdout.write(
  `Verified and reassembled recorded release candidate ${verified.version} from historical source commit ${verified.sourceCommit}; ${verified.packageCount} exact package archives and release metadata were written under .artifacts. The immutable registry record was not modified.\n`,
);
