# DECLARATIONS — 声明总入口

Status: **DRAFT · 2026-11-17（2026-11-19 事实同步）· 非法律意见。** 许可方向由用户（PerryLink）2026-11-16 决定；**律师审查暂缓**；本文与各处声明在律师定稿前不得称“已审核/已合规/已发布”。**2026-11-17.5 用户拍板年龄口径为“一般功能全年龄 + 角色扮演/情感陪伴仅限 18+”；2026-11-20.1 D6：首启不采集年龄，年龄自报只在进入 18+ roleplay 入口或 About 主动核验/更正时采集**（非官方身份证核验；未成年人可用一般功能但不能启动 roleplay；内容仍须全年龄适宜，健康/危机/未成年人保护保留；旧“全年龄、不设年龄门”口径作废）。**2026-11-17.4 用户口径：自由 LLM roleplay/情感陪伴是使用者参照工作助手（秘书）用法自行创造/延伸的用法，不是官方功能；官方不提供、不鼓励并明确反对，只尽合理提醒与安全设计义务，用户自行接入第三方模型/客户端或修改后版本须自担责任与法律后果，官方不承诺完全阻止、不背书、不得冒充官方。** 本文件把许可、法律基线、内容红线、AI、TTS、roleplay、健康使用、DLC/二创、商标、安全与举报集中索引；冲突时按 [docs/legal/README.md](/legal/README.md) 的优先级处理。**2026-11-20 事实真值同步**：当前 TOS `2026-11-20.1`（TTS `2026-11-17.4`/ASR `2026-11-17.3`/ROLEPLAY `2026-11-17.4`）；**D6 已实现**：首启 = 关键事实层 + 完整 TOS → 应用（不采集出生日期），年龄自报只在 age-gated 入口/About 主动核验时采集；TTS/ASR 独立声明+单独同意、撤回同意、删除全部本地数据已实现（残留如实披露）；随包 baked WAV=42（21 stella + 21 tide，用户 2026-11-17 授权；服务商再分发仍 TBD）；远程内容市场默认不联网；famling 无自由 LLM 对话、`dsh-famling` 插件有普通 LLM 文本聊天（两端口径不得混写）；首启顺序现状=**关键事实层 + 完整 TOS → 应用**（D6 已实现；不采集年龄）。未决问题见 [docs/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md](/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md)（非法律意见）。

> ⚠️ **统一使用限制（必读，2026-11-19）**：本项目及其全部代码、美术、音频、文案、角色素材和衍生物仅用于技术研究与原型验证，不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途。
> 完整说明（单一 canonical 文本）：[docs/legal/USE-RESTRICTIONS-2026-11-19.md](/legal/USE-RESTRICTIONS-2026-11-19.md)。该文件是 **famling 与 dsh-famling 共用**的唯一规范表述；本入口、README 首屏、TOS/LEGAL、`public/legal/` 与插件 README/LEGAL 的短句必须与其逐字一致，不得漂移。

## 0. 公开仓与身份

- 桌宠公开仓：<https://github.com/PerryLink/tinglan>（角色/素材/接口子集；完整游戏基座保持私有）。**仓库为 private 还是 public、是否可运行，以发布记录为准，本文件不声称已发布/可下载。**
- Advisers 独立仓：<https://github.com/PerryLink/advisers>（独立核心，不随桌宠发布）。
- 产品名未定；“汀岚”为角色暂定名（未做官方商标检索）；“Orca”不得作产品名/商标/域名/包名。

## 1. 法律基线（禁止违反，摘要）

**完整清单与禁止行为矩阵见 [docs/legal/LEGAL-BASELINE.md](/legal/LEGAL-BASELINE.md)（DRAFT）。** 本项目要求所有官方内容、DLC、二创、宣发、API 使用都不得违反：

