# Famling 内容中心 / 主题市场（数据规范 0.1）

> 状态：**规范 + 纯函数核心已落地，安装器/UI/远程市场未实现**。
> schema：内置目录 'famling.content/0.1'；第三方内容包 'famling.content-pack/0.1'。
> 唯一校验实现：'src/pet/content-library.ts'；回归测试：'tests/content-library.test.ts'。
> 本目录只放**声明式数据**（JSON + 本地图片/文本）。0.1 不联网、不执行脚本、不加载 HTML。

famling（独立桌宠应用）与 dsh-famling（DSH 插件）共用这一份目录与选择语义：角色、语音、对话包、主题、背景、字体。两个产品各自保留 UI，只消费同一套数据。

---

## 1. 目录结构

### 1.1 仓内（随应用发布，只读）

~~~text
public/content/
  library.json        # 内置目录（famling.content/0.1），运行时只读
  README.md           # 本文件
~~~

'library.json' 由代码/测试的严格解析器读取（'parseContentLibrary'）。**不要**在运行时改写它；用户选择保存在本机 localStorage，不写回该文件。

### 1.2 本地安装包（0.1 预留，安装器未实现）

~~~text
<userData>/content-packs/<packId>/
  pack.json           # 必需：famling.content-pack/0.1，内联 entries
  LICENSE.md          # 推荐：人读许可文本（pack.json license.file 指向它）
  entries/            # 可选：本地资源，仅允许安全扩展名
    preview.png
~~~

约定：

- packId 必须等于 'pack.json' 的 'id'；
- 所有资源路径相对包根目录，**不得**出现 '..'、绝对路径、盘符、UNC、反斜杠、ADS（':'）、'#'、'?'；
- 允许的扩展名：'png'、'webp'、'json'、'md'、'txt'、'wav'、'ogg'；禁止 exe/js/html/svg/woff 等可执行或可注入资源；
- 同一路径不得在 'files' 中重复声明。

> 未来安装器必须先走同意门（TOS/DLC 逐次确认）再读取/复制文件；本规范不授权自动安装。

---

## 2. 内置目录 'public/content/library.json'

### 2.1 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| schema | string | 固定 'famling.content/0.1' |
| version | SemVer | 目录版本，如 '0.1.0' |
| updatedAt | 'YYYY-MM-DD' | 最近更新日期 |
| defaults | object | 六类默认选择，必须引用存在且 available 的条目 |
| characters / voices / dialoguePacks / themes / backgrounds / fonts | array | 六个分类，每类 1..64 条 |

未知顶层字段、未知分类、重复 id 都会被严格解析器拒绝。

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

缺失/损坏/版本更新/未知 id 时逐键回退到 'defaults'，不抛异常、不清空其它键。外观通过 'applyAppearance(doc, library, selection)' 写 CSS 变量与 'data-content-*'；'clearAppearance(doc)' 清理。CSS 变量前缀 '--famling-content-'。

---

## 3. 第三方内容包 'famling.content-pack/0.1'

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

dsh-famling 0.9.0 已发布**自己的预留契约** 'content-extension.mjs'（'schemaVersion: 1'，4 类 kind：character / voice / dialogue / theme；source：bundled / local / remote；导出 'CONTENT_EXTENSION_POINTS'、'validateContentPack'、'CONTENT_PACK_EXAMPLE'，不加载任何 pack）。本仓的 'famling.content-pack/0.1' 是**共享模型的目标超集**，不是同一份 schema：

| 本规范（共享 0.1） | dsh-famling content-extension v1 | 说明 |
|---|---|---|
| categories: characters / voices / dialoguePacks / themes / backgrounds / fonts | kinds: character / voice / dialogue / theme | 前四类可一一映射；backgrounds / fonts 插件侧暂无对应 |
| source: builtin / local / remote | bundled / local / remote | builtin ≡ bundled |
| entries 内联六类字段 | entry = kind + preview + apply + permissions | 插件契约把"应用动作"建模为 apply；共享模型是目录条目 + 解析函数 |
| pack id 保留 'famling.*' | pack 无保留前缀规则 | 共享模型更严格 |
| 'validateContentPack' 返回 issues 对象 | 返回 '{ ok, errors: string[] }' | 调用方必须分别适配 |

收敛建议（**不在本任务改插件**）：

1. 先做**适配层**：把共享目录中四类内置内容投影成插件 v1 entry（character→select:character、voice→select:voice、dialogue→select:dialogue、theme→apply:theme），保留插件 0.9.0 的存储键与 UI 不破坏；
2. 插件已实现的声音 tab 是**浏览器 speechSynthesis 动态列表**，与共享目录的 DeepSeek stella/tide 不是同一来源，不能互相覆盖；适配层只映射"是否允许 TTS"策略；
3. 主题 CSS 前缀不同（共享 '--famling-content-*'，插件 '--dsh-famling-*'），适配层做变量名翻译；
4. 等方案稳定后再考虑 content-extension v2（增加 backgrounds/fonts 与统一校验结果），按 MAJOR 版本做迁移；在此之前两套契约并存、各自 fail-closed。

---

## 4. 安全边界（0.1 硬约束）

