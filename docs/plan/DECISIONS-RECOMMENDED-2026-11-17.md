# V1 决策建议（可直接拍板）— 2026-11-17

> **Status: 建议稿 · PLAN ONLY · 非法律意见。** 唯一写入=本文件；未改代码/资产/配置，未 git，未调 API/生图，未做构建/E2E。现状引自已提交报告 + 本轮只读复跑：HEAD `4c6379e`；`legal-check --strict`=**BLOCKED 16**；`git remote/tag` 空；`grep roleplay src` 仅 consent 退出记录。
> **2026-11-17 全年龄拍板（状态注记，不改历史结论）**：用户已拍板年龄口径为**全年龄、不设年龄门**；本文件 D-07 及多处“roleplay 仅 18+/年龄门/成人向”建议已被该拍板取代（旧建议保留为历史决策记录，正文不回改）。
> **怎么用**：U 逐项勾选；拍板后按 [V1 决策 dossier](V1-DECISIONS-REAL-MACHINE-2026-11-17.md) §更新规则写入 [DECISIONS-2026-11-15](../DECISIONS-2026-11-15.md) 与（待建）`docs/legal/APPROVALS.md`。**不入台账 = 未拍板**；本文件不构成完成/合规声明。
> **编号**：D-01~D-12 = V1 dossier §1；D-13~D-18 = [秘书皮研究](../research/SECRETARY-PET-PRODUCT-2026-11-17.md) §8（已对齐，无漂移）。输入/结果设计稿 8 条并入 §2.5，不另编号。

## 0. 一页结论（全部选推荐）

- **汀岚 256：不是 final，v1 也不作默认**（D-01/02/03 A）。机器 gate 49/49 含脚本补 6 帧珍珠，人工 2×/palette 未收口；`placeholder:true/final:false` 保持。
- **v1 = 工作助手皮**：不做自由 LLM 聊天、不宣称陪伴、不开 roleplay、不收费/不上架、不公开完整壳（D-07/08/13/18 A）。
- **输入**：v1 只做气泡内联打字 + PTT 辅助（0 全局热键/0 新窗）；全局热键 + 520×132 composer 留 v2（D-15 A）。
- **Advisers**：v1 只读 brief + 本地交办草稿（≤3 在办、仅运行时提醒），不写账本；`task-request`/`pet-result` 是 v2 新契约（D-14 A）。
- **工程解锁**：先追认 D-2026-11-16 窗口 flags（D-12 A），否则 region/穿透/DPI/R1'–R9' 无法开工、HEAD 包无法重建。
- **发布门槛**：`legal-check --strict`=0 + APPROVALS + HEAD 重打包 + 18 WAV/CC0 处置（D-10/11 A）。
- **美术/UI**：humanoid 96 占位、猫狗占位不替换、UI 91 只接菜单 9 图标 + 少量 badge/indicator/placeholder（D-04/05/06 A）。
- **测量**：遥测默认关、仅 opt-in 小样本试玩（D-17 A）；先测基线，不设假目标。

## 1. 决策总表（拍什么 + 触发/验收）

