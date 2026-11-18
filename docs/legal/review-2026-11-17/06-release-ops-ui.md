# 06 · 发布运营 / 安装包 / 法务文案一致性与可访问性审查（2026-11-17）

> **审查员**：legal-release-ops（发布运营/安装包/法务文案一致性/可访问性审查线）。**只读审计，只新建本文件**；未改其他文件、未执行 git、未调业务 API。非律师意见，不构成法律意见。
> **范围**：`scripts/legal-check.mjs`、`scripts/release-win.mjs`、Tauri `resources`/NSIS、`dist/` 与 `artifacts/`、应用内实际文案（pet/setup/chat-import/About/TTS/DLC/首启 TOS/2h）、`docs/legal/APP-DISCLOSURE-TEXTS.md`、TOS/TTS 条款、`src/pet/consent/*`。
> **基线**：`<private-path>`，快照 2026-11-17 17:00 CST；工作树有并行写入（`review-2026-11-17/01,02,04,05` 非本线）。证据为仓库内实测与行号，引用前请复测。

## 0. 结论（TL;DR）

1. 门禁真的会红（exit 1），但 **16 blockers ≠ 16 个独立问题**：= 8×DRAFT + 7×便携缺失 + 1×staging 过小，每条 warning 再被复制成 release blocker（`legal-check.mjs:43-66,70`）。
2. **现存 Windows 产物不能发布**：便携 zip 0 声明文件，内嵌 exe 含未清权 18 个 TTS WAV；playtest kit 原样复制该 zip（P0-1）。
3. **安装包声明不完整且当前安装器未真正带资源**：NSIS 无 license page（`installer.nsi:41,168-170`），`bundle.resources` 仅 4 份且 11-17 改动后从未构建；缺 LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/TOS/隐私（P0-2）。
4. **应用内法务链接在打包版全部 404**：`/docs/legal/*`、`/docs/research/*` 不在 `dist/`、不在 Tauri 资源；About 也没有许可清单/联系方式（P0-3、P1-3）。
5. **双 canon 漂移**：`APP-DISCLOSURE-TEXTS.md` R1–R7 与运行时 `terms.ts`/实现不一致（首启 1 屏 vs 15 节 TOS；TTS 短确认 vs 完整声明；`dlc.pack-load` 从未调用）（P1-1）。
6. **EULA 记录/版本升级/TTS 独立确认/无暗黑模式实测通过**（56/56 consent 测试）：接受记录 pin 版本+哈希、升级/哈希不符重弹、拒否进只读、勾选+按钮才同意、Escape=拒绝、焦点陷阱+inert；**缺"撤回同意"入口**（P1-3，法务/外部）。
7. **可访问性不达标**：常驻 AI 角标 8px、最差对比 2.17:1；480×336 不可缩放窗口内法务正文 12px 且 A+/A− 不作用于同意弹窗（P1-2）。

## 1. 实测证据（命令/文件 → 结果）

| 检查 | 结果 |
|---|---|
| `node scripts/legal-check.mjs --strict` | **exit 1**；`BLOCKED (16 blocker(s), 16 warning(s))`；明细见 P0-4 |
| `node scripts/release-win.mjs --verify` | **exit 1**：`missing artifacts/SHA256SUMS.txt`；`--plan` 把 11-14 旧 zip/setup 判 "ok"（只认文件名，不验新鲜度/法务） |
| `dist/`（11-17 15:57，341 files） | 0 个 `.wav`、0 个 `.map`、**无 `docs/`**；vite 未清权音频排除插件生效（`vite.config.ts:6-22`） |
| `artifacts/DesktopGames-0.1.0-portable.zip`（11-14 14:44，6.6MB） | **14 条目，0 个** LICENSE/NOTICE/LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/DECLARATIONS；内嵌 exe 14,964,224B，`voice/pet` 命中 **19**、`fold_a.wav` 命中 1 |
| `artifacts/portable/`（11-14） | 仅 `DesktopGames.exe`+README+packs+3 cmd（7 条目）→ 官方 gate 判"staging 过小"；同 exe strings 含 `/assets/voice/pet/*.wav` 19 处 |
| `bundle/nsis/DesktopGames_0.1.0_x64-setup.exe`（11-14 14:44:47）与生成的 `installer.nsi` 同刻 | nsi 中 `File` 仅 WebView2 与主 exe（`:683`），`; Copy resources`（`:685`）段为空；`!define LICENSE ""`（`:41`） |
| `tauri.conf.json` 时间 | 11-17 10:30 修改 > 最近 NSIS 产物 11-14 → HEAD 资源/license 配置**从未构建验证** |
| `public/assets/voice/pet/` | 18 WAV + manifest 仍在工作树；gate 不扫 `public/` |
| `npm test`（consent/p1-gates 相关） | **56/56 pass**：首启、升级/哈希重弹、拒否只读、每次动作重弹、TTS 每会话/每配置、存储故障 fail-closed |
| `node scripts/check-version.mjs` | 12 处 mirror ok（0.1.0）；安装器/包版本一致 |
| About 面板 grep（`pet.html:149-176`） | 有完整 TOS/TTS 节，但**无**许可清单、THIRD-PARTY/CREDITS、联系方式、隐私政策、撤回同意入口 |

