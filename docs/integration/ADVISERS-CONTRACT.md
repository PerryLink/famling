# Advisers ⇄ desktop-games 集成契约（Pet Brief）

| 项目 | 内容 |
|---|---|
| 状态 | **生效（2026-11-17）**；消费端已接受 contract v0.1 + v0.2；Advisers 侧 pin `advisers@0.2.1` |
| 负责 | desktop-games：Advisers consumer 通道（`src/presence/**`、`src/pet/advisers/**`、本文件、`docs/audit/ADVISERS-*`）；Advisers 仓由 Advisers 维护者负责 |
| 范围 | 只读 Pet Brief 文件契约、版本协商、升级/回滚、TOS/safety 对齐、Tauri 读取命令建议；**不含** UI、consent、safety、security 实现（其他工作线）与 Rust 实际改动 |
| 基线 | desktop-games `844ead1`（2026-11-17 14:27 +08）；Advisers `v0.2.0` tag（annotated tag object `5d0bdeb` → commit `7f8c6d8`，2026-11-17） |
| 验收报告 | `docs/audit/ADVISERS-020-COMPAT-2026-11-17.md` |

> 本文件是 **desktop-games 侧的集成契约与升级 runbook**，不是 Advisers 发布物的一部分，也不改写 Advisers 的 canonical 契约。
> 契约形状以 Advisers 仓 `docs/pet-brief/` 快照为准；本文的 hash/行号用于复现核对。

---

## 1. 关系模型与 pin

**Advisers = 版本化文档/契约的生产者；desktop-games = 稳定版的异步消费者。**
两者不共享进程、不共享数据库、不互相 import：Advisers 通过一个固定路径的、只读、脱敏、5 分钟过期的 JSON 投影对外发布；
桌宠以 60s 轮询消费，读不到/过期/非法一律退回普通桌宠（idle），不回写、不联网、不调模型。
这是「核心产品发布契约、宿主异步消费」的分层，类似 Cordis 生态里核心与宿主的分层，但**没有**插件运行期、没有共享对象模型、
没有 DSH/Koishi 宿主 API 依赖——不要用宿主插件 API 的假设去推断本通道（本通道只有“文件 + schema”）。

### 1.1 当前 pin

| 项 | 值 | 证据 |
|---|---|---|
| 包版本 | `advisers@0.2.1`（npm `latest`，六包 lockstep：advisers / core / office / policy-strict / bridge-hermes / dsh-advisers；两个私有 link-* 同版本不发布） | Advisers `CHANGELOG.md` §0.2.0；`eval/results/E11-release-2026-11-17.md`（80/80 registry/tarball/install checks） |
| 发布 tag | annotated `v0.2.0` → tag object `5d0bdeb` → commit `7f8c6d8` | `git cat-file -p v0.2.0` / `git rev-parse v0.2.0^{commit}` |
| 契约版本 | `schemaVersion: 2`（contract v0.2）；v0.1 = `schemaVersion: 1` 作为 legacy 可读 | `docs/pet-brief/README.md`、`schema-v0.2.json` |
| 契约快照 | `docs/pet-brief/schema-v0.2.json` sha256 `bd2704c5…`（快照与 tag 逐字节一致） | `sha256sum`；`git diff v0.2.0..HEAD -- docs/pet-brief` 为空 |
| 生产者实现 | `packages/advisers/lib/pet-brief.js` sha256 `a6fd05c0…`（`buildPetBrief` / `validatePetBrief` / `writePetBriefAtomic`） | 同上 |
| TOS | v2026.11.2（effective 2026-11-17），`docs/TOS.md` sha256 `c40f869a…`；随包分发 `packages/advisers/lib/tos/` | `docs/TOS.md` 头表；`lib/tos/manifest.json` |
| 消费者契约快照 | `docs/contracts/pet-brief/`（v0.1 私有 `PerryLink/famling` 快照，只读，不改写） | 其 `SOURCE.md` blob sha |
| 生产/消费实现 | `advisers pet-brief --out ~/.advisers/pet-brief.json` → Tauri `read_advisers_brief` → `validatePetBrief` → `AdvisersFaceController` | `src/presence/pet-brief.ts`、`src/pet/advisers/face.ts`、`app/tauri/src-tauri/src/main.rs:85` |

