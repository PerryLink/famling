# 03 · 知识产权 / 开源 / 商业许可 / 商标审查（2026-11-17）

> 审查员：legal-ip-license（IP/开源/商业许可/商标线）。**只读审计，只新建本文件**；未改其他文件、未 git、未调 API。**非律师意见**；外部事实（GitHub 公开仓、Pixiv 原帖、供应商条款原文）本机不可核，标“未核验”。
> 范围：`ASSET-LICENSES.md`、`AI-PROVENANCE.md`、`LICENSE-ART`、`NOTICE`、`DECLARATIONS.md`、根 `README.md`、`LICENSE`/`LICENSE-COMMERCIAL.md`、`public/**` manifest 与 `characters/*.json`、`packs/**`、`art/assets.csv`、`art/specs`、`docs/legal/**`、`scripts/{legal-check,release-win,export-public-pet}.mjs`、`app/tauri/src-tauri/tauri.conf.json`、`dist/`、`artifacts/`。
> 基线：2026-11-17 15:55–17:05 CST 工作树；同目录 01/02/04/05/06 为并行线，本文不重复其细节。

## 0. 结论速览

1. **美术许可链无生效文本**：`LICENSE-ART:3` 为“项目声明、非律师意见”，`NOTICE:7` 标 DRAFT，`docs/legal/README.md:31` R4 规定 DRAFT 期美术“保留所有权利、不得对外发放”；但 `README.md:192`、`DECLARATIONS.md:38`、`ASSET-LICENSES.md:3-5` 已宣称 CC BY-NC-SA 4.0。三口径并存 ⇒ 公开分发/付费上架均阻断。
2. **代码许可本身有效**（`LICENSE` PolyForm NC 1.0.0，`package.json` 同），但 `NOTICE`（含 Required Notice）仍 DRAFT ⇒ PolyForm 的通知链未按正式文本闭合（`docs/verification/LEGAL-DECLARATIONS-CHECK-2026-11-15.md:70` 同类风险）。
3. **工程登记大体齐、局部不完整**：UI 91/97 完整（97/97 sha 本机 MATCH）；256 49/49 文件在盘，但 manifest 引用 `frame-map.json`/`attachments/**` 均缺失、无逐文件 sha/许可 ⇒ 登记不完整。详见 §4。
4. **TTS 未清权且旧产物已含**：`artifacts/portable/DesktopGames.exe`（14,964,224B，2026-11-14；zip 内 exe 同尺寸）实测含 `assets/voice`×19、`stella`×2、`fold_a.wav` ⇒ 现存便携包/zip 已在分发未清权 AI 语音；18 WAV 条款未确认，`public/assets/voice/pet/manifest.json` 无 license/ai/provenance 字段。
5. **商标/非官方**：NOTICE/DECLARATIONS/APP-DISCLOSURE/pet.html 的“非官方、不关联 DeepSeek”已具备；但 `Pagefold`/`折角`/`DesktopGames` 已进 UI 与安装器，而产品名未定、未检索，`Orca` 明令禁用（42 类 37783319）。定名前不得公开/上架。
6. 下表 P0 全部【阻断】；归属：`【工程】`=写文档/代码/门禁可补且不改权利；`【律师/权利人/用户】`=必须外部书面确认。

## 1. P0 — 发布/公开前必须（未清不得公开、上架、收费）

