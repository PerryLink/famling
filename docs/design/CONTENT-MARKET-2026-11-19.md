# Famling / dsh-famling 内容中心与主题市场设计（2026-11-19）

| 项 | 内容 |
|---|---|
| 状态 | **核心模型 + 扩展规范已落地；UI / 安装器 / 真实市场服务器未实现**。本文件是设计决策记录，不含 UI 改动。2026-11-19 追加 v2（task-52）——角色即主题、内容包 0.2、远程市场契约，见 §10；v3（task-66）——远程市场客户端 v1（默认不联网）已实现并通过离线测试，见 §11；v4（task-75/MB-086）——市场联网保险丝：传输层改为宿主注入（默认 null）、无全局 fetch 静态门、市场 UI 默认零请求，见 §11.15；v5（task-103/MB-080）——目录协议 v0.2（serial/expires/离线宽限/重试/限流/镜像）+ 防回滚/过期/缓存状态机，见 §11.16。 |
| 日期 | 2026-11-19（Asia/Shanghai） |
| 任务 | task-48：为 famling + dsh-famling 建集中式内容中心/主题市场的共享数据模型与扩展规范。task-52：按产品澄清做 v2（角色主题主入口 / 内容包 0.2 / 远程市场契约 / 三份设计参考）。task-66：远程市场客户端 v1（可注入 transport/clock/storage/verifier，签名目录/防回滚/下载校验/适配器，默认不联网）。task-75/MB-086：市场联网保险丝（transport 宿主注入、默认 null、无全局 fetch 静态门、content-hub 市场 UI 默认零请求）。task-103/MB-080：catalog v0.2（serial/expires/offlineGraceSeconds/retry/rateLimit/mirrors）+ 客户端最高 serial 防回滚、过期与离线宽限、有界缓存、重试/限流/镜像回退；仍不联网、不接生产服务器。 |
| 写范围 | 'public/content/library.json'、'public/content/README.md'、'src/pet/content-library.ts'、'tests/content-library.test.ts'、'tests/content-pack-v2.test.ts'、'docs/content-packs/**'、'public/content/library.json'、本文件。 |
| 不写范围 | 'src/pet/main.ts'、'src/pet/desktop-shell.ts'、'pet.html'、'plugins/dsh-famling/**'、任何 UI/main/plugin 文件；未 commit/push；未联网；未安装依赖。 |
| 读者 | 后续接手的 UI agent（famling 菜单/内容面板）、dsh-famling 维护者、发布/法务。 |
| 前置阅读 | '[FAMLING-DSH-ARCH-2026-11-18](FAMLING-DSH-ARCH-2026-11-18.md)'（两产品分层与契约原则）、'[RESOLUTION-DLC-SIGNING-2026-11-19](../audit/RESOLUTION-DLC-SIGNING-2026-11-19.md)'（签名信任根）、'[USE-RESTRICTIONS-2026-11-19](../legal/USE-RESTRICTIONS-2026-11-19.md)'（用途边界）。 |

---

## 0. 结论摘要

| # | 决定 | 一句话理由 |
|---|---|---|
| D1 | **一个共享目录，两个产品各自适配 UI**：六类静态内容（角色/语音/对话包/主题/背景/字体）统一进 'famling.content/0.1'，两个产品只消费数据与纯函数，不共享 React/DOM 运行时。 | 与 DSH 架构设计 D2 一致：可共享的是契约与数据，不是 UI 运行时。 |
| D2 | **核心是纯 TS 模块** 'src/pet/content-library.ts'：严格解析、第三方包校验、合并、选择持久化、对话行为解析、外观应用；无 DOM 生命周期、无定时器、无网络、无第三方依赖。 | 浏览器/Node/测试三处同构；UI 只做渲染，安全边界集中在纯函数。 |
| D3 | **外观通过命名空间 CSS 变量 + data 属性应用**：'--famling-content-*' + 'data-content-*'；幂等、可清理、可回退默认；禁止 url()/网络字体。 | 主题/背景/字体是纯 token，不应引入图片或远程资源；UI 只需 apply/clear 两个调用。 |
| D4 | **第三方内容包 = 封闭声明式 schema** 'famling.content-pack/0.1'：内联 entries + 许可 + AI 标识 + 兼容性 + 四项全 false 的安全边界 + 路径/文本/颜色上限；内置条目不可被覆盖。 | 与既有 DLC 签名/同意/注入审计（P1-1/P1-3）同一威胁模型；先有可审计数据，再谈市场。 |
| D5 | **共享目录与插件 v2 已对齐六类**：插件 0.9.1 发布 content-extension v2（character/voice/dialogue/theme/background/font），不再需要 4→6 适配层；两套 schema 仍独立，收敛到统一 schema 必须 MAJOR + 双读迁移。 | 插件 0.9.1 已完成六分类 UI 与 v2 纯数据契约；强行合并字段会破坏已验证的 fail-closed 行为。 |
| D6 | **远程市场仅预留字段与签名接口，0.1 不联网、不自动安装**；内容市场只做静态研究性内容，明确不做付费情感关系/情感陪伴变现。 | 复用 P1-1 的 fail-closed 信任根方案；产品定位是技术研究与原型验证。 |
| D7 | **角色就是主题（v2 产品澄清）**：主数据单位改为**角色主题** 'rolePresets' / 'characterThemes'，一键切换角色/声音/对话/行为/外观配色；六个分类降级为**可选组件**（自定义/派生）。背景/字体/主题不再是主入口。 | 用户明确"主题并不适用于桌宠"；只切气泡/背景/字体不能表达角色差异。 |
| D8 | **内置角色主题 = human / cat / dog / origami 四条**，每条含 characterId/voiceId/dialoguePackId/appearance/behaviorPreset?/preview/designRef/usageDeclaration/version/source/author/license/aiProvenance；'defaultRoleTheme' 指向 human。 | 与现有 4 套动画/渲染器一一对应；猫狗静音、人形可 TTS 的产品规则不变。 |
| D9 | **库 schema 升 'famling.content/0.2'，v1 保留 deprecated 适配**：0.1 文档仍可解析（返回 v2 视图、legacy:true、rolePresets 为空）；v1 导出/函数不删除。 | 旧 UI/main 不改也能继续 parse + merge；明确迁移而不是静默破坏。 |
| D10 | **内容包 schema 升 'famling.content-pack/0.2'**：角色主题包（1..8 roleThemes）+ 可选六组件 components；强制 usageDeclaration / license / aiProvenance / compatibility / files(sha256)；支持 zip 素材包与 JSON 清单；资产仅 png/webp/json/woff2，路径/大小/哈希/压缩比全校验。 | 导入不只是 JSON，还要素材包；先 fail-closed 再谈市场。 |
| D11 | **统一用途声明是硬门**：每条角色主题/内容包必须逐字引用 USE-RESTRICTIONS canonical 短句 + researchOnly=true + 六条 prohibitedUses；UI 导入前必须显式确认。 | 与 2026-11-19 法务短句单一事实源对齐；防止内容包被用于情感陪伴/虚拟伴侣/专业建议/未成年人亲密/冒充/违法。 |
| D12 | **远程在线市场一定会做，但只先定义契约**：catalog（version/updatedAt/packs[]/signature/keyId）+ zip sha256 + Ed25519 验签接口；核心模块不联网；未签名/未知 key/吊销 key/未验签 remote pack 一律拒绝。 | 先有可审计的数据/验签契约与信任根语义，UI/安装器/支付后才能安全接。 |
| D13 | **远程市场客户端 v1 已实现，但默认不联网**：新模块 content-market.ts 提供可注入 transport/clock/storage/verifier 的 MarketplaceClient（v4 起 transport 必须由宿主注入、默认 null、无全局 fetch 回退）；refreshCatalog 做 HTTPS/私网/redirect/超时/大小/串行限制 + 目录验签 + serial 防回滚；downloadPack 只允许已验签目录条目的精确 URL 并先大小/SHA-256/Ed25519；installPack 只调用宿主注入的 unpack/install，remote pack 二次验签；content-hub 通过 createRemoteMarketSource/createRemoteMarketRefresh 适配，市场 UI 由 canRequestRemoteMarket() 单一联网门控制。 | 让远程市场在真实服务器/审核/支付前就有可测试、fail-closed 的客户端核心；UI 默认零请求，后续只做注入。 |

验证证据（2026-11-19）：

- 'npx tsc --noEmit' → exit 0（含新模块与新测试）；
- 'node --import tsx --test tests/content-library.test.ts' → **34 tests / 34 pass / 0 fail**（Windows Node 24.22.1，仓内 node_modules 为 win32 依赖；WSL 下直接跑 tsx 会命中 esbuild 平台不匹配，见 §5.6）；
- 未改 main/UI/plugin；未 commit/push。

v2 追加证据（2026-11-19，WSL2 Node 24.22.1）：

- 'npx tsc --noEmit' → exit 0；
- 'node --import tsx --test tests/content-library.test.ts tests/content-hub.test.ts tests/content-pack-v2.test.ts' → **93 tests / 93 pass / 0 fail**（34 + 30 + 29）；
- 全仓 'npm test' → **1075 tests / 1075 pass / 0 fail**（22.6 s，含全部既有回归）；
- 其中 v2 新测试 **29 项**覆盖：一键角色主题解析/六组件、role-theme 持久化、派生主题、内容包 0.2 声明硬门、zip 路径/大小/资产类型/哈希、远程 catalog/zip sha256/Ed25519 fail-closed、v1 deprecated 适配、human/cat/dog 设计参考与 example 结构；
- 未改 main/UI/plugin；未联网；未 commit/push。

v3 追加证据（2026-11-19，task-66，WSL2 Node 24.22.1）：

- 'npx tsc --noEmit' → exit 0；
- 'node --import tsx --test tests/content-market.test.ts' → **29 tests / 29 pass / 0 fail**（全部注入 fetch/clock/storage/verifier，无真实网络）；
- 'tests/content-market + content-hub + content-library + content-pack-v2' → **146 tests / 146 pass / 0 fail**；
- 全仓 'npm test' → **1176 tests / 1176 pass / 0 fail**（18.6 s）；
- 覆盖：目录验签/篡改/未知/过期/吊销/retired key、serial 回滚、http/私网/redirect/超限/超时/abort、pack SHA/签名/大小/私网/fragment、install 回调顺序与 remote pack 二次验签、content-hub 适配、脱敏日志、零配置零请求；
- 未改 content-library 签名/校验函数；未改 main.ts/插件；未联网；未 commit/push。

v4 追加证据（2026-11-19，task-75/MB-086；tsc 在 WSL2、测试/build 用 Windows Node 24.22.1 + 仓内 win32 node_modules）：

- `npx tsc --noEmit` → exit 0；
- `node --import tsx --test tests/content-market.test.ts` → **34 tests / 34 pass / 0 fail**（29 原有 + 5 新增：缺失 transport、非法 transport、content-hub 保险丝、2 个静态门）；
- `node --import tsx --test tests/content-hub.test.ts` → **54 tests / 54 pass / 0 fail**（含「市场 tab 打开零请求、只有显式点击才刷新」回归）；
- `npm run build` → vite build ok；`dist/` 中 grep 不到 `transport-unavailable`/`MarketplaceClient`/`content-market`（content-market 未进入产品 bundle，bundle 保险丝成立）；
- 全仓 `npm test` → tests 1211 / pass 1204 / fail 4 / skipped 3；4 项失败均来自并发中的其它任务与本机环境（`pet-anim 0.2` 文档交叉链接仍在写的 task-76、SAFETY.md 行数仍在写的法务任务、Windows 无 `python3` 的 cat 动画生成器检查），无一项涉及 content-market/content-hub/本文件；
- 静态门在同一测试文件内读仓库源码：content-market.ts 无 globalThis.fetch/window.fetch/self.fetch/裸 fetch() 调用、transport 默认 null、content-hub/main.ts 不 import content-market.ts、main.ts 不接 refreshMarket；
- 未改 Rust/插件；未联网；未 commit/push。