**pin 原则**：集成文档只 pin `advisers@0.2.1` 这一稳定 release；不 pin preview/next，不在 consumer 代码里依赖 `advisers` 包或 `~/.advisers`
的数据库/审计链。`schemaVersion` 是契约 major，与包版本解耦：**包升级 ≠ 契约升级**，反之亦然。

---

## 2. 传输与文件契约（不随 v0.2 改变）

| 项 | 契约 | consumer 侧实现 |
|---|---|---|
| 路径 | 固定本地文件：`$ADVISERS_HOME/pet-brief.json`；未设时用户主目录 `.advisers/pet-brief.json`（Windows `%USERPROFILE%`，Unix `$HOME`） | Tauri 命令按同一优先级解析；无文件 → `NO_FILE`（软状态，不报错） |
| 写 | 只由 `advisers pet-brief --out` 写；同目录临时文件 + `fsync` + `rename` 原子替换，`0600` | consumer 只读；不做半写文件修复（原子替换 + 整份拒绝已覆盖） |
| 读 | 只读 `pet-brief.json`；不做网络/socket/stdio/MCP/HTTP | Tauri 同步读 + 前端 8s 超时（超时忽略迟到结果） |
| 大小 | **128 KiB** 上限（生产者/传输/消费者各校验一次） | Tauri `metadata.len() > 128*1024` 拒绝；前端按 UTF-8 字节再校验 `PET_BRIEF_MAX_BYTES` |
| TTL | `expiresAt = generatedAt + 5min`（ISO 8601 必须带时区） | `now >= expiresAt` → `STALE`（保留 lastBrief 但标记 stale；不把旧承诺当当前事项） |
| 隐私 | 无 CoT/提示词/正文/密钥/情感字段；`secrecy >= 2` 事项整体排除；人名启发式替换为 `某客户` | closed schema：未知字段/禁止字段递归拒绝；`suggestedLines` 不进投影；`redactions` 只做日志 |
| 回写 | **无**：consumer 不写 Advisers 存储，pat/drag/talk 不回传 | 只读；无写路径 |
| 无 Tauri | 浏览器模式不得伪造数据 | `NO_TRANSPORT`（`unavailable`，不崩溃） |

---

## 3. 版本协商与兼容窗口

### 3.1 契约族谱

| 契约 | `schemaVersion` | 生产者 | `displayPolicy` | consumer 行为 |
|---|---|---|---|---|
| v0.1（2026-11-14 design contract） | `1` | `advisers@0.2.1-preview.71` 及更早 | 无字段 | **接受（legacy）**，warning `W_LEGACY_SCHEMA_VERSION` + `W_MISSING_DISPLAY_POLICY`，按 `private` 处理 |
| **v0.2（当前）** | `2` | `advisers@0.2.1` stable | `public \| private \| none`，缺失=warning+`private` | 严格校验；`private`/`public` 接受，`none` → `skip(display_none)` |
| 未来 major（≥3） | `>= 3` | 未知，不得提前假设 | — | **refuse fail-closed**（`SCHEMA_VERSION`，状态 `UNSUPPORTED_SCHEMA`）；不降级按 v0.1 解析、不以 `public` 渲染 |

### 3.2 协商算法（consumer 必须按此实现，已实现）

```ts
// src/presence/pet-brief.ts（伪码，行号见实现）
const version = brief.schemaVersion
if (![1, 2].includes(version)) return reject('SCHEMA_VERSION')   // 含未来版本：refuse，不 fallback
if (version === 1) warn('W_LEGACY_SCHEMA_VERSION')                // 只警告，不失败
const policy = brief.displayPolicy ?? 'private'                   // v0.1/缺省 = private（安全默认）
if (!['public', 'private', 'none'].includes(policy)) return reject('ENUM')
if (policy === 'none') return skip('display_none')                // 不保留/不渲染任何派生态
```

