# P1-3 修复报告：游戏/DLC/预览页 innerHTML → DOM 构造 + DLC 内容边界校验

- 日期：2026-11-19
- 任务：task-44（lead 指派）+ 后续扩展（lead 授权：demo DLC 校验、tinglan-preview sink、校验模块移入 src/pack）
- 对应审计：`docs/audit/FAMLING-SECURITY-AUDIT-2026-11-18.md` §P1-3（DLC/内容文本经 `innerHTML` 进入 UI；Tauri 消费路径跳过内容 schema/ABI/授权校验）；关联 `PET-ROBUSTNESS-AUDIT-2026-11-18.md` P2-05（pack loader 无上限）
- 结论：**审计列出的 `innerHTML` 注入面全部关闭**（四游戏页 13 处 + `tinglan-preview.ts` 模板），**两条 Tauri DLC 消费路径（aquarium/demo）都先校验再注册**；有静态 + fake DOM + 校验单测回归。整体 P1 仍需 P1-1（task-41）/P1-2（task-42）/P1-4（task-43）收口。
- 未 commit / 未 push；改动全部在工作树中。

---

## 1. 原始问题（审计事实）

1. 四个游戏页用字符串拼 HTML：`src/aquarium/main.ts`（4 处）、`src/stall/main.ts`（5 处）、`src/town/main.ts`（3 处）、`src/world/main.ts`（2 处），共 13 处 `innerHTML`；`src/pet/tinglan-preview.ts:54` 另有一处模板 `innerHTML`（审计“20 处 innerHTML”中的最后典型缺口）。
2. 两条 DLC 消费路径直接信任 Rust 返回的 JSON：
   - aquarium：`dlc_list → dlc_verify → contentPackFromData(...) → mountPack`；
   - demo：`dlc_verify('farm-seasons') → contentPackFromData(...) → mountPack`；
   - `src/pack/from-data.ts` 不做 `validateContent`/ABI/`minBase`/字段边界校验；Node 侧 `loadPackFromDir` 的完整链路（manifest schema → ABI → minBase → entitlement → 签名 → 哈希 → `validateContent`）没有被前端复用；
   - Rust `native/dlc-verify` 只验签 + 哈希，不做 manifest schema、绝对路径/UNC/ADS 拒绝。
3. 威胁模型（审计原文）：持有有效签名私钥者可以在 pack 的 `name/nameKey/...` 中植入 HTML/事件处理器；在 aquarium/demo 窗口渲染即 XSS，结合 P1-2 可读 Advisers brief / 解密 DPAPI 存档 / 花云 TTS/ASR 额度。**不是无认证远程攻击**，但内容供应链即攻击面。

修复采用两层互相独立的防线：

- **Layer 1（渲染 sink）**：所有相关视图改为 `document.createElement` + `textContent` 构造，彻底不再解析 HTML；
- **Layer 2（内容边界）**：DLC 在进入 content catalog 之前做严格字段/长度/范围/ABI 校验，畸形或超限数据直接拒绝（跳过该 pack），不进注册表。

---

## 2. 设计

### 2.1 Layer 1：视图拆成纯 DOM 构造

每个游戏页新增 `ui.ts`（纯函数，第一个参数是 `Document`，不做模块级 DOM 访问，因此 Node 测试可用 fake DOM 直接驱动）；`tinglan-preview.ts` 导出 `createTinglanPreviewDom(doc, displayName)`：

| 文件 | 导出 | 替换的 `innerHTML` 位置 |
|---|---|---|
| `src/aquarium/ui.ts` | `createTankFishElement` / `createCodexRow` / `createInventoryRow` / `createDecorRow` | `aquarium/main.ts:196`（静态模板）、`:271`、`:300`、`:332` |
| `src/stall/ui.ts` | `createSeatCard` / `createPantryRow` / `createGalleryItem` | `stall/main.ts:180-186`、`:254`、`:730`、`:756`、`:785` |
| `src/town/ui.ts` | `createBuildingCard` / `createVillagerCard` / `createOrderRow` | `town/main.ts:193`、`:227`、`:244`（含原 `outerHTML` 拼 worker dots） |
| `src/world/ui.ts` | `createTileElement` | `world/main.ts:35-39` |
| `src/pet/tinglan-preview.ts` | `createTinglanPreviewDom` | `tinglan-preview.ts:54-82` 整块模板（DLC `displayName` 曾过 `escapeHtml` 后拼 HTML） |

