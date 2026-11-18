# 狗 OC（金毛寻回犬，金黄毛）· 生成提示词（身份母版 / 7 tags / 三视图 / 负面）

> Status: **提示词文档（2026-11-17）**。本轮**未生成任何狗图片、未调用图像 API**；本文只写 prompt。
> **禁止**：未经用户/美术线明确批准，不得用任何图像 API 生成猫/狗图片；本轮及后续默认不生成。若未来获批，AI 输出只能是 concept/placeholder，须人工像素重绘与 2× 终审。
> 视觉口径：**金黄毛、金毛寻回犬、垂耳、大尾、无眼斑、成年犬比例**。现存 `public/assets/pet/dog-placeholder/**` 是旧占位（金棕眼斑狗），**不得作为参考/母版**。

## 0. 使用规则

1. 每条 = `IDENTITY` + `TAG` 句 + `STYLE` 句；本文已写全，可直接整段复制。
2. 画布 **96×96**、anchor `(48,96)` foot-center、footBox `(−36,−18,72,18)`、bbox `[12,8,72,84]`、7 tags/36 帧、1×/2× 整数、`image-rendering: pixelated`。
3. 单角色、单四足 sprite；透明底；无地面阴影；无文字/Logo/水印；无第二角色。
4. AI 输出不是 final：必须经 `pixelize`/人工重绘/颜色门禁（≤40 色、1 px 闭合轮廓、hard alpha、四角透明）后才可入包。
5. 宠物内容不性化、不幼儿化、不做拟人恋爱；prompt 里不出现衣服/人类姿势/幼犬比例。

## 1. 身份母版（IDENTITY）

```text
original golden retriever dog OC, fictional AI pet character, non-official, no DeepSeek affiliation, AI concept draft not final art;
single quadruped dog sprite, full body, adult dog proportions (head about 1/2.5-1/3 of body length, sturdy broad chest, not a puppy, not a big-headed baby), calm friendly pose, sitting or standing;
golden-yellow coat, warm honey-gold (#E0A94F) with lighter highlights (#F0C877) and brown-gold shadows (#B97F33 / #8A5A22), lighter chest (#F2D9A8), no eye patch, no saddle patch, no dark mask;
floppy ears hanging naturally beside the cheeks (not cat ears, not cropped), tail thick and feathery (plumed), relaxed or gently wagging;
brown/amber eyes (#6A4A2E, deep #4A3320) with a clean 1 px white highlight, warm direct gaze, not staring, no puppy dog eyes;
near-black dark brown nose (#232227), tongue visible at most 2 px only when happy; no collar by default (optional dark teal collar only if explicitly requested);
flat cel shading with 2-3 hard-edged steps, 1 px closed dark outline (#0B1220), limited palette, no anti-aliasing, no gradients, no semi-transparent pixels;
96x96 sprite canvas, centered foot anchor, plain transparent background, no ground shadow, no scenery, no text, no logo, no watermark;
chunky pixel-art-style concept, readable silhouette at 1x, not final pixel art.
```

## 2. 7 tags / 36 帧提示词

> 身份段统一用 §1 `IDENTITY`；下面只写动作/表情差异。

### 2.1 `idle` — 8 帧 @8fps loop

```text
TAG idle, 8-frame seamless loop at 8 fps, relaxed sitting or standing pose;
slow breathing (chest +1 px on f1-f3, settle f5); 2-3 frame blink on f3-f5; ear tips sway 1 px; thick tail wags slowly 1-2 px in two phases; calm friendly face, mouth closed;
first and last frame close for loop; no constant high-energy wagging.
```

### 2.2 `pat` — 6 帧 @10fps one-shot（被摸）

```text
TAG pat, 6-frame one-shot at 10 fps, response to a gentle touch behind the ear / on the chest (human hand NOT drawn);
f0 head leans into the touch 1 px; f1 eyes half-close, ears relax down; f2 presses 1 px, tail thumps; f3-f5 slowly returns to neutral with a soft blink;
no hearts, no sparkles, no begging eyes, no tongue flapping; tail wags but does not slap the frame edge.
```

### 2.3 `drag` — 4 帧 @8fps loop（被抱起）

```text
TAG drag, 4-frame seamless loop at 8 fps, large dog gently lifted off the ground;
legs hang naturally, tail hangs and sways, body is calm but slightly tense, ears lift a little, eyes open watching, mouth closed;
no flailing, no panic, no human-like clinging; first and last frame close for loop.
```

