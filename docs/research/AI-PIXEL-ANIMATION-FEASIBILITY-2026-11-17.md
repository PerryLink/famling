# 研究：AI 生成像素角色关键帧/动画的可行性、风险与推荐工作流

> 日期：2026-11-17 ｜ 范围：2D 像素桌宠（当前 spec 96×96、40 可见色、1px 闭合轮廓、二值 alpha、7 动作 tag/36 帧；128 为待拍板候选）。
> 性质：桌面研究 + 机制分析 + 成本估算。**未生成图片、未调用图像/视频生成 API、未改代码、未做 git 操作。**
> 标注：`[公开]` 有 URL；`[机制]` 由生成原理/论文推出；`[本地估算]` 按本仓数据/公开成本推算。**本文不是法律意见。**

## 0. 结论（TL;DR）

1. **AI 目前不能稳定产出可进生产的像素关键帧**：扩散/视频模型输出的是连续色调的“像素风插画”，不是共享同一整数网格、同一色板、同一锚点的离散帧；逐帧独立生成必然漂移，seed/ControlNet/reference 只能降低、不能消除。
2. **AI 的可用位置在上游**：概念探索、剪影、三视图/设定稿、配色与姿态参考。进入项目时必须标“AI 概念、非终稿”，不得直接缩放/像素化后当 sprite。
3. **推荐工作流**：程序化占位（`placehold.py`）→ 人工 Aseprite 在 1× 网格画母版/关键帧 → 程序化 offset/hold/overlay 补间 → 自动 gate + 人工 1× 终审；AI 只做 concept，内部使用。
4. **不推荐**：AI 直出 36/48 帧、RIFE/FILM 插帧、视频模型转 sprite、未清权 LoRA/参考图。它们把成本从“画帧”转成“修帧 + 清权 + 标识 + 返工”，且质量不达标。
5. **成本直觉**：AI 单图很便宜（本仓 24 次生成合计 $1.51，含不可发布草稿，`AI-PROVENANCE.md`），但一致性/像素合规的**人工返工**才是大头；96px 单帧按 2–4 人时、首切片 7–13 人天、完整 7 tags 9–17 人天 [本地估算]。AI 省的是概念探索，不是终稿工时。

## 1. 为什么 AI 多帧容易漂移

### 1.1 七类不一致（对应“生成不稳定”的具体表现）

| 类型 | 典型症状 | 为什么模型保证不了 | 现有控制残余 |
|---|---|---|---|
| 身份/脸 | 眼距、脸型、肤色、纹样位置逐帧变；同提示词两次脸不同 | 扩散每次从噪声重新采样；身份条件只提高相似度，不保证同一实例 | 母版 + 人工重画 |
| 发型/服装 | 发梢、刘海、绑带、扣子数量与走向变化 | 细碎结构在 latent 中没有稳定表示；文字无法锁定实例细节 | 简化设计 + 固定部件 + 人工修 |
| 轮廓/比例 | 剪影变形、手臂/尾巴长度变、头身比漂 | 模型按语义补全，不遵守你的 bbox/骨架；低分辨率歧义更大 | 剪影先行 + bbox/锚点 gate |
| 像素网格/AA | 块大小不一、跨格、软边、半透明边、光晕 | 输出是连续图像/压缩 patch；“像素风”≠1:1 网格，抗锯齿是默认行为 | 网格检测/吸附 + 二值 alpha；仍可能形状坏 |
| 方向/pose | 正/侧/背不严格旋转、脚底不共线、接触点漂 | 没有 3D/骨骼约束；pose 条件只给粗骨架，不给像素级实例 | 人工三视图/骨架；ControlNet 仅辅助 |
| 色板/明暗 | 色数暴涨、渐变、阴影方向变、描边色变 | 模型生成连续色；逐帧独立量化→颜色跳变；明暗逻辑不共享 | 全局色板 + 固定 ramp + 人工统一 |
| 时序/接触 | 帧间抖动（boil）、循环首尾不接、预备/回收缺失 | 逐帧生成没有时间模型；视频模型会平滑/糊化，不是关键帧语义 | 人工关键帧 + onion skin；程序 hold/offset |