| # | 法规 | 对本项目的核心约束 |
|---|---|---|
| L1 | 《民法典》 | 人格权/隐私/名誉/肖像；声音参照肖像权（1023）；网络侵权通知规则（1194–1197） |
| L2 | 《刑法》 | 淫秽、猥亵儿童、侵犯个人信息、诈骗、帮信、非法利用信息网络、侮辱诽谤等一律禁止并依法报告 |
| L3 | 《治安管理处罚法》 | 侮辱诽谤、偷窥偷拍窃听、散布隐私、传播淫秽信息、寻衅滋事等 |
| L4 | 《网络安全法》 | 网络运行安全、实名与日志、不得发布法律禁止的信息 |
| L5 | 《数据安全法》 | 数据分类分级、合法正当必要；不得非法获取/买卖/泄露数据 |
| L6 | 《个人信息保护法》 | 告知同意、最小必要、敏感信息单独同意、第三方提供/跨境、查阅复制与删除 |
| L7 | 《未成年人网络保护条例》 | 未成年人模式、防沉迷、内容分级、监护人权利、未成年人个人信息 |
| L8 | 《互联网信息服务深度合成管理规定》 | 合成人声/仿声显著标识（17）；人声/人脸编辑告知+单独同意（14）；安全评估（15） |
| L9 | 《人工智能生成合成内容标识办法》+ GB 45438-2025 | 显式+隐式标识；不得删除/伪造；导出内容同样带标识 |
| L10 | 《人工智能拟人化互动服务管理暂行办法》（2026-07-15 施行） | 第 8 条**七项**红线、10 条不得诱导依赖、13 条危机干预、14 条未成年人、18 条 AI 提示+依赖提醒+每 2 小时提醒、19 条便捷退出 |
| L11 | “清朗”系列专项行动要求 | 禁饭圈打榜/控评/应援/粉丝分层；禁煽动对立/网暴/流量造假；禁 AI 造谣与假冒 |

叠加适用：《生成式人工智能服务管理暂行办法》《网络信息内容生态治理规定》《网络数据安全管理条例》《算法推荐管理规定》《可能影响未成年人身心健康的网络信息分类办法》《互联网信息服务管理办法》《广告法》《反不正当竞争法》《著作权法》《商标法》等；境外发行另按当地法与平台规则。

**禁止行为（B1–B8，任何场景）**：违法；侵权；未成年色情/不当接触；自伤他伤；诈骗/虚假信息；侵犯隐私/个人信息；**冒充官方或暗示 DeepSeek 关联/背书**；**绕过安全审核/去 AI 标识/破限/删除同意门禁**。处置：拒绝生成/拒载/下架/封禁/依法报告。

## 2. 核心声明索引

