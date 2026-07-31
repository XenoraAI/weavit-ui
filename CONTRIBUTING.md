# Contributing to Weavit UI

Thanks for your interest in improving Weavit UI! This is a community, open-source project and
contributions of all kinds are welcome — bug reports, docs, and code.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** or **request a feature** via the [issue tracker](https://github.com/weavit-ui/weavit-ui/issues).
- **Improve the docs** — even fixing a typo in the README is a valuable PR.
- **Send code** — pick up an open issue (comment first so we don't duplicate work) or discuss a
  larger change in an issue before you start.

## Development setup

Prerequisites: **Node.js ≥ 22** and **pnpm 9** (`npm install -g pnpm`).

```bash
pnpm install        # install dependencies
pnpm dev            # run the app in development with hot reload
```

Point the app at a local Weaviate (see the [README](./README.md#getting-started)) or any instance
you have access to.

### Handy scripts

| Command          | What it does                                        |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Run the app with hot reload                          |
| `pnpm typecheck` | Type-check the main + renderer projects              |
| `pnpm test`      | Run the unit tests (Vitest)                          |
| `pnpm build`     | Type-check and bundle main/preload/renderer          |
| `pnpm dist:mac`  | Build local installers (`dist:win` / `dist:linux`)   |

## Making a change

1. **Fork** the repo and create a branch off `main` (e.g. `fix/filter-builder-crash`).
2. Make your change. Keep it focused — one logical change per PR.
3. **Before you push**, make sure the checks pass locally:
   ```bash
   pnpm typecheck && pnpm test && pnpm build
   ```
   These are exactly what CI runs on every pull request.
4. Add or update tests when you change behavior. New logic in `src/main/weaviate/` in particular
   should come with unit tests (see `filters.test.ts` for the pattern).
5. Open a pull request against `main` and fill in the PR template.

## Coding guidelines

- **TypeScript, no `any`** where it can be avoided. The IPC contract in `src/shared/` is the source
  of truth shared by main and renderer — keep it typed and in sync.
- **Respect the security boundary.** The renderer must never reach Weaviate directly; all data
  access goes through the typed `window.api` IPC surface (`src/preload/`). Don't weaken
  `contextIsolation`, `sandbox`, or the CSP.
- **Match the surrounding style** — the project has no separate linter config; follow the
  conventions already in the file you're editing.
- Keep commits small and write clear commit messages.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. See [SECURITY.md](./SECURITY.md)
for how to report them privately.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache-2.0 License](./LICENSE) that covers this project.
