# 00 · 法务审查合并总表（P0/P1/P2）— 2026-11-17

> **Status: DRAFT (engineering draft) · 合并去重稿 · 不是法律意见。** 本表由 `01`–`06` 六份只读工程审查 + `docs/plan/DECISIONS-RECOMMENDED-2026-11-17.md`（D-01~D-18）合并去重而成；**不是律师意见、不是合规认证、不得对外称“已审核/已合规/可发布”**。法规与执法口径可能变化，发布前须官方原文 + 执业律师复核。
> **2026-11-17 状态注记：用户已拍板年龄口径为全年龄、不设年龄门；本文围绕 R-P0-08/年龄 18+ 的建议已被该拍板取代（保留为历史审查记录，不回改正文）。**
> Owner 图例：**工程**=本仓可改/可测；**律师**=执业律师意见；**权利人**=PerryLink / Pixiv 作者 / Pearl 上游 / DeepSeek 等；**用户**=拍板、签字、发布口径；**外部**=供应商、商标局、商店、网信等。
> 状态图例：**OPEN**=未交付；**文本已起草**=本任务新建/更新的 DRAFT 文本（未生效、未签署）；**部分**=已有局部实现/事实；**条件**=触发才升级为 P0。
> 证据列 `01 P0-1` = 本目录报告编号；其余为仓库路径，引用前请复测行号（工作树有并行改动）。

## 0. 合并口径（为什么“16 blockers ≠ 16 个问题”）

- 六份报告 P0 合计 30+ 条，合并去重后 **R-P0 23 项**、**R-P1 15 项**、**R-P2 8 项**。
- `node scripts/legal-check.mjs --strict` 的 16 = 8×DRAFT（NOTICE/CREDITS/THIRD-PARTY/AI-PROVENANCE/docs-legal-README/DECLARATION-MATRIX/SECURITY/TAKEDOWN）+ 7×portable 缺件 + 1×staging 过小，且每条 warning 被复制成 blocker（06 P0-4）。**gate 数字是工程证据，不是独立问题计数**；逐条展开见 [RELEASE-BLOCKERS](../RELEASE-BLOCKERS.md)。
- “文本已起草”≠“阻断解除”：新增/更新的法务文本全部为 DRAFT，须按 [APPROVALS](../APPROVALS.md) 由用户/律师签字后方可作对外生效文本。

## 1. P0 — 发布前必须（未清不得公开/上架/收费）

