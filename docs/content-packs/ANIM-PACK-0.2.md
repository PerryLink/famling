# 角色动画资产包规范 `famling.pet-anim/0.2`（spec + 运行时层）

> 状态：**规范 + 纯函数校验 + 安装器 PLAN + 运行时层模块已落地（MB-040/MB-044 的 spec 部分；MB-041/MB-042 的纯逻辑部分）；真实 host I/O 适配器、UI/main 接线、渲染器适配、签名审核门（MB-043）均未实现**。
> 日期：2026-11-19（Asia/Shanghai）；唯一校验实现：`src/pet/content-library.ts`（`validateCharacterPackV2` / `validateCharacterPackZip` / `planCharacterPackInstall` / `verifyRemoteCharacterPack`）；运行时状态机：`src/pet/character-packs.ts`。
> 回归测试：`tests/content-pack-v2.test.ts`（§11）+ `tests/content-library.test.ts`（docs/examples gate）+ `tests/character-packs.test.ts`（运行时层 20 项）。
> 上游：`docs/plan/MASTER-BACKLOG-2026-11-19.md` MB-040/044；`docs/plan/REVIEW-TRIAGE-ARCH-2026-11-19.md` E5-T5/E6-T5；`docs/plan/REVIEW-TRIAGE-QUALITY-2026-11-19.md` QT-506。
> **条件项说明**：按 QUALITY triage M-05，第三方“新 rig/新动画”在 D-1 触发前不接 UI/host；本任务只做纯注入的运行时层（未接线），市场文案不暗示可安装新角色；本文件冻结**数据契约 + 运行时契约**，避免未来返工。

---

## 0. 一句话

`famling.pet-anim/0.2` 是**第三方新角色的纯数据资产包**：一个 `pack.json` 清单 + 12 个 canonical clip 的逐帧 PNG + 可选 Ogg 音频 + 必需预览图；ZIP 分发、宿主解压、校验器做 fail-closed 校验，宿主安装器按 PLAN 原子安装。**包里没有任何代码/HTML/网络资源**。

与既有 `famling.content-pack/0.2`（角色=主题包）是**两套 payload schema**（ARCH triage C-03 裁定）：

| 维度 | `famling.content-pack/0.2` | `famling.pet-anim/0.2` |
|---|---|---|
| 解决 | 换肤/换声音/换对话/换配色（复用内置 rig） | 交付**新 rig/新动画**（数据驱动注册表的前置） |
| 主内容 | `roleThemes[]` + 六类组件 | `spec` + 12 clip 动画表 + `behavior` + `regions` |
| 共享 envelope | `usageDeclaration` / `license` / `aiProvenance` / `compatibility` / `files[]+sha256` / `source(remote+Ed25519)` / zip 上限与路径校验 | 同左 |
| 运行时接入 | 已接入内容中心 v2 | **规范 + 运行时层模块已就绪；未接入 UI/main/渲染器**（MB-041 接线未做；未实现前不得暗示可安装新角色） |

---

## 1. ZIP 布局（规范分发形态）

```text
my-character-anim.zip
  pack.json                                  # 必需：famling.pet-anim/0.2（UTF-8，≤256 KiB）
  LICENSE.md                                 # 可选：根目录文档白名单 LICENSE/NOTICE/README/DESIGN.md
  DESIGN.md                                  # 可选：设计说明/来源/授权链
  assets/
    anim/
      idle/idle_00.png                       # 12 clip × frames 帧；命名固定 <clip>/<clip>_NN.png
      idle/idle_01.png
      ...
      attack/attack_06.png
    preview/my-character.preview.png         # 必需：assets/preview/*.{png,webp}
    audio/
      sfx/my-meow.ogg                        # 可选：仅 .ogg（Opus），且 audio.redistribution.confirmed=true
      voice/greeting.ogg                     # 可选：仅 humanoid；cat/dog 永远禁止 baked voice
```

硬规则：

