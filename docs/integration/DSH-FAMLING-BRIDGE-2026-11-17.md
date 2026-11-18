# dsh-famling「输入」面板 Host 桥接设计（2026-11-17）

| 项 | 内容 |
|---|---|
| 状态 | 只读调研 + 方案稿；**未改代码、未跑 git、未调 API**；本文件是唯一写入 |
| 基线 | DSH `0.2.2-rc.3`（`/home/yy/deepseek-harness/package.json`，源启动 `DSH_INSTALL_DIR=apps/cli`）+ profile `web`（`~/.dsh/profiles/web`）；`dsh-famling@0.4.0`（`plugins/dsh-famling`）；`advisers@0.2.3`（`plugins/advisers`） |
| 现状 | 插件只有 `sidebar.footer.action` 本地帧动画：Host 半 `plugins/dsh-famling/index.js:2` 是空 `apply()`；Client 半 `client.js:1` 走 `window.__ModuleLoader__.load`，`client.js:143` 已读占位全局 `window.__DSH_FAMLING_BRIDGE__`，`:152` 用 Web Speech `SpeechRecognition`、`:115-116` 用 `speechSynthesis` |
| 目标 | 输入面板接 Advisers 记忆 / DSH LLM / TTS / ASR；**secret 只留 Host**，浏览器拿不到 key |
| 边界 | 不动 Advisers 仓与 DSH 源码；不把完整记忆/账本暴露给 UI；不绕过现有 TOS/age 门 |

> 证据约定：DSH 路径相对 `/home/yy/deepseek-harness/`；行号以本机 checkout 为准。标 **unverified** 的条目只有 API 声明/源码，未做端到端运行。

## 1. 可行扩展点对比（全部为本机 0.2.2-rc.3 实际存在）