| ID | 问题（合并后） | 证据 | Owner | 发布前必须 | 当前状态 |
|---|---|---|---|---|---|
| R-P0-01 | 定位漂移 + 未上线 roleplay/情感支持被当既有功能承诺（TOS/About/setup/APP 文案、About“退出角色扮演”、无 RP 引擎/18+ 门/危机卡） | 01 P0-1；04 P0-2；05 P0-3②；`terms.ts:106,176-182`；`pet.html:170`；`main.ts:1936-1940` | 工程+用户(D-07) | 是 | OPEN；文本已起草（CONSUMER-MINORS-HEALTH §4 禁令；APP 待改） |
| R-P0-02 | 18 个 DeepSeek TTS（stella）WAV 再分发未确认；旧便携包/zip 实测内嵌未清权 WAV；随包路径未全封死 | 01 P0-2；03 P0-2；05 P1-5；06 P0-1；`THIRD-PARTY.md:60-73`；`artifacts/portable/DesktopGames.exe` | 权利人(DeepSeek)+律师+工程清理 | 是 | OPEN；文本已起草（RELEASE-BLOCKERS §6 处置树） |
| R-P0-03 | AI 标识未闭环：TOS 无“标识方法/样式”、无隐式元数据（PNG tEXt/XMP/C2PA）、音频层无标识、导出无标识、常驻角标 8px/2.17:1 不可达 | 01 P0-3；03 P0-5；04 P0-5；05 P1-2；06 P1-2；`AI-PROVENANCE.md:221-223` | 工程+律师措辞 | 是 | 部分；文本已起草（AI-LABELING.md；工程未实现） |
| R-P0-04 | 无可发布隐私政策（现仅 TOS §9 四句；PIPL 17/30 要素全缺） | 02 P0-1；`SECURITY-AND-PRIVACY.md:3,85`；`docs/LEGAL-STATUS:61` | 工程+律师 | 是 | 文本已起草（PRIVACY.md，DRAFT 未生效） |
| R-P0-05 | PTT 即录音并上传 DeepSeek ASR，无告知/同意/开关/配额，音频先行出境后才审核文本 | 02 P0-2；05 P0-3①；`main.ts:614-620`；`asr.ts:5-18`；`voice.rs:194-233` | 工程+律师 | 是 | OPEN；文本已起草（PRIVACY §7 工程待办；发布前未接则关云 ASR） |
| R-P0-06 | 无撤回同意、无“删除全部本地数据”、卸载残留（PIPL 15/47） | 02 P0-3；06 P1-3；`main.rs:186-203`；`consent/core.ts:14-15` | 工程 | 是 | OPEN；文本已起草（PRIVACY §5 标注为工程待办） |
| R-P0-07 | TTS/ASR 第三方与跨境告知不具体（端点实际 `api.deepseek.com`；弹窗只写“服务商/自行评估”） | 02 P0-4；`voice.rs:158,219`；`terms.ts:142,237` | 工程+律师 | 是 | 部分；文本已起草（PRIVACY §6；供应商条款 TBD） |
| R-P0-08 | 未成年人口径三套互斥且无年龄门/未成年人模式/监护人流程，构成误导告知 | 04 P0-1；02 P1-4；`TOS.md:111-113`；`CONTENT-POLICY.md:34,38` | 用户拍板+工程 | 是 | 部分；文本已起草（建议 v1 成人向 18+，待 U 拍板） |
| R-P0-09 | 消费者条款缺失：无“v1 免费/未来收费不改变关系/不付费解锁亲密/退款/自动续费/虚拟物品/广告/评价”框架 | 04 P0-3；`TOS.md:89-93` | 工程文本+用户 | 是 | 文本已起草（CONSUMER-MINORS-HEALTH §2；TOS 待改） |
| R-P0-10 | 投诉/举报/申诉/未成年人风险通道不足：应用内无 12377/12315、About 无联系方式、无申诉/封禁流程 | 04 P0-4；01 P1-1；`pet.html:149-178`；`TAKEDOWN:46-74` | 工程 | 是 | 部分；短文本已补 canon（待 About 接入） |
| R-P0-11 | 美术许可链无生效文本：LICENSE-ART/NOTICE DRAFT vs README/DECLARATIONS/ASSET-LICENSES 已宣称 CC BY-NC-SA 4.0（三口径） | 03 P0-1；`LICENSE-ART:3`；`NOTICE:7`；`README.md:192` | 律师+用户 | 是 | OPEN |
| R-P0-12 | Pearl/溟月占位 37 文件随仓且可随构建复制，无上游署名链；商业版永不得含 | 03 P0-4；`NOTICE:116-139`；`public/assets/pet/pearl-placeholder/` | 工程+权利人+律师 | 是 | OPEN；文本已起草（RELEASE-BLOCKERS §9 deny-list） |
| R-P0-13 | Pixiv CC0 声明不可核（无逐文件 URL/日期/清单，20 份 md 引用 0 份可核证据） | 03 P0-6；`ASSET-LICENSES.md:3-5,17-22` | 权利人(Pixiv 131049875)+律师 | 是 | OPEN |
| R-P0-14 | 商标未检索即用于产物（Pagefold/折角/DesktopGames 已进 UI/安装器），产品名未定；Orca 42 类在先注册 | 03 P0-7；06 P1-4；`pet.html:10,56`；`terms.ts:33`；`tauri.conf.json:3` | 用户+律师+工程 | 是（决策） | OPEN；文本已起草（APPROVALS A-09） |
| R-P0-15 | AI 供应商输出权利未确认（OpenRouter/OpenAI Images、DeepSeek TTS/ASR、SDXL 全 TBD） | 03 P0-8；01 P1-5；`AI-CONTENT-POLICY.md:72-81` | 律师+上游 | 是（条件） | OPEN |
| R-P0-16 | 原创性/相似性 G2 未清（Orca 与 Pearl/溟月链/ref10 混淆风险） | 03 P0-9；`LEGAL-STATUS:161`；`PEARL-ART-LICENSE-CHAIN` | 律师+美术 | 是 | OPEN |
| R-P0-17 | 公开仓/导出未核验却已声称导出（含 Pearl/256 AI 概念/CC0 未证素材风险） | 03 P0-10；`README.md:192`；`export-public-pet.mjs:22-40` | 用户+工程 | 是（条件） | OPEN；README 事实已修（仍未核验） |
| R-P0-18 | 发行包缺署名/许可/第三方通告；安装器无 licensePage、resources 仅 4 份、HEAD 配置从未构建验证 | 03 P0-3；06 P0-2；06 P1-5；`tauri.conf.json:34-44`；`installer.nsi:41,168-170` | 工程 | 是 | OPEN；文本已起草（RELEASE-BLOCKERS §4 资源清单） |
| R-P0-19 | 应用内法务链接打包后 100% 404，安装包不含 TOS/隐私文本 | 06 P0-3；`pet.html:8-9,41`；`dist/` 无 docs | 工程 | 是 | OPEN |
| R-P0-20 | 内容安全零容忍仍可复现漏放 + 空格/分隔符系统性绕过；本地层无远端第二层 | 05 P0-1；`safety/local.ts:205-265,383-395`；`sanitize.ts:162-167` | 工程 | 是 | OPEN（代码未改） |
| R-P0-21 | 审核/拒答零留痕：无审核日志/审计链/证据保全（文档有、运行面无） | 05 P0-2；`gate.ts:555-569`；`trust.ts:146-202` | 工程 | 是 | OPEN；日志规范见 R-P1-04 |
| R-P0-22 | legal gate 口径误导（16 重复计数）且有盲区（不扫 public 音频/artifacts/HTML/TOS/隐私/resources） | 06 P0-4；`legal-check.mjs:43-74` | 工程 | 是 | OPEN；文本已起草（RELEASE-BLOCKERS §1-2） |
| R-P0-23 | 条件触发义务无预案/无主体：安全评估、算法备案、商店核验、7×24 应急 | 01 P0-4/P0-5；`LEGAL-BASELINE.md:81` | 用户+律师+外部 | 条件触发 | OPEN；文本已起草（APPROVALS + CONSOLIDATED §5） |