| # | 问题与证据 | 建议 / 归属 |
|---|---|---|
| P0-1 | **美术许可未生效 × 三口径**：`LICENSE-ART:3`（项目声明）/`NOTICE:7`（DRAFT）/`docs/legal/README.md:31`（R4 保留所有权利）vs `README.md:192`、`DECLARATIONS.md:38`、`ASSET-LICENSES.md:3-5`（已宣称 CC BY-NC-SA 4.0）；`PUBLIC-REPO-2026-11-16.md` 还称已导出公开仓。 | 二选一后统一：①律师定稿 LICENSE-ART/NOTICE、去 DRAFT、写生效日期/主体；②未定稿前公开仓/发布物一律移除美术或保持 private。**〔律师+用户；工程同步改文案〕** |
| P0-2 | **TTS 18 WAV 再分发未确认 + 旧产物已含**：`AI-PROVENANCE.md:118-131`、`THIRD-PARTY.md:29-68`、`NOTICE:107-113` 均为“未确认/不随包”；但 18 WAV 仍在仓 `public/assets/voice/pet/`（18+manifest；`THIRD-PARTY.md:35` 记为 git 跟踪）；旧 `artifacts/portable/DesktopGames.exe` 及其 zip 内 exe 实测内嵌语音文件串（见 §0.4）；voice manifest 每行仅 id/text/file。 | 隔离/删除旧 artifacts 与 zip；WAV 从 `public/` 移出或替换；manifest 补 license/ai/来源/sha；条款确认后记录版本+日期+URL。**〔律师/上游；工程清理+门禁〕** |
| P0-3 | **发行包缺署名/许可/第三方通告**：`tauri.conf.json:37-43` 仅 LICENSE/NOTICE/DECLARATIONS/LICENSE-COMMERCIAL 四份；`node scripts/legal-check.mjs` 实测 `artifacts/portable/` 仅 exe/README/packs/run-*.cmd，缺 LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/ASSET-LICENSES（16 warnings 之一）；全仓无 `licenses/`、无传递依赖清单（`THIRD-PARTY.md:124-160` 仅直接依赖），`dist/assets/esm-*.js` 含 Sentry、dist 含 pixi 等第三方 JS。 | 发行 resources/portable/NSIS 加全部许可文件 + `licenses/`（npm license-checker + Rust cargo license/deny）+ ASSET-LICENSES；legal-check 增加“包内容断言”。**〔工程〕** |
| P0-4 | **Pearl/溟月链占位仍随包且无上游署名**：`public/assets/pet/pearl-placeholder/` 37 文件在仓、`dist/assets/pet/pearl-placeholder/` 已生成；`NOTICE:116-139` 自认“37 files tracked… must be removed or replaced before any public release”；上游权利链见 `docs/PEARL-ART-LICENSE-CHAIN-2026-11-14.md:1-20`（上善无形→ZipZipPipe→世界猫…，CC BY-NC-SA 4.0 需署名链），而 `CREDITS.md:27` 仅写许可、无上游作者，`pearl-placeholder/manifest.json:102` 写 placeholder-only。 | 构建/导出/安装包 deny-list 排除 Pearl；或取得授权并补完整 TASL/NC-SA 文本与上游署名链；商业版永不含。**〔工程+权利人/律师〕** |
| P0-5 | **AI 标识未落地（许可之外的法定披露义务）**：`AI-PROVENANCE.md:221-223`、`AI-CONTENT-POLICY.md:21,48` 要求显式+隐式（角标 + PNG tEXt/XMP/C2PA）；实测仓内无 C2PA/XMP/tEXt 写入代码（grep scripts/src = 0 命中）；`public/assets/pet/tinglan-256/*.png` 无 tEXt（PIL info 空）；49 张 AI 概念与 Orca 图均无图片级 AI 标识（UI 为 ai:none，无需 AI 标识但仍是 placeholder）。 | 发布前逐图加“AI 生成”角标+元数据（工具/模型/日期），TTS 播放/导出加 AI 语音标识，商店页 AI 申报；细节见 01 线。**〔工程+律师措辞〕** |
| P0-6 | **Pixiv CC0 声明不可核**：`ASSET-LICENSES.md:3-5,17-22`、`LICENSE-ART:44-46` 仅给用户 URL `pixiv.net/users/131049875` 与“作者声明部分汀岚素材 CC0”，无逐文件帖子/日期/文件清单；全仓 20 份 md 引用该声明但 0 份可核证据。CC0 不可撤回、也不能再被 NC-SA 限制；若声明非作者本人则属第三方入站素材。 | 权利人提供逐文件 URL+日期+清单并按 `CC0-1.0` 逐文件标注；不能证明的不导入/不发布；删除未证的“已声明”表述。**〔权利人/律师〕** |
| P0-7 | **商标未检索即已用于产物**：`pet.html:10` title=`Pagefold`、`:56` 宠物名=`折角`、`src/pet/consent/terms.ts:33` TOS=`Pagefold / 汀岚`、`tauri.conf.json:3` `productName=DesktopGames`；`TRADEMARK-AND-NAMING-POLICY.md:10-14` 明确产品名未定、Pagefold/Famling 有风险、`Orca` 42 类在先注册（37783319）不得作产品名；`REPO-LICENSING-SPLIT-2026-11-16.md:187` 另列 pagefold/折角 9 类 36832464。 | 先定名+官方检索+律师意见，再统一 UI/安装器/商店/声明；`Orca` 仅内部代号，Pagefold/折角/DesktopGames/Famling 不对外作商标使用。**〔用户/律师+工程〕** |
| P0-8 | **AI 供应商输出权利未确认**：`AI-PROVENANCE.md:21-31,62-82` 记录 OpenRouter Images API（`openai/gpt-image-2.6-sunburst`）但无条款版本/日期/商用与再分发结论；DeepSeek TTS 见 `TTS-TERMS.md:40-44`；`AUDIT-LEGAL-RELEASE-2026-11-16.md:90` H1 指平台协议输出定义未列音频、§4.2 不构成声音再分发的明示许可。 | 记录 provider/条款版本/日期/URL/结论；商业或公开素材仅用“已确认可商用且可再分发”的输出。**〔律师/上游〕** |
| P0-9 | **原创性/相似性未清（G2）**：`LEGAL-STATUS-2026-11-15.md:161` R2 标“未缓解（P0）”（Orca 与溟月链/ref10/官方形象混淆）；`PEARL-ART-LICENSE-CHAIN-2026-11-14.md:1-20` 证明鲸鱼娘链他人在先（上善无形 CC BY-NC-SA）；`AI-PROVENANCE.md:104-116` Pearl 草稿曾用无授权 ref10 上传 OpenRouter（仅内部）。 | 公开/宣发前做图像相似性比对（反向图搜+人工）+ 律师意见；若认定改编自该链则只能 NC-SA 并保留完整署名链。**〔律师/美术〕** |
| P0-10 | **公开仓/导出未核却已声称导出**：`README.md:192`、`DECLARATIONS.md:7`、`PUBLIC-REPO-2026-11-16.md` 称 `PerryLink/tinglan` 公开仓仅为角色/素材子集；`scripts/export-public-pet.mjs:22-40` 的 dirs 含 `public/assets/pet`（即 Pearl 37 + tinglan-256 AI 49），files 含 ASSET-LICENSES；本机无网络/API，公开仓实际内容**未核验**。 | 若已公开 = 分发 Pearl/DRAFT 美术/AI 概念/CC0 未证素材；先下线或按 P0-1/4/5/6 重建导出（加 deny-list 与 AI/许可状态字段）。**〔用户/工程（外部）〕** |