| 场景 | 声明 | 位置 |
|---|---|---|
| 仓库代码 | PolyForm Noncommercial 1.0.0（source-available，**不是** OSI 开源）；商业使用需另签 | [LICENSE](/legal/LICENSE.txt) · [NOTICE](/legal/NOTICE) · [LICENSE-COMMERCIAL.md](/legal/LICENSE-COMMERCIAL.md) |
| 角色美术/设定（汀岚/Orca OC） | **CC BY-NC-SA 4.0**（用户 2026-11-16 决定；非商业+同协议+署名；律师审查暂缓；许可文本仍标 DRAFT，生效状态以 `LICENSE-ART` 为准） | [LICENSE-ART](/legal/LICENSE-ART) |
| TTS / 语音资产 | AI 合成语音；自带 key、费用自担、隐私披露、AI 标识、禁克隆/未授权音源、**启用/变更需再次确认**、未确认不随包 | [docs/legal/TTS-TERMS.md](/legal/TTS-TERMS.md) · [docs/legal/LEGAL-BASELINE.md](/legal/LEGAL-BASELINE.md) §4 |
| AI 生成/来源 | 必须显式+隐式标识；保留 provenance；不冒充真人/官方；不得去标识。**现状（2026-11-18）**：用户决定移除界面常驻 AI 角标；AI 披露在首启 TOS/年龄门、About/声明面板、TTS 独立声明中提示；图片/音频/导出标识仍未落；显著性待律师复核。 |
| roleplay / 情感支持 | **2026-11-17 已接声明/设定/退出入口，但仅本地模板回复，不提供自由 LLM 对话或情感陪伴**（不得当作已有功能宣传）。**年龄口径：一般功能全年龄可用；roleplay/情感陪伴仅限年满 18 周岁用户**（2026-11-17.5 用户拍板，首次启动自报出生日期核验；非官方身份证核验）；未成年人可用一般功能、不能启动 roleplay；内容必须全年龄适宜：禁止成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法/诈骗/冒充；非真人、非专业建议、不诱导依赖/恋爱/付费解锁；保留 2 小时提醒、危机转介、退出三通道 | [docs/legal/LEGAL-BASELINE.md](/legal/LEGAL-BASELINE.md) §3–4 · [docs/legal/CONSUMER-MINORS-HEALTH.md](/legal/CONSUMER-MINORS-HEALTH.md) · [docs/legal/AI-CONTENT-POLICY.md](/legal/AI-CONTENT-POLICY.md) |
| 用户自行接入第三方模型 / 自创用法（user-agency，2026-11-17.4） | **不是官方功能**：自由 LLM 角色扮演/情感陪伴是使用者参照秘书用法、按自身需求自行创造/延伸的用法；官方**不提供、不鼓励并明确反对**，提示法律风险与全年龄边界；官方**无法监控或强制阻止**自行接入/第三方客户端/修改后版本，**只尽合理提醒与安全设计义务、不承诺“完全阻止”**；用户自担行为、费用（含数据出境）与法律后果；自行接入不构成官方支持/授权/背书，不得冒充官方；保留提醒、拒绝支持、停止提供/删除相关内容并依法举报的权利；当前仍仅本地模板，无自由 LLM 对话。运营者已尽最大努力（本地安全规则与内容审核、TTS/ASR 单独声明、TOS 门禁、举报/危机入口、DeepSeek `safety_check` 请求设计），但技术无法绝对阻止，**不保证零违法/零伤害**；年龄自报核验已实现（2026-11-17.5；自报出生日期、非官方身份证核验，可被虚假自报/修改绕过） | [docs/legal/TOS.md](/legal/TOS.md) §六之二 · [docs/legal/LEGAL-BASELINE.md](/legal/LEGAL-BASELINE.md) §3A · [docs/legal/APP-DISCLOSURE-TEXTS.md](/legal/APP-DISCLOSURE-TEXTS.md) §2C |
| 健康使用 | 每连续 2 小时休息；夜间安静；依赖提醒；快捷退出/清除记忆 | [docs/legal/APP-DISCLOSURE-TEXTS.md](/legal/APP-DISCLOSURE-TEXTS.md) `health.*` |
| 应用内短文本 | 首启/About/2h/TTS/roleplay/Mod 加载/危机卡片 canon 文案 | [docs/legal/APP-DISCLOSURE-TEXTS.md](/legal/APP-DISCLOSURE-TEXTS.md) |
| 第三方素材 | 逐项登记；未确认不得发布；参考图 `art/_placeholder/refs/` 永不发布 | [THIRD-PARTY.md](/legal/THIRD-PARTY.md) · [CREDITS.md](/legal/CREDITS.md) |
| DLC / 角色包 / 插件 | 纯数据、无代码、签名/审核；**每次加载/修改须重新展示声明并确认**；作者负责内容/许可/来源；不得移除安全门禁 | [docs/legal/DLC-AND-PLUGIN-TERMS.md](/legal/DLC-TERMS.md) |
| 二创 / 同人 / 改模 | 允许范围、署名、商业化边界、商标保留；**代码/包/README 必须保留声明** | [docs/legal/FANWORK-POLICY.md](/legal/FANWORK-POLICY.md) · [docs/legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md](/legal/ASSET-REPLACEMENT-AND-MODDING-POLICY.md) |
| 角色名/商标/非官方 | 名称使用边界；禁止抢注/冒充；不得暗示 DeepSeek 关联 | [docs/legal/TRADEMARK-AND-NAMING-POLICY.md](/legal/TRADEMARK-AND-NAMING-POLICY.md) |
| 贡献者 | DCO/CLA、AI 辅助披露、无担保 | [docs/legal/CONTRIBUTOR-TERMS.md](/legal/CONTRIBUTOR-TERMS.md) |
| 侵权/违规举报 | 材料、下架、反通知、联系方式 | [TAKEDOWN.md](/legal/TAKEDOWN.md) · [docs/legal/TAKEDOWN-AND-REPORTING.md](/legal/TAKEDOWN.md) |
| 隐私/安全 | 本地数据、记忆/语音、遥测 opt-in、漏洞披露 | [SECURITY.md](/legal/SECURITY.md) · [docs/legal/SECURITY-AND-PRIVACY.md](/legal/SECURITY-AND-PRIVACY.md) |
| 完整矩阵 | 场景 × 声明 × 展示位置 × 是否需律师 | [docs/legal/DECLARATION-MATRIX.md](/legal/DECLARATION-MATRIX.md) |
| 二创开发接口 | 动作/声音/形象/行为/UI 替换、L1/L2/L3 扩展、模板 | docs/modding/README.md |
| 用户协议/安全政策 | 独立任务维护（若存在 `docs/legal/TOS.md`、`docs/legal/SAFETY.md` 以该文件为准；本入口不复制其条款） | 同名文件 |