| 扩展点 | 实际证据 | 第三方插件可用性 | 结论 |
|---|---|---|---|
| Host service + Typert Remote（`@Remote`） | `docs/api-gateway.md` 编程模型；`packages/api/remotes/src/client/index.ts` 逐包 import `/remote`；同包 README 明言 “capability set fixed by explicit build-time value imports … additional capabilities require an explicit `/remote` value import and mount” | Remote 贡献由 `dsh-typert-generator` 在 DSH 源码 Host aggregate 上生成；纯 JS 插件不在 `ts.Program`，无法产出 `typert.remote-client.js` | **不可自建 namespace**；只能复用别人已挂载的 |
| Client `ctx.remote.$mount` / 既有 namespace | `packages/api/gateway/src/client/index.ts:215`；`packages/typert/protocol/src/types.ts:527-535,622-630`；现成用法 `packages/experimental/client-ui-voice-input/src/client/index.ts` 直接 mount speech remote | 可 mount **已发布的** generated 贡献；对自研 Host 方法无帮助 | 不适合本项目 |
| Session command（UI→Host 的官方通道） | `ctx.commands.register` `packages/interaction/commands/src/index.ts:285`；`@Remote list`:314、`@Remote execute`:360；`command/run` 写 `args=rawInput`（可 `recordInput:false`），`command/done` 写返回 text（:353-372）；skill 参考 `references/user-actions.md` 明说 UI 可通过 `ctx.remote.commands.execute()` 调 Host 操作 | 需要 Agent/Session；footer slot 是 root scope、props 只有 `wide`（`packages/client/ui-sidebar/src/client/contract/slots.ts:198-201`），无 sessionId；结果只能是文本；默认把原文/回复写进 session log | 可行但不适合本 footer 面板（隐私/无 session） |
| **Host 自定义 Fetch 路由（推荐）** | `ctx.connection.fetch.register(route)`：`packages/client/connection/src/rpc.ts:146-168`（path 必须在 `/api` 下、methods、`requestBody: buffered\|streaming`、`fetch(Request)=>Response`）；exact 路由**仅 owner Peer** 可达，见 `src/rpc-host.ts:149-160,334`；一方用例 `packages/client/file-upload/src/index.ts:78-88`（`/api/session/uploadFileBinary`）；浏览器 Cookie 鉴权见 `packages/host/authentication-token/README.md:36-40` | 插件 `inject:['connection']` 即可注册；浏览器同源 `fetch('/api/...')` 自动带 Cookie；GET/POST、二进制/流式都可 | **主通道** |
| `ctx.webServer.register` | `packages/host/webserver/src/index.ts:520`；`docs/subsystems/web-server.md`（“Feature plugins register their own routes”）；一方示例 `packages/host/open-in-app/src/index.ts:170-181`：`auth:'required'` + `peer?.principal.kind !== 'owner'` 拒绝 | 可用；需自己写 owner 校验、body 限额 | 备选（connection 不可用时） |
| `ctx.credentials` | `packages/credentials/credentials/src/index.ts:149-151`；`credentialRef('DEEPSEEK_API_KEY')`（同文件 `:29-37`）；`resolve/describe/set/unset` 全 Host API；**Remote 面只有 describe/set/unset、没有返回值的读方法**（`docs/subsystems/credentials.md` 的 `CredentialsController`） | Host 可 resolve；浏览器只能“设置/看是否已配置”，永不可读 | TTS/ASR 直连时的唯一 key 来源 |
| DSH LLM `ctx.llm` | `packages/llm/llm/src/index.ts:58-61`（Context）、`:206 stream()`、`:497 listProviders()`、`:733 listModels()`；请求形状 `src/types.ts:564-606`；adapter 每次请求自行解析 credential（`docs/subsystems/credentials.md`）；**Remote 面只有 3 个 `@Remote`（`listProviders`:497、`listConfigurableProviders`:569、`discoverModels`:657，全是元数据）——浏览器不能发起补全** | Host 可直接调；插件完全不碰 key | **LLM 必须在 Host 侧调用**（走它） |
| DSH ASR（实验） | `packages/experimental/speech-to-text`：`ctx.speechToText`（`src/index.ts:48`）、`resolve({audio,language})`+`transcribe(spec,signal)`（`src/types.ts`，完整录音 WAV 16k mono PCM16）；Remote 消费者 `api-speech-to-text/src/index.ts`（namespace `speech`） | Host 侧可**可选注入** `speechToText`；client 侧不自行挂 Remote；本 profile **未安装** voice-input bundle（`~/.dsh/profiles/web/package.json` 只有 base/web-app/locator/famling） | Host 路由代理本地 SenseVoice 可行，前置条件=用户启用该 bundle（unverified 端到端） |
| DSH TTS | **不存在**：`packages/experimental/speech-to-text/README.md` 明写 “speech synthesis have no service methods”；无 TTS 包/工具 | — | 用浏览器 `speechSynthesis` / baked WAV / Host 直连外部 TTS |
| Advisers 0.2.3 | 文件契约 `advisers pet-brief --out [path]`（默认 `$ADVISERS_HOME/pet-brief.json`=`~/.advisers/pet-brief.json`，`packages/advisers/bin/advisers.js:1329`；TTL 5min、脱敏、`schemaVersion:2`、`displayPolicy`）见 `plugins/advisers/docs/pet-brief/README.md`、`plugins/advisers/docs/PET-BRIEF-CONSUMERS.md`；CLI JSON 见 `plugins/advisers/docs/CLI-JSON.md`；DSH bundle `dsh-advisers@0.2.3` 注册 service `advisers`（`packages/dsh-advisers/index.js:642`，内存账本、无持久化）；MCP `advisers mcp --stdio`（`plugins/advisers/docs/MCP.md`）；TOS 门 `packages/advisers/bin/advisers.js:4337-4341`（exempt 列表，`status/doctor/init/tos/privacy/export/audit/purge` 免门，`pet-brief`/`today` **受门**）、`:4396-4412`（L1 gate）、`:4614`（dispatch 前调用）、`--accept-tos`/`ADVISERS_ACCEPT_TOS=1` | 记忆 MVP = 读 pet-brief 文件（只读、无网络、无模型）；CLI 只读命令需用户已接受 Advisers TOS | **记忆走文件契约**，CLI 后置 |
| `ctx.remote.$on` 推送 | `packages/api/remotes/README.md`：`API_REMOTE_FORWARDED_EVENTS` 固定 allowlist，“forwarding one more event requires one entry” | 第三方插件不能自加事件 | 用请求-响应；长期推送用 SSE route（handler 可持有 response） |

