# Famling 内容中心 / 主题市场（数据规范 0.2）

> 状态：**0.2 规范 + 纯函数核心已落地；安装器/UI/远程市场未实现**（远程市场只定义 data/validate/verify 契约，不联网）。
> schema：内置目录 'famling.content/0.2'（'0.1' 为 deprecated 适配，仍可解析）；第三方内容包 'famling.content-pack/0.2'（'0.1' 保留 deprecated 适配）。
> 唯一校验实现：'src/pet/content-library.ts'；回归测试：'tests/content-library.test.ts' + 'tests/content-pack-v2.test.ts'。
> 本目录只放**声明式数据**（JSON + 本地图片/文本）。0.2 不联网、不执行脚本、不加载 HTML。
> 第三方设计参考 / 内容包规范 / 示例：'docs/content-packs/'（HUMAN / CAT / DOG 三份参考 + examples）。
> 新 rig 动画资产包：'famling.pet-anim/0.2' —— **spec/校验/安装器 PLAN 契约已落地，loader/注册表/热切换/真实安装器未实现**，见 'docs/content-packs/ANIM-PACK-0.2.md'。

famling（独立桌宠应用）与 dsh-famling（DSH 插件）共用这一份目录与选择语义：**角色主题**（一键切换角色/声音/对话/行为/外观）+ 六个可选组件（角色、语音、对话包、主题、背景、字体）。两个产品各自保留 UI，只消费同一套数据。

---

## 0. 产品澄清（0.2 的核心）：**角色就是主题**

用户澄清：主题/背景/字体只是说法，主题并不适用于桌宠；**角色就是主题**，应该一键切换所有相关内容（角色外观/声音/对话/行为/外观配色等），用户可以在角色基础上自己搭配或导入。导入不只是 JSON，还应包含素材包。

因此 0.2 的主数据单位是**角色主题（character theme）**：

| 一键切换的内容 | 字段 |
|---|---|
| 角色外观/动画 | 'characterId'（+ 'preview'） |
| 声音 | 'voiceId'（'none' = 静音；猫狗永远 'none'） |
| 对话语气/频率 | 'dialoguePackId' |
| 外观配色 | 'appearance.themeId' / 'backgroundId' / 'fontId' |
| 行为 | 'behaviorPreset?'（如 'pet-dog' / 'pet-cat'） |

- 内置 'rolePresets' 四条：'human' / 'cat' / 'dog' / 'origami'，一键应用全部组件；
- 'characterThemes' 存放用户派生/导入的角色主题；
- 六个分类（characters / voices / dialoguePacks / themes / backgrounds / fonts）**保留为可选组件**，用于自定义与派生；
- 每个角色主题/内容包**必须**带统一用途声明（canonical 短句 + 研究用途 + 六条禁止用途），UI 导入前必须让用户确认（见 §7）。

---

## 1. 目录结构

### 1.1 仓内（随应用发布，只读）

~~~text
public/content/
  library.json        # 内置目录（famling.content/0.2），运行时只读
  README.md           # 本文件
docs/content-packs/   # 第三方设计参考 / 0.2 内容包规范 / 三个 example pack
~~~

'library.json' 由代码/测试的严格解析器读取（'parseContentLibrary'）。**不要**在运行时改写它；用户选择保存在本机 localStorage，不写回该文件。

### 1.2 本地安装包（0.2：zip 素材包或 JSON 清单，安装器未实现）

~~~text
<userData>/content-packs/<packId>/
  pack.json           # 必需：famling.content-pack/0.2（角色主题 + 声明 + files+sha256）
  LICENSE.md          # 可选：根目录文档白名单（LICENSE/NOTICE/README/DESIGN.md）
  DESIGN.md           # 可选：设计说明/来源
  assets/             # 可选：素材，仅 png/webp/json/woff2
    preview/<theme>.preview.png
    sprites/idle/idle_00.png
~~~

约定：

- 'packId' 必须等于 'pack.json' 的 'id'；
- 所有资源路径相对包根目录，**不得**出现 '..'、绝对路径、盘符、UNC、反斜杠、ADS（':'）、'#'、'?'、URL scheme；
- 素材扩展名**仅限** 'png'、'webp'、'json'、'woff2'（0.2 移除 'wav'/'ogg'/'md'/'txt' 作为包内素材；'LICENSE.md' 等仅允许四个根目录文档名）；禁止 exe/js/html/svg；
- 每条 'files[]' 必须带 'bytes' + 'sha256'（64 位小写 hex），且必须与解压清单一一对应；
- 同一路径不得重复声明（含大小写碰撞）。

> 未来安装器必须先走同意门（TOS/DLC 逐次确认）再读取/复制文件；本规范不授权自动安装。zip 布局与校验见 'docs/content-packs/README.md'。

