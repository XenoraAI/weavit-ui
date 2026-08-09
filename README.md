# Weavit UI — a Weaviate GUI for macOS, Windows & Linux

**Weavit UI is a free, open-source Weaviate GUI: a cross-platform desktop client for the
[Weaviate](https://weaviate.io) vector database.** Browse collections, view/edit/delete/insert
objects, inspect named vectors, and run vector, keyword (BM25), and hybrid searches — against
**any** Weaviate instance (local, self-hosted, or Weaviate Cloud).

🌐 **[weavit-ui website →](https://xenoraai.github.io/weavit-ui/)**

[![Latest release](https://img.shields.io/github/v/release/XenoraAI/weavit-ui?sort=semver&label=download)](https://github.com/XenoraAI/weavit-ui/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/XenoraAI/weavit-ui/total)](https://github.com/XenoraAI/weavit-ui/releases)
[![CI](https://github.com/XenoraAI/weavit-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/XenoraAI/weavit-ui/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/XenoraAI/weavit-ui)](./LICENSE)

> ⚠️ **Community project — not affiliated with or endorsed by Weaviate B.V.**
> “Weaviate” is a trademark of its respective owner. Weavit UI is an independent, open-source tool.

---

## Screenshots

![Browsing a Weaviate collection in the Weavit UI GUI, with an object open on its Properties, JSON, Vectors and Metadata tabs](docs/screenshots/3.png)

![The New connection dialog in Weavit UI, configuring a local Weaviate instance with host, HTTP port 8080 and gRPC port 50051](docs/screenshots/1.png)

![Weaviate cluster overview in Weavit UI showing version, collection and node counts, installed modules, and a GraphQL console](docs/screenshots/2.png)

---

## Download

### ⬇️ [Download the latest release](https://github.com/XenoraAI/weavit-ui/releases/latest)

Pick the installer for your platform from the release assets:

| Platform | Installer |
| --- | --- |
| **macOS** — Apple Silicon (M1/M2/M3…) | the `-arm64.dmg` file |
| **macOS** — Intel | the `-x64.dmg` file |
| **Windows** | the `-setup.exe` file (NSIS installer) |
| **Linux** | the `.AppImage` (portable) or `.deb` (Debian/Ubuntu) file |

> These are **unsigned community builds**, so on first launch your OS may warn about an
> unidentified developer. On macOS, right-click the app → **Open**; on Windows, click
> **More info → Run anyway**.

---

## Features

- **Connections** — local, Weaviate Cloud, or fully custom (separate HTTP + gRPC host/port).
  API-key or anonymous auth. Credentials are encrypted at rest with your OS keychain
  (Electron `safeStorage`). Extra headers for third-party vectorizer keys.
- **Schema & collections** — sidebar tree, per-collection config (properties, vectorizer,
  vector index, multi-tenancy). Create, edit and delete collections: change settings, add
  properties, and drop a collection behind a typed confirmation.
- **Data** — paginated object browser, structured + raw-JSON views, named vectors, tenant
  selector, insert / edit (merge or replace) / delete.
- **Search** — `nearText`, `nearVector`, BM25, and hybrid, with a visual filter builder,
  target-vector selection, and property projection.
- **Admin** — cluster meta & modules, node status, and a raw GraphQL / REST console.

## Architecture

Weavit UI is an **Electron** app. The **main process (Node.js)** runs the official
[`weaviate-client`](https://www.npmjs.com/package/weaviate-client) v3 (which needs gRPC and is
Node-only) and exposes a small typed IPC surface. The **React + TypeScript renderer** talks only
to that surface via a `contextBridge` preload — it never reaches Weaviate directly.

```
React renderer  ──window.api──►  preload (contextBridge)  ──IPC──►  main (Node + weaviate-client)  ──►  Weaviate
```

Security: `contextIsolation` on, `nodeIntegration` off, `sandbox` on, production CSP, and
IPC-only data access.

## Getting started

```bash
# 1. Install deps (pnpm recommended; npm works too)
pnpm install

# 2. (optional) start a throwaway local Weaviate to point at
#    HTTP :8080, gRPC :50051, anonymous access, no vectorizer module
docker run -d --name weaviate -p 8080:8080 -p 50051:50051 \
  -e AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true \
  -e DEFAULT_VECTORIZER_MODULE=none \
  cr.weaviate.io/semitechnologies/weaviate:1.28.2

# 3. Run in dev
pnpm dev
```

In the app: **New connection → Local** (host `localhost`, HTTP `8080`, gRPC `50051`, auth None) →
select it in the sidebar to connect.

## Build & package

```bash
pnpm build          # typecheck + bundle main/preload/renderer
pnpm dist:mac       # or dist:win / dist:linux — produces installers in release/
```

Targets: macOS Intel + Apple Silicon (dmg/zip), Windows (nsis), Linux (AppImage/deb) via
`electron-builder`. Official installers are built and published automatically from a `vX.Y.Z` tag —
see [RELEASING.md](./RELEASING.md).

## Project layout

```
src/main/       Electron main: weaviate client wrapper, IPC handlers, encrypted secrets
src/preload/    contextBridge — the only bridge to the renderer
src/renderer/   React UI (features: connections, schema, data, query, admin)
src/shared/     IPC contract types + channel names (shared by main & renderer)
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) to get set up, and please read
our [Code of Conduct](./CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](./SECURITY.md).

- 🐛 [Report a bug](https://github.com/XenoraAI/weavit-ui/issues/new?template=bug_report.yml)
- 💡 [Request a feature](https://github.com/XenoraAI/weavit-ui/issues/new?template=feature_request.yml)
- 📦 Cutting a release? See [RELEASING.md](./RELEASING.md).

## FAQ

**Is there a GUI for Weaviate?**
Yes — this one. Weavit UI is a free, open-source desktop GUI for Weaviate on macOS, Windows, and
Linux. It connects to any instance and gives you a collection browser, an object editor, a vector
inspector, and a search builder in one window.

**How do I browse Weaviate collections?**
Add a connection pointing at your Weaviate host, and every collection in the schema shows up in
the sidebar. Selecting one opens a paginated object browser: read properties, switch to raw JSON,
pick a tenant on multi-tenant collections, and open any object to see its named vectors.

**Does it work with Weaviate Cloud?**
Yes. Local, Weaviate Cloud, and fully custom setups with separate HTTP and gRPC hosts and ports
all work, with API-key or anonymous auth.

**Where are my API keys stored?**
On your machine, encrypted at rest with your OS keychain via Electron `safeStorage`. No account,
no sync, no telemetry.

**Is this an official Weaviate product?**
No — see the disclaimer at the top. Weavit UI is an independent community project built on the
official [`weaviate-client`](https://www.npmjs.com/package/weaviate-client) library.

## License

[Apache-2.0](./LICENSE). Contributions welcome.
