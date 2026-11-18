# Pearl — Character Bible v0.1

Status: **draft for Phase 0 / Look Test; not final art.**
Date: 2026-11-14
Canonical: **Famling / 留屿园**
Related: `desktop-games/docs/PEARL-HERO-PIXEL-PLAN-2026-11-14.md` (external assessment; do not edit from this repo)

> This is a design contract, not a legal opinion. "DeepSeek 鲸鱼娘" is an unofficial descriptor; Pearl is an original character inspired by deep-sea whales.

---

## 0. One line

**Pearl is a chibi whale girl, the first islander of 留屿园, and the visual persona of Famling.**
She is calm, observant, and reliable — a secretary-like work companion in a cute body, not a clingy pet and not an emotional partner.

---

## 1. Non-negotiables

1. **Unofficial.** No DeepSeek official logo, wordmark, or "official / partner / authorized" claim. Public descriptor only: "DeepSeek 鲸鱼娘（非官方）". Commercial product name: **Pearl / 深海鲸娘**.
2. **No ownership language.** Never call the user "主人"; never call herself "宝宝 / 宠物 / 家养小精灵". She calls the user "你".
3. **No emotional dependency.** No "我只有你", "不要离开我", "你不来我会难过", streak/penalty/guilt mechanics. Absence is silence, not punishment.
4. **No free LLM chat.** Fixed intents + `Pet Brief` + claims guard. No raw CoT, no always-on microphone.
5. **No final art before spec lock.** Placeholder and Look Test are not final assets.
6. **No mixing commercial code.** `desktop-games` is PolyForm Noncommercial 1.0.0; Famling commercial use of that code needs a written license or clean-room implementation. Licensing is layered: **Famling / 留屿园 (this repo) is Apache-2.0**; `desktop-games` and its other games stay PolyForm Noncommercial; art assets follow their own source terms. See [`DECISIONS.md`](DECISIONS.md).

---

## 2. Identity

| Field | Value |
|---|---|
| Name | **Pearl** |
| Chinese | 珍珠（内部）；公开可写“Pearl / 深海鲸娘” |
| Role | 留屿园的第一个岛民；Famling 的视觉外化 |
| Relationship | 住在留屿园的岛民；不是主人-宠物，不是恋人，不是客服 |
| Personality | 安静、可靠、观察力强、略克制、偶尔冷幽默；记得承诺，但不黏人 |
| Speech | 短句、具体、少形容词；先给事实，再给建议；不卖萌、不撒娇 |
| Boundary | 不读窗口标题/键盘；不常开麦；不假装记得没记录的事 |
| Lore | 留屿园是一座记得你的小岛；Pearl 带着一颗会发光的珍珠，珍珠亮起时，说明有一件答应过的事快到期了 |

### 2.1 What she is / is not

| Is | Is not |
|---|---|
| 工作搭子、桌面岛民、视觉秘书 | 情感陪伴 AI、虚拟恋人、陪聊 |
| 可爱但克制 | 幼态、无助、需要被照顾 |
| 记得承诺 | 监视、打分、内疚驱动 |
| 一个角色，可换皮肤 | 一个平台的全部 |

---

## 3. Visual spec (pixel hero)

### 3.1 Canvas and budget

| Item | Value |
|---|---|
| Runtime canvas | **96×96** |
| Display | **2× integer** (192×192 CSS px) |
| Key art | 128×128 or 512×512 later; not runtime |
| Proportions | **2.6 heads**; head ≈32px, body ≈84px |
| BBox | `[12, 8, 72, 84]` (Phase 0 spec; 8 leaves 2px top margin) |
| Anchor | foot-center `(48, 96)` |
| FootBox | `72×18 @ bottom` |
| Outline | 1px closed; `#0b1220` (hero primary) or `#1b1612` (fallback); no pure black |
| Alpha | 0/255 only; no AA / semi-transparency |
| Colors | **40 visible + transparent** (validate `--max-colors 41`); hero exception, not for micro |
| Display | integer 2×; `image-rendering: pixelated`; 100% DPI must pass |

### 3.2 Palette direction

| Role | Direction |
|---|---|
| Deep sea | DeepSeek blue / cyan / white |
| Memory accent | Gold `#e0b35a` (pearl glow) |
| Outline | `#0b1220` (hero primary) / `#1b1612` (fallback); no pure black |
| Forbidden | Pure black `#000000`, pure white `#ffffff`, AA, gradients, 3D, photo textures |

