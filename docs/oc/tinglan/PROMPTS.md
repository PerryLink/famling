# 汀岚 Tinglan · 生成提示词（身份母版 / 7 tags / 三视图 / 负面）

> Status: **提示词文档（2026-11-17）**。本轮**未生成任何图片、未调用图像 API**；本文件只把 prompt 写成可直接交给未来生成流程的形态。
> 原始逐张执行表仍以 `docs/art/CANON-SETTING-BOOK-2026-11-16.md` §4（IDENTITY DNA）与 `docs/art/prompt-library/PROMPTS-TINGLAN-RUNTIME-2026-11-16.md` / `PROMPTS-TINGLAN-KEYART-2026-11-16.md` 为准；本文件是**OC 级母版汇总**，供快速取用，不替代逐张表。
> 铁律：AI 输出只是 concept/placeholder，必须人工重绘 + 门禁后才能算 final；不得把设定页/AI 图当 `input_references` 1:1 描摹；不得使用 legacy（v3/ref10/旧 pack/旧分镜）作参考。

## 0. 使用规则（先读）

1. **每条 prompt = `IDENTITY`（或 `IDENTITY-CHIBI`）+ `TAG/V IEW` 句 + `STYLE` 句**，三段拼接；本文件已把三段写全，可直接整段复制。
2. **身份 Token always-on**：圆细银框眼镜、左刘海蓝鲸发夹、领带正中蓝鲸领夹、珍珠短坠耳环、扁平两叶尾（后腰锚点/裙后开衩）、白只限衬衫/珍珠/尾腹。漏画即错稿。
3. **尾巴单视角铁律**：任何单视角只画黑上表面 + ≤薄白下缘；**不得显示白腹大面**；整片白腹只允许 underside 专用图。
4. **画布**：正常立绘/K 图按 1024×1536 透明或按 key art 表；运行时 chibi 按 128×128（或已接入的 256×256 track），`display.scale=2`（256 track 为 1）、`imageSmoothingEnabled=false`。
5. **禁止文字**：prompt 里不要写字/logo/水印；图内台词/标签由本地排版/DOM 承担。
6. **不描摹、不混参考**：参考图 ≤3 张，且只能来自本 OC 已批准母版/三视图/表情锚；不得他人同人/官方图/旧版 AI 图。
7. **合规**：非官方、AI 概念稿、无真人/恋爱/色情/未成年人亲密；生成必须披露。

## 1. 身份母版（normal，约 6 头身）

**IDENTITY-NORMAL（英文，直接可用）**

```text
original adult orca-secretary OC, non-official, no DeepSeek affiliation, AI concept draft not final art;
single adult woman, about 6 heads tall, long legs, clean jawline, no baby fat, no blush, work-appropriate, not child-like, not sexualized;
all-black chin-length bob, side-swept bangs over forehead, inward-curled ends, no white or grey streak/highlight;
almond eyes, blue iris (#356FFE) with darker outer ring (#1E3F8F) and crisp white 1-2 px highlight, thicker upper lash line, no star pupils;
thin round silver glasses, clear lenses, thin temples, visible nose pads, always on;
tiny original side-view blue whale hairpin on HER LEFT bangs (viewer right), solid #3964FE, small silver diamond barrette and thin silver bar, whale head facing forward, no letters;
black single-breasted blazer, notched lapel, one matte button, flap pockets, 3 small cuff buttons, center back seam;
white point-collar shirt with white cuffs showing 0.5-1 cm, opaque;
slim black tie, one shade darker than the blazer, with a blue-whale tie clip centered on the tie, thin silver horizontal bar, identical whale geometry to the hairpin;
small white pearl drop earrings on both ears, silver pins;
knee-length black H-line pencil skirt with a back slit (two overlapping panels);
sheer black tights rendered as opaque warm-grey shading (#8A6E6B, shadow #6A5652), never near-black, never fishnet or glossy;
black almond-toe low block heels about 4 cm, not stiletto, not platform;
flat thin orca fluke, two roughly symmetric lobes with a clear central notch, rear-waist/sacrum anchor, emerging from behind the skirt back slit, always behind the skirt, black dorsal top, at most a thin white ventral rim;
white appears only on the shirt, pearls and the tail ventral rim; palette black + white + DSH blue (#3964FE, at most 3% of visible pixels), silver, skin;
flat cel shading with 2-3 hard-edged steps, 1 px closed dark outline (#0B1220);
plain transparent background, no scenery, no ground shadow, no text, no logo, no watermark, no UI;
character identity sheet, neutral standing 3/4 view, arms relaxed, empty hands, tail visible behind the skirt.
```

**注意**：正常形态**空手**；平板/账本/笔只用于 02B 姿态/手势图与场景图，不是身份锚点。

