# 内容包规范 0.2（角色主题 / 素材包）与第三方起步指南

> 状态：**规范 + 纯函数校验已落地；安装器 / 远程市场 UI 未实现，本目录不联网、不加载任何包**。
> 日期：2026-11-19（Asia/Shanghai）。
> 唯一校验实现：`src/pet/content-library.ts`（`validateContentPackV2` / `validatePackZip` / `mergeCharacterThemes` / `validateMarketCatalog` / `verify*`）。
> 回归测试：`tests/content-library.test.ts` + `tests/content-pack-v2.test.ts` + `tests/character-packs.test.ts`。
> **角色动画资产包（新 rig）**：`famling.pet-anim/0.2` 的 spec/zip/安装器 PLAN 契约见 [`ANIM-PACK-0.2.md`](ANIM-PACK-0.2.md)；运行时层（安装/注册表/热切换状态机，纯注入、无 I/O）见 [`CHARACTER-RUNTIME-2026-11-19.md`](CHARACTER-RUNTIME-2026-11-19.md)。**真实 host 适配器/UI/main 接线未做**，不得暗示第三方角色已可安装。
> 上游：`public/content/README.md`（内置目录 + v1 迁移）、`docs/design/CONTENT-MARKET-2026-11-19.md`（产品设计）。

## 0. 产品澄清：**角色就是主题**

用户明确：**主题/背景/字体只是说法，主题并不适用于桌宠；角色就是主题**。因此 0.2 的主内容是**角色主题（character theme）**：

| 一键切换的内容 | 数据字段 |
|---|---|
| 角色外观/动画 | `characterId`（+ `preview`） |
| 声音 | `voiceId`（`none` = 静音，猫狗永远是 `none`） |
| 对话语气/频率 | `dialoguePackId` |
| 外观配色 | `appearance.themeId` / `backgroundId` / `fontId` |
| 行为 | `behaviorPreset?`（如 `pet-dog`、`pet-cat`） |

内置 `rolePresets` 四条：`human` / `cat` / `dog` / `origami`（见 `public/content/library.json`）。用户应用某个角色主题后，可以在六个组件（characters / voices / dialoguePacks / themes / backgrounds / fonts）上继续自定义；自定义结果可以派生为新的角色主题，或导出为内容包。

## 1. 目录

```text
docs/content-packs/
  README.md                     # 本文件（第三方起步）
  ANIM-PACK-0.2.md              # 新 rig 契约：famling.pet-anim/0.2（spec + 安装器 PLAN；真实 host 未接线）
  CHARACTER-RUNTIME-2026-11-19.md  # 运行时层：CharacterPackRuntime 安装/回滚/注册表/热切换 + 接入点（纯注入）
  HUMAN-DESIGN-REFERENCE.md     # 人形 96×96 / 12 clip / 68 帧 / 地线 89 / 调色 / 动作 / 语气 / 禁止
  CAT-DESIGN-REFERENCE.md       # 猫 96×96 / 12 clip / 72 帧（stand_wag 10）/ 地线 89 / 灰白调色 / 禁止
  DOG-DESIGN-REFERENCE.md       # 狗 96×96 / 12 clip / 68 帧 / 地线 89 / 金毛调色 / 禁止
  examples/
    README.md                   # 示例索引：主题包 vs 动画资产包怎么选
    human.example.pack.json     # 角色主题包 0.2（famling.content-pack/0.2；占位资产引用，不加载）
    cat.example.pack.json
    dog.example.pack.json
    human.anim.example.pack.json  # 动画资产包 0.2（famling.pet-anim/0.2；68 帧占位清单，不加载）
    cat.anim.example.pack.json    # 72 帧（cat stand_wag 10 帧非均匀）
    dog.anim.example.pack.json    # 68 帧
```

## 2. zip 素材包布局（推荐分发形态）

```text
my-character-theme.zip
  pack.json                     # 必需，famling.content-pack/0.2（UTF-8，≤256 KiB）
  LICENSE.md                    # 可选（根目录白名单：LICENSE/NOTICE/README/DESIGN.md）
  DESIGN.md                     # 可选：设计说明/来源（同样在根目录）
  assets/
    preview/my-theme.preview.png
    sprites/idle/idle_00.png    # 只能是 png / webp / json / woff2
    sprites/...
```

也支持 **JSON 清单** 形态：只分发 `pack.json`（或内联 JSON），由宿主从自己的素材目录补充 `assets/**`；两种形态共用同一套清单校验、同一套 `files[] + sha256` 要求。**任何情况下**都不允许脚本、HTML、SVG、可执行文件、URL 资源或路径穿越。