### 1.2 seed / ControlNet / reference 的局限

- **seed**：只固定初始噪声/采样起点；扩散每次仍随机，跨版本/平台不保证复现（Diffusers 明确“即使 seed 相同也不保证”）。本仓 gpt-image 调用没有 seed，无法逐像素复现。美国版权局也明确：seed 不满足作者性要求。
- **ControlNet**：可加边缘/深度/分割/人体姿态等空间条件，解决“大致姿势/构图”，不解决身份细节、色板、AA、像素网格；多条件会冲突，低分辨率条件图本身有噪声 [公开/机制]。
- **reference / IP-Adapter / LoRA**：图像提示/低秩适配能迁移风格与身份特征，但输出仍是“新采样”；一套三视图不等于 3D 一致；LoRA 常见需 10–30 张干净素材、锁模型、易过拟合，训练数据权利另算 [公开/本地经验]。
- **prompt/三视图**：提示词最弱且词序敏感；三视图能锁“设计”，不能锁“像素”。真正的一致性来自母版 + 人工逐帧重画 + gate [机制]。

### 1.3 diffusion 默认不是像素：AA、色板漂移、网格失败

- 生成空间是连续色/压缩 patch；所谓 pixel art 往往是“画出来的像素感”，放大可见块大小漂移、混合尺寸、数百色、软边/光晕（Retro Diffusion 的缺陷清单）。
- 像素化后处理只能修“对齐/色数/alpha”，修不了“模型没理解形状”的 steps、歪轮廓、错位眼睛；RD 自己也承认 fix 止于 intent。
- 本仓 `pixelize.py` 定位是清理/装配层，不是端到端生成器；不要用“代码像素化”当去 AI 痕迹的万能药（`docs/ART-PIPELINE.md`）。

## 2. 可行做法与限制

| 做法 | 能解决什么 | 限制/代价 | 本项目可用性 |
|---|---|---|---|
| AI 概念/剪影/配色 | 打开方向、试头身/气质/色板 | 只到“参考”；不可入包 | ✅ 内部 concept |
| AI 三视图/设定稿 | 正/侧/背、服装/发型方案 | 比例/细节会漂；需人工校正 | ✅ 仅 design lock 参考 |
| img2img / 局部重绘 | 改衣、表情、局部姿势 | 每次重采样；alpha/边缘漂移 | ⚠️ 只做概念变体 |
| ControlNet pose/lineart/depth | 大致姿势/构图 | 细节/身份/像素网格不保证；96px 条件图噪声大 | ⚠️ 研究/参考 |
| IP-Adapter/reference | 风格/角色相似度 | 精确实例不保证；参考图版权风险 | ⚠️ 仅自产参考 |
| 人工 Aseprite 逐帧 | 唯一满足 1×/40 色/锚点/二值 alpha 的路线 | 慢、贵；依赖画师 | ✅ 生产 |
| 程序化补间/overlay/骨骼 | offset/hold/表情/次级运动；确定性 | 大姿势/转向做不了；需母版 | ✅ 生产辅助 |
| palette quantization + grid snap | 去 AA/限色/吸附网格 | 修不了结构；逐帧量化会闪色 | ✅ 仅清理 |
| RIFE/FILM 插帧 | 平滑中间帧 | 非整数网格、糊边、新色、alpha 坏、时序不对 | ❌ 不用 |
| 视频生成模型 | 自然视频的时序连贯 | 训练目标是平滑/真实运动；像素帧糊/变形；通常无 alpha/色板控制；随机不可复现 | ❌ 不做帧源 |
| LoRA 训练 | 绑定角色/画风，批量概念变体 | 需干净数据、锁模型、过拟合、数据权利 | ⚠️ 仅概念研究 |
| AI 动画工具（PixelLab 等骨架/模板） | 比文生动画可控；固定头/冻结帧/局部重绘 | 仍非像素精确；尺寸/帧数限制；需人工挑修 | ⚠️ 原型可试 |