- **未知未来版本策略 = refuse（不是 warn+legacy fallback）**：未来文档可能新增本消费者无法执行可见性规则的字段；
  按 v0.1 猜读会把未知语义降级成可展示内容，是隐私风险。`PET_BRIEF_FUTURE_SCHEMA_POLICY = 'refuse'`。
- 防御纵深：`toPresenceEvent` / `projectToDirective` / `resolveSuggestedLines` 对未支持版本也返回 `null`/空，
  即使调用方跳过 `validatePetBrief` 也不会驱动桌宠。
- `displayPolicy` 归一化（v0.1 缺字段 → `private`）是 consumer 责任；producer 永远显式写该字段。

### 3.3 兼容窗口（本消费者）

- 必须同时接受 `schemaVersion 1|2`，直到**至少**下列条件全部满足：v0.2 producer 已稳定运行一个 MINOR 周期、
  v0.1 文件因 5min TTL 不再可能存在、且 release notes 明示放弃 legacy。否则不能只接受 v2。
- 当前 release（0.2.x）**不**声明升级到只接受 v2；收紧需单独变更 + 测试矩阵更新。
- 未来 0.3 的接入顺序见 §8（consumer 先、producer 后；不得反向）。

---

## 4. 0.2.0 相对上一版（`.71` preview）的兼容性清单

### 4.1 对 Pet Brief consumer 有影响的变更

| 变更 | 性质 | consumer 处置 |
|---|---|---|
| `Pet Brief contract v0.2`：`schemaVersion: 2` + `displayPolicy`（private 默认，`public` 必须显式，`none` 禁用） | **行为 breaking（对硬校验 `===1` 的旧消费者）**；对已升级消费者 non-breaking | 已接受 `1|2`、缺省 `private`、`none` 跳过并丢弃保留数据；`warnings` 暴露 |
| v0.1 brief 可读为 legacy（producer 也接受 `1` 并给 warning） | non-breaking（新增兼容） | 保留 v0.1 支持；不再硬拒 |
| producer `--out` 原子写 0600（v0.1 起就有，0.2.0 发布说明列为加固项） | non-breaking | 依赖原子替换；不做半写修复 |
| `pet-brief` CLI 新增 `--display-policy public|private|none`、`--check --strict`、`--print-schema`、warnings 不使用退出码 | non-breaking（CLI 表面新增）；**自动化若解析 stdout 需适配 `warnings`** | consumer 不调 CLI；跨仓验收脚本可加 `--check --strict` |
| TOS v2026.11.2 + 首启/版本变更同意门：`pet-brief` 是**受门控命令**（非豁免），非交互未同意 → 退出码 3 + `E_TOS_REQUIRED` | **breaking（对无 TOS 同意的自动化定时任务）** | 定时任务必须先在交互界面同意，或显式 `--accept-tos` / `ADVISERS_ACCEPT_TOS=1`（记录 `non_interactive=1`） |
| 本地内容安全规则层（14 类 / 92 规则，规则集 `advisers-content-1`）接入 pet-brief 路径，对 `suggestedLines` 等做 `block` 过滤 | 行为 non-breaking（可能少一些台词；契约/字段不变） | consumer 的 claims guard 继续独立校验；不因 safety 过滤而扩权 |
| 许可切换：软件 PolyForm NC 1.0.0、文档/数据 CC BY-NC-SA 4.0（source-available，非 OSI） | **法律/分发 breaking**（商用需单独书面许可；不追溯旧版本） | 集成方与重新分发者需评估；契约 schema/test vector 的互操作许可见 TOS §3.2.2 |

### 4.2 与 Pet Brief 通道无直接关系（不要混入版本协商）