## 2. P0（发布前必须；未清不得发布）
### P0-1 现存 artifacts 违反项目自己的硬规则：未清权 TTS WAV + 0 声明
- **证据**：`artifacts/DesktopGames-0.1.0-portable.zip`（上表）内嵌 exe 含 18 WAV；`artifacts/portable/DesktopGames.exe` 同；`artifacts/playtest-kit/` 原样复制同一旧 zip（`scripts/playtest-kit.mjs:14-38`）；规则见 `docs/legal/README.md:15`（"未确认前不随包…不得随包发未确认音频"）与 `vite.config.ts:6-22`。
- **建议**：立即删除/移动全部 11-14 旧 zip/exe/staging/kit；只允许 `npm run build → tauri build → release-win --all --strict` 产出的 HEAD 产物分发；playtest kit 改为从新构建取件。
- **判定**：**发布前必须（内部）**。
### P0-2 安装包声明/licensePage/资源不完整，且当前安装器未带任何资源
- **证据**：`tauri.conf.json:34-44` 只列 `packs/`、LICENSE、NOTICE、DECLARATIONS.md、LICENSE-COMMERCIAL.md；无 LICENSE-ART/CREDITS/THIRD-PARTY/AI-PROVENANCE/TOS-TTS/隐私政策；无 `bundle.licenseFile`；`installer.nsi:41`（LICENSE 空）、`:168-170`（许可页条件永不成立）、资源段为空；11-14 setup.exe 即由该 nsi 生成（同时间戳）。`docs/RELEASE-RUNBOOK.md` §7 #2/#9 自认"未验证/NSIS 无 licensePage"。
- **建议**：补齐 9 份许可/AI/第三方/CREDITS + TOS/TTS/隐私到 resources（或随包 `legal/` 目录）；加 `bundle.licenseFile`（TXT/RTF 实测）；HEAD 重建后安装核对 `$INSTDIR` 清单；更新 RUNBOOK。
- **判定**：**发布前必须（内部）**。
### P0-3 应用内法务链接在打包版 100% 404；安装包不含 TOS/隐私文本
- **证据**：`pet.html:8-9,41`、`setup.html:38,49-52`、`chat-import.html:8-9,43,86` 均指向 `/docs/legal/*`、`/docs/research/*`；`dist/` 无 docs；Tauri resources 无 docs/legal；便携包（`release-win.mjs:39-52`）只带根许可 9 件，无 TOS/TTS/隐私。setup/chat-import 的"完整文档"链接在发行版必 404，成"死链声明"。
- **建议**：把 `docs/legal/{TOS,TTS-TERMS,AI-CONTENT-POLICY,TAKEDOWN-AND-REPORTING,SECURITY-AND-PRIVACY}.md`（及必要 README）纳入前端构建/资源并提供可点视图；或统一改为仅内嵌渲染；加构建后链接存在性测试。
- **判定**：**发布前必须（内部）**。
### P0-4 legal gate 的口径与盲区：16 blockers 是重复计数，且漏扫真正随包的 DRAFT/音频/产物
- **证据**：16 blockers = 8×DRAFT（NOTICE、CREDITS、THIRD-PARTY、AI-PROVENANCE、docs/legal/README、DECLARATION-MATRIX、SECURITY、TAKEDOWN）+ 7×便携缺失 + 1×staging 过小；`if (strict) blockers.push(...warnings...)` 使每条重复为 blocker（`legal-check.mjs:68-74`）。盲区：只扫 9 个文件（`:43-53`），**不扫** DECLARATIONS.md（`:3` DRAFT，且作为 NSIS 资源随包，`tauri.conf.json:41`）、TOS/TTS 文档、HTML/UI、`public/` 18 WAV、`artifacts/` 产物与安装包资源清单；`INCLUDE_UNCLEARED_AUDIO=1` 同时绕过 gate 与 vite（`:40`）；release.yml 在 build 前跑 gate（`:66,69`）→ 干净 checkout 上 dist 音频规则空跑；`ci.yml` 无 legal 步骤。
- **建议**：扩 gate（扫全部随包/引用文档、public 音频、artifacts 内 exe/zip、资源清单、HTML 死链）；`--strict` 在 build 后复跑；CI/release 禁止该变量；输出按"独立问题去重"计数，避免 16 的误导。
- **判定**：**发布前必须（内部）**；gate 转绿是发布前置条件而非合规证明。

