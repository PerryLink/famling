# AI 生成合成内容标识方案（对外披露 + 工程落地）— DRAFT

> **Status: DRAFT（engineering draft）· 2026-11-17（2026-11-19 现状同步）· 不是法律意见 · 标识机制尚未闭环。**
> 本文回答：本项目哪些内容属于“AI 生成/合成”、当前实际标识到什么程度、发布前必须补什么、商店/平台怎么申报、哪些还 TBD。**不得**把本文当成“标识已实现/已合规”；当前代码库**没有**隐式标识（C2PA/XMP/tEXt）写入管线，**没有**音频起始提示，**没有**导出标识（03 P0-5、01 P0-3、04 P0-5、05 P1-2 复核一致）。
> 依据（官方原文为准，2026-11-17 复核）：《人工智能生成合成内容标识办法》（2025-09-01 施行）<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm> · GB 45438-2025 标准页 <https://std.samr.gov.cn/gb/search/gbDetailed?id=301E0388CB75788DE06397BE0A0AE1B4> · 《互联网信息服务深度合成管理规定》第 16/17/18 条 <https://www.cac.gov.cn/2022-12/11/c_1672221949354811.htm> · 《人工智能拟人化互动服务管理暂行办法》第 18 条 <https://www.gov.cn/gongbao/2026/issue_12806/202606/content_7072472.html> · EU AI Act 第 50 条 <https://artificialintelligenceact.eu/article/50/>。
> 关联：[AI-CONTENT-POLICY](/legal/AI-CONTENT-POLICY.md) · [APP-DISCLOSURE-TEXTS](/legal/APP-DISCLOSURE-TEXTS.md) · [PRIVACY](/legal/PRIVACY.md) · [TTS-TERMS](/legal/TTS-TERMS.md) · [RELEASE-BLOCKERS](/legal/RELEASE-BLOCKERS.md) · 根 [AI-PROVENANCE.md](/legal/AI-PROVENANCE.md)。

## 0. 现状速览（[现状] 实测，不得夸大）

| 要求 | 当前实际 | 判定 |
|---|---|---|
| 显式标识（用户可感知） | 2026-11-18 用户决定移除界面常驻「AI 合成 · 非真人」角标；现仅在首启 TOS、age-gated 入口年龄核验、About/「声明」面板、TTS 独立声明等**流程内**提示（不常驻、不遮挡）；**无**音频播放器常驻标签/首播提示 | **部分**，当前无“显著”常驻标识；发布前须律师复核，并补图片/音频/导出标识 |
| 图片角落“AI 生成” | 发布图/资产**无**逐图角标；`contact_sheet.py` 的校对表叠字**不是发布管线** | 未落 |
| 隐式标识（元数据） | **部分**：汀岚 256 的 49 张 PNG 已由 `scripts/embed-ai-labels.mjs` 写入 PNG `tEXt`（AI-Generated/Status/Model/Date/Content-ID/Final/Official/Disclosure，`tests/ai-label.test.ts` 校验）；**无** XMP/IPTC/C2PA；发布图/UI 未走统一标识管线 | **部分**（仅 49 PNG tEXt）；C2PA/XMP 未落 |
| 音频层 AI 标识 | 无播放器常驻“AI 语音·合成”、无起始口头/提示音；`disclosure.ts` 的 `getTtsLabel/getAiGeneratedLabel` **无调用方** | 未落 |
| 导出/分享标识 | 无导出管线；`tts.exportLabel` 未实现 | 未落 |
| TOS 写明“标识方法/样式” | TOS `2026-11-20.1` 已设“三之二、AI 生成合成内容标识”节（`terms.ts` ai-labeling：流程内提示位置、不提供去标识、导出保留说明）；但无具体视觉样式/隐式元数据字段规范（标识办法第 8 条仍建议律师评估） | **部分** |
| 商店/平台 AI 申报 | 未申报（未上架）；问卷口径未定 | 未落 |
| C2PA / XMP | **TBD**（方案未选；标准与工具链未引入） | TBD |
| 生成来源/时间台账 | `AI-PROVENANCE.md` 有模型/日期，但 prompt 原文/部分脚本/gate 证据在 gitignored 目录 | 部分 |

## 1. 本项目 AI 使用事实与“内容来源/时间”台账