## 3. 非官方声明（发布物必须展示）

> 汀岚（Tinglan）是 PerryLink 的原创虎鲸秘书角色。本项目为非官方项目，与 DeepSeek（深度求索）无任何关联、合作、授权或背书关系；不使用 DeepSeek 官方 Logo、字标或官方鲸鱼娘形象。角色名/Logo/商标不随 CC BY-NC-SA 授权。

> Tinglan is an original orca-secretary character by PerryLink. This is an unofficial project, not affiliated with, endorsed by, or authorized by DeepSeek. No DeepSeek logos, wordmarks, or official mascots are used. Character names/logos/trademarks are not licensed under CC BY-NC-SA.

## 4. 内容红线（摘要，全文见 legal）

- 未成年人性化/CSAM：零容忍，AI 生成同样适用；涉未成年人不当接触一律报告。
- 冒充官方/暗示 DeepSeek 合作；使用官方 Logo/官方鲸鱼娘。
- 真人声音克隆、未授权音源、影视/游戏音频提取、AI 伪装真人。
- 他人 IP/商标/字体/参考图；`art/_placeholder/refs/` 同人参考图**永不发布**；Orca 不得作产品名。
- 包内可执行/恶意代码、伪造签名、绕过安全边界、提供去 AI 标识/破限能力。
- 色情/仇恨/骚扰/政治操纵/违法内容；侵犯隐私；未获同意的真人形象；诈骗与虚假信息。
- 诱导情感依赖/恋爱关系/付费解锁关系；以“替代真人社交”为卖点。

## 5. 应用内声明（可直接引用）

