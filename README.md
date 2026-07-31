# Weavit UI

**A cross-platform desktop GUI for the [Weaviate](https://weaviate.io) vector database.**
Browse collections, view/edit/delete/insert objects, and run vector, keyword, and hybrid
searches — against **any** Weaviate instance (local, self-hosted, or Weaviate Cloud).

> ⚠️ **Community project — not affiliated with or endorsed by Weaviate B.V.**
> “Weaviate” is a trademark of its respective owner. Weavit UI is an independent, open-source tool.

---

## Features

- **Connections** — local, Weaviate Cloud, or fully custom (separate HTTP + gRPC host/port).
  API-key or anonymous auth. Credentials are encrypted at rest with your OS keychain
  (Electron `safeStorage`). Extra headers for third-party vectorizer keys.
- **Schema & collections** — sidebar tree, per-collection config (properties, vectorizer,
  vector index, multi-tenancy), create & delete collections.
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

## License

[Apache-2.0](./LICENSE). Contributions welcome.