| ID | 决策 | 现状（HEAD `4c6379e`） | 选项 A / B / C | 推荐 | 触发 → 验收 |
|---|---|---|---|---|---|
| D-01 | 汀岚 256 是否 **final** | opt-in preview；`placeholder:true/final:false`；机器 gate 49/49（含脚本补 6 帧珍珠）+16 帧脚底漂移 warning；人工 2×/锚点手绘未做；[PACK-256](../audit/PACK-256-AUDIT-2026-11-17.md)、[ANCHOR-FINAL](../art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md) | A 维持 concept/opt-in；B 人工终审+锚点手绘+palette 后升 final；C 现在标 final | **A**（B 留 v1.1/beta） | 触发=人工 2× 记录+D-03+RM-16/08；验收=`final:false` 保持、默认不加载/不宣称 final、发布说明标 preview、默认角色测试锁 humanoid、AI-PROVENANCE 补 20 概念/49 帧 sha/成本（$1.24+$1.64） |
| D-02 | 汀岚是否 **默认角色** | 默认 humanoid 96；仅 `?hero=1&character=tinglan` 进 256；hero 白名单已含 tinglan | A v1 不换默认；B beta 换默认（D-01 通过+回退开关）；C 立即换 | **A** | 触发=B 前置（D-01 过、回退开关、RM-01/06/08 实机、首启文案）；验收=默认 id=humanoid、无 query 不加载 256、无首启视觉回归 |
| D-03 | palette `orca-pixel@0.2-draft` 注册 | 256 写 `@0.2-draft`、128 写 `@0.2`；`art/specs`+`art/_style/palettes` 无 spec/hex，`validate_art` 无法执行；32 槽草案仅在 gitignored 目录 | A 建 spec+32 hex+gate 后统升 `@0.2`；B 保留 draft 并禁 final；C 换现成板 | **A**（与 D-01 B 同批；v1 暂不建板） | 触发=32 槽定稿；验收=spec+hex 入库、`validate_art` exit 0、128/256 统一 `@0.2`、逐帧入板复验 |
| D-04 | UI 91 接入范围 | 91 逻辑/97 物理已入库，registry 含逐文件 sha/license=placeholder-only/ai=none；仅 9 菜单图标接（16 显示/32 源）；82 资产 0 消费；无 TrayIcon；RP 6 卡未过法务/内容复核 | A P1 先接菜单定稿+badge/indicator/placeholder，托盘/ICO 紧随，RP 卡随 D-07；B 全量一次接；C 只留 9 图标其余封存 | **A** | 触发=人工 16/32 评审（RM-15）+托盘实现；验收=每资产有真实消费点/可访问名不变/registry 不变、RM-15 深浅底+DPR125/150 截图、托盘 Windows 实测 |
| D-05 | 默认 humanoid：96 还是 256 | 运行 96（37 文件占位）；`canvasTarget:256` 仅建议；`PIXEL_SCALES` 不接受 8/3；N-first/DPI 未做（RM-08/09） | A v1 保持 96；B R1'–R9' 通过后单批 256；C 现在迁 256 | **A** | 触发=RM-06/08/09 实机+DPI spike+新母版批准；验收=改 canvas 时 39 帧/character.json/测试同批、无 96/256 混布 |
| D-06 | 猫狗：id/画布/是否替换旧占位 | `famling.pet-cat`/`famling.pet-dog`（`public/characters/pet-cat`、`pet-dog`）+96 占位、旧方向（姜黄/眼斑）与新 OC（白布偶/金毛）冲突；OC 0 图且**禁 API 生图**；feed/play 语义与"不做饲养"冲突待收 | A v1 不替换、保持 96 占位，OC 作 v1.1 提案；B 新 id+新 OC（96/128）；C 原地替换旧占位 | **A** | 触发=命名+商标初检+人工像素产线排期；验收=id 不变、`placeholder:true`、feed 不作产品承诺、0 API 生图记录 |
| D-07 | roleplay / 18+ / 地区 | `grep roleplay src` 仅 consent 退出意图；无引擎/入口/age gate/2h/危机卡；[DECLARATIONS](../../DECLARATIONS.md) 已写"仅 18+/默认关/可退出"；[REG](../research/AI-COMPANION-REGULATION-2026-11-16.md) | A v1 不开放/不宣称，只做模型无关骨架；B 骨架+自述年龄、地区先 CN；C 开 RP 小范围 | **A** | 触发=律师/APPROVALS 口径+6 张 RP 卡复核+18+ 文案；验收=0 RP 入口/0 宣传词；骨架可 mock（18+ 门/2h/危机/退出/AI 标识）且有测试 |
| D-08 | 收费/上架 | 无定价/上架决定；Steam 仅 stub；C 线《深夜小馆》A/B 未拍板；包 unsigned；NC-SA 美术禁商用；TTS 未清权 | A v1 beta 免费 unsigned 私域；B 定价/Steam 留 P2 另立 ADR；C 现在定 | **A** | 触发=签名证书+商店 AI 问卷+i18n+清权；验收=release notes 写免费/未签名/来源、包内无价格/商店承诺、无付费解锁关系 |
| D-09 | 公开仓/改名 | 本地 `git remote`/tag 空；[PUBLIC-REPO](../PUBLIC-REPO-2026-11-16.md)/README 称远端与公开仓已建，与事实矛盾；产品名未定（Orca 不可用；汀岚/留屿园未检索）；export dry-run 205 files/0 leak、白名单不含完整壳 | A 先定"公开=素材/接口子集"+修文档，公开与改名推迟；B 改名+公开前商标初检；C 公开完整壳 | **A** | 触发=产品名+商标初步检索+D-10/11 清零+export 0 leak+CI；验收=README/remote 事实一致、单一产品名来源、公开仓无壳/TTS/私密路径 |
| D-10 | 法务 16 blockers / APPROVALS | 本轮复跑 `legal-check --strict`=BLOCKED 16（8 DRAFT+8 portable 缺件/过小）；`release.yml` 必败；包 resources 缺 5 份声明、NSIS 无 licensePage；`docs/legal/APPROVALS.md` 不存在 | A 建 APPROVALS+U 定"律师暂缓下可发布口径"+补 resources/licensePage+重打 portable；B 只改 gate 查台账（不补包）；C 维持现状 | **A** | 触发=U 暂缓口径+18 WAV/CC0 处置（D-11）；验收=`--strict` exit 0、安装包声明清单/About 链接实机可达、APPROVALS 每行有谁/何时/范围/依据 |
| D-11 | CC0/许可（含 TTS/UI/Advisers） | LICENSE-ART DRAFT（CC BY-NC-SA 4.0，用户 11-16 决定）；CC0 仅 Pixiv 131049875 部分汀岚素材、逐文件清单缺；TTS 18 WAV 再分发未确认却仍被 git 跟踪+旧包含未清权 WAV；UI 不在 CC0；代码 PolyForm NC；Advisers 实际 MIT 与用户口径 Apache 待确认 | A 逐文件列 CC0/TTS 处置，未确认 WAV 不进任何渠道，维持 NC-SA；B 现在宣称 CC0；C 现在换许可 | **A** | 触发=作者补 CC0 清单（URL/日期/文件）+TTS 条款裁决；验收=逐文件清单、包/公开仓 0 未清权 WAV、逐图 provenance、Advisers 许可由维护者书面确认 |
| D-12 | 窗口 flags 批准记录（D-2026-11-16） | 11-11 No-Go 已被 `5989e55` 实践推翻（transparent/alwaysOnTop 已改），台账 grep=0；region/穿透 0 实现；R1'–R9' 未实机（NR-04/06） | A 补写"撤销 No-Go、批准 flags、验收改 R1'–R9'"；B 回滚 flags；C 维持无记录 | **A** | 触发=U 确认条目文字；验收=DECISIONS 有日期/理由/回滚；RM-06..09 实机后销项 |
| D-13 | 定位与剂量（助手 vs 陪伴） | pet.html 仍有"羁绊/纸片"HUD 数值，与关系契约冲突；产品研究主张"秘书同事"、不做长期陪伴；无"陪伴"宣传但情感内容已多 | A 工作助手为主，情感仅脚本化轻互动/默认开可关/不宣发陪伴，去 HUD 数值签到好感；B 双定位；C 强化陪伴 | **A** | 触发=首启/About/商店文案定稿；验收=无关系数值/签到/缺席惩罚、无"想你/只有我"式主动、2h+AI 标识在、文案过 APPROVALS |
| D-14 | Advisers 交办边界 | 0.2.0 无任务/结果契约；写入口仅 `capture` pending（出网/需 key）与 MCP pending；入账需人工 accept；brief 只读 5min TTL/128KiB/60s 轮询；无 scheduler/自动刷新；UI displayPolicy 已在 HEAD 落地，屏幕共享检测 0 | A v1 本地轻量交办（≤3 在办、无层级、仅运行时提醒、不写账本）+重任务引导 Advisers，v2 才谈 task-request/pet-result；B v1 就接 capture；C 直连 DB/MCP | **A** | 触发=v2 顺序（producer 快照+tag+evidence→consumer allowlist/fixtures→consumer 发布→producer 再切，不得反向）；验收=0 SQLite 读写、v1 无异步结果宣称、brief fail-closed、私密 30s/失焦清空有测试 |
| D-15 | 输入 v1/v2 | 仅 PTT+regex 意图（"我听见了…"）与纯输出 `#bubble`；无 composer/热键/托盘/通知/剪贴板；IME/焦点/前台锁未实机；[DESIGN](../design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md) 建议 v1 气泡内联、v2 热键 composer | A v1 气泡内联打字 first-class+PTT 辅助+菜单入口，0 热键/0 新窗；v2 才 `Ctrl+Alt+Space`+520×132 composer+托盘；B v1 就上热键/新窗；C 语音优先 | **A** | 触发=v2=v1 使用基线+焦点/IME/前台锁实机+托盘；验收=composition Enter 守卫、Esc/草稿/失焦隐藏、后台事件不抢焦点、无键盘钩子、E2E |
| D-16 | 角色与任务 | hero 白名单 humanoid/cat/dog/tinglan；默认 humanoid；任务能力 0（除 brief）；研究建议任务只在汀岚皮 | A 只有汀岚承载任务/提醒/简报，猫狗只轻互动，切换不改语义；B 所有皮接任务；C 中性图标承载 | **A** | 触发=D-02 选 A 时任务层 v1 仅 opt-in 预览/内部验证、不作公开卖点；验收=猫狗 0 任务入口/文案、切换皮不丢草稿 |
| D-17 | 指标/遥测 | 0 遥测（默认关）；研究给 D7/完成率/打断率/误触/依赖风险门槛；无试玩数据 | A 先测基线、遥测默认关、仅 opt-in 日志/试玩内部信号；B 默认开匿名遥测；C 不做指标 | **A** | 触发=opt-in 小样本试玩；验收=默认 0 上报/0 原文/依赖只做内部信号/发布说明披露；D7<15%、打断>50% 降频、回引<95% 不加提醒作停/加阈值 |
| D-18 | 监管口径 / 自由 chat | 前端无模型 chat 调用；`trust.buildDeepSeekChatRequest` 仅草案+测试；无 TOS"AI 对话"章节；AI 徽标已落（HEAD）；2h/危机骨架未接 | A 不接自由 LLM chat、不宣称陪伴，2h/AI 标识/危机先做模型无关骨架，官方云/账号/收费/商店前过"运营化闸门"；B v1 接自备 key chat；C 全面 chat | **A** | 触发=官方云 LLM/账号/收费/商店/云记忆任一→先安全评估/算法备案/未成年人模式/人工升级；验收=v1 0 模型调用（除已同意 TTS/ASR）、AI 标识常驻、2h 不可永久关、危机卡/退出在、0"陪伴"文案 |