- **MCP**：server 抽到 `lib/mcp-server.js`，7 tools（5 只读 + 2 白名单写路径）+ 4 只读 resources、错误码与 1 MiB 行上限；
  `advisers mcp --stdio` 已接线。桌宠**不消费** MCP。
- **DSH bundle**：2 → 5 tools（`advisers_brief` / `advisers_office` / `advisers_today` / `advisers_who` / `advisers_evidence`，后三个只读）；
  依赖 DSH preview line（`@deepseek-ai/dsh-tools` rc）。桌宠**不消费** DSH 工具。
- 交付回执 v1.1、提醒 offsets/webhook/scheduler、RRULE、source schema v2、性能/鲁棒性修复：与 brief 契约无关。

> 结论：对桌宠通道，**唯一必须同步的是 contract v0.2 + TOS 门 + 许可告知**；MCP/DSH 工具数变化不改变 Pet Brief schema，
> 不得作为“必须升级 consumer”的理由，也不得反向要求 producer 回退 v0.1。

---

## 5. 升级检查清单（consumer-first，顺序不可反）

> 反序后果：producer 先输出 v0.2，旧 consumer 把每份 brief 判 `SCHEMA_VERSION` → 永远 idle（不崩溃，但功能静默消失）。

1. **冻结证据**：确认 Advisers 发布证据（`CHANGELOG.md` / `E11-release-2026-11-17.md`）、tag `v0.2.0`、契约快照 hash；
   不改 Advisers 仓。
2. **版本闸门**：consumer `schemaVersion` 接受 `1|2`；未知版本 fail-closed；缺 `displayPolicy` 默认 `private` + warning。
   （`src/presence/pet-brief.ts`）
3. **displayPolicy 执行**：`none` → skip 且**丢弃**已保留 brief；`private` 默认；`public` 仅显式。
   （`validatePetBrief` + `AdvisersFaceController.handleRaw`）
4. **传输加固**：128 KiB（前后端各一次）、TTL、redaction、错误分类（`TOO_LARGE`/`UNSUPPORTED_SCHEMA`/`TIMEOUT`/`INVALID_BRIEF`）；
   Tauri 错误字符串/未来结构化错误都映射到稳定 code。
5. **验收**：
   ```sh
   cd /mnt/d/Projects/dsh/desktop-games
   node --import tsx --test tests/advisers-020-compat.test.ts tests/pet-brief-consumer.test.ts \
     tests/advisers-face.test.ts tests/advisers-harden.test.ts
   npm run typecheck
   npm test
   npm run build
   ```
6. **跨仓验收**（两层，均不动账本内容）：
   ```sh
   # A. 契约/文件校验（不需要账本；临时 ADVISERS_HOME 只放 TOS 同意记录）
   ADVISERS_HOME=/tmp/advisers-check ADVISERS_ACCEPT_TOS=1 \
     advisers pet-brief --check --strict --in /tmp/pet-brief-v02.json   # 必须 ok:true
   # B. 真实生成（需执行者已初始化账本并同意 TOS；输出到 /tmp，不写账本、不改 ~/.advisers）
   advisers pet-brief --display-policy private --out /tmp/pet-brief-v02.json
   # 再把 /tmp/pet-brief-v02.json 喂给 consumer：validatePetBrief → accept，displayPolicy=private
   ```
   `advisers pet-brief` 是受 TOS 门控命令：未同意时 exit 3 `E_TOS_REQUIRED`；非交互 CI 用 `--accept-tos`/`ADVISERS_ACCEPT_TOS=1`。
   注意 A 的 `ADVISERS_HOME` 不能用于 B：新 home 没有账本，`pet-brief` 会 `E_STORE`。
7. **producer 侧 rollout**：定时任务先同意 TOS（或显式 env），再 `advisers pet-brief --out ~/.advisers/pet-brief.json`
   （建议 1–2 分钟刷新，TTL 5 分钟）；`--display-policy` 默认 `private`，只有用户显式要求才 `public`。