---

## 1. 目标与非目标

### 1.1 目标

1. 让 famling 与 dsh-famling 对"角色、语音、对话包、主题、背景、字体"使用同一套 id、字段、默认值、选择语义和安全边界。
2. 把第三方内容包从"各自定义"收敛为一个可校验、可审计、可拒绝的声明式 schema。
3. 给 UI 提供可直接调用的纯函数：解析、查找、合并、读写选择、应用外观、解析对话行为。
4. 为未来本地 DLC / 远程市场预留 source/remote 与签名接口，但当前不联网、不安装。
5. 明确产品边界：研究用途；不做付费情感关系。

### 1.2 非目标

- 不实现内容中心 UI、菜单项、安装器、商店、支付、远程拉取、签名验证执行器。
- 不改 'main.ts' / 'desktop-shell.ts' / 'pet.html' / 'client.js' / 插件。
- 不引入第三方依赖、不引入网络字体/图片。
- 不改变现有 hero 渲染器/动画包/语音 TTS/同意门的运行时代码。
- 不做本地化文案的最终定稿（library 里的 name/description 是数据初稿，UI 可 i18n 覆盖）。

---

## 2. 产品结构与分层

~~~text
                    +--------------------------------------+
                    | 公开/内置内容数据                      |
                    | public/content/library.json           |
                    | famling.content/0.1                  |
                    +------------------+-------------------+
                                       |
              +------------------------+------------------------+
              |                                                 |
   +----------v-----------+                          +----------v-----------+
   | famling (Tauri app)   |                          | dsh-famling (plugin)  |
   | src/pet/content-      |                          | 现有 0.9.0 content    |
   | library.ts + UI 面板  |                          | 中心 + 适配层(未来)    |
   +----------+------------+                          +----------+------------+
              |                                                |
   应用外观/对话/选择                                   插件自己的存储键/
   localStorage 六键                                   4-tab 内容中心
              |                                                |
   +----------v----------------------------------------v-------+
   | 共享安全前庭：严格解析 / 包校验 / 合并 / 路径+文本+CSS 边界 |
   +-----------------------------+-------------------------------+
                                 |
                    +------------v-------------+
                    | 本地内容包（未来）         |
                    | famling.content-pack/0.1 |
                    | 同意门 + 签名 + 无网络     |
                    +------------+-------------+
                                 |
                    +------------v-------------+
                    | 远程市场（仅预留，未实现）  |
                    | source:"remote" + 签名接口 |
                    +--------------------------+
~~~

设计原则：

1. **数据向上、UI 向下**：catalog 是唯一内容事实源；UI 不再各自硬编码角色/主题列表。
2. **纯函数在核心、副作用在宿主**：StorageLike/DocumentLike 都注入；核心不做生命周期。
3. **内置优先、外置不可覆盖**：合并规则保证内置 id 永远赢，第三方包只能新增自己的 id。
4. **fail-closed**：任何未知字段、未知分类、不安全 token、超限文本/路径一律拒绝；不存在"宽松透传"路径。
5. **两产品独立发版**：dsh-famling 0.9.1 已用自己的 content-extension v2（6 kind）；两套契约保持独立，统一需 MAJOR + 双读迁移。

---

## 3. 两产品映射

### 3.1 现状（2026-11-19 只读核对）

famling（私有完整仓 'desktop-games'）：

- 右键菜单：'desktop-shell.ts' 的 'RENDERER_MENU_ITEMS' 固定四行（金毛/塞尔凯克卷毛猫/汀岚/折纸），另有按角色 regions.json 驱动的动作；缩放/文字大小等。
- 角色持久化：'desktop-games/pet/hero'（hero 开关）+ 'desktop-games/pet/heroCharacter'（dog/cat/humanoid/tinglan）。
- 语音：'desktop-games/pet/voice' 存 stella/tide；只有 human/humanoid 可 TTS；猫狗固定 thought 气泡。
- 主题/背景/字体：**无选择 UI**；'pet.css' 的气泡颜色硬编码（例如白底 #ffffff / 深色字 #111111）。
- 无内容中心入口；菜单无"主题/背景/字体/对话包"。

dsh-famling（本地插件 0.9.0，未修改）：

- 已实现 4-tab 内容中心（人物右侧第 4 个按钮）：characters / voices / dialogue / themes，切换即时生效、不刷新；
- 存储键：'dsh-famling/character'、'dsh-famling/dialogue'、'dsh-famling/theme'、'dsh-famling/settings'.voiceURI；
- 声音 tab 是浏览器 speechSynthesis 动态列表（非 DeepSeek stella/tide）；
- 已发布预留契约 'content-extension.mjs'（0.9.1：schemaVersion 2，6 kind，source bundled/local/remote，纯数据 validateContentPack，不加载 pack）；
- 动画按角色懒加载；主题变量前缀 '--dsh-famling-*'。

### 3.2 分类映射总表

| 共享分类（famling.content/0.1） | famling 消费点 | dsh-famling 对应 | 状态 |
|---|---|---|---|
| characters | hero 渲染器 + 菜单 + 动画包 | 0.9.0 characters tab + 'dsh-famling/character' | 可一一映射（humanoid↔human） |
| voices | TTS stella/tide + 同意签名 | 0.9.0 voices tab = 浏览器 speechSynthesis | **来源不同**：共享是 DeepSeek 合成音色；插件是系统语音 |
| dialoguePacks | 气泡频率/长度策略 | 0.9.0 dialogue tab（standard/brief/quiet） | id 同名、数值语义不同（§3.5） |
| themes | CSS 变量应用到 pet 文档 | 0.9.0 themes tab（default/paper/night） | 前缀不同；共享多 high-contrast |
| backgrounds | 新增（透明/纸张/暗色） | 暂无 | 插件后续可加；共享先落地 |
| fonts | 新增（本地字体栈） | 暂无（插件跟随 DSH 字体） | 插件后续可加或不加 |

### 3.3 角色映射

共享目录内置 4 个角色；产品 id 映射由 'CONTENT_CHARACTER_PRODUCT_IDS' 固定：

| 共享 id | kind | famling renderer | dsh-famling character | 语音 |
|---|---|---|---|---|
| humanoid | humanoid | humanoid | human | tts + speech |
| dog | dog | dog | dog | none + thought |
| cat | cat | cat | cat | none + thought |
| origami | origami | origami | —（插件无折纸形态） | tts + speech |

适配建议：插件只消费 'kind' 映射后三个 id 的子集；'origami' 在插件隐藏。共享目录的 preview 对插件应回退为 glyph/emoji 或插件自带头像（插件现在用 CONTENT_AVATARS），不要把 famling 的 96×96 PNG 路径硬塞进插件。

### 3.4 语音/TTS 映射

| 维度 | famling | dsh-famling 0.9.0 | 收敛策略 |
|---|---|---|---|
| 音色来源 | DeepSeek TTS 官方合成音色 stella/tide（baked 21 句/音色） | 浏览器 speechSynthesis 的 voiceURI 列表 | 共享 voices 只描述 famling 侧；插件保持动态列表 |
| 可发声角色 | humanoid / origami | human | 都只允许 human presentation |
| 猫狗 | thought，永不 TTS | thought，永不 TTS | 一致，不允许包覆盖 |
| 同意 | TTS 独立声明 + 配置签名（切换 stella/tide 需重新确认） | TTS 单独同意 + voiceURI 选择 | 适配层不得把"包提供的 voice"当同意；切换仍需重弹 |

结论：**不要**把共享 voices 直接注入插件声音 tab；只同步"该角色是否允许 TTS"和"是否有可用语音"的能力位。

### 3.5 对话包映射（当前存在语义漂移）

| 包 id | 共享 0.1 语义 | 插件 0.9.0 语义 | 迁移建议 |
|---|---|---|---|
| standard | bubbleChance 0.7，maxChars 240 | 原样，bubbleChance 1，maxChars 0（不限） | 阶段 1 插件保持现状；适配层只显示名称/说明，不套用共享数值 |
| brief | bubbleChance 0.4，maxChars 80 | 过滤 >90 字回复并加省略号，bubbleChance 1 | 若直接采用共享值会改变现有插件行为，需产品确认后按 MAJOR 迁移 |
| quiet | 关闭自动环境气泡，交互仍显示，maxChars 50 | 仅 ~35% ambient 气泡，direct 始终显示，maxChars 0 | 语义不同（关闭 vs 降频），不可静默映射 |

建议：

1. 共享 0.1 先作为 famling 的**唯一行为源**（'resolveDialogueBehavior'）；
2. 插件的 4 个 tab 与行为先不动；适配层只做 catalog 展示与 id 对映，不改 'DIALOGUE_MODES'；
3. 等插件内容中心下一步迭代时，以"扩大/收敛数值"为一次显式 MAJOR 行为变更，并在 CHANGELOG/README 说明。

### 3.6 主题 CSS 变量映射

共享外观写入 '--famling-content-*' 与 'data-content-*'；插件现有主题变量是 '--dsh-famling-*'，适配层需要显式翻译：

| 共享变量 | 插件变量（0.9.0） |
|---|---|
| --famling-content-bubble-bg | --dsh-famling-bubble-bg |
| --famling-content-bubble-fg | --dsh-famling-bubble-text |
| --famling-content-bubble-border | --dsh-famling-bubble-border（thought 变体需另给 --dsh-famling-bubble-thought-border） |
| --famling-content-bubble-shadow | 插件无对应（可忽略或新增） |
| --famling-content-panel-bg | --dsh-famling-panel-bg |
| --famling-content-panel-fg | --dsh-famling-panel-text |
| --famling-content-bg | 插件无对应（widget 透明背景，谨慎） |
| --famling-content-background | 插件无对应（透明 widget） |
| --famling-content-font-family | 插件不接管，建议忽略 |

注意：

- 插件 default 主题的 panel 用 'var(--dsw-alias-...)'，共享模型的 'isSafeCssColor' 不接受 'var()'（这是有意的：共享主题只允许具体安全颜色，不跨产品变量）。适配层不能把共享 theme 直接塞进插件现有的 vars 对象；
- high-contrast 是共享新增主题，插件可后续增加同名主题；背景/字体在插件侧可能永远不适用（widget 需要透明）。

### 3.7 扩展契约映射（famling.content-pack/0.1 ↔ dsh content-extension v2）

插件 0.9.1 已发布 **content-extension v2**（`schemaVersion: 2`，6 kind：character / voice / dialogue / theme / background / font），六类 UI 已对齐；两套 schema 仍独立、各自 fail-closed。

| 维度 | 共享 0.1 | 插件 v2 | 兼容策略 |
|---|---|---|---|
| 包 schema | `schema` = `famling.content-pack/0.1` | `schemaVersion` = 2 | 独立校验；未来统一需 MAJOR |
| 分类 | 6 categories | 6 kinds | 一一对应（命名：dialoguePacks ↔ dialogue；backgrounds ↔ background；fonts ↔ font） |
| source | builtin/local/remote | bundled/local/remote | builtin ≡ bundled |
| 条目 | 目录条目（含 vars/family/kind/preview 等） | kind + preview + apply + permissions | 分别校验；apply 载荷由插件定义 |
| 校验结果 | `{ ok, issues: [{path,code,message}] }` | `{ ok, errors: string[] }` | 调用方分别适配 |
| 远程 | remote 字段预留、不联网 | allowRemote 默认 false | 都 fail-closed |
| 主题变量 | `--famling-content-*` | `--dsh-famling-*` | 前缀不同，各自应用 |