| 内容 | 生成方式 | 时间 | 来源/记录 | 发布状态 |
|---|---|---|---|---|
| Orca OC / 汀岚 概念图 19 张 + 衍生 | `openai/gpt-image-2.6-sunburst` via OpenRouter Images API；人工筛选/裁剪/像素化 | 2026-11-14/15 | `AI-PROVENANCE.md`（含 sha256；prompt 原文部分缺失） | 内部；未清权前不得发布 |
| 汀岚 256 像素帧 49 张 | 脚本/像素化加工 + AI 概念派生（`placeholder:true/final:false`） | 2026-11-17 | `public/assets/pet/tinglan-256/manifest.json`；逐文件 sha/ai 字段缺失 | **concept，非 final**；不默认加载 |
| Pearl 草稿/占位 37 文件 | AI 草稿 + 占位渲染（上游链另有限制） | 2026-11-14 起 | `NOTICE:116-139`；上游署名链未清 | **不得发布**（含未授权 ref10 仅供内部） |
| TTS 预生成语音 **42 WAV**（21 `stella` + 21 `tide`） | DeepSeek TTS，音色 `stella`/`tide` | stella 2026-11-14（补录至 21 句）、tide 2026-11-17（21 句） | manifest v2（`public/assets/voice/pet/manifest.json`）、`AI-PROVENANCE.md` §10、`THIRD-PARTY.md` §2；用户 2026-11-17 授权 baked 随包，**服务商书面再分发条款仍 TBD** | 用户授权随包 ≠ 服务商许可；未获书面结论前不得扩大/单独售卖；旧 `artifacts/` 须清理（见 RELEASE-BLOCKERS） |
| 占位像素图/UI 91 | 确定性脚本（`placehold.py`），**非模型生成** | 多日 | `ui/manifest.json`（ai:none） | 无 AI 标识义务，但仍为 placeholder |
| 实时对话/图片/视频生成 | **famling 桌面端无自由 LLM chat、无图像/视频生成入口、无声音克隆**；`dsh-famling` 插件有普通 AI 文本聊天（经 DSH Host，发往用户配置的模型供应商，见插件 LEGAL），但同样无图像/视频生成/声音克隆 | — | — | 插件侧 AI 标识/披露由插件 LEGAL 处理；任何实时生成上线前必须新方案 |

- 记录规则：每个发布物保存 `tool/model + version + date + prompt/seed(如可) + output sha256 + 披露文本`；无 API key；如需对外，附 provenance 摘要。
- 不得把 AI 概念标为 `final`（D-01 A）；不得把 AI 生成/合成内容说成真人手绘/真人录音/实拍。

## 2. 标识类型与最小要求（[目标] 发布前必须）

| 内容类型 | 显式标识（可感知） | 隐式标识（机器可读） | 导出/分享 | 起始提示 |
|---|---|---|---|---|
| 文字（未来 AI 对话/生成文本） | 界面常驻“AI 生成内容”；生成结果旁标注 | 元数据/内容编号 [TBD] | 导出文件带标识 | 首次交互告知 |
| 图片/立绘/宣发图/商店截图 | 角落“AI 生成”角标，不易裁剪；商店页文字标注 | PNG `tEXt`/XMP/IPTC 或 C2PA [TBD] | 导出图同样带角标+元数据 | — |
| 音频（TTS/语音） | 播放器常驻“AI 语音·合成”（≥12px/对比 ≥4.5:1）；About/TTS 声明 | WAV/MP3 元数据或 sidecar [TBD] | 导出音频 + 同名 txt 标签 | **首次播放口头“以下为 AI 合成语音”或提示音** [工程待办] |
| 视频/虚拟场景 | 画面角标 + 简介标注 | 元数据 [TBD] | 导出标识 | 起始提示 |
| 角色包/DLC 内 AI 内容 | 加载确认显示 `ai.status`；包内 LICENSE/NOTICE | manifest `ai{tool,date}` | 包内声明 | 每次加载确认 |
| 交互界面（拟人化） | 首启合并告知 + About/「声明」面板 + TTS/ASR 独立声明 + 播放器标签；**不做常驻浮层角标**（用户 2026-11-18 决定） | — | — | 首启告知 + 可查入口 |

- 显式标识要求“**显著**”：2026-11-18 用户决定移除界面常驻角标（原 8px/2.17:1 角标亦不达标）；若恢复常驻标识须 ≥12px、对比 ≥4.5:1、可键盘/悬停到达（06 P1-2）。当前仅流程内提示，显著性待律师复核。
- 不得提供“去标识/隐藏 AI 语音/伪造元数据”的能力（标识办法第 4/10 条、深度合成第 18 条）；发现被删须恢复。
- 申请无显式标识的例外：按标识办法第 9 条须协议约定并留存日志 ≥6 个月；本项目**当前不提供**该功能，亦不提供去标识（对外可直接声明“不提供”）。

