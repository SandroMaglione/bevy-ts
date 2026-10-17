# Complete the Ritmo rebrand

This checklist separates merged repository changes from account and registry
operations. Do not run the external steps as part of merging the preparation PR.

## Merge the preparation

- Merge the brand PR, then the release-preparation PR. Retarget the latter to
  `main` after the brand PR merges. Merge both before any Version Packages PR.
- The preparation removes the generated docs site, tooling, and deployment
  workflow. Repository guides and source JSDoc remain.
- All six package manifests point to `typeonce-dev/ritmo`.
- Release automation stays paused until the repo has that name and the repository
  Actions variable `RITMO_RELEASES_ENABLED` is `true`. Leave it unset during setup.

## After both PRs merge

1. Transfer the existing repository to the Typeonce organization, whose handle
   is `typeonce-dev`, and rename it to `ritmo`. Use GitHub's repository transfer,
   preserving stars, watchers, issues, PRs, forks, and commit history.
   Confirm repository-admin access, permission to create repositories in the
   organization, and no conflicting destination repository or fork. An org owner
   can rename during transfer; otherwise transfer first, then rename.
   Record the stars and current commit before transfer, then verify them at
   `typeonce-dev/ritmo`, along with old-URL redirects. Do not recreate a
   repository or fork at the previous location, which would remove the redirects.
   Update local remotes with
   `git remote set-url origin https://github.com/typeonce-dev/ritmo.git`.
   Review the organization's inherited permissions, branch rules, and Actions
   policies, and verify the `npm` environment and release variable before publishing.
   Keep the existing npm scope `@typeonce`; the GitHub transfer does not require
   an npm organization rename.
2. Unpublish the existing site in Settings > Pages and verify the old site is
   unavailable. Removing the workflow alone does not unpublish the deployed site.
   Clear the old docs URL from GitHub's About website, update its description and
   topics, and use the brand assets for the social preview.
3. From clean, current `main`, run `pnpm changeset status`. Review the proposed
   shared version, run `pnpm version-packages` on a release branch, and merge the
   resulting version PR after checks. The release flag remains unset, so this
   merge does not publish. Do not reset or independently version the packages.
4. Bootstrap the first real release under all six new names using an authenticated
   npm maintainer session with permission in `@typeonce`. New package names need
   their own configuration; npm trust currently requires the package to exist.
   Use clean `main` at the reviewed version commit, run `pnpm install --frozen-lockfile`,
   `pnpm run check`, and `pnpm pack:check`, then `npm login` and:

   ```sh
   NPM_CONFIG_PROVENANCE=false pnpm release
   ```

   This one local invocation disables provenance because it cannot attest a
   GitHub Actions build. It does not change the committed provenance setting.
   The command builds and publishes with Changesets, which applies publish
   configuration and resolves workspace dependency ranges. Inspect the six
   registry versions and dependency ranges, retain the matching local release
   tags, and push only those reviewed tags. Do not create placeholder packages.
   If publication partially succeeds, inspect npm and rerun the same reviewed
   release; published versions cannot be overwritten.
5. Configure a trusted publisher for every `@typeonce/ritmo*` package on npm:

   | Field | Value |
   | --- | --- |
   | Owner | `typeonce-dev` |
   | Repository | `ritmo` |
   | Workflow filename | `release.yml` |
   | Environment | `npm` |
   | Allowed action | `npm publish` |

   Complete npm login, 2FA, or passkey prompts yourself. Configure the six entries
   close to their first CI publication: an unvalidated configuration expires
   after two days. Keep the GitHub environment named `npm`.
6. Set `RITMO_RELEASES_ENABLED=true` in repository Actions variables. Make the next
   reviewed release through Changesets and confirm all six CI publishes succeed
   with provenance within the trust-validation window. A workflow dispatch with
   no unpublished version does not validate npm trust. After validation, require
   2FA and disallow token publishing in each package's npm publishing settings.
7. Install the published packages into a fresh consumer and a real game. Check
   imports and gameplay, then deprecate every old package with its exact
   replacement and the [migration guide](https://github.com/typeonce-dev/ritmo/blob/main/MIGRATION.md).
   Keep all old versions and ownership. For example:

   ```sh
   npm deprecate '@typeonce/bevy-ts@*' 'Renamed to @typeonce/ritmo. Migration: https://github.com/typeonce-dev/ritmo/blob/main/MIGRATION.md'
   ```

   Repeat for `bevy-ts-browser`, `bevy-ts-render`, `bevy-ts-pixi`, `bevy-ts-math`,
   and `bevy-ts-devtools`, naming the matching replacement from [MIGRATION.md](./MIGRATION.md).
   Verify registry warnings for old versions and that pinned installs still work.
   Also deprecate all versions of the earlier `@typeonce/ecs` package after Ritmo
   is available. Name Ritmo as the replacement for new projects and state that
   its API is different; the bevy-ts import mapping is not an ECS migration guide.
8. Update consuming repositories, local workspace links, the Typeonce project
   listing, personal-site links, profile pins, and external integrations that use
   the old repo name. Announce the rename after install and migration checks pass.

The organization transfer, repository rename, Pages removal, npm authentication,
publication, trust configuration, deprecation, and changes in other repositories happen after merge.
They are not performed by this PR or by its CI.

## References

- [GitHub repository renaming](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [GitHub repository transfers and what is preserved](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository)
- [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm deprecation](https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions/)
