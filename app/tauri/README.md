# Tauri host (scaffold)

Status: **scaffold only** — this build image has no Rust toolchain, so the host
has not been compiled here (including the 0.2.1 native lifecycle below). Electron
was actually run on this machine; Tauri is the host we would build before
shipping a low-footprint background pet.

## Why this host

| Host | Measured / expected | Steam | Risk |
|---|---|---|---|
| Electron (built) | **394 MB** working set on this machine | `steamworks-ffi-node` | memory |
| Tauri 2 (this scaffold) | ~100–250 MB expected; ~10 MB installer + WebView2 | `steamworks-rs` | WebView2/Deck, no `forward` cursor events |
| Godot 4 | ~80–150 MB expected | GodotSteam (best Deck) | loses Cordis for game logic |

## Architecture

```
Tauri (Rust)                          WebView2
  window / tray / autostart   <-->   Cordis kernel (browser-safe, no node: imports)
  fs: saves                            PixiJS / DOM renderer
  steamworks-rs: ownership           HostPorts: storage / entitlement / clock
  Auto-Cloud files                   save files
```

The kernel never imports Node or Tauri. The browser build already proves it runs
without `node:` APIs; the Rust side only supplies host ports and Steam.

## Native lifecycle (0.2.1)

Implemented in `src-tauri/src/main.rs`; **code-reviewed only** in this
environment (no Rust toolchain), so a Windows `cargo check` / `tauri build` is
still required before release.

- **Single instance (Windows).** A named kernel mutex
  (`Local\Famling.SingleInstance.v1`) is created with `windows-sys`
  (`Win32_System_Threading`), no extra crate. When another instance already
  runs, the new process finds the existing pet window by its configured title
  (`Famling · 汀岚`), calls `ShowWindow(SW_SHOW)` + `SetForegroundWindow`, then
  exits 0. Non-Windows is a no-op; mutex failure fails open.
- **System tray.** Enabled through the Tauri `tray-icon` feature: app default
  window icon plus a menu with `显示/召回` (show + focus the pet) and `退出`
  (`app.exit(0)`). Creation is fail-soft: errors go to stderr and startup
  continues; no ACL/permission changes.
- **Crash export.** A Rust panic hook installed before the builder writes one
  JSON report to `%APPDATA%\Famling\crashes\crash-<epoch>.json`
  (`version`/`timestamp`/`thread`/`message`/`location`). Text is bounded,
  user-path prefixes are redacted, no env vars or CLI args are recorded, and a
  re-entry guard plus `catch_unwind` keep the hook from recursing or panicking.

## Build (on Windows, with Rust + WebView2)

```powershell
rustup target add x86_64-pc-windows-msvc
npm i -D @tauri-apps/cli
npx tauri dev
```

`src-tauri/capabilities/default.json` grants `core:default`; add narrower
permissions when commands grow.

## What is already prepared

- `GameHost`/`HostSnapshot` contract is transport-agnostic (`src/host/game-host.ts`).
- Content pack discovery (`src/pack/discovery.ts`) and `SteamSession`
  (`src/host/steam.ts`) are testable without Steam or Rust.
- The frontend can load `index.html` / `world.html` / `presence.html` unchanged.

## What is stubbed

- `write_save`, `steam_status` in `src-tauri/src/main.rs`.
- No `@tauri-apps/cli` dependency in the root `package.json` yet; add it only
  when a Rust toolchain is available.