## 2. P1 — 应修（公开前；部分可先公开低风险子集）

| # | 问题与证据 | 建议 / 归属 |
|---|---|---|
| P1-1 | **256 登记不完整**：`tinglan-256/manifest.json:169-233` 列 49 文件名但无逐文件 sha/license/ai；`:220-223` 引用 `frame-map.json`、`attachments/attachment-anchors.json`、7 附件均**不在 public 包**（实测 MISSING）；`:275-280` integrity 依赖上述哈希文件；gate 49/49 证据在 gitignored `art/_placeholder/…`（`AI-PROVENANCE.md:237`、`ASSET-LICENSES.md:30`）；`characters/tinglan-256/character.json:45` 写 CC-BY-NC-SA vs `:233` placeholder-only。 | 补/移除 frame-map 与 attachments；加逐文件 sha+SPDX+ai{tool,date}；许可状态统一；把 gate/frame-map 纳入可分发证据或写明“仓外不可核”。**〔工程〕** |
| P1-2 | **UI 91/97 登记完整但许可非 SPDX**：`ui/manifest.json` 97 fileIndex/97 文件、本机重算 sha 全 MATCH；但 `:83-90` `license.spdx="NONE"`、逐资产 `license="placeholder-only"`（91/91），`:15` `generatorSha256=""`；`THIRD-PARTY-AND-CREDITS-POLICY.md:13` 要求 SPDX。 | 改 `LicenseRef-Placeholder` 或定稿后 CC-BY-NC-SA；补 generator sha；决定是否纳入公开导出（export 的 dirs 未含 `public/assets/ui`）。**〔工程〕** |
| P1-3 | **ASSET-LICENSES 未接入法务体系**：`ASSET-LICENSES.md` 未出现在 `NOTICE`、`DECLARATIONS.md`、`docs/legal/README.md` 索引、`DECLARATION-MATRIX`、`legal-check.mjs:21-33` required、`release-win.mjs:39-49` LICENSE_FILES；仅 `README.md:193` 一处引用。 | 纳入索引/声明入口/发行包/gate required 列表，否则“唯一资产许可台账”不可见。**〔工程〕** |
| P1-4 | **CC BY 4.0 残留 + TBD 台账**：`THIRD-PARTY.md:175` 仍建议“Orca 相关 = CC BY 4.0 草案”（会允许商用，与 NC-SA 决定冲突）；`art/assets.csv:2-7` 6 行 `license=TBD`、7 行 placeholder-only 非 SPDX；`art/specs/*.json` 6 份 `license:"TBD"`。 | 改 NC-BY-NC-SA-4.0/placeholder LicenseRef；清零 TBD 并补 source_sha；旧 CC BY 4.0 文本标注过期。**〔工程〕** |
| P1-5 | **manifest license/ai 不一致**：`cat/dog/pearl-placeholder/manifest.json:102` 均 placeholder-only“commercial use not granted”，而 `characters/{pet-cat,pet-dog}/character.json:41` 写 CC-BY-NC-SA-4.0；AI-PROV/ASSET-LICENSES 未逐文件映射。 | 统一 SPDX + ai{status,tool,date,disclosure}；ASSET-LICENSES 与 manifest 双向对账。**〔工程〕** |
| P1-6 | **CREDITS/THIRD-PARTY 为 11-15 快照**：`CREDITS.md:6` DRAFT、`:88` Tauri 图标来源 TBD、`:89` 仍称 `.rustup-win/rustup-init.exe` 被跟踪（本机该目录已不存在）、`:95` 称“无跟踪 Orca 图”（现 `public/assets/pet/tinglan-256` 已跟踪）；`THIRD-PARTY.md:111-122` 同类。 | 更新到 11-17 实况；发布前记录 Tauri/UI 图标来源与替换动作。**〔工程〕** |
| P1-7 | **角色包元数据不满足自家 DLC/CC 要求**：包内仅 `character.json`+`behavior.json`（仅 tinglan 有 README），无 `LICENSE.txt`/`NOTICE.txt`（`DLC-AND-PLUGIN-TERMS.md` §3B 要求）；`character.json:47` 等 `meta.authors=["Famling"]` 非版权人 PerryLink；`content/schema/character-0.3.schema.json:8-18` required 不含 license/ai（仅 251/266 可选），无 author/credits/basedOn。 | 包内补 README/LICENSE/NOTICE；authors 改 PerryLink；schema 把 license/ai/author/source 列为 required（含 v0.1/v0.2）。**〔工程〕** |
| P1-8 | **第一方内容包/DLC 无许可字段**：`packs/farm-seasons/manifest.json`、`packs/reef-pack/manifest.json` 仅 content/files 等，无 license/author/credits/ai；`DLC-AND-PLUGIN-TERMS.md` §5.4 明确第一方包同受 §3 约束；`verify-pack` 不校验这些字段（`AUDIT-LEGAL-RELEASE-2026-11-16.md:45`）。 | 补字段并纳入 verify-pack；明确“专有内容”声明，避免免费 pet 安装包顺带分发付费 DLC 数据（商业边界）。**〔工程+商业〕** |
| P1-9 | **AI provenance 不足以支撑“人类智力投入”**：Orca prompt 原文未落盘（`AI-PROVENANCE.md:137` 缺口 1）；像素化/调色脚本多处 gitignored（`:96,143`）；256 gate/pearl-fix 证据仅在 gitignored 目录（`:237`、`docs/art/TINGLAN-256-ANCHOR-FINAL-2026-11-17.md:85`）。 | 归档 prompt 原文+sha（无 key/隐私）与 gate JSON 进仓；“不可恢复”如实标注；发布物附 provenance 摘要。**〔工程〕** |
| P1-10 | **商业/NC 法务结论未定且文档绝对化**：`ASSET-LICENSES.md:22` 称“CC BY-NC-SA 美术不能进付费包”；但权利人本人是 licensor，可对自有作品另授权（CC §6c）；真实阻断是 AI 可版权性、CC0、Pearl、TTS、第三方与商标。付费 DLC/mod 另见 `DLC-AND-PLUGIN-TERMS.md` §6.5（须书面协议）、`FANWORK-POLICY.md:74` 未决（商业二创边界）；第三方 mod 若含 NC-SA 美术不得收费。 | 律师就“自有美术双许可/清权路径、第三方付费 DLC/mod、AI 输出能否被许可与执行”出结论；文档随之改写。**〔律师/用户〕** |
| P1-11 | **UGC/导入权利声明不足**：`import-character` 强制 license/ai，但不要求 author/联系方式/素材来源；导入页无权利声明勾选（`AUDIT-LEGAL-RELEASE-2026-11-16.md:152`）。 | 增加“本人有权/已获授权”勾选与 author/source/contact 字段；拒绝不明许可包（与 DLC §3 一致）。**〔工程+律师〕** |
| P1-12 | **用户协议/声明未覆盖许可与归属**：`docs/legal/TOS.md` 无 IP/许可/归属条款指向 `LICENSE`/`LICENSE-ART`/`CREDITS`（grep 无“许可/CC BY”实体条款）；About 未接许可清单入口（06 线 P0-3）。 | TOS 增“许可与归属”节（代码/美术/第三方/AI）；About 常驻许可入口。**〔工程+律师〕** |