## 3. TTS 合成语音标识细则

1. **界面**：播放时显示“AI 语音·合成”（与 `ai.label.audio` 一致），不是 8px 角标；About/TTS 弹窗重复声明“不是真人录音”。
2. **首播**：第一次播放前口头提示或提示音；此后每次播放仍保留界面标签（不得因“听过一次”而隐藏）。
3. **导出**：`tts.exportLabel` + 元数据（工具/模型/音色/日期/内容编号）+ 不提供去标识。
4. **缓存**：本机 TTS 缓存 WAV 无元数据（`voice.rs:176-180`），若用户可发现/分享，须加 AIGC 元数据或明确说明；发布前关闭未清权预生成 WAV。
5. **禁止**：冒充真人/官方/客服；克隆真人声纹；伪造录音证据；诈骗/骚扰。
6. [工程待办] 播放器标签、起始提示、导出元数据、TOS 标识方法节；见 `review-2026-11-17/00-PATCH-PLAN.md`。

## 4. 图片/美术/宣发/商店页标识

- 发布图逐图：角落“AI 生成”+ 元数据（工具/模型/日期/内容编号）；商店截图/宣传图/视频封面同样适用；营销文案不得宣称“真人手绘/实拍”。
- 不得发布：Pearl/溟月链未清权素材、ref10 派生图、无逐文件 CC0 证据的素材（见 [RELEASE-BLOCKERS](/legal/RELEASE-BLOCKERS.md) §9）。
- 隐式标识方案候选（**均 TBD，未实现**）：① PNG `tEXt`/XMP 最小字段；② IPTC/C2PA manifest；③ 内容编号+仓库侧 registry 对照。选择须由工程+律师确认，不得先宣称“已加 C2PA”。
- 发布图 gate：`mark-ai` 脚本（待建）+ 检查“每张发布图有角标+元数据+台账行”；当前 `legal-check` 不检查图片（R-P0-22）。

## 5. 商店/平台申报（[TBD] 未上架）

- **Steam 内容调查**：预生成（图/语音/占位）与实时生成分列如实填报；实时项须说明安全护栏。链接：<https://partner.steamgames.com/doc/gettingstarted/contentsurvey?l=schinese>。
- **Apple App Review 5.1.2(i) / Google Play AI 政策**（若上移动端）：向第三方 AI 共享个人数据前披露+同意；生成内容政策。
- **中国应用商店/网信**：AI 相关申报、拟人化服务核验（触发时）；不得隐瞒预生成 AI 素材。
- **EU AI Act 第 50 条**（2026-08-02 适用）：与 AI 交互告知、合成内容/深伪披露；若在 EU 发行须单独核对。
- 申报口径未定前**不得上架/收费**；商店页 AI 标签须与包内标识一致。

## 6. 生成内容来源/时间与可追溯（发布要求）

- 每个发布物：`tool/model + version + date + prompt(如可) + sha256 + 披露位置`；缺失项如实标“不可恢复”（03 P1-9）。
- 归档：prompt 原文/像素化脚本/gate 证据从 gitignored 目录纳入可分发证据或写明“仓外不可核”。
- 台账：`AI-PROVENANCE.md` 为唯一 AI 台账；与 `ASSET-LICENSES.md`、manifest `ai` 字段双向对账。

## 7. 禁止与红线（与内容政策一致）

- 去标识/隐藏/伪造 AI 标识；把 AI 内容说成真人作品/真实录音；冒充真人/官方/客服；克隆真人声音；生成未成年人性化内容；用 AI 伪造证据/新闻/官方公告；生成/传播违法内容。

## 8. 工程待办与验收（发布前必须关闭）

- [x] TOS 已增“三之二、AI 生成合成内容标识”节（`TOS_VERSION=2026-11-20.1`，禁止去标识/删除/伪造、导出保留说明、流程内提示位置）；[ ] 视觉样式/隐式元数据字段规范仍待补，且“显著”是否满足待律师复核。
- [ ] 显式标识：**用户已决定不做常驻角标**（2026-11-18）；改为首启/About/TTS 流程提示后，需律师评估是否满足“显著”要求，并补图片角落与音频播放器标签。
- [ ] 音频首播提示（语音或 earcon）与导出标签/元数据。
- [ ] 隐式标识管线：图片 `tEXt`/XMP（或 C2PA）写入 + 校验；方案与字段 TBD 后实施。
- [ ] 发布图/音频 gate 脚本（每件有标识/台账行）；`legal-check` 扩展覆盖。
- [ ] 商店 AI 问卷口径（预生成/实时）与发布说明模板。
- [ ] 旧 `dist`/`artifacts` 中未标识/未清权素材清理（见 RELEASE-BLOCKERS §5）。