## 2. 推荐理由 / 代价 / 选错影响

| ID | 推荐 | 理由（产品/合规/工程/成本） | 代价 | 若选错的影响 |
|---|---|---|---|---|
| D-01 | A | 机器 gate≠final；AI concept 误标 final 会污染 provenance/许可/AI 披露链（v1 49 文件仅 19 种独立内容、7/7 锚点曾判不过；v2 修到 49/49 但含脚本补锚点、脚底漂移未修）；opt-in 已可评审，不阻塞 | beta 缺"final 美术"卖点；终审+palette 约 2–3 人日+评审 | 虚假 final→质检/披露/信誉风险；回退便宜，但"已发布即 final"难收回 |
| D-02 | A | 默认角色=品牌与首启承诺，需美术+回退+实机三前置；无 D-01 换默认=把 concept 当门面 | 失去"汀岚默认"的传播点；humanoid 占位观感弱 | 换默认后回退→观感/存档/首启文案返工，品牌反复 |
| D-03 | A | 无 spec/hex/gate，final 无法验证；`@0.2-draft` 与 128 的 `@0.2` 命名分裂会让 CI/验收入口失效 | 1–2 天定 32 槽+逐帧复验；v1 可暂用 draft 过渡 | 色板不可复现/每帧返工；换板=整套重烘（v2 已花 $1.64） |
| D-04 | A | 91 已入库但 placeholder-only；82 资产无消费点，全量接线=为占位图造 UI+评审/AI 披露负担；RP 6 卡须随 D-07 | 外观仍偏文本/CSS；托盘/ICO 缺口（P1 紧随） | 全量接线=多人日+返工；过早接 RP 卡=法务/内容风险 |
| D-05 | A | 96→256=8/3 非整数派生，39 帧+契约+测试整套迁移；DPI/多屏未验，先不动默认 | v1 默认仍占位观感；256 延期到 v1.1 | 现在迁=美术/窗口/测试三线返工，默认角色回归风险 |
| D-06 | A | OC 0 图且禁 API 生图；旧占位虽旧方向但可运行；命名/商标未做，换 id 破存档/导入 | 新 OC 延期；旧占位与 OC 文本观感冲突 | 换名/换 id→存档/导入/文案返工；半成品替换=双状态成本 |
| D-07 | A | RP 触发拟人化办法与未成年人保护风险（研究结论，非法律意见）；无引擎/age gate/危机卡；先做骨架可复用 W5 | 少情感/RP 卖点；18+ 显式用户流失 | 最重：合规定性升级+未成年人风险+与工作助手定位冲突，叙事难回退 |
| D-08 | A | 清权未完成（NC-SA 美术禁商用、TTS 未知）；unsigned 私域=最低合规面，beta 先验证价值 | 无收入/分发规模小；SmartScreen 拦截 | 付费包含 NC-SA/TTS=侵权/退款/下架；定价无依据 |
| D-09 | A | 公开完整壳=暴露未完成/unsigned/私有路径；改名越晚越贵但无商标检索不能定名；export 子集已 205 files/0 leak | 社区/曝光延迟；双仓手动同步 | 公开仓含私密/未清权内容或与 README 矛盾→法务/信任；改名撕裂链接/包名 |
| D-10 | A | strict 16 是硬门；无 APPROVALS 无法证明"谁批了什么"；包内缺 AI/美术声明 | 1–2 人日文档+重打 portable；律师暂缓下由 U 按台账承担判断 | 发布包缺声明/CI 必红；分发即披露不合规 |
| D-11 | A | CC0 不可撤回且逐文件证据缺，不能先宣称；TTS 再分发是第三方权利面；UI 不在 CC0 | 逐文件清单+条款裁决耗时；18 WAV 可能需替换（成本另计） | 许可错误不可撤回+第三方主张；最坏下架/索赔 |
| D-12 | A | 代码已动冻结区却无台账=不可追溯/回滚；R1'–R9' 是透明/置顶/穿透验收语言 | 一次记录+确认；后续 RM 实机 2–3 天 | 冻结区纪律失效；每次窗口改动无基线、回滚责任不清 |
| D-13 | A | 工作助手是拟人化办法第二条排除口径的核心抗辩（研究结论，需官方/律师确认）；陪伴化=监管+与 Advisers 审计叙事冲突 | 增长/情感留存弱；需删现有羁绊/纸片数值 HUD | 定位漂移=定性升级+产品重做，最难回退 |
| D-14 | A | 0.2.0 无异步任务契约；直写破坏审计链/隐私面；v1 本地即可交付"记得住/提醒"；v2 反向升级禁令清楚 | 跨关机/跨天提醒不可靠（UI/文案必须明说）；重任务离开桌宠 | 账本/审计损坏、跨仓 schema 锁死、宣称结果却无契约 |
| D-15 | A | 焦点/IME/热键三不确定只能实机；v1 复用现有气泡槽 0 插件；v2 +40–90MB/5 插件 | 点宠物会激活窗抢焦点；发现性差；480×336 空间紧 | 早上热键→冲突/杀软/焦点投诉；聊天侧栏→变聊天 App+监管 |
| D-16 | A | 角色一致性/文案×3/动物拟声不适合可审计任务；数据与皮解耦 | 若 D-02 不换默认，任务 v1 只能 opt-in 预览（价值验证慢） | 猫狗接任务=第二套秘书/文案爆炸；切换丢任务语义 |
| D-17 | A | 无用户基线时设目标=假目标；默认遥测=隐私/告知风险；内部信号即可防依赖 | 样本小/结论弱；无增长分析 | 静默采集=违反告知同意/信任崩塌；指标驱动过度提醒 |
| D-18 | A | 自由 chat/官方云=触发拟人化办法全套义务（安全评估/备案/未成年人/人工升级），个人/小团队无法履行；v1 0 模型调用=合规-by-design | 少 AI 对话卖点；TTS/ASR 仍受限 | 最坏暂停服务/罚款/下架；影响 Advisers 与品牌 |