## 3. P2 — 后续完善（不阻断低风险公开）

| # | 问题与证据 | 建议 / 归属 |
|---|---|---|
| P2-1 | 无 `LICENSES/`+`REUSE.toml`，`LICENSE`/`LICENSE-ART` 无 SPDX 头；GitHub 许可识别长期 NOASSERTION（`REPO-LICENSING-SPLIT-2026-11-16.md:196`）。 | 加机器可读许可映射（PolyForm NC、CC-BY-NC-SA-4.0、LicenseRef-placeholder）。**〔工程〕** |
| P2-2 | **出口/制裁**：全仓无出口管制/制裁/地区限制声明；应用含 Ed25519 签名校验（`native/dlc-verify`）与 rustls TLS。 | 上架前加“标准密码学/大众市场”说明，律师核 EAR/中国技术出口与平台地区限制。**〔律师+工程〕** |
| P2-3 | **AI 部分 © 表述过宽**：`CREDITS.md:35,42`、`LICENSE-ART:4` 以“© 2026 PerryLink / CC BY-NC-SA”覆盖可能无版权的 AI 输出部分。 | 限定“人类创作部分/许可意向；AI 生成部分权利主张受限”，不承诺可执行性（与 `LICENSE-ART:54` 一致）。**〔律师〕** |
| P2-4 | Tauri 图标来源 TBD：`app/tauri/src-tauri/icons/icon.{png,ico}`（`CREDITS.md:88`、`THIRD-PARTY.md:116`），旧笑脸占位来源未记录。 | 发布前替换为项目自产 U-ICON-04 并登记来源/sha；非自绘则替换。**〔工程〕** |
| P2-5 | 字体与 SDK 边界：字体 0 个打包（`THIRD-PARTY.md:105-109`；无 `@font-face`），系统栈含 Microsoft YaHei；Steamworks SDK 未入库（`NOTICE:104-105`）。 | 保持不嵌入系统字体；发布 gate 增加“无 Steamworks SDK/无字体二进制”断言。**〔工程〕** |
| P2-6 | `docs/legal/README.md:49` 索引称“17 个”但未列新增 TOS/SAFETY（目录现 19 项）。 | 更新索引与分工说明。**〔工程〕** |
| P2-7 | `dist/`/`artifacts/` 虽 gitignored 但存在且含未清权素材；`npm run build` 会重新复制 Pearl/256/UI（`vite.config.ts` 只排除 TTS，见 `:3-22`）。 | 发布脚本从 clean build + deny-list 扫描（pearl/tinglan-256/voice/refs）；old artifacts 不作为证据。**〔工程〕** |
| P2-8 | 全局 `art/assets.csv` 仅 13 行，未汇入 UI 91/256 49（以 manifest 为 registry）；双台账易漂移。 | 明确“全局台账 vs 资产 manifest”分工并加 CI 对账，或合并单一 registry。**〔工程〕** |