## 2. P1 — 公开运营/云化/上架前必须（届时升 P0）

| ID | 问题（合并后） | 证据 | Owner | 当前状态 |
|---|---|---|---|---|
| R-P1-01 | 依赖/沉迷提醒未实现；2h 按钮“休息并关闭提醒”易读成永久关闭；2h 文案与 canon 不一致、仅 pet 页计时 | 01 P1-3；04 P1-2；`runtime.ts:305-334`；`modal.ts:578-597` | 工程 | OPEN |
| R-P1-02 | 便捷退出三通道缺失（现仅 About 按钮且只记审计）；roleplay 未上线应先移除入口 | 01 P1-4；`gate.ts:291-294` | 工程+用户 | OPEN（并入 R-P0-01 文案改） |
| R-P1-03 | 危机干预“安抚→转介→联络”链路仅文案；无危机卡独立 UI/停止角色化输出 | 01 P1-2；04 P2-5；`SAFETY.md:64-65` | 工程+律师 | OPEN |
| R-P1-04 | 生成内容与安全日志留存无规范（保留期/字段/防篡改/导出）；同意审计仅 100 条无链 | 01 P1-6；05 P0-2；`SAFETY.md:48,86` | 工程+律师 | OPEN；日志规范草案见 R-P0-21 |
| R-P1-05 | 双 canon/实现漂移（TOS 全文 vs APP 1 屏；TTS 频次；2h 按钮；`packLoad` 零调用；`health.dependency`/`crisis.card`/`rp.gate18` 未引用） | 01 P2-2；03 P2-5；04 P1-3；06 P1-1；`consent/terms.ts` vs `APP-DISCLOSURE-TEXTS.md` | 工程+用户 | OPEN；APP 已加实现状态注记，运行时仍以 terms.ts 为准 |
| R-P1-06 | Advisers 简报含第三方个人信息（title/matter/who/what/summary）无专项告知；屏幕共享不检测 | 01 P2-4；02 P1-2；`pet-brief.ts:89-106`；`main.ts:1803-1806` | 工程 | OPEN |
| R-P1-07 | 导入 DeepSeek 分享摘要明文 localStorage、可能含第三方个人信息、无导出/删除 | 02 P1-3；01 P2-5；`store.ts:21,86-91` | 工程 | OPEN |
| R-P1-08 | 文档状态过时/自相矛盾（README 索引计数、setup“About 待接”、标识“未落地”、DECLARATIONS 待办、计数/预算） | 01 P2-3；02 P1-5；03 P1-6；04 P2-1；06 P2 | 工程 | 部分：本任务已修 README/APP/NOTICE/DECLARATIONS 事实；root LEGAL-STATUS 未修（写范围外） |
| R-P1-09 | 角色包/DLC 签名与责任边界不一致（角色包无签名）、包内缺 LICENSE/NOTICE、第一方 packs 无许可字段、schema 未 required | 05 P1-4；03 P1-7/P1-8；`character/registry.ts:78-108`；`packs/*/manifest.json` | 工程+律师 | OPEN |
| R-P1-10 | UGC/导入页无“本人有权/已授权”声明与 author/source 字段；TOS 无许可与归属条款 | 03 P1-11/P1-12 | 工程+律师 | OPEN |
| R-P1-11 | 资产登记：256 的 49 帧无逐文件 sha/SPDX/ai、frame-map/attachments 缺失；UI manifest 非 SPDX；ASSET-LICENSES 未接入 NOTICE/索引/gate/发行包 | 03 P1-1/2/3；`tinglan-256/manifest.json:169-233` | 工程 | OPEN；RELEASE-BLOCKERS §9 列入发布清单 |
| R-P1-12 | AI provenance 不足（prompt 原文/脚本/gate 证据在 gitignored）；CC BY 4.0 残留；license=TBD 台账未清零 | 03 P1-4/P1-9；`THIRD-PARTY.md:175`；`art/assets.csv` | 工程 | OPEN |
| R-P1-13 | 商业/NC/DLC 收费法务结论未定（自有美术双许可、AI 输出可版权/可执行性、第三方付费 mod） | 03 P1-10；04 P1-5；`ASSET-LICENSES.md:22` | 律师+用户 | OPEN |
| R-P1-14 | 发布元数据/校验和缺失（无 SHA256SUMS/RELEASE-MANIFEST、工具接受旧产物）；artifacts 999 条目含 38 pilot WAV/941 cdp profile/旧包 | 06 P1-5/P1-6；`release-win.mjs:101-131,232-279` | 工程 | OPEN；处置见 RELEASE-BLOCKERS §5 |
| R-P1-15 | 可访问性：法务正文 12px 不可放大、窗口不可缩放、About dialog 无焦点陷阱；AI 角标不可键盘/悬停到达 | 06 P1-2；06 P2；`pet.html:15-35`；`pet.css:541-555` | 工程 | OPEN |