---

## 2. 内置目录 'public/content/library.json'

### 2.1 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| schema | string | 固定 'famling.content/0.2'（'0.1' deprecated 适配仍可解析） |
| version | SemVer | 目录版本，如 '0.2.0' |
| updatedAt | 'YYYY-MM-DD' | 最近更新日期 |
| defaults | object | 六类默认组件选择，必须引用存在且 available 的条目 |
| defaultRoleTheme | string? | 默认角色主题 id（必须存在于 rolePresets/characterThemes） |
| rolePresets | array | **内置角色主题（主入口）**，0..8 条；内置目录为 human/cat/dog/origami 四条；source 必须 'builtin' |
| characterThemes | array | 已安装/用户派生的角色主题，0..64 条；source 为 'local' / 'remote'，不得与 rolePresets 同 id |
| characters / voices / dialoguePacks / themes / backgrounds / fonts | array | 六类**可选组件**，每类 1..64 条（角色主题引用它们；用户可自定义） |
| calendarEvents | object? | 可选内容日历（'famling.calendar/0.1'）：节日/季节/工作日-周末台词，纯数据、无网络；缺失时行为不变，选择逻辑见 'src/pet/calendar-events.ts' |

未知顶层字段、未知分类、重复 id 都会被严格解析器拒绝。v1 文档（0.1）经 deprecated 适配解析后返回 v2 视图：'legacy: true'、'rolePresets'/'characterThemes' 为空。

### 2.1.1 角色主题条目（rolePresets / characterThemes）

| 字段 | 类型 | 说明 |
|---|---|---|
| id / name / description | string | kebab id ≤32 / 纯文本 ≤48 / ≤280 |
| characterId | string | 必须引用存在的 characters 条目 |
| voiceId | string | 'none' 或存在的 voice id；猫狗必须 'none'，人形必须可用语音 |
| dialoguePackId | string | 存在的对话包 id |
| appearance | object | '{ themeId, backgroundId, fontId }'，三者都必须存在且 available |
| behaviorPreset? | string | 行为包/目录 id（如 'pet-tinglan-anim' / 'pet-cat'） |
| preview | string | 本地预览图（内置：根相对；包内：包相对） |
| designRef | string | 设计参考/说明文档相对路径（'.md'） |
| usageDeclaration | object | **统一用途声明（强制）**：'researchOnly: true' + canonical statement + statementRef + 六条 prohibitedUses；见 §7 |
| version / source / author | string | SemVer / builtin-local-remote / 纯文本 ≤80 |
| license | object | 'spdx' + 'attribution'（可选 https 'url' / 相对 'file'） |
| aiProvenance | object | 'generated' + 'disclosure'（≤280）+ 可选 'tools[]' |

应用方式（纯函数，不碰 UI 生命周期）：

- 'resolveCharacterTheme(library, id)' → 解析并返回六组件选择；
- 'applyCharacterTheme(library, id, overrides?)' → **一键应用全部**（返回 'ContentSelection'，可带单组件覆盖）；
- 'writeCharacterThemeSelection(library, id, storage?, overrides?)' → 写六键 + 'desktop-games/pet/content/role-theme'；
- 'matchCharacterThemes(library, selection)' → 当前选择匹配哪些角色主题；
- 'createDerivedCharacterTheme(library, baseId, input)' → 在角色基础上派生自定义主题（usageDeclaration 不可改）。

### 2.2 分类与条目

所有条目都有公共字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 小写 kebab-case，'^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'，≤32 |
| name | string | 纯文本，≤48 code points |
| description | string | 纯文本，≤280 code points |
| source | 'builtin' \| 'local' \| 'remote' | 内置目录里均为 'builtin' |
| available | boolean | 是否可用（不可用条目不能作为选择/默认值） |
| remote | object | 仅 source='remote' 时允许；见 §6 |

分类专属字段：

| 分类 | 字段 |
|---|---|
| characters | kind: 'dog'\|'cat'\|'humanoid'\|'origami'；preview（根相对本地图片）；voiceMode: 'tts'\|'none'；bubbleSemantic: 'speech'\|'thought'；characterDir?；products?（'famling' / 'dsh-famling'） |
| voices | voiceId；languages（BCP-47 数组）；availableFor（角色 id 数组）；provider；aiGenerated |
| dialoguePacks | mode: 'standard'\|'brief'\|'quiet'\|'custom'；bubbleChance（0..1）；maxChars（1..240）；saysOverrides?（预留，内置包不使用） |
| themes | vars.bubbleBg / bubbleFg / bubbleBorder / bubbleShadow（必填），vars.panelBg / panelFg / bg（可选） |
| backgrounds | kind: 'transparent'\|'color'\|'pattern'；value（安全 CSS token） |
| fonts | family（本地安全字体栈） |