- **首启 1 屏**：`firstRun.body`（AI/非真人/非官方/非专业/数据与费用/求助）。
- **About 常驻**：`nonOfficial.full` + `footer.legal` + 许可清单入口。
- **2 小时提醒**：`health.2h`（每满 2 小时；可“稍后”，不可彻底关闭）。（实现状态：按钮现为“休息并关闭提醒/关于”，目标文案见 canon `health.2h.confirm`）
- **TTS**：首次 `tts.firstUse`；**每次开启/切换** `tts.enableConfirm` / `tts.changeConfirm`；播放器常驻 `ai.label.audio`；导出 `tts.exportLabel`。
- **roleplay 与隐私**：`roleplay`/`crisis.card` 已按 canon 接入（**仅本地模板回复，不提供自由 LLM 对话/情感陪伴；一般功能全年龄，roleplay 仅 18+ 且首启自报出生日期核验**），不得宣传未实现能力。TTS 为合成语音（不是真人）；ASR 独立声明+单独同意已实现（2026-11-17.3：未确认不录音、不上传；拒绝/错误 fail-closed；录音经 Tauri 代理上传 DeepSeek）；仍缺 ASR 独立常驻开关/日配额/费用提示与供应商跨境披露（发布前补齐或关闭云 ASR）；隐私政策草案见 [docs/legal/PRIVACY.md](/legal/PRIVACY.md)（未生效）。
- **用户自行接入（2026-11-17.4）**：TOS §六之二/About 说明自由 LLM roleplay/情感陪伴非官方功能（官方不提供/不鼓励、无法强制阻止、只尽提醒义务、不背书、保留举报/删除权）；`userAgency.*` 短文本 canon 见 APP-DISCLOSURE §2C，**尚未单独接入 UI**，接入前只以完整 TOS 展示。
- **危机**：`crisis.card`（未来 roleplay/对话上线时；当前无 roleplay 运行时，文本为目标；110/120/12356）。
- **Mod/DLC**：**每次加载/修改** `mod.loadConfirm`；作者确认 `dlc.authorDuty`。
- 全文 canon 与频次规则：[docs/legal/APP-DISCLOSURE-TEXTS.md](/legal/APP-DISCLOSURE-TEXTS.md)。

## 6. 修改 / DLC / 二创作者必须做

1. 使用 docs/modding/ 的 L1/L2/L3 路径；角色包保持纯数据，不得含可执行内容。
2. 在包内 `README.md`/`LICENSE.txt`/`NOTICE.txt` 与 `meta`/`license`/`credits`/`audio[].license` 写清素材来源、许可、AI 披露、作者与联系方式；**源码/脚本分发时在文件头或 README 保留同款声明**。
3. 发布页展示非官方声明与红线；不得删除、隐藏、弱化原作者署名/NOTICE/AI 标识/非官方声明。
4. **不得移除安全/同意门禁**（AI 标识、全年龄内容边界与 roleplay 声明、2h 提醒、危机转介、TTS/云同意、费用提示、签名校验、遥测默认关闭）；要求用户“关掉校验/跳过声明”= 违规。
5. **每次修改/加载都须重新展示免责声明并确认**；不得“同意一次永久跳过”。
6. DLC/包作者对内容、许可证与来源负责；商业量产/周边/真人声音/第三方 IP 先走律师与书面许可。

## 7. 健康使用与危机资源

- 工作助手为主定位；**roleplay 已接声明/设定/退出入口，仅本地模板回复**（显式进入、可随时退出、仅限 18+ 且须完成自报年龄核验；内容须全年龄适宜；一般功能全年龄可用）；不做每日签到/缺席惩罚。
- 每连续 2 小时提醒休息；夜间默认安静（目标；依赖提醒运行时未实现）；识别依赖倾向时温和提醒现实社交。
- 危机资源：**110/120**；**12356 心理援助热线**；优先联系可信任的人；不承诺保密、不诊断、不替代救援。
- 未成年人：**一般功能全年龄可用；roleplay/情感陪伴仅限 18+**（2026-11-17.5 拍板，首启自报出生日期核验）；不提供成人向内容与虚拟亲密关系；**年龄核验为自报、非官方身份证/实名认证，无监护人验证/未成年人模式**（如实披露，不得宣称已具备实名核验）；监护人可邮件要求删除/举报（本机数据需在设备上操作）。
- 用户自行接入：自由 LLM roleplay/情感陪伴**不是官方功能**（2026-11-17.4）；官方不提供/不鼓励、无法强制阻止、只尽提醒义务；用户自行接入第三方模型/客户端/修改版须自担责任与法律后果，全年龄内容边界与危机求助要求仍适用（[TOS](/legal/TOS.md) §六之二）。

## 8. 联系