8. **上线观察**：桌宠状态不得出现 `UNSUPPORTED_SCHEMA` / `INVALID_BRIEF(SCHEMA_VERSION)`；实际出现 → 先回退 producer（见 §6）。
9. **文档口径**：只有第 5–7 步全部通过后才对外写“支持 Advisers 0.2.0 / Pet Brief v0.2”。

---

## 6. 回滚方案

| 触发 | 动作 | 结果 |
|---|---|---|
| consumer 升级导致异常 | 回滚 `src/presence/pet-brief.ts` + `src/pet/advisers/face.ts` 到升级前 commit；**保留** legacy 接受路径 | 若 producer 已 v0.2：brief 被判 `SCHEMA_VERSION` → idle（可见的功能静默消失，不是崩溃/数据损坏） |
| producer 输出异常/误判 | 降级安装 `advisers@0.2.1-preview.71`（v0.1 producer）或临时停止定时任务、删除 `pet-brief.json` | consumer 接受 v0.1（warnings）；文件删除 → `NO_FILE`；不影响账本 |
| displayPolicy 误设 `none` | producer 改回 `--display-policy private`（或显式 public）；consumer 下一次轮询恢复 | `none` 期间 consumer 已丢弃保留 brief，需重新生成 |
| TOS 门导致定时任务失败（exit 3 / `E_TOS_REQUIRED`） | 在交互界面完成 `advisers tos show|accept`，或定时任务加 `--accept-tos`/`ADVISERS_ACCEPT_TOS=1` | 恢复生成；同意版本/文本变更后需重新确认 |
| consumer 必须回退但 producer 已是 0.3（未来） | **禁止**按 v0.1 猜读；保持 `UNSUPPORTED_SCHEMA` idle，等 consumer 支持 | 安全降级（宁可 idle，不展示未知语义） |

回滚纪律：不删除/不改写 Advisers 账本；不把 `~/.advisers` 纳入版本控制；真实客户数据不入测试/fixture/issue。

---

## 7. Tauri `read_advisers_brief` 审计与建议补丁（本轮**不改 Rust**）

当前位置：`app/tauri/src-tauri/src/main.rs:85`（注册于 `:536` 的 `invoke_handler`）。现状：固定路径、`metadata.len() > 128 KiB` 拒绝、
`fs::read_to_string` + `serde_json::from_str`、无写操作；前端再做 128 KiB/schema/TTL 校验。

### 7.1 审计结论

| # | 现状 | 风险/缺口 | 是否需要 Tauri 配合 |
|---|---|---|---|
| 1 | `std::fs::metadata` 跟随符号链接；未校验 `is_file()` | 固定路径可被 symlink 指向任意文件（同用户本地威胁；仍应拒绝） | 建议补丁 |
| 2 | 先 `metadata.len()` 后 `read_to_string`（TOCTOU） | 文件可在两步间变大/被替换；读取未按 cap 截断 | 建议补丁（`take(MAX+1)`） |
| 3 | 错误统一 `Err(String)`，含完整本地路径 | 前端只能按字符串正则分类；路径可能含用户名（前端已 sanitize，纵深仍应去路径） | 建议补丁（结构化 `{code,message}`） |
| 4 | 同步命令，前端 8s timeout 只忽略迟到结果 | 慢盘/网络盘会占住 IPC/工作线程，无法真正取消 | 建议补丁（`async` + `spawn_blocking`） |
| 5 | 大小上限 `128 * 1024` 硬编码 | 与前端 `PET_BRIEF_MAX_BYTES` 双写，可能漂移 | 保留双校验，注释交叉引用；不需要立即改 |
| 6 | 解析失败/非 UTF-8/非 object 都落到 `Err(String)` | 前端可 classify，但语义丢失；非 object JSON 会先过 Rust 再被前端拒 | 建议补丁 |
| 7 | 路径优先级 `ADVISERS_HOME` > `%USERPROFILE%` > `$HOME` | 与 Advisers CLI 的 `~/.advisers` 约定一致；空环境变量会产生相对路径 | 建议补丁（空值跳过 + 明确错误码） |
| 8 | 只读、无写、无网络 | 符合契约；不需要改 | 不改 |