## 4. 登记完整性（问题 3 的回答：97 UI / 49 256）

- **UI 91（97 物理）— 完整**：`public/assets/ui/manifest.json` 97 fileIndex 与 97 文件一一对应，本机重算 **97/97 sha256 MATCH**；磁盘 96 PNG + 1 ICO + manifest + MAPPING = 99 文件；MAPPING/生成报告/tests 口径一致（91 逻辑/97 物理）。缺：`generation.generatorSha256` 为空、license 非 SPDX、未进公开导出 dirs。
- **256 49 — 文件齐、登记不完整**：49 PNG 与 `manifest.assets` 一致；但 `frame-map.json`、`attachments/attachment-anchors.json`、7 附件缺失，`integrity` 的 49 唯一哈希不可复核；无逐文件 license/ai；gate 49/49 证据在 gitignored 源目录。**发布前必须补齐或明确“仓外不可核”**。
- 其他登记：cat/dog/pearl 各 36 PNG+manifest（37 文件/包）✅；voice 18 WAV+manifest ✅（内容字段缺 license/ai）；characters 6 包仅 tinglan 有 README；packs 2 包无 license/author/ai。
- 结论：**“97 完整、49 部分完整”；UI 可直接作为登记样板，256 需按同标准补 per-file sha/SPDX/ai 后再对外。**

