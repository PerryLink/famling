# UI / 图标 / 背景 / roleplay 91 资产生成报告（2026-11-17）

> **2026-11-17 状态更新（全年龄拍板覆盖旧 18+ 建议）**：用户已拍板年龄口径为**全年龄、不设年龄门**；本报告中 `RP-002` 原“18+ 门槛徽章/唯一像素字「18+」”的做法已被取代，改为**无文字**的中性全年龄标识（八边形 + 绿色对勾）。全套 91 张资产现为**零文字**；91/97 计数、尺寸档、硬 alpha 与色数上限不变，仅 RP-002 的像素与 sha256 更新。历史生成内容不回改，仅以本条状态为准。

- **Status: 占位/试点级交付（placeholder/pilot），不是 final art。** 未做人工像素终审、未做商业清权、未接 UI 代码、未做 Windows 托盘实测、未做 git。许可 `placeholder-only`（禁商用）。
- 本轮为**本地确定性像素绘制**：Python + PIL 图元在整数网格上逐像素绘制，**0 图像 API、0 AI 模型、0 网络、0 美元**；无 OpenRouter/任何生图服务调用，故无预算消耗与风格漂移。
- 交付对象：按 `docs/art/per-image/INVENTORY-UI-ROLEPLAY-2026-11-16.md`（INV-91）与 `docs/art/Q-ONLY-IMAGE-MANIFEST-2026-11-16.md` §2 的 **47 组 / 91 逻辑资产**。
- **计数口径：91 逻辑资产 = 91 主档文件 + 6 个 roleplay 2x 档 = 97 物理文件**（96 PNG + 1 ICO）。INV-91 §1/§3.9 明确 roleplay「1 资产=2 尺寸档同 ID、不重复计数」；`docs/audit/UI-DEFAULTS-GAP-AUDIT-2026-11-17.md` §1 亦写明「91 是 registry 条目，不是物理文件数」，按现 registry 物理文件约 97。本轮与 lead 确认按 A 口径（91 assets / 97 files）落盘。
- 写入边界（只写以下内容）：`public/assets/ui/**`、`art/_placeholder/ui-91-2026-11-17/**`、`docs/art/UI-91-*`、`tests/ui-assets*.test.ts`；另按本轮验收要求执行 `npm run build` 刷新了 gitignored 的 `dist/` 构建产物。**未改** `src/pet/consent|safety|security`、`src/pet/main.ts`、`pet.html`、Advisers/OC 代码；未接 UI、未弹窗。

## 1. 交付物

| 交付物 | 路径 | 说明 |
|---|---|---|
| 资产（96 PNG + 1 ICO） | `public/assets/ui/{menu,props,badges,placeholders,indicators,icons,backgrounds,fx,roleplay}/` | 按 `U-*`/`RP-*` ID + 尺寸命名，例如 `menu/U-MENU-01a_32x32.png`、`roleplay/RP-001_128x128.png`、`icons/U-ICON-04_app.ico` |
| 机器可读清单 | `public/assets/ui/manifest.json` | 91 资产 / 97 文件；id/size/source/license/ai:none/sha256/role/priority/variants/icoSizes + 全量 fileIndex + palette/style/license/counts |
| 人读映射 | `public/assets/ui/MAPPING.md` | 组总览、逐 ID 表（文件/尺寸/用途/优先级/建议消费点）、尺寸契约、状态映射、未做项 |
| 生成器（可复现） | `art/_placeholder/ui-91-2026-11-17/gen_ui91.py` | 确定性绘制 + 内建校验 + contact sheet + verify 模式；含全部坐标，无随机数 |
| QA contact sheet | `art/_placeholder/ui-91-2026-11-17/contact-sheet.png` | 全量 91 资产 + ICO 四档，按组最近邻缩放、透明棋盘底 |
| 深底/浅底可读性 | `.../contact-sheet-dark.png`、`.../contact-sheet-light.png` | `#0B0E14` / `#F0E4D4` 两底色、2x 整数放大 |
| 16/32 清晰度抽检 | `.../clarity-16-32.png` | 12/16/24/32 全部小档 x3–x8 最近邻放大 |
| 校验报告 | `.../verify-report.json`（同步副本 `docs/art/ui-91-qa/verify-report.json`） | 17/17 检查通过（见 §6）；`docs/art/ui-91-qa/` 另存 4 张 contact sheet 供测试读取 |
| 测试 | `tests/ui-assets.test.ts` | 15 个 test 锁 91/97、命名、尺寸、alpha、色数、轮廓、2x 整数、ICO、MAPPING、roleplay 无文字全年龄标识、9-slice、清晰度 |
| 报告（本文） | `docs/art/UI-91-GENERATION-2026-11-17.md` | — |