保持的结构与样式（有测试断言）：

- aquarium：`.fish > .tail/.body/.label`、`--left/--top/--dur` 内联变量、`.row > span + span.muted`；
- stall：`.seat.filled > .avatar/.name/.role/.bar>i/.tip`、`.row`、`.gallery-item(.locked) > strong + span`；
- town：`.slot.built > .roof/.name/.workers>.dot/.bar>i`、`--c/--wc` 变量、`.villager > i + span > br + small`、`.order > span(.muted)`；
- world：`.tile > .id/.glyph/.label/.progress>i`、`width:%`；
- tinglan preview：`.tinglan-preview > .tp-head/.tp-body`、`.tp-kicker/.tp-warn/.tp-actions/.tp-hud/.tp-state`，保留全部 id（`tp-state/tp-tag/tp-voice/tp-gate/tp-log/tp-brief/tp-muted/tp-focus/tp-sleep`）、`data-event` 值、checkbox `checked` 默认值。

`innerHTML = ''` 清空容器统一改为 `replaceChildren()`；`outerHTML` 拼字符串改为 `appendChild`。**src/ 全树现在 0 处 `.innerHTML/.outerHTML` 赋值、0 处 `insertAdjacentHTML`/`document.write`**（见 §4.2）。

### 2.2 Layer 2：DLC 边界校验模块（已移入 `src/pack/`）

新增 `src/pack/dlc-content.ts`（纯 TS、无 Node 依赖，浏览器/测试共用；从 `src/aquarium/dlc-content.ts` 移入），并从 `src/pack/index.ts` re-export。调用点：

- `src/aquarium/main.ts:92`：`validateDlcPack(loaded, { baseVersion: GAME_VERSION })` → `contentPackFromData(validated.manifest.*, validated.content)`；
- `src/demo/main.ts:48`：`validateDlcPack(loaded, { baseVersion: '0.1.0' })` → 同上（demo 的实际基础版本串是 `0.1.0`，与 package.json 一致）。

`validateDlcPack(raw, { baseVersion })` 做：

1. **Envelope**：必须有对象型 `manifest` + `content`；
2. **Manifest schema**：复用 `src/pack/manifest.ts` 的 `validateManifest`（id slug、version/minBase semver、contentApi 整数、files 列表、content 必须在 files 中）；额外 `id.length ≤ 64`；
3. **ABI**：`manifest.contentApi === CONTENT_API`（与 `mountPack` 的检查一致但提前到注册前）；
4. **minBase**：`satisfiesMinBase(baseVersion, manifest.minBase)`（与 `loadPackFromDir` 语义一致）；
5. **Content 字段边界**（对齐 `content/schema/content.schema.json`，并加防御性上限）：
   - 顶层闭集：只允许 `items/crops/buildings/fish/decorations`，未知字段（含 `__proto__`/`constructor`）拒绝；
   - 每节数组上限 1024 条（DoS 上限，ContentScope 注册前拦截）；
   - 每条目闭集 + 必填字段类型；`id` 必须是 `^[A-Za-z0-9._-]+$` 且 ≤64；`name` 1–64；`nameKey` 1–128；
   - 数值边界：`price/cost ≥ 0`、`stages 1–20`、`stageMs ≥ 100`、`wateredMultiplier 1–10`、`yieldQty/qty 1–100`、`reelWindowMs ≥ 100`、`produces.everyMs ≥ 1000`，全部要求有限数、整数字段禁小数；`waitMaxMs ≥ waitMinMs`；`rarity/kind` 枚举；
   - 文本拒绝 C0/C1 控制字符、bidi 控制符、零宽/BOM、未配对 surrogate（防 UI 欺骗/乱码）；
   - 同节重复 id 拒绝（否则 `defineX` 会在注册时抛错）；
   - 返回**只含已知字段的规范化副本**（不透传未知字段/原型属性）。

说明：校验**不**禁止合法文本中的 `<`/`&`（如 “Fish & Chips”）。因为渲染层已用 `textContent`，这些字符只会作为文本显示；Layer 2 负责形状/长度/范围/可见性，Layer 1 负责“永不解析为 HTML”。这是审计建议 1+2 的组合实现，并避免误伤正常文案。

