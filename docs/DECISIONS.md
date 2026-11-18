> **2026-11-17 状态注记：本仓已改为 Tinglan/猫/狗桌宠公开子集；许可为代码 PolyForm NC + 美术 CC BY-NC-SA。此旧文档保留为设计历史，若与根 LICENSE/LICENSE-ART/LICENSE-MIGRATION 冲突，以后者为准。**

# Decisions — Pearl / Famling v0.1

Status: **open; Phase 0 can proceed with the recommended defaults, Phase 1 is blocked on #1–#4. On 2026-11-14 the license layer, GitHub visibility, Look Test reviewer method, art direction, and name-fallback risk were decided (see §13); the entity/commercial scope and the exact fallback name remain open.**
Date: 2026-11-14
Purpose: one place for the decisions that the pixel plan, the character bible, and the license review all depend on.

> This is a decision log, not legal advice. "Recommended" is a product/engineering recommendation; entity/license/brand decisions need the owner and, where needed, a lawyer.

---

## 0. Minimum to proceed

| Phase | Can start now? | Condition |
|---|---|---|
| Phase 0: spec + palette + placeholder + contact sheet + styleboard | **Yes** | Approve 96×96, 40 colors, tools patch, visual-only Pearl |
| Look Test: 1 hero + 8f idle + 2 expressions | **Yes** | Phase 0 artifacts |
| Phase 1: 22 frames + 3-view + 6 expressions | **No** | Look Test pass + decisions #1–#4 |
| Phase 2: runtime integration | **No** | Phase 1 art approved + layout decision #8 |
| Famling commercial release | **No** | Written license/clean-room for `desktop-games` code + brand clearance + name fallback + legal review |

---

## 1. Entity and license (blocker)

**Question:** Is Famling a personal/noncommercial project, the same legal entity as PerryLink, or a separate commercial entity?

| Option | Consequence | Recommendation |
|---|---|---|
| Same person / noncommercial | PolyForm NC does not restrict the copyright owner; prototype is fine; still clarify art ownership | OK for Phase 0/1 prototype |
| Separate commercial entity | `desktop-games` code, scripts, and maybe assets need a written commercial license or clean-room | **Do not start Phase 1 until resolved** |
| Same entity, commercial | Need written clarification that the entity is the copyright owner; art license still TBD | Get it in writing |

**Recommendation:** treat Pearl as a **noncommercial prototype** until the entity/license is written. Do not spend 7–13 person-days on art that may not be commercially usable.

**2026-11-14 decision — license layers (partial resolution):** the Famling / 留屿园 desktop companion (this repository) was **Apache-2.0** historically; **superseded 2026-11-17: PolyForm NC code + CC BY-NC-SA art**, while `desktop-games` and its other games stay **PolyForm Noncommercial 1.0.0**; art assets follow their own source terms. Apache-2.0 applies only to this repository's own content and does **not** grant rights to `desktop-games` code. The entity/commercial-scope question is still open — see §13.1.

**Owner:** user / PerryLink.
**Status:** license layers decided 2026-11-14; entity/commercial scope still open.

---

## 2. Public brand / DeepSeek IP (blocker)

**Question:** Does Pearl stay publicly "DeepSeek 鲸鱼娘"?

| Option | Risk | Recommendation |
|---|---|---|
| Public "DeepSeek 鲸鱼娘（非官方）" | Trademark/association risk; may imply endorsement | Allowed for fan/noncommercial with disclaimer; not for commercial product name |
| Public "Pearl / 深海鲸娘" | Lower association risk; loses "DeepSeek" search term | **Recommended for commercial** |
| Use official logo/wordmark | High risk; don't | **Never** |

**Rules:**
- No official DeepSeek logo/wordmark in character, UI, store page.
- No "official / partner / authorized".
- Keep "DeepSeek 鲸鱼娘" as an internal/descriptive term only; commercial product uses Pearl.
- Legal review before commercial release.

**Owner:** user.
**Status:** open; name-fallback risk added 2026-11-14 (see §13.5, not resolved).

---

## 3. Canvas (blocker for Phase 1 scope)

**Question:** 96×96 runtime only, or also 128×128 close-up?