- 文件命名模式固定为 `assets/anim/<clip>/<clip>_NN.png`（`NN` = 00..frames-1，两位零填充）；不接受其它目录/前缀/扩展名；
- 每个 clip 的帧文件必须**恰好**等于 `animations.clips.<clip>.frames` 张，多一张/少一张都 fail-closed；
- 帧只允许 PNG（像素管线确定性）；预览允许 PNG/WebP；音频只允许 OGG（Opus）；
- 除 `pack.json` 与根目录文档外，ZIP 内每个文件都必须列在 `files[]` 且 sha256/bytes 与清单一致；
- `pack.json` 自身不需要 sha（宿主落盘时另行哈希），但大小 ≤256 KiB；
- 任何脚本/HTML/SVG/JSON 资产/字体/WASM/可执行文件/URL 资源/路径穿越/symlink/加密 zip 一律拒绝。

也支持 **JSON 清单形态**（只分发 `pack.json`，素材由宿主从自己的目录补充）；两种形态共用同一套清单校验与 `files[]+sha256` 要求。

---

## 2. `pack.json` 字段总表（closed schema，未知字段拒绝）

| 字段 | 必需 | 规则 |
|---|---|---|
| `schema` | 是 | 固定 `famling.pet-anim/0.2` |
| `id` | 是 | 小写点/短横线 ≤64；禁止 `famling.` / `famling-` 前缀（builtin 保留） |
| `name` / `description` | 是 | 纯文本（无 `<>`），≤48 / ≤280 code points |
| `version` | 是 | SemVer |
| `author` | 是 | 纯文本 ≤80 |
| `kind` | 是 | `cat` / `dog` / `humanoid`（`humanoid` 对应人形；origami 无 rig，不进 v0.2） |
| `usageDeclaration` | 是 | **统一用途声明**（canonical 短句逐字 + researchOnly + 6 条 prohibitedUses + statementRef） |
| `license` | 是 | `spdx` + `attribution`；可选 https `url` / 相对 `file`（若声明必须列在 `files`） |
| `aiProvenance` | 是 | `generated` 布尔 + `disclosure`（≤280）+ 可选 `tools[]` |
| `compatibility` | 是 | `library` 必须为 `famling.content/0.2`；可选 `minAppVersion` / `maxAppVersion` |
| `character` | 是 | 见 §3 |
| `spec` | 是 | 见 §4 |
| `animations` | 是 | 见 §5（12 clip 全量） |
| `voice` | 是 | 见 §6（按 kind 固定，不可作者自选） |
| `behavior` | 是 | 见 §7（`famling.behavior/0.1` + 引用完整性） |
| `regions` | 是 | 见 §8（`regions.json` version 1 + 引用完整性） |
| `audio` | 否 | 见 §9；缺省=无 baked 音频（人形仍由宿主 TTS） |
| `preview` | 是 | 包内相对路径，必须在 `assets/preview/`，png/webp，且列在 `files` |
| `files` | 是 | 1..192 条；每条 `path` + `bytes`（≥1）+ `sha256`（64 位小写 hex） |
| `source` | 否 | `local`（默认）或 `remote`；remote 必须带签名 `remote.signature` |
| `remote` | 否 | `marketId` / `version` / 可选 https `url` / 必需 `signature{ed25519,keyId,value}` |
| `createdAt` | 否 | `YYYY-MM-DD` |

---

## 3. `character`（装进注册表前的身份数据）

| 字段 | 必需 | 规则 |
|---|---|---|
| `id` | 是 | 小写点/短横线 ≤64，禁止 `famling.*`；与包 `id` 可不同（一个包只装一个角色时建议相同） |
| `name` | 是 | 纯文本 ≤48 |
| `kind` | 是 | 必须等于包级 `kind` |
| `species` | 否 | 小写 id ≤32（如 `cat` / `dog` / `humanoid`） |
| `traits` | 否 | 1..8 个 lower-kebab id，每个 ≤32 |
| `capabilities` | 否 | `sockets[]` / `roles[]` / `behaviors[]`，各 1..8 个 lower-kebab id |
| `fallback` | 否 | 事件 id → clip id 数组（1..8，3 层以内解析）；用于旧交互缺 clip 时回退 |

