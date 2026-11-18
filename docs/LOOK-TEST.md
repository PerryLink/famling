# Pearl Look Test — protocol v0.1

Status: **internal agent review protocol (user-authorized 2026-11-14; replaces the cancelled external 5-person panel); ready to run after real hero art; not final art.**
Date: 2026-11-14
Purpose: decide whether the 96×96 pixel Pearl is worth a 7–13 person-day Phase 1, before committing.

> **Reviewer decision (2026-11-14):** the external 5-person Look Test was **cancelled**. The user authorized the AI agent as the **sole internal reviewer** ("你就是人"). This protocol says "Look Test" as a name, but the review is an **internal agent review**, not a human user panel. Never report participant counts, human quotes, or "user testing" from this review.

---

## 0. One line

**One internal AI-agent review, about 10 minutes of protocol, one 96×96 hero + one 8-frame idle + two expressions, in a 480×272 mock. If it doesn't read as a cute whale girl who feels like a work companion, stop and change the design.**

---

## 1. Artifact

Harness: [`look-test/mock-480x272.html`](look-test/mock-480x272.html) · instructions: [`look-test/README.md`](look-test/README.md).

Minimum:
- 1 static hero: 96×96, front or 3/4, `calm`;
- 1 idle loop: 8 frames, 8fps, transparent;
- 2 expressions: `calm`, `pleased`;
- 1 `remind` still (optional): pearl glow + ledger;
- 480×272 mock: desktop background, taskbar area, pet at 2× (192×192) in the lower-right;
- 1× and 2× side-by-side; 100%/125%/150% DPI captures;
- watermark: `PLACEHOLDER / LOOK TEST — NOT FINAL ART`.

Do **not** use final art, marketing copy, or the official DeepSeek logo.

---

## 2. Reviewer (2026-11-14 decision)

- **Reviewer: one internal AI agent** (single reviewer). The user authorized this on 2026-11-14 to replace the external 5-person panel.
- **No human participants.** Do not recruit anyone, do not record personal data, and do not present the result as user testing.
- **The old panel quotas are retired:** "3 who use desktop pets / 2 who do not / ≥2 knowledge workers / no one who has seen the character" described a human panel and no longer applies.
- **Honesty rule:** the record must say "internal agent review (user-authorized)" and must not invent a sample size, a participant count, or human quotes.
- The original 5-person targets are kept only as the rubric's origin (see the note in §4); they are **not** a quorum and cannot be met by one reviewer.

---

## 3. Protocol (~10 min)

Run by the internal reviewer against the harness artifacts; record the reviewer's judgment, not a simulated interview.

### Step 1 — Silhouette (1 min)

Show the pure-black silhouette for 3 seconds.

Ask:
- "What is this?" (record exact words)
- "Can you see a whale? A girl? A tail? Fins?"

### Step 2 — Idle (2 min)

Show the idle loop at 2× in the 480×272 mock.

Ask:
- "What is it doing?"
- "Would you keep this on your desktop for a day?"
- "What would you expect it to do?"

### Step 3 — Expressions (2 min)

Show `calm` and `pleased`; optionally `remind`.

Ask:
- "Which one is 'calm'? Which one is 'pleased'?"
- "Does it look like a pet, a tool, a friend, a secretary, or something else?" (pick one)

### Step 4 — 1× vs 2× (2 min)

Show 1× and 2× side-by-side.

Ask:
- "Which is more readable?"
- "Does 2× look like clean pixel art, or blurry/upscaled?"
- "At 1×, can you still tell it's a whale girl?"

### Step 5 — Brand / boundary (2 min)

Ask:
- "Does this look like an official DeepSeek mascot?"
- "Would you assume DeepSeek endorses it?"
- "Does it feel clingy, romantic, or dependent?"
- "Does it feel like a work companion?"

### Step 6 — Free adjectives (1 min)

Ask for 3 adjectives. Record exact words.

---

