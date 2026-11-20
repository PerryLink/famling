# 共享内容语义单源与双端 Parity（E1-T1 / MB-030/031/033）

> 状态：草案，待 lead 签字（E1-T1 验收要求）。创建：2026-11-19。修订：**2026-11-20**（MB-108/task-138 文档同步：§0 新增第 6 条、§2 第 14/15/16 行、§3 D6/D10、§4 证据、§6 状态表；同步 MB-032 已落地的 v3 合规字段，不改变任何共享值）。
> 范围：famling（`<private-path> dsh-famling 插件（`<private-path>
> 非目标：不统一 wire schema（见 triage 决策 C-03）；不改 UI/视觉；不做内容包安装器。

## 0. 结论（TL;DR）

1. **“单源”只覆盖共享语义/取值**：角色 bundle 六组件、语音/TTS 策略、对话模式、外观 id 与值、用途声明、schema/版本锚、存储键、事件→clip、动画帧数。
   **wire schema 保持多套**：`famling.content/0.2`（目录）、`famling.content-pack/0.2`（v2 素材包）、插件 `content-extension` v3（预留，纯数据）、`famling.pet-anim/0.1`（动画 manifest）各自独立、fail-closed。
2. 共享权威仍是 **famling 的 `public/content/library.json` + `src/pet/content-library.ts`**。插件无法在运行时导入它，因此在 `client.js` 的 `<dsh-famling:content:*>` 块中冻结一份 **`SHARED_CONTENT_SEMANTICS` 锚点**，由两端 parity 测试强制一致。
3. 本次发现并修复 **2 处真实漂移**：
   - **F1 对话模式行为漂移**：插件把“显式交互”气泡也按 ambient 概率门控（standard/brief 只有 70%/40%、quiet 仅 5%），而共享语义是 `bubbleChance` **只管自动/环境气泡**，显式交互仍应显示；并且 quiet 必须**关闭**自动环境气泡（famling `ambientBubbles=false`）。已改为：`source === 'ambient'` 才过概率门/quiet 抑制，tap/菜单动作标记 `'interactive'`，宿主回复标记 `'direct'`。
   - **F2 声明/合规锚缺失**：插件 `USAGE_DECLARATION` 只有 `researchOnly + 6 tokens`，缺 canonical 短句、`statementRef`、SHA-256；`license`/`aiProvenance` 没有机器可读锚点。已补齐 `SHARED_CONTENT_SEMANTICS`（schema/version/updatedAt/defaultRole/characterIdMap/statement/ref/sha/license/aiProvenance）并让 `USAGE_DECLARATION` 引用它。
4. 两端各新增 12 条 parity 测试（famling `tests/parity-contract.test.ts`、插件 `test/parity-contract.test.js`）；兄弟仓缺失时对端 4 条测试 **skip 而非失败**。
5. 其余 **10 处已裁定差异**逐条登记在 §3（一致 / 声明并测试固定 / 后续任务），不允许静默漂移。
6. **2026-11-20 文档同步（MB-108）**：`MB-032`（round10 DONE）已把 `license`/`aiProvenance`（pack/entry 可选）与 pack-level `compatibility` 作为 **v3 追加可选字段**落地（schemaVersion 仍为 3，`{requireCompliance:true}` 时才强制），因此 §2 第 14/16 行与 D6 原“待定 / 暂无”的表述已过期，本版改为现状并冻结验证方式。D10 两项的现状：① 插件 `README.md` 的 origami 行已修正为 speech/tide + `available:false`（2026-11-20 复核 `README.md:159`）；② famling `public/content/README.md` §3.5 仍写 content-extension **v2**/0.9.1/0.1（滞后），不在 MB-108 写权限内，登记为 follow-up（以本文件与代码常量为准）。

## 1. 权威来源（改哪里算“改共享值”）

