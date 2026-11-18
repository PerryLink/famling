# Pearl Phase 0 — review and decision v0.1

Date: 2026-11-14
Reviewer: Famling side
Source: `desktop-games` commit `65c0577` — "feat(art): Pearl hero pixel Phase 0 contract, placeholders and tools"
Status: **Phase 0 accepted with F1–F4 metadata fixes (F5 is a placeholder-art observation); Look Test art slice approved as prototype-only; Phase 1 not approved.**

---

## 0. Verdict

Phase 0 did what it promised:

- 96×96 hero spec exists;
- 40-color palette exists;
- placeholder frames + contact sheet + placeholder styleboard exist;
- hero exception documented;
- tools patched (`read_palette`, `contact_sheet.py`, `check_specs.py`);
- no runtime/kernel/save/voice changes;
- no final art.

I re-ran the tools from the repo:

```text
check_specs.py: 7 specs OK (pet.pearl.pixel = 7 states / 36 frames)
placehold.py: exit 0, 36 Pearl frames
validate_art.py: ok: 36 asset(s)
```

`git status` is clean; commit is local.

**Decision:** accept Phase 0; fix the metadata mismatches below (F1–F4; F5 is a placeholder-art observation, not a metadata fix); then run Look Test with a **real hero art slice** (2–4 days), not placeholder. Do not start Phase 1a.

---

## 1. Passes

| Item | Evidence | Verdict |
|---|---|---|
| Canvas/anchor/footBox | 96×96, anchor 48/96, footBox 72×18@bottom | Pass |
| Palette | 40 visible colors, no pure black/white, gold `#e0b35a` present | Pass |
| Hero exception | `style.yaml` `style.hero` + `ART-PIPELINE` hero paragraph | Pass |
| Placeholder | 36 frames; `validate_art.py` OK | Pass |
| Contact sheet | 8 idle frames, 2×, watermark | Pass |
| Styleboard | 1×/2×, palette swatches, 6 expression slots, 3-view slots | Pass (placeholder only) |
| Tools | `read_palette` fixed; `contact_sheet.py`; `check_specs.py` | Pass |
| Runtime | no kernel/save/voice changes | Pass |
| Git | clean tree, one commit | Pass |

---

## 2. Findings (F1–F5, no design blocker)

F1–F4 are metadata fixes; **F5 is a placeholder-art observation, not a metadata fix** (it does not change the contract).

### F1. `idle` is 12fps; contract says 8fps

- Spec: `idle.fps = 12`; styleboard says "idle 8 @12fps".
- Contract: `PEARL-CHARACTER.md` says 8fps; the plan itself notes 12fps is "偏急".
- 8 frames @12fps = 0.67s loop; @8fps = 1.0s.
- **Recommendation:** change `idle.fps` to 8 in spec + assets.csv + styleboard before Look Test; it is metadata-only. If the art director wants 12fps, change the contract instead and record why.

### F2. `bbox` is `[12,8,72,84]`; earlier draft said `[12,10,72,84]`

- Spec: y=8; plan §6 draft: y=10.
- The placeholder spray starts around y=10; y=8 leaves 2px top margin.
- **Recommendation:** accept `[12,8,72,84]` as the actual contract; update the plan §6 draft and `PEARL-CHARACTER.md` to 8. No art change.

### F3. `assets.csv` has 4 rows; spec has 7 states

- Spec: idle 8, pat 6, drag 4, land 4, talk 4, remind 6, sleep 4 = 36 frames.
- CSV: only idle/pat/drag/land = 22 frames.
- Phase 1a/1b only needs the first 4; talk/remind/sleep are Phase 1b/later.
- **Recommendation:** either
  - add 3 CSV rows for talk/remind/sleep with `review_status=deferred` (or `draft`), or
  - add `phase: "1a"|"1b"|"later"` to spec states and keep CSV to the current slice.
- Do this before Phase 1, not necessarily before Look Test.

### F4. Outline color is `#0b1220`, contract says `#1b1612`

- Spec/palette: `#0b1220`; `PEARL-CHARACTER.md`: `#1b1612`.
- Both are acceptable dark outlines; `#0b1220` is bluer and fits the DeepSeek palette.
- **Recommendation:** accept `#0b1220` for hero; update contract to allow `#0b1220` (primary) / `#1b1612` (fallback).

### F5. Placeholder reads "blue-haired girl with a bag", not "whale girl"

- Expected for a deterministic placeholder; it is not a design verdict.
- The tail is a teal polygon behind the bag; fin ears are visible; the pearl is visible.
- **Recommendation:** do not judge the character from placeholder; Look Test must use the real hero art.

---

## 3. Look Test decision

The other side's §19 says Look Test needs **real hero art** (1 hero + 8 idle + 2 expressions), 2–4 days, and asks for confirmation.

**Decision: approve the Look Test art slice as prototype-only, not Phase 1.**

Conditions:

1. **Prototype-only:** watermark/notes say "LOOK TEST — NOT FINAL ART"; no store/marketing/press; no commercial release.
2. **Scope:** 1 static 96×96 hero + 8-frame idle + 2 expressions (`calm`, `pleased` or `happy`); optionally 1 `remind` still.
3. **Mock:** 480×272, 1× and 2×, 100%/125%/150% DPI.
4. **No kernel/save/voice changes.**
5. **License/brand:** if Famling is a separate commercial entity, treat this slice as clean-room/prototype and do not ship; the written license/brand decision is still required before Phase 1.
6. **Fixes first:** F1 (8fps) and F2 (bbox) should be applied before the Look Test asset is cut; F3 can wait until Phase 1.

