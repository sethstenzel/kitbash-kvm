# Building KitBash KVM Controller

The project uses **yarn** (`yarn.lock`); don't commit an npm `package-lock.json`.

## Install dependencies
`yarn install`

## When developing the app
`yarn dev` — Vite dev server at http://localhost:8087

`yarn dev:tauri` — run the desktop (Tauri) app against the dev server

## Building for web distribution (to Netlify)
`yarn build` — outputs the web app to `dist/`, including the PWA service worker and manifest

`yarn preview` — serve the built `dist/` locally

`yarn type-check` — TypeScript check (`yarn build:strict` runs the type check and the build together)

## Building desktop rust/tauri apps
`yarn build:tauri` — requires the Rust toolchain and the Tauri v1 prerequisites.

The desktop build writes its web assets to `dist-tauri/` (kept separate so it never overwrites the web build in `dist/`; no service worker is included), then compiles and bundles the app. The installer version comes from `package.json` (`"version"`):

- `src-tauri/target/release/KitBash KVM Controller.exe` — the app executable
- `src-tauri/target/release/bundle/msi/` — MSI installer
- `src-tauri/target/release/bundle/nsis/` — NSIS setup installer (`*-setup.exe`)

## Versioning
The app follows [Semantic Versioning](https://semver.org/) and changes are listed in `CHANGELOG.md`. Bump the version after every set of changes: **PATCH** (2.0.x) for fixes, **MINOR** (2.x.0) for new features, **MAJOR** for breaking changes.

`package.json` is the single source of truth: the web app shows it in Settings > Advanced > About, and the desktop installers read it via `"version": "../package.json"` in `src-tauri/tauri.conf.json` (they are named e.g. `KitBash KVM Controller_2.0.1_x64-setup.exe`). To release:

1. Bump the version: `yarn version --new-version X.Y.Z --no-git-tag-version`
2. Keep the Rust crate in sync: `version` in `src-tauri/Cargo.toml` and the `name = "app"` entry in `src-tauri/Cargo.lock`
3. Add a dated `## [X.Y.Z]` entry at the top of `CHANGELOG.md`
4. Build (`yarn build`, `yarn build:tauri`), commit, then tag and push: `git tag vX.Y.Z && git push origin main --tags`

## Toolbar icons
The command bar icons in `src/assets/icons/` are generated; after changing `scripts/generate-icons.py`, regenerate them with:

`python scripts/generate-icons.py src/assets/icons`