## 3. P1（发布前必须修 / 需拍板）
### P1-1 双 canon 与实现漂移：APP-DISCLOSURE-TEXTS R1–R7 未按实际实现回写
- **证据**：R1"首启 1 屏/3 按钮"（`:11`）vs 实际 15 节完整 TOS modal（`terms.ts:32-34`、`TOS.md`）；R2 About 需"许可清单+联系方式"（`:12`）vs 无；R3 常驻角标/图片角标/音频播放器标识（`:13`）vs 仅 pet.html 一页小角标；R4"可稍后"（`:14`）vs 只有"休息并关闭提醒"（`modal.ts:570-597`）；R6"短确认"（`:16`）vs 每次完整 TTS 声明（`terms.ts:34`、`gate.ts:238-289`）；R7 每次 DLC/包确认 vs 仅 `?character=` 门（`main.ts:1465`），`CONSENT_ACTIONS.packLoad`（`terms.ts:315`）**零调用**，游戏宿主 `loadPackFromDir` 无同意（`src/host/game-host.ts:104`）。TTS-TERMS §2A 还引用同一短确认 canon。
- **建议**：拍板单一 canon（建议以 `terms.ts` 为运行时权威回写 APP-DISCLOSURE/TTS-TERMS），或按 APP 短文本改造实现；DLC/包加载补 `requireAction(packLoad)` 或明确 v1 不加载 DLC。
- **判定**：**发布前必须 + 需拍板（用户/律师）**。
### P1-2 可访问性：AI 角标 8px/对比 2.17:1；法务文本小且不可放大
- **证据**：`pet.html:15-35,129`：8px、`#cbb79f` on `rgba(18,15,12,.55)`；在浅色桌面合成底上对比 **2.17:1**（#f3f3f3 上 2.34:1），远低于 WCAG AA 4.5:1；`pointer-events:none` + `title` 使悬停/键盘都不可达，`role=note` 不可聚焦。Tauri 窗口 480×336、`resizable:false`（`tauri.conf.json:18-20`）；同意弹窗正文 12px、TOS 区 `max-height:36vh`（`pet.css:541-555,615`），A+/A− 仅改 `--ui-scale` 用于宠物 UI（`desktop-shell.ts:253-259`），**不作用于 consent 文本**；`tests/p1-gates.test.ts` 还把 8px 写死为断言。
- **建议**：角标改大/高对比实底，且可通过悬停/点击/键盘打开 About（显式标识需"显著"）；法务文本用可缩放单位并接入文字大小设置；窗口允许调整或提供"放大阅读"；同步更新测试。
- **判定**：**发布前必须（内部，设计+实现）；"显著标识"形态建议法务确认**。
### P1-3 撤回同意/隐私政策/许可清单入口缺失
- **证据**：全仓 grep `撤回|withdraw|revoke` 零命中；`ConsentStorePort` 无删除 acceptance/audit API（`store.ts`）；About 只有"关闭记忆/清除数据、退出应用"（`pet.html:168-174`），不删同意记录；无隐私政策正文/链接；许可清单/CREDITS/THIRD-PARTY 不在应用内（P0-3）。PIPL 第 15 条要求撤回同意（**外部律师复核**）。
- **建议**：新增"撤回同意/重置同意记录"（回到只读或退出）并说明审计记录处理；About 增隐私摘要、投诉邮箱、许可清单；包内补 SECURITY-AND-PRIVACY。
- **判定**：**发布前必须（内部实现）+ 外部律师确认措辞**。
### P1-4 名称/主体不一致，安装器元数据空缺
- **证据**：同一页面对外名并存 `Pagefold`（title）/`折角`（h1，`pet.html:10,56`）/`汀岚`（`setup.html:7`、`chat-import.html:10`、shell 菜单 `desktop-shell.ts:443`）/安装器 `DesktopGames`（`installer.nsi:36`）/TOS `Pagefold / 汀岚`；`DECLARATIONS.md:7` 自认"产品名未定"；installer `HOMEPAGE ""`、`COPYRIGHT ""`（`:39,50`），tauri.conf 无 publisher/copyright。
- **建议**：冻结 v1 产品名+角色名映射并统一 installer/title/TOS/About/商店；补 publisher/copyright/homepage。
- **判定**：**需拍板（用户/商标检索外部）**。
### P1-5 发布元数据/校验和缺失；release 工具会接受旧产物
- **证据**：`artifacts/` 无 `SHA256SUMS.txt`/`RELEASE-MANIFEST.json`，`--verify` 必失败；`--plan/--sha256` 只按文件名收集，不校 build 时间/法务 gate（`release-win.mjs:101-131,232-279`）；`release.yml` 有正确顺序（gate→build→NSIS→`--all --strict`→verify，`:66-79`）但 RUNBOOK §7 #1 自认"CI 从未跑过"；未签名无证书（RUNBOOK §8）。
- **建议**：本地按 release.yml 同序重建并 verify；dist/artifacts 时间戳与 HEAD 绑定（build id/CHANGELOG 记录）；对外只发带 SHA256 的产物。
- **判定**：**发布前必须（内部）**；代码签名 = 外部（OV 证书 1–2 周）。
### P1-6 工作区/旧产物卫生与敏感材料
- **证据**：`artifacts/` **999 条目**：941 个 `cdp-*` 浏览器 profile、38 个 pilot WAV（18+10+10，未清权）、旧 setup/exe/zip/staging/playtest-kit（11-11~11-15）；`.keys/dev-private.pem` 在本地（gitignored）；`.gitignore` 已忽略 `artifacts/`、`.keys/`，但手工打包/共享工作区即泄露。
- **建议**：发布前清空 `artifacts/`、集中重建；确认 dev 私钥不进任何包；playtest kit 改为新构建 + 许可文件齐全并记录 SHA。
- **判定**：**发布前必须（内部）**。
### P1-7 发行包含无声明页面/演示路由（需拍板范围）
- **证据**：`dist` 内含 `index/aquarium/stall/town/world/presence/tinglan-lab`，均 0 AI/非官方/许可声明；exe 支持 `--game=aquarium|town|stall`（`src-tauri/src/main.rs:314-318`），便携 runner 启动三 demo（`scripts/package-portable.ps1:13-23`），RUNBOOK 安装核验也含三 demo。
- **建议**：v1 若不发布 demo，从 `dist`/安装包移除；若发布，每页加非官方+AI+许可入口（并与 P1-2 标识一致）。
- **判定**：**需拍板（用户）**。

