# 02 · 隐私与数据流审查（PIPL / DSL / CSL）— 桌宠

> **审查员**：legal-privacy（法务审查线；只读审计，只写本文件）。**非律师、非法律意见。**
> 状态：审查报告 v1 · 2026-11-17 · 只读审查：未运行应用、未调 API、未用真实用户数据；唯一写入为本文件。
> 范围：`src/pet`（input/consent/storage/memory）、`src/voice`、`src/presence`、`app/tauri`、`pet.html`/`setup.html`/`chat-import.html`、`docs/legal/*` 与既有 `docs/audit/*`。结论基于静态代码；标"需实机/律师"处未验证。
> 依据（外链仅作数据）：《个人信息保护法》<http://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html> · 《网络数据安全管理条例》/《人工智能拟人化互动服务管理暂行办法》见 `docs/legal/LEGAL-BASELINE.md` §L6/L9。

## 0. 结论（先看）

- **本地优先属实**：存档/记忆 DPAPI（Win）或 AES-GCM+IndexedDB key 加密，加密不可用则拒写（`src/pet/crypto.ts:45-55,70-92`；`src/pet/main.ts:644-675`）；无云对话调用；遥测默认关（`src/observability.ts:68-88`）；崩溃只进内存环（`:12-34`）；无远程字体/CDN（`THIRD-PARTY.md:105-109`）；TTS 独立声明且按会话+配置重确认（`src/pet/consent/gate.ts:238-289`）；DLC 纯数据+签名（`SECURITY-AND-PRIVACY.md:56`）。
- **发布阻断 4 项**：① **无对外隐私政策**（自认 E8"未做"，`docs/LEGAL-STATUS-2026-11-15.md:61`；`SECURITY-AND-PRIVACY.md:3,85` 自述不得当政策发布），应用内 TOS §9 仅 4 句（`terms.ts:156-164`；`TOS.md:95-100`）。② **PTT 即录音并上传 DeepSeek ASR，无告知/同意/开关/配额**（`main.ts:614-620`、`asr.ts:5-18`、`voice.rs:194-233`）。③ **无撤回同意、无"删除全部本地数据"、卸载残留**（PIPL 15/47）。④ **TTS/ASR 第三方与跨境告知不具体**——实际写死 `api.deepseek.com`（`voice.rs:158,219`），弹窗只写"服务商/自行评估跨境风险"（`terms.ts:142,237`）。
- **文案与实现冲突 3 处**："关闭记忆"（`terms.ts:171`、`SECURITY-AND-PRIVACY.md:34`、`pet.html:171`）实际无开关，记忆在 pat/送纸/折纸/改名时自动写入（`src/kernel/pet.ts:80-133`）；"关闭语音输入"实际无开关（mute 只关 TTS，`main.ts:452,633`）；"删除存档"只删 save/bak/tmp（`app/tauri/src-tauri/src/main.rs:186-203`），不清 TTS 缓存/配额/导入摘要/同意记录。

## 1. 数据流清单（代码实测）