### 3.3 Silhouette anchors

- **Whale fluke tail** — readable at 1× and 2×; sweeps right, 20–24px.
- **Fin ears** — two small fins on the head; not cat ears.
- **Water spout** — independent FX layer above the head; 32×24, 8 frames, 8–10fps; not baked into the 96×96 body.
- **Pearl pendant** — one gold pearl at the chest; glows for reminders.
- **Tiny ledger** — one small book/satchel; no readable text in sprite; 1px lines only.
- **Round silhouette** — head + body + tail should read as one soft shape in 3 seconds.

### 3.4 Expressions (6)

| Expression | Use | Notes |
|---|---|---|
| `calm` | default idle | neutral eyes, soft mouth |
| `pleased` | pat / good news | eyes slightly curved |
| `happy` | completion / celebration | small smile, spout |
| `sleepy` | night / idle | half-lidded, slow blink |
| `surprised` | new/urgent | eyes wide, tail up |
| `listening` | PTT / talk | head tilt, eye contact |

Avoid punitive `sad`; the product does not punish absence.

### 3.5 Do / don't

**Do**
- Keep 3-second silhouette readable.
- Keep head height/eye position stable across frames (±1px).
- Use the gold pearl as the only memory accent.
- Keep the water spout on a separate FX layer.
- Test at 1× and 2×, 100%/125%/150% DPI.

**Don't**
- Don't use the official DeepSeek logo/wordmark.
- Don't add text, UI labels, or logos inside the sprite.
- Don't use 3D, AA, gradients, photo texture, or excessive detail.
- Don't sexualize, infantilize, or make her helpless.
- Don't make the tail/ears so large that they break the 96px bbox.

---

## 4. Animation tags

| Tag | Frames | FPS | Loop | Core action |
|---|---:|---:|---|---|
| `idle` | 8 | 8 | yes | breathing 1–2px, tail sway, blink, occasional spout |
| `pat` | 6 | 10 | no | surprise → lean into hand → pleased → tail up → settle |
| `drag` | 4 | 8 | yes | lifted, arms up, tail down, slight swing |
| `land` | 4 | 12 | no | compress 6px → rebound 2px → settle on footBox |
| `talk` | 4 | 12 | yes | mouth/eyes only; body stable |
| `remind` | 6 | 10 | no | pearl glows, ledger opens, looks at user |
| `sleep` | 4 | 2 | yes | curled, slow breathing, pearl dim |

First slice: **22 frames** = `idle 8 + pat 6 + drag 4 + land 4`.
Phase 1a: `idle + pat` (14 frames) review; Phase 1b: `drag + land`; then `talk/remind/sleep`.

> Phase 0 spec includes all 7 states / 36 frames as **placeholders**; the first production slice is still 22 frames. `talk/remind/sleep` are later and should be marked `deferred`/`later` in `assets.csv` before Phase 1.

> **Resolved (F1, 2026-11-14):** the Phase 0 spec originally set `idle.fps = 12`; the spec / `assets.csv` / styleboard now use **8fps** (1s loop), applied in `709cf77`. This is no longer an open fix.

**Rules**
- idle first/last frame diff = 0.
- pat/drag/land last frame can return to idle.
- Foot baseline consistent across all frames.
- No per-frame trim; fixed canvas + union bbox.
- No frame-by-frame independent AI generation.

---

## 5. Voice

| Item | Decision |
|---|---|
| Provider | DeepSeek TTS `stella` (primary), `tide` (fallback) |
| Mode | Pre-generated baked lines first; cloud TTS optional, off by default |
| Lines | **37** launch lines (canonical list: [`PEARL-LINES.md`](PEARL-LINES.md)); cache; subtitles always on |
| Input | PTT ASR only; no always-on mic; ≤60s/8MiB |
| Chat | No free LLM chat; fixed intents + claims guard |
| Thinking | Disabled for real-time pet lines; never send reasoning to TTS/subtitles/logs |
| Cost | Cloud TTS only if enabled; baked/system do not count against quota |

### 5.1 Tone

- Calm, concise, observant.
- One or two sentences; no long speeches.
- Concrete: names, times, objects.
- No "主人/宝宝"; no "我只有你"; no guilt.
- If she doesn't know, say "我还不太懂" or "这个我没记".

