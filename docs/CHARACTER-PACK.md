# Character Pack — `pet.pearl.pixel` v0.2

Status: **contract aligned with the 2026-11-14 implementation (`src/pet/hero.ts` + placeholder manifest).**
Date: 2026-11-14
Use with: [`PEARL-CHARACTER.md`](PEARL-CHARACTER.md), [`PLATFORM.md`](PLATFORM.md), and `desktop-games/art/specs/pet.pearl.pixel.json`.

---

## 0. One line

**The spec is the art contract; the Character Pack is the runtime manifest.**
Spec says what to draw; pack says what the renderer loads.

---

## 1. Directory layout

Current placeholder pack (flat files, tag-prefixed):

```text
public/assets/pet/pearl-placeholder/
  manifest.json
  idle_00.png ... idle_07.png
  pat_00.png ... pat_05.png
  drag_00.png ... drag_03.png
  land_00.png ... land_03.png
  talk_00.png ... talk_03.png
  remind_00.png ... remind_05.png
  sleep_00.png ... sleep_03.png
```

Production pack (same shape, different directory):

```text
public/assets/pet/pearl/pixel/
  manifest.json
  idle_00.png ...
```

- 96×96 PNG, 1-bit alpha, no AA.
- Do not trim frames; fixed canvas + union bbox.
- Aseprite sources stay outside the package (`art/_src/`).
- Placeholder packs are not shipped.

---

## 2. Manifest (implemented shape)

```json
{
  "id": "pet.pearl.pixel",
  "style": "pixel-hero",
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": { "x": -36, "y": -18, "w": 72, "h": 18 },
  "palette": "pearl-pixel@0.1",
  "tags": {
    "idle":   { "frames": 8, "fps": 8,  "loop": true,  "phase": "1a" },
    "pat":    { "frames": 6, "fps": 10, "loop": false, "phase": "1a" },
    "drag":   { "frames": 4, "fps": 8,  "loop": true,  "phase": "1b" },
    "land":   { "frames": 4, "fps": 12, "loop": false, "phase": "1b" },
    "talk":   { "frames": 4, "fps": 12, "loop": true,  "phase": "later" },
    "remind": { "frames": 6, "fps": 10, "loop": false, "phase": "later" },
    "sleep":  { "frames": 4, "fps": 2,  "loop": true,  "phase": "later" }
  },
  "assets": [
    "idle_00.png", "idle_01.png", "idle_02.png", "idle_03.png",
    "idle_04.png", "idle_05.png", "idle_06.png", "idle_07.png",
    "pat_00.png", "pat_01.png", "pat_02.png", "pat_03.png", "pat_04.png", "pat_05.png",
    "drag_00.png", "drag_01.png", "drag_02.png", "drag_03.png",
    "land_00.png", "land_01.png", "land_02.png", "land_03.png",
    "talk_00.png", "talk_01.png", "talk_02.png", "talk_03.png",
    "remind_00.png", "remind_01.png", "remind_02.png", "remind_03.png", "remind_04.png", "remind_05.png",
    "sleep_00.png", "sleep_01.png", "sleep_02.png", "sleep_03.png"
  ],
  "license": "placeholder-only: deterministic placeholders; not final art; commercial use not granted",
  "ai": { "status": "none" },
  "placeholder": true,
  "sourceSpec": "art/specs/pet.pearl.pixel.json",
  "generator": "scripts/placehold.py"
}
```

### 2.1 Rules (implemented)

- `id` must be `pet.pearl.pixel`.
- `style` must be `pixel-hero` (current implementation also accepts `pixel-micro`/`hd-chibi` for future).
- `canvas` must be `[96,96]` for Pearl.
- `anchor` / `footBox` are required and numeric.
- `palette` must be a non-empty string.
- `tags` must contain at least `idle`; each tag has `frames` (positive int), `fps` (≥0), `loop` (boolean), optional `phase` (`1a`/`1b`/`later`).
- `assets` must be a non-empty flat array; **length must equal the sum of all tag frames**.
- Assets are grouped **in tag insertion order**: idle's files first, then pat, drag, land, talk, remind, sleep. Do not reorder without updating the manifest.
- `license` must not be `TBD`; placeholder-only until Phase 1 approval.
- `ai.status` is `none` for deterministic placeholders; `concept`/`final` requires provenance.
- `placeholder`, `sourceSpec`, `generator` are optional metadata.