## 2. 身份母版（chibi，运行时 ~2.5 头身）

**IDENTITY-CHIBI（英文，直接可用）**

```text
same original adult orca-secretary OC as IDENTITY-NORMAL, chibi ~2.5 heads tall (accept 2.4-2.6), adult not child-like, not cute-baby proportions;
same black bob, thin round silver glasses, blue-whale hairpin on HER LEFT bangs, blue-whale tie clip centered on the tie, pearl drop earrings, black blazer/white shirt/black tie/black pencil skirt with back slit/black tights/black low block heels;
empty hands, no tablet, no pen, no ledger in the sprite;
flat thin orca fluke, two lobes + central notch, rear-waist anchor, behind the skirt back slit, black dorsal top, at most 1-2 px thin pale ventral rim, never a large white belly in a single view;
1 px closed dark outline (#0B1220), flat cel shading, no gradient, no anti-aliasing, no semi-transparent pixels;
sprite canvas 128x128 (or 256x256 track), centered foot anchor, full body, plain transparent background, no ground shadow, no text, no logo, no watermark;
chunky pixel-art-style concept, AI concept draft not final art, not final pixel art, no explicit pixel sizes promised.
```

## 3. 7 tags / 36 帧提示词（核心运行时）

> 所有 tag 使用 `IDENTITY-CHIBI` 作为身份段（生成正常立绘时改用 `IDENTITY-NORMAL`）；下面每段只写动作/表情差异。帧数/fps/loop 与 CANON §5.2 一致。

### 3.1 `idle` — 8 帧 @8fps loop（主待机）

```text
TAG idle, 8-frame seamless loop at 8 fps, neutral 3/4 standing pose;
breathing: shoulders/chest rise 1 px on f1-f3 and settle by f5; blink on f3-f5 (half-closed then closed then open), 2-3 frame blink; subtle tail sway two phases (f0/f4 opposite), tail stays behind the skirt;
eyes open 80-100% neutral, flat brows, small closed flat mouth; no idle hand gestures, empty hands; body stays anchored, feet planted;
first and last frame close perfectly for loop; no expression change beyond breathing/blink.
```

### 3.2 `pat` — 6 帧 @10fps one-shot（摸头反馈）

```text
TAG pat, 6-frame one-shot at 10 fps, reaction to a head pat (hand is NOT drawn in the sprite);
f0 contact: head tips down <=6 degrees, shoulders drop; f1 compression: eyes gently close to a restrained closed-mouth smile, head down; f2 rebound: head returns halfway, eyes half open; f3-f5 settle back to neutral idle pose;
no blush, no sparkles, no hearts, no exaggerated anime reaction; no hand visible; tail stays behind the skirt, small sway.
```

### 3.3 `drag` — 4 帧 @8fps loop（被拖起）

```text
TAG drag, 4-frame seamless loop at 8 fps, character lifted off the ground and hanging;
feet off the ground, body suspended with a 1 px vertical bob, arms slightly raised but not flailing, tail sway two phases, skirt panels barely lifted (no upskirt, no fanservice);
expression: restrained surprise -> neutral focus, eyes slightly wider, mouth small open then closed; no sweat drop, no comic effects;
first and last frame close for loop; no hand in the sprite.
```

### 3.4 `land` — 4 帧 @12fps one-shot（落地）

```text
TAG land, 4-frame one-shot at 12 fps, landing after being put down;
f0 touch: knees/body squash at most 2 px, eyes blink; f1 rebound: slight overshoot upward, mouth neutral; f2 settle: feet planted, tail counter-swing; f3 back to idle-neutral pose;
no dust FX, no comic squash-stretch beyond 2 px, no second character.
```

### 3.5 `talk` — 4 帧 @12fps loop（说话口型）

```text
TAG talk, 4-frame mouth-flap loop at 12 fps, body locked in neutral/focus 3/4 pose;
mouth frames: f0 closed (2 px line), f1 open "a" (2-3 px), f2 narrow "i" (wide thin), f3 rounded "u" (2-3 px); lower jaw moves about 1 px; eyes open neutral with a direct gaze; body and hands stay stable;
only the mouth/jaw changes between frames; no headshake, no emote, no text bubble in the image.
```

### 3.6 `remind` — 6 帧 @10fps one-shot（提醒）

```text
TAG remind, 6-frame one-shot at 10 fps, determined reminder gesture;
f0 head lifts, f1 leans forward 1 px, f2-f3 direct eye contact with camera, determined brows slightly pressed and mouth flat, f4 a single small nod, f5 returns to neutral;
no exclamation mark FX, no flashing, no pointing finger, no second character; tail still.
```