问题/安全/侵权/隐私：**novelnexusai@outlook.com**；违法不良信息可向 [12377](https://www.12377.cn/) 举报；紧急情况拨 110/120。

## 9. 待办 / 仍 DRAFT / 需拍板

- **仍 DRAFT**：本文件、docs/legal 全部政策、LICENSE-ART、NOTICE 均为草案；律师审查暂缓；不得称已审核。
- **需用户拍板**：产品名（商标检索前不改公开名）；roleplay 面向地区/是否对外宣传；是否收费/上架；未成年人模式方案。**已拍板（2026-11-17.5）**：年龄口径 = **一般功能全年龄可用、roleplay/情感陪伴仅限 18+（首启自报出生日期核验，非官方身份证核验）**（覆盖旧“全年龄、不设年龄门”口径）。**已拍板（2026-11-17.4）**：自由 LLM 角色扮演/情感陪伴属用户自创用法、非官方功能；官方不提供/不鼓励、无法强制阻止、只尽提醒义务，用户自行接入自担责任与后果（TOS §六之二）。
- **需律师**：L1–L11 适用与罚则；拟人化“提供者”定性/安全评估/算法备案；TTS 供应商再分发条款；DLC 收费合同与责任分配；跨境与强制报告；隐私政策/消费者条款/年龄识别；**用户自行接入/修改后行为的责任边界与“只尽提醒义务/不承担法律后果”措辞的可执行性（2026-11-17.4 新增）**。
- **工程待闭环（2026-11-19 更新）**：**已实现**：TOS/TTS/ASR/roleplay 声明与同意门禁、年龄自报核验+roleplay 18+、撤回同意、删除全部本地数据（残留如实披露）；**仍缺**：`firstRun` 合并 1 屏、2h/危机/页脚文本的完整接入、ASR 独立常驻开关/日配额/费用提示（或发布版关闭云 ASR）、TTS/ASR 供应商留存与跨境披露、D6 首启顺序（当前年龄→TOS；目标 TOS/关键事实先读）、AI 隐式/导出/音频标识、42 WAV 服务商书面再分发结论、旧 `dist/`/artifacts 残留核验、安装包声明清单（LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/隐私政策）。详见 [docs/legal/RELEASE-BLOCKERS.md](/legal/RELEASE-BLOCKERS.md) 与 docs/legal/review-2026-11-17/00-PATCH-PLAN.md。
- **批准台账**：[docs/legal/APPROVALS.md](/legal/APPROVALS.md)（当前全部空白/待签；不入台账=未批准）；合并审查总表：docs/legal/review-2026-11-17/00-CONSOLIDATED-LEGAL-REVIEW.md。
- **已修正的旧矛盾（2026-11-17）**：NOTICE 旧“Famling 层 intended Apache-2.0”已删除并标注被 2026-11-16 PolyForm NC 决定取代；`LICENSE-ART` 生效状态表述统一；Pearl 37 个占位文件“随 dist 分发 vs 声明 not distributed”矛盾改为如实描述；TTS 18 WAV 状态统一为“再分发未确认、构建默认剔除、旧产物须核验”（**2026-11-19 更新：已扩为 42 WAV 且经用户授权 baked 随包；服务商书面再分发仍 TBD**）；`D:\Orca` 绝对路径与 rustup 过时句已移除。详见 docs/audit/LEGAL-DOCS-UPDATE-2026-11-17.md。
- **2026-11-19 真值同步**：根 NOTICE/DECLARATIONS 与 [docs/legal](/legal/README.md) 修正旧年龄口径（全年龄→一般功能全年龄+roleplay 18+）、18→42 WAV、ASR“无告知/同意”与撤回/删除全部“未实现”旧句、gate 16→34（实测）、TOS 2026-11-17.5→.6、插件真实 LLM 与 famling 无自由 LLM 的两端边界、远程市场默认离线、D6 现状 vs 目标；新增 [律师复核前检查清单](/legal/LAWYER-REVIEW-CHECKLIST-2026-11-19.md)。
