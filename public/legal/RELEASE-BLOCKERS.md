# 发布阻断清单（RELEASE-BLOCKERS）— 逐项、可验收 · DRAFT

> **2026-11-18 公开导出边界（本仓当前状态）**：本公开导出已按清理方案 A 移除全部预生成 TTS 音频（42 WAV + manifest）、游戏内容包（`packs/`）、DLC 校验链（`native/dlc-verify`）与未使用 kernel 模块；本导出**不随包分发任何音频 / DLC / 游戏基座**。下文历史统计（18/42 WAV、baked pack、随包授权等）保留作私有 mono-repo 的历史记录，**不代表本公开导出当前内容**；音频再分发条款仍为 TBD。

> **Status: DRAFT（engineering draft）· 2026-11-17 · 不是法律意见。**
> **2026-11-17 状态注记：用户已拍板年龄口径为全年龄、不设年龄门；原“年龄 18+ 口径/无年龄门”消费者阻断项已按该拍板更新文本层，律师项仍暂缓。**
> 本文把“发布前必须”落成**可勾选、可复验**的清单：gate 当前 16 条的具体内容、真实阻断（远多于 16）、安装包/portable 资源清单、旧产物清理、18 WAV/AI 标识/隐私政策/许可生效的放行条件。**全绿之前不得公开发布/上架/收费**；本文不改变任何代码/构建。
> 基线证据：`node scripts/legal-check.mjs --strict`（**exit 1，BLOCKED 16 blocker(s), 16 warning(s)**）；`node scripts/release-win.mjs --verify`（**exit 1，missing artifacts/SHA256SUMS.txt**）；`npm test` consent/p1 相关 **56/56 pass**（2026-11-17 抓取）。来源：`docs/legal/review-2026-11-17/06-release-ops-ui.md`（主）、01/02/03/05 线；[APPROVALS](/legal/APPROVALS.md) · CONSOLIDATED · PATCH-PLAN。

## 1. gate 当前 16 条（具体、可复现）

命令：`node scripts/legal-check.mjs --strict` → `BLOCKED (16 blocker(s), 16 warning(s))`，退出码 1。

**A. 8 条 DRAFT（文件仍含 `DRAFT` 标记）**：`NOTICE`、`CREDITS.md`、`THIRD-PARTY.md`、`AI-PROVENANCE.md`、`docs/legal/README.md`、`docs/legal/DECLARATION-MATRIX.md`、`SECURITY.md`、`TAKEDOWN.md`。
**B. 7 条 portable 缺件**（`artifacts/portable/` 存在时）：缺 `LICENSE`、`NOTICE`、`LICENSE-ART`、`CREDITS.md`、`THIRD-PARTY.md`、`AI-PROVENANCE.md`、`DECLARATIONS.md`。
**C. 1 条 staging 过小**：`artifacts/portable/` 仅 7 条目（`DesktopGames.exe` + README + packs + 3 个 run-*.cmd）→ “portable staging looks too small; rebuild after licence changes”。

## 2. 为什么“16”不能当验收

- 16 = 8(A) + 7(B) + 1(C)，且 `--strict` 把每条 warning 复制成 blocker（`legal-check.mjs:68-74`）→**重复计数**，不是 16 个独立问题。
- gate **盲区**（06 P0-4）：只扫 9 个文件；**不扫** `DECLARATIONS.md`（虽随 NSIS 资源）、`TOS.md`/`TTS-TERMS.md`/`PRIVACY.md`、HTML/UI、`public/` 18 WAV、`artifacts/` 产物、安装包资源清单、图片/音频标识、docs 链接；`INCLUDE_UNCLEARED_AUDIO=1` 可同时绕过 gate 与 vite 剔除；`release.yml` 在 build 前跑 gate（干净 checkout 上音频规则空跑）；`ci.yml` 无 legal 步骤。
- 结论：**gate 转绿是必要条件，不是合规证明**；本文件 §3 才是放行口径。

## 3. 真实发布阻断（与合并总表 R-P0 对应；全部须销项）

