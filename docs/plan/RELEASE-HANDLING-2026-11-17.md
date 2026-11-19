# 发布处理方案（RELEASE HANDLING）— 工程 / 法务 / 运营 · 2026-11-17

> **Status: 方案稿（PLAN ONLY）· 基线 HEAD `992be36`（2026-11-17 21:35 CST）· 只读研究。**
> 本轮未改代码/资产、未执行 git、未调 API、未做构建；唯一写入=本文件与 [发布处理审计](../audit/RELEASE-HANDLING-2026-11-17.md)。
> **不是法律意见，不构成发布许可。** 唯一准入依据=`docs/legal/APPROVALS.md` 真实签字 + 外部书面结论；研究/建议/模拟审查都不等于批准。
> 快照（21:45–21:54 CST）：`npm test` **779/779**、`tsc --noEmit` 0、`fci:validate` 0；`legal-check` WARN-ONLY **38 warnings/exit 0**；`--strict` **38 blockers/exit 1**；`release-win --verify` **exit 1**（缺 `SHA256SUMS.txt`）；11-14 旧产物仍在 `artifacts/`；APPROVALS **0 行 APPROVED**。期间工作树有并行任务改动（非本轮），发布构建必须从干净 commit 起。
> 关联：[RELEASE-BLOCKERS](../legal/RELEASE-BLOCKERS.md) · [APPROVALS](../legal/APPROVALS.md) · [SIMULATED-REVIEW](../legal/SIMULATED-REVIEW-2026-11-17.md) · [CONSOLIDATED](../legal/review-2026-11-17/00-CONSOLIDATED-LEGAL-REVIEW.md) · [LEGAL-PACKAGE](../audit/LEGAL-PACKAGE-2026-11-17.md) · [TTS-BAKE](../audit/TTS-BAKE-2026-11-17.md) · [DLC-AI-LABEL](../audit/DLC-AI-LABEL-2026-11-17.md) · [ALLAGES-ROLEPLAY](../audit/ALLAGES-ROLEPLAY-2026-11-17.md) · [DATA-CONTROLS](../audit/DATA-CONTROLS-2026-11-17.md) · [NONART-REMAINING](../audit/NONART-REMAINING-AUDIT-2026-11-17.md) · [RUNBOOK](../RELEASE-RUNBOOK.md) · [SIGNING-RELEASE](../research/REMAINING-SIGNING-RELEASE.md)

## 0. 一页结论

1. **现在只能做“邀请制私域 beta”**：包配置（`bundle.licenseFile` + `public/legal/` resources）已接、42 WAV manifest/guard 通过，但**没有 HEAD 的 Tauri/NSIS 构建与 SHA256/清单（target/旧包为 11-14）**、旧产物含未清权 WAV、0 个 APPROVED、法务文本全 DRAFT。公开免费/收费/商店 **一律 NO-GO**。
2. 三条路径是**递进**不是并列：`私域 beta → 公开免费 → 收费/商店`；每跳要求上一跳证据 + 新增签字；**不得跳级**。
3. **模拟审查不是发布许可**：`SIMULATED-REVIEW` 的 “SIMULATED-CLEARED / DO-NOT-RELEASE” 只是演练；真实 A-04/A-06/A-10/A-11/A-13/A-16/A-18 仍 BLANK；对外称“已审核/已合规/已授权”= 禁止。
4. **只允许 HEAD 重建产物**：旧 zip `5afc07af…`、旧 setup `ba9481b2…` 必须隔离（不删）；`release-win --plan` 只按文件名把旧产物判 “ok”，**隔离前禁止跑 `--sha256/--all`**，否则旧包会被“洗白”。

## 1. 路径 A：v1 私域 beta（当前唯一可执行）

