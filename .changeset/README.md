# Changesets

Every change to a published package needs a changeset: run `pnpm changeset`,
pick the bump, and describe the change for the changelog.

All `@typeonce/ritmo*` packages are one fixed group: they are always
released together with the same version.

On merge to `main`, the release workflow opens a "Version Packages" pull
request that applies pending changesets. Merging that pull request publishes
the new version to npm.

The workflow waits until the repository is named `typeonce-dev/ritmo` and
the repository variable `RITMO_RELEASES_ENABLED` is `true`.
Follow [RELEASING.md](../RELEASING.md) for the first Ritmo publication and
trusted-publisher setup before relying on automatic publishing.
