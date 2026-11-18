> **2026-11-17 状态注记：本仓已改为 Tinglan/猫/狗桌宠公开子集；许可为代码 PolyForm NC + 美术 CC BY-NC-SA。此旧文档保留为设计历史，若与根 LICENSE/LICENSE-ART/LICENSE-MIGRATION 冲突，以后者为准。**

# Famling Platform — one character core, multiple shells v0.1

Status: **design contract; not implemented.**
Date: 2026-11-14
Purpose: make Pearl run on desktop, mobile, and DSH-go without forking the character or the memory.

---

## 0. One line

**One character core, one renderer contract, many shells.**
The character owns state/tags/voice; the shell owns window/input/storage; the renderer owns pixels.

---

## 1. Layers

```
character-core      state, tags, expressions, voice lines, claims guard
    │
    ├── pet-brief   read-only Advisers adapter
    ├── renderer    CharacterRenderer (pixel / HD)
    ├── storage     encrypted save adapter
    └── voice       VoiceService provider (baked / system / cloud)
```

- `character-core` has no DOM, no Tauri, no network.
- `renderer` has no business logic.
- `pet-brief` has no writes.
- `storage` is platform-specific but the envelope is shared.
- `voice` is provider-injected; keys never enter the WebView.

---

## 2. CharacterRenderer contract

```ts
export interface CharacterRenderer {
  load(pack: CharacterPack): Promise<void>
  play(tag: string, opts?: { loop?: boolean; speed?: number }): Promise<void>
  setExpression(name: string): void
  setMouth(level: number): void
  setPosition(x: number, y: number): void
  hitTest(x: number, y: number): boolean
  destroy(): void
}

export interface CharacterPack {
  id: string                 // pet.pearl.pixel
  style: 'pixel-hero' | 'pixel-micro' | 'hd-chibi'
  canvas: [number, number]   // 96x96
  anchor: { x: number; y: number; mode: 'foot-center' }
  footBox: { x: number; y: number; w: number; h: number }
  palette: string            // pearl-pixel@0.1
  tags: Record<string, { frames: number; fps: number; loop: boolean }>
  assets: string[]           // PNG/WebM paths
  license: string
  ai: { status: 'none' | 'concept' | 'final'; tool?: string }
}
```

### 2.1 Rules

- `play(tag)` rejects unknown tags; no silent fallback to a wrong animation.
- `setExpression` is independent of `play`; a talking idle can be `calm + talk`.
- `hitTest` uses the visible silhouette, not the full 96×96 box.
- `destroy` releases image/video/texture memory.
- No renderer reads the file system directly; assets are passed in.

---

## 3. Platform matrix

| Concern | Desktop (Tauri) | Mobile (WebView) | DSH-go |
|---|---|---|---|
| Shell | Tauri 2 + WebView2 | Capacitor/WebView or native | TBD |
| Window | 480×272, borderless, bottom-right | full-screen/widget | TBD |
| Renderer | WebM/PNG + canvas/CSS | WebM/PNG + canvas | TBD |
| Storage | DPAPI / encrypted file | WebCrypto / Keychain | TBD |
| Voice | Rust proxy / baked | baked / platform TTS | TBD |
| Input | mouse drag/pat/PTT | touch drag/tap/PTT | TBD |
| Background | always-on-top optional | widget/live wallpaper | TBD |
| DPI | 100/125/150% integer 2× | devicePixelRatio | TBD |

**Rule:** no platform-specific art forks. The same `CharacterPack` is used everywhere; only display scale and input differ.

---

## 4. State and save envelope

```json
{
  "format": "famling-save",
  "version": 1,
  "characterId": "pearl",
  "savedAtMs": 0,
  "world": {},
  "memory": {},
  "pos": { "x": 0, "y": 0 },
  "cipher": "..."
}
```

- The envelope is shared; the cipher is platform-specific.
- No plaintext name/memory in the main file.
- Export/import uses a password-based portable format (PBKDF2 + AES-GCM).
- Delete clears main/backup/tmp; no silent retention.

---

## 5. Pet Brief adapter

- `PetBriefClient` reads JSON from stdout/file/socket.
- Validates schema, expiry, confidence, forbidden fields.
- Never writes to Advisers.
- If unavailable, idle; no retry storm.

See [`PET-BRIEF.md`](PET-BRIEF.md).

---

## 6. Voice adapter

```ts
export interface VoiceProvider {
  id: string
  synthesize(text: string): Promise<ArrayBuffer>
  billing: boolean
}
```

- Baked provider first; system TTS fallback; cloud optional.
- Key only in the shell (Rust/keychain), never in WebView.
- Subtitles always; PTT only; no always-on mic.
- No reasoning traces in TTS/subtitles/logs.

---

## 7. Tests

- Renderer contract: load/play/expression/mouth/hitTest/destroy.
- Tag validation: unknown tag rejects.
- Pixel: 1×/2×, integer scale, no AA; 100% DPI.
- Save: round-trip, wrong password, tamper, delete.
- Brief: valid/empty/expired/malformed/forbidden field.
- Voice: baked hit, system fallback, cloud disabled, quota.
- Platform smoke: desktop Tauri; mobile later; DSH-go later.

---

## 8. Non-goals

- No Live2D in v0.1.
- No ECS/physics engine.
- No per-platform character logic.
- No cloud account required.
- No direct database access from the renderer.
- No merging Advisers and Famling codebases.

---

## 9. Open questions

1. DSH-go's rendering/window/storage capabilities.
2. Mobile widget vs full-screen.
3. Whether the desktop window grows to 480×272.
4. Whether `CharacterPack` is JSON-only or a zip/manifest.
5. Who owns the renderer contract (Famling vs desktop-games).

Track in [`DECISIONS.md`](DECISIONS.md).