收敛路径（建议，未实施）：

1. 两套契约保持独立，共享读取/测试语料，不互塞 schema；
2. 若未来要统一包格式，先定义超集 schema + 双读迁移，MAJOR bump；
3. 本地 pack 安装器 + 同意门 + 签名验证是后续任务；远程市场最后。

任何阶段都不得破坏：猫狗静音/thought、TTS 独立同意、无网络/无脚本/无 HTML、未知字段拒绝。

### 3.8 选择持久化映射

| 共享选择键 | famling 现有键 | dsh-famling 现有键 |
|---|---|---|
| desktop-games/pet/content/character | desktop-games/pet/hero + heroCharacter | dsh-famling/character |
| desktop-games/pet/content/voice | desktop-games/pet/voice | dsh-famling/settings.voiceURI |
| desktop-games/pet/content/dialogue-pack | 无 | dsh-famling/dialogue |
| desktop-games/pet/content/theme | 无 | dsh-famling/theme |
| desktop-games/pet/content/background | 无 | 无 |
| desktop-games/pet/content/font | 无 | 无 |

迁移原则：

- 共享键与旧键**并存**，共享 0.1 不删除/覆盖旧键；famling 现有渲染器切换继续写旧键（'rendererChoiceWrites'），避免一次迁移破坏回滚。
- 读选择时共享键优先、旧键缺失回退；UI 迁移完成并观察一个版本后，再考虑收敛。
- 插件永远不写共享键（反之亦然），直到插件显式采用适配层。

---

## 4. 右键菜单集中化方案（famling）

### 4.1 现状菜单结构（'desktop-shell.ts'）

1. 汀岚 · 桌面：交办/输入、当前角色动作（hero 时来自 regions.json actions；折纸时摸摸/给纸片/折一下）、折页簿、导入、Advisers、设置、渲染器（4 行固定）、缩放、文字大小、声明/数据控制、退出。
2. 渲染器 4 行与角色动作是**两套手写数据**；主题/背景/字体/对话包完全没有入口。
3. 菜单是 WAI-ARIA menu + roving tabindex；所有动作激活前重查 consent（'menuBlocked'）。

### 4.2 目标 IA（内容中心集中化）

新增**一个**顶层菜单项"内容中心…"，打开内容面板；菜单本身不再无限膨胀：

- 角色（characters）：4 个内置 + 已安装角色包；
- 声音（voices）：stella/tide + "TTS 需单独同意"状态/入口；
- 对话（dialoguePacks）：standard/brief/quiet + 说明；
- 主题（themes）：default/paper/night/high-contrast；
- 背景（backgrounds）：transparent/paper/dark；
- 字体（fonts）：system/serif/mono；
- （未来）"本地内容包…"：仅在有安装器/同意门后出现。

过渡期：

- "渲染器"分组保留（兼容现有 reload 逻辑与测试），但其数据源逐渐改为 characters 目录；迁移完成后删除重复列表；
- 新入口放在"汀岚 · 桌面"分组、渲染器之前；文案固定中文，i18n 时替换。

### 4.3 交互与数据流

1. 菜单点击"内容中心…" → 'openContentCenter()'（新 UI 模块）→ 读 'parseContentLibrary' + 'readContentSelection' → 渲染 6 个分组/标签页；
2. 选择角色：
   - 复用现有 'applyRendererChoice'（写旧键 + reload）或新面板内走 hero runtime 的切换 API；在 UI agent 验证前不要重写 hero 生命周期；
   - 共享目录的 selection 可同时写入 content/character（便于未来统一），但必须保留旧键回滚路径。
3. 选择语音：写 content/voice + 现有 voice 偏好键；如果从 stella 切到 tide，必须触发既有 TTS 配置签名重弹（'formatVoiceModeLabel' 路径），不得静默。
4. 选择主题/背景/字体：调用 'applyAppearance(document, library, selection)' → 立即生效；再写共享选择键；无需 reload。清空恢复默认调用 'clearAppearance(document)'。
5. 对话包：写 content/dialogue-pack；接 'resolveDialogueBehavior' 的 'shouldShowBubble'/'clampText'（后续 UI agent 接入气泡渲染时；本任务只提供纯函数）。
6. 第三方包（未来）：安装动作必须单独走 TOS/DLC 同意门；安装后 re-merge + 刷新面板；卸载只删该包条目与文件，不动内置。

### 4.4 不变量（不得破坏）

- 每次菜单打开/动作激活重查 consent（'menuBlocked'）；
- 菜单/面板 ARIA 语义、键盘/焦点回退；不用 innerHTML，文本用 textContent/React children；
- 不联网、不执行脚本、不自动加载/安装包、不读远程 URL；
- 主题/背景/字体只应用安全 token；不允许 url()/网络字体；
- 猫狗永不 TTS；human/humanoid 切换语音仍需 TTS 单独同意；
- 选择失效/损坏时回退默认，不抛异常、不清空其它选择；
- 不改变现有渲染器/动画/hero 行为：内容中心是新增入口，旧路径可回滚。

### 4.5 实施步骤（建议交给 UI agent，按顺序）

1. 新增 'src/pet/content-center.ts'（或 UI 子目录）只做 DOM 渲染 + 事件；调用共享纯函数，不复制校验逻辑；
2. 菜单加"内容中心…"项 + 打开/关闭/焦点管理；单测覆盖 menu item 存在、consent 状态下不可操作、键盘导航；
3. 写选择用 'writeContentSelection'（content 键）+ 旧键双写策略由 UI agent 决定；读用 'readContentSelection'，失败回退；
4. 主题/背景/字体接入 'applyAppearance'/'clearAppearance'，并补视觉回归/fake DOM 测试；
5. 角色切换接入现有渲染器 API（不新写 hero 逻辑）；语音切换接现有 TTS 偏好与同意；
6. 更新 desktop-shell/hero runtime 测试与快照（UI agent 的写范围）。

### 4.6 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 菜单位置/长度膨胀 | 可发现性/键盘导航 | 只加一个入口，内容放面板；面板内滚动 |
| 双写选择键不一致 | 回滚后行为不一致 | 共享键优先、旧键回退；迁移期文档化 |
| 主题变量与硬编码 CSS 冲突 | 视觉回归 | applyAppearance 只设变量；pet.css 需 UI agent 改为 var() 回退，另立任务 |
| 插件契约漂移两套并存 | 长期维护成本 | 阶段 A/B/C；共享 0.1 为超集目标，插件不再新增第二套 |
| 第三方包安装被绕过 | 安全回归 | 安装必须走同意门 + validateContentPack + 未来签名；禁止直接 merge 未校验对象 |
| 远程市场过早实现 | 法务/供应链风险 | 0.1 只预留字段；先完成签名信任根与审核流程 |

---

## 5. 扩展 API（给 UI / 插件 agent）

### 5.1 导出清单（'src/pet/content-library.ts'）

| 组 | 导出 |
|---|---|
| Schema/常量 | CONTENT_LIBRARY_SCHEMA、CONTENT_PACK_SCHEMA、CONTENT_CATEGORIES、CONTENT_SOURCES、CHARACTER_KINDS、VOICE_MODES、BUBBLE_SEMANTICS、DIALOGUE_MODES、BACKGROUND_KINDS、CONTENT_PRODUCTS、CONTENT_LIMITS、CONTENT_FILE_EXTENSIONS |
| 类型 | ContentLibrary、ContentEntry 及六类 entry、ContentSelection、ContentPack、ContentPackValidation、ContentIssue、ResolvedContentSelection、DialogueBehavior、ContentAppearanceResult 等 |
| 解析/校验 | parseContentLibrary、validateContentPack、ContentLibraryError |
| 合并 | mergeInstalledPacks（含 conflicts/skippedPacks/packIds） |
| 选择 | CONTENT_SELECTION_KEYS、CONTENT_SELECTION_STORAGE_VERSION、readContentSelection、readContentSelectionDetailed、writeContentSelection、clearContentSelection、defaultContentSelection |
| 解析/查找 | listContent、findContent、isContentCategory、isVoiceAvailableFor、resolveVoiceForCharacter、CONTENT_CHARACTER_PRODUCT_IDS |
| 行为 | resolveContentSelection、resolveDialogueBehavior |
| 外观 | applyAppearance、clearAppearance、CONTENT_THEME_VAR_NAMES、CONTENT_BACKGROUND_VAR、CONTENT_FONT_VAR、CONTENT_DATASET_KEYS |
| CSS token 校验 | isSafeCssColor、isSafeCssShadow、isSafeCssPattern、isSafeFontFamily |

### 5.2 典型接入流程

~~~ts
import {
  parseContentLibrary,
  mergeInstalledPacks,
  validateContentPack,
  readContentSelection,
  writeContentSelection,
  resolveContentSelection,
  resolveDialogueBehavior,
  applyAppearance,
  clearAppearance,
} from './content-library.ts'

// 1) 启动：读内置目录（fetch 本地静态 JSON 或 import；不要联网）
const library = parseContentLibrary(await (await fetch('/content/library.json')).json())

// 2) 未来：校验并合并本地已安装包
const installed = installedPacks.map((raw) => validateContentPack(raw))
const validPacks = installed.flatMap((result) => (result.ok ? [result.pack] : []))
const { library: catalog, conflicts, skippedPacks } = mergeInstalledPacks(library, validPacks)

// 3) 读用户选择（损坏/缺失自动回退默认）
const selection = readContentSelection(catalog)

// 4) 应用外观（幂等；High contrast 会移除上一主题的 panel 变量）
applyAppearance(document, catalog, selection)

// 5) 对话行为
const dialogue = resolveDialogueBehavior(catalog, selection)
const line = dialogue.pickLine('region:head') ?? fallbackLineFromRegionsJson
const safeLine = dialogue.clampText(line)

// 6) 用户改选择
const outcome = writeContentSelection(catalog, { ...selection, theme: 'night' })
if (!outcome.ok) {
  // 逐键看 outcome.results；invalid = 目录里没有/不可用；unavailable = 存储不可写
}
~~~

原则：

- UI 不要复制 parse/validate 逻辑；不要直接 JSON.parse store 里的选择数据；
- 读选择 always 用 'readContentSelection'（内部已处理损坏/版本/未知 id）；
- 写选择只写合法 id（'writeContentSelection' 会逐键拒绝非法值）；
- 主题/背景/字体切换后不需要 reload；角色/语音切换沿用现有生命周期与同意流程。

### 5.3 外观契约

CSS 变量（写在 documentElement.style）：

| 变量 | 来源 |
|---|---|
| --famling-content-bubble-bg / -fg / -border / -shadow | theme.vars |
| --famling-content-panel-bg / -panel-fg / -bg | theme.vars（可选，缺失时移除） |
| --famling-content-background | background.value |
| --famling-content-font-family | font.family |

data 属性（data-content-*，由 dataset 写入）：

| dataset key | 实际属性 | 值 |
|---|---|---|
| contentSchema | data-content-schema | famling.content/0.1 |
| contentCharacter | data-content-character | 角色 id |
| contentVoice | data-content-voice | 语音 id 或 'none' |
| contentDialoguePack | data-content-dialogue-pack | 对话包 id |
| contentTheme | data-content-theme | 主题 id |
| contentBackground | data-content-background | 背景 id |
| contentBackgroundKind | data-content-background-kind | transparent/color/pattern |
| contentFont | data-content-font | 字体 id |

'applyAppearance' 幂等：重复 apply 不增加状态；切换主题会移除新主题不需要的旧变量；'clearAppearance' 移除所有变量/属性。UI 只需在启动与选择变化时调用，不要用定时器轮询，也不要在被销毁的 document 上调用。