`character.id` 是未来数据驱动注册表的键；MB-041 未实现前，本字段只做数据规则校验，不产生任何注册/加载副作用。

---

## 4. `spec`（画布/锚点/脚盒/呈现）

```json
{
  "canvas": [96, 96],
  "anchor": { "x": 48, "y": 96, "mode": "foot-center" },
  "footBox": { "x": -36, "y": -18, "w": 72, "h": 18 },
  "bbox": [12, 8, 72, 84],
  "display": { "scale": 2, "pixelated": true },
  "palette": "cat-selkirk-anim@0.1"
}
```

- `canvas`：每边 64..1024 且为 16 的倍数（同 `src/pet/pixel-scale.ts` 的 FCI 0.2 策略）；内置三套均为 `96×96`；
- `anchor`：`mode` 固定 `foot-center`；`x/y` 为画布内整数（脚底中心，y 通常=canvas 高）；
- `footBox`：整数，`w/h > 0`，允许负 x/y（围绕锚点），但必须落在画布原点盒内；
- `bbox`：可选整数组，必须在画布内；
- `display`：可选；`scale` 只能 1/2/4，`pixelated` 只能 `true`；实际布局缩放由宿主决定；
- `palette`：小写安全 id（≤64，允许 `@` 版本后缀），只作审计/生成器标记，不注入 CSS。

---

## 5. `animations`（12 个 canonical clip）

`animations.clips` **必须恰好**包含 v0.1 运行时已认识的 12 个 clip：`idle` / `idle_blink` / `walk` / `run` / `pat_head` / `ball_throw` / `ball_chase` / `paw_face` / `scratch` / `stand_wag` / `chase_tail` / `attack`。

每个 clip：

| 字段 | 必需 | 规则 |
|---|---|---|
| `frames` | 是 | 1..16（整包总帧 ≤144） |
| `fps` | 是 | 1..30 整数 |
| `loop` | 是 | **必须**等于下表 canonical 值 |
| `layer` | 是 | **必须**等于下表 canonical 值（`base`/`overlay`/`oneshot`） |
| `category` | 是 | **必须**等于下表 canonical 值 |
| `priority` | 是 | **必须**等于下表 canonical 值 |
| `holdMs` | 否 | 非均匀节奏专用；长度必须=`frames`，每项 16..2000，总和 1..10000ms；只允许用于 `stand_wag`（猫伸懒腰）与 `attack` |

| clip | loop | layer | category | priority | 语义 |
|---|---|---|---|---|---|
| idle | ✅ | base | idle | 0 | 待机呼吸/慢眨眼 |
| idle_blink | ❌ | overlay | idle | 10 | 眨眼叠层/替换 |
| walk | ✅ | base | locomotion | 5 | 走 |
| run | ✅ | base | locomotion | 15 | 跑 |
| pat_head | ❌ | oneshot | social | 50 | 摸头 |
| ball_throw | ❌ | oneshot | interaction | 40 | 抛球蓄力 |
| ball_chase | ❌ | oneshot | interaction | 45 | 追球 |
| paw_face | ❌ | oneshot | action | 20 | 摸脸/舔爪 |
| scratch | ❌ | oneshot | action | 20 | 挠痒 |
| stand_wag | ❌ | oneshot | action | 20 | 伸懒腰/摇尾（猫 10 帧非均匀） |
| chase_tail | ❌ | oneshot | action | 20 | 追尾 |
| attack | ❌ | oneshot | combat | 60 | 扑咬（非均匀 holdMs） |

v0.2 **只开放帧数/帧率/非均匀节奏给作者**：loop/layer/category/priority 固定，保证宿主 scheduler 语义不因第三方包改变；`tests/content-pack-v2.test.ts` 会把这张表与 `src/pet/anim/clips.ts` 的 shipping 表逐项比对，防止两处漂移。

---

## 6. `voice`（产品红线，按 kind 固定）