## 4. P2（可接受/排期）

- `setup.html:15` 可见字面量 `**所有调用会产生费用…**`（Markdown 未渲染）→ 删除/改 `<strong>`。
- `setup.html:38` 仍写"应用内 About 待接"，实际 About 已接（`runtime.ts:228-278`）→ 过时文案。
- `#about-screen` 标 `role=dialog aria-modal=true`（`pet.html:149`）但无焦点陷阱/背景 inert，仅托管 close+Escape（`runtime.ts:254-273`）→ 补 a11y 行为或去掉 aria-modal。
- 2h 提醒按"窗口可见时长"累计、无 APP R4 的 10–15min 空闲重置（`runtime.ts:305-335`）；文案与 canon `health.2h` 不同（`terms.ts:281`）→ 定义/文案对齐。
- `voice-mode` 显示"预生成/系统 TTS"（`pet.html:109`），但构建默认排除 18 个预生成 WAV（`vite.config.ts:6-22`），baked provider 在发行版会 404 回退 → 改文案或发布已清权音频。
- TTS 磁盘缓存 WAV 无 AI 隐式标识/元数据（`src-tauri/src/voice.rs:75-81,176-180`）→ 若用户可发现/分享缓存，补 AIGC 元数据或说明。
- `release-win.mjs` 生成的 README 文案过时：称 "signed farm-seasons"（实为 dev key，`packs/keys/dev-public.pem` + 本地 `.keys/dev-private.pem`）、"LICENSE-ART (DRAFT)"（该文件已无 DRAFT 字样）→ 更新生成文案。
- About"模型/API Key 设置"与 shell"导入会话"用 `window.open`（`main.ts:1945-1947`、`desktop-shell.ts:221-222`），Tauri capabilities 无窗口创建权限（`capabilities/default.json`）→ 真机验证；失败时降级为同窗口跳转会离开桌宠，建议应用内路由/受控子窗口。