## 5. 声明/manifest 一致性矩阵（ASSET-LICENSES / AI-PROV / LICENSE-ART / NOTICE / DECLARATIONS / README）

| 项 | 状态 | 证据 |
|---|---|---|
| 代码 PolyForm NC | ✅ 一致（NOTICE 仍 DRAFT ⇒ Required Notice 未按终稿） | `LICENSE`、`package.json`、`NOTICE:14-27`、`DECLARATIONS.md:37`、`README.md:44` |
| 美术 CC BY-NC-SA 方向 | ✅ 方向一致 / ❌ 生效状态三口径 | `LICENSE-ART:3`、`docs/legal/README.md:31`（R4）、`README.md:192`、`DECLARATIONS.md:38`、`ASSET-LICENSES.md:3` |
| Pearl 链 | ❌ 冲突 | `NOTICE:116-139`（排除/不可再许可）vs `CREDITS.md:27`（写 CC BY-NC-SA）vs `LICENSE-ART:8-15` 范围未显式排除 Pearl |
| 256 manifest vs character | ❌ 冲突 | `tinglan-256/manifest.json:233`（placeholder-only）vs `characters/tinglan-256/character.json:45`（CC-BY-NC-SA） |
| CC BY 4.0 残留 | ❌ 冲突 | `THIRD-PARTY.md:175` vs 全仓 NC-SA 决定（`DECISIONS`/`LICENSE-ART`） |
| TTS 状态 | ✅ 文档一致“未确认不随包” / ⚠ 旧包已含 + manifest 无字段 | `NOTICE:107-113`、`AI-PROVENANCE.md:118-131`、`THIRD-PARTY.md:29-68`、`TTS-TERMS.md:40-44` |
| UI / AI 状态 | ✅ 一致（ai:none/无模型）+ ⚠ 许可非 SPDX | `ui/manifest.json:12,15,83-90`、`AI-PROVENANCE.md:238`、`ASSET-LICENSES.md:32` |
| 法务状态 canon | ❌ 事实错误 | `LEGAL-STATUS-2026-11-15.md:36,108-110` 写 CC BY-NC-SA “允许他人商业使用”并列出不存在的 `CC BY-NC-SA-NC/-SA` 变体；该文件被 `NOTICE:225` 引用 |