1. **无网络**：'src/pet/content-library.ts' 不 fetch、不 import node:http、不读 URL；包内 'url' 仅为展示/审计元数据。boundaries.network 必须 false。
2. **无脚本**：不接受 JS/TS/WASM/exe；包只含 JSON，不执行任何代码；不 eval/new Function。
3. **无 HTML**：所有名称/描述/台词拒绝 '<' 与 '>'；UI 必须用 textContent / React children 渲染，禁止 innerHTML 拼接。
4. **文本长度**：name ≤48、description ≤280、AI disclosure ≤280、license attribution ≤200、单行台词 ≤240（SECURITY_LIMITS.bubbleChars，且不得超过对话包 maxChars）、整个包文本合计 ≤6000、saysOverrides 键 ≤32。
5. **路径限制**：只允许规范化相对路径；拒绝 '../'、绝对/UNC/盘符/根路径、反斜杠、':'（ADS）、'#'、'?'、控制字符、Windows 保留名、尾点/尾空格；扩展名白名单见 §1.2。
6. **颜色/字体注入**：颜色/阴影/渐变/字体必须通过 'isSafeCssColor'、'isSafeCssShadow'、'isSafeCssPattern'、'isSafeFontFamily' 校验；拒绝 'url('、'@import'、'var('、'expression('、';'、'{'、'}'、反斜杠等声明注入。字体只允许本地字体栈，禁止网络字体。
7. **许可**：每个包必须有 SPDX 风格 license id + 署名；作者对素材权利负责。无有效许可的包不得合并/分发。
8. **AI 标识**：每个包必须有 'ai.generated' + 'ai.disclosure'；生成内容必须在 UI 中展示声明，不得冒充真人/官方。
9. **同意门**：本地包加载/安装属于内容修改，必须逐次通过既有 TOS/DLC 同意门；用户选择不构成安装同意。
10. **不冒充真人**：语音只允许官方合成音色 ID（stella/tide），禁止真人声线克隆/未授权音源；角色不得冒充真人或官方。

---

## 5. 作者检查清单

- [ ] schema / id / version / category 正确，id 未使用 'famling.' 保留前缀；
- [ ] entries 只含该分类允许字段，id 唯一，文本为纯文本且不超长；
- [ ] license 有 spdx + attribution，素材有分发权；
- [ ] ai.generated + disclosure 诚实填写；
- [ ] boundaries 四项全 false、paths='relative-only'；
- [ ] files 路径安全、扩展名在白名单、大小与 sha256 正确；
- [ ] 本地跑 'validateContentPack' 返回 ok（CI 将来会加 CLI 校验）；
- [ ] 不包含网络请求、脚本、HTML、真人照片/声线、未成年人或性内容、医疗/法律/金融建议。

---

## 6. 未来远程市场（仅预留，未实现、不联网）

'famling.content/0.1' 已为远程来源预留两个字段，**0.1 代码不会解析市场、不会联网、不会验签**；当前手工安装流程也不需要它们。

### 6.1 source / remote

~~~json
{
  "id": "community-paper",
  "source": "remote",
  "remote": {
    "marketId": "community.market",
    "version": "0.2.0",
    "url": "https://market.example/content/community.paper-theme",
    "signature": {
      "algorithm": "ed25519",
      "keyId": "community-2026",
      "value": "base64url-detached-signature..."
    }
  }
}
~~~

| 字段 | 规则 |
|---|---|
| source | 'builtin' / 'local' / 'remote'；remote 必须带 remote 对象 |
| remote.marketId | 小写点/短横线 id |
| remote.version | SemVer（市场侧条目版本） |
| remote.url | 可选，仅 https、无凭据；仅展示/审计，0.1 不请求 |
| remote.signature | 可选预留：algorithm 固定 'ed25519'，keyId 小写 id，value 16..2048 字符 |

### 6.2 签名接口（预留契约）

- 签名对象 = 规范化（RFC 8785 风格）pack.json 字节或市场清单，不包含签名本身；
- 信任根不放进可写目录：编译期内置公钥（参考 'docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md' 的生产信任根方案）；
- 支持 key id、轮换（active/retired）、吊销（revoked）；未知/吊销 key 一律 fail-closed；
- 验签 + 校验 'validateContentPack' 都通过后，才允许进入 'mergeInstalledPacks'；
- 下载/安装必须显式用户同意，可离线使用，不做静默更新、不采集使用数据；
- 远程市场只分发声明式内容包；**不**分发可执行代码。

### 6.3 版本协商

- 包 'compatibility.library' 必须等于宿主目录 schema；
- 'minAppVersion' > 宿主目录 version 或 'maxAppVersion' < 宿主 version → 不兼容（跳过并提示）；
- 同一包升级先安装新版本，再原子替换旧目录；失败保留旧版本。

---

## 7. 内容与用途边界

本内容系统服务于**技术研究与原型验证**：

- 不得用于情感陪伴/虚拟伴侣/付费情感关系、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人或官方；
- 不得以"内容市场"形式售卖情感依赖、付费亲密度、抽卡式情感奖励；
- 主题/背景/字体/对话包等静态内容可以作为研究性 DLC/市场形态，但必须保留许可、AI 标识、同意门与可卸载；
- 完整使用限制见 'docs/legal/USE-RESTRICTIONS-2026-11-19.md' 与各产品 README/TOS。

---

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版：'famling.content/0.1'、'famling.content-pack/0.1'、六分类内置目录、选择持久化/外观/对话解析、本地包校验与合并规则、远程市场预留字段与签名接口。核心实现 'src/pet/content-library.ts'，34 项测试见 'tests/content-library.test.ts'。 |
