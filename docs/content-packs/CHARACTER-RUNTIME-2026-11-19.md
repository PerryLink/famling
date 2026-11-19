# 角色包运行时层：安装 / 注册表 / 热切换（2026-11-19）

> 状态：**运行时模块已实现并通过纯 Node 测试；真实 host I/O 适配器、UI/main 接线、渲染器接入均未实现**。
> 模块：`src/pet/character-packs.ts`；测试：`tests/character-packs.test.ts`（20 项）。
> 规范/校验/安装 PLAN：`src/pet/content-library.ts` + [`ANIM-PACK-0.2.md`](ANIM-PACK-0.2.md)。
> 本文件只描述**工程接入点与边界**，不构成法律意见。

## 0. 一句话

`famling.pet-anim/0.2` 的 spec 层能回答“这个包是否合法、是否与 zip 一致、安装计划长什么样”；本层补上“谁来执行计划、装完如何出现在注册表、如何启用/热切换、失败如何回到旧角色”。
**它仍然不是“第三方角色已可安装”**：本层不含任何 Tauri/Node 文件系统命令、不接 `main.ts`/`desktop-shell.ts`/`content-hub.ts`，也没有生产 host 适配器与 UI 同意流程。

## 1. 范围

| 已实现（纯注入、无直接 I/O） | 未实现（本任务范围外） |
|---|---|
| 安装/更新事务：校验 → bounded unzip（host 注入）→ 逐文件写 → pointer 提交 | 真实 host 适配器（Tauri commands / Node 文件系统 / appData 路径解析） |
| 失败原子回滚：删除半装目录 + 恢复旧 pointer | UI 入口/按钮/同意弹窗（复用 `describeUsageConfirmation()` 的前端流程） |
| 卸载（active 自动回内置，可配置默认角色） | `main.ts` / `desktop-shell.ts` 热切换接线（当前仍是整页 reload） |
| 单步回滚到上一版本（指向旧版本目录 + 删除新版本目录） | 渲染器/hero runtime 适配器（把 art/behavior/regions 句柄喂给现有渲染器） |
| 注册表（内置 + 已安装，按 characterId/version 排序） | 活动角色选择的持久化（属于 UI/设置层） |
| 启用/热切换：缓存句柄、切换不 reload、失败保留旧角色 | 插件端（dsh-famling）消费同一 manifest |
| 并发操作锁（install/update/uninstall/rollback/enable 串行化） | 远程市场 UI / 下载器（只保留注入点与验签门） |
| 远程包验签门（注入 trust root + verifier）与 `inspectManifest()` 预检 | 签名信任根的生产装配（属发布/安全任务） |

## 2. API 摘要

```ts
import {
  CharacterPackRuntime,
  defineBuiltinCharacter,
  readCharacterPackBundle,
  compareCharacterPackVersions,
} from '../src/pet/character-packs.ts'

const runtime = await CharacterPackRuntime.open({ host, builtins, defaultCharacterId, remote })
await runtime.install({ zipBytes, consent, expectedZipSha256 })   // install | update
await runtime.enable('community.my-cat')                          // 注册表/热切换
await runtime.rollback('community.my-cat')                        // 单步回退
await runtime.uninstall('community.my-cat')                       // 指针先删、目录后清
await runtime.refresh()                                           // 重新读 host.listInstalled()
const active = runtime.activeCharacter()   // { art, behavior, regions, ... } | null
const rows = runtime.registry()            // characterId/version 排序
const snapshot = runtime.snapshot()        // { operation, active, registry }
```