**结论**：当前 Rust 实现**不阻塞** v0.2 消费（前端已覆盖 cap/schema/TTL/错误分类）；第 1/2/3/4/6 项建议在下次 Tauri 重建时一并修，
因为该补丁需要重编签名二进制，不适合本任务“只读审计 + 精确建议”的范围。

### 7.2 建议补丁（示意，未应用；需 Tauri 重编后验证）

```rust
use std::io::Read;

const ADVISERS_BRIEF_MAX_BYTES: u64 = 128 * 1024; // 与 src/presence/pet-brief.ts PET_BRIEF_MAX_BYTES 同步

#[derive(serde::Serialize)]
struct AdvisersBriefError {
    code: &'static str,
    message: String,
}

impl AdvisersBriefError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() } // 不含完整路径：避免用户名泄漏
    }
}

fn read_advisers_brief_blocking() -> Result<Option<serde_json::Value>, AdvisersBriefError> {
    let base = if let Some(home) = std::env::var_os("ADVISERS_HOME").filter(|v| !v.is_empty()) {
        PathBuf::from(home)
    } else if let Some(profile) = std::env::var_os("USERPROFILE").filter(|v| !v.is_empty()) {
        PathBuf::from(profile).join(".advisers")
    } else if let Some(home) = std::env::var_os("HOME").filter(|v| !v.is_empty()) {
        PathBuf::from(home).join(".advisers")
    } else {
        return Err(AdvisersBriefError::new("NO_HOME", "cannot resolve the Advisers home directory"));
    };
    let path = base.join("pet-brief.json");
    let metadata = match std::fs::symlink_metadata(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(AdvisersBriefError::new("READ_ERROR", "cannot stat pet-brief.json")),
    };
    if metadata.file_type().is_symlink() {
        return Err(AdvisersBriefError::new("UNSAFE_PATH", "pet-brief.json must not be a symlink"));
    }
    if !metadata.file_type().is_file() {
        return Err(AdvisersBriefError::new("UNSAFE_PATH", "pet-brief.json must be a regular file"));
    }
    if metadata.len() > ADVISERS_BRIEF_MAX_BYTES {
        return Err(AdvisersBriefError::new("TOO_LARGE", "pet-brief.json is larger than 128 KiB"));
    }
    let mut text = String::new();
    std::fs::File::open(&path)
        .and_then(|file| file.take(ADVISERS_BRIEF_MAX_BYTES + 1).read_to_string(&mut text))
        .map_err(|_| AdvisersBriefError::new("INVALID_UTF8", "pet-brief.json is not readable UTF-8 text"))?;
    if text.len() as u64 > ADVISERS_BRIEF_MAX_BYTES {
        return Err(AdvisersBriefError::new("TOO_LARGE", "pet-brief.json is larger than 128 KiB"));
    }
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| AdvisersBriefError::new("INVALID_JSON", "pet-brief.json is not valid JSON"))?;
    if !value.is_object() {
        return Err(AdvisersBriefError::new("INVALID_JSON", "pet-brief.json must be a JSON object"));
    }
    Ok(Some(value))
}

#[tauri::command]
async fn read_advisers_brief() -> Result<Option<serde_json::Value>, AdvisersBriefError> {
    tauri::async_runtime::spawn_blocking(read_advisers_brief_blocking)
        .await
        .map_err(|_| AdvisersBriefError::new("READ_ERROR", "brief read task failed"))?
}
```

### 7.3 前端配套（已完成，向后兼容两种错误形态）

- `classifyReadError` 已同时支持：今天的 `Err(String)`（按 `transport/timeout/too large/parse/utf-8` 分类）与补丁后的结构化
  `{ code, message }`（直接映射为稳定 `AdvisersFaceCode`）。