注：`art/_placeholder/**` 在 `.gitignore` 中（仓库既有策略），生成器/contact sheet/verify 报告是**本机 QA 证据**；`public/assets/ui/**` 为可入库交付物。

## 2. 生成方式（确定性，无模型）

- **逐像素绘制**：所有图形由 `rect / hline / vline / polygon / disc / ring / rrect / Bresenham line` 在整数像素网格上绘制；PIL 的 polygon/line 在 1x 下无抗锯齿；**无缩放插值、无渐变、无半透明、无阴影模糊**。
- **轮廓**：先画填色，再由 `add_outline()` 在「与不透明像素 4-邻接的透明像素」上补 1px 闭合轮廓 `#1b1612`；占位图为灰色线稿例外；动线/箭头/旋钮等 1px 强调元素在轮廓后绘制（不计入闭合轮廓，测试按白名单校验）。
- **整数倍档**：64=32×2、96=48×2、32徽章=16×2、RP 2x 档=母版×2 全部由最近邻整数放大（Pillow `Resampling.NEAREST` 整像素复制，测试逐像素比对）；**16px 道具 / 12/16/24px 指示器 / 32px 徽章为单独重绘**（独立坐标，不是缩小 32）。
- **256 应用图标** = 32 网格设计 ×8 整数放大；**ICO** = 16(U-ICON-01)/32(U-ICON-02)/48(U-ICON-01×3)/256(U-ICON-03) 四档打包为 PNG-compressed ICO entry（Pillow 写入，测试解析 ICONDIR 并逐像素比对四档）。
- **可复现**：无 RNG、无时间戳依赖、无外部字体（contact sheet 的标签字体不进入资产）；同一脚本两次生成逐字节相同（`--verify` 重渲染并与 manifest sha256 比对通过）。
- 命令：
  ```bash
  python3 art/_placeholder/ui-91-2026-11-17/gen_ui91.py            # 生成 97 文件 + manifest + MAPPING + QA
  python3 art/_placeholder/ui-91-2026-11-17/gen_ui91.py --verify   # 只校验磁盘/manifest/sha/重渲染确定性
  node --import tsx --test tests/ui-assets.test.ts                  # UI 契约测试（14 test）
  npm test                                                          # 全量回归（750 test）
  npm run typecheck && npm run build
  ```
- 生成耗时（本机实测）：wall ≈ 2.5 s，CPU ≈ 1.5 s（含 4 张 contact sheet 合成）。

## 3. 分组与尺寸（91 / 97）

| 组 | 资产 | 文件 | 尺寸档 | P | 色数实测/上限 | 轮廓 |
|---|---:|---:|---|---:|---|---|
| 右键菜单图标 `U-MENU-01a..10b` | 20 | 20 | 32 母版 + 64=2x | P1 | 4–9 / 12 | `#1b1612` |
| 道具 `U-PROP-01a..06c` | 18 | 18 | 16 重绘 + 32 母版 + 64=2x | P1 | 4–10 / 12 | `#1b1612` |
| 状态徽章 `U-BADGE-01a..06b` | 12 | 12 | 16 母版 + 32=2x | P1（06=P0） | 3–6 / 6 | `#1b1612` |
| 占位/加载/错误/回落 `U-PH-01a..04b` | 8 | 8 | 48 母版 + 96=2x | P1（03/04=P0） | 2–5 / 8 | `#8fa8c0`（虚线/线稿） |
| 指示器 `U-IND-01a..06c` | 18 | 18 | 12/16/24 各自重绘 | P1 | 2–5 / 8 | `#1b1612` |
| 应用/托盘图标 `U-ICON-01..04` | 4 | 4 | 16 / 32 / 256=32×8 / ICO 16/32/48/256 | P0 | 5–6 / 6 | `#1b1612` |
| 背景 `U-BG-01..03` | 3 | 3 | 480×336（10:7） | P2 | 4–7 / 16 | 见 §4 |
| 动效位图 `U-FX-01..02` | 2 | 2 | 24×24 / 48×48 | P2 | 3–4 / 6 | `#1b1612` |
| roleplay `RP-001..006` | 6 | **12** | 64+128 或 32+64（同 ID 两档） | P1 | 4–8 / 16 | `#1b1612` |
| **合计** | **91** | **97** | 12/16/24/32/48/64/96/128/256/480×336/ICO | **P0 10 / P1 76 / P2 5** | 2–10 / 组上限 6–16，全局硬上限 32 | — |