### 2.3 仍保持任务边界（未改）

- 不改 `src/pack/from-data.ts` / `src/pack/loader.ts` 的既有行为（只新增 `dlc-content.ts` 并在 `src/pack/index.ts` re-export）；
- 不改 Rust `native/dlc-verify`、`app/tauri/src-tauri/src/main.rs`；
- 不改 `plugins/dsh-famling`；
- 未删 tinglan-preview/tinglan-lab 功能：preview 仍是同一入口、同一 HUD 行为，只把模板改成 DOM 构造。

---

## 3. 变更清单

| 文件 | 变更 | 规模 |
|---|---|---|
| `src/pack/dlc-content.ts` | 新增（由 `src/aquarium/dlc-content.ts` 移入）：DLC manifest/content 边界校验，aquarium + demo 共用 | 339 行 |
| `src/pack/index.ts` | re-export `dlc-content.ts` | +1 行 |
| `src/aquarium/ui.ts` | 新增：aquarium 视图 DOM 构造 | 100 行 |
| `src/aquarium/main.ts` | 替换 4 处 `innerHTML`；接入 `validateDlcPack`（模块路径改为 `../pack/`）；`GAME_VERSION` 前移 | +35/-24 |
| `src/stall/ui.ts` | 新增：stall 视图 DOM 构造 | 78 行 |
| `src/stall/main.ts` | 替换 5 处 `innerHTML` | +37/-30 |
| `src/town/ui.ts` | 新增：town 视图 DOM 构造 | 96 行 |
| `src/town/main.ts` | 替换 3 处 `innerHTML`（含 `outerHTML`） | +26/-21 |
| `src/world/ui.ts` | 新增：world 视图 DOM 构造 | 46 行 |
| `src/world/main.ts` | 替换 2 处 `innerHTML` | +13/-8 |
| `src/demo/main.ts` | DLC 路径在 `contentPackFromData` 前接入 `validateDlcPack`；`loaded` 改为 `unknown` | +9/-6 |
| `src/pet/tinglan-preview.ts` | 新增 `createTinglanPreviewDom`；删除 29 行 `innerHTML` 模板与 `escapeHtml` import；保留全部 id/class/data-event/行为 | +102/-32 |
| `tests/game-dom-safety.test.ts` | 新增：静态 sink 扫描 + fake DOM 注入回归（12 个 builder）+ demo/aquarium 接线静态断言 + 校验→catalog→DOM 端到端 | 509 行 |
| `tests/dlc-content-validation.test.ts` | 新增：DLC 边界校验单测 | 262 行 |
| `tests/trust-wiring-static.test.ts` | 原“preview 依赖 shared escaper”断言改为“DOM 构造、无 innerHTML”；保留 review/路径断言 | +7/-2 |
| `docs/audit/RESOLUTION-INNERHTML-2026-11-19.md` | 本文件 | — |

静态结果：

```
$ grep -rnE '\.(inner|outer)HTML\s*=|insertAdjacentHTML|document\.write\(' src --include='*.ts'
SRC CLEAN          # 0 处（全 src 树；原先 grep 命中 20 行，其中 14 行是赋值、6 行是注释）
```

---

## 4. 测试与实测结果

### 4.1 新增回归测试

`tests/game-dom-safety.test.ts`（14 个用例）：

- 静态：递归扫描 `src/aquarium|stall|town|world/**/*.ts`，禁止 `innerHTML/outerHTML` 赋值、`insertAdjacentHTML`、`document.write`、`createContextualFragment`；断言四页 `main.ts` 都从 `./ui.ts` 导入构造器；断言 aquarium 与 demo 的 DLC 路径 `validateDlcPack` 出现在 `contentPackFromData` 之前、import 自 `src/pack/dlc-content.ts`、不再使用 `loaded.manifest.*`；
- 行为：fake DOM（**故意不实现 `innerHTML`**，若回归会直接抛错）驱动全部 12 个 DOM builder（4 游戏页 11 个 + tinglan preview），每个 builder 用 4 种 XSS payload（`<img onerror>`、`<script>`、`"><svg onload=...>`、`<iframe srcdoc>`）验证：元素树/class 名与 benign 输入完全一致、payload 原样保留为文本、无 `IMG/SCRIPT/SVG/IFRAME/...` 元素；同时断言 class/style/子元素顺序/`br`+`small`/进度条宽度、preview 的 id/`data-event`/checkbox 状态等结构；
- 端到端（无浏览器）：读真实 `packs/reef-pack/{manifest,content}.json` → 把 fish.name 改成 `<img src=x onerror=alert(1)>` → `validateDlcPack` → `contentPackFromData` → `mountPack` 进 Cordis catalog → `createCodexRow` 渲染为单文本节点。