### 2.1 为什么 frame interpolation（RIFE/FILM）对像素风通常不可用

- RIFE/FILM 是为自然视频/大运动设计的流估计/插值；输出的是“连续图像中间帧”，不是共享像素网格的关键帧。对像素风会糊边、改变色板、破坏二值 alpha、产生 off-grid 像素 [机制]。
- ICCV 2023 线稿 inbetweening 论文指出 warp/blend 会糊掉线条边界，对稀疏线稿已不适用；像素画每像素都有语义，更极端。专门的 sprite 插帧研究也需 RGBA-aware、alpha-gated、按像素艺术约束重训（arXiv 2610.27253）。
- 本项目动画时序应人工 key + hold/offset/linked cels；插值最多用于“预览/参考”，不能进图集。若真实验：插值后仍要人工逐帧重画，成本高于直接画。

### 2.2 自动一致性指标：能筛，不能替人验收

| 指标 | 测什么 | 不能替代什么 |
|---|---|---|
| SSIM | 结构/亮度相似 | 对像素/身份不敏感；颜色漂移也可能高分 |
| LPIPS | 深层感知相似 | 可容忍像素差异；不保证色板/alpha |
| CLIP/DINO 相似度 | 语义/身份“像不像” | 不保证同服装/同朝向/同像素 |
| 颜色统计（色数、主色、直方图/ΔE、帧间色差） | 色板漂移、闪色 | 不能判断颜色位置/形状 |
| bbox/pivot（锚点）/alpha 质心 | bbox 漂移、脚底基线、旋转轴心 | 不能判断姿势语义 |
| 轮廓/剪影 IoU | 与母版剪影重合、1px 轮廓闭合 | 不能判断内部细节/明暗 |
| 帧间/循环 diff | 抖动、首尾差、闪色 | 不能判断动作可读性 |
| 人工 1× 回放 | 可读性/节奏/情绪 | 成本高，必须保留 |

## 3. 路线对比与推荐

| 路线 | 质量 | 成本/周期 [本地估算] | 权利/合规 | 建议 |
|---|---|---|---|---|
| 全人工 | 可达标（1×/色板/锚点） | 2–4 人时/帧；首切片 7–13 人天；7 tags 9–17 人天 | 最干净：原创 + 人工；仍需第三方参考清权 | ✅ 生产基线 |
| AI 辅助（concept only） | ≈全人工；概念阶段更快 | 概念 API 费很低（本仓 24 次 $1.51）；+0.5–2 人天筛选/整理；帧仍按人工 | AI concept provenance/标识；不得直接发布 | ✅ 现在可做 |
| AI 直出关键帧 + 人工修 | 大概率不达标（漂移/AA/色板/锚点） | API $3–9/角色级 + 10–18h QA/修 [估算]；返工可能 > 人工 | 标识 + 模型 ToS + 训练/参考清权，风险最高 | ❌ 不上生产 |
| 程序化占位 | 几何/锚点正确，非终稿 | 近零；现有 `placehold.py`/36 帧占位 | 自产确定性脚本，风险低 | ✅ 先占位/QA |
| 混合（推荐） | 可上线质量 | 人工为主 + 脚本辅助 | 需登记 AI concept + 参考来源 | ✅ |

### 3.1 明确推荐

1. **现在**：保持程序化占位 + 人工终稿；AI 只做 concept（内部）；不上 AI 生产帧。
2. **动画**：Aseprite 逐帧 + linked cels + onion skin；程序做 offset/hold/overlay/眨眼/次级运动；不做 AI 插帧。
3. **若试点**：1 角色/1 tag/8 帧，硬 gate：网格 1:1、AA=0、≤40 色、alpha∈{0,255}、1px 闭合轮廓、bbox/anchor/footBox 稳定、首尾 diff=0、1× 可读；不过门不扩产。
4. **成本口径**：AI 价格不是主要成本；把“筛选/修帧/清权/标识/QA”计入。
5. **发布边界**：任何 AI 图进入发布物前，先完成显式+隐式标识、provenance、清权与律师确认；当前条件不具备。