### 5.4 内容包生命周期（未来）

1. 用户选择本地 pack 文件/目录；
2. 读取 'pack.json'（大小/深度/字段上限在 validateContentPack 内处理）；
3. 'validateContentPack' → 失败展示 issues，不安装；
4. 逐次 TOS/DLC 同意门（既有 'loadPackWithConsent'/content.ts 模式）；
5. （远程/正式发行）验签：内置信任根 + active/retired/revoked key；fail-closed；
6. 'mergeInstalledPacks' → 刷新目录与 UI；
7. 卸载：删除该包数据与选择（选择回退默认）；内置条目不可卸载。

### 5.5 存储与版本

- 选择信封：'{"v":1,"data":{"id":"night"}}'，逐键写入；单 key 上限 2048 bytes；
- 读取状态：ok/missing/corrupt/invalid/unavailable/version；只对 stored 值信任，其它回退 default；
- 未来迁移：新增 'v' 值 + migrate 函数，不允许静默改 key 名；共享键迁移需产品/回滚方案。

### 5.6 测试与运行注意

- 本任务测试：'node --import tsx --test tests/content-library.test.ts'（Windows Node 24.22.1）。
- **WSL 注意事项**：仓内 'node_modules' 是 Windows 安装（esbuild win32-x64），在 WSL 直接 'node --import tsx' 会报 "esbuild for another platform"。本任务在 WSL 下用 'powershell.exe -NoProfile -Command 'cd "D:\\Projects\\dsh\\desktop-games"; node --import tsx --test tests/content-library.test.ts'' 运行；'npx tsc --noEmit' 在 WSL 可跑（TypeScript 纯 JS）。
- 新增 UI 测试不要依赖真实 localStorage/DOM；注入 fake StorageLike/DocumentLike（见 'tests/content-library.test.ts' 的 fakeStorage/fakeDoc）。
- 回归要求：'npx tsc --noEmit' + 本测试文件 + 既有 shell/hero 测试；UI 接入后补 desktop-shell/content-center 测试。

### 5.7 给 UI agent 的接入建议

1. **先只读接入**：菜单加"内容中心…"→面板展示 6 类卡片 + 当前标记；不改 hero/renderer/voice 运行时代码。
2. **选择双写**：共享 content/theme|background|font 与现有键分离；角色/语音沿用旧键 + 现有 reload/同意流程，避免一次迁移破坏回滚。
3. **外观接入是独立小步**：先让 'pet.css' 气泡/面板颜色改为 'var(--famling-content-*, 原值)'，再接 applyAppearance；这样即使 UI 未完成也不改变默认视觉。
4. **不要碰共享模块**：如需新 helper（如 CMS 文案/i18n），在 UI 层实现或另立任务加导出；不要放宽 validate/parse 规则。
5. **不要加载第三方包**：安装器/签名/同意是后续任务；0.1 只有契约与校验。
6. **dsh-famling**：0.9.1 已对齐六类 UI 与 content-extension v2；两套 schema 仍独立，不要强行互塞字段。

---

## 6. 后续 DLC / 市场化边界

### 6.1 可市场化的内容（研究性）

- 静态、声明式、可离线校验的内容：角色立绘/皮肤、主题、背景、字体、对话包、语音包元数据；
- 每件内容必须有：许可 + 署名、AI 标识、兼容性、边界声明、可卸载；
- 内容包只做数据，不执行代码/不注入 HTML/不联网加载资源。

### 6.2 明确不做的（产品红线）

- **不做付费情感关系**：不售卖付费亲密度、订阅式陪伴、恋爱/伴侣关系、抽卡式情感奖励、依赖操控；
- 不做 roleplay 市场、成人/未成年人恋爱向内容、冒充真人/官方的声线或角色；
- 不做医疗/心理/法律/金融建议内容；
- 不做暗黑模式（限时焦虑、断签惩罚、虚假稀缺）；
- 不把同意/安全门做成付费可绕过项。

### 6.3 合规与流程（远程市场前置）

1. 生产签名信任根、key 轮换/吊销、release fail-closed（见 P1-1 解决报告）；
2. 内容审核：许可/来源/AI 标识/真人肖像/未成年人/违法内容检查 + 可追溯的发布记录；
3. 用户侧：逐次同意、离线缓存、可删除、不采集使用遥测、不静默更新；
4. 平台/商店政策、税务/支付、退款、地区限制与年龄门（如适用）；
5. 法务复核 + 独立律师意见；未完成前不开放任何付费/公开发布。

### 6.4 版本与迁移

- 共享目录 MAJOR 变更 = 不兼容字段/语义；MINOR = 新增条目/字段（向后兼容）；PATCH = 文案/数值微调；
- 内容包兼容性按 'compatibility.library' + min/maxAppVersion 校验；不兼容包拒绝而不是降级渲染；
- 插件 content-extension 独立版本号；若收敛到共享 schema，必须 MAJOR bump + 迁移期双读。

---

## 7. 本次交付与验证

| 交付 | 位置 |
|---|---|
| 内置目录 | [public/content/library.json](../../public/content/library.json) |
| 第三方规范/安全边界/远程预留 | [public/content/README.md](../../public/content/README.md) |
| 共享核心模块 | [src/pet/content-library.ts](../../src/pet/content-library.ts) |
| 回归测试（34 项） | [tests/content-library.test.ts](../../tests/content-library.test.ts) |
| 本设计 | docs/design/CONTENT-MARKET-2026-11-19.md |

验证命令（实测）：

~~~text
npx tsc --noEmit                          -> exit 0
node --import tsx --test tests/content-library.test.ts
                                          -> tests 34, pass 34, fail 0
~~~

覆盖：内置目录/预览文件存在、六分类字段、猫狗静音/人形发声、重复/非法 id、未知分类/字段、超长/HTML/控制字符、默认值引用、远程字段形状、六类第三方包正例、许可/AI/边界/兼容性要求、颜色/字体/路径注入、重复条目/超量、合并冲突（内置影子/重复 installed/重复包 id/不兼容/非法包/非变异）、选择持久化（缺失/损坏/新版本/非法 id/不可写）、外观应用（变量/属性/幂等/stale 清理/clear）、对话包（chance/quiet/clamp/overrides）。

未改：main.ts、desktop-shell.ts、pet.html、任何 UI/plugin 文件；未 commit/push。

---

## 8. 未决问题与下一步

| # | 问题 | 建议 owner/动作 |
|---|---|---|
| Q1 | famling 现有渲染器键与共享 content/character 如何收敛？ | UI agent：先双写 + 读优先，观察一个版本后定迁移 |
| Q2 | 插件 content-extension v2 与共享 0.1 的收敛版本节奏 | 两套独立；未来统一需 MAJOR + 双读迁移 |
| Q3 | pet.css 气泡/面板硬编码颜色何时改为 var() 回退 | UI agent 单独任务（不改本模块） |
| Q4 | 远程市场的客户端验签已实现（§11）；生产密钥 ceremony/信任根分发/轮换自动化未做 | 发布/安全任务（P1-1 后续） |
| Q5 | 主题 high-contrast 是否进入插件 | 插件产品决定（不是共享模型阻塞项） |
| Q6 | 背景/字体在插件 widget 透明背景下是否适用 | 插件产品决定 |
| Q7 | library.json 的 i18n 文案 | UI/i18n 任务：name/description key 化，不改 schema |

建议下一步（优先级）：

1. famling UI：内容中心面板 + 菜单入口 + 主题/背景/字体即时应用（纯新增，不动 hero/voice）；
2. pet.css 变量化 + 视觉回归；
3. 插件只读投影适配层（不改 0.9.0 行为）；
4. 本地内容包安装器 + 同意门 + 签名（需 P1-1 生产信任根收口）；
5. 远程市场最后，必须完成法务/审核/支付/地区策略。

---

## 9. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-19 | 初版：六分类共享目录、严格解析/第三方包校验/合并、选择持久化、外观应用、对话行为；两产品映射与右键菜单集中化方案；远程市场预留与产品红线。 |
| 2026-11-19 | v2（task-52）：角色主题主入口、内容包 0.2、远程市场契约，见 §10。 |
| 2026-11-19 | v3（task-66）：远程市场客户端 v1（默认不联网），见 §11。 |

---

## 10. v2（task-52）：角色主题 / 内容包 0.2 / 远程市场契约（2026-11-19 追加）

### 10.1 产品模型：角色就是主题

数据（`famling.content/0.2`，`public/content/library.json`）：

- `rolePresets`（主入口，0..8，内置 4）：human / cat / dog / origami，每条含 `characterId` / `voiceId` / `dialoguePackId` / `appearance{themeId,backgroundId,fontId}` / `behaviorPreset?` / `preview` / `designRef` / `usageDeclaration` / `version` / `source` / `author` / `license` / `aiProvenance`；
- `characterThemes`（导入/派生，0..64）：同结构，source 为 local/remote，不得与 rolePresets 同 id；
- `defaultRoleTheme: 'human'`；
- 六个分类保留为**可选组件**，角色主题引用它们；用户可以在应用角色主题后逐组件覆盖。

纯函数（`src/pet/content-library.ts`，全部无 DOM/无网络）：

| API | 用途 |
|---|---|
| `listCharacterThemes` / `findCharacterTheme` | 合并 rolePresets + characterThemes 的只读视图 |
| `resolveCharacterTheme(library, id)` | 校验并解析六组件选择 + 角色/语音/对话/外观条目 |
| `applyCharacterTheme(library, id, overrides?)` / `applyRoleTheme` | **一键应用全部**，可带单组件覆盖；返回 ok/selection/issues |
| `matchCharacterThemes(library, selection)` | 当前六组件选择匹配哪些角色主题（UI 显示“当前主题”） |
| `createDerivedCharacterTheme(library, baseId, input)` | 在角色基础上派生自定义主题；usageDeclaration 从 base 复制、不可改 |
| `readRoleThemeSelection` / `writeRoleThemeSelection` / `clearRoleThemeSelection` | 单独的角色主题选择键 `desktop-games/pet/content/role-theme` |
| `writeCharacterThemeSelection` | 六组件键 + role-theme 键一起写，逐键返回状态 |

持久化：六组件键与 0.1 完全一致（旧 UI 不迁移也能读）；新增 role-theme 键不冲突。旧渲染器键（hero/heroCharacter）继续由 UI 双写，v2 不改运行时。

### 10.2 内容包 0.2（`famling.content-pack/0.2`）

- **主内容**：`roleThemes[]`（1..8 条角色主题）；**可选** `components`（六类组件，自定义/派生用）；
- **强制声明**：`usageDeclaration`（researchOnly=true + canonical 短句逐字 + statementRef + 六条 prohibitedUses）、`license`、`aiProvenance`、`compatibility`；
- **文件**：`files[]` 每条 path+bytes+sha256 必填；支持 **zip 素材包**（pack.json 在根 + `assets/` + preview）与 **JSON 清单**两种形态；
- **zip 校验**：规范化相对路径（拒绝 .. / 绝对 / 盘符 / UNC / 反斜杠 / URL / 控制字符 / 大小写碰撞）、资产类型 **png/webp/json/woff2**、根目录文档白名单、zip ≤16 MiB、条目 ≤256、单文件 ≤8 MiB、解压总量 ≤32 MiB、压缩比 ≤128、`pack.json` 必须在根、`files[]` 与解压清单一一对应（missing/unlisted/size/hash）；
- **拒绝**：无声明 → `missing-usage-declaration`；声明不符 → `usage-statement-mismatch`；缺禁止项 → `missing-prohibited-use`；远程无签名 → `missing-signature`；未知/吊销 key → `unknown-signing-key` / `revoked-signing-key`；
- 支持的旧格式：v1 `famling.content-pack/0.1` 继续通过 `validateContentPack` / `mergeInstalledPacks` 工作（deprecated，未删除）；v2 合并入口是 `mergeCharacterThemes`。