### 2.4 `land` — 4 帧 @12fps one-shot（落地）

```text
TAG land, 4-frame one-shot at 12 fps, dog lands on four paws;
f0 paws touch with a small squash (body compresses at most 2 px); f1 tail counterbalances; f2 stands firmly, ears settle; f3 back to neutral idle pose;
no dust FX, no bounce beyond 2 px, no human-like landing.
```

### 2.5 `talk` — 4 帧 @12fps loop（短汪）

```text
TAG talk, 4-frame mouth-open loop at 12 fps, a short single low bark;
f0 mouth closed; f1 mouth opens 2 px; f2 opens slightly wider; f3 closes; eyes warm and calm; body stays still;
only mouth/jaw changes; no text bubble, no human speech, no continuous barking.
```

### 2.6 `remind` — 6 帧 @10fps one-shot（鼻顶提醒）

```text
TAG remind, 6-frame one-shot at 10 fps, dog nudges the user's hand or desk edge with its nose;
f0 leans forward 1 px; f1 nose touches; f2 pause and looks up; f3 small second nudge; f4 tail lifts once; f5 returns to neutral;
calm request, not begging or demanding; no hand drawn, no text.
```

### 2.7 `sleep` — 4 帧 @2fps loop

```text
TAG sleep, 4-frame seamless loop at 2 fps, dog lying down with eyes closed, head on paws;
slow breathing: body rises 1 px on f0-f1 and settles f2-f3; tail still; ears relaxed;
no Zzz text, no human-like blanket/pillow, no puppy sleep pose; first and last frame close for loop.
```

## 3. 三视图（TURNAROUND，正交，96 / 128 可选）

```text
TURNAROUND, same IDENTITY golden retriever dog, orthogonal turnaround, three full-body views side by side: front, profile (90 degrees), back;
same size and baseline with +/-1 px tolerance, neutral standing pose, four paws on the ground, head forward, thick tail relaxed behind;
must clearly read: golden-yellow coat, floppy ears in all views, broad chest, feathery plumed tail in profile/back, warm brown eyes in front view, no eye patch, no collar unless requested;
flat cel shading, 1 px closed dark outline, transparent background, no labels, no color swatches, no props, no second character, no text.
```

- 96：头约 24–28 px、身体 ~50–58 px、尾 ~24–32 px；垂耳/大尾靠 1–2 px 轮廓可读，不画毛丝。
- 若未来升级 128：只另绘，不放大 96；保持同一几何与 tags 契约。

## 4. 负面 prompt（Negative）

```text
dark brown dog, red-brown dog, black dog, golden-brown with black saddle, eye patch, dark mask, dog with blue eyes;
cat ears, pointy upright ears, cropped ears, short tail, curly tail, no tail, thin whip tail;
puppy proportions, big baby head, chibi child, blush, heart pupils, watery eyes, sparkles, cartoon hearts, romantic gaze, seductive pose;
humanoid, anthropomorphic standing, human hands, human face, anime girl, person, guide-dog harness, service vest, clothes, bandana;
orange tabby cat traits, cat whiskers, feline face;
realistic fur, photo-real, 3D render, painterly, gradient fur, glow, blur, anti-aliasing, semi-transparent pixels, pure #000000 / #FFFFFF large areas;
text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery, furniture, ground shadow, second character, extra limbs, extra tail, duplicated ears;
official DeepSeek logo/mascot, official affiliation claim, real animal photo.
```

## 5. 验收清单

- [ ] 金黄毛（非金棕/棕黑/红棕）、无眼斑、垂耳、大尾；与猫 OC 剪影区分 >10%。
- [ ] 成年犬比例，头不放大；无腮红/心形瞳/幼犬化/卖惨眼。
- [ ] 96²、透明底、hard alpha、四角透明、≤40 可见色、1 px `#0B1220` 闭合轮廓、无纯黑纯白大面积。
- [ ] 7 tags/36 帧；loop tag 首尾闭合。
- [ ] 无文字/Logo/官方元素；AI concept 标识；无真人声线/真实动物录音。
- [ ] 未用旧占位（金棕眼斑狗）作参考；未用 API 生成（本轮）。

## 6. 未生成声明

本轮**没有调用图像 API、没有生成任何狗图片**；prompt 均为文本。未来若获批生成，必须走「concept → 人工像素重绘 → 门禁 → 2× 终审」，AI 直出不得当 final。