- 每个 ID 的用途、建议消费点、优先级与文件路径见 `public/assets/ui/MAPPING.md`。
- 实际磁盘尺寸分布（97 文件）：16²×19、32²×27、64²×22、96²×4、48²×5、24²×7、12²×6、128²×2、256²×2、480×336×3、ICO×1。
- 调色板 `famling-ui-pixel@0.1`（见 manifest `style.palette`）：冷蓝 `#2f6bff/#4d86ff/#1b3b7a/#76a4ff/#99c8ff`、纸白 `#f4f9ff/#f0e4d4/#e8d6b0/#d8c3a5/#b9a58e/#8f7a5a`、记忆金 `#e0b35a/#f4d98e/#8f6a1f`、语义绿 `#3fa66b`、琥珀 `#e0b35a`、红 `#d95f5f`、灰蓝 `#8fa8c0`、描线 `#1b1612/#101a30`。不用纯黑 `#000`/纯白 `#fff`。

## 4. 背景 / FX / roleplay 细节

- `U-BG-01`（首启）：480×336 **不透明**纸桌 + 折痕 + 四角折页，低对比（4 色系），中心留白给 DOM 文本；图内无字。
- `U-BG-02`（费用提示）：480×336 透明中心，账本横线 + 金币母题的边框；金额/文字一律 DOM。
- `U-BG-03`（About）：480×336 九宫格纸框，**32px 边**；实测中段边带在拉伸方向完全均匀（无接缝，测试锁定 top/bottom/left 中段一致性）；中心透明。
- `U-FX-01`：24×24 纸色气泡 tail，透明四角，2 阶色；CSS 可 0 图替代。`U-FX-02`：48×48 折页闪光单帧（第 2 帧按文档由运行时整数 scale+opacity 派生，未额外落盘）。
- roleplay（C1 合规）：
  - `RP-001` 64+128：剧场面具 + 对话框模式卡，中性、非恋爱、非真人。
  - `RP-002` 32+64：**全年龄适用标识（无文字）**；中性八边形 + 绿色对勾，表“全年龄适宜”，不设年龄门、不出现 18+/成人向；状态文字由 DOM 承载。全套 91 张资产零文字。
  - `RP-003` 32+64：AI 闪光 + 对话框（非人脸、无官方 Logo）。`RP-004` 32+64：钟 + 暂停条（平静色）。`RP-005` 64+128：救生圈 + 求助卡（无医疗十字、不承诺保密，热线号不烘焙）。`RP-006` 32+64：开门 + 橡皮（退出/清除记忆，删除操作仍需 DOM 二次确认）。
  - 无爱心/戒指/婚纱/亲吻/CP/好感度/等级/排名/签到；无真人脸；无露骨内容。

## 5. 合规与许可

- **C0/C1**：所有图标无字母/数字/水印（含 RP-002；原「18+」字模已在 2026-11-17 全年龄拍板后删除）；无 DeepSeek 官方 Logo/字标/favicon/鱼形 mark/官方鲸鱼娘，无鲸鱼/官方联想形态；不使用任何官方/同人参考图（生成器不含图片输入）。
- **AI 披露**：`ai: "none"`，`generation.api/model/network: "none"`，`costUSD: 0`；逐文件 `notOfficialDeepseek: true`。
- **许可**：本轮按仓库现行 placeholder 政策登记为 **`placeholder-only`（commercial use not granted，SPDX 不声明）**。仓内 final art 政策目标仍是 **CC-BY-NC-SA-4.0**（D2 未拍板，付费版需另清权）；这批图**不自称 final、不授予商用、不扩展到 CC0 范围**（CC0 仅覆盖作者声明的汀岚相关素材，明确不覆盖 UI/图标）。接入正式包前需由资产/法务流程重新登记。
- 未声称商业化完成、未声称最终审核完成、未声称已通过法务复核。

## 6. 验收结果（自动）

