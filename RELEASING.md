# Releasing Weavit UI

Weavit UI ships installers for **macOS (Intel + Apple Silicon)**, **Windows**, and **Linux**.
Releases are cut by GitHub Actions from a version tag — you never build the public installers by
hand.

## How a release happens

1. **Bump the version.** Update `"version"` in [`package.json`](./package.json) (follow
   [semver](https://semver.org)) and merge it to `main`.

2. **Tag and push.** The tag must be `v` + the exact `package.json` version:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **CI builds everything.** The [`Release` workflow](./.github/workflows/release.yml) fans out
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
   [Releases](https://github.com/weavit-ui/weavit-ui/releases), confirm all installers are
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