| 层 | 文件 | 说明 |
|---|---|---|
| 共享目录（canonical） | `public/content/library.json` + `src/pet/content-library.ts` | 角色预设/六组件/对话/主题/背景/字体/声明/limits/存储键/合规字段；解析器是权威校验 |
| 插件冻结锚 | `plugins/dsh-famling/client.js` 的 `<dsh-famling:content:*>` 块（`SHARED_CONTENT_SEMANTICS`、`ROLE_BUNDLES`、`DIALOGUE_MODES`、`USAGE_DECLARATION`、`THEMES`、`BACKGROUNDS`、`FONTS`、各 `*_IDS`、存储键常量） | 插件首屏入口；由 parity 测试对着 library.json 校验 |
| 插件 wire 契约 | `plugins/dsh-famling/content-extension.mjs`（v3，预留） | 纯数据 schema/validator；`CONTENT_LIMITS`、6 个禁止用途、usageDeclaration 模板 |
| 动画/交互 | `src/pet/anim/clips.ts`、`src/pet/anim/types.ts`、`public/assets/pet/anim/*/manifest.json`、`public/characters/*/regions.json` | 12 clip / 帧数 / fps / 事件→clip 映射 |
| 法务 | `docs/legal/USE-RESTRICTIONS-2026-11-19.md` §1/§8、`src/pet/consent/terms.ts` | canonical 短句 + SHA-256 + TOS/TTS/ASR/ROLEPLAY 版本 |
| 说明（派生） | `public/content/README.md`、`docs/content-packs/`、插件 `README.md` / `docs/DETAIL.md` | 只解释语义，不得成为第二事实源；发现两处文档滞后见 §3 D10 |

## 2. 共享面总表（23 面）

图例：✅=两端一致且有测试；🧊=声明差异并由测试冻结；🔧=本次修复；🔭=后续任务（B1/B2）。