### 3.7 `sleep` — 4 帧 @2fps loop（睡眠）

```text
TAG sleep, 4-frame seamless loop at 2 fps, sleeping while standing/leaning or resting seated, eyes closed;
slow 2-second breathing: chest/shoulders +1 px on f0-f1, settle on f2-f3; head tilts about 2 degrees; tail relaxed;
one-pixel closed eyelid line, no Zzz text, no drool, no blushing, non-seductive pose; no change of outfit.
```

## 4. 三视图（正交，128 / 256）

**TURNAROUND（英文，直接可用）**

```text
same character IDENTITY-CHIBI, orthogonal turnaround sheet, three separate full-body views side by side: front, profile (90 degrees side), back;
identical height with +/-1 px tolerance, feet on the same baseline, arms in a relaxed A-pose about 8 degrees away from the body, feet parallel, neutral closed-mouth expression, eyes open;
must clearly read: black bob silhouette; round silver glasses; blue-whale hairpin on HER LEFT bangs in front/3-4 views and its position in profile; blue-whale tie clip centered in front view; pearl drop earrings; black blazer/white collar/tie/pencil skirt/black tights/low block heels; back view shows center back seam and the skirt back slit with the flat fluke emerging from behind it; tail in profile is a thin flat plate, black top and minimal pale ventral rim;
flat cel shading, 1 px closed dark outline, transparent background, no text labels, no color swatches, no extra props, no hands holding anything.
```

- 128：头含发 46–48 px、全高 116–118 px、腿占 22–24%；发夹 3–6 px、领夹 2–4 px、珍珠 1–2 px、尾白边 ≤1–2 px。
- 256：允许 +1–2 px 细节；不得把 128 直接放大。
- 禁止：三视图之间身高差 >1 px、镜像发夹、漏眼镜/领夹、尾巴穿裙。

## 5. 负面 prompt（Negative，直接可用）

```text
white or grey hair streak, gradient hair, twin tails, ahoge, hair bows;
no glasses, rounded-rectangle glasses, thick frames, colored lenses, asymmetrical frames;
geometric fish clip, official DeepSeek logo/fish/wordmark/mascot, anime whale girl, letters or text on the hairpin or tie clip;
white pocket square, white gloves, white socks, white shoes, white shoulder patch;
eye patch, jaw stripe, saddle patch, orca eye patch, mottled skin;
thick curved orca tail, ray tail, fish tail, single lobe, all-white fluke, black belly / white back inverted, tail through the skirt, tail along the side seam, tail in front of the skirt, extra fins, chopped tail, large white belly in any single view;
maid outfit, deep V, high slit, fishnet, stiletto heels, low camera angle, upskirt, cleavage, bare shoulders, lingerie;
blush, watery eyes, heart pupils, cat mouth, sparkles, exaggerated anime expression, chibi child proportions, sexualized pose, romantic framing;
photo-realistic, 3D render, painterly/impasto, gradients, glow, blur, anti-aliasing, semi-transparent pixels, pure #000000 / #FFFFFF large areas;
text, watermark, signature, logo, UI, labels, readable writing on tablet, scenery, ground shadow, second character, extra hands, extra limbs;
official affiliation claim, real human likeness, real voice actor reference.
```

## 6. 验收清单（prompt 出图后）

- [ ] 身份 6 锚点齐全：圆银框眼镜 / 左刘海蓝鲸发夹 / 领带正中蓝鲸领夹 / 珍珠短坠 / 扁平两叶尾（后腰锚点、裙后开衩）/ 白只限衬衫珍珠尾腹。
- [ ] 尾巴单视角只黑上表面 + 薄白下缘；无白腹大面。
- [ ] 比例：normal 6.0–6.3 头身；chibi 2.4–2.6；无短腿/缩头。
- [ ] 颜色：黑/白/DSH 蓝 ≤3%；1 px `#0B1220` 闭合轮廓；无纯黑纯白大面积；平涂 2–3 阶硬边。
- [ ] 无文字/Logo/UI/水印/官方元素；非官方 + AI 概念稿标识。
- [ ] 无恋爱化/性化/幼儿化/脸红/心形瞳/低机位。
- [ ] 帧契约：7 tags/36 帧；loop tag 首尾闭合；one-shot 帧序可读。
- [ ] 人工重绘 + 2× 终审 + palette 注册后才可称 final；AI 直出不得当 final。

## 7. 未生成声明

本轮**没有调用图像 API、没有生成任何汀岚图片**；文中所有 prompt 均为文本。现有 `art/_placeholder/...` / `public/assets/pet/tinglan-256/**` 等图包由美术线产出、属于 concept/placeholder，本文件不改变其状态，也不把它们当 final。