| 组 | 阻断 | 对应 | 放行条件 |
|---|---|---|---|
| 权利/许可 | 美术许可三口径未生效；Pearl 37 文件随仓；Pixiv CC0 不可核；AI 供应商条款 TBD；相似性 G2 未清 | R-P0-11/12/13/15/16 | A-04/A-06/A-10/A-11 签字；LICENSE-ART/NOTICE 去 DRAFT；Pearl deny-list 生效 |
| 音频 | 18 WAV 再分发未确认；旧包已内嵌；WAV 无 AI 元数据/音频标识 | R-P0-02 | §6 决策树完成 + 包内 0 未清权 WAV（全路径扫描） |
| AI 标识 | 2026-11-18 用户决定移除常驻 AI 角标（改为首启/About/TTS 流程提示）；无隐式元数据/导出标识/音频起始提示；显式标识“显著性”待律师复核；TOS 无方法样式；商店问卷未定 | R-P0-03 | [AI-LABELING](./AI-LABELING.md) §8 全勾 + A-16 + 律师确认 |
| 隐私 | 无生效隐私政策；ASR 无告知/同意/开关/配额；无撤回/全清；第三方/跨境不具体 | R-P0-04/05/06/07 | [PRIVACY](/legal/PRIVACY.md) §16 全勾 + A-05/A-13 |
| 消费者/未成年人 | 年龄口径**已拍板全年龄、不设年龄门**（2026-11-17，无年龄识别/未成年人模式须如实披露）；roleplay 文案已改全年龄并可如实说明仅本地模板；消费者条款缺失；投诉通道不足 | R-P0-01/08/09/10 | [CONSUMER-MINORS-HEALTH](/legal/CONSUMER-MINORS-HEALTH.md) §3/§4/§6 落地 + A-14（文本层已解，律师项仍暂缓） |
| 内容安全 | 零容忍漏放+空格绕过；审核零留痕 | R-P0-20/21 | 红线回归全绿 + 最小审核审计（不存原文） |
| 包/安装器 | portabe/zip 0 声明；安装器无 licensePage、资源不齐；docs 链接 404 | R-P0-18/19 | §4 清单齐 + 实机安装核验 + 链接可达 |
| 商标/名称 | Pagefold/折角/DesktopGames 未清即用 | R-P0-14 | A-09 定名+检索 |
| 条件触发 | 安全评估/算法备案/商店核验/7×24 | R-P0-23 | 触发即先完赛再发（见 §10） |

## 4. 发行包资源清单（安装包 resources + portable + zip 必须含）

根许可/声明（9）：`LICENSE` · `NOTICE` · `LICENSE-ART` · `LICENSE-COMMERCIAL.md` · `CREDITS.md` · `THIRD-PARTY.md` · `AI-PROVENANCE.md` · `DECLARATIONS.md` · `ASSET-LICENSES.md`
法务文本（至少 6）：`docs/legal/TOS.md`（与 `terms.ts` 同步哈希）· `TTS-TERMS.md` · `AI-CONTENT-POLICY.md` · `PRIVACY.md`（草案状态如实）· `TAKEDOWN-AND-REPORTING.md` · `SECURITY-AND-PRIVACY.md`
可选/后续：`docs/legal/AI-LABELING.md`、`CONTENT-POLICY.md`、`LEGAL-BASELINE.md`、`LICENSES/`（npm/Rust 传递依赖许可，当前**不存在**）。
[现状] `tauri.conf.json:34-44` 仅 `packs/` + LICENSE/NOTICE/DECLARATIONS.md/LICENSE-COMMERCIAL.md（4 份声明）；无 `bundle.licenseFile`；NSIS `LICENSE ""`、资源段为空；portable 7 条目 0 声明；zip 14 条目 0 声明。安装器/包**必须**按上表补齐并在 HEAD 重新构建（11-14 旧安装器早于 11-17 配置改动，不可用）。

## 5. 旧 artifacts / 工作区清理（发布前必须）

- 删除或移出仓库工作区（不进任何渠道/不共享）：`artifacts/DesktopGames-0.1.0-portable.zip`（11-14 14:44，6.6 MB，14 条目 0 许可；内嵌 exe 14,964,224 B，strings 命中 `assets/voice`×19、`stella`×2、`fold_a.wav`）；`artifacts/portable/`（旧 exe+README+packs+3 cmd）；`artifacts/bundle/nsis/*`（11-14 setup.exe + 同刻 nsi，无 licensePage）；`artifacts/playtest-kit/`（原样复制旧 zip）；`artifacts/` 中 941 个 `cdp-*` browser profile、38 个 pilot WAV（18+10+10）、11-11~11-15 旧包。
- `.keys/dev-private.pem` 仅本地（gitignored）：不得进任何包/截图/共享目录；dev 公钥签名的 pack 不得表述为“signed”生产包。
- 只允许：`npm run build → tauri build → release-win --all --strict` 产出的 HEAD 产物；`SHA256SUMS.txt` + `RELEASE-MANIFEST.json` 必须存在；playtest kit 从新构建取件。
- 构建 deny-list 必须覆盖：`pearl-placeholder/`、`tinglan-256/`（非 final 且逐文件证据不全时）、`public/assets/voice/pet/*.wav`、`art/_placeholder/refs/`、`.keys/`、旧 `artifacts/`。

## 6. 18 WAV 处置决策树（A-04 前提）