| # | 数据/入口 | 实现与存储 | 出机 | 与文档/默认开关一致性 |
|---|---|---|---|---|
| 1 | 打字输入 | 本轮桌宠仅 PTT 语音，无文本输入框（`main.ts:567-585`） | 否 | 文档已列"打字"为规划（`PET-INPUT-OUTPUT-DESIGN:20-37`），非现状 |
| 2 | PTT 音频 | MediaRecorder ≤60s → WAV → `voice_asr`（`recording.ts:244-285,319-383`；`asr.ts:5-18`；`voice.rs:194-233`） | **是**：`/v1/tools/asr` | SECURITY §3.3 要求上传前告知（`:43`），代码 0 实现；**P0** |
| 3 | ASR 文本 | 先 `trust.reviewUserInputForForwarding` 再显示/规则匹配；不落盘、不记日志（`main.ts:578-612`） | TTS 回复为模板句，非原文 | 好 |
| 4 | TTS 文本/音频 | `requireTtsConsent` → `voice_synthesize` → `/v1/tools/tts`；WAV 缓存 + `quota.json` 落盘（`main.ts:456-476`；`voice.rs:75-82,121-184`） | **是** | 缓存/配额/文本哈希键未入任何对外文件；`PET-PRIVACY.md:12` 称 `voice_cache_clear` 未接 UI，实际已接（`main.ts:844-858`） |
| 5 | 存档+记忆 | DPAPI 整档密文 / 浏览器 AES-GCM+不可导出 key；`.bak`；fail-closed（`crypto.ts:45-92`；`PET-PRIVACY.md:18-22`） | 否 | 好；删除仅 save 相关，见 §3-P0-3 |
| 6 | 导入 DeepSeek 分享 | Rust 固定 URL 读公开分享（`main.rs:44-77`）→ 有界摘要存 localStorage **明文**（`src/pet/chat-import/store.ts:21,86-91`；`chat-import.ts:36-38`） | 读外网，不写外 | 摘要可能含他人个人信息；未加密、无导出 |
| 7 | Advisers 简报 | 只读 `~/.advisers/pet-brief.json` ≤128KiB（`main.rs:84-107`）；含 title/matter/who/what/summary（`src/presence/pet-brief.ts:89-106`）；默认关闭（`main.ts:1872-1873`） | 否 | `SECURITY-AND-PRIVACY.md:17` 数据项未含 Pet Brief 的 title/who/what/summary 字段（"不复制原文"仅指不落盘）；无专项告知 |
| 8 | 同意/审计记录 | localStorage 明文 `desktop-games/consent/*`（`src/pet/consent/core.ts:14-15`）；审计≤100 条含 target/detail | 否 | 可查状态但不可导出/删除（`main.ts` About 仅状态） |
| 9 | 崩溃/诊断 | 内存环≤50、无网络（`observability.ts:12-34`）；诊断导出含 `location.href`/UA（`:36-57`，仅 aquarium 入口） | 否（默认） | 本地路径可能进 console/诊断，未脱敏展示 |
| 10 | 遥测/Sentry | 默认关；`aquarium/main.ts:22-40` opt-in，且 `?sentry=` 可注入 DSN；`sendDefaultPii:false`+删 user/cookies（`:68-88`） | 开启时是 | 无同意记录/隐私政策/开关说明；默认关=好 |
| 11 | DLC/内容包 | 包签名+逐文件 sha256（角色包签名待补齐）、纯数据（`SECURITY-AND-PRIVACY.md:56`；`docs/legal/README.md:18`） | 否 | 包内文本/语音可含第三方个人信息，加载确认只有免责/许可，无隐私提示 |
| 12 | 第三方 | DeepSeek（ASR/TTS/share API，用户自带 key）、Sentry（opt-in）、Tauri/WebView2、npm 依赖；系统字体、图标本地（`THIRD-PARTY.md:105-109,130`） | 见 2/4/10 | DeepSeek 留存/跨境/训练条款 **TBD**（`AI-CONTENT-POLICY.md:78`） |

## 2. 隐私政策要素覆盖（现状 = TOS §9 + 内部底稿；"对外政策"=不存在）