If the Look Test passes, approve **Phase 1a only** (3-view + 6 expressions + idle 8 + pat 6, 14 frames), then review again.

---

## 4. What not to do

- Do not start Phase 1a's 14 frames before Look Test.
- Do not call the placeholder or Look Test art final.
- Do not add 128×128 runtime, HD chibi, Live2D, or Famling integration.
- Do not ship commercial art while entity/license/brand are unresolved.
- Do not use the official DeepSeek logo/wordmark.

---

## 5. Next actions

| Owner | Action |
|---|---|
| Desktop Games | Fix F1/F2; add F3 plan; create Look Test art slice (2–4 days); capture 480×272 @1×/2×/DPI |
| Famling | Run `LOOK-TEST.md` with 5 users; record in `docs/look-test/`; review results |
| User | Decide entity/license and public brand before Phase 1; confirm 8fps |

> **Later same day (2026-11-14):** the external 5-person Look Test plan in this section is **cancelled**; the user authorized an **internal AI-agent review** as the sole reviewer. See [`LOOK-TEST.md`](LOOK-TEST.md) §2/§4 and [`DECISIONS.md`](DECISIONS.md) §13. The "5 users" wording is kept as the pre-decision plan for the record.

---

## 6. Follow-up 2026-11-14 17:00 — commit `709cf77`

The Desktop Games session completed the Phase 0 follow-up + scaffolding:

| Item | Result |
|---|---|
| F1 idle 8fps | ✅ spec / `assets.csv` / styleboard / docs aligned |
| F2 bbox 8 | ✅ accepted `[12,8,72,84]` |
| F3 states/CSV | ✅ 7 states / 36 frames / 7 CSV rows (`talk/remind/sleep` = `deferred`) |
| F4 outline | ✅ `#0b1220` primary / `#1b1612` fallback |
| `src/pet/hero.ts` | ✅ CharacterPack loader + CharacterRenderer + 1×/2× + unknown tag/scale rejection |
| Placeholder pack | ✅ `public/assets/pet/pearl-placeholder/` 36 PNG + manifest |
| 480×272 shell | ✅ `--pet-size=480x272`; default stays 480×240; no overflow |
| Look Test harness | ✅ `docs/look-test/mock-480x272.html` + 1×/2×/100/125/150 DPI shots; placeholder only |
| Tests | ✅ `npm test` 133/133; preflight 5/5; check_specs 7; validate 62 |
| Runtime safety | ✅ no kernel/save/voice changes; `pet.fold`/480/960 untouched |
| Git | ✅ clean, commit `709cf77` |

### Findings

1. **F1–F4 are fixed.** This closes the Phase 0 metadata findings.
2. **`hero.ts` is a module, not yet wired into `pet.html`/`main.ts`.** The actual pet window still shows 折角; only the Look Test harness uses `hero.bundle.js`. That is consistent with "pure visual hero layer, Phase 2 integration later" — do not call Pearl "integrated" yet.
3. **The 480×272 screenshot is 折角, not Pearl.** The Pearl shots are harness/placeholder only. Do not use them as "Pearl in the app".
4. **Manifest shape differs from the first Famling contract.** The implementation uses `id/style/canvas/anchor/footBox/palette/tags/assets/license/ai` without `format/version/displayScale/bbox`. The Famling contract is now aligned to the implemented shape (`CHARACTER-PACK.md` v0.2); adding `format/version/displayScale` is a Phase 2 hardening item, not a blocker.
5. **No real hero art, no 5-person test.** The session correctly reports both as blockers; it did not fake them.

### Verdict

- **Accept** commit `709cf77` as Phase 0 + Phase 2 scaffolding.
- **Look Test is still not runnable for participants**: it needs the real hero (1×96 + 8f idle + 2 expressions, 2–4 days) and 5 users.
- **Phase 1a remains unapproved.**
- **Commercial license/brand remain blockers.**

### Next

| Owner | Action |
|---|---|
| Desktop Games | optional: add `format/version/displayScale` to manifest; keep `hero.ts` unwired until Phase 2; do not fake real art |
| Famling | update status/contract (done); prepare real-hero art brief; run Look Test when art exists |
| User | provide/commission real hero; decide entity/license/brand |

> **Superseded later on 2026-11-14 (after this 17:00 follow-up):** the external 5-person Look Test was **cancelled**; the user authorized the **internal AI-agent review** as the sole reviewer. "5 users" in the §6 text above is the pre-decision plan, kept as history; it is not a current action. The review method is now canonical in [`LOOK-TEST.md`](LOOK-TEST.md) §2/§4.

---

## 7. Links

- [`PEARL-CHARACTER.md`](PEARL-CHARACTER.md)
- [`CHARACTER-PACK.md`](CHARACTER-PACK.md)
- [`LOOK-TEST.md`](LOOK-TEST.md)
- [`DECISIONS.md`](DECISIONS.md)
- [`STATUS.md`](STATUS.md)
- `desktop-games/docs/PEARL-HERO-PIXEL-PLAN-2026-11-14.md`