补充：`ctx.inject([...], cb)` 用于可选服务（`references/practices.md`：“Put optional services in `inject` or `ctx.inject([...], ...)`”），保证缺 LLM/ASR/connection 时插件仍能加载。第三方插件仍可 `ctx.provide('famling', …)` 注册自己的 Host service（Cordis 标准能力；`dsh-advisers/index.js:642` 即 `ctx.provide('advisers', runtime)`），但**客户端触达**只能复用上表的 fetch route / session command / 已挂载 Remote——service 本身不会自动过桥。TTS/ASR 都走**同一条 Host 路由**：ASR 收 `audioBase64`（≤8MiB/60s）→ 可选 `ctx.speechToText`，TTS 回 `voice:{mime,base64}` 或 `GET /api/famling/voice/:id`；两端的 key/模型都在 Host，浏览器只见音频字节。

## 2. 端到端调用链

```
浏览器 client.js 输入面板
  ├─ 文本: textarea → 用户点“发送”（显式动作，无自动发送）
  └─ 语音: SpeechRecognition → 文本回填 textarea（可编辑）→ 用户点“发送”
        │ POST api/famling/bridge  (same-origin Cookie, JSON ≤16KB, AbortController 20s)
        ▼
Host index.js + src/bridge/*
  ├─ 1) 契约校验 / op 白名单 / 长度限额 / 未启用→501
  ├─ 2) 记忆: 读 ~/.advisers/pet-brief.json → 校验 schemaVersion/TTL/displayPolicy → 只投影白名单字段
  ├─ 3) DSH LLM: ctx.llm.stream({provider, model, system, messages, maxTokens, signal})，累积文本
  ├─ 4) (可选) ASR: ctx.speechToText.resolve({audio,language}) → transcribe(spec, signal)
  ├─ 5) (可选) TTS: baked WAV 读盘 → audio/wav；或 Host→DeepSeek /v1/tools/tts（key=ctx.credentials.resolve(...)）
  └─ 6) 审计: 仅 {op, outcome, chars, ms, code}；**不写原文/回复/音频**
        │ 200 {v:1, reply, bubbleKind, brief?:{...}, voice?:{mime,base64}, meta:{provider,model,ms}}
        ▼
浏览器: 气泡 textContent（禁 HTML）+ speechSynthesis/AudioContext 播放（受 TTS 同意门）
```

| 边界 | 约定（建议） |
|---|---|
| 请求 | `{v:1, op:'echo'\|'chat'\|'brief'\|'asr'\|'tts', text?, lang?, audioBase64?, voice?}`；`text.length ≤ config.maxInputChars`（默认 2000） |
| 响应 | `{v:1, reply:string, bubbleKind:'speech'\|'thought', brief?:BriefProjection, voice?:{mime,base64}, meta}`；错误 `{code:'E_CONSENT'\|'E_INPUT'\|'E_MEMORY'\|'E_LLM'\|'E_ASR'\|'E_TTS'\|'E_TIMEOUT'\|'E_UNAVAILABLE', message}`，**message 不回显原文** |
| 记忆投影 | 只允许 `generatedAt/expiresAt/displayPolicy/counts/today[]/commitments[]/mood`（脱敏后），**禁** `suggestedLines/evidence/risks[].evidence` 与任何 id 原文；`displayPolicy:'none'` 时整条响应删掉 brief 派生内容 |
| 气泡 | 固定模板 + 数字/短语；模型自由文本只进 `reply`，由客户端 `textContent` 渲染 |

## 3. 安全 / 隐私

