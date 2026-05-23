# AGENTS.md

## Cursor Cloud specific instructions

This is a self-contained Electron desktop app (hospital staff attendance tracker) with an embedded SQLite database via sql.js. No external services, Docker, or network connectivity required.

### Running the application

- **Dev mode**: Run `npm run dev` to start Vite + Electron concurrently.
- Electron requires a display server. Use `DISPLAY=:1` (Xvfb is available in the Cloud VM).
- dbus warnings in Electron output are expected in container environments and non-fatal.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Type check | `npm run typecheck` |
| Build | `npm run build` |
| Dev (workaround) | See above |

### Architecture notes

- Single package, no monorepo
- Renderer: React 19 + Vite 8 + Tailwind CSS v4 (port 5173)
- Main process: Electron 42, TypeScript compiled to `dist-electron/`
- Database: sql.js (WASM-based SQLite, persisted to Electron `userData` folder)
- No lint tool configured (no eslint/prettier in devDependencies)
- No automated test framework configured (no jest/vitest in devDependencies)