`tests/dlc-content-validation.test.ts`（15 个用例）：

- 真实随包 DLC（`packs/reef-pack`、`packs/farm-seasons`）必须通过；
- envelope/manifest：非对象、坏 id/版本/ABI/minBase/files 全部拒绝且错误带 JSON path；
- content：闭集/数组上限/`__proto__` 原型污染键/字段类型/长度/控制字符/bidi/未配对 surrogate/数值上下界/枚举/重复 id/规范化只保留已知字段；
- 合法 HTML 文本被接受但保持 string（由渲染层负责文本化）。

### 4.2 执行命令与结果（本机实测）

环境：WSL2 Linux / Node v24.22.1 / tsc 5.9.3（依赖树中有并发任务安装的 linux-x64 esbuild，故使用仓库自带 `tsx` 跑测试）。

```
$ cd /mnt/d/Projects/dsh/desktop-games
$ npm run typecheck
> tsc --noEmit        # exit 0

# 定向：新增测试 + 受影响的静态接线测试
$ node --import tsx --test tests/game-dom-safety.test.ts tests/dlc-content-validation.test.ts \
    tests/trust-wiring-static.test.ts tests/consent-static.test.ts tests/security-paths-html-errors.test.ts
# tests 61 / pass 61 / fail 0

# 全量（含并发任务新增的测试文件）
$ node --import tsx --test tests/*.test.ts
# tests 963 / pass 963 / fail 0 / duration 17.5s

$ npm run build       # vite 生产构建
# ✓ built；legal package ok: 37 files；exit 0
```

说明：仓库没有 jsdom/happy-dom，fake DOM 的行为测试与 `tests/p1-gates.test.ts` 的既有做法一致；真实 WebView/Tauri 渲染验证仍缺（§6.2）。

---

## 5. P0/P1 关闭状态

| 审计项 | 状态 | 依据 |
|---|---|---|
| **P1-3** 四个游戏页 innerHTML 注入面（13 处） | ✅ 本任务关闭 | sink 全部改 DOM 构造；静态扫描 + 12 builder 注入回归 |
| **P1-3** `tinglan-preview.ts` innerHTML 模板 | ✅ 本任务关闭 | `createTinglanPreviewDom` + 结构/payload 测试；`trust-wiring-static` 断言无 innerHTML |
| **P1-3** aquarium DLC 消费路径无内容校验 | ✅ 本任务关闭 | `validateDlcPack` 在 `contentPackFromData` 前执行；15 个边界单测 |
| **P1-3** demo DLC 消费路径无内容校验 | ✅ 本任务关闭 | 同上；新增 demo 接线静态回归 + demo 使用的真实 farm-seasons pack 通过校验 |
| P1-3 剩余：Rust verifier 内容 schema/路径拒绝、entitlement | ⚠️ 未关闭（Rust/Steam 侧） | 见 §6.1 |
| P1-1 签名信任根 / 轮换 / 吊销 | ⚠️ 由 task-41 处理，本任务未动 | — |
| P1-2 窗口级命令 ACL | ⚠️ 由 task-42 处理，本任务未动 | — |
| P1-4 consent/TOS/DLC 门绕过 | ⚠️ 由 task-43 处理，本任务未动 | — |

本任务完成后：即使签名私钥被滥用，恶意 pack 的文本也**不会**在 aquarium/demo/游戏页被解析为 HTML；畸形 pack 在校验层被拒，不会进入内容注册表。P1-3 的“内容层防线”已就位，但 P1-1/P1-2/P1-4 不关闭时整体 P1 仍不能宣称关闭。

---

## 6. 剩余风险 / blocker（交给 lead 决策）

### 6.1 Rust 侧内容/路径校验与 entitlement（仍开放）

