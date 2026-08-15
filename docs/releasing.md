# Releasing

No workflow publishes packages. `pnpm release:check` is the same authoritative gate as
`pnpm verify`. From a clean worktree, `pnpm release:candidate` runs that gate, repacks and recertifies
the exact final consumer archives, then writes SHA-256 checksums and a deterministic manifest under
`.artifacts`. Candidate generation also rejects an archive whose declared export target is absent.
The manifest records the exact source commit, public repository provenance, package
versions/exports/dependencies, and the tracked blocker details. Candidate generation never
publishes.

Before verification or artifact mutation, candidate preflight compares the current aligned package
version with the producer-owned manifests under `config/release-candidates`. A recorded version is
immutable and cannot be generated again, even when a package Changeset was forgotten. Pending
Changesets additionally make an unversioned next-candidate intent explicit in the refusal. After the
Changesets versioning step advances Core and Vue together, the new unrecorded version becomes eligible.

A successful candidate run writes the exact generated release-manifest data to `.artifacts` and to a
new, exclusively created, repository-formatted `config/release-candidates/<version>.json` producer
record before replacing older ignored release output. Review and commit that generated record to certify
durable candidate history. Historical records are immutable machine data, not a prose release ledger.
Inspect an existing record rather than regenerating its version.

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