### 2.2 Phase 2 hardening (recommended, not implemented)

Add:
- `format: "famling-character-pack"` and `version: 1`;
- `displayScale: 2`;
- optional `bbox` / `colors` for cross-check.

The current `src/pet/hero.ts` validates the simpler shape above; adding `format`/`version` is a small follow-up, not a blocker for the Look Test.

---

## 3. Loader contract (implemented)

```ts
interface CharacterPackData {
  id: string
  style: 'pixel-hero' | 'pixel-micro' | 'hd-chibi'
  canvas: [number, number]
  anchor: { x: number; y: number; mode: string }
  footBox: { x: number; y: number; w: number; h: number }
  palette: string
  tags: Record<string, {
    frames: number
    fps: number
    loop: boolean
    phase?: '1a' | '1b' | 'later'
  }>
  assets: string[]
  license: string
  ai: { status: 'none' | 'concept' | 'final'; tool?: string }
  placeholder?: boolean
  sourceSpec?: string
  generator?: string
}

interface CharacterRenderer {
  load(pack: LoadedCharacterPack): Promise<void>
  play(tag: string, opts?: { loop?: boolean; speed?: number }): Promise<void>
  renderStill(tag: string, frame?: number): void
  setScale(scale: 1 | 2): void
  setExpression(name: string): void
  setMouth(level: number): void
  setPosition(x: number, y: number): void
  hitTest(x: number, y: number): boolean
  stop(): void
  destroy(): void
}
```

### 3.1 Loader steps

1. Fetch `<base>/manifest.json`.
2. Validate `id`/`style`/`canvas`/`anchor`/`footBox`/`palette`/`tags`/`assets`/`license`/`ai`.
3. Check `assets.length === sum(tag.frames)`.
4. Group `assetUrls` by tag order.
5. Preload all frames (36 is small) or idle/pat first.
6. Reject if any required file is missing or has wrong dimensions.
7. Never read the file system from the renderer; the shell passes URLs/blobs.

### 3.2 Render rules

- Integer scale only: 1× (96 CSS px) or 2× (192 CSS px).
- `imageSmoothingEnabled = false`; `image-rendering: pixelated`; no CSS filters/blur.
- Anchor/footBox from the manifest, not from image bounds.
- `hitTest` uses the footBox/bbox first; alpha hit-test can come later.
- `idle` loops; `pat`/`land` play once; `drag` loops while dragging.
- Unknown tag throws `CharacterPackError`; no silent fallback.
- `destroy` releases images and stops the RAF loop.

---

## 4. 480×272 layout

| Item | Value |
|---|---|
| Window | 480×272 (`--pet-size=480x272`; default stays 480×240) |
| Hero 1× | 96×96, bottom 16, right 16 |
| Hero 2× | 192×192, bottom 16, right 16 |
| Foot baseline | window bottom − 16 |
| bbox | `[12,8,72,84]` in 96-space |
| footBox | `72×18` in 96-space |

At 2× the hero is 192×192; the 480×272 window has enough room. The 480×240 default still uses 折角's DOM/CSS until Pearl is integrated in Phase 2.

---

## 5. Failure modes

| Failure | Behavior |
|---|---|
| manifest 404 | show nothing; log once; no retry storm |
| invalid JSON | reject |
| wrong id/style/canvas | reject |
| unknown tag | throw; do not silently play idle |
| assets length mismatch | reject |
| missing file | reject the pack |
| non-integer scale | reject; only 1×/2× |
| license TBD | refuse to ship; dev-only |

---

## 6. Tests

Current `tests/hero.test.ts` locks:
- spec / `assets.csv` / manifest three-way alignment (7 states / 36 frames / 7 rows);
- F1 (idle 8fps), F2 (bbox 8), F4 (outline `#0b1220`), 40-color palette;
- unknown tag/scale rejection; frame index loop/clamp.

Add later:
- missing file / bad canvas / assets mismatch;
- 1×/2× canvas size;
- idle loop first/last diff=0;
- pat/land return to idle;
- footBox hitTest;
- destroy releases images;
- no kernel/save/voice import.

---

## 7. Non-goals

- No atlas optimization in v0.1 (36 PNGs are small).
- No WebM/HD in the pixel pack.
- No per-frame trim.
- No automatic DPI scaling beyond 1×/2×.
- No runtime art generation.