### 10.3 远程在线市场契约（只定义，不联网）

- **catalog**（`famling.market-catalog/0.1`）：`version` / `updatedAt` / `keyId` / `signature` / `packs[]`（每条 id/name/version/description/preview?/usageDeclaration/download{url,zipSha256,bytes}/signature）；`validateMarketCatalog` 严格校验；
- **Ed25519 验签接口**：`marketCatalogSignaturePayload` / `marketPackSignaturePayload` / `remoteContentPackSignaturePayload`（canonical JSON）；`verifyMarketCatalogSignature` / `verifyMarketPackDownload`（先比 zip sha256 再验签）/ `verifyRemoteContentPack`；注入 `ContentEd25519Verifier` + `ContentTrustRoot`（active/retired/revoked + notBefore/notAfter）；
- **fail-closed**：未知 key、吊销 key、过期 key、缺失签名、哈希不符、没有 `verifyRemote` 回调的 remote pack 一律拒绝；retired 只用于验旧包；
- 下载/安装流程（UI/安装器后续接）：catalog 验签 → 用户确认 usageDeclaration → 下载 zip → zip sha256+签名 → 解压 validatePackZip → remote pack 验签 → mergeCharacterThemes → 可卸载/离线缓存/不静默更新；
- 本模块没有 fetch/网络代码；`download.url` 只是元数据。
- **v1 客户端已实现（task-66）**：传输/限制/防回滚/下载校验/适配器见 §11；真实市场服务器、审核后台、支付与密钥 ceremony 仍未实现。

### 10.4 设计实例 / 参考（第三方起步）

`docs/content-packs/`：

| 文件 | 内容 |
|---|---|
| `README.md` | 0.2 规范、zip 布局、字段表、声明、作者自检、远程市场契约、第三方最短路径 |
| `HUMAN-DESIGN-REFERENCE.md` | 人形：2.5–2.7 头身、96×96、12 clip / **68 帧**、锚点 48/96、地线 **y=89**、19 色盘、剪影、动作、语气、禁止 |
| `CAT-DESIGN-REFERENCE.md` | 塞尔凯克卷毛猫：灰白+蓝眼 16 色盘、96×96、12 clip / **72 帧**（stand_wag 10）、地线 y=89、卷毛剪影、thought/永不 TTS、禁止 |
| `DOG-DESIGN-REFERENCE.md` | 金毛：短腿成年、96×96、12 clip / **68 帧**、地线 y=89、18 色盘、剪影、动作、语气、禁止 |
| `examples/*.example.pack.json` | human/cat/dog 三个可 `validateContentPackV2` 的 0.2 清单（占位资产引用，不加载） |

### 10.5 兼容与迁移

| 旧 0.1 | v2 处理 |
|---|---|
| `CONTENT_LIBRARY_SCHEMA`（旧值 `famling.content/0.1`） | 导出保留，值改为 `famling.content/0.2`；新增 `CONTENT_LIBRARY_SCHEMA_V1` / `_V2` |
| `parseContentLibrary(0.1 文档)` | deprecated 适配：返回 v2 视图（legacy:true、rolePresets/characterThemes 为空、六分类照旧） |
| `CONTENT_PACK_SCHEMA`（0.1） | 导出保留、deprecated；新增 `CONTENT_PACK_SCHEMA_V2` |
| `validateContentPack` / `mergeInstalledPacks` | 保留；v1 包目标 0.1 在 v2 宿主上仍可合并（packCompatible 兼容） |
| `applyAppearance` / 选择键 / 对话解析 | 未改；v2 只新增 role-theme 键与函数 |
| 内置目录 version | 0.1.0 → 0.2.0；schema 0.1 → 0.2 |

迁移建议：UI 先只读接入 `listCharacterThemes` + `applyCharacterTheme`（不改 hero 生命周期）；选择持久化先双写（六键 + role-theme 键），旧渲染器键保留；第三方包先只走本地导入 + validate，签名/远程市场等安装器任务。

### 10.6 验证证据（task-52 实测）

见 §11（本次追加的实测记录）。

### 10.7 给 UI / 安装器的接入契约

1. 角色主题：`listCharacterThemes(library)` → 卡片（name/description/preview/`usageDeclaration`）；点“应用” → `applyCharacterTheme(library, id)` → 写 `writeCharacterThemeSelection(library, id, storage)`；组件自定义 → 对返回的 `ContentSelection` 覆盖后 `writeContentSelection`；
2. 导入第三方包：文件/zip 读取（宿主）→ `validateContentPackV2` →（zip）`validatePackZip` → **展示 `describeUsageConfirmation()` 并让用户显式确认** → `mergeCharacterThemes` → 持久化包 JSON + 刷新；远程包必须再传 `verifyRemote = (pack) => verifyRemoteContentPack(pack, trustRoot, verifier)`；
3. 不要绕过：UI 不得自己 parse/放宽声明、不得跳过确认、不得把 `source:remote` 当本地信任、不得在无真实验签时合并；
4. 保持产品规则：猫狗 `voiceId:none` + thought、永不走 TTS；人形 TTS 仍需既有单独同意；`usageDeclaration` 与 AI 标识必须在详情页可见；
5. 未实现（明确不在本任务）：实际下载/支付/审核后台/密钥 ceremony/安装器 UI/签名执行器；远程市场联网前必须完成法务复核与 P1-1 生产信任根。

### 10.8 变更记录（v2 追加）

| 日期 | 变更 |
|---|---|
| 2026-11-19 | v2（task-52）：角色主题主入口（rolePresets/characterThemes + 一键应用/派生）、库 schema 0.2 + v1 deprecated 适配、内容包 0.2（zip 素材包 + 统一用途声明 + sha256 + 资产白名单）、远程市场 catalog + Ed25519 验签契约、docs/content-packs 三份设计参考 + 三个 example、v2 测试。未改 UI/main/plugin，未 commit/push，未联网。 |

---

## 11. v3（task-66）：远程市场客户端 v1（已实现，默认不联网）

### 11.1 范围与不变量

本任务把 §10.3 的"只定义契约"推进为**可测试的 transport + verification 客户端**：
新模块 [src/pet/content-market.ts](../../src/pet/content-market.ts)（~1.2k 行，纯 TS，可注入依赖），
复用 content-library.ts 的 validateMarketCatalog / verifyMarketCatalogSignature /
verifyMarketPackDownload / verifyRemoteContentPack 与 content-hub.ts 的 RemoteMarketSource 契约。
**没有修改** content-library 的签名/校验函数，也没有改插件。

不变量（全部 fail-closed）：

| # | 不变量 |
|---|---|
| I1 | 构造 client / 创建 RemoteMarketSource / 创建 UI refresh 回调都**不发请求**；只有显式调用 refreshCatalog / downloadPack / installPack 才可能联网。 |
| I2 | 默认 UI 注入 null ⇒ configured:false，市场按钮禁用，页面只显示"服务器未配置 · 默认不联网"。没有注入 transport 的 client 等价于未配置。 |
| I3 | 目录与 zip 只接受 HTTPS；HTTP 需显式 allowHttp:true（测试/开发），生产构建不得开启。 |
| I4 | 目录必须 validateMarketCatalog 通过 + Ed25519 验签通过，才可被使用/持久化 serial。 |
| I5 | serial 回退（更旧 updatedAt / 同 serial 不同内容）一律 catalog-rollback，不采用、不覆盖已保存的最高 serial。 |
| I6 | zip 只允许"最近一次已验证目录"中某条目的**精确 download.url**；大小、SHA-256、pack 签名全过才返回 bytes。 |
| I7 | 安装只发生在 unpack → validateContentPackV2 → (remote) verifyRemoteContentPack → install 全部通过之后；模块自己不写盘。 |
| I8 | 用户显式确认统一用途声明是 UI 责任；installPack 被调用即视为"用户已确认"的边界。 |
| I9 | 日志只含 hostname/状态/字节数/keyId 等脱敏字段，从不含完整 URL、query/fragment、签名值或响应体。 |
| I10 | 模块无遥测、无自动重试、无后台轮询、无定时器（除单次请求的 timeout 定时器）。 |
| I11 | **本模块不直接出网（v4/task-75）**：唯一网络出口是宿主注入的 `MarketTransport`（未来 Rust 受限下载器 / IPC 桥 / 测试 fake）；transport 默认 null，缺失 ⇒ 稳定失败码 `transport-unavailable` + **零请求**；模块内不存在 `globalThis.fetch`/`window.fetch`/`self.fetch`/裸 `fetch()` 调用（CI 静态门）。 |
| I12 | **产品入口保险丝（v4/task-75）**：content-market.ts 不被任何 pet 生产模块 import（不进入产品 bundle）；content-hub 市场 UI 默认零请求，只有 configured:true + 注入 refresh 回调 + 用户显式点击三者同时满足才可能走到联网（单一门 `canRequestRemoteMarket()`）。 |

### 11.2 导出接口

| 类别 | 导出 |
|---|---|
| 客户端 | MarketplaceClient、createMarketplaceClient(config) |
| UI 适配 | createRemoteMarketSource(client)、createRemoteMarketRefresh(client)、createRemoteMarketWiring(client)、MarketplaceError、describeMarketFailure(failure)；content-hub 侧：canRequestRemoteMarket(state, hasRefreshHandler)（市场 UI 单一联网门） |
| 纯函数 | validateMarketRequestUrl、isPrivateOrLoopbackHost、marketCatalogSerial、compareMarketCatalogSerial、marketCatalogFingerprint、parseMarketCatalogTimestamp、readMarketCatalogSerial |
| 常量 | MARKET_CLIENT_DEFAULTS、MARKET_CLIENT_HARD_LIMITS、MARKET_FAILURE_CODES、MARKET_SERIAL_STORAGE_KEY |
| 类型 | MarketplaceClientConfig、MarketTransport / MarketResponseLike / MarketplaceRequestInit、MarketCatalogSerial、MarketCatalogRefreshResult、MarketPackDownloadResult、MarketPackInstallResult、MarketUnpackResult / MarketplaceUnpackHook、MarketInstallOutcome / MarketplaceInstallHook、MarketLogEvent / MarketplaceLogger、MarketFailure |

关键用法（宿主必须注入 transport + client；UI 点击才触发，默认零请求）：

~~~ts
import { createMarketplaceClient, createRemoteMarketWiring } from './content-market.ts'

// 生产默认：不创建 client（或显式传 null），市场保持未配置、零请求。
// 即使创建 client，也必须显式注入 transport；transport 缺失 ⇒ transport-unavailable。
const client = reviewedServerReady && hostTransportReady
  ? createMarketplaceClient({
      catalogUrl: TRUSTED_CATALOG_URL,        // 显式注入，无内置默认 URL
      trustRoot,                              // keyId/公钥/status/有效期
      verifier,                               // Ed25519 verify 注入（WebCrypto/node:crypto 均可）
      transport: hostMarketTransport,         // 必须：Rust/IPC 受限下载桥或测试 fake；无全局 fetch 回退
      now: () => Date.now(),
      storage: localStorage,                  // serial 防回滚持久化；缺省则 fail-closed
      unpack: (input) => hostUnzipAndParse(input),    // 只解包/解析，不落盘
      install: (input) => hostPersistAndMerge(input), // 唯一落盘/合并路径
    })
  : null

const wiring = createRemoteMarketWiring(client, { sourceLabel: '官方内容市场' })
initContentHub({
  // ...
  getMarketState: wiring.getMarketState,
  refreshMarket: wiring.refreshMarket, // 只有用户点「刷新市场目录…」才被调用
})
~~~