- **key 不落前端/日志**：LLM 用 `ctx.llm`（adapter 内 resolve credential），插件不读 env；若做 DeepSeek TTS/ASR 直连，Host 用 `ctx.credentials.resolve(credentialRef('DEEPSEEK_API_KEY'))`，每请求现取、不缓存跨操作；key 只在 Host 内存中使用，**不写日志、不进错误消息、不进响应**（TTS/ASR 错误只带分类码）；浏览器侧 `ctx.remote.credentials` 无读方法（见 §1）。
- **输入最小化**：单文本框、无附件/URL/剪贴板轮询/文件拖放；显式点击才出网；路由 body 上限、字段白名单；`maxInputChars`/`maxAudioBytes` 进 `Config`；错误码不含输入。
- **审计不含原文**：不写 session log（**不采用 command 通道**，`command/run`+`command/done` 会落 rawInput 与回复，见 `commands/src/index.ts:353-372`）；`ctx.logger` 只记 `op/outcome/code/duration/chars`；记忆文件内容不写日志、不写 localStorage、响应后即丢。
- **记忆不整包外泄**：pet-brief 最多 10 项/节且已脱敏；UI 只显示计数+≤2 条投影；`displayPolicy:'private'` 沿用 30s 自动收起/失焦隐藏（`docs/ADVISERS-FACE-INTEGRATION.md` §4、`docs/research/ADVISERS-PETBRIEF-AUDIT.md`）；不展示 `suggestedLines`（desktop-games consumer 也刻意挡在渲染层外）。
- **TOS/同意分层**：Advisers TOS 门独立（`~/.advisers/tos.json`，v2026.11.2）；**Host 绝不代传 `--accept-tos`/`ADVISERS_ACCEPT_TOS=1`**，遇到 exit 3 `E_TOS_REQUIRED` 就提示用户去 `advisers tos show/accept`。TTS/ASR 是**独立同意**（`plugins/advisers/docs/TOS.md` §10；`desktop-games/docs/legal/TTS-TERMS.md` §2A/§2C），TOS 同意不能替代、反之亦然；`terms.ts` canon：TOS `2026-11-17.5`、TTS `…17.4`、ASR `…17.3`，版本/hash 变更必须重新确认。
- **当前实现缺口**：`client.js:55` 默认 `sound:true`（会直接朗读回复）、Mic 按钮未做 ASR 同意——接入桥时必须改为默认关 + 首次/变更确认，确认只存内存（session+config scoped）。
- **age 门**：一般功能全年龄；roleplay/情感陪伴 18+ 且是**自报出生日期**核验（`src/pet/consent/age.ts`，fail-closed）。本面板若是“工作搭子/提醒”，不触发 roleplay 门，但不得宣传为 roleplay/情感陪伴；若未来做角色扮演，必须复用该门。
- **路由面**：exact Fetch 路由仅 owner Peer（`rpc-host.ts:149-160`）；仍保持 loopback 绑定（`web-server.md` 拒绝 wildcard host）、同源、`Allow` 方法白名单、每窗口速率限制（如 20 次/分钟）；服务缺失返回 501 而非降级直连。
- **ASR 出网风险**：浏览器 `SpeechRecognition` 的音频去浏览器厂商服务器（非 DSH/非本站），必须单独告知；优先本地 SenseVoice（`ctx.speechToText`，`location:'host-local'`）。

## 4. MVP 与分期

