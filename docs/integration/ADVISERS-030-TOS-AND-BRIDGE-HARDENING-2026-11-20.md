# ADVISERS-030-TOS-AND-BRIDGE-HARDENING（2026-11-20）

| 项目 | 内容 |
|---|---|
| 状态 | **生效（2026-11-20）**：desktop-games 消费端增加 producer TOS v2026.11.3 重同意识别/指引；dsh-famling bridge 增加 Pet Brief 严格校验；未改 Advisers 发布仓，未 commit/push |
| 范围 | task-152（Advisers 0.3.0 后续） |
| desktop-games 基线 | HEAD `df791b8`（2026-11-20）；工作区另有并发任务的资产/文档改动（task-149/150/151），本任务未触碰 |
| 插件基线 | `plugins/dsh-famling` 0.10.10（非 git 工作树） |
| Advisers 基线 | 发布 tag `v0.3.0` → commit `1199fbf`；本地 checkout `e3f440d`（docs-only 后置提交） |
| 相关实现 | `src/pet/advisers/face.ts`、`src/pet/main.ts`、`plugins/dsh-famling/index.js` |
| 相关测试 | `tests/advisers-tos-reconsent.test.ts`（新增）、`plugins/dsh-famling/test/pet-brief-compat.test.js`、`plugins/dsh-famling/test/host-bridge.test.js` |
| 插件报告 | `plugins/dsh-famling/docs/PET-BRIEF-0.3.0-COMPAT-2026-11-20.md` |

> 结论先行：0.3.0 的 Pet Brief **契约**仍是 v0.2，但 **TOS 升到 v2026.11.3 且旧同意失效**；受门控的 `pet-brief` 未重新同意时 exit 3 `E_TOS_REQUIRED`，不写 brief，桌面端表现为 `NO_FILE`/旧 brief 过期。
> 本任务做两件事：
> 1. **消费端**（desktop-games）：当 reader/诊断把 `E_TOS_REQUIRED`（结构化或字符串）抛给 `AdvisersFaceController` 时，识别为 `PRODUCER_TOS_REQUIRED` / `producer-tos-required`，状态行与简报面板给出**固定、无内容、无路径**的 TOS v2026.11.3 重同意指引（`advisers tos show/accept`、`--accept-tos`、`ADVISERS_ACCEPT_TOS=1`），并明确桌面端不代同意。
> 2. **插件 bridge**（dsh-famling）：`op:"brief"` 先按 closed contract v0.2 校验整份 `pet-brief.json`（closed-schema/禁止字段/必填/枚举/长度/重复 id/上限/TTL **上界**/counts=数组长度），任何偏差 404 `E_MEMORY` fail-closed，再投影固定 allowlist。

## 1. 背景与事实

| 事实 | 证据 |
|---|---|
| Advisers 0.3.0 是 package release，不是 Pet Brief 契约 release：`schemaVersion` 仍为 2，v0.2 schema/example/testcases 在 `v0.2.3..v0.3.0` 零 diff | `docs/integration/ADVISERS-030-CONSUMER-2026-11-20.md` §2；`git diff v0.2.3..v0.3.0 -- docs/pet-brief`（Advisers 仓） |
| TOS 升到 **v2026.11.3（2026-11-20）**，v2026.11.2 的既存同意不再有效；`ADVISERS_TOS_VERSION` 不能再伪造同意记录 | `plugins/advisers/docs/TOS.md`、`CHANGELOG.md` §0.3.0；0.3.0 安装包 `tos status --json` |
| `pet-brief`（含 `--print-schema` / `--check --in` / `--out`）是受 TOS 门控命令：未同意 → **exit 3 `E_TOS_REQUIRED`**，中文提示「需要先同意使用条款 2026.11.3」 | `docs/integration/ADVISERS-030-CONSUMER-2026-11-20.md` §4.4（0.3.0 安装包、全新 home 实测） |
| 桌面端只读固定文件 `$ADVISERS_HOME/pet-brief.json`（或 `%USERPROFILE%/.advisers`、`$HOME/.advisers`）；Tauri 读取命令**不会调用 producer CLI**，也拿不到其 stderr | `app/tauri/src-tauri/src/main.rs`（`read_advisers_brief`）；`docs/integration/ADVISERS-CONTRACT.md` §2/§7 |
| 因此：未重新同意时桌面端**无法仅凭文件通道区分**「producer 未安装/未运行」与「producer 因 TOS 未生成」；本任务**不新增 producer 探测通道**，只保证一旦 reader/诊断抛出该错误，消费端给出明确指引 | 本任务设计约束（lead 确认） |