| 要素 | 现状与缺口 | 判定 |
|---|---|---|
| 处理者身份/联系方式 | 仅 `novelnexusai@outlook.com`（`terms.ts:208`）；无运营主体、产品名未定（`docs/legal/README.md:3`），PIPL 17 主体信息缺失 | ✗ |
| 目的/范围/数据类别 | "记忆/存档默认本地"4 句（`terms.ts:156-164`）；无类别清单，TTS 缓存/配额/摘要/Advisers/同意记录均未列 | ✗ |
| 存储/保留期 | TOS 无"保留期"；内部表仅部分（`SECURITY-AND-PRIVACY.md:10-18`）；TTS WAV 缓存与 quota 永久保留（`voice.rs:99-107,177-182`） | ✗ |
| 删除 | 有 save/memory/digest/voice-cache 分散按钮；无 "全部本地数据"、无卸载清理（`tauri.bundle.conf.json` 仅 targets；另见 `AUDIT-OPS-UNCONSIDERED-2026-11-16.md:81`） | 部分 |
| 撤回同意 | 无任何入口（PIPL 15）；TOS 接受后只能清 WebView 数据 | ✗ |
| 查阅/复制/导出 | 存档口令备份、折页明文导出（`main.ts:941-982`）；同意/审计/摘要/Advisers 无导出 | 部分 |
| 共享/第三方 | 只写"第三方服务…不由本应用保证"（`terms.ts:149-153`）；未列 DeepSeek/Sentry、无服务商隐私政策链接 | ✗ |
| 跨境 | 只写"请自行评估隐私与跨境风险"（`terms.ts:142,237`）——把 PIPL 38/39 义务转嫁给用户 | ✗ |
| 敏感个人信息/单独同意 | 未识别语音音频可能含声纹/敏感内容，无单独同意（PIPL 28-29） | ✗ |
| 未成年人 | 18+ roleplay 文案（`terms.ts:176-182`）；无年龄门、无 <14 岁监护人同意（PIPL 31） | 部分 |
| 自动化决策 | 当前无画像/自动化决策；依赖信号提醒未实现（`APP-DISCLOSURE-TEXTS.md:40`）——现可标"不适用"，上线前须按 PIPL 24 披露 | 不适用 |
| 安全事件/政策更新 | 仅内部流程（`SECURITY-AND-PRIVACY.md:70-74`）；无对外通知承诺/时限（PIPL 57）；无隐私政策版本机制 | ✗ |

## 3. P0 — 发布阻断（"发布前必须"=是）

**P0-1 没有可发布的隐私政策。** 证据：`SECURITY-AND-PRIVACY.md:3,85`；`docs/LEGAL-STATUS-2026-11-15.md:61`（E8 未做）；对外数据条款只有 `TOS.md:95-100`。风险：PIPL 17/30 告知义务、Steam/GDPR/商店隐私标签均不满足。
建议：发布前出中英《隐私政策 v1》（处理者身份、目的/类别、存储地、保留期、删除/撤回/导出、共享清单、跨境、敏感信息单独同意、未成年人、自动化决策、安全事件、联系方式、版本变更）；应用内 About/首启/setup/商店页入口；与 TOS 分文件但互相引用。

**P0-2 PTT 录音上传无告知、无同意、无开关、无配额。** 证据：`main.ts:614-620`（startTalk 仅环境判断）、`main.ts:567-585`（录音→`transcribeWav`）、`asr.ts:5-18`、`voice.rs:194-233`（固定 `api.deepseek.com/v1/tools/asr`，仅 8MiB/无日配额）；自订红线 `SECURITY-AND-PRIVACY.md:25,43` 未实现；已知未修 `docs/audit/HARDENING-NEXT-2026-11-17.md:29-32`。风险：PIPL 28-29 敏感信息、23 第三方提供、39 跨境；用户可能不知情即产生费用。另：`main.rs:385-392` 只对 `label=="pet"` 放行麦克风，默认窗口 `label="main"`（`tauri.conf.json:15`）→ 默认安装权限行为未定义（需实机）。
建议：ASR 默认关；首次开启+每次上传前短确认（目的、接收方 DeepSeek、可能留存/跨境、费用、可关闭）；单独同意勾选；无同意不得 `getUserMedia`；加日配额/费用显示；`readonly` 状态同样阻断。

**P0-3 撤回同意与"删除全部本地数据"缺失，卸载残留。** 证据：无撤回 API/UI；`main.rs:186-203` 只删 saves 三件；`voice_cache_clear` 仅清缓存（`voice.rs:186-191`），不清 `quota.json`；导入摘要（`store.ts:21`）、同意/审计（`core.ts:14-15`）、WebView2 profile 无删除入口；卸载配置无清理（`tauri.bundle.conf.json`）。风险：PIPL 15/47、GDPR 17；`docs/audit/AUDIT-OPS-UNCONSIDERED-2026-11-16.md:81` 已记。
建议：设置页"撤回同意 + 清除全部本地数据"（列明保存/记忆/TTS 缓存/quota/导入摘要/同意审计/偏好；二次确认；保留依法必须留存的最小审计并说明）；卸载时可选清除并写进隐私政策与安装器许可页。

