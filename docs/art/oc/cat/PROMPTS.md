# 猫 OC（白布偶）· 生成提示词（身份母版 / 7 tags / 三视图 / 负面）

> Status: **提示词文档（2026-11-17）**。本轮**未生成任何猫图片、未调用图像 API**；本文只写 prompt。
> **禁止**：未经用户/美术线明确批准，不得用任何图像 API 生成猫/狗图片；本轮及后续默认不生成。若未来获批，AI 输出只能是 concept/placeholder，须人工像素重绘与 2× 终审。
> 视觉口径：**白布偶、蓝眼、长毛/重点色、软糯但不过度幼儿化**。现存 `public/assets/pet/cat-placeholder/**` 是旧占位（姜黄虎斑），**不得作为参考/母版**。

## 0. 使用规则

1. 每条 = `IDENTITY` + `TAG` 句 + `STYLE` 句；本文已写全，可直接整段复制。
2. 画布 **96×96**、anchor `(48,96)` foot-center、footBox `(−36,−18,72,18)`、bbox `[12,8,72,84]`、7 tags/36 帧、1×/2× 整数、`image-rendering: pixelated`。
3. 单角色、单四足 sprite；透明底；无地面阴影；无文字/Logo/水印；无第二角色。
4. AI 输出不是 final：必须经 `pixelize`/人工重绘/颜色门禁（≤40 色、1 px 闭合轮廓、hard alpha、四角透明）后才可入包。
5. 宠物内容不性化、不幼儿化、不做拟人恋爱；prompt 里不出现衣服/人类姿势/婴儿比例。

## 1. 身份母版（IDENTITY）

```text
original ragdoll cat OC, fictional AI pet character, non-official, no DeepSeek affiliation, AI concept draft not final art;
single quadruped cat sprite, full body, adult cat proportions (head about 1/2.5-1/3 of body length, not a kitten, not a big-headed baby), calm neutral pose, standing or sitting;
white-dominant long-haired coat, body white/ivory (#F2EFF2), soft long fur suggested by silhouette: chest ruff around the neck and a plumed tail;
colorpoint markings only on the face mask, ears and tail in cool blue-grey (#8D9AA8, deeper #6F7C8C), never ginger/tabby/orange;
blue eyes (#4F86C6 iris, #2F5F9E deep ring) with a clean 1 px white highlight, almond cat eyes, not oversized, no sparkles;
small triangular ears with pale inner ear, upright (not folded, not floppy); small pink nose; subtle pink paw pads;
long plumed tail with a blue-grey tip, relaxed; no collar by default (optional mist-blue collar only if explicitly requested);
flat cel shading with 2-3 hard-edged steps, 1 px closed dark outline (#0B1220), limited palette, no anti-aliasing, no gradients, no semi-transparent pixels;
96x96 sprite canvas, centered foot anchor, plain transparent background, no ground shadow, no scenery, no text, no logo, no watermark;
chunky pixel-art-style concept, readable silhouette at 1x, not final pixel art.
```

## 2. 7 tags / 36 帧提示词

> 身份段统一用 §1 `IDENTITY`；下面只写动作/表情差异。

### 2.1 `idle` — 8 帧 @8fps loop

```text
TAG idle, 8-frame seamless loop at 8 fps, relaxed standing/loafing pose;
slow breathing (chest +1 px on f1-f3, settle f5); 2-3 frame slow blink on f3-f5; ear flick on f2; tail tip sways 1 px in two phases; whiskers relaxed;
expression calm and soft, no constant staring, no exaggerated cuteness; first and last frame close for loop.
```

### 2.2 `pat` — 6 帧 @10fps one-shot（被摸头）

```text
TAG pat, 6-frame one-shot at 10 fps, response to a gentle head/chin touch (human hand NOT drawn);
f0 head tips into the touch 1 px; f1 eyes half-close, ears relax outward; f2 head presses 1 px and purr; f3-f5 slowly returns to neutral with a soft blink;
no blush, no hearts, no watery eyes, no baby expression; tail remains soft, no lashing.
```

### 2.3 `drag` — 4 帧 @8fps loop（被抱起）

```text
TAG drag, 4-frame seamless loop at 8 fps, cat gently lifted off the ground;
limbs tuck slightly, tail hangs and sways, body is tense but not flailing, eyes open and watching, ears slightly back, mouth closed;
no distress exaggeration, no scratching, no claws-out attack pose; first and last frame close for loop.
```

### 2.4 `land` — 4 帧 @12fps one-shot（落地）