## 2. 消费端：识别 `E_TOS_REQUIRED` 并给出重同意指引

### 2.1 识别层（`src/pet/advisers/face.ts`）

- 常量：`ADVISERS_PRODUCER_TOS_CODE = "E_TOS_REQUIRED"`、`ADVISERS_PRODUCER_TOS_VERSION = "2026.11.3"`、`ADVISERS_PRODUCER_TOS_STATUS_TEXT`、`ADVISERS_PRODUCER_TOS_GUIDANCE_LINES` / `ADVISERS_PRODUCER_TOS_GUIDANCE`。
- `detectProducerTosError(error)`：
  - 兼容未来的结构化错误 `{ code: "E_TOS_REQUIRED", message }` 与今天的 `Error`/字符串消息；
  - 识别正则：`/E_TOS_REQUIRED/i` **或**中文「需要先/再次/重新同意使用条款」；
  - 从文本解析 `YYYY.M.D` 版本（优先 `TOS/使用条款` 后的版本），解析不到回退 `2026.11.3`；
  - 只读错误消息，不读 brief 内容、不执行命令、不写同意记录；`READ_ERROR`/`CONSENT_REQUIRED`/超时/过期等不会被误判。
- `classifyReadError` 在 transport/timeout 判定之后、通用字符串映射之前调用识别；新稳定 code **`PRODUCER_TOS_REQUIRED`**（与桌面端自己的 `CONSENT_REQUIRED` 区分）。

### 2.2 状态层（`AdvisersFaceController`）

| 字段 | 值 |
|---|---|
| `reason` | `producer-tos-required`（新增） |
| `code` | `PRODUCER_TOS_REQUIRED` |
| `state` | `unavailable`（不是 `error`：这是 producer 侧需人工动作，不是读取崩溃） |
| `ok` | `false` |
| `retryable` | `true`（重新同意后点「重试」可恢复） |
| `producerTosVersion` | 解析到的版本，默认 `2026.11.3` |
| `message` | 固定英文机器消息 `producer TOS v<ver> requires re-consent (E_TOS_REQUIRED)`；**不保存/不回显原始 stderr/路径**（`lastError` 同样固定） |
| `lastBrief` | 不新增/不投影；若此前有已接受 brief，沿用既有失败语义（仅供 stale 状态，面板不渲染过期内容），且 TOS 状态会立即让已打开的面板失效并清空（`panelHideReasonForStatus` → `unavailable`） |
| `describeAdvisersFaceStatus()` | 状态行 `Advisers：生产者需重新同意 TOS v2026.11.3（只读）` + 重试按钮 |

### 2.3 展示层（`src/pet/main.ts`）

- 简报面板在 `controller.lastStatus.code === "PRODUCER_TOS_REQUIRED"` 时**不渲染任何缓存 brief**（即使此前成功读取过），空态后追加固定指引（逐行 `<p class="note advisers-tos-guidance">`，`textContent` 写入，**不使用 innerHTML**）：
  1. Advisers 生产者需要重新同意使用条款（TOS v2026.11.3；0.3.0 起旧同意失效）。
  2. 在终端运行 `advisers tos show` 查看全文，再用交互式 `advisers tos accept` 重新同意。
  3. 定时任务/非交互环境：显式加 `--accept-tos` 或设置 `ADVISERS_ACCEPT_TOS=1`（记录为非交互同意）。
  4. 桌面端不代你同意、不修改 Advisers 的同意记录；完成后再点「重试」。
- 指引文案是固定常量，不读取 brief、不拼接 producer 输出、不含本地路径；不新增网络/CLI/文件写入。

### 2.4 诚实限制（必须与结论一起读）

- **当前 Tauri 读取命令不会产生 `E_TOS_REQUIRED`**：它只读文件。因此该指引在今天的实际触发路径是「未来/其他 reader 或诊断把该错误抛给控制器」；在仅有文件通道的现状下，未重新同意的典型表现仍是 `NO_FILE`/`STALE`。本任务没有、也不应该由桌面端偷偷运行 producer 命令来探测 TOS。
- 消费端**不解析/不绕过** Advisers TOS，不调用 `advisers tos accept`，不传 `--accept-tos`，不写 `~/.advisers` 同意记录；重新同意是 producer 侧的用户动作。
- 状态/面板只展示固定文案；不会因为识别到该错误而放宽任何 brief 校验或隐私策略。

## 3. 插件 bridge：Pet Brief 严格校验（fail-closed）

完整矩阵与证据见 `plugins/dsh-famling/docs/PET-BRIEF-0.3.0-COMPAT-2026-11-20.md`。要点：