## 4. 与当前项目规则的冲突点

| 项目规则 | 与 AI 逐帧/概念的冲突 | 处置 |
|---|---|---|
| AI 标识（CAC 办法/GB 45438；EU AI Act 50；Steam 调查） | AI 图/视频进发布物需显式+隐式标识；AI 辅助终稿的定性 TBD；不得去标识或虚假称手绘 | 当前仅内部 concept（显式角标 8px/2.17:1 不达标，隐式仅 tinglan-256 49 PNG 有 tEXt，C2PA/导出/音频未落；见 `docs/legal/AI-LABELING.md`）；发布前补管线，律师确认 |
| CC BY-NC-SA 4.0 | 纯 AI 输出可版权性弱/可能无版权，难以作为 CC 授权标的；模型 ToS/训练数据可能限制再许可；商业需另许可 | 终稿人工；AI concept 不入 CC 素材清单；保留人工创作证据；商业另谈（`LICENSE-ART` 仍 DRAFT、律师审查暂缓） |
| 不可冒充官方/非官方 | 不得用 DeepSeek 官方 Logo/鲸鱼娘或暗示关联；AI 模仿官方角色风险高 | 只用自创 OC；发布物带非官方声明；不用官方图做参考/LoRA |
| 素材清权 | 参考图/LoRA/训练集/模型输出条款；同人图/描摹/改色复用禁止；`art/_placeholder/refs/` 永不发布 | 逐项 ledger + `AI-PROVENANCE.md` 登记；不用来源不明 LoRA/模型。本仓已有 ref10 教训：无授权同人图作 reference 派生图不得发布 |
| 像素 2D 硬约束（96×96、40 色、1px 轮廓、二值 alpha、整数 2×、anchor/footBox、8fps idle） | AI 默认输出违反全部；逐帧生成破坏网格/锚点/色板/循环 | 人工 1× 重画 + gate；AI 图只做 concept；`pixelize.py` 仅清理 |
| 平台/版权（Steam/中国/EU；USCO 人类作者） | 玩家可见 AI 内容需披露；纯 AI 不可登记；prompt/seed 不算作者性；效率工具豁免边界 TBD | 预生成/实时分类如实填报；保留创作 audit trail；法律意见后再上架 |

## 5. 可学习/可参考的步骤清单（避免直接复制他人角色）

### 5.1 工具
- **Aseprite**（动画/onion skin/linked cels/tags/sprite sheet；付费但业界标准）；免费替代 **Pixelorama**、**LibreSprite**。
- 色板 **Lospec**；教程 **Saint11**（像素教程/一致性/缩放）；动画法则 **12 principles**。

### 5.2 参考收集
- 选 3–5 款同类型商业像素游戏 + 2–3 段动作参考；记录 URL/作者/日期/许可；只截 1× 画面，不把 fan rip/付费素材提交进仓。
- 读帧数/节奏/剪影/头身比/色板/接触点；参考只用于“结构与规律”，不描摹、不改色复用。

### 5.3 临摹/结构学习
- 先拆剪影→比例→关键姿势（contact/extreme/recovery）→次级运动（头发/尾巴延迟）→FX/残影；用自己角色做同结构练习。
- “临摹”只作私有练习，不发布/不入包；不复制可识别角色/服装/纹样；AI 只做自己的 concept。

### 5.4 色板
- 24–40 色 + 透明；固定 outline `#0b1220`；每材质 3–4 阶 ramp；禁渐变/纯黑纯白；固定 dither pattern；全局 palette index，可换色板做皮肤。

### 5.5 逐帧检查
- 1×/2× 回放；剪影 3 秒读角色；onion skin 对齐；bbox/alpha 质心/脚底基线；alpha 仅 0/255；色数/描边/无 AA；首尾 diff=0；每帧独立可读；镜像检查；contact sheet；与母版 diff。
- 自动脚本先跑硬 gate，人工再做“可读性/情绪/节奏”终审；记录 FAIL 原因与返工。

