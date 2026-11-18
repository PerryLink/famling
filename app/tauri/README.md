# Tauri host (scaffold)

Status: **scaffold only** — this WSL image has no Rust toolchain, so it has not
been compiled. Electron was actually run on this machine; Tauri is the host we
would build before shipping a low-footprint background pet.

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