- `sanitizeAdvisersErrorMessage` 支持 `{ message }` 对象并继续抹掉本地路径。
- 若采用补丁：`NO_HOME/UNSAFE_PATH/INVALID_UTF8` 在 consumer 侧映射为 `READ_ERROR`/`INVALID_BRIEF`（不展示给用户原始路径）。
- 该补丁**不改变**命令名、返回成功形态（`Option<Value>`）与路径优先级，所以是向后兼容的；唯一变化是错误从 string 变 object，
  旧前端若不升级只会把对象显示为 `[object Object]`——本 consumer 已提前兼容，因此可安全采用。

---

## 8. 未来升级通道（预留 0.3，不虚构内容）

**当前没有任何 0.3 契约内容；以下只定义流程，不预设字段。** 任何“0.3 会加 X”的说法必须以 Advisers 仓发布的
`docs/pet-brief/schema-v0.3.json` + tag 为准，否则视为谣言。

1. **触发**：Advisers 发布新契约 major（`schemaVersion: 3`）的公开快照 + annotated tag + release evidence；consumer 不改 Advisers 仓。
2. **评估**：对比 `schema-v0.2.json` 与 `schema-v0.3.json`，分类 breaking/non-breaking；更新 §4 表格与本文件 §3 版本族谱。
3. **consumer 先升级**（顺序不可反）：允许列表 `{1,2,3}`；v3 专属字段默认不展示，未知仍 fail-closed；`displayPolicy` 语义若变化需单独评审。
4. **测试先行**：新增 v0.3 fixture + 测试矩阵（accept/reject/未来版本/displayPolicy/cap/TTL/consent），并保留 v0.1/v0.2 全部用例。
5. **producer 再启用**：consumer 发布且验证通过后，Advisers 才把稳定 `pet-brief` 输出切到 v3；旧 major 在至少一个 MINOR 周期内继续可读。
6. **收紧旧版**：仅当 v0.1/v0.2 文件因 5min TTL 不再可能存在、且 release notes 明示后，consumer 才可收窄允许列表；
   收紧本身是一次独立变更（需要回滚预案）。
7. **契约 hash 固定**：每次升级把新快照 sha256 写进本文件 §1.1，并更新 `docs/audit/ADVISERS-*-COMPAT-*.md`。
8. **不改通道**：除非另有 ADR，Pet Brief 仍为“固定路径 JSON + TTL + 轮询”；MCP/DSH/IPC/daemon 不作为桌宠消费通道。

其它未来事项（不影响本契约，单独跟踪）：Advisers 侧 `dsh-advisers` 仍依赖 DSH preview line（rc）；MCP/DSH 工具扩容；
TTS/DLC 在 TOS 14.6 下明确“0.2.0 不提供”。桌宠若未来要消费 MCP/DSH 通道，必须另立契约文档，不复用本文件。

---

## 9. TOS / safety 对齐

