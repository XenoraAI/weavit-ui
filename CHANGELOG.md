# Changelog

All notable changes to Weavit UI are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