- `CharacterPackRuntime.open()`：校验 host 形状、校验并冻结内置角色、读取 `host.listInstalled()`；host 失败时**抛错**而不是静默空注册表。
- 所有会改状态的操作共用一把进程内锁；并发第二次操作返回 `{ ok:false, code:'busy' }`。
- `enable(target)` 的 `target` 可以是 `packId` 或 `characterId`；`options.version` 可固定版本，`forceReload` 可强制重读。
- `install()` 返回 `action: 'install' | 'update'`；`update` 保留旧版本目录并把旧版本写进 `state.previous`，供回滚使用。
- `defineBuiltinCharacter()` 只给内置角色用：`famling.*` 已被 pack 校验器保留，内置定义走 shipped behavior/region 校验器后冻结。
- `readCharacterPackBundle` 是 host 适配便利函数（直接调用 `content-assets.readContentZip`），可供 `host.readZip` 注入。

## 3. Host 注入契约

> 运行时模块**不 import** `fs`、`fetch`、Tauri API、DOM 或渲染器；下表所有副作用都由调用方注入。

| 方法 | 必需 | 职责 / 失败语义 |
|---|---|---|
| `readZip(bytes)` | 是 | bounded、CRC/路径/大小校验的 zip 读取；建议注入 `content-assets.readContentZip`。返回 `ContentBundleReadResult`。 |
| `listInstalled()` | 是 | 启动时的安装事实源（通常解析 `<packId>/current.json`）。返回 `CharacterPackInstalledState[]`（含 `record/characterId/kind/name/previous?`）。 |
| `write(path, bytes)` | 是 | 写一个 host 相对路径（自动建父目录，单文件原子）。`current.json` 是事务提交点，**必须最后写**。 |
| `remove(path)` | 是 | 删除文件或目录树；已不存在时也必须 resolve（幂等）。 |
| `loadCharacter(ref)` | 是 | 读取并 `JSON.parse` 已安装版本的 `pack.json`，可附带 `assetBase/assetUrls`。运行时会在激活前重新 `validateCharacterPackV2` 并交叉校验 id/version/characterId。 |
| `emit(event)` | 是 | UI/遥测事件汇；抛错会被运行时吞掉，不能破坏状态迁移。 |
| `fetchText(url)` | 否 | 仅 `inspectManifest()` 使用；主机负责 https/协议/超时/大小上限。安装流程**不**使用它。 |

运行时对 host 的相对路径再做一次安全检查（拒绝 `..`、绝对路径、反斜杠、控制字符等），并要求所有写入都在计划给出的 `<packId>/<version>/` 下。

## 4. 安装事务、pointer 与回滚

### 4.1 目录约定（与 `planCharacterPackInstall` 一致）

```text
<charactersRoot>/
  <packId>/
    current.json          # 指针：最后一次成功安装/回滚的版本；运行时最后写
    <version>/pack.json   # 每次安装的完整受控文件树（assets/...）
    <version>/assets/...
```

- `stagingDir` / `backupDir` 仍保留在 PLAN 类型中，但当前 host 契约只有 `write/remove`（无 rename），因此运行时用 **pointer 提交**取得等价原子可见性：文件先落到 `<packId>/<version>/`，`current.json` 最后写；失败时删除该版本目录并恢复旧 pointer。
- `current.json` schema：`famling.character-pointer/0.1`，字段：`packId/version/zipSha256/characterId/kind/name/previous?/updatedAt`。`previous` 是回滚凭据；host 的 `listInstalled()` 应解析它。
- `planCharacterPackInstall` 已校验 pack、zip inventory、sha256、同意门、版本门与 remote 验签门；运行时在执行前再检查计划身份与写预算，不重新实现校验器。

### 4.2 失败回滚（原子性）

1. **任何校验/解压/计划失败**：不落盘，`install-failed` 事件，返回对应错误码。
2. **写入中途失败**：删除半装的 `<packId>/<version>/`；若这是 update，重写旧版本 pointer；返回 `host-write-failed` + `rolledBack: true|false`。旧版本目录与活动角色不受影响。
3. **pointer 写入失败**：同上（pointer 是最后一步，旧 pointer 仍在）。
4. **卸载**：先删 `current.json`（事务语义），再删目录；目录清理失败只给 `cleanupWarning`，不会让“已卸载”状态回退。
5. **回滚**：先校验并加载上一版本（失败 → `rollback-unavailable`、当前版本/活动角色不变），再写旧版本 pointer（失败 → `host-write-failed`、不变），最后删除新版本目录。