- **closed schema**：根字段 13 个 allowlist；`today/commitments/risks/facts` 条目字段 allowlist；未知字段、禁止字段（reasoning/CoT/prompt/key/token/emotional，大小写/`_`/`-`/空格归一后含后缀匹配）→ reject；
- **必填/形状**：v0.2 13 个根字段必填（v0.1 legacy 仅可缺 `displayPolicy`）；`id` 1–64 且节内唯一；类型/长度/enum/confidence 0..1；每节 ≤10、`suggestedLines` ≤3×40、`redactions` ≤10×80；
- **displayPolicy**：`public|private|none`；未知值 reject（**不再归一 private**）；`none` 通过 schema 后由 bridge 拒绝（404，不渲染）；
- **时间/TTL**：ISO 8601 必须带时区；`expiresAt > generatedAt`；`now < expiresAt`；**`expiresAt - generatedAt <= 5 分钟` 上界**；`generatedAt` 不得超前当前时间 60 s；
- **counts 一致性**：四个计数均为整数 0..10 且**等于对应数组长度**（不做 Number() 强制/零填充）；
- **失败语义**：任一错误 → 404 `E_MEMORY`，消息只含去重后的稳定 code（≤3 个），不返回部分 brief、不回显字段值/本地路径；
- **投影不变**：成功后仍只输出 7 键（`schemaVersion/displayPolicy/generatedAt/expiresAt/counts` + `today`/`commitments` 各截 3 条），`risks/facts/suggestedLines/redactions/mood/source` 不上屏。

## 4. 测试与实测证据

### 4.1 消费端（desktop-games）

| 命令 | 结果（实测） |
|---|---|
| `node --import tsx --test tests/advisers-tos-reconsent.test.ts` | **9/9 pass**（结构化/字符串识别、误判防护、状态分类、固定指引、路径不回显、重试恢复、TOS 状态使已开面板失效、main.ts 静态接线） |
| `node --import tsx --test tests/advisers-020-compat.test.ts tests/advisers-030-compat.test.ts tests/advisers-face.test.ts tests/advisers-harden.test.ts tests/advisers-source.test.ts tests/advisers-ui-privacy.test.ts tests/pet-brief-consumer.test.ts tests/advisers-tos-reconsent.test.ts` | **94/94 pass** |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0（vite build + voice bake 42 WAV + legal 39 文件 + page profile ok） |
| `npm test`（全仓，并发资产任务收尾后复跑） | **1963 tests / 1963 pass / 0 fail / 0 skip** |

### 4.2 插件（dsh-famling）

| 命令 | 结果（实测） |
|---|---|
| `node --test test/pet-brief-compat.test.js test/host-bridge.test.js` | **40/40 pass**（brief compat 14/14；host-bridge 26/26） |
| `node --test test/pet-brief-compat.test.js` | 14/14；always-on 11 条，可选层 3 条（真实 0.3.0 producer、canonical v0.2 26 向量、私有 famling fixtures）均实际运行（兄弟仓存在） |
| `npm run lint` / `npm run typecheck` / `npm run check:package` | ok / `checkJs ok` / `ok` |
| 全量 `node --test test/*.test.js` | 261 tests，**258 pass / 3 fail**；3 个失败均为**并发私有资产改写**导致生成物过期（`embedded animation data`、`gen-content-constants --check`、`deterministic model stale`），与本轮 brief 路径无关 |
| `npm run check:anims` / `npm run check:content` | 同上，client 嵌入块陈旧（并发任务正在改 `public/assets/pet/anim/{cat,dog}`、`regions.json`）；资产任务收尾后需重新 embed/gen 再跑 `release:check` |

### 4.3 关于全仓测试的并发干扰（诚实口径）

本任务运行期间，同一工作区的 task-149/150/151 正在改写 `public/assets/pet/anim/cat|dog/**`、`regions.json`/`behavior.json` 与 art/docs。收尾顺序对本任务证据的影响：

- **desktop-games**：资产任务收尾后复跑全量 `npm test` = **1963/1963 pass**（此前运行中曾出现 6 个资产/生成物失败，已随资产任务收尾消失）；
- **dsh-famling**：全量 `node --test test/*.test.js` = 261 tests / **258 pass / 3 fail**，3 个失败是插件侧嵌入块未随私有资产重新生成（`embedded animation data`、`gen-content-constants --check`、`deterministic model stale`）。这是**资产任务收尾后的跨仓 follow-up**（需在插件仓跑 `npm run embed:anims && npm run gen:content` 并复跑 `release:check`），不是本任务 brief 路径的回归；本任务未触碰这些生成物。