**P0-4 第三方/跨境/敏感告知不具体（TTS+ASR）。** 证据：实际端点 `voice.rs:158,219`；TTS 弹窗正文 `terms.ts:223-265`（仅"服务商"）、TOS `terms.ts:142,237`；`APP-DISCLOSURE-TEXTS.md:31-34` 的 `tts.*` canon 未接入（弹窗用 `terms.ts`）。风险：PIPL 23/39、Apple 5.1.2(i)、Steam AI/隐私问卷；"自行评估"不能免除告知。建议：明示"文本/音频发送至 DeepSeek（深度求索）API，处理地/司法辖区以服务商披露为准（需书面确认，通常为中国），留存/训练按服务商政策+链接"，单独同意 + 每次 TTS 配置/ASR 启用确认；若无法确认 DeepSeek 条款（`AI-CONTENT-POLICY.md:78` TBD），**先关闭云 ASR/TTS** 或改默认本地方案再发布。

## 4. P1 — 发布前应修（可带风险发布，但需排期与披露）

- **P1-1 承诺未实现**：`terms.ts:171`/`SECURITY-AND-PRIVACY.md:34`/`pet.html:171` 的"关闭记忆"无实现（记忆自动写入 `kernel/pet.ts:80-133`）；"关闭语音输入"无开关；"清除数据"只有折页/存档/摘要/缓存分散入口、无全清。改文案或实现：记忆采集开关、语音输入开关、全清入口。
- **P1-2 Advisers 第三方个人信息无专项告知 + 屏幕共享不检测**：`pet-brief.ts:89-106` 含客户事项/承诺/风险摘要；`main.ts:1803-1806` 注释明确"屏幕共享/录制检测未接"；仅设计文档提醒（`DESKTOP-PET-UX:222`）。建议：首次打开面板告知"本地只读、不上传、可能含他人信息、共享屏幕前请关闭"，增加隐私模式/`contentProtected`（excluded from capture）或 Tauri 捕获检测；数据清单须列出 Pet Brief 字段并注明"仅渲染、不落盘"。
- **P1-3 导入摘要明文 + 第三方个人信息**：`store.ts:21,86-91` 明文 localStorage；摘要来自公开分享，可能含他人姓名/偏好/承诺；无导出。建议：与存档同策略加密（或至少明确告知并一键删除），加导出/查阅。
- **P1-4 未成年人**：无年龄门；`terms.ts:176-182` 仅声明；PIPL 31 <14 岁监护人同意、未成年人条例。建议：首启年龄声明或不做面向未成年人宣传/商店分级；<14 岁监护人同意流程；与 roleplay 18+ 门一致。
- **P1-5 数据清单/保留期/文档已过时**：`SECURITY-AND-PRIVACY.md:10-18` 缺摘要/缓存/quota/consent/Advisers；`:15`"TTS 文本不落盘"未提 WAV 缓存与文本哈希键（`voice.rs:75-81,177-182`）；`PET-PRIVACY.md:12` 已过时。建议：以本报告 §1 更新底稿并作为隐私政策附录（含保留期/删除路径）。
- **P1-6 安全事件对外通知**：仅内部 `SECURITY-AND-PRIVACY.md:70-74`；无用户通知方式/时限承诺（PIPL 57）。建议：隐私政策/安全页写明事件通知渠道、时限、补救与联系人。
- **P1-7 同意记录/权利闭环**：审计仅 QA 钩子可读（`main.ts:1152`），About 无查看/导出/删除（`core.ts:14-15`）。建议：设置页可查看/导出/删除同意与审计；撤回同意即停止处理并说明影响。
- **P1-8 TTS 本地缓存未在声明中披露**：`terms.ts:223-265` 未提本机 WAV 缓存/quota/清除按钮（`main.ts:844-858`）。建议：TTS 声明与隐私政策补"本机缓存音频+用量计数，可一键清除"。

## 5. P2 — 工程加固/文档一致性