- 生成器内建校验：**17/17 pass**（`art/_placeholder/ui-91-2026-11-17/verify-report.json`）：assets=91、files=97、ID 唯一、manifest↔disk 文件集一致、sha256+重渲染确定性、MAPPING 覆盖全部 ID/文件、RP 6×2 档、RP 2x 逐像素精确、4 张 QA sheet 存在。
- 生成期额外校验（不通过则拒绝落盘）：PNG 尺寸/硬 alpha(0/255)/四角透明/不透明像素>0、逐组色数上限与全局 ≤32、轮廓边界像素为描线色或允许的 1px 强调色、BG-01 全不透明、BG-02/03 中心透明、BG-03 九宫格中段无接缝、2x 档=最近邻整数放大、ICO 四档 ICONDIR/PNG 签名/IHDR 尺寸一致。
- `tests/ui-assets.test.ts`：**15/15 pass**，独立解码 PNG（自带 filter 0–4 解码器，无新依赖）并锁定上述契约 + 命名/尺寸与文件名一致 + 磁盘 97 文件一一对应 + MAPPING 内容 + 16/32 覆盖率/剪影唯一性 + roleplay 合规色相 + 背景 480×336/10:7 + 全套无 18+ 年龄门口径。
- 全量回归：**`npm test` 750/750 pass**（含本轮新增 all-ages 契约 1 个；未改主代码语义）；`npm run typecheck` 通过；`npm run build` 成功，`dist/assets/ui/**` 复制 99 文件（97 资产 + manifest + MAPPING）。
- 颜色实测：全 91 资产每张 2–10 色（≤ 组上限；远低于 32 硬上限），硬 alpha 全部 2 值、无半透明；四角透明为默认（BG 例外按设计）。
- 文件 sha256 全量登记在 manifest `fileIndex[].sha256` 与 `assets[].sha256`；manifest 自身 sha256 见 §9。

## 7. 成本

| 项 | 数值 |
|---|---|
| 图像 API 调用 | **0**（未调用 OpenRouter/任何生图 API） |
| 模型/网络 | 0（无模型、无网络请求） |
| API 费用 | **$0** |
| 本地算力 | 约 2.5 s wall / 1.5 s CPU（单机一次全量重建） |
| 后续人工 | 仍需要人工像素终审与接入 QA（见 §8），按 INV-91 估算 91 张人工 17h+ 的预算**未被本轮替代**：本轮交付的是可评审、可接入、可复现的占位/试点美术，不是已审核 final |

## 8. 已知不足 / 仍需人工

**资产质量（本轮明确不做 final 表态）**

1. 全部 91 张为**本地手绘式像素占位/试点**，未做人工像素终审（Aseprite/像素级修边、闭合轮廓逐张核、16px 逐张微调）。
2. 64/96/128/256 档多为整数 2x/8x 放大（符合 INV-91 规格），在 64+ 观感偏「块状」；若最终产品需要原生 64 细节，需人工重绘（规格当前不要求）。
3. 16px 道具、12px 指示器为满足清晰度做了简化（如 12px 悬停箭头省略 1px 环、12px 尘弧只留剪影），与 24px 母版非严格同形，符合「各自重绘」要求但需在真实深/浅底上人工确认。
4. `RP-002` 已改为**无文字**的中性全年龄标识（八边形 + 绿色对勾），不再有手绘像素字；原“字模/DOM 叠字复核”项随 2026-11-17 全年龄拍板取消（状态文字统一由 DOM 承载）。
5. 16 张 roleplay 卡片（6 资产×2 档）仍是中性示意；文案/热线/全年龄声明逻辑由运行时承载（不设年龄门），本轮仅资产。
6. `U-ICON-03/04` 是占位 app icon，未替换 `app/tauri/src-tauri/icons/`（该动作属于工程/发布，且需登记来源）。ICO 采用 PNG-compressed entries（Windows Vista+ 正常，极老工具可能只读 BMP entry），未在 Windows 10/11 托盘/资源管理器实测。
7. 未做人工深浅底截图验收（自动化 contact sheet 已生成 dark `#0B0E14` / light `#F0E4D4` 两张供复核）；未做 DPR 125/150 实测。
8. 背景 3 张是装饰性占位：`U-BG-01` 中心和 `U-BG-02/03` 边框的低对比/折角风格仍需人类美术定稿；未接任何页面。
9. 文档明确但本轮未出的关联件：`U-IND-05` 有声对偶（去斜杠 3 文件，G2）、托盘 20/24（P1）、可选 spritesheet（≤3 张）——均不在 91 范围，未生成。

**流程/集成**