### 11.3 配置项（默认值 / 硬上限）

| 配置 | 默认 | 硬上限/约束 | 说明 |
|---|---|---|---|
| catalogUrl | 无（必填） | ≤512 字符；无 userinfo/fragment | 显式注入；没有内置市场服务器 |
| trustRoot | 必填 | 1..16 个 ed25519 key；active/retired/revoked + notBefore/notAfter | 复用 P1-1 信任根语义 |
| verifier | 必填 | verify(message, signatureBase64, publicKeyPem) | 浏览器 WebCrypto / Node crypto 皆可 |
| transport | **无（默认 null）** | 注入式 MarketTransport（Rust/IPC 桥或测试 fake） | **必填才有网络能力**：不注入 ⇒ transport-unavailable + 零请求；无 globalThis.fetch 回退；注入本身绝不发请求 |
| now | Date.now | 返回 ms | 用于密钥有效期 + serial 比较 + 结果时间戳 |
| timeoutMs | **8 000** | 1..30 000 | 覆盖 redirect + body read |
| maxCatalogBytes | **1 MiB** | ≤4 MiB | 等于 maxMarketJsonBytes |
| maxPackBytes | **16 MiB** | ≤64 MiB | 等于 maxZipBytes |
| maxRedirects | **3** | 0..5 | 手动 redirect，同 host |
| maxConcurrentDownloads | **1**（v0.2 起） | 1..4 | 目录刷新本身强制串行；签名目录 `rateLimit` 只能再降低 |
| storage | 无 | StorageLike | 缺省且 requireSerialStorage:true ⇒ 拒绝联网 |
| requireSerialStorage | true | — | 显式 false 才允许无持久化（测试/无痕模式，结果标记 rollbackProtection=false） |
| allowHttp | false | 测试/开发专用 | 开启会记一条 warning 日志 |
| allowPrivateHosts | false | 测试/开发专用 | 允许 loopback/私网 CI mock |
| allowedCatalogHosts | 无 | 精确 host 列表 | 可选目录 host 白名单 |
| serialStorageKey | desktop-games/pet/content/market/catalog-serial | ≤128 字符 | 升级 key 需迁移/运维确认 |
| unpack / install | 无 | 均为函数才 installConfigured:true | 两段式：先解包解析，再落盘合并 |
| logger | 无 | 脱敏事件 | 抛异常也不会中断市场操作 |

### 11.4 协议流程（fail-closed 顺序）

**A. refreshCatalog（目录）**

1. 配置检查（configured；失败返回 not-configured / invalid-config / transport-unavailable，不联网）；
2. URL 策略：HTTPS（或显式 allowHttp）/ 无 userinfo / 无 fragment / 非私网（或显式例外）/ 可选 host 白名单；
3. 读本地最高 serial；storage 缺失（requireSerialStorage=true）、不可读、损坏 ⇒ 直接失败，**不联网**；
4. 通过宿主注入的 transport 发 GET：redirect:'manual'、credentials:'omit'、cache:'no-store'、referrerPolicy:'no-referrer'，8 s 超时 + 大小上限 + 手动逐跳 redirect；
5. body 必须 ≤ maxCatalogBytes（先看 content-length，再量实际 bytes）；空 body/非 UTF-8/非 JSON ⇒ catalog-invalid / empty-response；
6. validateMarketCatalog（严格 schema/上限/URL/声明）；
7. verifyMarketCatalogSignature（trust root key 状态 + 有效期 + Ed25519）；
8. 计算 serial = updatedAt（ms，主序）+ version（semver，tie-break）+ 规范化 payload sha256；
9. 与本地最高 serial 比较：更旧 ⇒ catalog-rollback；同序不同 hash ⇒ catalog-rollback；
10. 通过后才写 serial、才更新内存目录、才返回 packs。

**B. downloadPack（下载）**

1. 必须已成功 refresh；传入条目必须与**已验签目录**中的 id/version/url/sha/signature 完全一致，否则 pack-not-in-catalog；
2. 目录声明的 bytes > maxPackBytes ⇒ too-large（不下载）；
3. 精确请求目录中的 download.url；同 host 手动 redirect、超时/大小上限同 A；
4. 实际字节数必须等于目录声明 bytes ⇒ 否则 size-mismatch；
5. 本地计算 SHA-256；verifyMarketPackDownload 先比 hash 再验 Ed25519（未知/吊销/过期 key fail-closed）；
6. 全过才把 Uint8Array 交给调用方。

**C. installPack（安装）**

1. 必须注入 unpack + install，否则 install-unconfigured；
2. 再次执行 B 的条目标识 + 实际 bytes 大小 + SHA-256 + Ed25519 校验（防调用方传入被换掉的 bytes）；
3. unpack(bytes)：宿主只做有界解包 + 解析 pack.json（不落盘）；
4. validateContentPackV2(pack.json)：严格 0.2 声明/路径/哈希/兼容性；
5. 若 contentPack.source === 'remote'：必须再过 verifyRemoteContentPack（remote.signature 的 Ed25519 + trust root），失败 invalid-signature 且 install 不调用；
6. 全部通过后才调用 install({pack, bytes, sha256, contentPack, remotePackVerified, ...})；宿主负责按既有同意门/validatePackZip/mergeCharacterThemes 落盘；
7. 安装回调返回的结果原样（脱敏后）回传；异常/拒绝 ⇒ install-failed。

### 11.5 传输层安全细节

| 风险 | 处置 |
|---|---|
| 明文/降级 | 只接受 HTTPS；HTTP 需显式测试开关；HTTPS→HTTP 的 redirect 永远 redirect-insecure |
| URL 注入 | 拒绝 userinfo、fragment、控制字符、超长（>512）、非 http(s) scheme |
| SSRF/内网 | 拒绝 loopback（127/8、::1）、私网（10/8、172.16/12、192.168/16）、link-local（169.254/16、fe80::/10）、CGNAT（100.64/10）、保留/文档/组播段、localhost/.local/.internal/home.arpa；DNS rebinding 不在纯函数能力内，生产需在宿主/代理层固定解析策略（见 §11.11） |
| 开放重定向 | redirect:'manual' 自己跟；每跳同 hostname、协议不降级、逐跳重新套用 URL 策略、最多 maxRedirects 跳 |
| 超时/挂起 | 每请求单 AbortController + 8 s 定时器，覆盖 redirect 与 body read；取消返回 aborted |
| 内存/压缩炸弹 | 目录 ≤1 MiB、zip ≤16 MiB 双层限制（content-length 预检 + 实际 bytes 复核）；解压/压缩比仍由宿主 validatePackZip/CONTENT_ASSET_LIMITS 负责 |
| 并发/竞态 | refresh 串行链（同一时刻最多 1 个目录请求）；download 由 maxConcurrentDownloads 信号量限流；serial 只在验签成功后写 |
| 缓存/陈旧 | cache:'no-store'，不信任 HTTP 缓存；serial 防回滚提供应用层保护 |

### 11.6 签名与信任根

- 所有密码学复用 content-library.ts：marketCatalogSignaturePayload（去掉顶层 signature 的 canonical JSON）、marketPackSignaturePayload、verifyMarketCatalogSignature、verifyMarketPackDownload；**本模块不实现自己的签名算法**。
- 信任根 key 状态：active/retired 可用于验旧内容；revoked 一律拒绝；notBefore/notAfter 按注入 clock 的 UTC 日期判定。
- 顺序固定：**先大小，再 SHA-256，再 Ed25519**；目录验签先于 serial 判定；remote pack.json 验签先于 install 回调。
- 未知 key / 吊销 / 过期 / 缺签 / 哈希不符 ⇒ 对应失败码，绝不"降级信任"。

### 11.7 防回滚（serial）

> v0.2 起排序主键改为目录内的单调 `catalog.serial`（旧的 updatedAt/version 只保留在 v1 兼容语义与诊断字段中，见 §12.2）。

- serial = (updatedAtMs, version, catalogSha256)：
  - updatedAtMs 主序（date-only 视为 UTC 00:00:00）；
  - version 仅在 updatedAt 相同时比较（SemVer）；
  - catalogSha256 = canonical signed payload（不含顶层 signature）的 SHA-256，用于识别"同 serial 不同内容"。
- 持久化信封（单 key，≤2048 字符）：{"v":1,"data":{"catalogVersion","updatedAt","updatedAtMs","catalogSha256"}}。
- 规则：incoming < stored ⇒ catalog-rollback；incoming == stored 且 hash 相同 ⇒ 幂等成功（不重复写）；incoming == stored 且 hash 不同 ⇒ catalog-rollback；只有**验签通过且顺序更新**才写盘。
- storage 缺失/不可读/JSON 损坏/未知 v/空值：一律 storage-unavailable / storage-corrupt 并**拒绝联网**（不会静默重置基线）。
- 唯一恢复口：client.resetRollbackProtection()（显式运维动作，仅用于已确认的本地记录损坏；重置后下一次 refresh 建立新基线）。UI 不应自动调用。
- 为什么不用 catalog.version 单独做 serial：version 可被"重发旧目录"复用；updatedAt + payload hash 同时约束时间与字节身份，能拒绝 replay。

### 11.8 失败码

| 分组 | 失败码 |
|---|---|
| 配置/URL/传输可用性 | not-configured、transport-unavailable、invalid-config、invalid-argument、invalid-url、insecure-transport、url-credentials、url-fragment、private-host、host-not-allowed |
| 传输 | network-error、timeout、aborted、http-error、redirect-invalid、redirect-limit、redirect-cross-host、redirect-insecure、empty-response、too-large |
| 目录 | catalog-invalid、catalog-rollback、storage-unavailable、storage-corrupt、serial-write-failed |
| 下载/安装 | pack-not-in-catalog、size-mismatch、install-unconfigured、unpack-failed、pack-invalid、install-failed |
| 签名 | missing-signature、invalid-signature、unknown-signing-key、revoked-signing-key、key-outside-validity、hash-mismatch |
| 兜底 | internal-error |

约定：失败值永远是 {ok:false, code, message, retryable?, detailCode?, httpStatus?, host?, issues?}，不 throw；
retryable 仅对 network/timeout/408/425/429/5xx 为 true；host 只含 hostname；issues 最多 8 条且已脱敏。
UI 映射见 describeMarketFailure()（中文短句 + 稳定 code）。

### 11.9 隐私 / 日志 / 遥测

- 本模块不直接出网：TLS、代理、DNS、连接池、证书策略都由宿主注入的 transport 负责；production transport 必须是受限下载器（HTTPS/allowlist/大小/超时/重定向），不得把 WebView 的全局 fetch 当作实现（见 §11.15）。
- 请求头只有 accept；credentials:'omit'、cache:'no-store'、referrerPolicy:'no-referrer'；不发送 cookie、Authorization、客户端 ID。
- 持久化只有 serial 信封（版本/时间/hash），不存 URL、token、目录内容或 zip。
- 不采集使用遥测/崩溃上报；logger 是宿主注入的可选内存回调。
- MarketLogEvent 字段：level/event/code/detail/host/httpStatus/bytes/durationMs/redirects/keyId；
  **不含**完整 URL、query、fragment、body、签名值、公钥、用户输入。
- 生产运维如需日志，只上报 event+code+host+duration 聚合指标。

### 11.10 UI 接入方式（content-hub）

content-hub 的市场 UI **本身不联网**；v4（task-75）把「唯一何时可能联网」收成一个显式门：