1. **取得 DeepSeek 书面结论**（商用 + 再分发 + 署名/限制，版本+日期+URL）→ 给 WAV 加 AI 元数据/来源字段 + 音频层标识 + 播放器标签 + 发布清单 → 可随包（仍须 AI 标识 A-16）。
2. **无法取得** → 发布前全部替换为自录/已授权音源（并登记 ASSET-LICENSES/THIRD-PARTY），或从所有渠道移除（保留 baked/system 本地语音路径，注意 `voice-mode` 文案与实际 404 不一致）。
3. 无论哪种：删除/重建旧 dist 与安装包；全路径扫描“无未清权音频”；**不提供去标识**。

## 7. AI 标识放行检查（对应 A-16）

- [ ] 显式标识方案经律师确认（用户 2026-11-18 决定不做常驻角标；若律师认为流程提示不足，需恢复可感知常驻标识）；[ ] 图片角落“AI 生成”+ 元数据；[ ] 音频播放器“AI 语音·合成”+ 首播提示；[ ] 导出音频/图带显式+隐式标识；[ ] TOS 有标识方法/样式节；[ ] 商店 AI 问卷“预生成/实时”分列；[ ] 发布图/音频逐件登记 provenance；[ ] 包内 `ai.status` 不伪造。

## 8. 隐私政策放行检查（对应 A-13）

- [ ] `PRIVACY.md` 去 DRAFT（律师定稿 + 主体/生效日期）；[ ] About/首启/商店页入口可达（非 404）；[ ] ASR 告知/单独同意/开关/配额（或发布版关闭云 ASR）；[ ] 撤回同意 + 删除全部本地数据 + 卸载说明；[ ] TTS/ASR 第三方 DeepSeek 与跨境具体披露；[ ] 未成年人条款与年龄口径一致；[ ] 安全事件通知承诺；[ ] 联系方式与投诉渠道常驻。

## 9. 许可/署名放行检查（对应 A-04/A-10/A-11）

- [ ] `LICENSE-ART`/`NOTICE` 去 DRAFT，写生效日期/主体/范围与排除项（Pearl/256 非 final/CC0 未证/未清权音频/Orca 商标不授权）；[ ] `ASSET-LICENSES.md` 纳入 NOTICE/DECLARATIONS/docs 索引/发行包/legal-check required；[ ] 每张发布图 TASL 署名（Title/Author/Source/License/Modified/AI 披露）；[ ] Pearl deny-list 生效且上游署名链未清前不发布；[ ] Pixiv CC0 逐文件 URL/日期/清单；[ ] UI 91/256 49 的 SPDX+逐文件 sha+ai 字段；[ ] 第一方 packs 补 license/author/credits/ai；[ ] 旧 `CC BY 4.0` 残留标注过期。

## 10. 条件触发（出现即升级 P0，先完赛再发）

官方云 LLM/云记忆、roleplay 上线、收费、商店上架、UGC 角色市场、注册 100 万/月活 10 万 → 先完成：安全评估、算法备案、投诉处置、未成年人模式、人工升级能力、商店核验；个人单机形态无法履行，须先拍板“本地免费工具”或“合规运营”（R-P0-23/A-18）。

## 11. 发布命令序列与验收（本机可复验）

1. `node scripts/legal-check.mjs`（构建前，仅记录）；2. `npm test` + `npm run typecheck`；3. `npm run build`；4. Tauri build；5. `node scripts/legal-check.mjs --strict`（构建后复跑，expected 0）；6. `node scripts/release-win.mjs --all --strict`；7. `node scripts/release-win.mjs --verify`（expected 0，SHA256SUMS 存在）；8. 实机安装/卸载核验：`$INSTDIR` 资源清单、许可页、About 联系方式/隐私/许可入口、法务链接可达、无未清权音频；9. 证据绑定 commit + exe sha + 日期，写入发布记录。
- 注意：CI `release.yml` 顺序正确但从未跑过（RUNBOOK §7 #1）；没有代码签名证书（外部，OV 1–2 周）→ v1 明示 unsigned/SmartScreen。

## 12. 本文件覆盖不到（必须外部闭环）

同 CONSOLIDATED §4：TTS 再分发、Pixiv CC0 逐文件、Pearl 上游署名、AI 供应商条款、商标检索、相似性、律师意见、备案/评估/商店核验、发行包签名/真实构建（证书/实机环境）。

## 13. 验收记录模板

```text
[日期] [commit] [exe sha256] [zip sha256]
legal-check --strict = 0；release-win --verify = 0；npm test = __/__
安装包资源清单：__/__（缺失：__）
未清权音频扫描：0（路径：__）；AI 标识：__；隐私政策入口：__；许可页：__
实机核验人/环境：__；残留风险：__
```