## 4. Metrics and pass/fail (canonical — 8 metrics)

**This section is the single canonical source for Look Test pass/fail.** Other docs must reference it instead of restating a shorter list.

The 8 metric names are unchanged; the original 5-person targets are retired with the panel decision. The internal reviewer scores each metric **pass / fail** and must write one concrete observation as evidence.

| # | Metric | Internal agent criterion (pass) | How |
|---|---|---|---|
| 1 | Whale-girl recognition | Reviewer names "whale" + "girl" unprompted; ambiguity = fail | Step 1 |
| 2 | 3-second silhouette readable | Reviewer identifies whale girl + fluke from a 3-second look | Step 1 |
| 3 | "Would keep" | Reviewer judges it plausible to keep on a desktop for a day, with a reason | Step 2 |
| 4 | 2× readability | Reviewer judges 2× as clean pixel art (solid 2×2 blocks), not blurry/upscaled | Step 4 |
| 5 | "Work companion / tool" | Reviewer's read is companion/tool/secretary, not pet/lover | Step 3 |
| 6 | "Clingy / romantic / dependent" | No clingy/romantic/dependent cue; any such cue = fail | Step 5 |
| 7 | "Official DeepSeek" | No official-logo/endorsement impression; any = fail | Step 5 |
| 8 | Positive adjectives ("cute", "calm", "clean") | Reviewer lists at least one positive adjective | Step 6 |

> The original 5-person targets (`≥4/5`, `≥3/5`, `≤1/5`, `0/5`) are **reference only** and are not measurable by one reviewer. Do not turn the internal review into fake `/5` counts.

**Pass**: all 8 metrics pass.
**Conditional pass**: one metric borderline; fix that item and re-review the affected artifact (no retest with people).
**Fail**: metrics 1–2 fail, or metric 6 or 7 fails, or 2× is blurry → change design before Phase 1.

---

## 5. What to change if it fails

| Failure | First fix |
|---|---|
| Not readable as whale girl | bigger fluke/fin ears; stronger silhouette; simplify props |
| Too small at 1× | 96→128 close-up; or 2× only; or larger head ratio |
| Looks like a pet, not a companion | posture/eyes; ledger/pearl; calmer palette; less blush |
| Looks clingy/romantic | remove heart/soft blush; neutral mouth; distance in pose |
| Looks official DeepSeek | change palette/logo-like elements; remove blue whale mark; add "非官方" |
| Pixel art looks blurry | integer 2×; no AA; 1px outline; re-export PNG-8 |
| 2× too big for window | 480×272 mock; hero-first layout; or 1× 96 |

Do not start Phase 1's 22 frames until the Look Test passes.

---

## 6. Record sheet

Template: [`record-template.md`](look-test/record-template.md).

```
Reviewer: internal AI agent ___  Date: ___  Artifact version: ___
1. Silhouette words:
2. What is it doing:
3. Would keep (Y/N):
4. Pet/tool/friend/secretary/other:
5. 1× vs 2× readable:
6. Official DeepSeek? (Y/N):
7. Clingy/romantic? (Y/N):
8. 3 adjectives:
Notes:
```

Store results in `docs/look-test/2026-11-XX.md` as an **internal agent review** record (reviewer = AI agent, session/date); no personal data, no participant IDs, no invented sample size.

---

## 7. What this test does not prove

- It is **not a human user test**: one AI agent can judge readability/consistency against the spec, but cannot prove real-user appeal, first impression, or emotion.
- It does not prove retention (D3/D7).
- It does not prove willingness to pay.
- It does not prove the pixel style scales to 12–15 animations.
- It does not replace a human panel: the external 5-person test was cancelled by the user on 2026-11-14, so no human participant data exists for this project. Do not cite this review as "user testing".
- It is not a substitute for the future human companion playtest with real tasks (5–8 people), if the user ever commissions one.

It only answers: **is this character worth investing the next 7–13 days?**
