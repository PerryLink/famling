# 00 · 修补计划（PATCH-PLAN）：terms.ts / TOS.md / UI / 打包 / 门禁 — 2026-11-17

> **Status: DRAFT (engineering draft) · 不是法律意见。** 本文件只给**精确修改建议**；**本任务未改任何代码**（`src/**`、`app/**`、`scripts/**` 均未动），也未改 `TOS.md`（它是 `terms.ts` 的镜像，单改会破坏哈希一致）。落地须另起工程任务，并由 [APPROVALS](../APPROVALS.md) 对应行签字。
> 来源：`01`–`06` 审查 + `00-CONSOLIDATED-LEGAL-REVIEW.md`；优先级 P0=发布前必须，P1=上架/云化前，P2=排期。证据行号引用前请复测（工作树并行改动）。
> 总原则：**文案必须描述“当前实际行为”**；做不到的承诺要么先实现，要么写“当前版本不提供/工程待办”。TOS 变更必须 **bump `TOS_VERSION`** → 哈希自动变化 → 强制重新同意；`docs/legal/TOS.md` 由 `terms.ts` 重新生成，不得手改。

## 1. `src/pet/consent/terms.ts` 精确修改建议（P0）

> 当前：`TOS_VERSION='2026-11-17.1'`（:32）、TOS 15 节（`TOS_SECTIONS` :81-221）、TTS 5 节（:223-265）。建议一次性改为 `2026-11-17.2`（或发布版本号），全部新增节用 `id` 便于测试引用。

| ID | 位置/现文本 | 建议修改（要点） | 理由 |
|---|---|---|---|
| TP-01 | `TOS_VERSION` :32 与 `TTS_VERSION` :34 | 文案改完后 bump（如 `'2026-11-17.2'`）；`templates` 同步 `docs/legal/TOS.md` 版本/哈希；更新 `tests/consent.test.ts` 期望哈希 | 强制重新同意；防静默继承旧同意 |
| TP-02 | `scope` 节（:83-90） | 增一句**适用人群/用途**：“本应用是工作助手类本地工具，**当前版本不提供 roleplay/情感陪伴/自由对话**；仅面向 18+（或按 A-14 拍板口径）。” | 01 P0-1 定位漂移；01 §5 缺“适用人群/用途” |
| TP-03 | 在 `ai-disclosure`（:101-110）后**新增** `ai-labeling` 节 | 新增“AI 生成合成内容标识说明”：①显式：界面常驻“AI 合成·非真人”、图片角落“AI 生成”、音频“AI 语音·合成”；②隐式：导出文件带元数据（工具/模型/日期/内容编号）——**仅在实现后写入**，否则写“当前版本导出标识仍在建设，发布前补齐”；③不提供去标识；④申请无显式标识：按标识办法第 9 条协议+日志≥6 个月，或直接写“不提供”。 | 01 P0-3 / 标识办法第 8 条 |
| TP-04 | `privacy` 节（:156-164） | 重写：明确 **TTS/ASR 发送至 DeepSeek（深度求索）API**、可能出境、受其条款约束（链接）；本机 TTS 缓存+quota；指向 `PRIVACY.md`；如实写当前能力（可删存档/缓存；撤回与全清**发布前补齐**，未实现前不得承诺）。 | 02 P0-1/P0-4；R-P0-04/07 |
| TP-05 | `minors` 节（:176-183） | 若 A-14 选 A（18+）：改为“本应用含 AI 拟人化互动，仅面向 18 岁以上；未满 18 请退出；不向未成年人提供虚拟亲密关系；发现即删除；监护人可邮件要求删除/举报（本机数据需在设备上操作）”。删除“监护指导下使用本地功能”的可执行承诺（无年龄门无法执行）。 | 04 P0-1；R-P0-08 |
| TP-06 | `health` 节（:166-174） | 删除“退出角色扮演”入口表述（未上线）；2h 文案改为“可稍后，每满 2 小时再次出现，不可彻底关闭”；补“依赖提醒为内部目标/当前版本未启用”（如未实现）；“关闭记忆”若无实现则删或先实现。 | 04 P0-2、P1-1；R-P0-01/R-P1-01 |
| TP-07 | `contact` 节（:205-211） | 增常驻渠道：12377（违法不良信息）、12315（消费争议，收费后）、12356（心理援助）、110/120（紧急）、邮箱；写“内部目标 ≤3/≤10 工作日，非时限承诺”；涉未成年人优先、依法报告、不私了。 | 04 P0-4；R-P0-10 |
| TP-08 | `tts` 节（:136-146） | ①增“播放器显示 AI 语音·合成 + 首播提示”；②增 **ASR 单独确认**（上传音频/接收方 DeepSeek/≤8 MiB·≤60 s/可能留存与跨境/费用/可关闭/无未成年模式）——**须先实现 ASR 门禁**，否则发布版关闭云 ASR；③供应商/跨境具体化。 | 02 P0-2/04 P0-5；R-P0-05/07 |
| TP-09 | `cost` 节（:148-154） | 增“v1 免费；无内购/订阅/自动续费/广告；未来收费另示价格/退款/取消；不付费解锁亲密/安全功能”。 | 04 P0-3；R-P0-09 |
| TP-10 | `mods` 节（:126-134） | 二选一：实现 `requireAction(CONSENT_ACTIONS.packLoad)`（`terms.ts:315` 现零调用）使“每次加载确认”为真；或改文案“当前版本仅加载内置内容，不加载第三方 DLC/角色包”。 | 06 P1-1；R-P1-09 |
| TP-11 | `audit` 节（:195-203） | 增“本地审计可被用户清除、非证据级无 hash 链；涉刑/涉未保线索保留必要证据并报告平台/110/12377”；如新增安全审核日志，写明不含原文。 | 05 P0-2；R-P0-21 |
| TP-12 | `tts-confirm-scope` 节（:258-264） | 保留“TTS 配置变更或**新会话**重新确认”（运行时 canon）；APP-DISCLOSURE R6 回写同一口径。 | 01 P2-2；R-P1-05 |

