# 美术重制 2026-11-22（final art）

> 状态：**final pixel art**（owner 已确认不做手绘 v2；AI 底稿 + 脚本精修）。
> 本文记录本轮替换的宠物动画资产、验证方式与来源；UI 97 文件随后续 UI manifest 再生更新。

## 1. 替换范围
- `public/assets/pet/anim/human/`（汀岚）：29 tags / **141** 帧（含 12-tag 兼容别名）
- `public/assets/pet/anim/cat/`（布偶猫）：29 tags / **143** 帧（含别名）
- `public/assets/pet/anim/dog/`（金毛）：28 tags / **136** 帧（含别名）
- 角色元数据：`public/characters/pet-tinglan-anim|pet-cat|pet-dog/character.json`（license/ai/meta.artStatus=final）
- 每个动画包的 `manifest.json`：tags/clips 更新、`assets` 与帧文件一一对应、`placeholder=false`。

## 2. 规格
- 96×96 PNG、二值 alpha、4 角透明；无 AA；调色板锁定（human ≤24、cat/dog ≤16 可见色）；
- 1px `#0b1220` 描边；普通帧 bottom-most y=89（groundY=89）；
- `drag` / `drag3` 为**悬空姿态**：bottom y=86–88，manifest/spec 中 `groundY=null`（悬挂时脚离地）；
- 新增动作包括 idle_sway / sway / look / look3 / wave6 / shy5 / yawn / blep / happy / beg / wake 等；
- 12-tag 兼容别名（pat_head/rub/stand_wag/paw_face/scratch/chase_tail…）保留为真实目录，旧 behavior 不需改动即可运行。

## 3. 验证
```bash
node --import tsx scripts/validate-character.mjs public/characters/pet-cat --json --strict
node --import tsx scripts/validate-character.mjs public/characters/pet-dog --json --strict
node --import tsx scripts/validate-character.mjs public/characters/pet-tinglan-anim --json --strict
```
- 三只角色 validator：**ok=true, errors=0, warnings=0**（本机 2026-11-22 复核）；
- 368 角色帧逐张通过官方 `tools/validate-delivery.mjs`（交付包内报告）；
- 一致性审计：重复帧 0、off-palette 0、边框缺轮廓 0.0%、ground 例外仅 drag；
- 全量交付包与本文件的来源、SHA256、contact sheet 见 GitHub release `art-delivery-2026-11-22`。

## 4. 来源与 AI 披露
- 本地 ComfyUI + **MiniMax-H3-Image**（int8 DiT + qwen3vl_32b TE + VAE，RTX 5090 D v2 24GB）；
- 母版：human `master_v7`（owner 选 A）；cat/dog `master_v2`（本地生成 + 脚本精修）；
- 参考：pixiv artwork 152150491（PerryLink, CC0 1.0），用于风格/比例参考，非描摹；
- 所有帧由本地脚本确定性派生（work/rig），逐帧 SHA256 记录在交付包；
- **模型许可：未核实（UNVERIFIED）**；新美术按项目默认 **CC BY-NC-SA 4.0** 分发，商用前请 owner 复核模型条款。

## 5. 已知后续
- UI 97 文件已生成并包含在 release 包中，但本仓 `public/assets/ui/manifest.json` 仍是 2026-11-17 版本；
- 建议后续单独提交 UI 替换 + manifest（sha256/size/palette/generation 字段）更新，并跑 UI 相关测试；
- `behavior.json` 未改；新 clip 已可被后续 behavior patch（交付包 `integration/behavior-patches/`）选用。
