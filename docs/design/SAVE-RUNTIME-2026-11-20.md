# 存档运行时抽取（task-91 / E10-MB-012 · E1-MB-011 · 前置 E11-MB-112）

- 日期：2026-11-20
- 状态：**模块层完成 + main 接线完成**（task-94：`save-host.ts` 适配层 + `main.ts` 接线；模块仍保持纯边界）
- 任务：`task-91`（lead 指派；写范围 `src/pet/save-runtime.ts`、`tests/save-runtime.test.ts`、`docs/design/`）
- 上游清单：`docs/plan/MASTER-BACKLOG-2026-11-19.md` MB-012 / MB-011 / MB-112；执行状态 `docs/plan/EXECUTION-STATUS-2026-11-20.md` §2 E1/E10/E11

## 1. 背景与目标

抽取前 `src/pet/main.ts` 为 4115 行，存档状态机全部内联：

| 职责 | 抽取前位置（main.ts） |
| --- | --- |
| 单写 + 限流 + 恢复标志写入口 | `saveNow` / `saveNowInternal`（1975–2034） |
| 迁移/导入后的保存并清备份 | `saveAndPurgeBackup`（2036–2048） |
| 信封/旧档解析 | `parsePetSave`（2052–2087） |
| 主档→备份→迁移读路径 | `loadNow`（2089–2141） |
| 恢复标志 | `saveRecoveryNeeded`（1973，读 2109/2120/2132/2139） |
| 平台加解密 | `encryptSave` / `decryptSave`（1941–1965，DPAPI/WebCrypto） |
| 30 s 自动保存 + 页面隐藏保存 | 2427–2443 |
| 删除存档并恢复自动保存 | 2295–2320 |
| 加密不可用提示（只提示一次） | `saveWarningShown`（1925） |

MB-012 要求：新增纯模块（注入 IO/host/clock），承载 save/load/autosave/recovery
状态机；补 10 条故障注入测试；**本任务不改 main.ts**，产品接线留给后续任务。
MB-011 的坏档恢复语义、MB-112 的故障矩阵（坏档/IPC 挂起/超时/ENOSPC/只读/kill/TTL）
在本模块与其测试中落地，供 main.ts 接线任务与 E11 行为测试复用。

## 2. 范围 / 非目标

**做了**

1. `src/pet/save-runtime.ts`（571 行）：纯模块，注入 `SaveRuntimeHost`（加解密 + 槽位读写删）、
   `SaveRuntimeTimers`（interval）、clock、consent 门、token bucket、状态读写闭包与三个 UI 回调。
2. `tests/save-runtime.test.ts`（758 行，21 条）：11 条契约测试（含纯度门、抛错 UI 钩子不破坏持久化）+ **10 条 MB-112 故障注入**。
3. 本文档：API 契约、状态机、与旧实现的行为对照、故障矩阵、main.ts 接线清单与开放问题。

**没做（明确不在本任务）**

- 不改 `main.ts`（0 行改动）；不接 Tauri/WebView/UI/菜单/设置；不建新 IPC 命令；
- 不改 Rust `write_save`/`read_save`；不改插件；
- 不 commit / 不 push；不声称 E10 完成（`main.ts` 仍 4115 行，目标 ≤2500 属后续拆分）。

## 3. 边界：什么被注入、模块自己做什么

模块只 import 三个纯模块：`../game/checksum.ts`（旧档 CRC32）、`../kernel/pet.ts`
（`serializePet`/`deserializePet`/`PetState`）、`./security/limits.ts`（`savePlainBytes`、`utf8ByteLength`）。
无 DOM、无 `localStorage`、无 `@tauri-apps/api`、无网络、无文件系统、无全局定时器直调（默认定时器仅兜底）。

```ts
createSaveRuntime({
  slot, gameVersion,            // 'pet' / '0.1.0'
  host,                         // SaveRuntimeHost：encrypt/decrypt/read/write/remove/clearBackup
  readState, writeState,        // 活的 PetState 闭包；模块不克隆、不持有状态副本
  canInteract,                  // TOS/consent 门：false 时 save/load/delete 不触达 host
  now?, timers?, rateLimit?,    // 注入时钟/interval/令牌桶
  maxPlainBytes?, autosaveIntervalMs?,
  onEncryptUnavailable?,        // 加解密不可用：每实例只报一次（对应旧 saveWarningShown）
  onRecoveryNeededChange?,      // 恢复标志变化（UI 气泡/状态）
  onAsyncFailure?,              // migration / autosave / clear-backup 的后台失败
})
```