## 3. `pack.json` 字段（closed schema，未知字段拒绝）

| 字段 | 必需 | 规则 |
|---|---|---|
| `schema` | 是 | 固定 `famling.content-pack/0.2` |
| `id` | 是 | 小写点/短横线 ≤64；**禁止** `famling.` / `famling-` 前缀 |
| `name` / `description` | 是 | 纯文本（无 `<>`），≤48 / ≤280 code points |
| `version` | 是 | SemVer |
| `usageDeclaration` | 是 | **统一用途声明**；见 §4，缺省/不符直接拒绝 |
| `license` | 是 | `spdx` + `attribution`（≤200），可选 `url`（仅 https）与 `file`（相对安全路径，且必须列在 `files`） |
| `aiProvenance` | 是 | `generated` 布尔 + `disclosure`（≤280）+ 可选 `tools[]` |
| `compatibility` | 是 | `library` 必须为 `famling.content/0.2`；可选 `minAppVersion` / `maxAppVersion` |
| `roleThemes` | 是 | **1..8** 条角色主题；一键切换的主内容 |
| `components` | 否 | 可选六类组件数组（自定义/派生用），每条 1..64 |
| `files` | 是 | 1..128 条；每条 `path` + `bytes`（1..8 MiB）+ `sha256`（64 位小写 hex） |
| `preview` | 否 | 包级预览图路径，必须列在 `files`（png/webp） |
| `source` | 否 | `local`（默认）或 `remote`；remote 必须带签名 `remote.signature` |
| `remote` | 否 | `marketId` / `version` / 可选 https `url` / 必需 `signature{ed25519,keyId,value}` |
| `createdAt` | 否 | `YYYY-MM-DD` |

### 3.1 角色主题条目（`roleThemes[]`）

| 字段 | 必需 | 规则 |
|---|---|---|
| `id` | 是 | 小写 kebab-case ≤32，在包内唯一 |
| `name` / `description` | 是 | 纯文本 ≤48 / ≤280 |
| `characterId` | 是 | 宿主角色 id（humanoid / dog / cat / origami 或包内 `components.characters`） |
| `voiceId` | 是 | 宿主语音 id 或 `none`；猫狗必须 `none`，人形必须真实语音 |
| `dialoguePackId` | 是 | 宿主/包内对话包 id |
| `appearance` | 是 | `{ themeId, backgroundId, fontId }`，引用宿主/包内主题、背景、字体 |
| `behaviorPreset` | 否 | 行为包 id（如 `pet-dog`）；不得指向可执行代码 |
| `preview` | 是 | 包内相对路径（png/webp），必须列在 `files` |
| `designRef` | 是 | 设计参考/说明文档相对路径，`.md`；发布版应指向你自己的设计说明或本目录参考 |
| `usageDeclaration` | 是 | 与包级逐字相同（canonical 短句 + 6 个 prohibitedUses） |
| `version` / `source` / `author` | 是 | SemVer / 包内为 `local` / 纯文本 ≤80 |
| `license` | 是 | 同包级结构；素材权利由作者负责 |
| `aiProvenance` | 是 | `generated` + `disclosure`；生成内容必须如实披露 |

## 4. 统一用途声明（强制，UI 导入前必须让用户确认）

canonical 短句（逐字一致，来源 `docs/legal/USE-RESTRICTIONS-2026-11-19.md` §1）：

> 本项目及其全部代码、美术、音频、文案、角色素材和衍生物仅用于技术研究与原型验证，不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途。

`usageDeclaration` 必须是：

```json
{
  "researchOnly": true,
  "statement": "<上面 canonical 短句逐字>",
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
```

- `researchOnly` 必须为 `true`；`statement` 必须与 canonical 短句**逐字**一致；`statementRef` 必须指向上述法务文件。
- `prohibitedUses` 必须包含上表 6 项（顺序建议一致，允许扩展已知项但不得缺失）。
- canonical 短句 UTF-8 SHA-256：`0353536cefd702014b12a8365c4a486f19848d049652e9692027216adb80c743`（代码常量 `CONTENT_USAGE_STATEMENT_SHA256`）。
- UI 侧：`describeUsageConfirmation()` 返回渲染所需文本/链接/哈希；**导入/激活前必须让用户显式确认**（`CONTENT_USAGE_CONFIRMATION_REQUIRED === true`）。
- 校验错误码：`missing-usage-declaration`、`invalid-usage-declaration`、`usage-statement-mismatch`、`invalid-prohibited-use`、`missing-prohibited-use`。

## 5. 作者自检（纯函数，不联网）

