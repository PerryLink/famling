# ADR-2026-11-20：自动更新（updater）/minisign/回滚策略 — 决策建议

> **Status: PROPOSED — 默认不做（C1 不启用 updater）。需要 owner 对 D2 拍板后才可能进入实现。**
> 关联：task-93 / MB-092（`ADR=yes 才做`）。写于 2026-11-20，基线 HEAD `6404d43`。
> **本轮明确未做**：没有引入 `tauri-plugin-updater`，没有生成/保存任何 minisign 密钥，没有配置
> endpoint，没有签名任何更新产物，没有修改 Cargo/tauri.conf。本文件是决策记录与实现前置条件，
> 不是更新功能已实现或已启用的声明。

## 1. 决策建议（一句话）

**C1（unsigned invite beta）不启用自动更新；维持“人工下载新安装包 + 发布说明披露”的方式。**
若 owner 拍板 D2=yes，则采用**方案 B：Tauri v2 官方 updater + minisign 离线签名 + HTTPS 白名单
endpoint**，但必须排在这些前置之后：C2 Authenticode 代码签名、身份迁移（Famling）完成、
密钥 ceremony、回滚演练、以及更新清单签名流水线。**任何情况下不做无签名/可降级/静默强制更新。**

## 2. 现状（实测，2026-11-20）

| 事实 | 证据 |
| --- | --- |
| 无 updater 依赖 | `app/tauri/src-tauri/Cargo.toml` 没有 `tauri-plugin-updater`；`app/tauri/src-tauri/tauri.conf.json` 没有 `plugins.updater`；Rust/TS 无 updater 调用 |
| 发布通道 C1 是 unsigned | `docs/STATUS.md`：`signing: unsigned`；`artifacts/evidence/2026-11-20-c1-final-6404d43/RELEASE-MANIFEST.json`：`unsigned: true`、`signing.reason: no Authenticode certificate` |
| 无真实 CI/无 remote | `docs/plan/ci-runs.json` 为 `[]`；`git remote -v` 为空（`docs/STATUS.md`） |
| 无代码签名证书 | MB-091 C2 仍 BLOCKED-EXTERNAL（需采购 OV 证书） |
| 无更新服务器/密钥 | 无 release 托管端、无 minisign 公钥、无密钥保管记录 |
| 有可复用的发布证据链 | `release-evidence` / `release-win` / `release-sign`（unsigned 显式标注） |

结论：现在启用 updater 等于在**无代码签名、无密钥仪式、无托管端、无回滚演练**的前提下引入
一条 RCE 级信任通道，风险不可接受；且 C1 是私域邀请 beta，人工分发完全够用。

## 3. 选项

| 方案 | 内容 | 安全面 | 成本 | 结论 |
| --- | --- | --- | --- | --- |
| A. 不做 updater（C1 默认） | 用户手动下载新安装包覆盖安装；发布说明/SHA256SUMS 供校验；安全公告走发布说明 | 最小：无新增信任通道 | 0 | **C1 采用** |
| B. Tauri v2 updater + minisign（推荐的后继路线） | 官方插件；endpoint 返回签名清单；应用内提示 → 用户确认 → 下载 → 校验签名 → 安装 | 中：依赖密钥保管 + endpoint HTTPS + 代码签名 | 3–5 人日 + 密钥 ceremony + 托管 | **D2=yes 后采用**，前置条件见 §5 |
| C. 自研更新器 | 自写下载/校验/安装 | 高：重复造轮子，易出 TOCTOU/降级/回滚漏洞 | 高 | 拒绝 |
| D. 自动静默强制更新 | 后台下载自动替换 | 最高：破坏“低打扰/用户可控”定位，故障即全员 | 高 | 拒绝 |

## 4. 若 owner 选 A（C1）需要保持的纪律

1. 发布说明必须写：**未签名、不自动更新、需手动下载覆盖安装**；给出 SHA256SUMS 校验方法。
2. 安全公告（若有）：通过发布说明/私域渠道披露；**不通过“应用内弹窗自动拉取”实现**。
3. 安装包升级路径必须测：覆盖安装保留 `%APPDATA%` 存档与 `%LOCALAPPDATA%` WebView2 数据。
4. 禁止在代码/配置里预留半成品 updater 字段（避免误以为已启用）。

## 5. 若 owner 选 B：实现前置条件（逐条门禁）

### 5.1 必须先成立的外部条件

1. **C2 Authenticode 代码签名落地**（MB-091）：updater 下载的安装包必须已签名；否则更新通道
   等于把“未签名 exe 自动执行”合法化。
2. **身份迁移完成**（`docs/plan/ADR-IDENTITY-MIGRATION-2026-11-20.md`）：updater 的 app id/endpoint
   路径/安装包命名必须建立在 Famling 新身份上；迁移前启用会让更新链在改名时断裂。
3. **密钥 ceremony**：离线生成 minisign 密钥对；私钥离线保管（至少 2 份离线介质，口令分离）；
   公钥进仓库（`plugins.updater.pubkey`）；记录生成日期/持有人/轮换/吊销流程；**私钥永不进仓库/CI 日志**。