`SaveRuntimeHost` 契约要点（测试即规范）：

- `read(slot, false)` 读主档、`read(slot, true)` 读 `.bak`；缺失/不可读必须 **reject**（load 循环再试另一个）；
- `write(slot, text, backup=false)` **不得**把已有主档轮转进 `.bak`（恢复期间保护最后一枚好档）；
- IPC 必须自己带超时（main 接线时复用 `invokeTimed`）；超时要 reject，不能永久挂起；
- `decrypt` 对不支持的 cipher 返回 `null`（旧 DPAPI 裸字符串由 Tauri adapter 负责）。

## 4. 对外 API 与结果类型

| API | 返回 | 语义 |
| --- | --- | --- |
| `save()` | `SaveResult` | 显式保存；单飞（并发调用共享同一 Promise）；先查 in-flight 再查令牌桶 |
| `load()` | `LoadResult` | 主档→备份；成功时 `writeState`；失败区分 `not-found`/`corrupt`/`consent-required` |
| `deleteSave()` | `DeleteResult` | 删除主档+备份并清恢复标志（MB-011） |
| `saveAndPurgeBackup()` | `SaveResult` | 先保存成功再清 `.bak`（迁移/导入路径）；清备份失败只上报不反悔保存 |
| `autosaveTick(reason?)` | `SaveResult` | 手动触发一次自动保存（interval/visibility-hidden 共用门） |
| `startAutosave(ms?)` / `stopAutosave()` | `void` | 幂等；默认 30 000 ms；恢复标志为 true 时 tick 返回 `recovery-pending` |
| `whenIdle()` | `Promise<void>` | 等 in-flight 写与迁移写落定（测试/退出前冲刷用） |
| `recoveryNeeded` / `saving` | `boolean` | 只读状态；`recoveryNeeded` 替代旧全局变量 |
| `dispose()` | `void` | 停自动保存计时器（= `stopAutosave`） |

失败一律返回 `{ ok:false, reason, error?, retryAfterMs?, bytes? }`，不抛异常：

- `SaveFailureReason`：`consent-required` / `rate-limited` / `recovery-pending` /
  `serialize-failed` / `save-too-large` / `encrypt-failed` / `write-failed` /
  `clear-backup-failed` / `delete-failed`；
- `LoadFailureReason`：`consent-required` / `not-found` / `corrupt`；
- 后台路径（migration/autosave/clear-backup）经 `onAsyncFailure(scope, failure)`，
  与原 main 的 `reportFailure(saveBoundary, error)` 一一对应。

## 5. 状态机与不变量

### 5.1 保存（与旧 `saveNowInternal` 逐步等价）

```
canInteract? --否--> {consent-required}
  -> serializePet(readState())           失败 -> {serialize-failed}
  -> utf8ByteLength > maxPlainBytes?     是   -> {save-too-large, bytes}（不加密、不写盘）
  -> host.encrypt(plain)                  失败 -> {encrypt-failed}（永不落明文；只报一次）
  -> envelope {format:'dsh-save',version:2,gameId:'pet',gameVersion,savedAtMs,cipher}
  -> host.write(slot, text, backup = !recoveryNeeded)
       失败 -> {write-failed}（恢复标志不重置）
  -> setRecoveryNeeded(false) -> {ok, backup, savedAtMs, bytes}
```

### 5.2 读取（与旧 `loadNow` 逐步等价）

```
canInteract? --否--> {consent-required}
setRecoveryNeeded(false)
for backup in [false, true]:
  host.read(slot, backup)  reject -> 继续
  sawReadableSave = true
  parse: 直接 legacy schema:1 -> gameId 校验 -> cipher 信封 -> world+crc32+memoryEnc
    解析失败 -> 继续
  成功 -> writeState(state); setRecoveryNeeded(backup);
          legacy && !recoveryNeeded -> 后台 saveAndPurgeBackup()（不阻塞 boot）
          -> {ok, source, migrated, savedAtMs, recoveryNeeded}
全部失败 -> setRecoveryNeeded(sawReadableSave)
          -> {not-found | corrupt, sawReadableSave, recoveryNeeded}
```

### 5.3 五条恢复不变量（测试逐条锁定）