10. 未接 UI 代码：`pet.html`/`main.ts`/`desktop-shell.ts` 未改，右键菜单/徽章/占位/roleplay 仍无图消费点；本轮只交付资产 + manifest/mapping 供后续接入。
11. roleplay 运行时仍 0 行（G5），6 资产暂无消费方；全年龄声明/2h/危机/退出控制点为 DOM/运行时工作。
12. 未跑发布门（placeholder release gate）、未做商店/宣传素材、未做 git；`art/assets.csv` 未扩 schema 登记 UI（本轮以 `public/assets/ui/manifest.json` 作为 UI registry，是否并入全局 assets.csv 由后续资产流程决定）。

**仍需人工设计（建议优先级）**

| 优先级 | 项 | 原因 |
|---|---|---|
| P0 | `U-ICON-01..04` 应用/托盘图标人工定稿 + Windows 托盘/app icon 替换实测 | 唯一进入 OS 壳层的位图；现为占位 |
| P0 | `U-BADGE-06a/b`、`U-PH-03/04` 人工复核 + 占位门消费点（G6） | P0 语义但当前无 UI 消费点 |
| P1 | 菜单 10 项 32/64 人工像素终审 + 深/浅底截图（G11） | 菜单 Phase 1A 接入前定稿 |
| P1 | 12/16/24 指示器三档在真实 DPR 下逐档验收（G3/G11） | 无整数缩放链，需逐档确认不糊 |
| P1 | `RP-002` 无文字全年龄标识 + 全部 RP 6 张法务/内容复核（C1） | 合规门；18+ 字模项已随全年龄拍板删除，保留内容/法务复核 |
| P1 | 静音「有声」对偶 3 文件（G2）+ 托盘 20/24 | INV-91 已列缺口，非 91 范围 |
| P2 | `U-BG-01/02/03` 美术定稿 + 9-slice 实机切片验收；`U-FX-01/02` 决定是否保留位图（CSS 可替代） | P2 装饰/动效 |

## 9. 校验与复现

```bash
# 1) 重建 + 自校验（17/17）+ 重写 manifest/MAPPING/QA
python3 art/_placeholder/ui-91-2026-11-17/gen_ui91.py

# 2) 只校验（含重渲染确定性比对，不写盘）
python3 art/_placeholder/ui-91-2026-11-17/gen_ui91.py --verify

# 3) 契约测试（15 个 test）+ 全量回归
node --import tsx --test tests/ui-assets.test.ts
npm test          # 750 pass
npm run typecheck # tsc --noEmit
npm run build     # vite build，dist/assets/ui/** 含 99 文件
```

- 本次快照指纹（2026-11-17 全年龄拍板后重建）：
  - `public/assets/ui/manifest.json` sha256 = `c41607320ce03b05916ad6bf673244f0fb0cb3e0b807919400bcda1272014e5e`
  - `public/assets/ui/MAPPING.md` sha256 = `8a21322987ff5e490b08ed392c37a58037b3dd832c9c3188d54841a7966f3d88`
  - `art/_placeholder/ui-91-2026-11-17/gen_ui91.py` sha256 = `385580ee79fb9957009b8be29211497d4cdfed2ee328f2024b84fb587812d5b9`（同值登记于 manifest `generation.generatorSha256`；与 `scripts/gen_ui91.py` 同内容）
  - 资产总字节 39,872 B（96 PNG + 1 ICO），目录合计约 181 KB（含 manifest/MAPPING）。
- 对照文档：`docs/art/per-image/INVENTORY-UI-ROLEPLAY-2026-11-16.md`（47 组/91）、`docs/art/Q-ONLY-IMAGE-MANIFEST-2026-11-16.md` §2、`docs/art/ART-DEFAULTS-UI-2026-11-16.md` §5、`docs/art/UI-MOTION-AUDIT-2026-11-16.md`、`docs/audit/UI-DEFAULTS-GAP-AUDIT-2026-11-17.md`（91 vs 97 口径）、`ASSET-LICENSES.md` / `LICENSE-ART`（placeholder-only 与 CC-BY-NC-SA-4.0 政策）。

## 10. 边界声明

- 本轮**没有**调用任何图像 API、模型或网络；**没有**改 UI 代码、**没有**接入/弹窗、**没有**替换 Tauri 图标、**没有**做 git。
- 本轮产出**不是** final art，**不是**商业可用资产，**未经**法务/内容安全终审；使用/发布前必须按项目政策补人工终审、许可登记与合规复核。
- 91/97 的口径差异是 INV-91 自身定义（roleplay 两档同 ID）导致的登记口径差异，已在 manifest、MAPPING 与本文显式登记，不是漏项。