- 默认状态 `defaultContentMarketState()`：status=unconfigured、configured:false；市场按钮 disabled，文案「远程市场未配置（不联网）」；打开 tab / 打开内容中心 / controller.refresh() 均**零请求**。
- ContentHubOptions.getMarketState ← wiring.getMarketState
- ContentHubOptions.refreshMarket ← wiring.refreshMarket（只有用户点击才调用）
- **单一联网门 `canRequestRemoteMarket(state, hasRefreshHandler)`**：仅当 `state.configured === true` 且宿主注入了 refresh 回调时为 true；`renderMarket` 用它禁用按钮，`handleRefreshMarket` 在调用前再检查一次（即便程序化触发也不会出网）。
- 未配置 / transport 缺失 ⇒ configured:false ⇒ 门恒 false ⇒ 零请求；wiring.refreshMarket 被 host 直接调用时也只返回诚实的 unconfigured 结果。
- 可选：ContentHubOptions.getMarketState 在成功刷新后返回 summarizeMarketCatalog（适配器已缓存 client.lastCatalog）。
- createRemoteMarketSource(client) 实现 RemoteMarketSource 的 fetchCatalog / fetchPackBytes / verifyCatalog / verifyPack / installPack，供后续安装器/其他 UI 复用。
- 安装按钮/用途声明确认/进度提示仍由 UI 任务实现；本模块只提供 installPack 的"已验签 + 已解包 + 已复核"入口，绝不自动安装。
- **未改 main.ts**：生产 `activeMarketSource = null`、不 import content-market.ts（静态门断言），所以产品 bundle 不含市场客户端；宿主接线留给后续 E6-T4（Rust 受限 transport）任务。

### 11.11 运维手册

| 场景 | 动作 |
|---|---|
| 生产构建 | allowHttp=false、allowPrivateHosts=false；**transport 必须由宿主（Rust 受限下载器/IPC）注入**，WebView 不提供全局 fetch 回退；未注入 ⇒ transport-unavailable + 零请求；CI 静态门断言 content-market.ts 无 global fetch 且不被产品入口 import |
| 新市场服务器上线 | 先以 allowedCatalogHosts + 测试 URL 灰度；确认目录可验签、pack sha/签名正确后再打开用户入口 |
| 密钥轮换 | 信任根先加入新 key（active，notBefore=生效日）；旧 key 转 retired 继续验旧包；确认旧目录过期后再 revoked；客户端升级 trust root 需走发布流程 |
| serial 回滚告警 | 视为供应链事件：不采用旧目录、不自动重置；核对发布记录/服务器时间；确认后走 resetRollbackProtection() 运维流程并记录 |
| storage 损坏 | fail-closed 会阻止联网；确认是本地损坏（非攻击）后显式 reset，再 refresh |
| 超时/5xx | retryable:true 由 UI 提示用户手动重试；本模块不做自动重试/退避（避免放大故障） |
| 监控 | 只聚合 event+code+host+durationMs；对 unknown-signing-key / revoked-signing-key / catalog-rollback / hash-mismatch 配置告警 |
| DNS rebinding | 生产代理/宿主必须固定解析策略（或走固定 IP/CDN allow-list）；纯客户端只能拒绝字面私网地址 |

### 11.12 测试与验证证据（task-66 + task-75 实测）

新增 [tests/content-market.test.ts](../../tests/content-market.test.ts)，v4 后 **34 tests / 34 pass / 0 fail**（task-66 的 29 项 + task-75 的 5 项），全部用注入 transport/clock/storage/verifier，**无真实网络**。

覆盖：
- 默认值/失败码稳定性；构造、createRemoteMarketSource(null)、createRemoteMarketRefresh(null) 均零请求；
- 合法目录：严格校验 + Ed25519 + serial 持久化 + 请求 init（manual redirect/omit/no-store/no-referrer）；
- 篡改目录、未知 key、吊销 key、过期 key、notBefore、retired key 语义；
- serial 回退、同 serial 不同内容、更新 serial 接受；并发 refresh 强制串行；
- http/userinfo/fragment/非法 URL；私网/回环/保留网段；显式 allowHttp+allowPrivateHosts 例外；
- 同 host redirect、跨 host、HTTPS→HTTP 降级、redirect 超限、缺 Location；
- 目录 content-length/实际 body 超限、8 s 超时、调用方 abort、HTTP 500/429、空响应、非 JSON、未签名目录；
- storage 缺失/损坏/不可读/写失败/reset；下载前置/大小/SHA/pack 签名/超限/私网/fragment/非目录条目/并发上限；
- install：成功顺序 unpack→install、bytes 篡改、长度不符、remote pack.json 有效/无效签名、缺 hook、解包失败、pack.json 非法、安装回调拒绝；
- content-hub 适配器/接线、脱敏 logger（无完整 URL/签名）、抛异常 logger 不破坏操作、非法配置 fail-closed。
- **v4 新增 5 项**：① 未注入 transport（含显式 null）⇒ configured:false + transport-unavailable + 零请求（用替换后的 globalThis.fetch spy 断言 0 次调用）；② 非法 transport 值 ⇒ invalid-config 且不联网；③ content-hub 单一联网门 canRequestRemoteMarket 的默认/配置矩阵；④ 静态门：content-market.ts 无 globalThis.fetch/window.fetch/self.fetch/裸 fetch()、transport 默认 null、失败码稳定；⑤ 静态门：content-market.ts 不被任何 pet 生产模块 import、content-hub 无 fetch 且两处都走 canRequestRemoteMarket、main.ts 不接 refreshMarket、activeMarketSource 保持 null。
- 回归：content-hub 现有「市场 tab 打开零请求、只有显式点击才刷新」继续通过（54 tests）。

命令与结果（tsc 在 WSL2 Node 24.22.1；测试/build 用 Windows Node 24.22.1 + 仓内 win32 node_modules —— WSL 下 tsx/esbuild 平台不匹配）：

~~~text
npx tsc --noEmit                                  -> exit 0
node --import tsx --test tests/content-market.test.ts
                                                  -> tests 34, pass 34, fail 0
node --import tsx --test tests/content-hub.test.ts
                                                  -> tests 54, pass 54, fail 0
npm run build                                     -> vite build ok（1.10s）；dist/ 无 content-market 标记
npm test                                          -> tests 1211, pass 1204, fail 4, skipped 3
                                                     （失败项均为并发中的其它任务/本机无 python3，与本任务无关）
~~~

未改 content-library 签名/校验函数；未改 Rust/插件；未 commit/push；未联网。

### 11.13 明确未实现（后续任务）

1. **真实服务器/CDN/审核后台**：目录发布流水线、pack 托管、镜像/回源、灰度、审核工作流；
2. **支付/订单/退款/地区与年龄门**（产品红线：不做付费情感关系）；
3. **生产密钥 ceremony/轮换自动化**（P1-1 后续）；
4. **断点续传（Range）/进度条**：v1 刻意只做显式、一次性、fail-closed 拉取；离线缓存与自动重试已由 v0.2 补上（见 §12）；
5. **安装器 UI**（用途声明展示 + 显式确认按钮 + 解压进度）+ 宿主 main.ts 接线；
6. **多市场/多 trust root/镜像选择**；preview 图片的远程加载（当前仍不联网取图）；
7. **宿主 transport（Rust 受限下载器 / IPC 桥）未实现（本任务明确不改 Rust）**：v4 只把传输层改成注入式并加保险丝；真正的出网适配器属于 E6-T4，完成前市场保持 disabled（transport-unavailable），这是当前唯一的技术阻塞项（非本任务范围）。
8. 法务复核与独立律师意见、平台商店政策/税务/退款/地区限制；远程市场联网前必须完成。

### 11.14 变更记录（v3/v4 追加）

| 日期 | 变更 |
|---|---|
| 2026-11-19 | v3（task-66）：新增 src/pet/content-market.ts 远程市场客户端 v1（可注入 transport/clock/storage/verifier；HTTPS/私网/redirect/超时/大小/并发限制；目录 Ed25519 验签 + serial 防回滚；pack 大小/SHA-256/签名校验；注入式 unpack/install；remote pack 二次验签；content-hub createRemoteMarketSource / createRemoteMarketRefresh 适配；脱敏日志）+ tests/content-market.test.ts 29 项离线测试。未改 content-library 签名函数、未改插件、未 commit/push、未联网。 |
| 2026-11-19 | v4（task-75/MB-086）：市场联网保险丝。删除 content-market.ts 的 defaultMarketFetch/全局 fetch 回退；transport 改为宿主注入且默认 null（缺失 ⇒ transport-unavailable，配置仍 fail-closed）；新增失败码 transport-unavailable；content-hub 新增 canRequestRemoteMarket() 单一联网门并在 renderMarket/handleRefreshMarket 双重使用；新增 5 项测试（含 2 个读源码的静态门：无全局 fetch、market 客户端不在 pet 入口图）。未改 Rust/插件；未 commit/push；未联网。 |

### 11.15 v4（task-75/MB-086）：市场联网保险丝 / 离线默认

#### 11.15.1 要解决的问题

评审 C-01 / SEC-403（见 [REVIEW-TRIAGE-SECURITY-2026-11-19](../plan/REVIEW-TRIAGE-SECURITY-2026-11-19.md)、[REVIEW-TRIAGE-P0](../plan/REVIEW-TRIAGE-P0-2026-11-19.md)、[REVIEW-TRIAGE-ARCH](../plan/REVIEW-TRIAGE-ARCH-2026-11-19.md) 的 E0-T7/N-06）指出：v3 生产默认 `defaultMarketFetch` 直接读 webview `globalThis.fetch`。release CSP 是 `connect-src 'self' ipc:`（不放宽），一旦把客户端接到 UI：
- 远程目录/下载会被 CSP 拦截（功能失效）；或
- 被迫把 `connect-src` 放宽到外域（安全回退，扩大 XSS 外传面）。

v4 的决定：**TS 只做状态机/校验，出网由宿主注入的受限 transport 承担；默认 null；静态门禁止全局 fetch。**

#### 11.15.2 实现（文件级）

| 文件 | 改动 |
|---|---|
| `src/pet/content-market.ts` | 删除 `defaultMarketFetch` 与 globalThis.fetch 读取；`MarketplaceFetch` → `MarketTransport`；配置字段 `fetch?` → `transport?: MarketTransport \| null`；解析时未注入 ⇒ `transport-unavailable`（config 失败、configured:false）；新增失败码 + 中文标签；请求层只调用注入的 transport。 |
| `src/pet/content-hub.ts` | 新增 `canRequestRemoteMarket(state, hasRefreshHandler)`；`renderMarket` 用它禁用按钮；`handleRefreshMarket` 调用前再检查（防御程序化触发）；契约步骤明确「出网必须经宿主 transport，WebView 不直接 fetch」。 |
| `tests/content-market.test.ts` | 29 → 34 项：缺失/非法 transport、content-hub 保险丝、2 个静态门（读源码）。 |
| 本文件 | §11 更新 + 本 §11.15。 |

不改 Rust / capabilities / CSP / 插件；`src/pet/main.ts` 仍 `activeMarketSource = null` 且不 import content-market.ts。

#### 11.15.3 分层防线（从里到外）

1. **模块层**：无全局 fetch 回退；无 transport ⇒ `transport-unavailable`；任何 refresh/download 前都先验证配置与 URL 策略。
2. **客户端层**：没有 transport 的 client `configured === false`；`createRemoteMarketSource(未配置 client)` 的 fetchCatalog/fetchPackBytes 抛 `MarketplaceError`（transport-unavailable）且不触碰网络。
3. **接线层**：`createRemoteMarketRefresh` 对未配置 client 直接返回 unconfigured 状态，零请求。
4. **UI 层**：`canRequestRemoteMarket` 三重条件（configured + 注入 refresh 回调 + 用户显式点击）；默认状态按钮 disabled。
5. **构建层**：静态门断言 content-market.ts 不被任何 pet 生产模块 import（不进入产品 bundle），main.ts 不接 refreshMarket。
6. **CSP 层**：`connect-src` 保持 `'self' ipc:` 不扩域；未来 transport 必须走 Rust 受限下载器/IPC（E6-T4）。