## 3. P2 — 排期修（不阻断低风险内部使用）

| ID | 问题 | 证据 | Owner | 状态 |
|---|---|---|---|---|
| R-P2-01 | 法条/URL 硬错：“第八条八项红线”实为七项；标识办法 URL 写错；root LEGAL-STATUS 对 CC BY-NC-SA“允许商业使用/变体”事实错误 | 01 P2-1；03 §5；`LEGAL-BASELINE.md:20`；`AI-CONTENT-POLICY.md:61`；`docs/LEGAL-STATUS:36,108-110` | 工程 | 部分已修（LEGAL-BASELINE/AI-CONTENT/DECLARATIONS）；root LEGAL-STATUS/研究稿未修（写范围外） |
| R-P2-02 | 文档版本/计数/预算台账漂移（2000 vs 1200 字；18 vs 22 keys；TTS-TERMS 11-16 vs TTS_VERSION 11-17.1） | 04 P2-1；05 P2 | 工程 | OPEN |
| R-P2-03 | 广告/评价/排名/赞助（当前无；商业化前需显著标识、不刷评/不付费改评/赞助披露） | 04 P2-2 | 工程+律师 | 条件 |
| R-P2-04 | 辅助页/游戏页无统一声明；aquarium 遥测 opt-in 可 `?sentry=` 绕过；本地崩溃环含 URL/UA 未脱敏 | 04 P2-4；02 P2-1/P2-2；`observability.ts:12-57` | 工程 | OPEN |
| R-P2-05 | 技术加固：Tauri 命令未按窗口 ACL；API key 仅环境变量；DLC 加载无隐私提示；setup Markdown 字面量；About aria-modal 无焦点陷阱 | 02 P2-3/P2-6/P2-7；06 P2 | 工程 | OPEN |
| R-P2-06 | 机器可读许可缺失（无 LICENSES/REUSE/SPDX 头）；AI 部分 © 表述过宽；Tauri 图标来源 TBD；字体/SDK 边界 | 03 P2-1/P2-3/P2-4/P2-5 | 工程+律师 | OPEN |
| R-P2-07 | 出口/制裁/地区限制声明缺失（Ed25519/rustls 属标准密码） | 03 P2-2 | 律师 | 条件 |
| R-P2-08 | 全局 `art/assets.csv` 与各 manifest 双台账易漂移 | 03 P2-8 | 工程 | OPEN |