### 1.1 建议新增节文本（可直接改为 `LegalSection`，须律师复核）

```ts
// 建议新增（中文为权威文本；位置：ai-disclosure 之后）
{
  id: 'ai-labeling',
  title: '三之二、AI 生成合成内容标识',
  bullets: [
    '本应用生成的图片、文字与语音按适用法律法规进行显式与隐式标识；界面常驻“AI 合成·非真人”，图片发布时角落标注“AI 生成”，语音播放时显示“AI 语音·合成”。',
    '导出/分享 AI 生成合成内容时，文件将带显式标签与机器可读元数据（工具/模型/日期/内容编号）。当前版本导出标识能力仍在补齐，发布前不得对外宣称已完成。',
    '本应用不提供删除、隐藏、伪造或规避 AI 标识的能力；不得要求他人去标识。',
    '申请无显式标识的内容按法律法规与平台规则另行书面约定；本应用当前不提供该功能。',
  ],
}
```

## 2. `docs/legal/TOS.md`（镜像）落地步骤

1. 改 `terms.ts` → `bump TOS_VERSION/TTS_VERSION`。
2. 用同一来源重新生成 `TOS.md`（改标题行：版本 + `文本 SHA-256`），**不手写条款**（`TOS.md:5` 已声明来源）。
3. 同步 `docs/legal/TTS-TERMS.md` 头部版本/TTS_VERSION；同步 `APP-DISCLOSURE-TEXTS.md` R1–R7 与实现差异注记。
4. 跑 `tests/consent.test.ts`（断言版本/哈希/法条清单）与 `npm test`；把 TOS 哈希写进发布记录。
5. 注意：`pet.html`/`setup.html`/`modal.ts`/`cli.ts` 均从常量渲染，无需分别改文案；但 About 静态块、`pet.html:149-178` 手写文本需单独改（见 §3）。

## 3. UI / HTML 修改（P0）

