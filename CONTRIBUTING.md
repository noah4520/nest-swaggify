# Contributing to Nest Swaggify

Thanks for taking the time to contribute. This project is still small, so focused issues and pull requests are the easiest way to keep it moving well.

## Ways to Contribute

- Report bugs with a minimal reproduction.
- Improve documentation, examples, or wording.
- Add tests for missing behavior.
- Fix bugs in decorators, Swagger filtering, runtime setup, or the CLI.
- Propose new behavior before opening a large implementation PR.

## Development Setup

**Prerequisites:** Node.js 24+, pnpm 11+

```bash
git clone https://github.com/noah4520/nest-swaggify.git
cd nest-swaggify
pnpm install
```

## Project Structure

```text
nest-swaggify/
├── packages/core/     # Published library
│   └── lib/
│       ├── cli/       # generate-swagger CLI
│       ├── decorators/
│       ├── interfaces/
│       └── utils/
└── playground/        # Demo NestJS app for manual testing
```

Most source changes belong in `packages/core/lib/`. Use the playground when you need to verify behavior in a real NestJS app.

## Common Commands

```bash
pnpm lint              # Run oxlint
pnpm lint:fix          # Auto-fix lint issues
pnpm fmt               # Format with oxfmt
pnpm fmt:check         # Check formatting
pnpm typecheck         # TypeScript type check
pnpm test              # Run Vitest tests
pnpm build:core        # Build the published package
pnpm dev:playground    # Start the playground dev server
pnpm swagger:all       # Generate playground Swagger JSON for all groups
```

## Making Changes

1. Fork the repository and create a branch from `main`.
2. Keep the change focused on one bug, feature, or documentation improvement.
3. Add or update tests when behavior changes.
4. Update README examples when public APIs or CLI behavior changes.
5. Run the relevant checks before opening a PR:

```bash
pnpm lint
pnpm fmt:check
pnpm typecheck
pnpm test
pnpm build:core
```

For Swagger output changes, also verify the playground:

```bash
pnpm dev:playground
pnpm swagger:all
```

## Pull Request Guidelines

- Explain what changed and why.
- Mention any behavior that could affect existing users.
- Include reproduction steps for bug fixes when possible.
- Include screenshots or generated Swagger output when the change affects documentation output.
- Keep unrelated refactors out of the PR.
- Make sure CI passes before requesting review.

## Changelog Guidelines

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

- Add user-facing changes to the `Unreleased` section in `CHANGELOG.md`.
- Do not add internal-only refactors unless they affect users or contributors.
- Use categories such as `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, and `Security`.
- Move `Unreleased` entries into a versioned section only when preparing a release.

The changelog is published with each release, not after every PR. In practice, update `CHANGELOG.md` during development, then finalize it when bumping the package version, tagging the release, and publishing the npm package.

## Release Checklist

Maintainers should prepare a release when there are user-facing changes worth shipping, such as a bug fix, new option, decorator behavior change, CLI change, or documentation correction that users need.

1. Confirm `CHANGELOG.md` has the right entries under `Unreleased`.
2. Choose the version bump according to SemVer:
   - `patch` for backward-compatible bug fixes.
   - `minor` for backward-compatible features.
   - `major` for breaking changes.
3. Move `Unreleased` entries to a dated version section, for example `## [0.1.0] - 2026-05-04`.
4. Bump the version in `packages/core/package.json`.
5. Run `pnpm lint`, `pnpm fmt:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build:core`.
6. Create a git tag like `v0.1.0`.
7. Publish `packages/core` to npm.
8. Create a GitHub Release using the same changelog notes.

## Reporting Issues

Please use [GitHub Issues](https://github.com/noah4520/nest-swaggify/issues) and include:

- `nest-swaggify` version
- NestJS version
- `@nestjs/swagger` version
- Node.js and package manager versions
- A minimal reproduction or small code sample, if possible
- Expected behavior and actual behavior
