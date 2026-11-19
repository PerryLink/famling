# Famling / dsh-famling 内容中心与主题市场设计（2026-11-19）

| 项 | 内容 |
|---|---|
| 状态 | **核心模型 + 扩展规范已落地；UI / 安装器 / 远程市场未实现**。本文件是设计决策记录，不含 UI 改动。 |
| 日期 | 2026-11-19（Asia/Shanghai） |
| 任务 | task-48：为 famling + dsh-famling 建集中式内容中心/主题市场的共享数据模型与扩展规范。 |
| 写范围 | 'public/content/library.json'、'public/content/README.md'、'src/pet/content-library.ts'、'tests/content-library.test.ts'、本文件。 |
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

验证证据（2026-11-19）：

- 'npx tsc --noEmit' → exit 0（含新模块与新测试）；
- 'node --import tsx --test tests/content-library.test.ts' → **34 tests / 34 pass / 0 fail**（Windows Node 24.22.1，仓内 node_modules 为 win32 依赖；WSL 下直接跑 tsx 会命中 esbuild 平台不匹配，见 §5.6）；
- 未改 main/UI/plugin；未 commit/push。

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
| Q4 | 远程市场的签名验证实现与密钥 ceremony | 发布/安全任务（P1-1 后续） |
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