- **P2-1 遥测**：默认关（好），但 `aquarium/main.ts:22-40` 的 `?sentry=` DSN 注入可绕过 UI 开关启用错误上报；启用前需 opt-in 记录+隐私政策+上传内容清单+第三方隐私链接+关闭开关（`SECURITY-AND-PRIVACY.md:50-52` 自订）。
- **P2-2 本地日志/诊断**：崩溃环与 console 可能含本地路径/URL/UA（`observability.ts:12-57`；`error-boundary.ts` 默认 logger 记原始错误）；仅本地但建议导出/上报前脱敏。
- **P2-3 Tauri 自有命令未按窗口 ACL**：`build.rs` 仅 `tauri_build::build()`、`capabilities/default.json` 只授权 `core:*`，而 `read_advisers_brief`/`read_save`/`protect_text`/`unprotect_text`/`voice_*` 均注册于 `main.rs:527-548`。Tauri v2 默认**所有应用命令对所有窗口可用**（<https://tauri.org.cn/security/capabilities/>），游戏/实验窗口亦可读 Advisers、读存档密文并 DPAPI 解密、调 ASR/TTS。建议 `AppManifest::commands` + 仅 pet 窗口 allowlist。
- **P2-4 打包后法务链接 404**：`dist/` 无 `docs/`，但 `setup.html:49-52`、`chat-import.html:43,86`、`pet.html:8` 链 `/docs/legal/TOS.md`；打包后这些链接失效（应用内 TOS 全文仍可看）。建议把法律文档随包或仅链应用内 About/官网。
- **P2-5 双 TTS canon 漂移**：`APP-DISCLOSURE-TEXTS.md:31-34` 的 `tts.*` 未接入，实际弹窗用 `terms.ts:223-265`；建议单一 canon + 测试断言（现有测试只钉 `terms.ts`）。
- **P2-6 API key 来源**：仅环境变量 `DEEPSEEK_API_KEY`（`voice.rs:111,126,196`），无应用内管理；共享电脑/Explorer 启动继承需提示；建议系统凭据库（DPAPI 已有 `protect_text`）或明确说明"只从环境变量读取、不写入仓库/日志"。
- **P2-7 DLC/Mod 隐私提示**：加载确认只覆盖免责/许可/AI（`APP-DISCLOSURE-TEXTS.md:43`），建议加一句"内容可能含第三方个人信息；不要导入你无权使用的对话/素材"。

## 6. 发布前必须（建议 gate 顺序）

1. **先关闭云 ASR + 云 TTS**（保留 baked/system 本地语音）——这是隐私角度不依赖律师即可发布的最小路径（TTS 音频再分发另见 TTS/资产线）；若必须保留，先完成 P0-2/P0-4 的告知同意与每日配额。
2. 隐私政策 v1（中英）+ 应用内入口/首启告知/商店链接 + 数据清单与保留期（§1/§2 全要素）。
3. 撤回同意 + 清除全部本地数据 + 卸载清理说明；修正"关闭记忆/关闭语音输入/删除存档"三处文案。
4. Advisers 专项告知 + 隐私模式/屏幕共享防护；chat-import 摘要加密或明示+删除；P1-1~P1-8 排期。
5. 工程回归：无 key/只读/拒绝同意 下不 `getUserMedia`、不联网、不写盘（现有 fail-closed 测试需补 ASR 用例）；P2-3 窗口 ACL。

## 7. 限制与已确认良好项

- 未实机验证 Tauri/WebView2（mic 权限 label、blur/visibility、打包 404、`contentProtected`）；未核对 DeepSeek 现行 API 隐私政策/留存/训练条款（`AI-CONTENT-POLICY.md:78` TBD）——发布前须供应商书面结论+律师意见。
- 良好：加密存档与 fail-closed、TTS 会话+配置确认、每次内容动作完整 TOS（`gate.ts:209-231`）、审计不豁免、chat-import 每次动作重弹（`chat-import.ts:36-38`）、遥测默认关、无远程字体/CDN、Advisers 默认关且 private 30s/blur 清空（`main.ts:1803-1812`）、无原始 ASR 日志。