## 2.5 输入/结果设计稿 8 条遗留待拍板（并入 D-14/15/04/18，不单列）

| # | 设计稿待拍板 | 建议 | 归并 |
|---|---|---|---|
| 1 | v1 点击气泡会激活宠物窗 | 接受；v2 再试 `focusable:false`/`WS_EX_NOACTIVATE` | D-15 |
| 2 | 默认快捷键 / v1 是否上全局热键 | v1 不做；v2 默认 `Ctrl+Alt+Space` 可改+冲突检测+托盘兜底 | D-15 |
| 3 | 结果卡遮宠物：调暗 vs 上移 | B 卡同窗底部 sheet + 宠物调暗 20%，不改窗口尺寸 | D-15/D-04 |
| 4 | 未安装版系统通知/badge 降级 | 接受：以窗内卡+badge 为主，不承诺系统通知 | D-15 |
| 5 | 2h 提醒不可关闭、提醒频次 | 采纳：P0≤1/日、P1≤3/日、22–8 安静、同屏 1 个 attention | D-13/D-18 |
| 6 | 是否只让汀岚承接任务 | 采纳（猫狗只轻互动） | D-16 |
| 7 | chat completion 上线/地区/费用；Advisers 新契约谁维护 | v1 不上；v2 另批；契约由 Advisers 维护者+本仓 consumer owner 双签 | D-18/D-14 |
| 8 | AI 标识常驻程度 | 整宠小徽标常驻 + 结果/About 详述（HEAD 已落） | D-18 |

