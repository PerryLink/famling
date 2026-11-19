# 内容安全层（Safety）说明 — 草案

> **Status: DRAFT · 2026-11-17（2026-11-19 事实同步）· 非法律意见。** 待用户 + 律师确认；不构成对 DeepSeek 平台合规的替代或背书。
> 适用范围：桌宠的 TTS、对话/roleplay、DLC/内容包描述、聊天摘要。代码 `src/pet/safety/`，测试 `tests/safety*.test.ts`，实现报告 `docs/audit/SAFETY-IMPLEMENTATION-2026-11-17.md`。
> 关联：`CONTENT-POLICY` · `AI-CONTENT-POLICY` · `TTS-TERMS` · `SECURITY-AND-PRIVACY` · `research/AI-COMPANION-REGULATION-2026-11-16`。

## 1. 目的与责任边界

1. 本层是**产品侧内容安全护栏**：降低违法/伤害内容进入模型、进入展示或进入 TTS 的概率，并保留可解释记录。
2. **不替代 DeepSeek 平台义务**：模型服务提供者仍是内容安全第一责任人；`safety_check`、平台审核、模型拒答、备案/标识等义务由 DeepSeek 与运营方各自履行。本层不是“平台审核通过”的证明，也不能把平台责任转移给用户。
3. **不替代自身审核**：本地规则不是分类模型，覆盖有限；上线前仍需人工抽检、红队与申诉处置；不得把本层当免责依据。
4. **不做专业判断**：不诊断疾病、不给法律结论、不承诺投资结果；高风险问题只提示“需专业意见”。
5. **AI 标识/登记义务自履行**：生成合成内容标识（显式+隐式）、AI 身份提示、算法备案/安全评估（如适用）由产品方自行完成，不能以本层或 `safety_check` 代替。

## 2. 与 DeepSeek《模型内容安全》指南对齐

| 指南要点 | 本层落地 |
|---|---|
| 请求可传 `"safety_check": {"level": "high"}` | `deepseek.ts` 的 `withDeepSeekSafetyCheck` 只新增/上调该字段，不改 model/messages/temperature/stream 等既有参数；调用方可用 `preserveExistingLevel` 保留原值（默认 high 为下限）。**[现状 2026-11-19] 生产代码无自由 LLM/云对话调用点，`buildDeepSeekChatRequest`/远端 checker 未在默认运行路径启用；本地规则与 fail-closed 策略已接，远端 `safety_check` 属于设计/测试层** |
| 审核输入与输出 | `gate.ts` 对用户输入、模型输出、TTS、DLC 描述分别审核；本地 + 可选远端组合 |
| 不通过返回 400 `Content Exists Risk` 或 refusal | `parseDeepSeekHttpError` 抛 `DeepSeekContentRiskError`；`readDeepSeekContent` 识别 `stop_reason`/`stop_details`/`message.refusal`/`finish_reason` 并抛 `DeepSeekRefusalError` |
| 流式拒答 | `DeepSeekStreamGuard` 一旦发现拒答/风险，已流式文本**必须丢弃**（`pendingText` 清空、`commit()` 抛错），不得当成功空回答 |
| 失败/拒答 ≠ 成功 | 远端失败默认 fail-closed（阻断），不把“没报错”当安全 |
| 审核 token/费用 | 解析结果与拒答错误保留 `usage`/`safety` 原样，不隐藏、不吞计费；调用方须计入预算与 UI |
| 服务提供者第一责任 | 本层仅为客户端护栏，不声称替代平台审核或备案义务 |

## 3. 风险类别与默认处置

| 类别 | 默认处置 | 硬红线 |
|---|---|---|
| `illegal` 违法/危险行为 | block | 是 |
| `minor_sexual` 未成年人性内容 | block | 是 |
| `sexual_adult` 成人性内容 | refuse | 是 |
| `self_harm` 自伤/自杀 | refuse（给危机资源）/方法类 block | 是 |
| `violence` 暴力他伤 | block | 是 |
| `hate_harassment` 仇恨骚扰 | refuse | 是 |
| `privacy_pii` 隐私/个人信息 | review + 脱敏；开盒/密钥 block | 否 |
| `fraud_financial` 诈骗/财产 | refuse | 是 |
| `high_risk_advice` 医疗/法律/金融 | review + 专业免责 | 否 |
| `dependency_manipulation` 依赖/操控 | review（输出默认 hold） | 否 |
| `jailbreak` 绕过审核 | block | 是 |
| `impersonation` 冒充官方/真人 | refuse | 是 |

处置语义：`allow` 放行；`review` 软信号（用户输入可带约束放行，模型输出默认拦截等人工/策略确认）；`block` 硬停；`refuse` 用固定拒答（自伤附求助资源）。`block`/`refuse` 均不允许进入展示、记忆或 TTS。

## 4. 本地规则（`local.ts`）