#### 11.15.4 失败码

新增稳定失败码 `transport-unavailable`（`MARKET_FAILURE_CODES`；中文标签「未注入市场传输层（不会联网）」）：

- 配置对象其他字段合法但 `transport` 缺失/null ⇒ configured:false、`configurationFailure.code = transport-unavailable`；所有网络方法返回该码，**零请求**；
- `transport` 类型非法（非函数）⇒ `invalid-config`（配置错误优先）；
- 与 `not-configured` 区分：`not-configured` = 完全没接市场（catalogUrl 等缺失或 UI 未注入 client）；`transport-unavailable` = 市场配置存在但本构建没有出网通道。

#### 11.15.5 验收证据

- `tests/content-market.test.ts` → 34/34 绿（含 5 项 v4 新增）；`tests/content-hub.test.ts` → 54/54 绿（含市场 tab 零请求回归）；
- 静态门断言：无 `globalThis.fetch`/`window.fetch`/`self.fetch`/裸 `fetch()`、transport 默认 null、无 pet 生产模块 import content-market.ts、main.ts 无 `refreshMarket`、`activeMarketSource = null`；
- 失败码列表测试包含 `transport-unavailable`；
- 全仓 `npx tsc --noEmit` → exit 0；`npm run build` 成功且 dist 无 content-market 标记（bundle 保险丝）；
- 全仓 `npm test` → 1204/1211 pass；4 项失败均来自并发中的其它任务/本机 Windows 无 `python3`，与本任务 4 个文件无关（本任务两个测试文件 34/34、54/54 全绿）。

#### 11.15.6 剩余阻塞（不在本任务范围）

宿主 transport（Rust `market_fetch`/IPC 桥）尚未实现——本任务按指示不改 Rust。在 E6-T4 完成前，市场保持 `transport-unavailable`/disabled；这是唯一技术 blocker。真实服务器/catalog 审核/密钥 ceremony/法务仍见 §11.13。

---

## 12. v5（task-103/MB-080）：catalog v0.2 + 防回滚/过期/离线宽限/重试/限流/镜像（2026-11-20）

> 仅离线工程实现：没有真实市场服务器，没有发出任何网络请求。所有协议行为由注入式 `transport` / `now` / `storage` / `sleep` / `random` 在测试中驱动。
> v0.1 目录仍可被 `validateMarketCatalog` 解析（只读兼容），但 `content-market.ts` **拒绝**用 0.1 刷新/安装（`catalog-unsupported`）。

### 12.1 目录 schema：`famling.market-catalog/0.2`

`src/pet/content-library.ts` 新增 `CONTENT_MARKET_CATALOG_SCHEMA_V2`、`ContentMarketCatalogV1 | ContentMarketCatalogV2` 联合类型、`isMarketCatalogV2()`、`validateMarketCatalogV2()` 与 `CONTENT_MARKET_LIMITS`。

| 字段 | 必填 | 校验 / 上限 |
|---|---|---|
| `schema` | 是 | 固定 `famling.market-catalog/0.2`（0.1 只读；按 schema 严格区分允许键） |
| `serial` | 是 | 整数 1..2,147,483,647；防回滚主序 |
| `version` | 是 | SemVer（仅诊断/展示，不参与排序） |
| `updatedAt` | 是 | `YYYY-MM-DD` 或 ISO-8601 UTC |
| `expires` | 是 | `YYYY-MM-DD` 或 ISO-8601 UTC；必须晚于 `updatedAt`，且最多晚 90 天 |
| `offlineGraceSeconds` | 否 | 整数 0..2,592,000（30 天）；客户端还会以自身配置为上限 |
| `retry` | 否 | `maxAttempts` 1..3、`baseDelayMs` 100..15,000、`maxDelayMs` ≥ `baseDelayMs` 且 ≤15,000；缺省字段按协议默认补齐 |
| `rateLimit` | 否 | `requestsPerMinute` 1..60、`maxConcurrentDownloads` 1..4；缺省按协议默认补齐 |
| `mirrors` | 否 | 1..8 个**裸 HTTPS origin**（`https://host[:port]`，无凭据/路径/query/fragment），不得重复 |
| `keyId` / `signature` / `packs` | 是 | 与 0.1 相同的 Ed25519 分离签名字段与 packs 校验（1..256，逐包签名） |

规则：目录 JSON 上限仍为 1 MiB；签名覆盖 canonical JSON（去掉顶层 `signature`）。v0.1 文档出现 v0.2 专有字段会被 `unknown-field` 拒绝，反之亦然。

### 12.2 客户端状态机（`src/pet/content-market.ts`）

**refreshCatalog（fail-closed 顺序）**

1. 配置 / URL 策略检查（HTTPS、无凭据/片段、私网拒绝、可选 host 白名单）——均发生在任何请求之前；
2. 读取 v2 防回滚信封；缺失=首刷，不可读/损坏/旧 v1 信封 ⇒ `storage-unavailable` / `storage-corrupt`，**零请求**；`requireSerialStorage` 默认 true；
3. 读取并**重新校验 + 重新验签**有界缓存（最多约 1 MiB+4 KiB，单 key）；损坏/签名失效/被吊销 key 的缓存直接忽略（缓存不是信任升级）；
4. 通过注入 transport 拉取：自动重试 + 签名镜像回退（见 12.3/12.5）；
5. **仅当失败可重试**（network/timeout/408/425/429/5xx）且缓存与已持久化 serial 完全一致、且仍处于离线宽限期内 ⇒ 返回 `cached:true` 的缓存目录（不改写 serial，不移动防回滚基线）；
6. 解码/JSON 后，`schema === famling.market-catalog/0.1` ⇒ `catalog-unsupported`（拒绝降级安装）；
7. `validateMarketCatalogV2` → `verifyMarketCatalogSignature`（Ed25519 + 信任根状态/有效期）；
8. **过期判定先于回滚判定**：`now <= expires` = fresh；`expires < now <= expires+grace` = 宽限（`stale:true`，仍允许下载/安装）；超过宽限 ⇒ `catalog-expired`（不采用；已安装内容保持可用）；
9. serial 单调性：`incoming.serial < stored.serial` 或同 serial 但 canonical payload SHA-256 不同 ⇒ `catalog-rollback`（幂等重放=同 serial+同 hash 则接受且不重复写）；
10. 只有验签/过期/回滚全部通过才写 v2 serial 信封，再最佳努力写缓存；返回值带 `cached/stale/expiresAt/offlineGraceUntil/attempts/viaMirror`。

**downloadPack / installPack**：目录超过 expires+grace 后一律 `catalog-expired`（不发请求、不调用 unpack/install）；宽限期内仍允许。下载仍只接受**已验签目录条目**的精确 URL，先大小、再 SHA-256、再 Ed25519；镜像回退只改变 origin，校验链不变。

**离线宽限公式**：`offlineGraceUntilMs = expiresMs + min(hostConfig.offlineGraceSeconds, catalog.offlineGraceSeconds)`（目录缺省时用 host 配置，默认 7 天，硬上限 30 天）。

**持久化状态**：`MARKET_SERIAL_STORAGE_VERSION = 2`，信封 `{v:2,data:{serial,catalogVersion,updatedAt,updatedAtMs,catalogSha256,expiresMs,offlineGraceUntilMs,mirrors[]}}`（单 key ≤4096 字符，不存 URL/token/目录内容）。v1 旧信封按 `storage-corrupt` fail-closed，只能走显式 `resetRollbackProtection()`（同时清缓存）。

**缓存**：新 key `desktop-games/pet/content/market/catalog-cache`，信封 v1 存完整已验签目录 + serial/expires/grace/bytes/keyId/keyStatus；读取时重新 validate + verify。写失败只告警（不阻止本次刷新），永不参与信任判断。

### 12.3 重试（transport profile）

- 仅重试：`network-error`、`timeout`、HTTP 408 / 425 / 429 / 500 / 502 / 503 / 504；其余（包括 404、签名/回滚/限流）不重试；
- 最多 3 次（host 配置可降低；目录里的 `retry` 只能让客户端更保守：取更小 attempts、更大 baseDelay）；
- 指数退避 1 s / 2 s + 抖动（0..baseDelay/2，可注入 `random`），总上限受 `maxDelayMs`；
- `Retry-After`（秒数或 HTTP-date）优先于退避，单次延迟硬上限 60 s；调用方 abort 时不重试。

### 12.4 限流

- 客户端滚动 60 s 窗口，默认 5 次/分钟，硬上限 60；
- 签名目录的 `rateLimit.requestsPerMinute` 只能降低 host 预算；`rateLimit.maxConcurrentDownloads` 只能降低 host 并发（默认 1，硬上限 4）；
- 每次 transport 尝试（含重试与镜像尝试）都计入预算；超预算直接 `rate-limited` + `retryAfterMs`，**不触达 transport**。

### 12.5 镜像

- 来源：上一次成功刷新写入 serial 信封的 `mirrors[]`（首刷无法得知镜像，符合规范）；
- 目录刷新：主 URL 重试耗尽后，按 order 尝试 `mirrorOrigin + 主 catalog path`；pack 下载：失败后尝试 `mirrorOrigin + pack path`；
- 镜像 host 来自**已验签 payload**，因此即使配置了 `allowedCatalogHosts` 也允许（仍需通过 HTTPS/私网/重定向策略）；响应仍走完整大小/SHA-256/Ed25519 校验；
- 每个镜像单次尝试（不无限回退），全部失败返回最后一次可重试失败。

### 12.6 新失败码与配置

新增稳定失败码：`catalog-unsupported`（0.1 只读）、`catalog-expired`（超出离线宽限）、`rate-limited`（客户端预算，retryable + retryAfterMs）。`MarketFailure` 新增可选 `retryAfterMs`。

新增配置（全部有默认值/硬上限）：`retry?{maxAttempts,baseDelayMs,maxDelayMs}`、`requestsPerMinute?`、`offlineGraceSeconds?`、`sleep?(ms)`、`random?()`、`catalogCacheStorageKey?`。`MarketplaceClientDescription.limits` 增加 `retryMaxAttempts/requestsPerMinute/offlineGraceSeconds`。

### 12.7 验收证据（2026-11-20 本机实测）

- `node --import tsx --test tests/content-market.test.ts` → **47 tests / 47 pass / 0 fail**（原 34 项全部迁移到 v0.2 fixture；新增 13 项：schema 正/负例、0.1 只读拒绝、过期/宽限/安装门、离线缓存回退与安全失败不回退、坏缓存、v1 信封 fail-closed、重试/退避/Retry-After、限流、目录限流降并发、目录镜像、pack 镜像、缓存刷新 UI 文案）；
- `node --import tsx --test tests/content-pack-v2.test.ts tests/content-hub.test.ts` → **98 / 98 pass**（0.1 目录解析保持向后兼容）；
- `npx tsc --noEmit`：本任务 3 个文件无错误（全仓 tsc 当时被并发任务的未完成 `src/pet/content-runtime.ts` 阻断，与本任务无关）；
- 全部测试使用注入 transport/clock/sleep/random/storage，**未联网**；未改 Rust/插件/content-hub/main；
- 未 commit / 未 push。

### 12.8 明确未做

生产主机 transport（Rust/IPC）、真实服务器/CDN/审核后台、镜像健康探测与主动切换、断点续传/Range、下载进度/取消 UI、密钥轮换 ceremony、v0.1→v0.2 发布端迁移工具、法务复核。