1. 只有 load 入口清标志；主档可读但解析失败、或只有备份解析成功时重新置位。
2. 标志为 true 时 autosave 暂停、显式写用 `backup=false`，坏主档永远不会覆盖最后一枚好 `.bak`。
3. 一次成功显式保存（或删除）清标志；`.bak` 只由 `saveAndPurgeBackup` 在保存成功后清理。
4. 加密失败不写任何数据（明文/半成品都不落盘）。
5. host 挂起时并发 save 共享同一 in-flight Promise（不重复写）；host reject 后释放，后续可重试。

## 6. 与抽取前 main.ts 的行为对照

| 抽取前 | 抽取后 | 差异 |
| --- | --- | --- |
| `saveNowInternal()`（1975） | `save()` 内部 `writeSave()` | 信封/大小上限/加密/backup 标志逐项保留 |
| `saveNow()`（2022）单飞 + 限流 | `save()` | 同样先 in-flight 后 `tryConsume`；由抛 `RateLimitError` 改为 `{reason:'rate-limited',retryAfterMs}` |
| `saveAndPurgeBackup()`（2036） | 同名方法 | 清备份失败仍不使保存失败，走 `onAsyncFailure('clear-backup')` |
| `parsePetSave()`（2052） | 私有 `parseSave()` | 四个分支与顺序完全保留（含 world/crc32/memoryEnc 重建） |
| `loadNow()`（2089） | `load()` | `boolean` 改为带 `source/migrated/recoveryNeeded` 的结果对象 |
| `saveRecoveryNeeded`（1973） | `recoveryNeeded` getter + `onRecoveryNeededChange` | 写路径统一经 `setRecoveryNeeded` |
| `encryptSave`/`decryptSave`（1941/1948） | `host.encrypt`/`host.decrypt` | DPAPI/WebCrypto 选择留在 adapter |
| 30 s `setInterval`（2427） | `startAutosave()` + `autosaveTick()` | 定时器注入；content 窗口只调用方决定不 start |
| `visibilitychange`（2435） | 调用方 `autosaveTick('visibility-hidden')` | 门（consent/recovery）在模块内 |
| `saveWarningShown`（1925） | 内部 once + `onEncryptUnavailable` | 气泡文案留在 main |
| 删除存档（2295） | `deleteSave()` | 状态重置/气泡留 main；标志清理在模块 |
| envelope 字段 | 不变 | `format/version/gameId/gameVersion/savedAtMs/cipher` |

## 7. 10 条故障注入矩阵（`tests/save-runtime.test.ts`）

| # | 故障 | 注入方式 | 关键断言 |
| --- | --- | --- | --- |
| 01 | 主档损坏 | primary 写入截断 JSON，`.bak` 完好 | 从 backup 恢复；标志置位；提交写 `backup=false`；`.bak` 字节不变；提交后才清标志 |
| 02 | 主档+备份双损坏 | 两个槽都非 JSON | `corrupt`+`sawReadableSave`；autosave `recovery-pending` 0 写；显式保存后自动保存恢复并修复 `.bak` |
| 03 | 恢复标志 TTL | 备份恢复后连跑 interval tick | 显式保存前 0 写；一次显式提交后恢复自动保存 |
| 04 | IPC 挂起 | `host.write`/`host.read` 返回永不 settle 的 Promise | save 并发共享同一 Promise、host 只收到 1 次写；读挂起期间不误判损坏，解除后正常 load |
| 05 | IPC 超时 | `host.write` reject `ipc-timeout:write_save` | `write-failed`+原始 error；in-flight 释放；恢复标志不受影响；重试成功且重新加密 |
| 06 | ENOSPC | 轮转备份后 `host.write` reject `ENOSPC` | 主档保持旧值、`.bak` 指向旧主档；autosave 上报一次；重试成功 |
| 07 | 只读存储 | 轮转前 `host.write` reject `EROFS` | 失败不影响读；两个槽都未被改动；权限恢复后重试成功 |
| 08 | 中途 kill | 轮转后、rename 前抛错 | 已提交主档完好；load 得到最后提交状态；重试轮转旧主档且信封合法 |
| 09 | 迁移写失败 | legacy schema:1 档 + 迁移写 ENOSPC | load 仍成功（migrated）；后台上报 `migration`；`clearBackup` 0 次；重试升级成功 |
| 10 | 超大档 | 构造 >512 KiB 明文（`SECURITY_LIMITS.savePlainBytes`） | `save-too-large`+bytes；加密 0 次、写 0 次；恢复标志不变；缩回正常后可保存 |

另有 11 条契约测试：信封字段/仅密文、第二次保存轮转 `.bak`、两类 legacy 迁移、删除清标志、
限流不触达 host、consent 门、30 s 定时器启停、加密失败只报一次且不落明文、模块纯度门
（只允许 `../game/checksum.ts`、`../kernel/pet.ts`、`./security/limits.ts` 三个 import，且不含
DOM/Tauri/Web Storage/网络调用；静态扫描时剥离注释避免把边界说明误判为使用）、抛错的 UI 钩子
（气泡/报告/标志回调）不会打断 save/load/autosave 或把失败变成未处理 rejection。

## 8. 接 main.ts 的后续接线计划（不在本任务）

### 8.1 两个 host adapter

```ts
// Tauri：复用 main.ts 现有 invokeTimed（1928）与命令语义
const tauriHost: SaveRuntimeHost = {
  encrypt: (plain) => invokeTimed('protect_text', { text: plain }),
  decrypt: async (cipher) => { /* 裸 string 或 {p:'dpapi'} -> unprotect_text；否则 null */ },
  read: (slot, backup) => invokeTimed<string>('read_save', { slot, backup }),
  write: async (slot, text, backup) => { await invokeTimed('write_save', { slot, text, backup }) },
  remove: async (slot) => { await invoke('delete_save', { slot }) },
  clearBackup: async (slot) => { await invoke('clear_save_backup', { slot }) },
}
// 浏览器：safeGetItem/safeSetItem/removeKey + encryptMemory/decryptMemory；
// write(backup=true) 先 safeSetItem(`${key}.bak`, previous) 再写主键（复刻 main.ts:2003-2013）。
```

### 8.2 替换清单

1. `saveNowInternal`/`saveNow`/`saveAndPurgeBackup`/`parsePetSave`/`loadNow`/`saveRecoveryNeeded`/
   `saveInFlight`/`encryptSave`/`decryptSave` 由 runtime 取代；删除约 170 行。
2. `saveArchiveWithFeedback` / 设置保存 / `exitAfterSave`：`await runtime.save()`，失败按 reason 走原有
   `reportFailure`+`toUserMessage` 气泡（`rate-limited` 保持静默）。
3. `loadArchiveWithFeedback` / `bootPetOnce` / QA `loadNow` 钩子：`await runtime.load()`；
   `not-found` -> “还没有旧书页。”；`corrupt` -> 现有“存档损坏，已保留备份…”气泡；
   `migrated` 由 runtime 后台落盘，main 不再 `saveAndPurgeBackup`。
4. 删除存档（2295）：`await runtime.deleteSave()` 成功后再 `state = createPet(now())` + render。
5. 记忆改/忘（2227/2237）：`void runtime.saveAndPurgeBackup()`。
6. 自动保存（2427）与 visibilitychange（2435）：`if (!CONTENT_SHELL) runtime.startAutosave()`；
   hidden 时 `void runtime.autosaveTick('visibility-hidden')`。
7. 全量清除（`onDataWiped`，3844–3847）：删除后由 `deleteSave()` 或等价的成功删除清标志；
   main 不再直接写 `saveRecoveryNeeded = false`。
8. `onEncryptUnavailable` -> 现有 `saveWarningShown` 气泡（runtime 已只报一次）；
   `onAsyncFailure` -> `reportFailure(saveBoundary, failure.error ?? new Error(failure.reason))`。

验收（接线任务）：`main.ts` import `createSaveRuntime` 而非复制实现；19 条模块测试 + 全量测试 + tsc 绿；
真实 GUI 存档/坏档/退出链路复跑；随后拆 content-runtime/hero-page/settings 才能到 ≤2500 行。

### 8.3 开放问题（接线时必须决定）

1. **Tauri `read_save` 的隐式备份回退**（`main.rs:1185-1191`）：主档不存在时 `backup=false` 也会读 `.bak`。
   旧 main 因此会把“其实读的是备份”当成主档（恢复标志 false）。运行时契约要求 adapter 语义明确：
   接线时二选一：改 Rust 命令让 `backup=false` 严格只读主档（推荐，显式 load 循环已覆盖备份），
   或 adapter 保持现行为并在注释/测试中冻结该差异。