## 5. 注册表与热切换

- 注册表 = 内置角色（运行时 options 注入，已冻结）+ 已安装包（host listInstalled + 本次会话内事务结果）。
- 排序：`characterId` 升序 → 版本降序（`compareCharacterPackVersions`，SemVer 语义）→ `packId`；同一 characterId 不允许由两个包提供（`character-conflict`）。
- 启用：按 `packId` 或 `characterId` 解析；首次启用经 `host.loadCharacter()` 读取 + 校验并缓存，之后切回**直接用缓存**（不 reload、不重读 zip）。
- 热切换失败（pack.json 损坏/被篡改/版本不符）：活动角色**保持原对象**，返回 `{ ok:false, restored: 旧活动角色 }` 并 emit `character-switch-failed`。旧角色句柄不会被销毁或重新加载。
- 卸载 active 角色：必须配置 `defaultCharacterId`（通常内置角色）或先启用另一个角色；否则返回 `active-character-in-use`，不会留下“已卸载但仍显示”的状态。
- 内置角色不可安装覆盖：`famling.*` id、内置 packId/characterId 均为 `builtin-protected`；`defineBuiltinCharacter` 走 shipped behavior/region 校验器。

## 6. 门禁与错误码

| 门 | 行为 |
|---|---|
| 三连同意（用途/许可/AI 披露） | 缺失即 `consent-required`，不读 zip |
| canonical `usageDeclaration` | 缺失/不符 → `declaration-required` |
| `license.spdx + attribution` | 缺失 → `license-required` |
| `aiProvenance` | 缺失/生成内容无披露 → `ai-disclosure-required` |
| 内置保护 | `famling.*`/内置身份 → `builtin-protected` |
| 同 characterId 多包 | `character-conflict` |
| 版本门 | 同版本同 zip → `already-installed`；同版本不同 zip → `version-conflict`；降级 → `downgrade-refused` |
| zip / 声明 / 路径 / 大小 / 压缩比 | 复用 `validateCharacterPackV2` + `validateCharacterPackZip`（`invalid-pack` / `invalid-zip`） |
| 下载哈希 | `expectedZipSha256` 不符 → `zip-hash-mismatch`，不读 zip |
| remote 签名 | 无 `remote` 信任配置/验签失败 → `remote-unverified` |
| 路径安全 | 计划/host 相对路径二次检查；越界即拒绝且不写 |
| 并发 | 第二次操作 → `busy` |

其它：`invalid-request` / `not-installed` / `nothing-to-rollback` / `rollback-unavailable` / `character-not-found` / `load-failed` / `host-list-failed` / `host-write-failed` / `host-remove-failed` / `host-fetch-failed` / `unsupported`。

## 7. 与现有模块的接入点（后续任务）