## 3. v1 发布最小决策包（8 项；拍完即解除决策侧阻塞，工程按 §4.2）

| # | 必须拍板 | 为什么"发布前"必须 | 推荐 | 拍板后产出 |
|---|---|---|---|---|
| M1 | D-01+D-02+D-03：256 口径/默认角色/色板 | 决定首启、包内容与验收语言；防 concept 误当 final | 均 A（v1 不含 256 final） | 台账条目+发布清单排除 256+默认角色测试 |
| M2 | D-12：D-2026-11-16 窗口 flags 追认 | 解除冻结区，否则 region/穿透/R1'–R9'/重打包不能开工 | A | DECISIONS 条目+RM-06..09 验收范围 |
| M3 | D-10：法务门/APPROVALS | `strict`=16 blockers 时任何分发包都不可发布 | A | `APPROVALS.md`+strict 0+包内声明/licensePage |
| M4 | D-11：TTS/CC0/许可处置 | 包/公开仓不得含未清权音频或虚假 CC0 | A | 逐文件清单+WAV 处置+LICENSE-ART 状态 |
| M5 | D-13+D-18：定位与监管口径 | 决定 v1 不做什么、文案与 AI 标识范围 | 均 A | 0 陪伴/0 自由 chat 的发布声明+2h/危机骨架验收 |
| M6 | D-08+D-09：发布形态/公开仓 | 决定渠道、包名、README、公开策略 | 均 A（免费 unsigned 私域；beta 前不公开完整壳） | 发布说明+README 事实修正+export 白名单 |
| M7 | D-14+D-15：输入与 Advisers 边界 | 决定 v1 是否含"交办/输入"及其宣称口径 | 均 A | v1 功能清单（含/不含）+「不宣称异步结果」文案 |
| M8 | D-17：遥测默认关 | 出厂二进制必须 0 上报，否则发布即采集 | A | 发布清单断言"0 遥测/0 原文" |