| 期 | 内容 | 验收 |
|---|---|---|
| P0 桥接占位（1d） | Host 注册 `/api/famling/bridge`，只实现 `op:'echo'`；client 用模块内 `bridge.send()` 替换 `window.__DSH_FAMLING_BRIDGE__`；Config 全默认关；错误码 | 面板回显；未启用/超大输入有可读错误；无网络请求除本机路由 |
| P1 记忆只读（1–2d） | `src/bridge/memory.js` 读 pet-brief（TTL/schema/displayPolicy/白名单投影）+ 固定模板回复；不调模型 | 用 `plugins/advisers/docs/pet-brief/example-v0.2.json` 与 26 条 testcases 子集测试 |
| P2 LLM 对话（1–2d） | `chat` 走 `ctx.llm.stream`；provider/model 不写死——优先插件 Config（`provider`/`model`/可选 `reasoningEffort`），否则读 Host `agentDefaultModel.currentSelection()`（DSH 默认模型），取不到返回 503 而非回退字面量（2026-11-18 实装）；费用提示+同意；maxTokens/stop/超时 | 无 key 进浏览器（Network/JS 检查）；失败不假装成功 |
| P3 语音 | TTS：浏览器 `speechSynthesis`（MVP，零 key）→ baked WAV（需清权）→ Host→DeepSeek TTS；ASR：DSH 本地 SenseVoice（需启用 voice-input bundle，隐私最佳）→ 浏览器 `SpeechRecognition`（零安装，但音频去向需告知）→ Host→DeepSeek ASR（key 在 Host，计费/出境单独同意） | 各自同意门、可关、独立失败；字幕先于语音；云端 ASR/TTS 不默认开 |

**Blocked / 外部依赖**：① 无公开 clone API（Advisers 0.2.3 无 TTS/ASR 实现、无 voice clone；`TTS-TERMS` §2.5 与 Advisers `TOS.md` §10.1 禁止克隆/声纹/参考音频）→ 不做音色克隆；② DeepSeek TTS 再分发**TBD**（`TTS-TERMS` §3A 明确只是用户授权，不是服务商许可）→ 不随插件分发 baked WAV，除非换清权音源/拿到书面许可；③ Advisers 0.2.3 **没有面向第三方的稳定编程 API**：对外只有 CLI/JSON（`plugins/advisers/docs/CLI-JSON.md`）、MCP（`plugins/advisers/docs/MCP.md`）、Pet Brief 文件与 `dsh-advisers` 的 5 个只读工具；库入口 `packages/advisers/index.js` 仅 `export * from 'advisers-core'`，`plugins/advisers/docs/PLUGIN-BOUNDARY.md` 只认 tool/link/office-template 扩展点；且 `dsh-advisers` runtime 是内存账本（`packages/dsh-advisers/README.md`），不能当长期记忆；④ 自定义 Remote namespace 需 DSH 源码重建（§1）→ 不采用；⑤ web profile 未装 voice-input bundle → 本地 ASR 需用户显式启用（unverified 端到端）；⑥ Desktop profile 走 file://+IPC（`docs/subsystems/web-server.md`）→ 本桥仅 web，Desktop 需另设 carrier；⑦ Advisers `pet-brief` 命令本身受 TOS 门（非 exempt），文件不存在时 UI 必须给“去接受 TOS”路径，不能自动接受。

## 5. 文件 / 函数级实现建议（不写代码）

Host（`plugins/dsh-famling/`）：
- `index.js`：`export const name`/`inject`/`Config`；`apply(ctx, config)` 内 `ctx.inject(['connection','credentials','llm'], …)` 可选注入；`ctx.effect(() => registerBridgeRoute(...), label)` 注册并随插件卸载删除路由。
- `src/bridge/route.js`：`registerBridgeRoute(ctx, config)`、`handleBridge(request, deps)`（方法/长度/JSON/op/速率/超时；返回 `Response.json`）。
- `src/bridge/contract.js`：`validateBridgeRequest()`、`bridgeError(code)`、响应 schema；客户端与 Host 共用一份字段表。
- `src/bridge/memory.js`：`readPetBrief(path)`、`validatePetBrief()`（schemaVersion 1|2、TTL、counts 一致性、未知字段拒）、`projectBrief(brief, maxItems)`（白名单投影）。
- `src/bridge/llm.js`：`resolveModel(config, ctx)`（`listModels` 校验 + 默认）、`chat(ctx, config, prompt, signal)`（累积文本/限长/abort 映射）。
- `src/bridge/consent.js`：`consentState()`、`requireTts/requireAsr/requireLlm()`（版本+hash+配置签名，`session+config` 作用域；只存内存）。
- `src/bridge/audit.js`：`record({op, outcome, chars, ms, code})`（ring buffer 或 `ctx.logger.info`；无原文）。
- `src/bridge/tts.js` / `asr.js`：可选；缺服务/未同意返回 501/403；TTS 音频可走 `GET /api/famling/voice/:id`（baked）或响应内 base64。

