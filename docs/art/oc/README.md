# OC 内容与提示词库（索引）

Status: **内容/提示词设计稿（2026-11-17）。未生成任何图片，未调用图像 API，未改代码/UI/美术资产，未做 git。**
> **2026-11-17 状态注记：用户已拍板年龄口径为全年龄、不设年龄门；旧“18+ roleplay 边界”表述已改为“全年龄 roleplay 边界 + 禁止进入 18+ 成人向内容”，历史结论不回改。**
范围：`docs/art/oc/**`（本目录），以及跨目录汇总报告 `docs/art/OC-COMPLETION-2026-11-17.md`、测试 `tests/oc-consistency.test.ts`。
角色：**汀岚（Tinglan，虎鲸秘书 OC）**、**猫 OC（白布偶）**、**狗 OC（金毛寻回犬，金黄毛）**。
语种：中文（prompt 正文为英文，便于直接送模；中文只做说明）。

## 0. 一句话

把三个角色的「设定 → 运行时语义 → 生成提示词」写成可交叉核对、可直接交给未来美术/生成流程的文档；本目录**不产出图片**，也不修改任何现有 canon/behavior/voice/代码。冲突只记录、不擅自改。

## 1. 文件索引

| 角色 | 完整设定 | 提示词（母版/7 tags/三视图/负面） | 运行时映射 |
|---|---|---|---|
| 汀岚 Tinglan | [tinglan/OC.md](tinglan/OC.md) | [tinglan/PROMPTS.md](tinglan/PROMPTS.md) | [tinglan/RUNTIME-MAP.md](tinglan/RUNTIME-MAP.md) |
| 猫 OC（白布偶） | [cat/OC.md](cat/OC.md) | [cat/PROMPTS.md](cat/PROMPTS.md) | [cat/RUNTIME-MAP.md](cat/RUNTIME-MAP.md) |
| 狗 OC（金毛） | [dog/OC.md](dog/OC.md) | [dog/PROMPTS.md](dog/PROMPTS.md) | [dog/RUNTIME-MAP.md](dog/RUNTIME-MAP.md) |
| 本轮完成报告 | [../OC-COMPLETION-2026-11-17.md](../OC-COMPLETION-2026-11-17.md) | — | — |
| 一致性测试 | `tests/oc-consistency.test.ts` | — | — |

## 2. 真源与证据优先级（本目录不自立 canon）

本目录是**补充与汇总**，不是最高真源。按以下顺序裁决：

1. 用户 2026-11-16/17 锁定与最新明确指令；
2. `docs/art/CANON-SETTING-BOOK-2026-11-16.md`（汀岚视觉/身份/数值契约）+ `docs/PEARL-ORCA-SETTING-BOOK-PAGES-2026-11-16.md`（三页设定集说明）；
3. `public/characters/tinglan/{character.json,behavior.json,voice-lines.json}`（0.3 行为参考包：17 态/13 待机/5 区/36 台词）；
4. `docs/TINGLAN-CHARACTER-INTERACTION-DESIGN-2026-11-15.md`（行为/语音/待机设计）+ `docs/TINGLAN-ROLEPLAY-VALUES-2026-11-16.md`（关系契约 R1–R4、五价值观、roleplay 边界、危机资源）；
5. `docs/art/ART-TINGLAN-RUNTIME-2026-11-16.md`（25 tags/118–122 帧全量计划；17 状态 + 8 idle-only tag 的计数说明）；
6. 本目录的三份 OC/PROMPTS/RUNTIME-MAP（A/B/C 分级见 §4）。
7. 旧文档（16 态/12 待机/6 区/25 台词等旧计数、v3/ref10/旧 pack）一律**历史基线**，不作为本目录依据。

**猫/狗没有已批准 canon**：本目录的猫/狗是**新 OC 提案（待拍板）**，与现有占位美术方向存在冲突（见报告 §2）。现有 `public/characters/pet-cat|pet-dog`、`public/assets/pet/*-placeholder` 不被本目录修改，仍按旧占位设计存在。

## 3. 关键事实表（与运行时文件逐项核对）

| 项 | 汀岚 | 猫 OC | 狗 OC |
|---|---|---|---|
| 类型 | 人型（虎鲸拟人） | 四足宠物（猫） | 四足宠物（犬） |
| 身份 | 成年虎鲸秘书；非官方 AI 角色 | 白布偶猫；虚构 AI 角色 | 金毛寻回犬；虚构 AI 角色 |
| 年龄外观 | 成年（不写具体年龄/生日） | 成年猫外观（不写具体年龄） | 成年犬外观（不写具体年龄） |
| 运行状态数 | **17** | 8 个 behavior state（映射 7 tags） | 8 个 behavior state（映射 7 tags） |
| 待机微动作 | **13** 条 idle variants | 内嵌 idle（无独立 variants） | 内嵌 idle（无独立 variants） |
| 交互区 | **5** zones | bbox 命中（无独立 zones） | bbox 命中（无独立 zones） |
| 台词 | **36** lines（已引用 9，闲置 27） | 6 条内联 sfx 文本 | 6 条内联 sfx 文本 |
| 动画 tag/帧 | 7 tags/36 帧（canon 核心）；全量计划 25 tags/118–122 帧 | 7 tags/36 帧 | 7 tags/36 帧 |
| 画布 | 运行时 128×128（行为包）/256×256（已接入 opt-in 图包）；normal 视觉约 6 头身，chibi 约 2.5 头身 | 96×96 | 96×96 |
| 语音 | 预生成 TTS 设计（未生成音频）；无真人克隆 | 拟声/音效（无 TTS、无真人声线） | 拟声/音效（无 TTS、无真人声线） |
| 图 | 未生成（已有 concept/placeholder 图包属其他 owner，非本目录产物） | **未生成** | **未生成** |