## 6. 商业/付费上架、NC、DLC/Mod、UGC、AI 声明、署名-SA、出口（结论）

- **付费上架：当前不可**。阻断项：P0-2 TTS、P0-4 Pearl、P0-5 AI 标识、P0-6 CC0、P0-7 商标、P0-8 供应商条款、P0-9 相似性、P0-3 发行包缺署名/依赖通告；AI 概念 `final:false`（256）不得当 final 售卖。
- **NC**：CC BY-NC-SA 的 NC 约束下游；权利人本人商业使用自有作品不受 NC 限制（可另授权，CC §6c）。官方文档“NC-SA 图不能进付费包”应改为“付费版需确认 AI/第三方/CC0/上游权利并另行授权自有美术”，由律师确认。
- **DLC/Mod**：收费 DLC 须书面协议（`DLC-AND-PLUGIN-TERMS.md` §6.5）；第三方 mod/DLC 含 NC-SA 美术不得收费（NC），须在 DLC 政策中明示并加 schema 校验；第一方 packs 缺许可字段（P1-8）。
- **UGC/二创**：非商业允许，但改编须 NC-SA + 完整署名链（SA 传染）；导入工具须补“有权/已授权”声明与 author/source 字段（P1-11）。
- **AI 声明**：显式+隐式标识、商店 AI 申报（Steam/Apple/Google）、EU AI Act 50 条（2026-08-02 起）；不得伪装真人手绘/录音；细节见 01 线。
- **署名-SA**：CC BY-NC-SA 要求 Title/Author/Source/License/Modified/AI 披露（CREDITS TASL 模板已备）；像素化/调色/二创均为改编，必须沿用 NC-SA 并保留上游署名。
- **出口**：无出口/制裁声明；Ed25519/TLS 属标准密码，非定制加密；国际上架前由律师核 EAR/中国技术出口/平台地区限制（P2-2）。

## 7. 归属划分：工程可补 vs 律师/权利人（发布前必须闭环）

- **工程可补（不改权利）**：发行包/portable 许可文件与 `licenses/`；ASSET-LICENSES 接入 NOTICE/DECLARATIONS/legal 索引/gate；manifest SPDX+sha+ai 字段；256 frame-map/attachments 修复；THIRD-PARTY/CREDITS 更新；AI 图片角标+元数据；build/导出 deny-list；schema required；旧 artifacts 隔离；TOS 许可章节。
- **需律师/权利人**：LICENSE-ART/NOTICE 定稿与生效判定（P0-1）；TTS 再分发（P0-2）；Pixiv CC0 清单与作者身份（P0-6）；Pearl 上游授权/署名（P0-4）；AI 供应商条款与 AI 可版权性（P0-8、P2-3）；相似性 G2（P0-9）；商标检索/定名（P0-7）；商业/双许可/DLC 合同（P1-10）；出口（P2-2）。
- **需用户拍板**：是否公开发布/收费/上架；公开仓范围与是否下线；产品名；CC0 与 NC-SA 的最终分发口径。

## 8. 证据与限制

- 本机实测：`node scripts/legal-check.mjs` → 16 warnings（8 份 DRAFT + 7 份 portable 缺失 + staging 过小）；UI manifest 97/97 sha 重算 MATCH；256 manifest 引用 `frame-map.json`/`attachments/**` 实测 MISSING；`artifacts/portable/DesktopGames.exe` 与 zip 内 exe（14,964,224B）字符串命中 `assets/voice`×19、`stella`、`fold_a.wav`；`grep -r "C2PA\|XMP\|tEXt" scripts src` = 0；`docs/LEGAL-STATUS-2026-11-15.md:36,108-110` 事实错误。
- 未核验（本机只读/无网络）：GitHub `PerryLink/tinglan` 实际内容；Pixiv 131049875 原帖；OpenRouter/OpenAI/DeepSeek 最新条款原文；Tauri/UI 图标来源。以上均需发布前外部复核。
- 本文件为审查记录，**非法律意见**、不构成“已审核/已合规/可发布”证据；与同目录 01/02/04/05/06 交叉引用，冲突处以各线最新证据为准。