| 现有模块 | 接入方式 | 状态 |
|---|---|---|
| `content-assets.ts`（`readContentZip/sha256Hex`） | `host.readZip = readContentPackBundle`（或直接 `readContentZip`）；`sha256` 默认 `sha256Hex` | 已可注入（本层单测即真实读取 zip） |
| `content-library.ts`（`validateCharacterPackV2/validateCharacterPackZip/planCharacterPackInstall/planCharacterPackUninstall/verifyRemoteCharacterPack`） | 运行时唯一校验/计划来源；新增 `characterPackInstallLayoutFor()` 仅供回滚定位版本目录 | 已完成 |
| `content-market.ts`（签名目录/下载校验） | 下载 hook 产出 `{ zipBytes, expectedZipSha256, remoteVerification }` → `runtime.install()`；信任根由发布/安全任务装配 | 运行时门已就绪；市场 UI 未接 |
| `content-hub.ts`（内容中心导入） | 展示 `describeUsageConfirmation()` 文本并收集三连同意 → 调 `runtime.install()`；失败展示错误码 | **未接线**（本任务不改 UI） |
| `main.ts` / `desktop-shell.ts`（角色切换） | `runtime.enable(target)` 替换当前的整页 reload；`runtime.snapshot()` 驱动菜单 busy/列表 | **未接线**（当前仍 reload） |
| `hero-runtime.ts` / 渲染器 | 把 `active.art`（spec/clips/framePaths/assetBase）、`active.behavior`、`active.regions` 适配为现有 hero backend 输入 | **未实现适配器** |
| IndexedDB 素材缓存（`openContentAssetStore/persistAssetRecords`） | 可选：预览图/帧缓存；`assetBase/assetUrls` 由 host 提供 | 未接 |
| Tauri / Node 文件系统 | `readZip/write/remove/loadCharacter/listInstalled` 的生产实现（含 appData 根、原子文件写、路径 containment、断电恢复） | **未实现** |
| `dsh-famling` 插件 | 插件消费同一 `famling.pet-anim/0.2` manifest 的可选后续 | 未接 |

## 8. 状态机与事件

操作状态：`idle → installing | uninstalling | rolling-back | enabling | refreshing → idle`。任一次操作进行中，其它状态迁移返回 `busy`。

事件（`host.emit`）：`install-started` / `install-committed` / `install-failed` / `uninstall-committed` / `uninstall-failed` / `rollback-committed` / `rollback-failed` / `character-switched` / `character-switch-failed` / `registry-refreshed` / `warning`。事件不含字节、绝对路径或 host 内部对象。

## 9. 验收前不得宣称（诚实文案）

在下列事项完成前，UI/市场/README/发布说明**不得**写“第三方角色已可安装/已可玩/热切换已上线”：

1. 生产 host 适配器（Tauri/Node FS）与路径 containment、断电恢复、磁盘配额；
2. `content-hub.ts` 导入同意流程 + 错误提示 + 安装进度；
3. `main.ts`/`desktop-shell.ts` 用 `runtime.enable()` 替换 `window.location.reload()`，并回归 consent/TTS/存档/内置角色；
4. 渲染器适配器消费 `art/behavior/regions`（含 `framePaths/assetBase` 的 URL 解析）；
5. 活动角色持久化与坏包自动回退；
6. 远程信任根生产装配（Ed25519 key registry、吊销/有效期）；
7. 恶意 zip fixture 在真实 host 上的无落盘证据 + 真实 GUI 数据隔离验收。

## 10. 测试证据

- `tests/character-packs.test.ts`（20 项，纯 Node，真实内存 zip）：成功安装 / 更新 / 重复版本 / version-conflict / downgrade / 坏 zip / 坏 hash / 路径穿越 / 内置覆盖（`famling.*` 与自定义内置 identity）/ 声明缺失 / 许可缺失 / AI 缺失 / 同意缺失 / 期望哈希不符 / 卸载回内置 / 无 fallback 拒绝 / 回滚（成功与坏旧版本）/ 热切换缓存无 reload / 热切换失败保留旧角色 / 并发锁 / 注册表排序 / 重启后从 host 恢复 / `inspectManifest` 门 / 静态边界（模块无 fs/网络/渲染器引用）。
- 相关回归：`tests/content-pack-v2.test.ts`、`tests/content-library.test.ts`、`tests/content-assets.test.ts`、`tests/content-market.test.ts`。
- 命令：`npm test`、`npm run typecheck`（完整 `npm run ci` 还含 legal/build，见 `docs/STATUS.md`）。

## 11. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版：`CharacterPackRuntime`（安装/更新/卸载/回滚/启用/热切换 + 注册表）、注入 host 契约、pointer 提交与失败回滚语义、门禁/错误码、接线上游模块与“未实现”清单、20 项测试。 |