| kind | mode | canTts | bubble |
|---|---|---|---|
| `humanoid` | `tts` | `true` | `speech`（实心气泡，允许 TTS） |
| `cat` / `dog` | `none` | `false` | `thought`（空心心理活动，永不 TTS） |

作者不能自选：与 kind 不符即 `invalid-voice`。这是产品规则（2026-11-18）与 `src/pet/anim/types.ts` 的 `VOICE_CAPABILITIES` 同源。

---

## 7. `behavior`（复用 `famling.behavior/0.1`，附加引用完整性）

`behavior` 直接使用运行时既有 profile（`src/pet/character/validate.ts` 的 `validateBehaviorProfile`），因此字段语义与内置角色完全一致；v0.2 额外强制：

- `extends` 必需，且必须等于：cat→`core:pet.cat`、dog→`core:pet.dog`、humanoid→`core:humanoid`；
- 每个 `states[].tag` 必须是 12 个 canonical clip 之一；`states[].after` 必须指向已声明 state；
- `slots` 必须非空，slot 值必须是已声明 state（允许 `null` 表示无动作）；
- `rules[].to` / `ambient.choices[].state` 必须是已声明 state（基类校验器已覆盖）；
- `abilities.speech`：cat/dog 只允许 `sfx` / `none`；humanoid 只允许 `text` / `voice` / `none`；
- 未知顶层字段（如 `script`）直接拒绝；data-only 递归守卫拒绝任何可执行字段。

行为状态数 ≤64、slot 数 ≤64。

---

## 8. `regions`（复用 `regions.json` version 1，附加引用完整性）

`regions` 直接使用运行时既有格式（`src/pet/anim/regions.ts` 的 `parseHeroRegionConfig`）：`regions[]`（rect 必须在画布内、id 唯一）、`gestures[]`、`actions[]`。v0.2 额外强制：

- `regions.canvas` 必须等于 `spec.canvas`；
- `gestures[].states[]` 必须是 `behavior.states` 里已声明的状态；
- `gestures[].event` / `actions[].event` / `actions[].followUpEvent` 必须在 `behavior.slots` 中声明（避免“点了没反应”的死交互）；
- `says` 行数 ≤6、单行 ≤120 字符、纯文本（无 HTML）。

---

## 9. `audio`（可选；D8 再分发权硬门）

```json
{
  "redistribution": { "confirmed": true, "note": "自录/自有版权音效，已确认可随包分发。" },
  "sfx": [
    { "id": "meow", "file": "assets/audio/sfx/meow.ogg", "event": "talk", "durationMs": 400 }
  ],
  "voiceLines": [
    { "id": "greet", "file": "assets/audio/voice/greet.ogg", "text": "我在。", "locale": "zh-CN" }
  ]
}
```

- 缺省 `audio` = 无 baked 音频：人形仍走宿主 TTS（文本→语音），猫狗保持静音心理活动；
- 只要携带任何音频文件，`redistribution.confirmed` 必须为 `true`，否则 `audio-rights-unconfirmed`（D8：baked TTS/WAV 再分发权未确认前不得进公开包）；
- `sfx[]` ≤8，id 唯一，文件必须在 `assets/audio/sfx/` 且 `.ogg`；`event` 必须在 behavior slots 中；`durationMs` ≤10000；
- `voiceLines[]` ≤32，**仅 humanoid**（cat/dog 携带即 `invalid-audio`），文件必须在 `assets/audio/voice/` 且 `.ogg`，`text` ≤240 纯文本；
- 只允许 OGG（Opus）容器；WAV/MP3/WebM/真人声线克隆一律拒绝。

---

## 10. 配额（fail-closed，与 content-pack 0.2 共用 zip 边界）