| # | 共享面 | famling 权威值/位置 | dsh-famling 值/位置 | 结论 | 验证（测试） |
|---|---|---|---|---|---|
| 1 | 目录 schema / version / updatedAt | `library.json.schema = famling.content/0.2`，`version 0.2.0`，`updatedAt 2026-11-19`（`CONTENT_LIBRARY_SCHEMA`） | `SHARED_CONTENT_SEMANTICS.schema/version/updatedAt` 同值 | ✅ | 两端 `parity-contract`：schema/anchor 测试 |
| 2 | 角色预设 id、顺序、默认 | `rolePresets = [human, cat, dog, origami]`；`defaultRoleTheme = human`；`defaults = {humanoid, stella, standard, default, transparent, system}` | `ROLE_BUNDLES` 同为 4 键；`ROLE_IDS=[human,cat,dog]`（origami reserved）；默认 role=human | ✅ | parity：role-bundles / library 测试 |
| 3 | 角色 → character id 映射 | human→`humanoid`，cat/dog/origami 同名 | human→`human`（插件宿主/动画 id），其余同名 | 🧊 D1：命名差异，映射冻结在 `characterIdMap` | parity：character map 断言 |
| 4 | 角色 bundle 六组件 | 每个 preset：`characterId, voiceId, dialoguePackId, appearance{themeId,backgroundId,fontId}, behaviorPreset` | 每个 bundle：`character, voicePolicy, dialogue, theme, background, font{family,size,lineHeight}, available` | ✅（origami 差异见 D2/D3） | parity：role-bundles 双端 |
| 5 | 声音 / TTS 策略 | humanoid/origami：`voiceMode=tts`、`bubbleSemantic=speech`；cat/dog：`none` + `thought` | `voicePolicy.canTts` human=true、cat/dog=false、origami=true(保留)；`mode`=speech/thought | ✅ | parity：voice-policy / CHARACTER_POLICY |
| 6 | 声音目录与 TTS 来源 | `voices = stella/tide`，provider=`deepseek-tts`，`availableFor=[humanoid, origami]`，aiGenerated=true | 浏览器 `speechSynthesis` 动态列表，无 provider voice id；仅 canTts 策略共享 | 🧊 D5：来源不同，不能互相覆盖；共享“谁可以发声” | parity：voice-policy / 插件 TTS guard |
| 7 | 对话模式值 | `standard 240/0.7`、`brief 80/0.4`、`quiet 50/0.05`；`mode===id` | `DIALOGUE_MODES` 同值 | ✅ | parity：dialogue-values |
| 8 | 对话模式行为语义 | `bubbleChance` 只作用于**自动/环境**气泡；quiet 关闭环境气泡（`ambientBubbles=false`、`shouldShowBubble=false`），显式交互仍显示；每行按 `maxChars` 截断 | 原先所有非 direct 气泡都过概率门且 quiet 仍 5% → 已修：仅 `source==='ambient'` 过门/被 quiet 抑制；tap/菜单=`interactive`，宿主回复=`direct` | 🔧 F1 ✅ | parity：dialogue-semantics（双端源码断言）+ 插件 client-behavior |
| 9 | 外观 theme id 与角色分配 | `themes = [default, paper, night, high-contrast]`；human/default、cat/night、dog/paper、origami/high-contrast | `THEME_IDS=[default,paper,night]`；human/default、cat/night、dog/paper、origami→**night** | 🧊 D3：插件无 high-contrast，显式映射 night | parity：appearance / theme ids |
| 10 | theme 变量值 | `vars.bubbleBg/bubbleFg/bubbleBorder/bubbleShadow`（+可选 panel/bg）；default=`#ffffff/#111111/#d6d6d6` | 插件是 widget 投影：default 气泡 `#ffffff/#111111` 与共享一致；paper/night 调色板为插件侧冻结值；panel 用 DSH alias 变量；thought 边框为插件独有 | 🧊 D4：产品渲染差异；default 气泡色共享 | parity：frozen plugin palette + default shared 值 |
| 11 | background id/值 | `transparent=transparent`、`paper=#f6f1e7`、`dark=#14161a` | `BACKGROUNDS` 同 id、同 widget-bg 值 | ✅ | parity：background 断言 |
| 12 | font id/字体栈 | `system/serif/mono` 三套本地栈（无网络字体） | `FONTS` 三套完全同字符串；另有字号/行高 [11,12,14]/[1.4,1.5,1.8]（插件扩展，不共享） | ✅ | parity：font 断言 |
| 13 | 用途声明 | `researchOnly=true` + canonical 短句 + `statementRef=docs/legal/USE-RESTRICTIONS-2026-11-19.md` + SHA-256 `0353…c743` + 6 禁止用途（顺序固定） | 原仅 researchOnly+6 tokens；已补 statement/ref/sha 并冻结到锚点 | 🔧 F2 ✅ | parity：declaration 双端（重算 SHA） |
| 14 | 合规字段（license / aiProvenance / compatibility） | 每个 preset：`license{spdx=LicenseRef-PolyForm-Noncommercial-1.0.0, attribution}`、`aiProvenance{generated=false, disclosure, tools}`；v2 pack 还有 `compatibility` | client 锚点冻结 license/aiProvenance；**v3（0.10.9 起）**：pack/entry 可带 `license`/`aiProvenance`，pack 可带 `compatibility{minPluginVersion, maxPluginVersion?}`；默认可选、存在即 fail-closed 校验，`{requireCompliance:true, pluginVersion}` 时 pack 三项必填并校验宿主版本 | ✅（2026-11-20 起：client 锚点 + v3 可选字段；双端锚点相等） | famling `parity-contract`（12）；插件 `content-extension-compliance` 10 + `parity-contract` 14（`CONTENT_LICENSE_TEMPLATE`/`CONTENT_AI_PROVENANCE_TEMPLATE` == FROZEN == famling preset） |
| 15 | pack limits | 目录 `CONTENT_LIMITS`（22 项）+ 素材包 `CONTENT_PACK_V2_LIMITS`（17 项） | v3 `CONTENT_LIMITS`（19 项）：JSON 64KiB/entries 32/kind 16/files 32/path 160 等**总体更严**；asset 总字节 256MiB、name 64 字符为已声明例外（D6）；2026-11-20 复核上限未变（加 compliance 字段不改 limits） | 🧊 双 schema 各自冻结 | parity：pack-limits 双端 |
| 16 | pack wire schema | `famling.content-pack/0.2`（zip+license+aiProvenance+compatibility）；目录 `famling.content/0.2` | `content-extension` v3（schemaVersion **3 不变**；role/character/voice/dialogue/theme/background/font 七类，reserved、不加载；**新增**可选 `pack.license/aiProvenance/compatibility` 与 entry 级可选合规字段） | 🧊 D6（2026-11-20 更新）：两套 schema 仍独立；v3 已补合规字段，未合并 v2 | 插件 `content-extension-compliance` 10；双端 parity schema/limits 断言 |
| 17 | 存储键 / envelope | 六选择键 `desktop-games/pet/content/{character,voice,dialogue-pack,theme,background,font}` + `role-theme`；envelope `{v:1,data}`，单键 ≤2048B | `dsh-famling/{character,role,dialogue,theme,background,font,settings,menu,…}`；`first-run/v1`、`consent/v1` 带版本后缀；无统一 envelope | 🧊 D7：命名空间/版本策略不同，互不读取 | parity：storage 双端 |
| 18 | TTS/consent 门 | TTS 需独立同意；TTS/ASR 声明版本+hash 生效，旧同意失效 | 浏览器 TTS 需独立 consent（`dsh-famling/consent/v1`，`{tts,asr}` bool）；切静音角色取消朗读 | ✅ 行为一致；版本化程度见 D8 | parity：TTS guard / terms 断言 |
| 19 | terms/legal 版本 | `TOS 2026-11-17.6`、`TTS 2026-11-17.4`、`ASR 2026-11-17.3`、`ROLEPLAY 2026-11-17.4`；USE-RESTRICTIONS `v1 · 2026-11-19` + §1 短句 SHA | 插件 `package.json 0.10.4` + LEGAL-NOTICE 版本表；无 per-consent version/hash | 🧊 D8（E1-T5/MB-014 待做） | parity：terms 版本冻结（famling 侧导入 + 插件侧解析） |
| 20 | 事件 → clip 映射 | regions `gestures.events = pat/stand_wag/chase_tail`；actions 含 ball_throw/ball_chase/paw_face/run/feed/talk；clip 目标 ∈ `CLIP_IDS` | `EVENT_CLIPS = {pat:pat_head, stand_wag, chase_tail, ball_throw, ball_chase, paw_face, scratch, run, feed:stand_wag, talk:null}` | ✅ | parity：event-clips 双端 |
| 21 | 动画 item counts / clip table | dog 68 帧、cat 72（stand_wag 10 帧 holdMs 3200ms）、human 68；各 12 clip；96×96、anchor 48/96、ground y=89 | 嵌入三 chunk 共 208 帧/12 clip（header 冻结）；按 manifest 懒载 | ✅ | parity：frames 双端 |
| 22 | 角色可用性与产品范围 | characters：humanoid/dog/cat `products=[famling,dsh-famling]`；origami 仅 `[famling]`；全部 available=true | `CHARACTER_IDS=[human,cat,dog]`；origami bundle `available:false` 数据预留 | 🧊 D2：插件无折纸美术，不提供卡片 | parity：availability 断言 |
| 23 | 远程市场预留 | library 只留 market catalog schema `famling.market-catalog/0.1`（不联网） | `MARKET_CONFIG` status=reserved/configured=false/catalogUrl=null；v3 remoteCatalog 未实现 | ✅ 语义一致（都 reserved、不联网） | parity：market-config（client-static + parity anchor） |

