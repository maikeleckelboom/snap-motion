# Releasing

No workflow publishes packages. `pnpm release:candidate` runs the full gate and writes private
tarballs, SHA-256 checksums, and a release manifest under `.artifacts`.

## Hard blockers

1. Verify ownership of both intended npm names.
2. Complete and record every physical assistive-technology row in production certification.
3. Decide repository visibility; a public repository improves inspectable provenance.
4. Obtain explicit manual release approval.

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