| 位置 | 现状 | 建议 |
|---|---|---|
| `pet.html:129`（AI 角标） | 8px、对比 2.17:1、不可达 | ≥12px、对比 ≥4.5:1 实底；可悬停/点击/键盘打开 About；`title` 保留；同步改 `tests/p1-gates.test.ts` 的 8px 断言 |
| `pet.html:149-178`（About） | 无联系方式/12377/12315/隐私/许可/撤回 | 增“反馈与举报”（邮箱、12377、12315、12356、110/120、涉未成年主题）+ 隐私政策入口 + 许可清单/CREDITS/THIRD-PARTY 入口 + “撤回同意/清除全部数据”（先用 toast 标“建设中”或直接实现，见 §4） |
| `pet.html:170`（退出角色扮演按钮） | 只记意图、无引擎 | 移除；或禁用并标“当前版本不提供该模式” |
| `pet.html:109`（语音模式文案） | 显示“预生成/系统 TTS”但构建默认剔除 WAV | 改文案或发布已清权音频；避免 404 回退 |
| 新增：音频播放器 | 无标签 | 常驻“AI 语音·合成”；首次播放口头/提示音；播放器样式不遮挡 |
| `setup.html:15` | 字面量 `**所有调用会产生费用…**` | 改 `<strong>` |
| `setup.html:38` | “应用内 About 待接”（已接） | 删除/改为实际状态 |
| `setup.html:49-52`、`chat-import.html:43,86`、`pet.html:8-9,41` | `/docs/legal/*` 打包后 404 | 改为应用内渲染/相对资源；或把 docs/legal 打包并加构建后链接测试（R-P0-19） |
| `chat-import.html` | 无隐私提示 | 加“不要导入他人未授权隐私/对话”提示 |
| `pet.css:541-555,615` | 法务正文 12px、不可放大 | 可缩放单位；A+/A− 作用于同意弹窗；或提供“放大阅读” |
| `pet.html:60`（羁绊/关系数值） | 与“不做关系数值”冲突 | 去数值/改内部“互动记录”；中性化等待/专属台词（P1） |

## 4. 代码 / 运行时（P0–P1；不含本任务改动）

| 项 | 现状 | 需要改什么 | 验收 |
|---|---|---|---|
| **ASR 同意与开关**（P0） | `startTalk` 无 `canInteract`、无声明、无开关/配额；`asr.ts:10-27`；`voice.rs:194-233` | 新增 ASR consent（独立 key/版本/哈希）+ 首次+每次启用短确认 + 单独同意勾选；默认关；无同意不得 `getUserMedia`；日配额/费用提示；`readonly` 阻断；关闭开关（mute 只关 TTS） | 测试：拒绝同意不联网不麦克风；开关生效；配额拦截；Rust 侧上限 |
| **撤回同意 + 全清**（P0） | 无入口；`main.rs:186-203` 只删 save/bak/tmp；`voice_cache_clear` 不清 quota | 设置页“撤回同意”（停止处理+说明审计保留）+“删除全部本地数据”（列明存档/记忆/TTS 缓存/quota/导入摘要/同意审计/偏好；二次确认）；`ConsentStorePort` 增删除 acceptance/audit API；卸载清理说明 | 单测：全清后各存储为空/解密不可用；撤回后只读 |
| **安全审核留痕**（P0） | `gate.ts:555-569` 仅返回结果 | 本地 append-only 审核记录 `{ts,direction,ruleIds,categories,disposition,textHash(加盐)}`，不存原文；滚动上限；About 查看/清除；导出仅投诉/执法；文档注明非证据级 | 红线回归 + 误杀申诉路径 |
| **红线漏放/空格绕过**（P0） | 05 P0-1 的 12 个 ALLOW 探针 | `sanitize.ts:162-167` 增分隔符归一（空格/全角/`·`/`-`/emoji）+ span 回射；补邻接/词序规则；ALLOW→BLOCK 入 `tests/safety-local-redline.test.ts`；云 chat 前接 remote checker | 探针全 BLOCK；既有 84 pass 不回归 |
| **记忆采集开关/文案**（P1） | “关闭记忆”无实现（`kernel/pet.ts:80-133` 自动写入） | 实现开关或删文案；语音输入同理 | 单测：关闭后不写记忆 |
| **导入摘要**（P1） | localStorage 明文 | 与存档同策略加密，或明确告知+一键删除+导出 | 单测/隐私审查 |
| **Advisers 隐私**（P1） | 只读 brief、默认关、屏幕共享不检测 | 首次专项告知 + 私密模式/`contentProtected` 或捕获检测 + “永不入 TTS/云 payload”单测 | 测试锁死 |
| **DLC/pack 加载确认**（P1） | `CONSENT_ACTIONS.packLoad` 零调用；游戏宿主无同意 | 加载前 `requireAction(packLoad)`；角色包补签名或文档降级为“仅官方内置” | 单测 + 文档一致 |
| **2h/依赖提醒**（P1） | 按钮易误读；仅 pet 页；`health.dependency` 未接 | 按钮改“休息一下（2 小时后仍会提醒）”；跨窗口计时；依赖软着陆（阈值产品+律师） | 单测 + 文案 canon |
| **危机卡/退出三通道**（RP 上线前 P0） | 无独立 UI | 停止角色化输出/TTS、置顶资源、退出三通道；RP 未上线则先移除入口 | mock + 单测 |
| **撤回/删除入口的国际化** | 中文为主 | i18n 后同步（P2） | — |