4. **托管与发布流水线**：HTTPS endpoint（证书有效、域名受控、只读静态 JSON）、发布产物签名
   （`createUpdaterArtifacts: true` 产出 `.sig`）、清单生成/归档、灰度与撤回流程。
5. **owner D2 书面拍板**：记录“做/不做、谁维护密钥与服务器、故障谁回滚”。

### 5.2 技术设计（Tauri v2 机制，实现时以锁定版本文档为准）

- 依赖：`tauri-plugin-updater = "2"`（crate）+ JS `@tauri-apps/plugin-updater`（如走前端）。
- 配置（示意，**本轮未落地**）：

```jsonc
// app/tauri/src-tauri/tauri.conf.json（示意）
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "pubkey": "<minisign public key>",
    "endpoints": ["https://<owned-domain>/famling/{{target}}/{{arch}}/{{current_version}}"]
  }
}
```

- 签名：CI 用 `TAURI_SIGNING_PRIVATE_KEY`（secret）/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 对更新
  产物签名；私钥只经环境变量注入，不落 workspace/artifact（沿用 `_windows-build.yml` 现有的
  PFX 注入-清理模式）。
- 更新清单（endpoint 返回）应包含：`version`、`pub_date`、`platforms.windows-x86_64.{signature,url}`；
  签名覆盖安装包字节 + 版本元数据，防篡改/防错配。
- 更新流程（fail-closed）：检查 → 展示版本/说明 → 用户确认 → 下载到临时目录 → 校验 minisign
  签名 + SHA-256 → 判定“版本必须严格大于当前”（默认禁止降级）→ 调 NSIS 安装（passive）→
  重启并校验启动成功；任一步失败 → 不安装、保留旧版本、向用户显示可操作错误。
- 权限：capability 只给 `updater:default` 所需最小集；endpoint 走 Rust `reqwest`（已有依赖），
  **不开放 webview 任意网络**。
- 日志：只记录版本号/结果码/错误类别，不记录完整 URL 查询串或用户标识。

### 5.3 回滚与防降级

| 场景 | 策略 |
| --- | --- |
| 新版本启动失败/崩溃 | 保留旧安装包与旧版本数据；发布说明给出手动回装步骤；不自动回滚（避免反复抖动） |
| 需要撤回坏版本 | 关闭 endpoint 中该版本（发布清单移除）+ 发布修复版本；客户端只认 endpoint，所以撤回即时生效 |
| 恶意/错误降级 | 客户端默认拒绝 `version <= current`；不支持“远程指定旧版本”；离线降级只能靠用户手动装旧包 |
| 密钥泄露/轮换 | 预案：发布新版本内嵌新公钥（旧版本无法自动信任新钥 → 必须人工升级过渡）；旧钥吊销记录进发布说明 |
| endpoint/密钥不可用 | fail-closed：检查失败=不更新，不阻塞应用启动；提示“稍后重试” |

### 5.4 验收标准（实现任务用）

1. 签名密钥 ceremony 记录完整（生成日期/持有人/离线保管/轮换计划），公钥冻结进配置。
2. 伪造签名/篡改安装包/降级清单 → 客户端拒绝安装并有测试；错误 endpoint/404/超时 → 不更新。
3. 从 N 到 N+1 的升级演练：存档、consent、WebView2 偏好保留；回装旧版本可读旧数据。
4. 发布流水线可重复产出 `setup.exe` + `.nsis.zip` + `.sig`，更新清单与 SHA256SUMS 同源。
5. 发布说明明确“自动更新已启用 + 校验方式 + 回滚方式”；不夸大为“安全自动更新”。

## 6. 与身份迁移/签名的顺序约束

```text
C1（现状，DesktopGames，unsigned，无 updater）
  → 身份迁移（Famling，独立窗口；见 identity ADR）
  → C2 代码签名（Authenticode 证书 + 签名报告）
  → updater 密钥 ceremony + 托管 + 实现（仅当 D2=yes）
  → 带自动更新的 C3 发布
```

反向顺序（先 updater 后迁移/签名）会产生“更新链指向旧身份/未签名产物”的不可回滚错误。

## 7. 决策记录（待 owner 填）

| 项 | 值 |
| --- | --- |
| D2 决策 | ☐ 不做（C1 默认） ☐ 做（方案 B） ☐ 其他：____ |
| 决策日期 | ____ |
| 负责人（密钥/服务器/回滚） | ____ |
| 生效发布通道 | ____（最早 C3） |

## 8. 参考

- `docs/plan/MASTER-BACKLOG-2026-11-19.md` §E9（MB-092，`ADR=yes 才做`）
- `docs/plan/EXECUTION-STATUS-2026-11-20.md` §E9（MB-092 TODO，依赖 D2）
- Tauri v2 updater 官方文档：<https://v2.tauri.app/plugin/updater/>（外部资料，实现时以锁定版本为准）
- `docs/RELEASE-SIGNING.md`（现有 Authenticode/minisign 签名边界与 unsigned 声明纪律）
- `docs/plan/ADR-IDENTITY-MIGRATION-2026-11-20.md`（身份迁移必须先行）