| Option | Consequence | Recommendation |
|---|---|---|
| 96×96 runtime | 2× = 192; fits 480×272; 6 expressions near lower bound | **Recommended** |
| 128×128 runtime | 2× = 256; does not fit 480×240/272; needs ≥480×300 | Not now |
| 128×128 key art only | Marketing/close-up; no runtime cost | Allowed later, +2–3 days |

**Recommendation:** 96×96 now; 128 key art after Look Test, if needed.
**Owner:** art/engineering.
**Status:** recommended; needs approval.

---

## 4. Colors (blocker for validation)

**Question:** 40 visible + transparent, ≤24, or 48?

| Option | Consequence | Recommendation |
|---|---|---|
| 40 visible + transparent (validate 41) | Fits 96px; room for shading/expressions; requires hero exception | **Recommended** |
| ≤24 | Closer to existing rule; likely too tight for 6 expressions | Not recommended |
| 48 visible (validate 49) | More shading; overkill at 96px; more cleanup | Not recommended |

**Recommendation:** 40 visible + transparent; document hero exception in `style.yaml` and `ART-PIPELINE.md`; validate `--max-colors 41`.
**Owner:** art director/user.
**Status:** recommended; needs approval.

---

## 5. Identity scope (blocker for code)

**Question:** Pure visual Pearl, or full rename (text/voice/save)?

| Option | Consequence | Recommendation |
|---|---|---|
| Pure visual Pearl; text/voice/save still 折角 | No kernel/save/voice changes; fastest; temporary inconsistency | **Recommended for Phase 0/1** |
| Full Pearl rename | Touches frozen kernel/save/voice; 2–4 days + product decision | Separate later phase |
| Both | Highest risk of scope creep | No |

**Recommendation:** pure visual first; identity change is a separate decision after the visual slice proves appeal.
**Owner:** product/user.
**Status:** recommended.

---

## 6. Window / layout (Phase 2)

**Question:** 480×272 window, or hero-first layout?

| Option | Consequence | Recommendation |
|---|---|---|
| 480×240 → 480×272 (+32px) | Minimal code; 96@2×=192 fits; changes window size | **Recommended** |
| Hero-first layout | No window size change; compresses header/sidebar; more UI work | Fallback |
| 1× 96 | Fits easily; character looks small | Not recommended for hero |

**Recommendation:** 480×272; test 100% DPI first, 125%/150% later.
**Owner:** engineering/product.
**Status:** Phase 2 decision.

---

## 7. AI policy (Phase 1)

**Question:** Is AI allowed for concept/draft, and which models?

| Option | Consequence | Recommendation |
|---|---|---|
| AI concept/draft + human final | Fits ART-PIPELINE; provenance needed | **Recommended** |
| AI final frames | Frame consistency poor; not recommended | No |
| No AI | Slower/expensive; okay for final key art | Acceptable |

**Rules:** SDXL / FLUX schnell (commercial-safe) for concepts; no FLUX dev; no unknown LoRA; record model/seed/prompt/date; disclose AI content where required.
**Owner:** art/legal.
**Status:** open.

---

## 8. Voice (Phase 1/2)

**Question:** Pre-generated DeepSeek TTS, system TTS, or a human voice actor?

| Option | Consequence | Recommendation |
|---|---|---|
| Pre-generated DeepSeek TTS `stella` | Cheap, consistent, no cloning; limited emotion | **Recommended for MVP** |
| System TTS | Free/offline; voice quality varies | Fallback only |
| Human voice actor | Best quality; cost/time | Later, if商业化 |

**Rules:** subtitles always; PTT only; no always-on mic; no free chat; no reasoning to TTS.
**Owner:** product/audio.
**Status:** recommended.

---

## 9. Pet Brief ownership (Phase 2)

**Question:** Who owns the `Pet Brief` schema and command?

| Option | Consequence | Recommendation |
|---|---|---|
| Advisers owns schema; Famling validates | Clear source of truth; versioned | **Recommended** |
| Famling owns schema | Advisers must conform; coupling | No |
| Shared repo | Extra coordination | Later |

**Recommendation:** Advisers owns the producer; Famling owns the consumer validator; version in `schemaVersion`.
**Owner:** Advisers/Famling.
**Status:** open; see [`PET-BRIEF.md`](PET-BRIEF.md).