### 3.1 可延后项（明确"最晚何时必须拍"）

| ID | 为什么可延后 | 最晚拍板点 |
|---|---|---|
| D-04 UI 91 全量范围 | 9 菜单图标已接可用；其余 82 资产无消费点 | W9/UI 91 人工评审排期前（P1 beta） |
| D-05 humanoid 96→256 | D-01/02 选 A 后 v1 不含 256 | RM-08/09 通过 + humanoid 重生立项前 |
| D-06 猫狗 OC | v1 保持占位即可运行，OC 无图 | 新 OC 美术立项/替换占位前 |
| D-07 roleplay | v1 不开放即无对外风险 | 任一 RP 入口/文案/地区扩展前（beta 前） |
| D-16 角色任务 | 与 D-13/D-02 一致，选 A 不产生额外工作 | 猫狗接任务/多皮任务前 |
| D-03 palette 建板 | v1 不升 final 则不需要 spec/hex | 256 升 final（D-01 B）前 |

- **非决策类延后**（引用审计即可，不必本轮拍）：ZIP 导入（NR-20）、i18n（NR-21）、Advisers scheduler/自动刷新（NR-15/W7）、屏幕共享检测（S-07）、Steam/签名（NR-23）、Rust 大小/路径/TOCTOU 补丁（S-01，发布前必须修但不需产品拍板）。

## 4. 若全部选推荐：v1 图纸

### 4.1 v1 范围 / 非目标