产品规则（代码强制）：

- 只有 humanoid / origami（人形展示）可以 'voiceMode: tts' + 'bubbleSemantic: speech'；
- dog / cat 固定 'voiceMode: none' + 'bubbleSemantic: thought'，语音目录的 'availableFor' 不得包含它们；
- 默认语音必须对默认角色可用；
- 语音/字体/主题/背景不得包含任何网络资源。

### 2.3 用户选择与持久化

选择键（均由 'readContentSelection' / 'writeContentSelection' 使用，版本化信封 '{"v":1,"data":{"id":...}}'）：

| 选择 | localStorage key |
|---|---|
| character | 'desktop-games/pet/content/character' |
| voice | 'desktop-games/pet/content/voice' |
| dialoguePack | 'desktop-games/pet/content/dialogue-pack' |
| theme | 'desktop-games/pet/content/theme' |
| background | 'desktop-games/pet/content/background' |
| font | 'desktop-games/pet/content/font' |
| roleTheme（0.2 新增，主入口） | 'desktop-games/pet/content/role-theme' |

缺失/损坏/版本更新/未知 id 时逐键回退到 'defaults'，不抛异常、不清空其它键。外观通过 'applyAppearance(doc, library, selection)' 写 CSS 变量与 'data-content-*'；'clearAppearance(doc)' 清理。CSS 变量前缀 '--famling-content-'。

角色主题：'readRoleThemeSelection' / 'writeRoleThemeSelection' / 'clearRoleThemeSelection' 读写单独的角色主题键；一键应用用 'writeCharacterThemeSelection'（六组件键 + role-theme 键一起写，逐个返回状态）。"在角色基础上自己搭配" = 先 'applyCharacterTheme(library, id)'，再对返回的六组件选择做覆盖，然后 'writeContentSelection'。

---

## 3. 第三方内容包（0.2 主推；0.1 deprecated）

### 3.1 完整示例（主题包）

