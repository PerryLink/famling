# Pearl Look Test kit

Status: **placeholder harness; not final art.**
Use with [`../LOOK-TEST.md`](../LOOK-TEST.md) and [`record-template.md`](record-template.md).

---

## Files

| File | Purpose |
|---|---|
| `mock-480x272.html` | 480×272 pet-window mock; 1×/2× toggle; bbox/footBox/checkerboard; simulated DPI |
| `pearl-placeholder.svg` | Fallback placeholder if `pearl-hero-96.png` is missing |
| `record-template.md` | Internal agent review record sheet |

The HTML looks for `pearl-hero-96.png` first; if missing, it shows the SVG placeholder.

---

## Run

No server needed:

1. Open `mock-480x272.html` directly in a browser (`file://...`).
2. Or serve this folder if your browser blocks local files:

```sh
python3 -m http.server 8000
# http://localhost:8000/mock-480x272.html
```

Do not expose the server publicly.

---

## What to capture

For the Look Test, capture at **1× and 2×**:

1. 480×272 window at 100% DPI;
2. 125% DPI;
3. 150% DPI;
4. show bbox/footBox for one shot (QA only, not for participants);
5. optional: checkerboard shot to verify alpha.

Use the real hero (`pearl-hero-96.png`) for participant-facing shots. The SVG placeholder is only for layout/DPI QA.

---

## How to replace the placeholder

Put the real 96×96 PNG in this folder as:

```text
pearl-hero-96.png
```

The HTML will load it automatically; if it fails, it falls back to `pearl-placeholder.svg`.

Requirements for the real hero:
- 96×96 PNG, 1-bit alpha, no AA;
- 40 visible colors + transparent;
- 1px closed outline `#0b1220` (or approved fallback `#1b1612`);
- foot baseline at y=96; footBox 72×18;
- no text/logo/watermark inside the sprite.

---

## What not to do

- Do not use the placeholder or Look Test art in a store page / press kit / marketing.
- Do not call it final art.
- Do not start Phase 1a before the Look Test passes.
- Do not use the official DeepSeek logo/wordmark.

---

## Pass/fail

Use [`../LOOK-TEST.md`](../LOOK-TEST.md) §4 (canonical 8 metrics). Record in [`record-template.md`](record-template.md), then write a short result to `docs/look-test/2026-11-XX.md` as an **internal agent review** (reviewer = AI agent; no personal data, no participant counts).
