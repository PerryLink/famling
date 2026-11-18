# Famling 与 DSH 原生架构：用 DSH 的能力“省事”

日期：2026-11-18  
状态：**设计决策稿 / 非实现完成**。基于 DSH `0.2.2-rc.3`、`dsh-famling@0.5.2`、`advisers@0.2.1`。不能把提议当成已实现。

## 0. 一句话结论

> **Famling 不应在 DSH 里复制一套 App/LLM/记忆/工具系统。**  
> Famling 负责“角色、素材、动作、气泡、人格边界”；DSH 负责“模型 Key、LLM、会话、工具、Advisers、调度、凭据、权限、插件分发”。  
> DSH 版是 **pet-native skin + Host bridge**；独立 Tauri 版只保留给离线/无 DSH 场景。

## 1. 两层职责

| 层 | Famling 负责 | DSH 负责 |
|---|---|---|
| 角色 | 汀岚/猫/狗、FCI pack、像素帧、动作、气泡、人格语气 | 不定义角色 |
| 对话 | 人格 system prompt、是否用哪套语气 | LLM provider/model、Key、额度、超时、重试 |
| 记忆 | 展示哪些字段、内心话模板 | Advisers Pet Brief、会话日志、工具结果 |
| 任务 | 让桌宠“看起来在做” | 工具、Skill、Job、Schedule、审批、权限 |
| 声音 | 气泡字幕、可选 baked 音色 | 无 TTS 服务；ASR 有实验性 `speechToText` |
| UI | 72px 人物、虚线气泡、三按钮 | Web slot、theme、locale、layout、plugin manager |
| 分发 | 角色/素材包 | 插件 bundle、Host bridge、安装/卸载/升级 |
| 安全 | 不宣传官方、不冒充、声音权 | 凭据、owner-only 路由、审计、数据策略 |

## 2. 建议的 DSH 版结构

```
DSH Web
├─ dsh-famling Client（React slot）
│  ├─ 人物 72px + 输入/互动/设置
│  ├─ 虚线气泡（speech / thought）
│  ├─ fetch('/api/famling/bridge')  ← 不碰 key
│  └─ 可选 window speechSynthesis / SpeechRecognition
│
└─ dsh-famling Host
   ├─ /api/famling/bridge（P0 已实现，owner-only）
   ├─ ctx.llm.stream()             ← P2：DSH Key / 当前模型
   ├─ Advisers Pet Brief 只读      ← P1：结构化记忆
   ├─ ctx.speechToText（可选）     ← P3：本地 ASR
   ├─ DSH commands/tools（可选）   ← P4：任务/提醒/账本
   └─ 插件 Config / audit（不落原文、不落 key）
```

**不要**：

- 在 Client 里直接读 `DEEPSEEK_API_KEY`；
- 在 DSH 内嵌一个完整 famling Tauri/HTML App；
- 复制 DSH 的登录、Key、设置、Session、调度、记忆；
- 把每次桌宠对话都写进主聊天 Session；
- 自己做一套插件商店/更新器。

## 3. 直接复用 DSH 的“省事清单”

| 需求 | 不要做 | 直接用 DSH | 省掉什么 |
|---|---|---|---|
| LLM 对话 | 自建 DeepSeek client、Key 输入页 | Host `ctx.llm.stream()`；provider/model 走 profile | Key、计费、重试、模型选择、代理 |
| 凭据 | key 存 localStorage/插件 config | `ctx.credentials`（Host only） | 泄露面、轮换、加密 |
| 记忆 | 自建数据库/向量库 | Advisers Pet Brief（只读、TTL、脱敏、displayPolicy） | 记忆生产、隐私过滤、版本契约 |
| 会话上下文 | 自建历史 | DSH session / agent（需要时） | 分页、恢复、日志、预算 |
| 任务/提醒 | 自建定时器/待办 | DSH jobs / schedule / tools | 调度、审批、持久化 |
| 工具调用 | 自写 HTTP 工具链 | DSH tools / skills / commands | 权限、审计、UI 行、模型协议 |
| ASR | 自建语音服务 | 可选 `ctx.speechToText`；否则浏览器 | 模型部署、采样、隐私 |
| TTS | 自建 TTS 服务 | 浏览器 `speechSynthesis` / baked WAV（授权后） | 服务端成本/密钥 |
| UI | 独立窗口/iframe | `sidebar.footer.action` / `shell.overlay` + theme/locale | 主题、缩放、无障碍、布局 |
| 设置 | 自建设置页 | DSH settings/config + 插件 Config | 保存、校验、回滚 |
| 安装 | 自制安装器 | `plugin_manager` bundle | 启停、升级、回滚 |

## 4. 三条候选“大脑”路线