### 2.1 “为什么是这个值”示例（E1-T1 验收）

| 角色 | 问题 | 答案链 |
|---|---|---|
| cat | 为什么插件是 night/transparent/serif + 不发声？ | `library.json.rolePresets[id=cat].appearance + voiceId=none` → `client.js ROLE_BUNDLES.cat`（theme night / background transparent / font serif / `canTts:false`）→ 两端 parity 断言固定；背景 transparent 让 DSH host 背景透出（0.10.12），夜间主题只作用于气泡/面板；来源是 `docs/content-packs/CAT-DESIGN-REFERENCE.md` 的夜间/毛色设计 + 共享“猫狗永不 TTS”安全规则（`public/content/README.md`） |
| dog | 为什么是 paper/transparent/system？ | `rolePresets[id=dog]` → `ROLE_BUNDLES.dog`；主题值来自 `themes.paper`，背景自 0.10.12 起为 `backgrounds.transparent`（纸张气泡/面板保留）、字体来自 `fonts.system`；动画行为 `behaviorPreset=pet-dog` 对应 `public/characters/pet-dog` 与 v7 金毛 68 帧包 |
| 任意 | 为什么声明是这句？ | `docs/legal/USE-RESTRICTIONS-2026-11-19.md` §1 是 canonical；`src/pet/content-library.ts` 常量与 `library.json` 每个 preset 逐字复制；插件 `SHARED_CONTENT_SEMANTICS.usageStatement` + SHA-256 由 parity 测试重算校验 |