- **前置（全满足才发）**：U 在 [APPROVALS](../legal/APPROVALS.md) 签 **A-08**（渠道=私域/免费/未签名）与 **A-18**（律师暂缓下 U 自担口径，附残留风险清单）；`legal-check --strict`=0，或 U 逐条签“beta 例外”（DRAFT 如实标注、不得删 DRAFT 骗门）；HEAD 干净 commit 构建 + SHA256/RELEASE-MANIFEST；包内无 11-14 旧产物、无未列 WAV。
- **必须修**：① 隔离旧 `artifacts/`（§3.1）；② HEAD 构建 + 实机安装/卸载（RM-17），`$INSTDIR` 资源/许可页可见；③ 42 WAV 渠道决策——U 书面接受“beta 随包（DeepSeek 条款 TBD）”风险，或出无音频 beta 变体（TTS-TERMS §3A 只是用户授权，不是服务商许可）；④ 首启 TOS/TTS/ASR/roleplay 与 2h/危机/举报入口实机（RM-01/03/12/13）；全年龄口径：roleplay 仅“声明+设定+本地模板、无自由 LLM”，不得对外称情感陪伴；⑤ 隐私政策入口 + ASR 默认不启用/发布版关闭云 ASR（独立开关/配额/费用提示未实现，PRIVACY §7）+ 撤回/删除残留如实披露（DATA-CONTROLS §5）；⑥ AI 标识至少保持现状并在 release notes 列未达标项（8px/2.17:1、C2PA、音频首播提示、导出标识未做）。
- **谁签**：U=A-08/A-18/A-15 记录/A-14 已 RECORDED/A-05 决定（关云 ASR 或自担）；E=构建/测试/证据签名。L/R 不签（U 自担残留风险，**不得**对外称合规）。
- **构建/签名**：Windows HEAD 重建 NSIS+portable；**unsigned**（无证书），`unsigned:true` 写入清单。SmartScreen 说明必须进包内 README 与邀请邮件。
- **分发**：邀请制私域链接（网盘/自建）+密码+逐人 SHA256；不公开宣发、不上任何商店、不收费。
- **更新/回滚**：手动重装（无自动更新）；保留上一版 setup+hash；升级前备份 `%APPDATA%\com.perrylink.desktopgames\saves\`；存档版本严格等值，回滚先备份/移走 saves。
- **客服/下架**：邮箱 + 撤回流程（回收链接/通知/记录）；TAKEDOWN 流程适用；测试者名单与反馈最小化。
- **数据/隐私**：默认 0 遥测；ASR 默认不启用（PTT 前独立同意、拒绝不录音/不上传）；告知测试数据用途；提供删除/退出方式。
- **AI 标识/商店**：无商店问卷；包内 AI 披露 + README；TTS 属 AI 合成需明示“不是真人”。
- **许可/字体/依赖**：随包根声明 9 份 + `legal/` 包（DRAFT 如实）；系统字体栈（无第三方字体）；依赖许可 `LICENSES/` 仍缺（beta 记录，公开前补）。
- **判定**：**可做，但仅邀请制**；A-18 未签=NO-GO。

## 2. 路径 B：公开免费 / 路径 C：收费·商店（均 NO-GO，列清解禁条件）

- **B 公开免费前置**：A 全绿 + A-11（LICENSE-ART/NOTICE 生效）+ A-13（隐私政策生效）+ A-04（TTS 书面结论或移除音频）+ A-10（Pixiv CC0 逐文件）+ A-16（AI 标识闭环）+ A-09（名称/商标初检）；`strict`=0；公开下载页 + 真实联系方式 + 投诉/下架/更新/回滚/安全事件流程；Win10/DPI 实机证据；REMOVE Pearl 及未清权素材。**谁签**：U+L（TOS/隐私/许可）+R（DeepSeek/Pixiv）+X（商标检索）。**构建/签名**：可 unsigned，但建议 IV 证书（个人名，¥600–1000/年）降低 SmartScreen；仍会警告。**分发**：公开下载页/GitHub Release+镜像+hash；不收费/无广告。**更新/回滚**：手动或 updater（2–3 人日+1 人日演练），保留旧版。**客服/下架**：公开邮箱+投诉（12377/12315/12356）+下架公告+证据保留。**数据/隐私**：生效隐私政策+ASR 同意+跨境披露+删除/撤回+事件通知。**AI 标识/商店**：无商店，但按 A-16；若上 Steam 则升 C。**许可/字体/依赖**：NC 许可允许免费非商业分发；生效文本；依赖许可归档；不发 Electron；字体仅系统栈。**判定**：C 的前置；必须真实签字，不能靠模拟。
- **C 收费/商店前置**：B 全绿 + 商业许可变更（代码 PolyForm NC、美术 CC BY-NC-SA **均禁商用**；需权利人重许可或单独商业许可+律师）+ TTS 商用/再分发书面许可（否则移除音频）+ AI 输出权/相似性 + 商标注册/检索 + 主体/开票/税务 + 消费者条款/退款/价格 + 商店账号/AI 问卷/年龄分级/隐私标签 + 签名证书（OV 品牌名 / IV 个人名）+ updater（minisign，锁 `tauri-plugin-updater ≥2.12.0`）+ i18n。**谁签**：U+L+R+X。**构建/签名**：OV/EV 证书+signtool+时间戳，SmartScreen 信誉从零积累。**分发**：Steam/国内外商店；Steam $100/款 + 30% 分成。**更新/回滚**：updater+商店更新；退款/下架预案。**客服/下架**：退款/投诉/7×24（条件触发）/商店下架。**数据/隐私**：商店隐私标签、DPA、跨境、年龄口径。**AI 标识/商店**：Steam 内容调查 AI 问卷（预生成/实时分列）；EU 发行另核 AI Act 第 50 条。**许可/字体/依赖**：商业许可文本；依赖许可归档；新增字体需 OFL；TTS 商用。**判定**：**6–12 周+，现在 NO-GO**。

## 3. 具体执行步骤（发布前按序）

1. **清理/隔离 artifacts（不直接删）**：① 盘点 `artifacts/`（1000 条目：941 个 `cdp-*`、38 pilot WAV、旧 exe/zip/setup/soak/playtest-kit）；② 对旧 zip/setup/portable exe 计算 SHA256 并写隔离清单；③ 移入 `artifacts/_quarantine-2026-11-17/<name>/`（**mv 不 rm**，已有空目录可复用），记录原路径/哈希/日期；④ `playtest-kit` 从新构建重建（现内含旧 zip）；⑤ 旧哈希列入“禁止分发”清单并在新包核验 0 命中；⑥ 保留恢复方法，删除与否交 U（不在本轮）。
2. **版本/CHANGELOG**：`npm run version:set -- 0.2.0-beta.1`（B 公开起 0.2.0；C 另定）；**人工**同步 `src/**` 的 `gameVersion`/Sentry release（`version:check` 的 STALE 清零）；CHANGELOG 把 `[Unreleased]` 移入新版本，写明“未签名/私域/非公开发布/已知限制”；tag 仅在用户明确授权且有 remote 时打。
3. **HEAD 构建**：`legal-check --sync`（法务文本变更后）→ `npm run preflight` → `npm run build` → `scripts\build-tauri-win.bat` → `scripts\bundle-tauri-nsis-win.bat`（硬编码 `D:\Projects\dsh\desktop-games`，与本机一致；`npx @tauri-apps/cli@2` 未钉版本，发布前钉死）→ `release-win --all --strict` → `--verify`。本机已具备 VS2022 BuildTools、Windows node v24.22.1、cargo 1.99.1、WebView2 148.0.3967.83（见审计）。
4. **licensePage/resources 实机验收**：安装器点开许可页（`bundle.licenseFile=public/legal/LICENSE.txt`）；`$INSTDIR` 含 `legal/` 17+ 文件与根许可/声明（8–9 份）；About 的 `/legal/...` 链接全部可达、0 个 `/docs/` 死链；卸载残留检查。
5. **SHA256/证据**：`SHA256SUMS.txt` + `RELEASE-MANIFEST.json` + portable `BUILD-INFO.json`（commit、日期、`dirty:false`）；证据绑定 commit+exe sha+zip sha+构建机 OS/WebView2 版本，写入发布记录模板（RELEASE-BLOCKERS §13）。
6. **法务**：APPROVALS 按格式逐行真实签字（ID/日期/姓名/身份/渠道/范围/依据/条件/撤销），模拟行只能作演练；TTS 42 WAV 走 RELEASE-BLOCKERS §6 决策树（先要 DeepSeek 书面结论；未取得则公开/收费前移除或替换）；AI 标识按 [AI-LABELING](../legal/AI-LABELING.md) §8 闭项；许可/隐私/消费者按 A-10/A-11/A-12/A-13/A-16。
7. **运营**：release notes（免费/未签名/来源/哈希/安装步骤/SmartScreen 说明/已知问题/数据与退出）；tester agreement（不转发、不公开传播、反馈授权、保密、退出方式）；邀请邮件含逐人 hash；分发记录（谁/何时/哪版/hash）；更新与回滚演练；事故响应（§7）。
8. **退出/撤回**：测试者退出=删除本地安装+清 `%APPDATA%` 存档+书面确认；项目撤回=链接失效+公告+哈希黑名单+通知已分发对象+保留证据；上架后撤回=商店下架+公告+退款按平台规则。

## 4. 外部真实项 vs 模拟审查（**模拟不能当发布许可**）

| 项 | 模拟审查现状 | 真实需要（谁签/证据） | 允许用途 |
|---|---|---|---|
| A-04 TTS 再分发 | SIMULATED-CLEARED under user authorization | DeepSeek 书面（R）+L+U；TTS-TERMS §3A 仅用户授权 | 仅私域且 U 自担；公开/收费 **禁止** |
| A-06 供应商条款 | SIMULATED-REVIEWED；仍 TBD | L+R 台账（版本/日期/URL/结论） | 阻断公开/收费 |
| A-10 Pixiv CC0 | SIMULATED-NO-OBJECTION；逐文件不可核 | 作者逐文件 URL/日期/清单+L | 不得对外称 CC0 |
| A-11 LICENSE-ART/NOTICE | SIMULATED-DRAFT-ACCEPTABLE | U+L 定稿/生效日期/主体/范围 | 不产生许可效力 |
| A-13 隐私政策 | 工程实现可接受 | U+L 定稿+真实数据测试 | 对外隐私政策未生效 |
| A-16 AI 标识 | PNG tEXt 已做 49/49；音频/导出/C2PA=0 | U+L；商店 X | 公开/收费前必须闭环 |
| A-09 名称/商标 | 无模拟结论 | U+L+X 官方检索 | 公开前必须 |
| A-18 总签 | SIMULATED-DO-NOT-RELEASE | U 按台账自担（律师暂缓） | **永远不能由模拟放行** |

硬规则：模拟审查只用于压力测试/工程演练；**任何对外文件、商店页、客服话术不得引用模拟结论**；不得把“模拟已清”写进 release notes。

## 5. 预算/时间估算（**非承诺，±50%，以报价为准**）

| 路径 | 工程人日 | 外部等待 | 现金估算 | 备注 |
|---|---|---|---|---|
| A 私域 beta | 5–8 | 0（仅本机 Windows 构建） | ¥0（自有人力） | 2 周内可出首包，前提：并行改动收口+旧产物隔离 |
| B 公开免费 | 10–20+律师审 3–5 人日 | 律师 1–2 周；TTS/CC0 权利人回复不定 | 律师 ¥5k–30k；商标初检 ¥1k–3k；证书 ¥600–1000/年（可选） | 3–6 周；签名/SmartScreen 另行 |
| C 收费/商店 | 15–30（含重许可/商店/updater/i18n） | 主体 1–2 周；证书 1–3 工作日；商店审核数个工作日 | 商店 $100/款；证书 ¥600–2200/年；律师/商业许可 ¥1 万+；替换素材另计 | 6–12 周；不含美术返工/Win10 实机 |

## 6. 验收命令（本机可复跑；Windows 段见 RUNBOOK §3）

```sh
node scripts/legal-check.mjs                 # beta 基线：WARN-ONLY；公开/收费要求 strict=0
node scripts/legal-check.mjs --sync          # 法务文本变更后（owner 批准；写 public/legal）
node scripts/legal-check.mjs --strict        # 目标：exit 0（否则按 §7 停止）
npm run version:check && npx tsc --noEmit && npm test     # 当前 6/6 mirror、0 error、779/779
npm run fci:validate && npm run build                     # 构建内含 legal package guard
node scripts/bake-voice.mjs --verify                      # 42/42 WAV bytes/sha/duration
node scripts/embed-ai-labels.mjs --check                  # 49/49 PNG tEXt；pixelUnchanged=true
# Windows（cmd.exe；构建脚本硬编码 D:\Projects\dsh\desktop-games）
cmd.exe /c scripts\build-tauri-win.bat && cmd.exe /c scripts\bundle-tauri-nsis-win.bat
node scripts/release-win.mjs --all --strict && node scripts/release-win.mjs --verify
python3 -m zipfile -l artifacts/DesktopGames-0.2.0-beta.1-portable.zip   # 含 legal/ + 根声明
sha256sum -c artifacts/SHA256SUMS.txt
# 实机：安装→许可页→$INSTDIR 资源清单→首启 TOS→/legal/ 链接→卸载残留→0 未列 WAV
```

## 7. 风险 / 停止条件（出现即暂停，不得带病发布）

| # | 风险/信号 | 动作 |
|---|---|---|
| 1 | 旧 11-14 产物出现在渠道 / `release-win` 把旧包判 ok | 立即隔离、重发；旧哈希列入黑名单 |
| 2 | 工作树 dirty 或并行改动未收口（`BUILD-INFO.provenance.dirty=true`） | 不在 dirty 树构建；证据无效，重建 |
| 3 | `legal-check --strict` ≠0 且无 U 签字例外 | 公开/收费 STOP；私域 beta 仅 U 书面接受 |
| 4 | 42 WAV 无渠道所需许可（公开/收费） | STOP；移除音频或换自录/已授权音源 |
| 5 | AI 标识不达标（8px/2.17:1、无音频首播/导出标识） | 公开/收费 STOP（A-16 未闭） |
| 6 | 名称/商标未检索即用于公开分发 | 公开/收费 STOP；定名后重打包装 |
| 7 | 无生效隐私政策 / ASR 无会话前独立同意（公开/收费） | STOP；私域 beta 至少 ASR 默认不启用且拒绝不录音 |
| 8 | 权利投诉/下架通知/DeepSeek 异议 | 冻结下载、保留证据、按 TAKEDOWN 内部目标时限回应 |
| 9 | 安全事件（哈希不符/样本被篡改/隐私泄露） | 撤回链接+公告+通知测试者+复盘；新包重签 |
| 10 | 构建不可复现 / 包内 WAV 与 manifest 不符 / 许可页缺失 | 不发布；先修构建链 |

## 8. 边界

本方案不改代码/资产、不执行 git/构建/API；所有金额/工期为估算；不构成法律意见；不替代 APPROVALS 真实签字。下一步=U 先签 A-08/A-18 并决定 42 WAV 渠道处置，再由 E/W 执行 §3。