~~~json
{
  "schema": "famling.content-pack/0.1",
  "id": "community.paper-theme",
  "name": "社区纸张主题",
  "version": "0.1.0",
  "category": "themes",
  "description": "暖白纸张主题，纯本地颜色，无外部资源。",
  "license": {
    "spdx": "CC-BY-4.0",
    "attribution": "Example Author (CC-BY-4.0)",
    "url": "https://example.com/license",
    "file": "LICENSE.md"
  },
  "compatibility": {
    "library": "famling.content/0.1",
    "minAppVersion": "0.1.0"
  },
  "boundaries": {
    "network": false,
    "scripts": false,
    "html": false,
    "externalResources": false,
    "paths": "relative-only",
    "maxTextChars": 2000,
    "maxEntries": 16
  },
  "ai": {
    "generated": true,
    "disclosure": "本包由 AI 辅助生成并经人工校对。"
  },
  "entries": [
    {
      "id": "community-paper",
      "name": "社区纸张",
      "description": "暖白纸张配色。",
      "vars": {
        "bubbleBg": "#fffdf7",
        "bubbleFg": "#2b2620",
        "bubbleBorder": "#d8ccb4",
        "bubbleShadow": "0 1px 2px rgba(90,70,40,0.18)"
      }
    }
  ],
  "files": [
    { "path": "entries/preview.png", "bytes": 1024, "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  ]
}
~~~

### 3.2 字段规则

| 字段 | 必须 | 规则 |
|---|---|---|
| schema | 是 | 固定 'famling.content-pack/0.1' |
| id | 是 | 小写点/短横线，≤64；**禁止** 'famling.' / 'famling-' 前缀（内置命名空间保留） |
| name | 是 | 纯文本 ≤48 |
| version | 是 | SemVer |
| category | 是 | characters / voices / dialoguePacks / themes / backgrounds / fonts 之一；未知分类拒绝 |
| description | 是 | 纯文本 ≤280 |
| license | 是 | 'spdx'（SPDX 风格 id）+ 'attribution'（≤200）；可选 'url'（仅 https）与 'file'（相对安全路径） |
| compatibility | 是 | 'library' 必须等于 'famling.content/0.1'；可选 'minAppVersion' / 'maxAppVersion'（SemVer，对比目录 version） |
| boundaries | 是 | 'network' / 'scripts' / 'html' / 'externalResources' 必须为 false；'paths' 必须为 'relative-only'；'maxTextChars' ≤6000；'maxEntries' ≤64 |
| ai | 是 | 'generated' 布尔 + 'disclosure' 纯文本 ≤280；generated=true 时 disclosure 至少 4 个 code points |
| entries | 是 | 1..64 条，字段与 §2.2 对应分类一致（source 省略即视为 local；available 省略即 true）；characters.preview 在包内必须是**包内相对路径**（不以 '/' 开头），与内置目录的根相对路径不同 |
| files | 否 | ≤128 个；path 相对且安全（§1.2 扩展名白名单）；bytes 0..8 MiB，合计 ≤32 MiB；sha256 为 64 位小写 hex（可选） |
| createdAt | 否 | 'YYYY-MM-DD' |

未知字段一律拒绝（closed schema）。整包 JSON 上限 256 KiB。

### 3.3 校验、合并与优先级

标准流程（纯函数，不碰文件系统）：

1. 'validateContentPack(input)' → '{ ok: true, pack }' 或 '{ ok: false, issues }'；只返回问题，不抛异常；
2. 'mergeInstalledPacks(library, packs)' → 把本地包合并进内置目录，返回 'library / added / conflicts / skippedPacks / packIds'：
   - 内置条目**不可被覆盖**（'builtin-shadow'）；
   - 同一个包 id 出现多次 → 全部跳过（'duplicate-pack-id'，有歧义）；
   - 不同包声明同一个条目 id → 按传入顺序先到先得，后者记 'duplicate-installed'；
   - 不兼容/非法包跳过并记录，不中断其它包；
3. 合并结果仍是合法目录（可用 'parseContentLibrary(JSON.parse(JSON.stringify(merged.library)))' 复验）；
4. UI 只渲染合并后目录；**不得**绕过校验直接把包 JSON 塞进状态。

'mergeInstalledPacks' 不会修改传入的 library。

### 3.4 saysOverrides（预留接口）

对话包可选覆盖单条区域/动作台词，内置包不使用：

~~~json
{
  "mode": "brief",
  "bubbleChance": 0.2,
  "maxChars": 40,
  "saysOverrides": {
    "region:head": ["你好。", "早上好。"],
    "action:pat": ["再摸一下。"]
  }
}
~~~

键格式：'^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*){1,3}$'（如 'region:head'、'action:pat'）；最多 32 个键、每键 1..12 行，单行不超过该包 maxChars。解析入口 'resolveDialogueBehavior(library, selection).pickLine(key, random?)'：未命中返回 null（宿主回退到 regions.json 自带台词）。

### 3.5 与 dsh-famling 'content-extension.mjs' 的关系（只读说明）

dsh-famling **0.9.1** 已发布 **content-extension v2**（`schemaVersion: 2`，6 类 kind：character / voice / dialogue / theme / background / font；source：bundled / local / remote；导出 `CONTENT_EXTENSION_POINTS`、`validateContentPack`、`CONTENT_PACK_EXAMPLE`，不加载任何 pack）。它与共享 `famling.content-pack/0.1` 是**相近但独立的两套契约**：

| 本规范（共享 0.1） | dsh-famling content-extension v2 | 说明 |
|---|---|---|
| characters / voices / dialoguePacks / themes / backgrounds / fonts | character / voice / dialogue / theme / background / font | 六类一一对应；命名/字段仍各自校验 |
| source: builtin / local / remote | bundled / local / remote | builtin ≡ bundled |
| entries 内联六类字段 | entry = kind + preview + apply + permissions | 插件把“应用动作”建模为 apply；共享模型是目录条目 + 解析函数 |
| pack id 保留 `famling.*` | pack 无保留前缀规则 | 共享模型更严格 |
| `validateContentPack` 返回 issues 对象 | 返回 `{ ok, errors: string[] }` | 调用方分别适配 |

当前收敛策略：**不强行合并 schema**。

1. 共享目录是 famling 的 canonical；插件保留自己的 v2 契约与存储键，六类 UI 已对齐，不再需要 4→6 的适配层；
2. 插件声音 tab 是**浏览器 speechSynthesis 动态列表**，与 famling 的 DeepSeek stella/tide 不是同一来源；只映射“是否允许 TTS”策略，不互相覆盖；
3. CSS 前缀不同（共享 `--famling-content-*`，插件 `--dsh-famling-*`），主题/背景/字体选择分别生效；
4. 两套契约各自 fail-closed，第三方 pack 均只接受纯数据；未来若要统一，必须 MAJOR bump + 双读迁移，不能静默放宽。

### 3.6 内容包 0.2（角色主题包 / zip 素材包）

0.2 把第三方包从“单分类 entries”升级为“**角色主题包**”，并强制统一用途声明。完整字段规则、zip 布局与第三方起步流程见 [docs/content-packs/README.md](../../docs/content-packs/README.md)。

~~~text
my-character-theme.zip
  pack.json        # famling.content-pack/0.2：roleThemes + usageDeclaration + license + aiProvenance + files(sha256)
  LICENSE.md       # 可选，根目录文档白名单
  DESIGN.md        # 可选
  assets/          # 仅 png / webp / json / woff2
    preview/<theme>.preview.png
    sprites/idle/idle_00.png
~~~

必备字段（缺一即拒绝）：

| 字段 | 要求 |
|---|---|
| usageDeclaration | 'researchOnly: true' + canonical 短句逐字（'CONTENT_USAGE_STATEMENT'）+ 'statementRef' + 六条 'prohibitedUses'；不符/缺失 → 'missing-usage-declaration' / 'usage-statement-mismatch' |
| license | 'spdx' + 'attribution'；无有效许可不得合并/分发 |
| aiProvenance | 'generated' + 'disclosure'；AI 生成必须如实披露 |
| compatibility | 'library' 必须为 'famling.content/0.2'；min/maxAppVersion 按目录版本协商 |
| roleThemes | 1..8 条角色主题（一键切换主内容） |
| files | 1..128 条；每条 'path' + 'bytes' + 'sha256'；与解压清单一一对应 |
| source/remote | 'source: remote' 必须带 Ed25519 'remote.signature'；**远程未签名一律拒绝**（'missing-signature'）；合并时没有验签回调 → 'unverified-remote' |

校验入口（纯函数，不读盘、不联网）：

- 'validateContentPackV2(packJson)' → '{ ok, pack }' 或 '{ ok:false, issues }'；
- 'validatePackZip(pack, inventory)' → 校验 zip 路径/大小/资产类型/哈希（宿主负责解压 + 计算 sha256）；
- 'mergeCharacterThemes(library, packs, { verifyRemote? })' → 原子合并角色主题与组件；内置 'rolePresets' 不可被覆盖（'builtin-shadow'）；
- 校验错误码包括：'missing-usage-declaration'、'invalid-usage-declaration'、'usage-statement-mismatch'、'missing-prohibited-use'、'missing-ai-provenance'、'unsafe-zip-entry'、'forbidden-asset-type'、'missing-file'、'unlisted-file'、'file-size-mismatch'、'hash-mismatch'、'zip-too-large'、'missing-signature'、'invalid-signature'、'unknown-signing-key'、'revoked-signing-key'、'unverified-remote'、'missing-references'。

三个可直接校验的示例（占位资产引用，不加载）：'docs/content-packs/examples/{human,cat,dog}.example.pack.json'，配套设计参考 'HUMAN/CAT/DOG-DESIGN-REFERENCE.md'（96×96、12 clip、68/72 帧、地线 y=89、调色/剪影/动作/语气/禁止事项）。

### 3.7 角色动画资产包 0.2（'famling.pet-anim/0.2'；spec 层，新 rig）

内容包 0.2（角色主题）只能复用内置 rig；**新 rig/新动画**走独立的 'famling.pet-anim/0.2' payload（两套 schema 并存，只共享 envelope）。规范全文见 [docs/content-packs/ANIM-PACK-0.2.md](../../docs/content-packs/ANIM-PACK-0.2.md)，人/猫/狗示例见 'docs/content-packs/examples/{human,cat,dog}.anim.example.pack.json'。

~~~text
my-character-anim.zip
  pack.json                        # famling.pet-anim/0.2：spec + animations(12 clip) + voice + behavior + regions + 声明 + files(sha256)
  LICENSE.md / DESIGN.md           # 可选根目录文档白名单
  assets/anim/<clip>/<clip>_NN.png # 12 clip 帧，命名固定；PNG only
  assets/preview/<name>.png|webp   # 必需预览
  assets/audio/sfx/*.ogg           # 可选；audio.redistribution.confirmed=true 才允许
  assets/audio/voice/*.ogg         # 可选；仅 humanoid；cat/dog 永不 baked voice
~~~

硬约束摘要：

- 12 个 canonical clip 全量（idle/idle_blink/walk/run/pat_head/ball_throw/ball_chase/paw_face/scratch/stand_wag/chase_tail/attack）；loop/layer/category/priority 固定，作者只改 frames/fps/holdMs；
- 'voice' 按 kind 固定：humanoid = tts/speech，cat/dog = none/thought；
- 'behavior' 复用 'famling.behavior/0.1'，'regions' 复用 regions v1；事件必须能在 behavior.slots 声明，避免死交互；
- 音频仅 OGG（Opus）；任何音频文件都需要 'audio.redistribution.confirmed: true'（D8 再分发权硬门）；
- zip 上限/路径/sha256 校验与内容包 0.2 共用（'validateCharacterPackZip'）；安装计划只产出宿主相对路径（'planCharacterPackInstall'），**不接真实文件系统安装**。

校验入口：'validateCharacterPackV2(packJson)' / 'validateCharacterPackZip(pack, inventory)' / 'verifyRemoteCharacterPack(...)' / 'planCharacterPackInstall(request)' / 'planCharacterPackUninstall(request)'。

**未实现（不得对外宣称）**：数据驱动注册表 + 热切换（MB-041）、本地安装器（MB-042，含原子安装/卸载/回滚）、第三方签名/审核门（MB-043）、真实市场下载。UI/市场文案在实现前不得暗示“可安装新角色”。
---

## 4. 安全边界（0.2 硬约束）

1. **无网络**：'src/pet/content-library.ts' 不 fetch、不 import node:http、不读 URL；包内 'url' / 远程市场 'download.url' 仅为展示/审计元数据。远程市场只定义 data/validate/verify 契约，不联网。
2. **无脚本**：不接受 JS/TS/WASM/exe；包只含 JSON，不执行任何代码；不 eval/new Function。zip 素材白名单：内容包 'png' / 'webp' / 'json' / 'woff2'；动画资产包另允许帧 PNG、预览 PNG/WebP、音频 OGG（见 §3.7）。
3. **无 HTML**：所有名称/描述/台词拒绝 '<' 与 '>'；UI 必须用 textContent / React children 渲染，禁止 innerHTML 拼接。
4. **文本长度**：name ≤48、description ≤280、AI disclosure ≤280、license attribution ≤200、author ≤80、单行台词 ≤240、整包文本合计 ≤6000、saysOverrides 键 ≤32。
5. **路径限制**：只允许规范化相对路径；拒绝 '../'、绝对/UNC/盘符/根路径、反斜杠、':'（ADS）、'#'、'?'、控制字符、URL scheme、Windows 保留名、尾点/尾空格；zip 还拒绝大小写碰撞条目。
6. **颜色/字体注入**：颜色/阴影/渐变/字体必须通过 'isSafeCssColor'、'isSafeCssShadow'、'isSafeCssPattern'、'isSafeFontFamily' 校验；拒绝 'url('、'@import'、'var('、'expression('、';'、'{'、'}'、反斜杠等声明注入。字体只允许本地字体栈，禁止网络字体。
7. **许可**：每个角色主题/内容包必须有 SPDX 风格 license id + 署名；作者对素材权利负责。无有效许可不得合并/分发。
8. **AI 标识**：每个角色主题/内容包必须有 'aiProvenance.generated' + 'disclosure'；生成内容必须在 UI 中展示声明，不得冒充真人/官方。
9. **统一用途声明（0.2 强制）**：每个角色主题/内容包必须带 'usageDeclaration'（researchOnly=true + canonical 短句逐字 + statementRef + 六条 prohibitedUses）；缺失/不符/缺禁止项一律拒绝（'missing-usage-declaration' / 'usage-statement-mismatch' / 'missing-prohibited-use'）。UI 导入前必须让用户显式确认（'describeUsageConfirmation()'）。
10. **同意门**：本地包加载/安装属于内容修改，必须逐次通过既有 TOS/DLC 同意门；用户选择不构成安装同意。
11. **远程签名 fail-closed**：远程包（'source: remote'）必须带 Ed25519 签名；未签名 → 'missing-signature'；未知/吊销/过期 key → 'unknown-signing-key' / 'revoked-signing-key' / 'key-outside-validity'；没有验签回调的合并一律 'unverified-remote'。zip 下载先校验 sha256（'hash-mismatch'）再验签。
12. **不冒充真人**：语音只允许官方合成音色 ID（stella/tide），禁止真人声线克隆/未授权音源；角色不得冒充真人或官方；AI 身份不得否认。

---

## 5. 作者检查清单（0.2）

- [ ] schema='famling.content-pack/0.2'，id 未使用 'famling.' 保留前缀；
- [ ] roleThemes 1..8 条，每条含 characterId / voiceId / dialoguePackId / appearance / preview / designRef / version / source / author / license / aiProvenance；
- [ ] 猫狗 'voiceId: none'，人形 'voiceId' 为可用语音；
- [ ] usageDeclaration 逐字 canonical + researchOnly=true + 六条 prohibitedUses（缺一不可）；
- [ ] license 有 spdx + attribution，素材有分发权；
- [ ] aiProvenance.generated + disclosure 诚实填写，未删 AI 标识；
- [ ] compatibility.library='famling.content/0.2'，min/maxAppVersion 合理；
- [ ] files 路径安全、仅 png/webp/json/woff2（+根目录文档白名单）、bytes/sha256 与解压清单一致；
- [ ] zip ≤16 MiB、条目 ≤256、单文件 ≤8 MiB、解压总量 ≤32 MiB、压缩比合理（防 zip bomb）；
- [ ] 本地跑 'validateContentPackV2' → 'validatePackZip' 返回 ok；
- [ ] 远程分发包已签名（目录 + zip sha256 + pack remote.signature），未签名不得上架；
- [ ] 不包含网络请求、脚本、HTML、真人照片/声线、未成年人或性内容、医疗/法律/金融建议、情感陪伴/虚拟伴侣用途。

**新 rig（'famling.pet-anim/0.2'）额外检查**（详见 'docs/content-packs/ANIM-PACK-0.2.md'）：

- [ ] schema='famling.pet-anim/0.2'、kind ∈ cat/dog/humanoid、12 clip 全量且 loop/layer/category/priority 为 canonical 值；
- [ ] 帧文件恰好 'assets/anim/<clip>/<clip>_NN.png'，帧数与 animations 一致；预览在 'assets/preview/' 且列在 files；
- [ ] voice 按 kind 固定（humanoid=tts/speech；cat/dog=none/thought）；cat/dog 无 baked voice line；
- [ ] behavior 的 state tag 落在 12 clip 内、slot 指向已声明 state；regions 事件能在 slots 找到；
- [ ] 音频仅 .ogg 且 'audio.redistribution.confirmed=true'（未清权不得携带）；
- [ ] 'validateCharacterPackV2' + 'validateCharacterPackZip' 返回 ok；远程包 'verifyRemoteCharacterPack' 通过；
- [ ] 不宣称“已可安装/已可玩新角色”——MB-041/042 未实现。

---

## 6. 远程在线市场（0.2 契约；一定会做，但本任务只定义数据/校验/验签，不联网）

产品决定：**远程在线市场一定会做**。0.2 只落地“可审计的契约 + 纯函数校验/验签”，不 fetch、不安装、不上架；UI/安装器/支付后续接。完整字段与流程见 [docs/content-packs/README.md](../../docs/content-packs/README.md) §6。

### 6.1 市场目录 catalog（'famling.market-catalog/0.1'）

~~~json
{
  "schema": "famling.market-catalog/0.1",
  "version": "0.3.0",
  "updatedAt": "2026-11-19T12:00:00Z",
  "keyId": "famling-market-2026",
  "signature": { "algorithm": "ed25519", "keyId": "famling-market-2026", "value": "<base64>" },
  "packs": [
    {
      "id": "community.selkirk-theme",
      "name": "社区卷毛猫",
      "version": "1.0.0",
      "description": "...",
      "preview": "https://market.example/preview/selkirk.png",
      "usageDeclaration": { ... 同 §7 canonical 声明 ... },
      "download": { "url": "https://market.example/packs/community.selkirk-theme-1.0.0.zip", "zipSha256": "<64 hex>", "bytes": 1234567 },
      "signature": { "algorithm": "ed25519", "keyId": "famling-market-2026", "value": "<base64>" }
    }
  ]
}
~~~

| 字段 | 规则 |
|---|---|
| schema | 固定 'famling.market-catalog/0.1' |
| version / updatedAt | SemVer / 'YYYY-MM-DD' 或 ISO-8601 UTC |
| keyId | 目录签名 key id；必须等于 'signature.keyId' |
| signature | '{ algorithm: ed25519, keyId, value }'（detached，覆盖 canonical catalog JSON，不含 signature 本身） |
| packs[] | 1..256 条；id/name/version/description/preview?/usageDeclaration/download/signature |
| download.url | 仅 credential-free https；本模块不请求 |
| download.zipSha256 | 64 位小写 hex；下载后必须先比对 |
| download.bytes | 1..16 MiB |
| usageDeclaration | 目录条目也必须展示统一用途声明（UI 在下载前就能给用户看） |

### 6.2 验签接口（Ed25519 + 信任根，fail-closed）

- 签名对象 = canonical JSON（键排序、UTF-8）字节；detached Ed25519 base64：
  - 'marketCatalogSignaturePayload(catalog)'；
  - 'marketPackSignaturePayload(packRef)'；
  - 'remoteContentPackSignaturePayload(pack)'（'remote.signature' 本身不参与签名）。
- 信任根：'{ keys: [{ keyId, algorithm: 'ed25519', publicKeyPem, fingerprintSha256?, status: 'active'|'retired'|'revoked', notBefore?, notAfter? }] }'；编译期内置公钥，不放进可写目录（对齐 'docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md'）。
- API（注入 verifier，Node 用 node:crypto、浏览器用 WebCrypto；本模块不联网）：
  - 'verifyMarketCatalogSignature(catalog, trustRoot, verifier, { now? })'；
  - 'verifyMarketPackDownload(packRef, actualZipSha256, trustRoot, verifier, { now? })' → 先 'hash-mismatch' 再 'invalid-signature'；
  - 'verifyRemoteContentPack(pack, trustRoot, verifier, { now? })'；
  - 'mergeCharacterThemes(library, packs, { verifyRemote })'：远程包没有验签结果一律 'unverified-remote' 跳过。
- 失败码：'missing-signature' / 'invalid-signature' / 'unknown-signing-key' / 'revoked-signing-key' / 'key-outside-validity' / 'hash-mismatch' / 'unverified-remote'。未知/吊销 key 一律 fail-closed；retired 只用于验旧包。

### 6.3 下载 / 安装流程（未实现，UI + 安装器后续接）

1. acquire catalog → 'validateMarketCatalog' → 'verifyMarketCatalogSignature'；
2. 用户在**看到 usageDeclaration 并显式确认**后点下载；
3. 下载 zip → 'verifyMarketPackDownload'（zip sha256 + 签名）；
4. 解压 → 'validatePackZip'（路径/大小/资产类型/哈希）；
5. pack.json 若 'source: remote' → 'verifyRemoteContentPack'（pack 自身 remote.signature）；
6. 'mergeCharacterThemes(..., { verifyRemote })' → 原子合并；内置 rolePresets 不可覆盖；
7. 安装/升级：同一包先安装新版本再原子替换旧目录，失败保留旧版本；可离线使用、不静默更新、不采集使用数据；必须可卸载。

### 6.4 v1 远程字段（deprecated 适配）

'famling.content-pack/0.1' 的 'source: remote' / 'remote' 旧字段仍可解析（'remote.signature' 可选）；但 0.2 的远程包校验要求 'remote.signature' 必填，并建议走上述 catalog + download 契约。0.1 的 'remote' 只作为 deprecated 展示/审计元数据，不再作为信任依据。

---

## 7. 内容与用途边界（统一声明，强制）

canonical 短句（来源 'docs/legal/USE-RESTRICTIONS-2026-11-19.md' §1，所有角色主题/内容包逐字引用）：

> 本项目及其全部代码、美术、音频、文案、角色素材和衍生物仅用于技术研究与原型验证，不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途。

'usageDeclaration' 必须是：

~~~json
{
  "researchOnly": true,
  "statement": "<canonical 短句逐字>",
  "statementRef": "docs/legal/USE-RESTRICTIONS-2026-11-19.md",
  "prohibitedUses": [
    "emotional-companionship",
    "virtual-partner",
    "professional-advice",
    "minor-intimacy",
    "impersonation",
    "illegal-use"
  ]
}
~~~

- canonical 短句 UTF-8 SHA-256：'0353536cefd702014b12a8365c4a486f19848d049652e9692027216adb80c743'（'CONTENT_USAGE_STATEMENT_SHA256'）；
- 'describeUsageConfirmation()' 给 UI 返回渲染所需文本/链接/哈希；**导入/激活前必须让用户显式确认**（'CONTENT_USAGE_CONFIRMATION_REQUIRED === true'）；
- 本内容系统服务于**技术研究与原型验证**：不得用于情感陪伴/虚拟伴侣/付费情感关系、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人或官方；
- 不得以"内容市场"形式售卖情感依赖、付费亲密度、抽卡式情感奖励；
- 角色主题/组件/内容包等静态内容可以作为研究性 DLC/市场形态，但必须保留许可、AI 标识、用途声明、同意门与可卸载；
- 完整使用限制见 'docs/legal/USE-RESTRICTIONS-2026-11-19.md' 与各产品 README/TOS。

---

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版：'famling.content/0.1'、'famling.content-pack/0.1'、六分类内置目录、选择持久化/外观/对话解析、本地包校验与合并规则、远程市场预留字段与签名接口。核心实现 'src/pet/content-library.ts'，34 项测试见 'tests/content-library.test.ts'。 |
| 2026-11-19 | **v2（task-52 产品澄清）**：角色即主题——新增 'rolePresets'（human/cat/dog/origami 一键应用）与 'characterThemes'（导入/派生）；库 schema 升 'famling.content/0.2'（0.1 deprecated 适配）；新增 'famling.content-pack/0.2'（zip 素材包 + JSON 清单、强制统一用途声明、license、aiProvenance、files+sha256）；新增远程市场 catalog + Ed25519 验签契约（不联网）；新增 'docs/content-packs/' 三份设计参考 + 三个 example pack；新增 v2 测试 'tests/content-pack-v2.test.ts'。v1 导出保留（deprecated），未删。 |
| 2026-11-19 | **新 rig spec 层（task-76 / MB-040/044）**：新增 'famling.pet-anim/0.2' schema + 'validateCharacterPackV2' / 'validateCharacterPackZip' / 'characterPackSignaturePayload' / 'verifyRemoteCharacterPack' / 'planCharacterPackInstall' / 'planCharacterPackUninstall'；新增 zip 布局、12 clip canonical 契约、audio 权利门、安装器 PLAN 接口、human/cat/dog 三个 68/72 帧 anim 示例与 'docs/content-packs/ANIM-PACK-0.2.md'。**loader/注册表/热切换/真实安装器/签名审核门未实现**；不改 UI，不提“可安装”。 |