## 3. 已裁定差异登记（10 条，禁止静默漂移）

| ID | 差异 | 裁定 | 证据/测试 |
|---|---|---|---|
| D1 | 人形 character id：famling `humanoid` vs 插件 `human`（宿主/动画/桥接使用） | **保留**（产品 id 空间不同），映射冻结在 `SHARED_CONTENT_SEMANTICS.characterIdMap` + library `rolePresets.characterId` | 两端 parity character-map 断言 |
| D2 | origami：famling 有角色与美术（仅 famling 产品）；插件仅数据预留 `available:false`、不出卡片、不加载 chunk | **保留**（无折纸美术包）；v3 `ROLE_BUNDLE_IDS` 仍含 origami，数据层不丢 | parity：availability + ROLE_BUNDLE_IDS |
| D3 | high-contrast 主题：famling 有完整 variables；插件无实现 | **保留**：插件 `THEME_IDS` 无 high-contrast，origami bundle 显式映射 `night` 且 `available:false`（绝不静默错配）；`verify-anims.mjs` 锁定该字符串 | 两端 parity theme 断言 |
| D4 | theme CSS payload：famling 用 `--famling-content-*` 完整主题；插件用 `--dsh-famling-*` widget 投影（panel 跟随 DSH alias、thought 虚线边框、paper/night 调色板微调） | **保留**（宿主嵌入视觉）；共享最小集：theme id/角色分配 + default 气泡 `#ffffff/#111111`；paper/night 插件值冻结在 parity 表，改需双端评审 | parity：frozen plugin palette + default 共享值 |
| D5 | 声音来源：famling DeepSeek TTS `stella/tide`；插件浏览器 `speechSynthesis` | **保留**（不能互相覆盖）；共享“谁可以 TTS”（humanoid/origami 可以，cat/dog 永不）与独立同意门 | parity voice-policy；插件 TTS guard 测试 |
| D6 | wire schema/limits：`content-pack/0.2` vs extension v3 | **仍保持独立**（triage C-03）；**MB-032（0.10.9，2026-11-20 DONE）已决定**：schemaVersion 不升 v4，把 license/aiProvenance（pack/entry 可选）与 pack compatibility 作为 **v3 追加可选字段**，默认向后兼容、存在即 fail-closed 校验，host 传 `{requireCompliance:true, pluginVersion}` 时强制 pack 三项并校验宿主版本；**未合并** v2 zip schema。v3 多数上限更严；**已声明例外**：`maxAssetTotalBytes` 256MiB > v2 32MiB（v3 资产归档 reserved、永不打开）、`maxNameChars` 64 > 48（人类可读名），2026-11-20 复核未变 | 插件 `content-extension-compliance` 10 + 双端 parity limits/schema/anchors 断言 |
| D7 | 存储：famling `desktop-games/pet/content/*` + versioned envelope v1；插件 `dsh-famling/*`，`first-run/v1`/`consent/v1` 后缀版本 | **保留**（不同产品存储域，禁止互读）；语义六键映射见 §9；插件清理入口只删 `dsh-famling/*` | 两端 parity storage 断言 |
| D8 | consent 版本化：famling TOS/TTS/ASR/ROLEPLAY 版本+hash、旧同意失效；插件 consent 仍是 `{tts:boolean,asr:boolean}`（无版本/hash，无 withdraw 版本记录） | **已知缺口**，不在本任务扩权范围：E1-T5/MB-014 将升级为 `{version,hash,acceptedAt}` + withdraw；在此之前以“行为一致 + 文档如实”为限 | parity terms 版本冻结；插件 version-truth/consent 测试 |
| D9 | 动画打包：famling 直接 serve `public/assets/pet/anim/*`；插件把 208 帧 base64 嵌入 3 个懒载 chunk | **保留**（插件离线自包含）；共享 12 clip/帧数/fps/manifest 语义；插件 header 的 208 与 famling manifest 一致 | 两端 parity frames 断言 |
| D10 | 文档滞后：① 插件 `README.md` 角色 bundle 表把 origami 写成“thought，无 TTS”（与 `ROLE_BUNDLES.origami` 的 speech/canTts true 矛盾）；② famling `public/content/README.md` §3.5 仍描述插件 `content-extension v2`/0.9.1 与共享 `content-pack/0.1`（实际 v3 / v2） | **2026-11-20 复核**：① **已修复**（插件 README:159 现为 speech + shared tide 策略 + `available:false`）；② **仍滞后**：该文件在 `public/content/`，不属于 MB-108 写权限（docs/plan/scripts/src/pet/tests），留作 follow-up；在此之前以本文件与代码常量为准，不得引用 §3.5 的旧 v2 描述 | 本文件 §4 复核命令；parity 测试以代码常量为准 |