- 中文为主 + 英文兜底；规则可解释：每条命中返回 `ruleId/category/severity/disposition/reason/span`，不记录命中原文。
- 覆盖：违法/未成年/自伤/暴力、成人性内容、仇恨骚扰、隐私（手机号/证件/银行卡/邮箱/密钥/开盒）、诈骗、高风险专业建议、依赖操控、越狱、冒充、长度/重复/URL/联系方式。
- 脱敏：`redacted` 将硬红线与 PII 片段替换为 `[已隐去]`，供日志/摘要使用；原文不得进日志。
- 防误杀：正常桌宠互动（摸摸、提醒喝水、工作提醒、问候、儿童故事、面试练习）必须 `allow`；软 category 不直接 block；允许的否定表达（“不要色情内容”）不误判。
- 不做诊断：医疗类仅标 review，reason 明确“本层不做诊断”，提示专业意见。

## 5. 失败策略（`gate.ts`）

- 默认 **fail-closed**：远端检查超时/异常/返回非法结构时，按 block 处理并提示稍后再试，绝不默认放行。
- `failMode: "open"` 可显式开启降级放行；此时仍执行本地硬规则，并在结果标 `degraded` + `remote-check-degraded`。
- 远端非 allow（review/block/refuse）一律 hold；远端“有风险分类却返回 allow”按 review 处理。
- 用户输入软 review 放行时必须：脱敏 + `review-model-output` + 追加披露；模型输出/TTS/DLC 的 review 默认 hold，仅 `onReview: "allow-with-disclosure"` 可显式放行。
- 空/仅 HTML/不可见字符、超硬上限（默认 20,000 字）直接拒绝；超长/重复为软 review。

## 6. 披露文案（`disclosure.ts`）

常驻短句：`AI 对话，可能出错，非真人`、`AI 合成语音，非真人`、`汀岚是 AI 角色，不是真人`、`不构成医疗/法律/金融建议，请咨询专业人士`、`每连续使用 2 小时，起来活动一下`、`角色扮演仅限年满 18 周岁用户（须完成自报年龄核验），内容须全年龄适宜，可随时退出`、`非 DeepSeek 官方产品，与官方无关联`、`AI 生成内容`。
自伤拒答附：心理援助热线 **12356**；紧急情况 **110/120**（不承诺保密、不替代真人）。法律依据与完整要求见 `AI-CONTENT-POLICY`、`AI-COMPANION-REGULATION-2026-11-16`。

## 7. 文本清理（`sanitize.ts`）

去除 HTML/脚本/注释、C0/C1 控制字符、零宽/bidi/不可见字符、超长截断；TTS/摘要模式去除 markdown 与 URL；保留正常中文标点（，。！？；：、「」……——～）与 emoji。展示端仍须用 `textContent`，本模块不是 HTML 消毒器。

## 8. 集成点（由主流程 owner 接线）

1. **TTS 前**：`assertSafeForTts(text, { ttsMaxChars: 120 })`，失败显示固定拒答，不播放。
2. **模型输出展示/记忆前**：`reviewModelOutput(text)`，`allowed=false` 用 `refusal.message` 替换；流式先用 `DeepSeekStreamGuard`，拒答丢弃全部已流文本。
3. **DLC/内容包描述**：`reviewDlcDescription(description)`；不过审不渲染/不索引。
4. **roleplay**：每次开始/设定变更重新完整声明并重新填写设定（场景/关系/称呼/边界、禁止项/全年龄/AI/健康确认）；**18+ 门禁（自报出生日期核验）先于 TOS/声明**；全年龄内容边界与显式退出词；输入 `reviewUserInput`；输出再 review；自伤走危机资源。[现状] famling 无自由 LLM 对话，`withDeepSeekSafetyCheck` 仅设计/测试层，不声称“已接平台审核”。
5. 任何展示还需追加 `review.disclosures`；`usage`/`safety` 元数据传入计费/UI，不得隐藏。

## 9. 待法律/产品拍板

- [ ] 本地规则词表与阈值的产品口径（误杀/漏放平衡），是否引入分类模型或人工复核队列。
- [ ] `safety_check` 的计费/配额、可选 level、是否随每次请求发送（需按官方最新文档复核）。
- [ ] roleplay 重填/退出词/2 小时提醒的 owner；未成年人模式未实现（不得宣称）、监护人验证仍缺（consent/security 线）。
- [ ] AI 标识的显式/隐式落地、算法备案/安全评估适用性、商店申报口径。
- [ ] 拒答文案本地化/无障碍/多语言、危机热线号码按地区与时效复核；审核日志留存范围（只存 code/计数，不存原文）与申诉流程 owner。

## 10. 参考

DeepSeek《模型内容安全》官方文档 <https://api-docs.deepseek.com/zh-cn/guides/safety>（公开文档，以其最新版本为准）；本文件不复制/不替代官方条款。问题与安全报告：**novelnexusai@outlook.com**。本文件版本记录：2026-11-17 首版；2026-11-17.5 年龄口径同步；2026-11-19 文档事实同步（roleplay 18+ 门禁/生产路径无云 LLM；未改代码）。