| 项 | 上限 | 来源 |
|---|---|---|
| zip 文件 | 16 MiB | `CONTENT_PACK_V2_LIMITS.maxZipBytes` |
| zip 条目 | 256 | 同上 |
| 单文件解压前 | 8 MiB | 同上 |
| 解压总量 | 32 MiB | 同上 |
| 压缩比 | 128 | 同上 |
| `pack.json` | 256 KiB | 同上 |
| `files[]` | 192 | `CHARACTER_PACK_V2_LIMITS.maxFiles` |
| 单 clip 帧数 | 16 | `maxFramesPerClip` |
| 总帧数 | 144 | `maxTotalFrames` |
| 单帧文件 | 512 KiB | `maxFrameBytes` |
| 预览 | 2 MiB | `maxPreviewBytes` |
| 单音频 / 音频总量 | 2 MiB / 8 MiB | `maxAudioBytes` / `maxAudioTotalBytes` |
| sfx / voiceLines | 8 / 32 | `maxSfx` / `maxVoiceLines` |

---

## 11. 校验 API（纯函数，不读盘/不联网/不执行）

```ts
import {
  validateCharacterPackV2,
  validateCharacterPackZip,
  characterPackFramePaths,
  verifyRemoteCharacterPack,
  planCharacterPackInstall,
} from '../src/pet/content-library.ts'

const parsed = validateCharacterPackV2(JSON.parse(await readFile('pack.json', 'utf8')))
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues, null, 2))
const pack = parsed.pack

// 期望帧清单（生成器/QA 用；顺序 = clip 顺序 × frame 顺序）
const frames = characterPackFramePaths(pack)

// 宿主 bounded-unzip 后自己算 inventory，再交给校验器
const zip = validateCharacterPackZip(pack, {
  bytes: zipFileSize,
  entries: [{ path: 'pack.json', bytes: packJsonBytes, sha256: packJsonSha256 }, ...frameEntries],
})
if (!zip.ok) throw new Error(JSON.stringify(zip.issues, null, 2))
```

错误码（`ContentIssue.code`）：`invalid-anim-pack` / `invalid-anim-spec` / `invalid-anim-clip` / `invalid-character` / `invalid-voice` / `invalid-audio` / `audio-rights-unconfirmed` / `invalid-behavior` / `invalid-region` / `missing-preview`；zip/文件沿用 `unsafe-zip-entry` / `forbidden-asset-type` / `missing-file` / `unlisted-file` / `file-size-mismatch` / `hash-mismatch` / `zip-too-large` / `too-large`；envelope 复用 `missing-usage-declaration` / `usage-statement-mismatch` / `missing-ai-provenance` / `missing-signature` / `unverified-remote` 等。

---

## 12. 安装器接口（PLAN + 运行时层；**真实文件系统安装未接线**）

### 12.1 宿主边界（写进契约，避免越权）

| 责任 | 归属 |
|---|---|
| 解压（bounded、拒绝 symlink/加密/zip64/穿越/大小写碰撞/重复） | 宿主（MB-042；可复用 content-pack 0.2 的解压器） |
| 计算每个文件 sha256、组装 inventory | 宿主 |
| 明文网络请求 | 无（本模块不联网；remote 仅数据/验签契约） |
| 执行脚本/HTML/渲染 | 无 |
| 目标目录：`<userData>/characters/<packId>/<version>/`；staging `.staging-<version>`；保留 `.backup-<version>`；`current.json` 最后原子写 | 宿主 |
| 校验清单/zip/签名/版本/同意门 | 本模块纯函数 |
| 状态机/注册表/热切换/失败回滚（纯注入，无直接 I/O） | `src/pet/character-packs.ts`（§12.4；**不是**真实 host 适配器） |
| 原子 rename、磁盘配额、断电恢复 | 宿主（MB-042） |

### 12.2 PLAN 类型与函数

```ts
interface CharacterPackInstallPlan {
  schema: 'famling.character-install-plan/0.1'
  action: 'install' | 'update'
  packId: string
  version: string
  zipSha256: string
  layout: { packRoot; installDir; stagingDir; backupDir; pointerFile }  // 宿主相对 POSIX 路径
  files: { path; bytes; sha256? }[]      // pack.json + files[]
  writeBudget: { maxFileBytes; maxTotalBytes; maxFiles }
  consent: { usageConfirmed; licenseAcknowledged; aiDisclosureAcknowledged }
  hostBoundary: { unzip: 'host'; network: 'none'; scripts: false; atomicRename: true }
}
type CharacterPackInstallPlanResult =
  | { ok: true; plan: CharacterPackInstallPlan }
  | { ok: false; code: CharacterPackInstallErrorCode; message: string; issues?: ContentIssue[] }
```