## 9. TBD / 待律师

- 标识办法/深度合成对“本地工具、预生成素材分发、非服务提供者”的适用性；预生成 vs 实时填报边界；元数据字段与 C2PA 是否必要；EU AI Act 适用；商店核验是否要求备案/评估编号；与 `LICENSE-ART`/署名（TASL）的联动。

## 10. 证据与限制

- 证据：`docs/legal/review-2026-11-17/{01,03,04,05,06}`；`AI-PROVENANCE.md:79,104-131,221-223`；`pet.html`（2026-11-18 起无常驻角标；见变更记录）；`scripts/legal-check.mjs`（不检查图片/音频标识）。
- 本文为 DRAFT，**不是法律意见，不构成“已标识/已合规”**；所有“已落”只描述现状，所有方案项均未实现。


## 2026-11-17 状态更新

- 汀岚 256 的 49 张 PNG 已嵌入 PNG `tEXt` 隐式元数据（AI-Generated/Status/Model/Date/Content-ID/Final/Official/Disclosure），像素哈希未变；脚本 `scripts/embed-ai-labels.mjs`，测试 `tests/ai-label.test.ts`。
- 仍未做：C2PA/Content Credentials、音频首播提示、导出文件元数据；UI 91 为本地确定性绘制、`ai:none`，不嵌 AI 标签。


## 2026-11-18 用户拍板：移除界面常驻 AI 角标

- 用户明确要求：AI 披露应在多个位置提醒（首启 TOS、age-gated 入口年龄核验、About/「声明」面板、TTS 独立声明与播放器标签等），但**不要在页面上常驻显示**「AI 合成 · 非真人」浮层/角标（遮挡桌宠与桌面操作）。
- 已执行：`pet.html` 移除 `#ai-disclosure-badge` 与其 CSS；About 面板文案与 TOS `三之二` 同步改为“流程内提示、不常驻角标”；TOS 升版（当前 `2026-11-20.1`，2026-11-20.1 为 D6 顺序调整；标识节文本未变）。
- **合规风险（如实记录）**：《标识办法》/GB 45438 对显式标识“显著”的要求可能无法仅靠流程内提示满足；本项为用户产品决定，发布前须律师复核；图片角落/音频标签/隐式元数据仍为未落项。

## 2026-11-19 现状同步（代码为准，不改用户 2026-11-18 决定）

- **隐式标识并非“全仓为零”**：汀岚 256 的 49 张 PNG 已有 PNG `tEXt`（`scripts/embed-ai-labels.mjs`、`tests/ai-label.test.ts`）；仍无 XMP/IPTC/C2PA，发布图/UI 管线未覆盖。
- **TOS 已有标识节**：“三之二、AI 生成合成内容标识”（`TOS_VERSION=2026-11-20.1`）写明流程内提示位置、不提供去标识/删除/伪造、导出保留说明；缺视觉样式/隐式字段规范。
- **baked 语音事实**：42 个 WAV（21 `stella` + 21 `tide`），用户 2026-11-17 授权随包；DeepSeek 书面再分发许可仍 TBD。
- **两端边界**：famling 桌面端无自由 LLM chat；`dsh-famling` 插件有普通 AI 文本聊天（经 DSH Host，发往模型供应商），插件侧标识由其 LEGAL 处理，本文件不复制。
- **仍未落**：图片角落角标、音频播放器标签/首播提示、导出标识、XMP/IPTC/C2PA、发布图/音频 gate；`legal-check` 不检查图片/音频标识。
- **证据**：`pet.html`（2026-11-18 起无常驻角标）；`terms.ts` ai-labeling 节；`src/pet/consent/terms.ts`；`scripts/embed-ai-labels.mjs`；`tests/ai-label.test.ts`；`public/assets/voice/pet/manifest.json`。

> 2026-11-19 仅同步“现状/已落项”，**未**新增任何“已合规/已闭环”结论；显著性、标识方法/样式与商店申报口径仍待律师/owner。