Client（`client.js`）：
- 新增模块内 `createBridge()`：`send({op,text,…})` → `fetch(new URL('api/famling/bridge', document.baseURI), {method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body, signal})`；校验 `v`；错误映射 locale；**不再读 `window.__DSH_FAMLING_BRIDGE__`**（避免被任意页面脚本劫持）。
- `sendInput()` 改调 `bridge.send({v:1, op:'chat', text})`；`startVoice()` 只回填可编辑文本，不自动发送；`say()` 的朗读受 TTS 同意门控制且默认关。
- `locale/zh.json`/`en.json`：桥错误、同意、费用提示、记忆不可用文案；`docs/DETAIL.md` 写明开关/隐私边界；`package.json` 的 `files` 加 `src/`、`engines.dsh` 跟随 `>=0.2.1-rc.5 <0.3.0`。
- Config（`cordis.patch.yml` 行 config，用户 patch 层可覆盖）：`enableBridge/enableLlm/enableTts/enableAsr`、`provider/model`、`maxInputChars`、`maxAudioBytes`、`petBriefPath`、`briefTtlMs`、`rateLimitPerMinute`、`llmTimeoutMs`；**secret 不进配置**（走 `ctx.credentials` 或 LLM adapter）。

测试：`node --test` 覆盖 `validateBridgeRequest`（超大/未知 op/HTML）、`projectBrief`（丢 evidence/suggestedLines、none 清空）、TTL/schema 版本、consent 状态机、audit 不含 text、LLM abort/错误码映射（fake ctx）；`node --check client.js`；DSH Web 手工验收：未登录/非 owner 403、未启用 501、Network 无第三方域名、JS 全局无 key；按 `host-plugin.md` 说明：替换已安装包需重启 Host，client 包变更需刷新页面。

## 6. 未验证 / 风险清单

- **unverified**：`ctx.connection.fetch.register` 是否被 dsh-doc 承诺为“已安装 bundle 的稳定扩展点”（源码与一方用法存在，文档只在 `client-connection` README 提“feature packages register non-JSON responses”）；未来 DSH 版本可能调整。
- **unverified**：`ctx.llm` 的辅助（非 agent loop）调用不在 session log，与 `practices.md` “model-visible ⟺ logged” 的关系需产品拍板：建议把宠物对话视为**非 model-visible 的辅助输出**，并在 `docs/DETAIL.md` 明示；若要可回放，需改为 agent followup（会进聊天记录，另行设计）。
- **unverified**：`DEEPSEEK_API_KEY` 在当前 profile 的具体 ref（`~/.dsh/profiles/web/cordis.patch.yml` 未写 `apiKeyEnv`，由 `@deepseek-ai/dsh-llm-deepseek-api-key` 决定）；不要硬编码 ref，按 `docs/subsystems/credentials.md` 的 provider 策略解析。
- **unverified**：SpeechRecognition 在目标 WebView/浏览器是否可用、音频去向；`speechSynthesis` 在部分浏览器是否走云端音色、中文可用性与离线行为；SAPI/系统语音的中文可用性。
- **unverified**：`pet-brief` 文件生产者 TTL 与 Advisers 版本升级后的 schema 漂移；本设计沿用 v0.2（schemaVersion 2，缺失按 private）。
- 版本风险：`dsh-famling` 当前 `engines.dsh >=0.2.1-rc.5 <0.3.0` 与 0.2.2-rc.3 匹配；`ctx.connection`/Fetch 路由/`speechToText` 均为 0.2.2 现状，0.3 需重核。
- 本文件所有 DSH API 均给出本机源码/文档路径；未见源码的调用（如“官方 TTS 服务”“Advisers clone API”）不存在，未写入。