### 3.1 本次修复对照

| 编号 | 修复前（漂移） | 修复后 | 代码位置 |
|---|---|---|---|
| F1 | `say()` 对除 direct 外所有气泡按 `bubbleChance` 门控（standard 70%、brief 40%、quiet 5%），quiet 仍可能出环境气泡；tap/菜单动作被当作 ambient | `source==='ambient'` 才过概率门/quiet 抑制；tap/菜单动作传 `'interactive'`、Advisers 摘要回复传 `'direct'`；显式交互始终显示、仍按 maxChars 截断 | `plugins/dsh-famling/client.js` `say()`/`runAction`/`onPetClick`/`loadBrief`；测试 `test/client-behavior.test.js`、`test/client-static.test.js` |
| F2 | `USAGE_DECLARATION` 只有 `researchOnly+6 tokens`；无 canonical 短句/ref/SHA；无 license/aiProvenance 机器锚；schema/版本只存在于注释 | 新增 `SHARED_CONTENT_SEMANTICS`（schema/version/updatedAt/defaultRole/characterIdMap/statement/ref/SHA/license/aiProvenance）；`USAGE_DECLARATION` 引用同一字符串；两端测试重算 SHA | `plugins/dsh-famling/client.js` content block；新增两端 parity 测试 |

## 4. 验证命令与证据（本机实测，2026-11-19/20）

> 本工作区 `node_modules` 是 win32 安装，WSL 内 Node 无法加载 esbuild/tsx；TS 测试通过 **Windows Node 24**（`powershell.exe`）运行。插件 JS 测试可直接在 WSL Node 运行。

```powershell
# famling：新 parity 测试（12 tests，含 4 条跨插件；实测 12/12 pass）
cd <private-path>
node --import tsx --test tests/parity-contract.test.ts

# famling：类型检查（实测 exit 0）
npm run typecheck

# famling：内容/声明相关回归集（实测 149/149 pass）
node --import tsx --test tests/parity-contract.test.ts tests/content-library.test.ts tests/content-pack-v2.test.ts tests/use-restrictions.test.ts tests/content-hub.test.ts

# famling：干净 checkout（无兄弟插件）时 4 条跨端测试应 skip、8 条本地测试 pass
$env:DSH_FAMLING_PLUGIN_DIR='D:\nonexistent\dsh-famling'
node --import tsx --test tests/parity-contract.test.ts   # 实测 8 pass / 4 skip / 0 fail

# famling：全量回归（实测 1335 tests / 1330 pass / 5 skip / 0 fail）
npm test
```