```ts
import {
  validateContentPackV2, validatePackZip, mergeCharacterThemes,
} from '../src/pet/content-library.ts'

const manifest = JSON.parse(await readFile('pack.json', 'utf8'))
const result = validateContentPackV2(manifest)
if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2))

// 安装器把 zip 解开并计算 sha256 后传入 inventory（本模块不读盘、不联网）
const zip = validatePackZip(result.pack, {
  bytes: zipFileSize,
  entries: [
    { path: 'pack.json', bytes: packJsonBytes, sha256: packJsonSha256 },
    { path: 'assets/preview/my.preview.png', bytes: 1234, sha256: '...' },
  ],
})
if (!zip.ok) throw new Error(JSON.stringify(zip.issues, null, 2))

// 合并进 v2 目录（本地包无需签名；远程包必须传 verifyRemote 验签结果）
const merged = mergeCharacterThemes(catalog, [result.pack])
```

zip 校验覆盖：规范化相对路径（拒绝 `..` / 绝对路径 / 盘符 / UNC / 反斜杠 / URL / 控制字符 / 大小写碰撞）、单文件 ≤8 MiB、解压总量 ≤32 MiB、zip ≤16 MiB、条目 ≤256、压缩比 ≤128（防 zip bomb）、资产类型白名单 **png/webp/json/woff2**、根目录文档白名单、`pack.json` 必须在根、`files[]` 必须与解压清单一一对应（缺文件 `missing-file`、多余文件 `unlisted-file`、大小 `file-size-mismatch`、哈希 `hash-mismatch`）。

## 6. 远程市场契约（只定义数据/校验/验签，不联网）

### 6.1 目录 `catalog.json`（`famling.market-catalog/0.1`）

```json
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
      "usageDeclaration": { "researchOnly": true, "statement": "...", "statementRef": "docs/legal/USE-RESTRICTIONS-2026-11-19.md", "prohibitedUses": ["..."] },
      "download": {
        "url": "https://market.example/packs/community.selkirk-theme-1.0.0.zip",
        "zipSha256": "<64 hex>",
        "bytes": 1234567
      },
      "signature": { "algorithm": "ed25519", "keyId": "famling-market-2026", "value": "<base64>" }
    }
  ]
}
```

`validateMarketCatalog(input)` 严格校验：schema / version / updatedAt（日期或 ISO-8601 UTC）/ keyId / 签名形状 / packs 1..256 / 每条 pack 的 id/version/description/usageDeclaration/download(https + zipSha256 + bytes ≤16 MiB)/signature；目录 `signature.keyId` 必须等于 `keyId`。

### 6.2 验签接口（Ed25519，注入 verifier + 信任根）

```ts
import {
  marketCatalogSignaturePayload, marketPackSignaturePayload,
  verifyMarketCatalogSignature, verifyMarketPackDownload, verifyRemoteContentPack,
  type ContentTrustRoot, type ContentEd25519Verifier,
} from '../src/pet/content-library.ts'
```

- 签名对象：`marketCatalogSignaturePayload(catalog)` / `marketPackSignaturePayload(pack)` 的 **canonical JSON（键排序）UTF-8 字节**；detached Ed25519 base64。
- 信任根：`{ keys: [{ keyId, algorithm:'ed25519', publicKeyPem, status:'active'|'retired'|'revoked', notBefore?, notAfter? }] }`；未知/吊销/过期 key 一律 fail-closed；retired 只用于验旧包。
- 下载流程（未实现，UI/安装器后续接）：① `validateMarketCatalog` → ② `verifyMarketCatalogSignature` → ③ 下载 zip → ④ 计算 zip sha256，`verifyMarketPackDownload`（哈希 + 签名）→ ⑤ 解压 + `validatePackZip` → ⑥ `pack.json` 里 `source:'remote'` 的 `remote.signature` 用 `verifyRemoteContentPack` 再验 → ⑦ `mergeCharacterThemes(..., { verifyRemote })`。
- `mergeCharacterThemes` 没有 `verifyRemote` 回调时，所有 `source:'remote'` 包一律以 `unverified-remote` 跳过（不信任“长得像签名”的元数据）。

## 7. 第三方从三个设计参考起步（最短路径）