### 5.2 Sample lines (draft; not final)

| Intent | Lines |
|---|---|
| morning | "早。今天有一件答应过的事。" / "先做哪件？" |
| work | "你忙你的，我在。" / "这件事还没关。" |
| reminder | "王工的报价，今天到期。" / "珍珠亮了。" |
| pat | "嗯。" / "再摸一下也可以。" / "我记得你。" |
| drag | "放我下来。" / "我自己会走。" |
| land | "站稳了。" |
| sleep | "灯留着。晚安。" |
| unknown | "这个我还不太懂。" |
| offwork | "今天到这里？" / "剩下的明天再说。" |

### 5.3 Claims guard

- No "我做了 X" unless `Pet Brief` has evidence.
- No "我记得 X" unless a fact is in the brief.
- No "我一直在等你" / "你不来我会难过".
- No medical/legal/financial advice.
- If the brief is empty: idle, no invented memory.

---

## 6. Lore: 留屿园

- 留屿园 is a small island garden that remembers the people who pass through.
- Pearl is the first islander; she keeps a ledger of promises.
- The pearl at her chest glows when a promise is near its due date.
- She does not own the user; the user is a visitor, not a master.
- Other characters (cat, dragon, ghost) can be other islanders later; Pearl is the first, not the only.

---

## 7. IP / brand boundary

| Item | Rule |
|---|---|
| Public descriptor | "DeepSeek 鲸鱼娘（非官方）" only; no "official/partner/authorized" |
| Official logo | Do not use DeepSeek logo/wordmark in character, UI, store page |
| Commercial name | **Pearl / 深海鲸娘**; avoid "DeepSeek" in product name |
| Voice cloning | Do not clone a real person or a known character |
| AI disclosure | If AI-generated art/voice is shipped, record provenance and disclose per platform rules |
| Legal review | Trademark/copyright/name clearance before commercial release |

This is not legal advice. The entity/license decision is tracked in [`DECISIONS.md`](DECISIONS.md).

---

## 8. Acceptance (Look Test + Phase 1)

- 3-second silhouette reads "whale girl + fluke + fin ears".
- 1× and 2× both readable; 2× uses solid 2×2 blocks.
- 1px closed outline; alpha 0/255; ≤41 RGBA colors including transparent.
- Head height/eye position stable across frames; foot baseline fixed.
- `idle` loops seamlessly; `pat/drag/land` return to idle.
- **Look Test pass/fail: canonical is [`LOOK-TEST.md`](LOOK-TEST.md) §4 — its 8 metrics are the single source of truth. Do not restate a shorter list here.**
- **Reviewer method (2026-11-14):** the external 5-person panel was **cancelled**; the user authorized an **internal AI-agent review** as the sole reviewer. This is not a human user panel; results must be labeled "internal agent review (user-authorized)" and must never include fabricated participant counts or human-test claims.
- No official logo; no ownership/emotional-dependency language.

---

## 9. Open decisions

See [`DECISIONS.md`](DECISIONS.md). The four blockers before Phase 1:

1. Canvas: 96×96 runtime (recommended) vs 128 close-up.
2. Colors: 40 visible + transparent (recommended) vs ≤24 vs 48.
3. Identity: pure visual Pearl (recommended for Phase 0/1) vs full rename.
4. License/brand: license layers are decided (Famling repo = Apache-2.0; `desktop-games` = PolyForm NC; art per source) and the GitHub repo is temporarily private, but entity/commercial scope, the public "DeepSeek 鲸鱼娘" boundary, and the **name fallback** remain open (see [`DECISIONS.md`](DECISIONS.md) §13).

---

## 10. References

- `desktop-games/docs/PEARL-HERO-PIXEL-PLAN-2026-11-14.md`
- `desktop-games/docs/ART-PIPELINE.md`
- `desktop-games/docs/HANDOFF-2026-11-14.md`
- `deepseek-community-hub/01-research/hermes-cli-cordis-2026-11-10/52-ADVISERS-HANDOFF-2026-11-14.md`
- [`PEARL-LINES.md`](PEARL-LINES.md)
- [`PET-BRIEF.md`](PET-BRIEF.md)
- [`LOOK-TEST.md`](LOOK-TEST.md)