- `planCharacterPackInstall(request)`：要求先过 `validateCharacterPackV2`、显式三连同意、`zipSha256` 为 64 位小写 hex、zip inventory 通过；remote 包必须传 `verifyRemoteCharacterPack()` 的 ok 结果。失败码：`invalid-pack` / `invalid-zip` / `invalid-install-request` / `consent-required` / `remote-unverified` / `already-installed` / `version-conflict` / `downgrade-refused`。
- `planCharacterPackUninstall(request)`：只删 `<packId>/` 一个子树；`famling.*`（builtin）永不可卸载；无 installed 记录 → `not-installed`。
- `CharacterPackHostInstaller`：供 MB-042 实现的宿主接口（`planInstall` / `planUninstall` / `install` / `uninstall`）；**本模块不提供实现**，也不做任何 I/O。
- 运行时层另有更窄的注入接口 `CharacterPackRuntimeHost`（见 §12.4），不要求 host 自己实现 plan/install 编排。

### 12.3 版本与回滚（契约层 + 运行时语义）

- 同版本同 zip sha → `already-installed`；同版本不同 zip sha → `version-conflict`（必须 bump version）；
- 更高 SemVer → `update`；更低 SemVer → `downgrade-refused`（回滚是独立动作，不走 install 计划）；
- 安装/卸载必须保留旧版本到确认成功后再删；失败时旧版本继续可用（MB-042 验收项）；
- `CharacterPackRuntime.rollback(packId)` 已实现单步回滚：校验并加载 `previous` 版本 → 写旧版本 pointer → 删除新版本目录。旧版本不可加载时返回 `rollback-unavailable`，当前安装状态与活动角色都保持不变。

### 12.4 运行时层（`src/pet/character-packs.ts`，2026-11-19）

> 纯注入、无直接 I/O；**未接 `main.ts`/`desktop-shell.ts`/`content-hub.ts`，也没有生产 host 适配器**。完整接入说明见 [`CHARACTER-RUNTIME-2026-11-19.md`](CHARACTER-RUNTIME-2026-11-19.md)。

```ts
import { CharacterPackRuntime, defineBuiltinCharacter, readCharacterPackBundle } from '../src/pet/character-packs.ts'

const runtime = await CharacterPackRuntime.open({ host, builtins, defaultCharacterId, remote })
await runtime.install({ zipBytes, consent, expectedZipSha256 })  // install | update
await runtime.enable('community.my-cat')                         // 注册表 + 热切换（缓存；失败保留旧角色）
await runtime.rollback('community.my-cat')                       // 单步回退
await runtime.uninstall('community.my-cat')                      // active 时先回内置
const active = runtime.activeCharacter()   // { art, behavior, regions }
```

- host 注入：`readZip` / `listInstalled` / `write` / `remove` / `loadCharacter` / `emit`（必需）、`fetchText`（可选，仅 `inspectManifest()`）。运行时自身不读盘、不联网、不碰 DOM/渲染器。
- 事务：文件写入 `<packId>/<version>/`，最后写 `<packId>/current.json`（`famling.character-pointer/0.1`，含 `previous`）作为提交点；失败删除半装目录并恢复旧 pointer。
- 注册表：内置 + 已安装，按 `characterId`/版本排序；同 characterId 多包 → `character-conflict`；`famling.*`/内置身份 → `builtin-protected`。
- 并发：install/update/uninstall/rollback/enable 共用进程内锁，第二次操作返回 `busy`。
- 门：三连同意、canonical `usageDeclaration`、license、AI provenance、zip sha256、版本门、remote 验签、路径/大小上限；错误码见运行时文档 §6。