```text
TAG land, 4-frame one-shot at 12 fps, cat lands on four paws;
f0 paws touch with a small squash (body compresses at most 2 px); f1 tail counterbalances upward; f2 settles, ears relax; f3 back to neutral idle pose;
no dust FX, no bounce beyond 2 px, no human-like landing.
```

### 2.5 `talk` — 4 帧 @12fps loop（喵）

```text
TAG talk, 4-frame mouth-open loop at 12 fps, a short single meow;
f0 mouth closed; f1 small open mouth (1-2 px); f2 open slightly wider; f3 closes; eyes neutral and calm; body stays still;
only mouth/whiskers change; no text bubble, no human speech, no singing.
```

### 2.6 `remind` — 6 帧 @10fps one-shot（轻推提醒）

```text
TAG remind, 6-frame one-shot at 10 fps, cat nudges the user's hand or the edge of the desk with its head;
f0 head-bump forward 1 px; f1 nose touches; f2 pause, eyes look up; f3 small second nudge; f4 tail lifts; f5 returns to neutral;
calm reminder, not begging, not demanding; no hand drawn, no text.
```

### 2.7 `sleep` — 4 帧 @2fps loop

```text
TAG sleep, 4-frame seamless loop at 2 fps, cat curled or lying on its side, eyes closed;
slow breathing: body rises 1 px on f0-f1 and settles f2-f3; tail wraps slightly; ears relaxed;
no Zzz text, no human-like pillow/blanket, no baby sleep pose; first and last frame close for loop.
```

## 3. 三视图（TURNAROUND，正交，96 / 128 可选）

```text
TURNAROUND, same IDENTITY ragdoll cat, orthogonal turnaround, three full-body views side by side: front, profile (90 degrees), back;
same size and baseline with +/-1 px tolerance, neutral standing pose, four paws on the ground, head forward, tail relaxed behind;
must clearly read: white-dominant long-haired body, chest ruff silhouette, blue-grey face mask/ears/tail tip, blue eyes in front view, triangular ears in all views, plumed tail in profile/back, no collar unless requested;
flat cel shading, 1 px closed dark outline, transparent background, no labels, no color swatches, no props, no second character, no text.
```

- 96：头约 24–28 px、身体 ~48–56 px、尾 ~22–30 px；长毛靠 1–2 px 轮廓起伏，不画毛丝。
- 若未来升级 128：只另绘，不放大 96；保持同一几何与 tags 契约。

## 4. 负面 prompt（Negative）

```text
ginger tabby cat, orange cat, brown cat, calico, green eyes, yellow eyes, heterochromia, eye patch;
red collar, golden bell, golden tag, dog collar, harness, clothes, dress, bow;
folded ears, floppy dog ears, short tail, no tail, cropped tail, bobtail;
kitten proportions, big baby head, chibi child, blush, heart pupils, watery eyes, sparkles, cartoon hearts, romantic gaze, seductive pose;
humanoid, anthropomorphic standing, human hands, human face, anime girl, person;
realistic fur, photo-real, 3D render, painterly, gradient fur, glow, blur, anti-aliasing, semi-transparent pixels, pure #000000 / #FFFFFF large areas;
text, letters, watermark, logo, signature, UI, speech bubble, labels, scenery, furniture, ground shadow, second character, extra limbs, extra tail, duplicated ears;
official DeepSeek logo/mascot, official affiliation claim, real animal photo.
```

## 5. 验收清单

- [ ] 白为主（≥60% 可见毛色）、蓝眼、蓝灰重点色只在面/耳/尾；无姜黄/虎斑/绿眼。
- [ ] 长毛剪影可读：颈部围脖 + 蓬松尾；1× 可辨。
- [ ] 成年猫比例，头不放大；无腮红/心形瞳/婴儿化。
- [ ] 三角耳与狗垂耳区分；猫尾与狗尾区分。
- [ ] 96²、透明底、hard alpha、四角透明、≤40 可见色、1 px `#0B1220` 闭合轮廓、无纯黑纯白大面积。
- [ ] 7 tags/36 帧；loop tag 首尾闭合。
- [ ] 无文字/Logo/官方元素；AI concept 标识；无真人声线/真实动物录音。
- [ ] 未用旧占位（姜黄虎斑）作参考；未用 API 生成（本轮）。

## 6. 未生成声明

本轮**没有调用图像 API、没有生成任何猫图片**；prompt 均为文本。未来若获批生成，必须走「concept → 人工像素重绘 → 门禁 → 2× 终审」，AI 直出不得当 final。
