# Releasing Weavit UI

Weavit UI ships installers for **macOS (Intel + Apple Silicon)**, **Windows**, and **Linux**.
Releases are cut by GitHub Actions from a version tag — you never build the public installers by
hand.

## How a release happens

1. **Bump the version.** Update `"version"` in [`package.json`](./package.json) (follow
   [semver](https://semver.org)), add the matching section to
   [`CHANGELOG.md`](./CHANGELOG.md), and refresh the version strings in
   [`docs/index.html`](./docs/index.html) — the eyebrow, the JSON-LD `softwareVersion`, the
   download heading, the installer table and its JavaScript, and the status bar. Bump
   `<lastmod>` in [`docs/sitemap.xml`](./docs/sitemap.xml) too.

2. **Merge it to `main`.** That's the whole trigger. On the merge, the
   [`Release` workflow](./.github/workflows/release.yml) sees that no `v<version>` tag exists
   yet, creates and pushes it, and starts the build. Merges that don't change the version are
   a no-op — the tag is already there, so nothing is built.

   You can still cut a release by hand if you prefer; pushing the tag yourself works exactly
   as before and skips the auto-tag step:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **CI builds everything.** The workflow fans out
   across three runners and, with [`electron-builder`](https://www.electron.build), produces:

   | Platform          | Runner           | Artifacts                              |
   | ----------------- | ---------------- | -------------------------------------- |
   | macOS — Intel     | `macos-latest`   | `Weavit UI-<v>-x64.dmg` / `.zip`       |
   | macOS — Apple Si. | `macos-latest`   | `Weavit UI-<v>-arm64.dmg` / `.zip`     |
   | Windows           | `windows-latest` | `Weavit UI-<v>-setup.exe` (NSIS)       |
   | Linux             | `ubuntu-latest`  | `Weavit UI-<v>-x86_64.AppImage` / `.deb` |

   Each job runs `electron-builder --publish always`, which creates (or appends to) a single
   **draft** GitHub Release for the tag and uploads its installers there.

4. **Review and publish.** Open the drafted release under
   [Releases](https://github.com/XenoraAI/weavit-ui/releases), confirm all installers are
   attached, write the changelog, and click **Publish release**.

## Testing packaging without releasing

Run the `Release` workflow manually from the **Actions** tab (`workflow_dispatch`). It builds every
installer on all three platforms but **publishes nothing** — the installers are attached to the
workflow run as downloadable artifacts instead.

## Building locally

```bash
pnpm dist:mac     # Intel + Apple Silicon (.dmg/.zip in release/)
pnpm dist:win     # Windows NSIS installer
pnpm dist:linux   # Linux AppImage + .deb
```

> Cross-building: each OS builds its own installers best. macOS can build all three targets, but
> Windows/Linux installers are most reliably produced on their own runners — which is exactly why CI
> uses a per-OS matrix.

## Code signing

CI currently produces **unsigned** community builds (`CSC_IDENTITY_AUTO_DISCOVERY: false`). macOS
and Windows will warn users that the app is from an unidentified developer. To ship signed builds,
add the signing certificates as encrypted repository secrets and wire them into the `Package
installers` step in the workflow — see the electron-builder
[code signing docs](https://www.electron.build/code-signing).