| 维度 | v1 包含 | 明确不含 |
|---|---|---|
| 形态 | 480×336 透明置顶无边框窗、右键菜单、气泡、全屏隐藏；R1'–R9' 实机通过（region 失败则退化整窗可点并写说明） | 独立结果窗/第二窗（v1.1）、常驻聊天侧栏、命令面板 |
| 角色 | 默认 humanoid 96 占位 + DOM fallback；汀岚 128/256 仅 `?hero=1&character=tinglan` opt-in preview | 默认汀岚、humanoid 256、猫狗新 OC、多秘书 |
| 美术/UI | 9 菜单图标 + 少量 badge/indicator/placeholder 消费点；UI registry 保持 | 91 全量接线、托盘/ICO（紧随）、RP 卡、背景/FX（P2） |
| 输入 | 气泡内联打字 + PTT 辅助 + 菜单入口；本地草稿；确认后写本地 | 全局热键、520×132 composer、历史会话、读屏/剪贴板监听、键盘钩子 |
| 交办/Advisers | 本地 ≤3 在办、仅运行时提醒、只读 brief、private 隐私模式、人工 `capture` 交接 | 写 Advisers 账本、异步结果宣称、跨天可靠提醒、屏幕共享强检测 |
| 合规 | TOS/TTS 同意、AI 徽标常驻、2h 不可永久关、危机卡/退出、隐私政策/APPROVALS/逐图 provenance | roleplay/情感陪伴、自由 chat、官方云 LLM、账号、云记忆 |
| 发布 | 免费 unsigned 私域 beta（NSIS+portable+SHA256+RELEASE-MANIFEST）；Win11 主/Win10 尽力；中文 UI | 收费、Steam、商店、公开完整壳、改名、i18n |

- **非目标（一句话版）**：不做 TUI/命令面板/IDE 皮、不做角色市场/打榜/付费关系、不做 ZIP 导入（v1 后）、不做 Advisers SQLite 直写、不做第二个聊天 App、不做 humanoid 256 迁移。

### 4.2 里程碑（P0 发布前）

| 里程碑 | 内容 | 退出标准 |
|---|---|---|
| W1 拍板包 | 本文件 §3 的 M1–M8（约 0.5 天，U） | 台账/APPROVALS 行齐，每项有日期/选项/owner |
| W2 Tauri Phase 1B + HEAD 重建 | region 穿透+`.visible(false)`+R1'–R9'+NSIS/portable/SHA256（2–3 天，E/W） | `artifacts/qa/` 矩阵 provenance 齐；旧包隔离 |
| W3 法务/发布门 | strict 清零、resources+licensePage、portable 补件（1–2 天，E/W/L） | `legal-check --strict` exit 0；包内声明清单通过 |
| W4 合规骨架 | 18+ 门可关骨架/2h/危机/退出/AI 标识 mock（1–2 天，E/L；与 D-07 A 不矛盾） | mock 演示+单测；RM-01/03/12/13 过 |
| W5 输入 v1 纵向切片 | 气泡 composer+IME+草稿+确认卡，0 新窗（2–3 天，E） | E2E（IME/Enter/Esc/失焦）+回归 `npm test`/typecheck/build |
| W6 CI/E2E 绑定 HEAD | TOS-aware cdp/e2e + workflow 门禁（1–2 天，E/W） | CI 绿且证据绑定 commit+exe sha |
| v1 beta 门 | 合流 | 上述全绿 + 无未清权 WAV + 发布说明 |

### 4.3 主要风险与缓解

| 风险 | 信号 | 缓解 |
|---|---|---|
| 透明/置顶/穿透/DPI 未知 | RM-06..09 失败、DWM 矩形、穿透点击不到 | region spike 先行；失败退化"整窗可点"并写说明；D-05/256 等窗口验收后再做 |
| 法务/律师暂缓口径不清 | strict 16 不清零、无 APPROVALS | U 按台账拍板可发布范围；未清零不发包；不宣称"已合规" |
| AI concept 误当 final | 门/文案/包出现 final | placeholder/final 门+发布清单断言+人工终审记录（D-01 A） |
| 焦点/IME/激活 | 点宠物抢焦点、IME 候选窗被裁 | v1 接受+Esc 收起+MS Pinyin/搜狗实测；v2 才 NOACTIVATE |
| Advisers 无调度/真实 brief | brief 5min 过期、无自动刷新 | 不承诺跨天/可靠提醒；v1 只作只读展示；beta 前补 scheduler |
| unsigned/SmartScreen/Win10 | 下载被拦、无 Win10 实机 | beta 明示未签名+来源；Win10 尽力支持；证书归 P2 |
| 定位漂移 | 出现陪伴/恋爱/自由 chat 文案 | 文案清单+APPROVALS+AI 标识；D-13/D-18 为硬约束 |