- 截至本任务完成时点核对：并发中的 task-41 正在大改 `native/dlc-verify`（签名信任根/轮换），但**内容字段级 schema 校验仍没有**（`verify_pack*` 只做 contentApi==1 等少量检查），也没有 manifest 绝对路径/UNC/ADS 拒绝；
- entitlement 未在 Tauri 路径校验（Steam 仍是 stub；Rust `dlc_verify` 不返回 ownership）——需要 Steam 接入后由 Rust 或浏览器侧补齐；
- 浏览器侧 `validateManifest` 仍允许 `C:/...` 形式（审计 P1-3 探针），但该路径在 Rust 读文件阶段已被 `dir.join` 使用、且签名/哈希已通过，浏览器层无文件 IO，因此本任务未扩大无文件读取面。

### 6.2 无真实浏览器/WebView E2E（仍开放）

本任务用 fake DOM + 静态扫描证明“不再有 sink、payload 不产生元素”，但未在真实 WebView 中跑 XSS payload（repo 无 jsdom/Playwright；Tauri E2E 需 Windows + 构建）。建议后续加一条 E2E/dev-only 探针：签名测试 pack 的 fish.name = HTML → 打开 aquarium → `document.querySelectorAll('img').length === 0`。

### 6.3 校验入口不是强制的（架构建议）

`contentPackFromData` 本身仍无校验，任何未来新增调用方（或直接 import `from-data.ts` 的代码）仍可能绕过。本任务把校验模块放进 `src/pack/` 并由 aquarium/demo 显式调用；建议 lead 决定是否进一步：在 `src/pack/from-data.ts` 内强制校验，或只暴露 `mountVerifiedDlc()` 统一入口（需要 `src/pack/from-data.ts` 的写权限，本任务未改）。

### 6.4 校验 schema 与 contentApi 升级同步

本模块字段边界对齐 `content/schema/content.schema.json`；未来 `contentApi` 升版加字段时必须同步更新（否则新字段会被闭集拒绝）。已有 ABI 门 + schema 文件 + 单测兜底。

### 6.5 文档注释残留（只报告，未改）

`src/pet/security/html.ts` 头部注释仍写 “`tinglan-preview.ts:34` builds a template with `innerHTML`…”，现在已不成立（该文件不在本次授权写 scope，未改）。`escapeHtml` 仍作为公共工具保留并被 `tests/security-paths-html-errors.test.ts` 覆盖，只是预览页不再需要它。

### 6.6 CSP 纵深防御未变

审计 P2-1（`base-uri`/`form-action` 缺失、dev build 无 CSP）不在本任务范围；本次修复不依赖 CSP。

---

## 7. 验收映射（审计 §10.2 对 P1-3 的验收项）

| 审计验收项 | 本任务证据 |
|---|---|
| `grep -rn 'innerHTML' src/aquarium src/town src/stall src/world` 无 pack/外部文本插值 | 四个目录 0 处赋值（测试静态断言）；现 `src/` 全树 0 处 |
| 恶意内容单测（HTML 字段 → DOM 文本节点） | `tests/game-dom-safety.test.ts`：12 个 builder × 4 payload + 端到端 DLC HTML name + preview 面板 |
| Tauri 侧 content schema 校验单测 | `tests/dlc-content-validation.test.ts`：15 用例覆盖 schema/ABI/minBase/字段边界；aquarium + demo 两条路径都实际调用 |

---

## 8. 复现（给 lead/后续审计）

```bash
cd /mnt/d/Projects/dsh/desktop-games
# 1) 静态：全 src 无 markup sink
grep -rnE '\.(inner|outer)HTML\s*=|insertAdjacentHTML|document\.write\(' src --include='*.ts' || echo CLEAN
# 2) typecheck
npm run typecheck
# 3) 本任务回归
node --import tsx --test tests/game-dom-safety.test.ts tests/dlc-content-validation.test.ts \
  tests/trust-wiring-static.test.ts tests/consent-static.test.ts tests/security-paths-html-errors.test.ts
# 4) 全量
node --import tsx --test tests/*.test.ts
```

（Windows 原生环境可用仓库标准 `npm test`；本机由于并发任务把 `node_modules` 切到 linux 平台，实测用 WSL Node + 仓库自带 tsx 完成。）