### 5.6 原创/权利
- 用“参考结构 + 自创符号”而非复制具体角色；保留参考与 AI provenance；外部 IP 同人/描摹禁止。
- 发布前清权/律师审查；CC BY-NC-SA 只覆盖有人类创作贡献的最终素材（律师确认）。

## 6. 引用 URL

- Aseprite 动画/图集：<https://aseprite.org/docs/animation> · <https://aseprite.org/docs/sprite-sheet/>
- Pixelorama：<https://pixelorama.org/> · LibreSprite：<https://libresprite.github.io/>
- Saint11 教程：<https://saint11.art/> · 12 法则：<https://en.wikipedia.org/wiki/12_basic_principles_of_animation>
- Lospec 色板库：<https://lospec.com/palette-list>
- Retro Diffusion《Why AI pixel art looks wrong》：<https://retrodiffusion.ai/blog/ai-pixel-art-isnt-pixel-art>
- Retro Diffusion K-Centroid Downscale：<https://retrodiffusion.ai/tools/k-centroid-downscale>
- PixelLab 骨架动画：<https://www.pixellab.ai/docs/tools/animate-with-skeleton>
- Sprite 动画定向帧生成（2026）：<https://arxiv.org/abs/2610.27253>
- ICCV 2023 线稿 inbetweening：<https://openaccess.thecvf.com/content/ICCV2023/papers/Siyao_Deep_Geometrized_Cartoon_Line_Inbetweening_ICCV_2023_paper.pdf>
- RIFE（ECCV 2022）：<https://www.ecva.net/papers/eccv_2022/papers_ECCV/papers/136740608.pdf> · FILM：<https://arxiv.org/abs/2202.04901>
- ControlNet：<https://arxiv.org/abs/2302.05543> · IP-Adapter：<https://arxiv.org/abs/2308.06721>
- LoRA：<https://arxiv.org/abs/2106.09685> · DreamBooth：<https://arxiv.org/abs/2208.12242>
- Diffusers 可复现性：<https://huggingface.co/docs/diffusers/using-diffusers/reusing_seeds>
- SSIM：<https://ieeexplore.ieee.org/document/1284395> · LPIPS：<https://arxiv.org/abs/1801.03924> · CLIP：<https://arxiv.org/abs/2103.00020>
- 《人工智能生成合成内容标识办法》：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm> · GB 45438-2025：<https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F32EA2A561F1886CD8D606513512D547>
- EU AI Act 第 50 条：<https://artificialintelligenceact.eu/article/50/> · CC BY-NC-SA 4.0：<https://creativecommons.org/licenses/by-nc-sa/4.0/>
- 美国版权局 AI 入口：<https://www.copyright.gov/ai/>（本环境 403，结论经 Neal & Leroy 2026-01 解读交叉）：<https://www.nealandleroy.com/news/taking-a-closer-look-what-the-copyright-office-s-2025-ai-reports-mean-for-2026>
- Steam 内容调查：<https://partner.steamgames.com/doc/gettingstarted/contentsurvey>
- 本地事实源：`AI-PROVENANCE.md`、`LICENSE-ART`、`DECLARATIONS.md`、`docs/legal/AI-LABELING.md`、`docs/ART-PIPELINE.md`、`docs/research/PIXEL-CHARACTER-WORKFLOW.md`、`docs/research/ANIMATION-FRAME-TIERS.md`、`art/specs/pet.pearl.pixel.json`

## 7. 非法律意见与限制

- 本文**不是法律意见**；许可、AI 标识、版权、平台申报以律师与官方最新文本为准。`LICENSE-ART` 仍为 DRAFT、律师审查暂缓。
- 证据检索日期 2026-11-17；`copyright.gov` 在本环境返回 403，相关结论以官方入口 + 二手解读标注；RIFE/FILM 论文 PDF 未逐页复核，机制结论按论文摘要/公开说明。
- 所有“成本/人天/效果”标注为 `[本地估算]`/`[机制]`；未做真实生产 A/B，试点后才能外推。
- 未生成图片、未调用图像/视频生成 API；本文所述试点仅限内部研究，任何对外发布/入包须先完成标识与清权。