**本任务改动范围**：`plugins/dsh-famling/index.js`、`test/`、`docs/`、插件 `README.md`，以及消费端 `src/pet/advisers/face.ts`、`src/pet/main.ts`、`tests/advisers-tos-reconsent.test.ts`；brief 路径的 40/40、消费端 advisers 定向 94/94 + `tsc`/`build` 均按上表实测。

## 5. 风险与未做项

| # | 项 | 说明 |
|---|---|---|
| R1 | 文件通道无法主动发现 `E_TOS_REQUIRED` | 本任务不做 producer 探测；未重新同意时用户仍可能只看到 `NO_FILE`。需要更明确的自动提示时，应由 Host/Tauri 增加 producer 状态诊断（另立任务），消费端识别层已就绪可复用。 |
| R2 | 重同意是 producer 运维动作 | 桌面端/插件都不代同意、不写同意记录；用户必须在 producer CLI 交互式同意或由调度显式 `--accept-tos`. |
| R3 | 插件严格校验会拒绝手工编辑的旧形状 | v0.2 缺 `displayPolicy`、未知 policy、任意未知字段、TTL>5min、counts 不一致现在都会 404（旧版宽松）。producer 正常输出不受影响；若用户手改文件需按 contract 修复。 |
| R4 | 插件与桌面 consumer 的宽严差异 | 桌面 `validatePetBrief` 对 v0.2 缺 `displayPolicy` 给 warning+private；插件 bridge 更严格（required）。两者都 fail-closed，差异已在插件报告 §4 记录。 |
| R5 | 未做真实 Tauri/Windows GUI 联调 | 只跑 Node/tsx 测试与 vite build；`E_TOS_REQUIRED` 的 reader 错误注入为测试注入，非真实 Tauri 命令。 |

## 6. 复现

```sh
# 消费端
cd <private-path>
node --import tsx --test tests/advisers-tos-reconsent.test.ts
node --import tsx --test tests/advisers-020-compat.test.ts tests/advisers-030-compat.test.ts \
  tests/advisers-face.test.ts tests/advisers-harden.test.ts tests/advisers-source.test.ts \
  tests/advisers-ui-privacy.test.ts tests/pet-brief-consumer.test.ts tests/advisers-tos-reconsent.test.ts
npx tsc --noEmit && npm run build

# 插件
cd <private-path>
node --test test/pet-brief-compat.test.js test/host-bridge.test.js
npm run lint && npm run typecheck && npm run check:package
```

## 7. 本任务变更文件

| 文件 | 性质 | 内容 |
|---|---|---|
| `desktop-games/src/pet/advisers/face.ts` | 修改 | 新增 `PRODUCER_TOS_REQUIRED` / `producer-tos-required`、TOS 常量、`detectProducerTosError`、固定状态文案与 guidance；错误分类/状态发布接入 |
| `desktop-games/src/pet/main.ts` | 修改 | 简报面板在 `PRODUCER_TOS_REQUIRED` 时以 `textContent` 渲染固定重同意指引 |
| `desktop-games/tests/advisers-tos-reconsent.test.ts` | **新增** | 9 条识别/状态/指引/防泄漏/重试/面板失效/接线测试 |
| `desktop-games/docs/integration/ADVISERS-030-TOS-AND-BRIDGE-HARDENING-2026-11-20.md` | **新增** | 本报告 |
| `plugins/dsh-famling/index.js` | 修改 | 新增 `validatePetBriefStrict`（closed schema/TTL 上界/counts 一致性）并接入 `readBriefProjection`，失败 404 fail-closed |
| `plugins/dsh-famling/test/pet-brief-compat.test.js` | 重写 | 14 条严格/负向/可选层测试（含 canonical v0.2 26 向量） |
| `plugins/dsh-famling/test/host-bridge.test.js` | 修改 | `op:"brief"` 合法 v0.2 用例 + 篡改 fail-closed 用例 |
| `plugins/dsh-famling/docs/PET-BRIEF-0.3.0-COMPAT-2026-11-20.md` | 重写 | 严格校验矩阵、测试/证据、剩余缺口 G3–G6 |
| `plugins/dsh-famling/README.md` | 修改 | brief 行为与兼容表、测试数字更新 |

**未改**：Advisers 发布仓（`plugins/advisers`）任何文件；dsh-famling `client.js`/`package.json`/版本号；desktop-games Rust/Tauri、`docs/integration/ADVISERS-CONTRACT.md` 等既有文档；未 commit/push。