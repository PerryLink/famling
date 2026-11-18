# Phase 1a acceptance checklist — Pearl hero pixel v0.1

Date: 2026-11-14
Scope: 3-view + 6 expressions + `idle 8` + `pat 6` = **14 production frames**.
Status: **not started; Phase 1a is blocked until Look Test passes + F1–F4 fixed.**

---

## 0. Preconditions

- [ ] Look Test pass per [`LOOK-TEST.md`](LOOK-TEST.md) §4 (the canonical 8 metrics). The review is an **internal agent review** (user-authorized 2026-11-14; replaces the cancelled external 5-person panel).
- [ ] F1 idle 8fps applied (or 12fps deliberately approved and contract updated).
- [ ] F2 bbox `[12,8,72,84]` aligned in plan + spec + contract.
- [ ] F3 `assets.csv` / states `phase` aligned (talk/remind/sleep deferred or rows added).
- [ ] F4 outline `#0b1220` primary / `#1b1612` fallback aligned.
- [ ] License/brand decision recorded; if Famling is a separate commercial entity, Phase 1a is prototype-only until written license/clean-room.
- [ ] Real hero art source is authorized (human/AI with provenance).

If any is unchecked, do not start the 14 frames.

---

## 1. Deliverables

### 1.1 Three-view

- [ ] Front, side, back at 96×96; same height/width/proportions.
- [ ] Head height ≈32px; 2.6 heads; eye line, fin ears, fluke, pearl, bag/ledger positions consistent.
- [ ] No text/logo/watermark inside the sprite.
- [ ] Aseprite source exists; PNG-8 export; 1-bit alpha.

### 1.2 Six expressions

- [ ] `calm`
- [ ] `pleased`
- [ ] `happy`
- [ ] `sleepy`
- [ ] `surprised`
- [ ] `listening`

Each expression is a still/frame set at 96×96; eyes are 4–5px; no expression relies on text.

### 1.3 Idle (8 frames, 8fps, loop)

- [ ] Breathing 1–2px; tail sway; blink 2 frames; optional small spout.
- [ ] First frame == last frame (pixel diff 0).
- [ ] Foot baseline fixed; no horizontal drift.
- [ ] Head height/eye position stable ±1px.

### 1.4 Pat (6 frames, 10fps, once)

- [ ] Surprise → lean into hand → pleased → tail up → hold → settle.
- [ ] Last frame can return to idle.
- [ ] No blush/heart/romantic cues.

### 1.5 Supporting assets

- [ ] `art/assets.csv` rows for `pet.pearl.idle`/`pat` with `license` non-TBD, `review_status=approved` only after sign-off.
- [ ] `public/assets/pet/pearl/pixel/manifest.json` per [`CHARACTER-PACK.md`](CHARACTER-PACK.md).
- [ ] Contact sheet at 1× and 2×, watermark `PHASE 1a — NOT FINAL`.
- [ ] Aseprite source not in the shipped package.

---

## 2. Acceptance

### A. Contract

- [ ] 96×96 all frames; no per-frame trim.
- [ ] `anchor=(48,96)`, `footBox=72×18`, `bbox=[12,8,72,84]`.
- [ ] `pet.fold` micro and 480/960 scene specs unchanged.

### B. Silhouette

- [ ] Pure-black fill reads "whale girl + fluke + fin ears" in 3 seconds.
- [ ] 1× and 2× both readable.
- [ ] 2× uses solid 2×2 blocks, no blur.

### C. Outline / alpha / colors

- [ ] 1px closed outline, 4-connected, no gaps.
- [ ] Outline `#0b1220` (or approved `#1b1612`), no pure black/white.
- [ ] Alpha only {0,255}; no AA/semi-transparency.
- [ ] ≤40 visible colors + transparent (validate `--max-colors 41`).
- [ ] No `#000000`/`#ffffff`; alpha=0 is `(0,0,0,0)`.

### D. Frame consistency

- [ ] Head height/width stable ±1px across frames.
- [ ] Eye position ±1px; tail root fixed.
- [ ] Palette/color IDs do not drift.
- [ ] Foot baseline fixed; `land` not in this phase.

### E. Animation metadata

- [ ] `idle`: 8 frames, 8fps, loop.
- [ ] `pat`: 6 frames, 10fps, once.
- [ ] Manifest tags match spec/assets.csv exactly.
- [ ] `idle` first/last diff=0; `pat` last frame returns to idle.

### F. Integration readiness

- [ ] `CharacterPack` manifest validates.
- [ ] 1×/2× display works in the 480×272 mock.
- [ ] 100% DPI pass; 125%/150% captured.
- [ ] `hitTest` aligns with footBox ±1px.
- [ ] No kernel/save/voice changes.

### G. License / provenance

- [ ] `assets.csv` license non-TBD.
- [ ] AI provenance (if used): model/tool/seed/date/prompt version.
- [ ] No official DeepSeek logo/wordmark; "非官方" noted.
- [ ] Not shipped to store/marketing until Phase 2 and legal review.

---

## 3. Review gate

| Reviewer | Checks |
|---|---|
| Desktop Games | contract/tools/build; 1×/2×; atlas/manifest; no runtime changes |
| Famling | character bible, silhouette, tone, no ownership/emotional cues, IP boundary |
| User | "is this Pearl?" and "would you keep it?" |

**Pass**: all A–G checked; 2/3 reviewers approve; no blocker.
**Conditional**: only cosmetic issues; fix within 2 days; re-review one frame set.
**Fail**: silhouette/identity off, palette drift, frame baseline broken, or license unclear; return to design, don't start 1b.

---

## 4. Out of scope

- `drag`, `land`, `talk`, `remind`, `sleep` (Phase 1b/later).
- Runtime integration, 480×272 code, voice, identity rewrite.
- Final marketing art, store page, capsule, HD chibi, Live2D.
- Commercial release.

---

## 5. Estimate

- 3-view + 6 expressions + idle 8 + pat 6: **4–6 person-days** (human cleanup).
- Add 1–2 days buffer for palette/frame fixes.
- Do not start 1b until 1a sign-off.

---

## 6. Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| Desktop Games | | | |
| Famling | | | |
| User | | | |

Notes:
