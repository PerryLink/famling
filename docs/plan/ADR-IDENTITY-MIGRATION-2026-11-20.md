# ADR-2026-11-20：产品身份迁移（DesktopGames → Famling）— 决策与迁移计划

> **Status: DECIDED — 本轮不执行迁移（MB-093）。PLAN ONLY。非法律意见。**
> 关联任务：task-93 / MB-093。关联清单：`docs/plan/MASTER-BACKLOG-2026-11-19.md` §E9、
> `docs/plan/EXECUTION-STATUS-2026-11-20.md` §E9。写于 2026-11-20，基线 HEAD `6404d43`。
> **明确事实（不得误读）**：本轮 **C1 仍是 DesktopGames 身份**；`tauri.conf.json` /
> `package.json` / `Cargo.toml` 的身份字段 **未改**；没有执行任何 AppData 迁移、安装目录迁移、
> 证据重建或重新打包。本文件只给决策与可执行迁移计划，供 C1 之后的专用发布窗口执行。

## 1. 决策（一句话）

**C1 冻结并保留 `DesktopGames 0.1.0` 身份；目标身份 `Famling` 的迁移整体推迟到 C1 之后的
专用发布窗口，作为一个带独立任务号的原子变更执行（配置 + 脚本 + 数据迁移 + 证据重建同一窗口）。**

理由（按权重）：

1. **C1 证据已绑定旧身份**：`artifacts/evidence/2026-11-20-c1-final-6404d43/RELEASE-MANIFEST.json`
   的 `product` 字段是 `DesktopGames`，文件名是 `DesktopGames-0.1.0-portable.zip` /
   `DesktopGames_0.1.0_x64-setup.exe`。现在改身份 = 已发/待发证据全部失效，必须重签重发。
2. **身份字符串不只在授权文件里**：发布脚本、E2E 隔离守卫、CDP/试玩脚本、版本镜像门、
   插件 `package.json`、生成式 `docs/STATUS.md` 都硬编码了旧身份（清单见 §4）。只改
   `tauri.conf.json` 会造成 release/e2e/状态真值三处同时漂移，比现状更危险。
3. **迁移会影响用户数据路径**（AppData / WebView2 profile / 安装目录，见 §5），必须有
   迁移代码 + 回滚演练 + E2E 守卫先行改造，不能和 C1 冻结窗口混做。
4. **公开导出仓已经用 Famling 身份**（2026-11-18 清理发布，见
   `docs/audit/FAMLING-PUBLIC-BOUNDARY-2026-11-18.md:206-212`），这证明目标身份已经可用，
   但同时也意味着私有 C1 通道与公开导出通道当前身份不一致 —— 迁移方案必须显式对账两者。

## 2. 背景事实（实测，2026-11-20）

### 2.1 当前私有 C1 身份

| 字段 | 当前值 | 事实来源 |
| --- | --- | --- |
| 产品名 `productName` | `DesktopGames` | `app/tauri/src-tauri/tauri.conf.json:3` |
| 版本 `version` | `0.1.0` | 同上 `:4`；`package.json:4`；`Cargo.toml:3`；受 `npm run version:check` 门禁 |
| bundle identifier | `com.perrylink.desktopgames` | `tauri.conf.json:5` |
| 主窗口标题 | `Desktop Games` | `tauri.conf.json:16`（app.windows[0].title） |
| npm 包名 | `desktop-games-p0`（`private: true`） | `package.json:2` |
| Cargo 包名 / exe | `desktop-games-tauri` / `desktop-games-tauri.exe` | `app/tauri/src-tauri/Cargo.toml:2`；`scripts/check-version.mjs` TARGET 常量 |
| 发布产物名 | `DesktopGames-<ver>-portable.zip`、`DesktopGames_<ver>_x64-setup.exe`、`DesktopGames_<ver>_x64_en-US.msi` | `scripts/release-win.mjs:253-255` |
| 存档/同意数据目录 | `%APPDATA%\com.perrylink.desktopgames`（Rust `app_data_dir()`） | `app/tauri/src-tauri/src/main.rs:604,1103,1165,1180`；`scripts/e2e-tauri.ps1:19` |
| WebView2 profile / localStorage | `%LOCALAPPDATA%\com.perrylink.desktopgames`（Tauri 2.12.5 默认把 `app_local_data_dir()` 作为 webview `data_directory`） | `tauri-2.12.5/src/manager/webview.rs:559-565`（cargo registry 只读对照） |
| 状态真值展示 | `DesktopGames 0.1.0 / com.perrylink.desktopgames` | `docs/STATUS.md:14`（由 `scripts/gen-status.mjs` 从 tauri.conf 生成） |

### 2.2 公开导出通道身份（已完成迁移，作为目标参照）

- `docs/audit/FAMLING-PUBLIC-BOUNDARY-2026-11-18.md:206`：公开仓 `PerryLink/famling` 已把
  `tauri.conf.json` 改为 `productName: Famling`、`identifier: com.perrylink.famling`、窗口标题
  `Famling · 汀岚`；Rust crate 改名 `famling-tauri`；产物样例
  `Famling_0.1.0_x64-setup.exe` / `Famling_0.1.0_x64_en-US.msi` / `famling-tauri.exe`。
- 同文件 `:210-212`：公开仓 CI run `44222550110` 全绿；Windows 实机安装路径
  `C:/Users/zzhdz/AppData/Local/Famling/famling-tauri.exe`（NSIS 默认安装目录 =
  `%LOCALAPPDATA%\<productName>`），TOS 门与主界面通过。
- 结论：`Famling` 作为产品名/包名/安装目录已经在真实 Windows 上被验证可用；本 ADR 不重复
  验证这些外部事实，只决定私有 C1 通道何时、按什么顺序对齐。

## 3. 目标身份（规范表，迁移时照此执行）

| 字段 | 目标值 | 备注 |
| --- | --- | --- |
| 产品显示名 / `productName` | `Famling` | 与公开导出仓一致 |
| 副标题/角色语境 | `Famling · 汀岚` | 仅窗口标题与 About 使用；商标/角色口径仍以 DECLARATIONS 为准 |
| bundle identifier | `com.perrylink.famling` | **同时决定** AppData、WebView2 profile 与单实例身份 |
| npm 包名（private） | `famling` | 根包仍 `private: true`，不发布 npm |
| Cargo 包名 / exe | `famling-tauri` / `famling-tauri.exe` | 便携包复制名 `Famling.exe` |
| NSIS / MSI 产物 | `Famling_<ver>_x64-setup.exe`、`Famling_<ver>_x64_en-US.msi` | 由 productName 推导 |
| 便携包 | `Famling-<ver>-portable.zip` | SHA256SUMS/manifest 内路径同步 |
| 安装目录（NSIS 默认） | `%LOCALAPPDATA%\Famling` | 公开仓实机已验证 |
| 存档/同意数据（Roaming） | `%APPDATA%\com.perrylink.famling` | Rust `app_data_dir()` |
| WebView2 profile / localStorage（Local） | `%LOCALAPPDATA%\com.perrylink.famling` | Tauri 2.12.5 默认 `data_directory` |
| 更新通道 app id（若将来启用 updater） | 以新 identifier 为准 | 见 `docs/plan/ADR-UPDATER-2026-11-20.md`；身份迁移必须先于首次 updater 发布 |

**单一事实源建议**：当前身份没有单一来源（tauri.conf + 各脚本/文档各写一份）。迁移任务应
同时引入 `config/product-identity.json`（或等价）作为机器可读单一源，脚本从它读取并生成
`tauri.conf.json` 的 `productName`/`identifier`（属“新增/生成器”工作，**本轮未做**）。

## 4. 身份字符串分布清单（迁移时必须一起改的文件）

| 位置 | 旧值/职责 | 迁移动作 | 本轮状态 |
| --- | --- | --- | --- |
| `app/tauri/src-tauri/tauri.conf.json` | productName / identifier / 窗口 title | 改 3 处 | **未改**（本轮禁改） |
| `app/tauri/src-tauri/Cargo.toml` + `Cargo.lock` | crate 名 `desktop-games-tauri`；exe 名 | 改名并重建 lock | **未改** |
| `package.json` + `package-lock.json` | npm 名 `desktop-games-p0` | 改名（private 不变） | **未改** |
| `scripts/check-version.mjs` | `TARGET = 'desktop-games-tauri'` 镜像 Cargo.lock | 同步常量 | 未改（脚本不在本轮授权） |
| `scripts/release-win.mjs` / `scripts/lib/release-signing.mjs` | 产物名、exe 路径、`PRODUCT`、说明文案 | 全部改为 Famling | 未改（需专门任务） |
| `scripts/release-evidence.mjs` | `PRODUCT_DEFAULT`（会优先读 tauri.conf，但默认值/验证路径要改） | 同步 + 证据 schema 版本 | 未改（需专门任务） |
| `scripts/package-portable.ps1` / `scripts/playtest-kit.mjs` | 便携 exe 名、zip 名、试玩说明 | 同步 | 未改（需专门任务） |
| `scripts/e2e-tauri.ps1` | 硬编码 `%APPDATA%\com.perrylink.desktopgames` 真实数据快照目标 | **先改逻辑**（从 identifier 派生，见 §6），再随迁移改 | 未改（需专门任务） |
| `scripts/cdp-pet-portable.mjs` / `scripts/cdp-aquarium-save.mjs` | 硬编码旧 APPDATA 路径读存档 | 同步 | 未改（需专门任务） |
| `app/tauri/src-tauri/src/main.rs` | `app_data_dir()` 使用、日志前缀 `[desktop-games]`、tray id `desktop-games-tray`、便携 profile 名、QA env 名 `DG_QA_DATA_DIR` | 改数据目录迁移逻辑 + 文案/ID；QA env 名是否改需单独决定（改动会影响测试） | 未改（Rust 不在本轮授权） |
| `docs/STATUS.md`（生成） | product-identity 行 | `npm run status` 重新生成 | 未改（身份未变） |
| `docs/RELEASE-*.md` / `README.md` / `DECLARATIONS.md` / `NOTICE` | 旧产品名引用 | 随发布说明同批更新；不得超前宣称 | 未改 |
| `tests/data-isolation-exit.test.ts` | 断言脚本里旧 identifier 字面量 | 守卫改逻辑后同步改断言（断言“派生自 tauri.conf”而不是字面量） | 未改 |
| `tests/legal-package-portable.test.ts` | 允许 `DesktopGames.exe` 条目 | 迁移窗口改 `Famling.exe` | 未改 |
| `tests/release-sign.test.ts` | 仓库 exe 路径 `desktop-games-tauri.exe`（不存在则跳过） | 迁移窗口改路径 | 未改 |
| `plugins/dsh-famling/package.json`（仓外同工作区） | 插件名 `dsh-famling`，与产品名解耦 | 不需要跟产品名改；但缺 `repository`/`prepack`（MB-094 遗留，见供应链文档） | 未改（不在授权） |

## 5. AppData / 本地数据迁移方案（迁移任务执行时照做）

### 5.1 路径与内容

| 数据 | 旧（DesktopGames） | 新（Famling） | 写入方 |
| --- | --- | --- | --- |
| 存档 `saves/*.json`、`.bak`、`.tmp` | `%APPDATA%\com.perrylink.desktopgames\saves\` | `%APPDATA%\com.perrylink.famling\saves\` | Rust host（`app_data_dir()`） |
| 宿主 TOS 同意标记 `consent/host-consent.json` | `%APPDATA%\com.perrylink.desktopgames\consent\` | `%APPDATA%\com.perrylink.famling\consent\` | Rust host |
| 前端偏好/localStorage（`desktop-games/pet/*` 等） | `%LOCALAPPDATA%\com.perrylink.desktopgames\EBWebView\` | `%LOCALAPPDATA%\com.perrylink.famling\EBWebView\` | WebView2（Tauri 默认 data_directory） |
| 安装目录 | `%LOCALAPPDATA%\DesktopGames\`（NSIS 默认） | `%LOCALAPPDATA%\Famling\`（公开仓实机验证） | NSIS/MSI |

> 注：localStorage 的键名仍是 `desktop-games/pet/...` 前缀（`src/pet/**` 中 80+ 处）。
> **键前缀不需要为身份迁移而改**：它们属于已发布数据格式，改名只会增加迁移面。
> 需要迁移的是“承载这些键的 WebView2 profile 目录”，不是键名。

### 5.2 前置条件（硬门槛）

1. 应用完全退出（单实例互斥已保证不会双开；迁移必须在创建窗口之前完成）。
2. 旧目录存在且是普通目录（拒绝 symlink/junction/UNC；`canonicalize` 后断言仍在预期的
   `%APPDATA%` / `%LOCALAPPDATA%` 根下）。
3. 新目录不存在或为空；**绝不覆盖**已有新数据。
4. 磁盘可用空间 ≥ 旧数据大小的 2 倍；超过上限（建议 256 MiB）时跳过 WebView2 复制并降级。

### 5.3 迁移算法（copy-only，非破坏）

1. **探测**：只读旧路径，列出白名单文件（存档 slot 的 `.json`/`.bak`、`consent/host-consent.json`）；
   忽略 `.tmp`、未知扩展名、任何子目录。
2. **备份**：在旧目录内写 `migration-backup-<timestamp>.json`（仅清单 + 哈希，不复制内容）；
   也可以把旧目录整体复制到新目录的 `legacy-backup/` 之外的位置——由用户可见的“备份”目录承载。
3. **复制存档/同意**：逐文件 `copy` 到新目录，落盘后再 `sha256` 校验；校验失败 → 删除新目录
   的部分副本、保持旧数据只读、提示“迁移失败，可稍后重试”，应用以“新身份 + 空数据”启动。
4. **复制 WebView2 profile**：在创建 webview 之前，把旧 `EBWebView` 递归复制到新 local 目录；
   跳过 `Cache`/`Code Cache`/`GPUCache`/`ShaderCache` 等缓存目录与 `*.log`；单文件失败不致命，
   但 `Default\Local Storage` 目录复制失败 = 视为失败（偏好/同意记录会丢）。
5. **写迁移标记**：新目录 `migration.json`，schema 固定：
   `{schema:1, from, to, migratedAt, appVersion, migrationCodeVersion, files:[{rel,bytes,sha256}],
   webviewProfile:{copied:bool, reason?}, legacyRetained:true}`。
6. **不删除旧目录**（任何情况下都不自动删）。设置/About 显示旧数据路径与“迁移已完成/已保留”；
   将来如需清理，单独做显式确认的“删除旧数据”入口（并要求先关应用 + 三段式删除）。
7. **读取回退**：新目录存在迁移标记 → 只读新目录；新目录无标记且旧目录有数据 → 迁移前
   允许只读旧目录（但迁移代码应在本轮内跑完，正常路径不会长期依赖回退）。

### 5.4 失败/降级行为

| 场景 | 行为 |
| --- | --- |
| 旧目录不存在 | 正常全新启动，不写迁移标记 |
| 新目录已有数据 | 跳过迁移；日志一条（不含隐私内容）；不覆盖、不合并 |
| 存档复制失败 | 新身份空存档启动；旧数据原样保留；下次启动可重试（幂等） |
| WebView2 profile 复制失败 | 新身份空 profile 启动；TOS 需重新同意、偏好重置；存档不受影响 |
| 迁移中途崩溃 | 下次启动检测 `migration.json` 缺失 → 重新执行（幂等），已复制文件按哈希跳过 |

### 5.5 回滚

- **旧目录永不修改** ⇒ 回滚 = 卸载新身份、重装 C1 旧身份；旧身份读旧目录，数据完好。
- 新目录可整体删除（仅用户显式操作；应用不自动删）。
- 回滚演练必须包含：迁移后回装旧包 → 旧存档可读、旧 TOS 不重弹、无任何路径被删除。

## 6. E2E / CI 数据隔离守卫“先改逻辑”（迁移的硬前置）

现状（`scripts/e2e-tauri.ps1:19`）：真实数据快照目标硬编码
`$realAppData = Join-Path $env:APPDATA 'com.perrylink.desktopgames'`。
`DG_QA_DATA_DIR` 通过 Tauri `app_directories_override` 在 builder 之前设置，
**同时覆盖 `app_data_dir()` 与 `app_local_data_dir()`**（Tauri 2.12.5：
`app_directory_override` → `Root` 对 Data/LocalData 不加子目录；webview 默认
`data_directory` 取 `app_local_data_dir()`），所以 QA 隔离本身是有效的。

但**守卫只快照了 Roaming 目录，没有快照 Local（WebView2）目录**，且硬编码 identifier，
一旦改身份，守卫会变成“永远通过的空守卫”。**必须先改逻辑，再改身份**：

1. 从 `tauri.conf.json` 读取 `identifier`（PowerShell 解析 JSON，不猜不写死）。
2. 派生并快照**两个**真实目录：`%APPDATA%\<identifier>` 与 `%LOCALAPPDATA%\<identifier>`。
3. 迁移窗口内同时快照旧/新两个 identifier 的两对目录（4 个路径）。
4. 任何派生结果为空/看起来像旧值/目录不存在 → 打印并 **fail closed**（不允许“跳过快照继续跑”）。
5. `tests/data-isolation-exit.test.ts` 的断言从“脚本含旧字面量”改为“脚本从 tauri.conf 派生
   identifier + 快照两个目录 + 失败关闭”；旧字面量断言删除。
6. 该守卫改造与身份迁移**同一 release window 合并**；改造本身可在身份不变时就先落地并跑绿。

## 7. 发布窗口执行计划（C1 之后；建议独立任务号）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 决策/法务 | 产品名 `Famling` 由 owner 书面确认（商标检索结论记录进 DECISIONS）；公开仓/C1 身份口径统一 | 决策记录有日期/范围/回滚口径 |
| P1 守卫先行 | §6 的 e2e 守卫改逻辑 + 测试更新，身份不变下跑绿 | `npm run ci` 绿；守卫断言派生 |
| P2 代码/元数据改名 | tauri.conf / package / Cargo / scripts / docs 同批改；`version:check` 仍绿 | `npm run ci` 绿；`cargo build` 绿；产物名齐 |
| P3 迁移运行时 | §5 算法在 Rust 实现 + 单测（好档/坏档/半迁移/无权限/磁盘满/超大 profile） | 单测 + 故障注入绿 |
| P4 演练 | 干净安装→迁移→P5 回滚演练；便携/NSIS/MSI 三种路径；真实 Windows 机 | 迁移标记/哈希/旧目录只读不变；回滚后旧数据可读 |
| P5 证据重建 | `release-evidence` 用新身份重跑；C1/C2 发布说明写明“身份迁移 + 数据迁移” | 新旧 evidence 不混用；STATUS 重新生成 |
| P6 发布 | 按 C 通道纪律发布；保留旧安装包与回滚说明 | 发布记录 + 用户可见迁移提示 |

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 半改身份（配置改了脚本没改）→ 发布产物/证据错位 | 本 ADR 明确要求原子迁移；`tests/e9-supply-chain-update.test.ts` 冻结“本轮未执行”的现状断言直到迁移任务改它 |
| 用户数据丢失 | copy-only + 哈希校验 + 旧目录永不删 + 回滚演练 |
| WebView2 profile 复制损坏 | 只复制必要子目录；失败降级为“新 profile + 重同意”，不阻塞存档迁移 |
| 双身份并存（旧包未卸载） | 单实例互斥按 identifier 区分；迁移任务需在首启提示“检测到旧版数据”并给处理入口；发布说明写明 |
| updater 路径断裂 | 首次 updater 发布必须在身份迁移之后；updater app id 与签名链一起设计（见 updater ADR） |
| 法务/商标 | `Famling` 商标风险仍以 owner/律师结论为准；本 ADR 不构成商标可用性判断 |

## 9. 本轮明确未做（防止误读）

- 未改 `tauri.conf.json` 的 `productName` / `identifier` / 窗口标题；
- 未改 `package.json` / `Cargo.toml` 的名称；未重建 lock/包；
- 未实现任何 AppData 迁移代码、未改动 Rust / E2E 脚本 / release 脚本；
- 未删除或移动任何用户数据目录；未伪造任何迁移验证；
- C1 evidence 仍是 `DesktopGames 0.1.0`（`artifacts/evidence/2026-11-20-c1-final-6404d43/`）。

## 10. 参考

- `docs/plan/MASTER-BACKLOG-2026-11-19.md` §E9（MB-093）
- `docs/plan/EXECUTION-STATUS-2026-11-20.md` §E9
- `docs/audit/FAMLING-PUBLIC-BOUNDARY-2026-11-18.md:206-212`（公开导出身份迁移与实机证据）
- `artifacts/evidence/2026-11-20-c1-final-6404d43/RELEASE-MANIFEST.json`（C1 身份绑定）
- `app/tauri/src-tauri/src/main.rs:604,965-976,1103,1165,1180`（app_data_dir / QA override）
- `scripts/e2e-tauri.ps1:14-60`（当前隔离守卫实现）
- `docs/plan/ADR-UPDATER-2026-11-20.md`（更新通道与身份迁移的先后关系）