## 4. 不能由工程文档解决的（必须外部闭环；文档只能降级表述/设闸门）

1. **18 WAV 再分发**：DeepSeek TTS 输出商用/再分发/署名条款——须供应商书面结论；否则替换/移除。
2. **Pixiv CC0 逐文件**：作者 131049875 逐文件 URL/日期/清单——否则不得标 CC0。
3. **Pearl 上游署名/权利链**：非工程可补写的署名不能替代授权。
4. **AI 供应商条款台账**：OpenRouter/OpenAI/DeepSeek/SDXL 条款版本+结论。
5. **商标检索/定名**：官方检索 + 律师意见 + 用户拍板；Pagefold/折角/DesktopGames/Famling 均未清。
6. **相似性审查 G2**：反向图搜+人工+律师意见。
7. **律师意见/生效文本**：LICENSE-ART/NOTICE/TOS/隐私/消费者条款去 DRAFT 与签发。
8. **备案/安全评估/商店核验/年龄分级**：主体、预算、7×24 能力决策（条件触发）。
9. **发行包签名/重建**：证书、真实 build（含 resources/licensePage）、SHA256 与实机核验。

## 5. 自检与限制

- 本表每条都能回指报告/仓库证据；未新增“已实现”事实。`node scripts/legal-check.mjs` 仍为 WARN-ONLY 16 warnings（8 DRAFT + 7 portable + staging）——**不因本任务文档而清零**，DRAFT 未删。
- 新增/更新文本均为 DRAFT：`PRIVACY.md`、`AI-LABELING.md`、`CONSUMER-MINORS-HEALTH.md`、`APPROVALS.md`（空白待签）、`RELEASE-BLOCKERS.md`、`APP-DISCLOSURE-TEXTS.md` 增补、`README.md`（法务部分）、`DECLARATIONS.md`、`NOTICE` 事实修正。
- 本表**不是法律意见**；任何“发布前必须=是”项均须 APPROVALS 签字/外部结论后才可放行。
