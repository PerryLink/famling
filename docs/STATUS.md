> **2026-11-17 状态注记：本仓已改为 Tinglan/猫/狗桌宠公开子集；许可为代码 PolyForm NC + 美术 CC BY-NC-SA。此旧文档保留为设计历史，若与根 LICENSE/LICENSE-ART/LICENSE-MIGRATION 冲突，以后者为准。**

# Famling / Pearl — status v0.1

Date: 2026-11-14
Status: **name reservation + design contracts; Phase 0 done in `709cf77` on desktop-games; no runtime yet; GitHub repo temporarily private since 2026-11-14.**

---

## 1. Done

- Famling naming/reservations: npm, GitHub, Gitee, GitCode; aliases point to Famling.
- Chinese brand: **留屿园**; reserves: 留屿、玩伴岛、灯屿.
- First character: **Pearl** (chibi whale girl; unofficial).
- Design contracts:
  - [`PEARL-CHARACTER.md`](PEARL-CHARACTER.md)
  - [`PET-BRIEF.md`](PET-BRIEF.md)
  - [`PET-BRIEF` schema](pet-brief.schema.json) + [example](pet-brief.example.json)
  - [`LOOK-TEST.md`](LOOK-TEST.md) + [record template](look-test/record-template.md)
  - [`DECISIONS.md`](DECISIONS.md)
  - [`PLATFORM.md`](PLATFORM.md)
  - [`PHASE-0-REVIEW.md`](PHASE-0-REVIEW.md)
  - [`PHASE-1A-CHECKLIST.md`](PHASE-1A-CHECKLIST.md)
  - [`CHARACTER-PACK.md`](CHARACTER-PACK.md)
  - [`TRADEMARK-DOMAIN-CHECKLIST.md`](TRADEMARK-DOMAIN-CHECKLIST.md)
  - [`PET-BRIEF-TESTCASES.md`](PET-BRIEF-TESTCASES.md) + `pet-brief.testcases.json`

## 2. In progress

- Desktop-games Phase 0 + scaffolding: **done** in commit `709cf77` (F1–F4 fixed; `hero.ts`; placeholder pack; `--pet-size=480x272`; Look Test harness); 133 tests, preflight 5/5, clean tree. See [`PHASE-0-REVIEW.md`](PHASE-0-REVIEW.md).
- `hero.ts` is a **module**, not wired into `pet.html`/`main.ts`; the actual pet window still shows 折角. Phase 2 integration pending; do not call Pearl "integrated".
- Look Test: **approved as prototype-only**; placeholder harness done; real hero art (1 hero + 8f idle + 2 expressions) still pending. **The external 5-person panel was cancelled on 2026-11-14**; the user authorized an **internal AI-agent review** instead (single reviewer, not a human panel — do not report it as user testing).
- No final art, no identity rewrite.

## 3. Gates

| Gate | Condition | Status |
|---|---|---|
| Phase 0 | 96×96, 40 colors, tools patch, visual-only Pearl | Done (709cf77; F1–F4 + scaffolding) |
| Look Test | 1 hero + 8f idle + 2 expressions in 480×272; **internal agent review** (user-authorized 2026-11-14; replaces the external 5-person panel) | Harness done; real hero + internal review pending |
| Phase 1 | Look Test pass + decisions #1–#4 | Blocked |
| Phase 2 | Phase 1 art approved + 480×272/hero-first | Blocked |
| Commercial release | Written license/clean-room + brand/legal | Blocked |

## 4. Next actions

| Owner | Action |
|---|---|
| Desktop-games | Optional `format/version/displayScale` manifest hardening; real hero art when source is authorized; keep `hero.ts` unwired until Phase 2 |
| Famling | Keep contracts/status current; run `LOOK-TEST.md` as an **internal agent review** when real art exists; review Phase 1a gate |
| Advisers | Implement `advisers pet-brief --json` only after Phase 2 is approved |
| User | Provide/commission real hero art (or authorize placeholder-only internal review); decide public brand and name fallback; decide entity/commercial scope |

## 5. Current decisions (recommended)

- 96×96 runtime; 128 key art only.
- 40 visible colors + transparent (validate 41).
- Pure visual Pearl; text/voice/save still 折角.
- 480×272 window (Phase 2), not 480×240.
- Baked DeepSeek TTS; PTT; no free chat.
- No commercial reuse of desktop-games code/assets without written license/clean-room.

## 5.1 Decisions of 2026-11-14 (user)

- **Licensing layers:** Famling / 留屿园 desktop companion (this repo) = **PolyForm Noncommercial 1.0.0 code + CC BY-NC-SA 4.0 art** (superseded 2026-11-17; old Apache plan historical); `desktop-games` base and its other games = PolyForm NC.
- **Visibility:** GitHub repo `PerryLink/famling` is **temporarily private** (name reserved); public GitHub/npm launch is planned later.
- **Review method:** external 5-person Look Test **cancelled**; **internal AI-agent review** authorized by the user, sole reviewer.
- **Art direction:** design based on community chibi reference #10; render with the pixel texture of reference #05; references are placeholders only — final art still needs human/authorized art.
- **Name risk:** fallbacks are undecided; candidates and checks are tracked in [`DECISIONS.md`](DECISIONS.md) §13.5 and [`TRADEMARK-DOMAIN-CHECKLIST.md`](TRADEMARK-DOMAIN-CHECKLIST.md).

## 6. Links

- Canonical: https://github.com/PerryLink/famling (**temporarily private since 2026-11-14**)
- npm: https://www.npmjs.com/package/famling
- Gitee: https://gitee.com/perrylink/famling
- GitCode: https://gitcode.com/PerryLink/famling
- External pixel plan: `desktop-games/docs/PEARL-HERO-PIXEL-PLAN-2026-11-14.md`
- Advisers handoff: `deepseek-community-hub/01-research/hermes-cli-cordis-2026-11-10/52-ADVISERS-HANDOFF-2026-11-14.md`