## 5. 打包 / 发布（P0）

| 项 | 现状 | 建议 |
|---|---|---|
| `app/tauri/src-tauri/tauri.conf.json:34-44` | resources 仅 `packs/`+4 声明；无 `bundle.licenseFile` | 按 [RELEASE-BLOCKERS §4](../RELEASE-BLOCKERS.md) 清单补 resources；加 `bundle.licenseFile`（TXT/RTF 实测）；`productName` 待定名（A-09） |
| NSIS 安装器 | `installer.nsi:41` LICENSE 空、`:168-170` 许可页永不成立、`:683-685` 资源段空 | 生成器配置 license page + `File` 资源；HEAD 重构建后实机核对 `$INSTDIR` |
| `scripts/release-win.mjs:39-52` | portable 只带 9 件根许可；无 TOS/隐私 | 按清单补齐；portable 10+ 文件；生成 README 文案修正（“signed/dev key”“LICENSE-ART (DRAFT)”过时） |
| `release-win.mjs:101-131,232-279` | `--plan/--sha256` 只按文件名，接受旧产物 | 校验 build 时间/freshness + 法务 gate 结果 + SHA256SUMS/RELEASE-MANIFEST；`--verify` 必须失败在缺件 |
| `vite.config.ts:6-22` | 仅排除 dist 下 voice | 构建 deny-list 扩到 pearl/tinglan-256/refs/.keys/旧 artifacts；`INCLUDE_UNCLEARED_AUDIO=1` 在 CI/release 禁用 |
| `scripts/legal-check.mjs:20-74` | 只扫 9 文件；strict 重复计数；盲区多 | 扫描全部随包/引用文档 + `public/` 音频 + artifacts exe/zip strings + resources 清单 + HTML 死链；按独立问题去重；build 后复跑；CI 加 legal step |
| docs 随包 | `dist/` 无 docs、Tauri resources 无 docs/legal | 把 TOS/TTS/隐私/TAKEDOWN/SECURITY 等纳入前端构建或资源，提供可点视图；构建后断言链接存在 |
| 代码签名 | 无证书 | 外部 OV 证书 1–2 周；v1 release notes 明示 unsigned/SmartScreen |

## 6. 优先级 / 依赖顺序（建议）

1. **P0-A 文案与同意**（可先行、无外部依赖）：TP-01~TP-11 + About/首页短文本 + 版本/哈希/测试；TP-04/05/06/07 中“未实现项”先写“当前版本不提供”。
2. **P0-B 发布包**：resources/licensePage/portable/zip + docs 可达 + 旧 artifacts 清理 + legal-check 扩展（依赖 1 的文本与用户拍板 A-15）。
3. **P0-C 隐私/ASR**：ASR consent/开关/配额（或发布版关闭云 ASR）+ 撤回/全清 + 隐私政策定稿（A-05/A-13）。
4. **P0-D 权利/标识**：18 WAV 决策（A-04）、AI 标识实现（A-16）、Pearl deny-list/CC0 清单（A-10/A-11）。
5. **P0-E 内容安全**：红线回归 + 审核留痕（A-18 前提）。
6. **P1**：双 canon 回写、Advisers/导入隐私、DLC 签名、可访问性、依赖提醒。
7. **外部（不阻塞内部但阻塞公开发布）**：律师意见、商标、相似性、备案/评估、签名证书。

## 7. 验收（本任务附加要求）

- `node scripts/legal-check.mjs` **仅记录**（当前 WARN-ONLY 16）；**不得为了过 gate 删除 DRAFT**。
- 文案测试：`tests/consent.test.ts`（版本/哈希/法条）、`tests/p1-gates.test.ts`（角标断言需随字号改）、安全红线回归、ASR 拒绝同意用例。
- 所有新增/修改文本保持 DRAFT；对外生效前由用户+律师按 [APPROVALS](../APPROVALS.md) 签字。

## 8. 本计划不能解决的（同 CONSOLIDATED §4）

TTS 18 WAV 再分发、Pixiv CC0 逐文件、Pearl 上游署名、AI 供应商条款、商标检索、相似性、律师意见、备案/评估/商店核验、发行包签名/真实构建环境。