1. **选角色类型**：人形 → `HUMAN-DESIGN-REFERENCE.md`；猫 → `CAT-DESIGN-REFERENCE.md`；狗 → `DOG-DESIGN-REFERENCE.md`。三份都给出 96×96 画布、12 clip、帧数（68 / 72）、地线 y=89、调色板、剪影、动作语义、对话语气与禁止事项。
2. **复制示例**：`examples/human.example.pack.json`（或 cat/dog），改成自己的 `id`/`name`/`roleThemes[].id`。示例里的 `files` 是占位引用（只有 path/bytes/sha256 形状），不加载、不联网。
3. **做素材**：按参考文档产出 PNG；放进 zip 的 `assets/`；给每张图算 sha256；`preview` 必须声明且被 `roleThemes[].preview` 引用。
4. **填声明**：`usageDeclaration`（canonical 短句 + 6 项）、`license`（许可 + 署名）、`aiProvenance`（是否 AI 生成 + 披露）、`compatibility.library='famling.content/0.2'`。
5. **本地自检**：`validateContentPackV2` → `validatePackZip`（需要宿主解压 + 算哈希）；必要时 `mergeCharacterThemes` 在临时目录合并，确认没有 `missing-references`。
6. **分发**：zip 内 `pack.json` 在根；远程市场上架还需要目录与 zip 的 Ed25519 签名（见 §6），未签名一律拒绝。

### 7.1 若要交付新动画 / 新 rig（`famling.pet-anim/0.2`，spec 层）

角色主题包只能复用内置 rig；要交付**新动画/新角色 rig**，用 `famling.pet-anim/0.2`（与主题包共享 envelope，但 payload 不同）：

| 内容 | 位置 |
|---|---|
| 规范全文（字段/zip 布局/12 clip 契约/安装器 PLAN/负向红线） | [`ANIM-PACK-0.2.md`](ANIM-PACK-0.2.md) |
| 人 / 猫 / 狗示例（68/72/68 帧占位清单，可直接 `validateCharacterPackV2`） | `examples/{human,cat,dog}.anim.example.pack.json` |
| 帧预算参考（96×96、12 clip、地线 y=89、调色/剪影/语气） | `HUMAN/CAT/DOG-DESIGN-REFERENCE.md` |

最短路径：复制对应 `.anim.example.pack.json` → 改 `id`/`name`/`character.id` → 按设计参考产出 PNG 帧放进 `assets/anim/<clip>/<clip>_NN.png` → 重算 `files[].sha256` → `validateCharacterPackV2` + `validateCharacterPackZip` 自检。

**重要边界（诚实文案）**：本规范冻结数据契约；`src/pet/character-packs.ts` 已提供**纯注入的运行时层**（安装/更新/卸载/回滚/注册表/热切换状态机，见 [`CHARACTER-RUNTIME-2026-11-19.md`](CHARACTER-RUNTIME-2026-11-19.md)），但真实文件系统 host 适配器（MB-042）、`main.ts`/`desktop-shell.ts`/`content-hub.ts` 接线、渲染器适配与活动角色持久化**均未实现**。在这些接线完成并通过验收前，UI/市场文案不得暗示“已可安装新角色/新动画”，也不得把运行时单测当成端到端安装证据。
## 8. 许可、AI 标识与用途边界（摘要）

- 每个主题/包必须有 `license.spdx` + `license.attribution`；作者对素材权利负责，禁止描摹/盗用现有版权角色或真人素材。
- `aiProvenance.generated=true` 时必须给出真实披露；不得删除/伪造 AI 标识，不得提供“去标识/破限”。
- 统一用途声明是**硬门**：研究/原型用途；禁止情感陪伴、虚拟伴侣、专业建议、未成年人亲密、冒充真人/官方、违法用途。
- 详见 `docs/legal/USE-RESTRICTIONS-2026-11-19.md`、`docs/legal/AI-LABELING.md`、`docs/legal/CONTENT-POLICY.md`。
- 本目录与校验代码**不构成法律意见**；对外发布前须完成法务复核。

## 9. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版：内容包 0.2（角色主题主入口、统一用途声明、zip 素材包清单、远程市场目录/验签契约）、三份角色设计参考、三个 example pack。 |
| 2026-11-19 | 追加 `famling.pet-anim/0.2`（新 rig）spec 层：`ANIM-PACK-0.2.md` + 三个 68/72 帧 anim 示例 + §7.1 最短路径。**loader/注册表/热切换/真实安装器未实现**。 |
| 2026-11-19 | 追加角色包运行时层：`src/pet/character-packs.ts`（安装/更新/卸载/回滚/启用/热切换 + 注册表，注入 host、无直接 I/O）+ `tests/character-packs.test.ts`（20 项）+ `CHARACTER-RUNTIME-2026-11-19.md`（host 契约/事务/门禁/接线上游模块/未实现清单）。**真实 host 适配器与 UI/main 接线未实现**。 |
