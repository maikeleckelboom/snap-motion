# Releasing

No workflow publishes packages. `pnpm release:check` is the same authoritative gate as `pnpm verify`.
The release-candidate lifecycle has separate producer and consumer phases:

1. From a clean worktree whose aligned package version is unrecorded,
   `pnpm release:candidate:prepare` runs the full gate, certifies the exact packed-consumer archives,
   exclusively creates `config/release-candidates/<version>.json`, and writes ignored package and
   release output under `.artifacts`.
2. Review and commit only the new producer record. That later provenance commit does not become the
   package source authority; the record keeps the source commit that produced the archives.
3. `pnpm release:candidate:verify -- <version>` reads an existing record, checks out its recorded
   `source.commit` in an isolated detached worktree, uses the repository pnpm and package-assembly
   authorities, and requires the package set, manifest data, archive bytes, and SHA-256 hashes to
   match before reconstructing `.artifacts/packages` and `.artifacts/release`.

The verifier never creates or rewrites a registry record. It is also the recovery path when producer
record creation succeeded but artifact finalization was interrupted: rerun verification for that
recorded version. GitHub Actions accepts an explicit version and performs this recorded-candidate
verification only; it has read-only repository permission and never certifies, commits, or pushes a
new candidate.

Before verification or artifact mutation, candidate preflight compares the current aligned package
version with the producer-owned manifests under `config/release-candidates`. A recorded version is
immutable and cannot be generated again, even when a package Changeset was forgotten. Pending
Changesets additionally make an unversioned next-candidate intent explicit in the refusal. After the
Changesets versioning step advances Core and Vue together, the new unrecorded version becomes eligible.

A successful producer run reserves the immutable record before replacing older ignored release
output. A producer rerun for that version therefore fails without replacing the record or artifacts;
it never becomes recertification. `pnpm release:candidates:check` mechanically scans Git history and
the working tree. Once a record enters history, modification, deletion, rename, replacement, or
recreation fails ordinary verification and CI. The registry can evolve only by adding a new version
record.

Public API changes first run `pnpm api:update` to regenerate the root and capability reports. CI
uses `pnpm api:check`; package builds create declaration rollups without modifying tracked reports.

Every changed package byte receives a new immutable version through Changesets prerelease mode.
Every previously generated prerelease candidate is immutable provenance and may never be overwritten
or republished. The package manifests and generated release manifest are the authority for the
candidate currently under review; every later candidate must advance the prerelease version.
Core and Vue move together so Vue's packed dependency range resolves the candidate's exact compatible
core line.

## Hard blockers

1. Verify ownership of both intended npm names.
2. Complete and record every physical assistive-technology row in production certification.
3. Obtain explicit manual release approval.

## Future staged publication

After blockers close, configure npm trusted publishing with GitHub OIDC rather than a long-lived
token. Require provenance, protected environments, 2FA approval, immutable pinned actions, and a
reviewed prerelease Changeset. Publish core first, then Vue against the exact core version, using a
prerelease dist-tag such as `beta`; verify clean external consumers before moving any stable tag.

If a release is defective, stop promotion, deprecate the affected version with a precise message,
publish a forward fix, and document consumer recovery. Do not overwrite an existing npm version.

Required branch protection for `main`: pull requests, current verification and CodeQL checks,
review approval, conversation resolution, and no force pushes. Repository settings remain a manual
administrative action.