2. **错误到 UI 文案**：旧实现抛 `RateLimitError`/`Error`，`toUserMessage` 依赖 error message；新结果是
   `reason` + 可选 `error`。接线时集中做一次 `saveFailureToUserMessage()`，避免文案漂移。
3. **content 独立窗口**：旧代码只在 `!CONTENT_SHELL` 启动自动保存；接线时保持，运行时不感知窗口。
4. **多窗口/单实例（MB-013）**：本模块不提供跨进程锁；`only pet window owns autosave` 约束仍由 main 维持。
5. **备份清理时机**：`saveAndPurgeBackup` 成功后清 `.bak`；若清备份失败只上报，不改保存结果（与旧行为一致）。

## 9. 实测证据（本机 WSL / Windows 双侧，工作树；未 commit）

| 命令（在工作树执行） | 结果 |
| --- | --- |
| `node --import tsx --test tests/save-runtime.test.ts` | **21/21 pass，0 fail**（11 契约 + 10 故障；约 0.87 s） |
| 定向 tsc：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --allowImportingTsExtensions --skipLibCheck --types node src/pet/save-runtime.ts tests/save-runtime.test.ts` | **exit 0**（本任务两文件 + 其纯依赖类型安全） |
| `npm run typecheck`（整仓 tsc --noEmit，含 tests） | 本任务文件完成后一度 **exit 0**；最终复跑 exit 2，报错仅 `src/pet/consent/modal.ts(1137)` 与 `tests/age-verification.test.ts(218)` —— 属并发 **task-90（exec-consent-d6，进行中）** 的未完成改动，与本任务两文件无关 |
| `npm test`（整仓，`node --import tsx --test tests/*.test.ts`） | 见 §9.1：并发 task-90 未完成期间整仓为红，但失败集合与 save-runtime 无交集；本任务 21 条全过（`fault 10/10` 等可见于 summary） |
| `npm run build`（WSL/Linux 直接跑） | **环境性失败**：共享 `node_modules` 仅有 `@rolldown/binding-win32-x64-msvc`，Linux 的 `@rolldown/binding-linux-x64-gnu` 缺失，vite 8/rolldown 加载 native binding 失败。属依赖安装平台问题，且 `save-runtime.ts` 当前无生产 import，不在 build 图中 |
| `npm run build`（Windows 侧 `powershell.exe`，项目真实目标平台） | **成功**：`✓ built in 953ms`，产出 `dist/assets/pet-*.js`、`main-*.js` 等（baked voice 42 WAV / legal package 38 file 日志正常） |

### 9.1 整仓回归（并发环境快照，诚实记录）

- 运行 1（本任务文件 19 条时）：`npm test` = 1354 tests / 1324 pass / **30 fail**；30 条全在
  consent/age/TOS 面（age-verification 11、roleplay-allages 5、legal-user-agency 4、
  consent-host-gate 2、consent-actions 2、age-ui 2、parity-contract 1、data-controls 1、
  consent 1、consent-static 1）；`save-runtime` 0 条。
- 运行 2（本任务文件 20 条时）：`npm test` = 1381 tests / 1353 pass / **28 fail**；失败仍在
  同一 consent/age/TOS 面（并发任务在此期间新增/删改了若干用例）。
- 运行 3（本任务文件 21 条时）：`npm test` = 1406 tests / 1378 pass / **28 fail**；失败集合与运行 2
  相同（同上 9 个 consent/age/TOS 文件），本任务 `✔ fault` 10 条全部通过。
- 两轮失败均可在 `tests/*.ts` 中定位到 `2026-11-20.1` TOS 版本与冻结值 `2026-11-17.6` 的冲突，
  且 `npm run typecheck` 的同类报错只出现在 `src/pet/consent/modal.ts` / `tests/age-verification.test.ts`。
  这是并发 **task-90（exec-consent-d6，in_progress）** 的中间态，不是本任务引入；task-90 完成后需重跑
  整仓测试/typecheck 才能作为最终门证据。
- 本任务隔离证据：`node --import tsx --test tests/save-runtime.test.ts` 21/21；定向 tsc exit 0；
  静态纯度门只允许三个纯 import。

新增/修改文件 3 个（`git status` 为 untracked，未 commit）：

- `src/pet/save-runtime.ts`（571 行）
- `tests/save-runtime.test.ts`（758 行）
- `docs/design/SAVE-RUNTIME-2026-11-20.md`（本文档）

`src/pet/main.ts` 本任务 **0 行改动**（抽取前 4115 行；当前工作树里 main.ts 的 diff 来自并发 task-90，
不属于本任务）；`save-runtime.ts` 暂无生产 import（E10 状态不变，MB-012 只能从 TODO 降为
“模块层完成/待接线”，是否改状态由总清单 owner 决定）。未运行真实 GUI/Tauri E2E，不得声称。

## 10. 变更边界

- （task-91 当时）未改 `main.ts`/Rust/插件/其它 src；未新增依赖；未 commit/push；task-94 的 main.ts 接线见 §11；
- 未运行真实 GUI/Tauri E2E（本任务纯模块 + Node 测试；外部验证不得声称）；
- 测试使用内存 fake host、假定时器与注入时钟，不触碰真实 `%APPDATA%`/localStorage。

## 11. main.ts 接线（task-94，E10/E1 后续）

- 日期：2026-11-20
- 任务：`task-94`（lead 指派；写范围 `src/pet/main.ts`、`src/pet/save-host.ts`、`tests/`、`docs/design/`）
- 结论：`main.ts` 不再内联存档状态机，改为注入式 `createPetSaveService(...)`；模块纯度不变（`save-runtime.ts` 仍只 import 三个纯模块）。

### 11.1 新增/修改文件

| 文件 | 变化 |
| --- | --- |
| `src/pet/save-host.ts`（新增） | `SaveRuntimeHost` 的两个平台适配器 + `createPetSaveService` 门面 + 旧错误契约映射 |
| `src/pet/main.ts` | 删除内联 `encryptSave`/`decryptSave`/`saveNowInternal`/`saveNow`/`saveAndPurgeBackup`/`parsePetSave`/`loadNow`/`saveRecoveryNeeded`/`saveInFlight`/`saveWarningShown`/30 s interval/visibility save（主文件 4119 → 3973 行，−146；约 80 行新接线，其余为并发任务改动） |
| `tests/e11-main-data-chain.test.ts` | 行为矩阵保留 26 条；harness 改为驱动“生产 service + main.ts 薄包装”，不再抽取已删除的内联实现 |
| `tests/save-host.test.ts`（新增 28 条） | 适配器契约、Tauri/localStorage 映射、Rust 回退冻结、旧错误契约、autosave 门、main.ts 静态接线 |
| `tests/p1-gates.test.ts` / `consent-static` / `data-isolation-exit` / `trust-wiring-static` | 静态断言改指向新接线（`createPetSaveService` + `saveService.*`），不再 grep 已删除的内联实现 |
| `docs/design/SAVE-RUNTIME-2026-11-20.md` | 本文件：接线说明 + 证据 |

### 11.2 接线结构

```
main.ts
  createPageSaveService()                      // 注入 live 闭包 + UI 回调
    -> createPetSaveService({
         slot: SAVE_SLOT, gameVersion: '0.1.0', hasTauri: HAS_TAURI,
         invokeTimed, readState: () => state, writeState: (next) => { state = next },
         canInteract, rateLimit: limits.save,
         onEncryptUnavailable -> showBubble('存档加密不可用，这次没有保存。')
         onAsyncFailure       -> reportFailure(saveBoundary, saveFailureToError(...))
       })
    -> createPetSaveHost -> createTauriSaveHost | createBrowserSaveHost
    -> createSaveRuntime (src/pet/save-runtime.ts)
  saveNow()/saveAndPurgeBackup()/loadNow()     // 三个薄包装，保留旧 async/throw 契约
  自动保存: if (!CONTENT_SHELL) saveService.startAutosave()
  visibilitychange(hidden): saveService.autosaveTick('visibility-hidden')
  删除: await saveService.deleteSave()
  全量清除: resetSaveServiceAfterWipe()（consent 层已先删槽位；重建 runtime 清恢复标志）
```

### 11.3 行为对照（接线后仍成立）

| 旧 main.ts 行为 | 接线后 |
| --- | --- |
| `saveNow()` 抛 `consent-required` / `save-too-large (NB)` / `RateLimitError` / 原始 crypto/storage 错误 | `saveFailureToError()` 逐项复刻；`instanceof RateLimitError` 与 `toUserMessage()` 文案不变 |
| 浏览器 `.bak` 仅在 `backup=true` 时轮转；恢复期间保护最后一枚好档 | `createBrowserSaveHost.write` 同语义；`save-runtime` 在恢复期间传 `backup=false` |
| Tauri 信封 `{format:'dsh-save',version:2,gameId:'pet',gameVersion:'0.1.0',savedAtMs,cipher}` | 不变（runtime 写，测试逐字段断言） |
| DPAPI 旧档（裸 base64 / `{p:'dpapi'}`）与 WebCrypto 密文按平台解密 | `createTauriSaveHost.decrypt` / `createBrowserSaveHost.decrypt` 复刻；跨平台返回 `null` |
| 30 s interval + hidden 保存的门（consent/recovery/限流静默） | runtime `autosaveTick` 内建同样的门；`onAsyncFailure` 只报非预期失败 |
| content 窗口不自动保存 | `if (!CONTENT_SHELL) startAutosave()` 保留 |
| 删除后恢复自动保存（MB-011） | `deleteSave()` 成功后清标志；main 不再直接改变量 |
| 全量本地数据清除后恢复自动保存 | `resetSaveServiceAfterWipe()` 重建 runtime（consent 层已删槽位，不重复删除） |

### 11.4 开放问题 #1 的处理：Rust `read_save` 隐式回退（冻结，不改 Rust）

`app/tauri/src-tauri/src/main.rs` 的 `read_save(backup=false)` 在主档不存在时回退读 `.bak`。本任务写范围不含 Rust，因此：

- `createTauriSaveHost.read` 保留该 host 行为；runtime 会把回退字节当作主档（`recoveryNeeded=false`），与抽取前页面**完全一致**；
- `tests/save-host.test.ts` 以“冻结测试”锁定：主档缺失、`backup=false` 返回 `.bak` 内容时 load 成功且 recovery=false；
- 若后续把 Rust 改为“`backup=false` 严格只读主档”，该冻结测试会失败，提醒同步更新接线与文档（推荐方向已在原 §8.3 记录）。

### 11.5 实测证据（本任务完成时；工作树，未 commit）

| 命令 | 结果 |
| --- | --- |
| `node --import tsx --test tests/save-runtime.test.ts tests/e11-main-data-chain.test.ts tests/save-host.test.ts` | **75/75 pass**（模块 21 + 行为 26 + 接线 28，约 2.2 s） |
| `node --import tsx --test tests/p1-gates.test.ts tests/consent-static.test.ts tests/data-isolation-exit.test.ts tests/trust-wiring-static.test.ts tests/content-window.test.ts` | **49/49 pass**（静态断言已改指新接线；`content-window` 的“content 窗口不自动保存”断言同步） |
| `npx tsc --noEmit` | **exit 0**（整仓含 tests，2026-11-20 01:55 复跑） |
| `npm test`（整仓） | **1486 tests / 1485 pass / 1 fail**；唯一失败是 `tests/parity-contract.test.ts` 的“plugin dialogue modes … quiet suppresses ambient lines”——它断言的是 `plugins/dsh-famling/client.js` 里旧字符串 `source === 'ambient' && dialogueMode === 'quiet'`，而该文件正被并发 task-95（E7 静音时段）改成 `(dialogueMode === 'quiet' \|\| isQuietHoursActive(...))`；本任务未改插件，失败与 save 接线无关（工作树无插件改动归属本任务）。 |
| `npm run build` | **exit 0 / ✓ built in 7.27 s**（baked voice ok: 42 WAV；legal package ok: 38 file）。首次尝试曾在 `baked-voice-guard.closeBundle` 报 `ENOENT scandir dist/assets/voice/pet`：与另一并发 agent 的 build 同时清空/重建 `dist/` 的竞态；立即重跑即成功（属环境并发，不是代码问题）。 |
| 真实 GUI/Tauri E2E | **未运行**（本任务只跑 Node 测试 + tsc + build；不得声称 GUI 验证） |

### 11.6 未做 / 边界

- 不改 Rust（`read_save` 回退保持冻结）、不改插件、不 commit/push；
- 不改 `src/pet/save-runtime.ts`（模块层由 task-91 完成且测试已绿），本任务只消费其 API；
- `main.ts` 目标 ≤2500 行属后续 E10 拆分（content-runtime/hero-page/settings），本任务只完成 save 面；
- 未运行真实 GUI/Tauri E2E，也未声称。