---

## 10. Platform order (Phase 3)

**Question:** Desktop first, or desktop + mobile + DSH-go in parallel?

| Option | Consequence | Recommendation |
|---|---|---|
| Desktop Tauri first | Fastest validation; reuses shell | **Recommended** |
| Desktop + mobile | More surface; mobile art/voice constraints | After desktop gate |
| Desktop + DSH-go | DSH-go interface unknown; adapter risk | After renderer contract |

**Recommendation:** desktop first; keep `CharacterRenderer` platform-agnostic; mobile/DSH-go adapters after the desktop Look Test/Phase 2.
**Owner:** engineering.
**Status:** Phase 3.

---

## 11. Decision summary

| # | Decision | Recommended | Status |
|---|---|---|---|
| 1 | Entity/license | Noncommercial prototype until written | **Blocker** |
| 2 | Public brand | Pearl / 深海鲸娘; no official logo | **Blocker** |
| 3 | Canvas | 96×96 runtime; 128 key art later | Recommended |
| 4 | Colors | 40 visible + transparent (validate 41) | Recommended |
| 5 | Identity | Pure visual Pearl; 折角 text/voice/save | Recommended |
| 6 | Window | 480×272 | Phase 2 |
| 7 | AI | Concept/draft + human final; commercial-safe models | Open |
| 8 | Voice | Baked DeepSeek TTS; PTT | Recommended |
| 9 | Brief | Advisers producer, Famling validator | Open |
| 10 | Platform | Desktop first; renderer contract | Phase 3 |
| 11 | Famling license layer | **Superseded 2026-11-17: PolyForm NC code + CC BY-NC-SA art**; `desktop-games` + other games = PolyForm NC 1.0.0; art per source | **Decided 2026-11-14; updated 2026-11-17** |
| 12 | GitHub visibility | `PerryLink/famling` temporarily private; public GitHub/npm launch later | **Decided 2026-11-14** |
| 13 | Look Test reviewer | Internal AI-agent review (external 5-person panel cancelled) | **Decided 2026-11-14** |
| 14 | Art direction | Design from community chibi ref #10; render with pixel texture of ref #05; references are placeholders only | **Decided 2026-11-14** |
| 15 | Name fallback | Undecided; candidates 留屿 / 玩伴岛 / 灯屿 / Pearl / 深海鲸娘; trademark + domain checks needed | **Open** |

**Minimum go for Phase 0 + Look Test:** #1 (prototype only), #3, #4, #5 approved. Phase 1 additionally needs #1 (written), #2, #3, #4, #5.

---

## 12. 2026-11-14 update (commit 709cf77)