| 主题 | 契约 | 本集成的事实 |
|---|---|---|
| TOS | v2026.11.2（2026-11-17 生效）；首启 + 版本/文本变更重新确认；撤回即停止受门控功能 | Advisers 侧 `pet-brief` 是受门控命令（非豁免）；无同意时 exit 3 `E_TOS_REQUIRED`。桌面端在**自己的** bootstrap TOS 同意前不读本地 brief（`isReadAllowed` → `CONSENT_REQUIRED`），两套同意彼此独立 |
| 非交互同意 | `--accept-tos` / `ADVISERS_ACCEPT_TOS=1`，记录 `non_interactive=1` | 定时任务/cross-repo CI 必须显式携带，否则不生成 brief（这是 `E_TOS_REQUIRED`，不是文件不存在） |
| 隐私/失败 | 只读、脱敏、限长、最短化；不存原文 | brief 是脱敏投影；consumer 不读 DB、不联网、不回写；`redactions` 不渲染 |
| safety | 14 类 / 92 规则，规则集 `advisers-content-1`；动作 `allow/warn/confirm/redact/block`（block 仅 5 类 23 条白名单） | safety 在 **producer** 边界生效（pet-brief 的 suggestedLines 等过滤）；`displayPolicy` 是**可见性契约**，不是安全/合规认证；consumer 端文本审查是第二层，不替代 producer |
| 许可 | 软件 PolyForm NC 1.0.0；文档/数据 CC BY-NC-SA 4.0；TOS §3.2.2 为接口互操作提供 schema/测试向量的复制许可 | 本仓自带契约快照仅用于本地验收；再分发文档仍受 CC BY-NC-SA；商业分发需 Advisers 书面许可（本仓自身 PolyForm-NC） |
| 责任边界 | TOS 1.1.1 运营者不提供在线服务；宿主/客户端处理受其自身条款 | 桌宠是第三方客户端；不宣称 Advisers 对桌宠展示内容背书；不把 brief 用于公开/商业展示而不做人工复核 |

---

## 10. 测试矩阵

| 层 | 位置 | 覆盖 | 命令/结果（2026-11-17 本机） |
|---|---|---|---|
| Advisers producer | `plugins/advisers/packages/advisers/test/pet-brief.test.js` | 契约快照/example/26 向量/CLI 选项/只读/原子写 | `node --experimental-strip-types --test test/pet-brief.test.js` → 28/28（Advisers 侧记录） |
| consumer 契约 | `tests/pet-brief-consumer.test.ts` | v0.1 20 向量 + v0.2 displayPolicy/legacy | 16/16 |
| **consumer 0.2.0 兼容** | `tests/advisers-020-compat.test.ts` + `tests/advisers-fixtures/` | v0.1/v0.2 fixture、public/private/none、legacy、未知未来、128 KiB、invalid、TOS/consent、timeout/in-flight/backoff、状态/错误码、Tauri 错误映射 | 24/24 |
| face 加固 | `tests/advisers-face.test.ts`、`tests/advisers-harden.test.ts` | disabled/no-file/stale/invalid/no-transport、超时/停止/退避、sanitize、摘要 | 6/6 + 11/11 |
| 跨仓往返 | §5 第 6 步（临时 `ADVISERS_HOME`） | producer v0.2 → consumer accept/private；`--check --strict` | 手工（需已同意 TOS 的 Advisers 环境） |
| 全仓 | `npm test` / `npm run typecheck` / `npm run build` | 回归 + 构建 | 见 `docs/audit/ADVISERS-020-COMPAT-2026-11-17.md` |

**不允许**：把真实客户数据写进 fixtures/测试/文档；以“通过测试”宣称合规认证或安全性证明。

---

## 11. 证据链接

- Advisers 契约快照：`plugins/advisers/docs/pet-brief/`（`schema-v0.2.json` / `example-v0.2.json` / `testcases-v0.2.json` / `README.md`）
- Advisers 生产者/消费者文档：`plugins/advisers/docs/PET-BRIEF-PRODUCER.md`、`docs/PET-BRIEF-CONSUMERS.md`
- Advisers 发布说明/证据：`plugins/advisers/CHANGELOG.md`（0.2.0）、`eval/results/E11-release-2026-11-17.md`、`docs/RELEASING.md`
- Advisers TOS/safety：`plugins/advisers/docs/TOS.md`、`docs/SAFETY.md`、`docs/CONTENT-SAFETY.md`、`packages/advisers/lib/tos/`
- 本仓实现：`src/presence/pet-brief.ts`、`src/pet/advisers/face.ts`、`app/tauri/src-tauri/src/main.rs:85`
- 本仓历史：`docs/contracts/pet-brief/README.md`（v0.1 快照 + v0.2 更新节）、`docs/ADVISERS-FACE-INTEGRATION.md`
- 验收报告：`docs/audit/ADVISERS-020-COMPAT-2026-11-17.md`