## 5. 证据索引（本文件不新增事实）

- **决策/计划**：[V1 决策 dossier](V1-DECISIONS-REAL-MACHINE-2026-11-17.md) · [决策台账](../DECISIONS-2026-11-15.md) · [非美术剩余审计](../audit/NONART-REMAINING-AUDIT-2026-11-17.md)（NR-01~23）· [HARDENING-NEXT](../audit/HARDENING-NEXT-2026-11-17.md) · [TRUST-REVIEW](../audit/TRUST-REVIEW-2026-11-17.md)
- **产品/输入/输出**：[秘书皮研究](../research/SECRETARY-PET-PRODUCT-2026-11-17.md) · [输入方式](../research/INPUT-MODALITY-2026-11-17.md) · [输入技术可行性](../research/INPUT-TECH-FEASIBILITY-2026-11-17.md) · [结果呈现](../research/TASK-OUTPUT-PRESENTATION-2026-11-17.md) · [Advisers 闭环](../research/ADVISERS-TASK-LOOP-2026-11-17.md) · [输入/输出设计稿](../design/PET-INPUT-OUTPUT-DESIGN-2026-11-17.md)
- **合规**：[拟人化办法研究](../research/AI-COMPANION-REGULATION-2026-11-16.md) · [chat share 研究](../research/CHAT-SHARE-x1baq-2026-11-17.md) · [DECLARATIONS](../../DECLARATIONS.md) · [法务状态](../LEGAL-STATUS-2026-11-15.md) · [法务文档更新](../audit/LEGAL-DOCS-UPDATE-2026-11-17.md)
- **美术/UI**：[PACK-256](../audit/PACK-256-AUDIT-2026-11-17.md) · [256 锚点收口](../art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md) · [256 接入](../art/TINGLAN-256-INTEGRATION-2026-11-17.md) · [合并美术审计](../audit/CONSOLIDATED-ART-AUDIT-2026-11-17.md) · [UI 缺口审计](../audit/UI-DEFAULTS-GAP-AUDIT-2026-11-17.md) · [UI-91 接入](../art/UI-91-INTEGRATION-2026-11-17.md) · [OC 完成](../art/OC-COMPLETION-2026-11-17.md)
- **Advisers/许可/发布**：[Advisers 契约](../integration/ADVISERS-CONTRACT.md) · [0.2 兼容审计](../audit/ADVISERS-020-COMPAT-2026-11-17.md) · [Advisers UI 隐私](../audit/ADVISERS-UI-PRIVACY-2026-11-17.md) · [ASSET-LICENSES](../../ASSET-LICENSES.md) · [LICENSE-ART](../../LICENSE-ART) · [PUBLIC-REPO](../PUBLIC-REPO-2026-11-16.md)
- **本轮只读复跑**：`git log -1`=`4c6379e`；`node scripts/legal-check.mjs --strict`=BLOCKED 16；`git remote -v`/`git tag` 空；`public/assets/ui/manifest.json` 91 逻辑/97 物理（逐文件 sha/license/ai）；`public/assets/pet/tinglan-256/manifest.json`=`placeholder:true/final:false`；`public/characters/tinglan-256/character.json`=`palette@0.2-draft`/`display.scale=1`。

## 6. 边界

- 本文件是**产品/工程决策建议**，不是法律意见；涉法规/许可处只转述研究结论（原文与律师意见为准）。拍板仍由 U 负责，律师可用时按 [LEGAL-STATUS](../LEGAL-STATUS-2026-11-15.md) §5 最小集复核。
- 推荐 ≠ 已批准；写入台账/APPROVALS 前不改变任何门禁，也不代表任何"已合规/已完成/已发布"。
- 后续若编号/建议变动：在 [DECISIONS-2026-11-15](../DECISIONS-2026-11-15.md) 追加日期行并回链本文件，不改写本文件历史结论。