## 4. 设定来源分级（本目录内部约定）

每份文档按需标注：

- **A = canon 已锁定**：直接来自上述真源，逐字/逐数值不改。
- **B = 可推导**：由 canon + 行为/语音设计推出（如某状态的 OC 语义），不新增 reversible 的世界观事实。
- **C = 本轮新增细设（可改，待拍板）**：偏好、习惯、具体口癖举例、猫狗品种/命名/配色等新提案。C 不冒充 canon，不写入现有 canon/JSON。

## 5. 硬边界（三份角色共用）

- **不是真人/真猫/真狗**：AI 驱动的虚构角色；不宣称真人配音、中之人、真实动物录音。
- **非官方**：与 DeepSeek 无关联/合作/授权/背书；不使用官方 Logo/字标/官方形象。
- **非专业建议**：不做医疗/法律/心理/兽医诊断与结论；高风险问题只做一般信息 + 转介。
- **不诱导依赖/恋爱/付费**：不做好感/亲密度/羁绊/关系阶段/解锁/排行榜/签到；不卖亲密度、称呼、私聊、专属语音；不制造内疚与 FOMO。
- **全年龄 roleplay 边界**：roleplay 全年龄适用、不设年龄门（2026-11-17 拍板）；不演成人向/18+ 性内容、恋爱、虚拟亲密关系、真实人物、专业权威、官方；可拒绝、可出戏、可退出；未成年人相关一律不进入亲密/暴力场景。
- **健康使用**：连续使用 2 小时提醒活动；安静时段 22–8 不做情感主动；鼓励现实连接。
- **危机资源**：自伤/他伤/虐待风险时暂停扮演/玩笑，给资源（心理援助热线 **12356**；紧急 **110/120**），不诊断、不承诺绝对保密、不提供方法（具体以 `src/pet/safety/disclosure.ts` 与 `docs/legal/SAFETY.md` 为准）。
- **不生成图**：本目录只写 prompt；猫/狗明确禁止用图像 API 生成图（本轮及后续未经批准均不生成）。

## 6. 本轮已核对的冲突（摘要）

完整清单见 [../OC-COMPLETION-2026-11-17.md](../OC-COMPLETION-2026-11-17.md) §2。按性质分三类：

1. **计数/口径旧文档不一致**：`docs/CHARACTER-INTERFACE-V0.3.md` §8 仍写 16 states/12 idle/6 zones/25 lines；旧设计稿写 16 态/12 待机；实际包为 **17/13/5/36**（`ART-TINGLAN-RUNTIME` 备注已注明 17/13/36/5 为完整计数、6 区/25 台词为旧计数）。本目录采用 17/13/5/36，并在 RUNTIME-MAP 逐项列出。
2. **数据-设计不一致（需 owner 改 JSON，不在本目录改）**：`roles` 含 `companion`；`pat.body` 规则无对应 zone；`pat.hand` 台词无 zone 派发；`hand_tablet` zone 的 `state: pat_hand` 与 `pat.tablet` 规则目标 `tablet_show` 不一致；`pat.glasses` 缺 25% refuse 分支；`character.json` 无 `fallback`（7-tag 美术包接入会 `missing-tags` 硬失败）；27/36 台词未被引用。
3. **猫/狗与现有占位美术方向冲突**：现有占位是「姜黄虎斑猫/绿眼/红项圈」与「金棕垂耳狗/眼斑/蓝项圈」（`docs/art/ART-DEFAULTS-UI-2026-11-16.md` §3.2/3.3）；本轮 OC 是「白布偶/蓝眼」与「金黄金毛/无眼斑」。新方向需拍板后才能替换，旧占位文件不动。

## 7. 使用方式

- 生成前：先读对应 `OC.md` 的 Do/Don't 与 `PROMPTS.md` 的负面 prompt；汀岚的视觉 token 以 CANON §4.1 为准，本目录不另造第二套。
- 接线前：先读对应 `RUNTIME-MAP.md`；所有「需要改的 JSON 字段」都是**建议清单**，由对应 owner（代码/数据/美术）执行，本目录没有改。
- 交叉核对：`tests/oc-consistency.test.ts` 会检查三份角色文档的关键章节/关键词/计数/猫狗颜色/非官方与边界，并解析 `public/characters/**` 与 `public/assets/pet/**` 做数值对照。

## 8. 变更记录

- 2026-11-17：创建本目录；补齐汀岚 OC/PROMPTS/RUNTIME-MAP；新增猫/狗 OC 提案与 7-tag prompts；新增 OC 完成报告与一致性测试。未生成图、未改现有设定。