### A. 纯 Host LLM（推荐做 P2）
Client → bridge → Host `ctx.llm.stream({system, messages, maxTokens, signal})` → 气泡。

- 优点：最短链路；Key 不出 Host；无 Session 污染；成本可控；实现最小。
- 缺点：没有工具/Advisers 查询；每次要自带 system + Pet Brief + 最近几条用户输入。
- 适用：桌宠闲聊、摸头回应、提醒复述、短句人格。

### B. Session/Agent 型（任务型使用）
把“帮我看看今天”“提醒我”发进一个**专用的 famling Session**，让 DSH Agent + Advisers tools 处理。

- 优点：自动拥有 tools、skills、Advisers、Schedule、权限、会话恢复。
- 缺点：会写 session log；可能成本高；需要专门 session 管理；不适合每句闲聊。
- 适用：任务、查账、日程、提醒、长期记忆写入。

### C. 混合（最终建议）
- **闲聊/反应** → A：Host LLM 短调用；
- **任务/查 Advisers** → B：专用 session 或 DSH commands；
- **记忆展示** → P1 Pet Brief；
- **声音** → 浏览器 TTS/本地 ASR；
- **角色** → famling。

> 这样既“像桌宠”，又不把 DSH 的 Agent 每次唤醒。

## 5. 输入面板的产品定义

不是“聊天框替代品”，而是：

1. **输入**：一句话给桌宠；默认走 A；
2. 若识别到任务意图（“提醒/今天/谁/查一下”），可显式切到 B，或由 Host 用关键词路由；
3. 结果只显示在虚线气泡/小卡片；**不自动写入主聊天记录**；
4. 费用、模型、是否开 TTS 在设置里明示；
5. Key 从 DSH 来，用户无需粘贴；
6. 失败时显示错误码，不假装成功。

## 6. 桌面独立性

| 场景 | famling 独立版 | DSH 版 |
|---|---|---|
| Tauri/离线/透明窗口 | ✅ 完整应用 | ❌ 不做 |
| 无需 DSH 的 TTS/ASR/本地存档 | ✅ | ❌ 交给 DSH/浏览器 |
| 有 DSH Key / Advisers / tools | 可选桥接 | ✅ 自动复用 |
| 角色/动作/气泡/UI | 共享 | 共享 |
| 更新 | 独立 release | plugin bundle |

**共享层**：角色资产、FCI pack、动画序列、提示词/人格、气泡规则、TTS 文本；**不共享**：Tauri 壳、DSH host、密钥。

## 7. 分阶段（对应已有 P0）

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 已做 | `/api/famling/bridge` echo/brief 路由，Client fetch，默认语音关 | echo 200、空输入 400、无 Pet Brief 404 |
| P1 | Pet Brief 只读投影：counts/today/commitments 摘要，`displayPolicy:none` 清空 | 用 example-v0.2 测试；不暴露 evidence/suggestedLines |
| P2 | `ctx.llm.stream`，profile 当前模型；超时/额度/费用提示 | Key 只在 Host；失败不假装 |
| P3 | 浏览器 TTS；可选本地 SenseVoice ASR；TTS/ASR 独立同意 | 可关、字幕先于语音、错误独立 |
| P4 | 任务路由到 DSH tools/commands/schedule | 提醒/查账真实执行；原文不落 session 除非用户明确 |
| P5 | 动画美术重做（独立线） | idle/look/pat/input 四组统一母版 |

## 8. 明确未验证 / 风险

- `ctx.connection.fetch.register` 是当前 0.2.2 源码存在的一方扩展点，**不保证未来 0.3 不变**；
- Host 辅助 LLM 调用与“model-visible 必须进 session log”的语义需产品拍板；建议在 DETAIL 明示“桌宠短对话不写入主会话”；
- DSH 没有 TTS 服务；ASR 依赖实验性 `speechToText` + 用户启用 voice-input bundle；
- Advisers Pet Brief 可能过期/不存在；Advisers `pet-brief` CLI 受 TOS 门，**不代传 accept**；
- Web/Desktop carrier 不同；Desktop 的 file://+IPC 需另设 bridge；
- 真实律师/权利人、Windows Tauri/WebView2、release/音频清权、无公开 clone API 仍 blocked。

## 9. 决策建议

**采纳 C 混合路线**：

1. 先把 **A** 做成：Host `ctx.llm.stream` + Pet Brief + 虚线气泡；
2. 只对明确任务启用 **B**，不要每句都走 Agent；
3. UI 保持“桌宠”，不要变成第二个聊天客户端；
4. 独立 famling 继续作为离线/完整壳；DSH 版不复制它；
5. Key、记忆、任务、调度、插件生命周期全部交给 DSH。

这样最省事，也最不容易出现“两套 Key/两套记忆/两套角色”的分叉。