```bash
# plugin：全量测试（实测 146/146 pass，含新 parity 12 条）
cd <private-path>
npm test
# plugin：动画/size/契约门（实测 OK；client.js 93.2→94.9 KiB = 97,228 B，96 KiB 预算余量 1,076 B；audit 阈值 97,576 B 余量 348 B——后续再加首屏常量需同步评估）
npm run verify:anims
# plugin：干净 checkout（无 famling 兄弟仓）时 4 条跨端测试 skip、8 条本地 pass
FAMLING_REPO_DIR=/nonexistent/famling node --test test/parity-contract.test.js
```

测试文件：
- famling：`tests/parity-contract.test.ts`（读 `public/content/library.json` + 插件 `client.js`/`content-extension.mjs`；缺失则 skip）
- plugin：`test/parity-contract.test.js`（读本仓 `client.js`/`content-extension.mjs` + famling `library.json`/源码/manifests；缺失则 skip）

### 4.1 2026-11-20 复核（MB-108/task-138，本机 WSL2 + 插件工作树）

> 只复核与 §2 第 14/16 行、D6/D10 相关的断言；不改共享值。插件工作树当前含其它任务的在途改动，数字只代表本次本机复跑。

```bash
# famling：双端 parity（12/12 pass）
cd <private-path> && node --import tsx --test tests/parity-contract.test.ts

# 插件：v3 合规字段 + 双端 parity（10 + 14 = 24/24 pass）
cd <private-path>
node --test test/content-extension-compliance.test.js   # 10/10
node --test test/parity-contract.test.js                # 14/14

# 插件：i18n/locale 单一源门（MB-108 新增；10 checks PASS）
node scripts/check-i18n.mjs
```

- 证据要点：插件 parity 断言 `CONTENT_LICENSE_TEMPLATE`/`CONTENT_AI_PROVENANCE_TEMPLATE` == 冻结锚点 == famling `rolePresets[0]` 的 `license`/`aiProvenance`；`CONTENT_EXTENSION_POINTS.compliance.packFields` == `['license','aiProvenance','compatibility']`，strict 选项名 `requireCompliance`，v3 limits 未放宽（§2 第 15 行）。
- D10 ② 未修：`public/content/README.md` §3.5 属产品公开文档，不在 MB-108 写权限；本条只登记不修，避免与产品文档 owner 并行冲突。

已知非本任务回归（2026-11-20 实测）：`npm run docs:check` 的 `status-commit` 仍红（`STATUS` 记录 b83b11e ≠ HEAD aae381f，需按发布流程重新生成 status；与共享语义无关）。

## 5. 变更流程（改共享值必须同步两端）

**任何**共享面变更（§2 任一行）都必须按以下顺序，同一个 commit/PR 内完成：

1. **改权威**：先改 famling 的 `public/content/library.json` / `src/pet/content-library.ts` / 资产 manifest / legal 文档；跑 famling 自有测试确认内部一致。
2. **改插件冻结值**：同步 `plugins/dsh-famling/client.js` content block（`SHARED_CONTENT_SEMANTICS`、`ROLE_BUNDLES`、`DIALOGUE_MODES`、`USAGE_DECLARATION`、`THEMES/BACKGROUNDS/FONTS` 等）或 `content-extension.mjs`（v3 契约）。
3. **先红后绿**：只改一端时两端 parity 测试至少一端必须红；两端同改后 `npm test`/`node --import tsx --test tests/parity-contract.test.ts` 全绿。
4. **改本文件**：更新 §2 表对应行、§3 差异登记（如有新差异必须写裁定），并把文档头“创建/修订”行加版本（如 `2026-11-19.1`）。
5. **全量门**：famling `npm run typecheck` + 相关测试；插件 `npm test` + `npm run verify:anims`。发布前由 lead 在 PR 正文引用本文件的表行号。