> ⚠️ 运行时层存在**不等于**“第三方角色已可安装”：真实 host 适配器、同意 UI、main 接线、渲染器适配与持久化都还没做（见运行时文档 §9）。UI/市场文案不得越过这一点。

---

## 13. 第三方最短路径（human / cat / dog）

1. **选参考**：`HUMAN-DESIGN-REFERENCE.md` / `CAT-DESIGN-REFERENCE.md` / `DOG-DESIGN-REFERENCE.md`（96×96、12 clip、68/72 帧、地线 y=89、调色/剪影/动作/语气/禁止事项）。
2. **复制示例**：`examples/human.anim.example.pack.json`（68 帧）/ `examples/cat.anim.example.pack.json`（72 帧）/ `examples/dog.anim.example.pack.json`（68 帧），改 `id` / `name` / `character.id`。示例的帧/ sha256 是**占位值**（sha256=路径哈希演示值），不加载不渲染；真实素材必须重算。
3. **出素材**：按参考文档产出 12 个 clip 的 PNG，放入 `assets/anim/<clip>/<clip>_NN.png`；预览放 `assets/preview/`。
4. **填声明**：`usageDeclaration`（canonical 短句 + 6 项）、`license`、`aiProvenance`、`compatibility.library='famling.content/0.2'`。
5. **填行为/交互**：`behavior` 用 `famling.behavior/0.1`（states 的 tag 必须落在 12 clip 内），`regions` 的事件必须能在 `behavior.slots` 找到。
6. **自检**：`validateCharacterPackV2` →（宿主解压+哈希）`validateCharacterPackZip`；用 `characterPackFramePaths()` 核对帧清单。
7. **签名**：远程市场上架时，`source:'remote'` + `remote.signature`（Ed25519，`characterPackSignaturePayload` 为签名对象）；未签名一律拒绝。
8. **装包**：宿主调用 `planCharacterPackInstall` 生成 PLAN；运行时层 `CharacterPackRuntime` 可通过注入 host 执行该计划（§12.4），但生产 host 适配器、UI 同意流程与 main 接线仍未实现 ⇒ 本目录不提供“本地安装”入口，也不得在 UI/市场文案暗示可安装。

---

## 14. 负向红线（评审直接判负）

- 包内出现脚本/HTML/SVG/字体/WASM/可执行文件、URL 资源、路径穿越、symlink、加密 zip、大小写碰撞；
- 缺 `usageDeclaration` / `license` / `aiProvenance` / `preview` / `files[].sha256`；声明与 canonical 文本不符；
- 猫狗开 TTS/实心 speech 气泡/baked voice line；人形关 TTS；
- 用 `files[]` 声明超限、未列帧、重复路径，或 `animations` 与帧文件不一致；
- 给第三方包改 loop/layer/category/priority 试图改变宿主 scheduler 语义；
- 未清权音频（`confirmed:false` 却带文件）、WAV/MP3/真人声线；
- 未签名 remote 包、未知/吊销 key、不改版本直接换 zip（`version-conflict`）；
- 在 UI/市场文案把“规范可校验”说成“已可安装/已可玩”——**MB-041/042 未实现**。

---

## 15. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版（MB-040/044 spec 层）：`famling.pet-anim/0.2` schema、zip 布局、12 clip 契约、voice/audio/behavior/regions/preview/files+sha256、zip 校验、安装器 PLAN 接口、human/cat/dog 示例与设计参考链接。**loader/注册表/热切换/真实安装器/签名审核门未实现**。 |
| 2026-11-19 | 追加运行时层（MB-041/042 纯逻辑部分）：`CharacterPackRuntime` 安装/更新/卸载/回滚/启用/热切换状态机 + 注册表、pointer 提交与失败原子回滚、注入 host 契约、18 项测试、[`CHARACTER-RUNTIME-2026-11-19.md`](CHARACTER-RUNTIME-2026-11-19.md)。**真实 host I/O/UI/main 接线/渲染器适配仍未实现**，市场文案不得暗示可安装。 |

> 本文件是工程契约，不构成法律意见；对外发布前须完成法务复核（许可/音频再分发权/AI 标识）。
