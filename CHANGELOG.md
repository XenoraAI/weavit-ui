# Changelog

All notable changes to Weavit UI are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-08-11

The administration release. Everything you previously dropped to `curl` or the Python
client for — backups, aliases, tenants, users and roles, replication — now has a screen.
Search grew the rest of Weaviate's operators, data can be moved in and out in bulk, and
the app now understands what your API key is actually allowed to do.

### Added

- **Access control.** A roles tab with a permission editor covering every resource kind
  Weaviate models (collections, data, tenants, backups, aliases, nodes, replicate, roles,
  users, groups, cluster, MCP), and a users tab to create database users, issue and rotate
  their API keys, activate or deactivate them, and grant or revoke roles. OIDC group
  assignments are managed alongside them. Weaviate's protected built-in roles are called
  out as such instead of failing with a raw 403.
- **Read-only connections are visible as such.** The app reads the connected user's roles
  and shows a **read-only** marker in the status bar when the key holds no write
  permission anywhere, so a greyed-out instance explains itself. The check is advisory and
  fails open: when permissions can't be determined — no RBAC, anonymous access, OIDC, a
  role the key can't read — nothing changes.
- **Backup and restore.** Create a backup to any configured backend, watch it progress,
  cancel one mid-flight, browse what already exists on a backend, and restore — with
  per-collection include/exclude on both directions.
- **Aliases.** List, create, repoint and delete collection aliases.
- **Multi-tenancy.** A tenants tab per collection: create and delete tenants, and move them
  between active, inactive and offloaded.
- **Cluster and replication.** Per-node and per-shard detail, live sharding state, and
  replica movement — start a replication, watch the queue, cancel or delete an entry.
- **RAG.** A generative-search tab running single-prompt and grouped-task generation
  against your configured generative module.
- **Stats.** Per-collection aggregates and object counts, including per-tenant.
- **Import and export.** Bulk-import objects from JSON, NDJSON or CSV — with a preview of
  the parsed rows before anything is sent, a configurable batch size, and per-row errors
  reported rather than a failed run — and export query results or a whole collection back
  out. Schema import/export moves a collection definition between instances.
- **The rest of Weaviate's search surface.** `nearObject`, `nearImage` and `nearMedia`
  (audio, depth, IMU, thermal, video) join the existing text, vector, BM25 and hybrid
  modes, with autocut, group-by, reranking, consistency levels and per-search metadata
  selection.
- **Query history and saved queries.** Every search is recorded and can be re-run; the ones
  worth keeping can be named and saved.
- **OIDC authentication** — resource-owner password, client credentials, and bearer token —
  alongside the existing API-key and anonymous modes, plus per-request timeouts, a gRPC
  proxy, and an option to skip client-side init checks.
- **Tokenizer preview,** for seeing how a property's tokenization actually splits text
  before committing to it.
- **A raw REST console** beside the existing GraphQL one, and an instance metadata view
  listing modules and their configuration.

### Changed

- Permission refusals now read as sentences. A 403 that arrived as a nested JSON blob —
  `Forbidden: {"error":[{"message":"rbac: authorization, forbidden action: user 'alice'
  has insufficient permissions to update_data [[Domain: data, Collection: Docs, …]]"}]}` —
  is shown as *"User 'alice' lacks permission to update_data on Docs."*
- The object browser gained an inspect panel, click-to-sort columns, and a vector view that
  renders named vectors rather than dumping the raw array.

## [1.0.1] - 2026-08-09

Packaging-only release. No application changes — if the macOS Apple Silicon build of
v1.0.0 launched for you, there is nothing new here.

### Fixed

- **macOS builds no longer fail to launch on Apple Silicon.** The packaged app kept the
  stock Electron binary's linker signature, which stopped matching the bundle once
  electron-builder renamed it and swapped in our Info.plist and `app.asar`. Combined with
  the download quarantine flag, arm64 macOS refused to start it — *"Weavit UI is damaged
  and can't be opened."* Packaging now ad-hoc signs the app (`afterPack` hook) and fails
  the build if the signature doesn't verify. The builds are still unnotarized, so first
  launch still needs right-click → **Open**.

## [1.0.0] - 2026-08-09

First stable release. Collections are now fully editable from the UI, not just
creatable and deletable.

### Added

- **Edit collections.** A collection editor with separate settings and properties
  tabs: change the description, inverted-index and replication settings, and add
  new properties to an existing collection.
- **Delete collections** behind a typed confirmation dialog, so a mistyped name
  can't drop the wrong collection.
- **Per-collection and per-connection menus** in the sidebar — edit or delete a
  collection, refresh a connection's schema, or disconnect, without leaving the tree.
- **Shared property editor** used by both the create and edit dialogs, covering
  every Weaviate data type, tokenization option and per-property index flag.

### Changed

- `nearText` is now disabled, with an explanation, on collections whose vectorizer
  is `none` — Weaviate has no module to embed the query text, so the search would
  have failed at the server. Use **Near vector** or **BM25** on those collections.
- Collection settings and property drafts are validated before the request is sent,
  and invalid vector-index or tokenization combinations fall back instead of
  returning a server error.

### Fixed

- A malformed **Near vector** input (blank, truncated JSON, or an array containing
  non-numbers) now reports what's wrong instead of leaking a raw `SyntaxError`
  across IPC.

## [0.1.0] - 2026-07-31

### Added

- Initial release. Cross-platform desktop GUI for Weaviate:
  - Connections (local, Weaviate Cloud, custom) with OS-keychain-encrypted API keys
  - Schema browser and collection create/delete
  - Object browser with insert / edit / delete and named-vector support
  - `nearText`, `nearVector`, BM25, and hybrid search with a visual filter builder
  - Admin views (cluster meta, modules, node status) and a raw GraphQL/REST console

[Unreleased]: https://github.com/XenoraAI/weavit-ui/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/XenoraAI/weavit-ui/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/XenoraAI/weavit-ui/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/XenoraAI/weavit-ui/releases/tag/v0.1.0