## 5. 发布前必须 / 需拍板 / 外部

- **内部必须（清零才可发布）**：P0-1~P0-4；P1-2 角标/字号；P1-3 撤回+隐私入口；P1-5 重建+SHA256SUMS verify；P1-6 工作区清理；随后 `legal-check --strict`、`npm test`、`release-win --all --strict && --verify`、真机安装/卸载核验全绿。
- **需拍板（用户）**：canon 选择（terms.ts vs APP-DISCLOSURE）；产品/角色名冻结；demo/roleplay 是否随 v1；`public/` 18 WAV 与仓库公开性处置。
- **外部（无法在本仓内闭环）**：律师复审解除 8 个 DRAFT 与 TOS/TTS 生效（用户已暂缓）；DeepSeek TTS 输出再分发条款；代码签名证书；商店/年龄分级与 AI 问卷。

## 6. 关键证据索引

`scripts/legal-check.mjs:20-74` · `scripts/release-win.mjs:39-52,101-131,232-279` · `vite.config.ts:6-22` · `.github/workflows/release.yml:66-79` · `tauri.conf.json:34-44` · `target/release/nsis/x64/installer.nsi:41,168-170,683-685` · `dist/`(341 files, 0 wav/0 map/no docs) · `artifacts/DesktopGames-0.1.0-portable.zip`(14 entries/0 licence) · `artifacts/portable/`(7 entries) · `public/assets/voice/pet/`(18 wav) · `pet.html:8-9,15-35,41,109,129,149-176` · `setup.html:15,38,49-52` · `chat-import.html:8-9,43,86` · `src/pet/consent/{terms.ts:32-34,281,307-316; gate.ts:141-160,209-289; modal.ts:260-470,570-597; runtime.ts:228-335; store.ts,core.ts}` · `src/pet/main.ts:312-320,465,1465,1930-1953,2018` · `src/pet/desktop-shell.ts:221-222,253-259,443` · `src/host/game-host.ts:104` · `src-tauri/src/main.rs:314-318` · `src-tauri/src/voice.rs:75-81,176-180` · `docs/legal/{README:15; APP-DISCLOSURE-TEXTS:11-19,25-46; TOS.md:3,8,73-75}; DECLARATIONS.md:3,7` · `docs/audit/{AUDIT-LEGAL-RELEASE-2026-11-16,TRUST-REVIEW-2026-11-17}` · `docs/RELEASE-RUNBOOK.md` §7 #1/#2/#9、§8。

> **限制**：未启动浏览器/Tauri/安装器/E2E（对比度为静态计算，`window.open`/装机行为未实机验证）；未执行 git；非律师意见。并行工作树下行号可能移动。
> **审查记录**：2026-11-17 17:00 CST · 发布运营/安装包/法务文案一致性/可访问性 · DRAFT。
