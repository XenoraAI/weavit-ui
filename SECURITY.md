# Security Policy

## Supported versions

Weavit UI is pre-1.0 and under active development. Security fixes are made against the latest
release and the `main` branch only.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately through GitHub's
[private vulnerability reporting](https://github.com/XenoraAI/weavit-ui/security/advisories/new)
("Report a vulnerability" under the repository's **Security** tab).

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- The version / commit affected and your platform

We will acknowledge your report as quickly as we can and keep you informed as we work on a fix.
Please give us a reasonable amount of time to address the issue before any public disclosure.

## Scope notes

Weavit UI is a desktop client. Keep in mind when assessing impact:

- Connection credentials (API keys) are stored **encrypted at rest** using the OS keychain via
  Electron `safeStorage`.
- The renderer runs with `contextIsolation` on, `nodeIntegration` off, and `sandbox` on; it reaches
  Weaviate only through a typed IPC surface, never directly.

Reports that strengthen or find gaps in these boundaries are especially appreciated.