- **Canvas 96×96** implemented; 128×128 remains key-art only.
- **40 visible colors + transparent** implemented; hero exception documented; validate 41.
- **Pure visual Pearl** implemented as a module/placeholder pack; `pet.html` still shows 折角 until Phase 2.
- **480×272** implemented behind `--pet-size=480x272`; default 480×240 preserved.
- **8fps idle** applied; F1–F4 closed.
- **Manifest**: implemented shape uses `id/style/canvas/anchor/footBox/palette/tags/assets/license/ai`; `format/version/displayScale` are Phase 2 hardening.
- **Still open**: entity/commercial scope (#1), public brand (#2), name fallback (#15), real hero art, internal agent review (not yet run — needs real hero art), Phase 1a approval, commercial release.

---

## 13. 2026-11-14 user decisions (license / visibility / review / art / name)

Date: 2026-11-14. Authority: project owner (PerryLink). These decisions override earlier "recommended" defaults where they overlap. This is still not legal advice.

### 13.1 License layers — Famling Apache-2.0, desktop-games PolyForm NC

- **Famling / 留屿园 desktop companion = Apache License 2.0** (this repository: docs, design contracts, placeholder art, code), chosen to maximize adoption/impact.
- **`desktop-games` base and its other game content = PolyForm Noncommercial License 1.0.0**, unchanged. Those other games may be commercialized later, so **do not relicense them**.
- **No cross-contamination:** Apache-2.0 on this repo does not relicense `desktop-games` code, scripts, or game assets; commercial use of that code still needs a written license or a clean-room implementation.
- **Art assets:** licensed per source. Placeholder art here is internal-Look-Test-only; final art needs human/authorized artists with recorded provenance.
- **Implemented in this change:** `LICENSE` = PolyForm NC full text; `LICENSE-ART` = CC BY-NC-SA; `package.json` `license = "PolyForm-Noncommercial-1.0.0"`; README license section. Old Apache text is historical only.
- **Known discrepancy (2026-11-14):** the already-published npm packages `famling@0.0.2` and `dsh-famling@0.0.1` still declare **MIT** in the registry; this change does not publish (and published metadata is immutable without a new version). A future npm release must carry `Apache-2.0`.
- **Still open:** the entity/commercial-scope question (#1). Apache-2.0 fixes the repository license, not the commercial relationship.

### 13.2 GitHub repository is temporarily private

- `PerryLink/famling` was **public**, changed to **private** on 2026-11-14 through the GitHub API (before: `private=false`, `visibility=public`; after: `private=true`, `visibility=private`). Default branch `main` unchanged.
- **Reason:** reserve the name and keep the project non-public while it is being built. GitHub and npm launches are planned for later.
- **Expected effects:** the public GitHub URL no longer resolves for anonymous visitors; any GitHub Pages / public links from this repository become unavailable. npm is not affected by the visibility change (packages live in the npm registry).
- **Not done / not decided:** no npm publish, no other repository changes, no rename.

### 13.3 Review method — internal AI-agent review replaces the external 5-person panel

- On 2026-11-14 the user **cancelled the external 5-person Look Test** and authorized the **AI agent as the sole internal reviewer** ("你就是人").
- The **8 metrics in [`LOOK-TEST.md`](LOOK-TEST.md) §4 stay canonical**; the internal reviewer scores them pass/fail with one concrete observation each.
- **Honesty rules:** the record must say **"internal agent review (user-authorized)"**. It is **not** human user testing. **No fabricated participant counts, `/5` tallies, or human quotes.**
- A future human companion playtest is not replaced by this decision; it is simply not scheduled.

### 13.4 Art direction (2026-11-14)

- **Design base:** community Q-version (chibi) character-sheet reference **#10** (`10-web-issue36-character-sheet.png` — TreapGoGo/deepseek-whale-girl issue #36, JerryZRic; no license declared → local-only reference).
- **Render texture:** pixel-art quality of reference **#05** (`05-github-dshtui-pixel-happy.png` — ccch1mneyyy/dsh-TUI; repository MIT, asset license not separately declared).
- **Scope:** references are placeholders/style targets only. **Final art still needs human or authorized/commissioned art**; no external reference may be shipped or used in a store page/press kit until written permission is obtained.
- Provenance and limits: `desktop-games/docs/PEARL-PLACEHOLDER-REFS.md` (external repository; not edited from here).

### 13.5 Name fallback — undecided (prepare, do not rename now)

- **Risk:** 留屿园 / Famling / FANLING and the aliases have trademark/domain risk. If the names cannot be secured, a fallback is needed.
- **Status this round: undecided.** Do not rename now; only record the fallback directions.
- **Candidate fallback directions** (for later trademark/domain checks, not approved):
  - **留屿 (liuyu)** — medium/low risk per the current checklist; one 32-class pending mark to monitor.
  - **玩伴岛 (wanbandao)** — product descriptor.
  - **灯屿 (dengyu)** — existing marks in other classes.
  - **Pearl** — character-level fallback (product name risk lower; search term weaker).
  - **深海鲸娘** — product-level fallback; needs its own clearance.
- **Checks required before choosing:** CN trademark search across relevant classes (confirm exact classes with an IP professional), domain availability, npm/GitHub/Gitee/GitCode name availability, and legal review. Track in [`TRADEMARK-DOMAIN-CHECKLIST.md`](TRADEMARK-DOMAIN-CHECKLIST.md).

### 13.6 Proposed (not approved) Chinese tagline

- Candidate: **「留屿园，一座记得你的花园。」 / "An island garden that remembers you."**
- Status: **proposed, not approved** (2026-11-14). Do not treat it as the final slogan; it may change with the name-fallback decision. It appears in `README.md` only with this status.