专项提醒：
- **改 canonical 短句**：必须同时按 `docs/legal/USE-RESTRICTIONS-2026-11-19.md` §8 提版本、更新 §1 SHA、运行 `node scripts/legal-check.mjs --sync` 与 `--strict`，再改两端常量/锚点；插件 LEGAL-NOTICE 的哈希也要同步。
- **改对话模式值**：改 `library.dialoguePacks` + 两端 `DIALOGUE_MODES` + 两端 parity 值断言；若改 `quiet` 语义，需同时确认 `ambientBubbles` 与插件 `source==='ambient'` 逻辑。
- **改 limits/wire schema**：改 `src/pet/content-library.ts` 或 `content-extension.mjs`，更新两端 parity 的 frozen limits 表；v2/v3 差异只能通过 §3 D6 的“声明 + 测试例外”扩权，不得静默放宽。
- **改动画帧数/fps**：改 `manifest.json`/`clips.ts` → 重新生成/embed 插件 chunks → 两端 parity 帧数断言与 `verify-anims` 必须同步绿。
- **只改文档**：若只是纠正 §3 D10 类滞后文案，仍要跑 `docs:check`/链接检查，并在本文件登记。

回滚：只要按“两端一起 revert”处理；部分回滚会让 parity 测试红，这是设计行为。

## 6. 后续（与 master backlog 的映射）

| 项 | 状态 | 下一步 |
|---|---|---|
| E1-T1 本文件（15+ 面合同表） | ✅ 本次完成（23 面） | lead 签字后关闭 |
| MB-030（15 面共享语义表） | ✅ 本次完成 | — |
| MB-031（双端 parity 测试 / 冻结差异） | ✅ 本次完成（双端各 12 条） | B1 转生成式 conformance（E1-T2/T3） |
| MB-033（license/aiProvenance/compatibility/usageDeclaration parity） | ✅ client 层冻结；wire 层 v3 缺口已登记 D6 | MB-032 决定 v3/v4 是否补合规字段 |
| E1-T2 spec/face 快照 + LOCK | 🔭 | 生成器 `scripts/gen-face-spec.mjs`，本文件表即输入 |
| E1-T3 由 spec 生成插件常量 | 🔭 | 生成后删除手写冻结、保留 parity 测试为生成物校验 |
| E1-T5 consent fixture/版本化 | 🔭 | 插件 consent 升级 `{version,hash,acceptedAt}` + withdraw（D8） |
| MB-107 library 单源生成插件常量 | ✅ 2026-11-20（round10 DONE） | 插件 `gen-content-constants.mjs` 从 famling 单源生成 client.js 两个 @generated 块；**content-extension.mjs 全量 checkJs 已由 MB-108 补齐（2026-11-20，`npm run typecheck` = `checkJs ok`）** |
| MB-032 v3 合规字段 | ✅ 2026-11-20（round10 DONE） | v3 追加可选 license/aiProvenance/compatibility；§2 第 14/16 行与 D6 已同步；§4.1 复核 24/24 |
| MB-108 本文件文档同步 | ✅ 2026-11-20（本版） | §0 第 6 条新增，§2 第 14/15/16 行、D6/D10 更新，§4.1 证据；D10 ② 登记 follow-up |

## 7. 维护者检查清单（PR 模板可复制）

- [ ] 本次改了哪些共享面（§2 行号）：______
- [ ] famling 权威文件已改并跑通自有测试：______
- [ ] 插件冻结值/content-extension 已同步：______
- [ ] 两端 parity 测试：famling 12/12、plugin 12/12（附命令输出）
- [ ] 本文件 §2/§3 已更新，文档版本已 bump
- [ ] 若涉及 legal 短句/版本：legal-check 已跑，SHA/版本已同步

