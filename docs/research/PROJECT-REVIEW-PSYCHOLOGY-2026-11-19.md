# Famling / dsh-famling 心理学与人因工程评审（2026-11-19）

| 项 | 内容 |
|---|---|
| 文档 | docs/research/PROJECT-REVIEW-PSYCHOLOGY-2026-11-19.md |
| 日期 | 2026-11-19（Asia/Shanghai） |
| 评审人 | review-psych（子代理，task-60） |
| 范围 | famling / desktop-games 私有仓、dsh-famling 插件仓、只读 DSH checkout（仅作宿主行为参照） |
| 形式 | **只读评审**：未改任何代码/资产/配置，只新增本文件；未 commit/push；未运行构建/测试/E2E；未实机验证 Tauri/WebView2；未调用任何产品 API；外部资料仅作公开检索引用 |
| 快照 | 工作树 2026-11-19 约 12:50–13:05（部分文件正被并行 agent 修改；正文行号以该快照为准，引用时同时给出可搜索原文） |
| 读者 | lead、产品/交互、法务与安全、famling 桌面壳与 dsh-famling 维护者 |
| 性质 | 工程评审与设计建议，**不是法律意见、不是心理诊断标准、不是合规认证**；外部证据为既有文献/标准的转引，未做新的实证实验 |

> 本文所有「影响」「风险」均为评审判断；所有「成本」为人日估算（标注 [估算]）；所有「行号」为静态阅读定位，不构成运行时实测。未复跑的测试不写成已通过；未验证的 Windows 行为不写成已工作。

---

## 0. 执行摘要

**一句话结论**：本项目的**同意/数据控制/安全文案工程在原型产品里属于罕见的高完成度**；真正的心理学与人因风险不在「缺功能」，而在三处错位：

1. **低打扰承诺没有落到产品壳的常驻控制上**：桌面壳把 aside 面板隐藏后，静音、音量、按住说话、改名等控件没有菜单替代；接受 TTS 后同一会话内无法发现式关闭；hero/像素动画是 JS 画布循环，不响应 prefers-reduced-motion，也没有暂停入口。结果是「想安静」只能拒绝下一次 TTS 声明或退出应用。
2. **dsh-famling 的「人格化自由聊天」缺少 famling 已经有的安全地板**：插件有真实 LLM 聊天（输入发送给 DSH 配置的模型），但无危机资源 UI、无 2h/休息提醒、无首启告知、无 About/法律页；其自己的 LEGAL-NOTICE 已如实列出这些缺口。对情感依赖与危机场景，这是全项目最薄弱的一环。
3. **首启在用户读 TOS 之前强制收集自报出生日期，但 roleplay 当前没有公开入口**：数据最小化、同意顺序（先告知后采集）和「一般功能全年龄」的产品口径同时受损；对一个自称「仅用于技术研究与原型验证」的本地工具，这是不必要的敏感数据收集。

**评级（本评审）**：P0 × 3、P1 × 10、P2 × 12。

**最值得先做的 3 件（详见 §9）**：
1. 桌面壳补一个最小「安静控制面」：静音/音量、暂停动效（或安静模式）、暂时隐藏；并让 prefers-reduced-motion 真正停住画布动画。0.5–1 人日 [估算]。
2. 给 dsh-famling 加「轻量安全地板」：输入侧危机关键词的本地资源回复（12356/110/120）、聊天发送去向披露、首启一次性卡片、设置里的清除本地数据/同意。0.5–1 人日 [估算]。
3. 把强制披露从「一堵 1 万字的墙」改成「关键事实层 + 全文可查」；同时把出生日期采集从首启移到 roleplay 入口（或在入口开放前彻底移除）。1–2 人日 + 法务/用户拍板 [估算]。

**不要改坏的资产（正面清单）**：
- 两步确认的「撤回同意 / 删除全部本地数据」，且残留/未核验项如实列出（consent/data-controls.ts）。
- TOS/TTS/ASR 三者独立、不互相替代；每次修改/DLC 加载重弹完整声明；Escape/关闭不构成同意。
- 猫/狗永不走 TTS；人形语音要单独同意；默认声音关。
- 依赖/独占式话术的本地安全规则（safety/local.ts 的 dependency-manipulation）；自伤/危机资源回复（safety/disclosure.ts）。
- 无签到/连续天数/好感衰减/付费亲密；bond 只增不减（kernel/pet.ts）。
- 内容市场 fail-closed、默认不联网、不自动安装；内容包强制 researchOnly 声明。
- Advisers presence 的 22:00–08:00 静默、P0=1/天 P1=3/天的主动消息预算与 secrecy 门控。

---

## 1. 范围、方法与证据等级

### 1.1 评审对象

- famling（桌宠/游戏基座，仓 /mnt/d/Projects/dsh/desktop-games）：pet 页面、desktop-shell、consent 子系统、content-library/content-hub、hero 渲染、hit-regions、Tauri 壳、CI、法务/研究文档。
- dsh-famling（DSH 侧栏插件，仓 /mnt/d/Projects/dsh/plugins/dsh-famling）：client.js、client.content.js、index.js（Host bridge）、content-extension.mjs、LEGAL-NOTICE/DETAIL/README。
- 不做：代码修复、资产/配置修改、构建、E2E、真机测试、法务审核、市场/安全/性能复审（分别见其他评审与既有审计）。

### 1.2 方法与限制

- 静态阅读当前工作树 + 既有研究/审计/法务文档；用 grep/wc 做可复现定位；对 CSS 颜色按 WCAG 相对亮度公式**计算**对比度（不是渲染实测）。
- 未启动应用、未跑 npm test/typecheck、未在 Windows 实测点击穿透/DPI/语音；因此所有「运行时行为」只能表述为「按代码推断」，不能表述为已观测。
- 工作树有并行 agent 改动（README、main.ts、content-hub.ts、content-library.ts 等），行号可能漂移；关键结论尽量同时给出可搜索字符串。
- 证据等级沿用既有研究口径：A=标准/同行评审/官方；B=本项目代码/文档实测或强先例；C=评审建议/待验证。本文未新增 A 级实验。

### 1.3 术语

- 低打扰存在感（peripheral presence）：用户不回应时也感到「在旁边」，但不会被拉走注意力。
- 控制感（sense of control）：可预期地调整强度、频率、声音、可见性、数据与关系边界；可逆。
- 同意质量：用户在知情、可理解、可撤回的前提下作出的具体决定，而不是一次性的长文勾选。
- 情感依赖风险：产品通过内疚、独占、等待、不可替代性等线索，让用户把 AI 当作真实关系或专业支持的替代。
- 研究用途边界：产品与文档把自身限定为研究/原型，避免被当作陪伴产品运营或对外服务。

---

## 2. 现状盘点：已经做对的（建议明确列为「不要改坏」）

| # | 机制 | 证据（快照） | 心理/人因价值 |
|---|---|---|---|
| 1 | 透明窗 + 点击穿透 + 不抢焦点 + 不进任务栏 | app/tauri/src-tauri/tauri.conf.json 的 main 窗口 flags（transparent/alwaysOnTop/focus:false/skipTaskbar）；src/pet/hit-regions.ts:1-30、200-228；main.rs:93-129 | 桌宠是「边缘存在」；不抢焦点、不挡桌面点击，是低打扰的地基 |
| 2 | 桌面壳隐藏 header/aside，只留宠物与气泡 | src/pet/pet.css:342-352（html[data-pet-shell=desktop] header, aside.panel { display:none }） | 产品形态克制；但副作用见 P0-1（控制面也一起被隐藏了） |
| 3 | 每次交互前重查 consent；菜单/组合器/内容中心都 fail-closed | src/pet/desktop-shell.ts:299-316、431-441；main.ts openContentHubFromMenu:1081-1093；content-hub.ts:2206-2239 | 把「不能绕过同意」做成结构，而不是靠自觉 |
| 4 | 同意弹窗：显式勾选 + 按钮；Escape/遮罩不构成同意；焦点陷阱；背景 inert | src/pet/consent/modal.ts:1-15、187-258、297-393；consent/gate.ts:366-401 | 尊重「不」的权利；减少误触同意 |
| 5 | TOS / TTS / ASR 三套独立声明，不互相替代；TTS 每次配置变更/新会话重确认 | consent/gate.ts:605-764；tests/consent*.test.ts | 避免「同意一次，永久豁免」；语音敏感数据有单独门槛 |
| 6 | 撤回同意与删除全部本地数据：二次确认、范围列明、逐项核验、残留如实列出 | consent/data-controls.ts:510-568、596-641；consent/runtime.ts:667-800；docs/audit/DATA-CONTROLS-2026-11-17.md | 用户自主与可逆性的核心；不谎报删除成功是信任资产 |
| 7 | 依赖/独占话术输出过滤器 + 自伤危机资源回复 | src/pet/safety/local.ts:726-736（dependency-manipulation）；safety/local.ts:436-457（self-harm-ideation）；safety/disclosure.ts:130-146 | 对「陪伴型」产品最关键的伦理护栏之一；已有硬规则而不是口号 |
| 8 | Pet Brief 禁用 affection/love/missedyou/streak/guilt 等键，并过滤强制/内疚措辞 | src/presence/pet-brief.ts:186-190、COERCIVE 常量 | 不让外部任务数据把「情感操纵」带进产品 |
| 9 | 无签到/连续天数/好感衰减/付费亲密；bond 只增不减、无死亡 | src/kernel/pet.ts:23、40-65、93-104、372-373；docs/LONGEVITY-AND-RETENTION-2026-11.md:31-35 | 不惩罚缺席、不拿损失厌恶做留存 |
| 10 | Advisers presence：22:00–08:00 静默、P0 1 条/天、P1 3 条/天、secrecy 门控、无 backlog | src/presence/types.ts:56-58；src/presence/projector.ts:13-79、110-114 | 低打扰的正确底座；但目前只覆盖 Advisers，未覆盖其他主动输出 |
| 11 | 内容市场：默认不联网、不自动安装、fail-closed、强制 researchOnly 声明 | src/pet/content-library.ts（无 fetch/network）；src/pet/content-hub.ts:1100-1112、1898-1912；content-extension.mjs:374-381；public/content/README.md | 研究用途边界与供应链安全的第一道闸 |
| 12 | 猫/狗永不走 TTS；默认声音关；Advisers 默认关；telemetry 默认关 | src/pet/main.ts:705-707；client.js:406（dsh-famling 默认 sound:false）；README 隐私节 | 声音是最强打扰通道；默认关是对的方向 |
| 13 | ARIA menu（roving tabindex、Tab 内收、Escape 恢复焦点）、对话框 role/aria-modal、部分 live region、CSS reduced-motion | desktop-shell.ts:289-297、769-795；modal.ts:187-258；pet.css:673-690 | 无障碍不是零基础；缺口见 P1-2/P1-3 |
| 14 | 统一使用限制短句 + 哈希校验 + 多入口登记 | docs/legal/USE-RESTRICTIONS-2026-11-19.md；tests/use-restrictions.test.ts | 研究用途边界有单一事实源，避免各入口各说各话 |

**读法**：这是一份「伦理结构已经搭起来」的原型；下一阶段的重点不是再加安全声明，而是让已有的安全/控制真实可用、可理解、不互相矛盾。

---

## 3. 六维评估（结论 + 指向）

> 评级是评审判断，不是测量分数。A/B/C/D 只表示「当前离可外部发布/可被脆弱用户使用有多远」。

| 维度 | 现状 | 主要缺口 | 评级 |
|---|---|---|---|
| 低打扰存在感 | 透明、穿透、不抢焦点；famling 无周期性主动气泡；Advisers 有 quiet hours/预算 | 桌面壳无静音/音量/暂停/隐藏；插件微动作与气泡默认较密、无 quiet hours | B- / C+（插件） |
| 控制感与可逆性 | 撤回/删除/缩放/角色/内容中心/记忆簿都可逆；数据控制强 | 声音控制不可发现；2h 计时跨窗口缺失；roleplay 设施死链；实验性内容入口与开发入口混在用户菜单 | B- |
| 同意质量 | 结构严谨、不可绕过、每动作重弹 | 1 万字全文 + 36vh 滚动区 + 11px 字；先采集出生日期后读 TOS；roleplay 条款与无入口能力不对等 | C+ |
| 情感依赖/关系边界 | 无签到、无衰减、有依赖话术过滤、危机短语 | 软性「等待/留灯」文案；插件人格聊天无危机/健康地板；无依赖信号的轻量自检；2h 只在 pet 页 | C+ |
| 研究用途边界 | canonical 使用限制 + 哈希 + 测试 + 内容包 researchOnly 硬门 | 产品体验与研究口径存在张力；famling「无自由 LLM 对话」与插件真实 LLM 聊天跨产品口径冲突；文档漂移 | B- |
| 无障碍 | 部分 ARIA/焦点/reduced-motion/对比达标 | 屏幕阅读器听不到气泡；宠物不可键盘聚焦；画布动画不尊重 reduced-motion；关键法律文本 7–11px；文字缩放不覆盖同意/关于/内容中心 | C- |

---

## 4. 问题清单

### 4.1 P0（建议在任何对外分发/演示给非项目成员前修复）

#### P0-1 产品壳没有静音/音量/暂停动效/暂时隐藏的常驻控制；接受 TTS 后同一会话内无法发现式关闭

**现象（按代码推断）**
- 桌面壳隐藏了 aside.panel（pet.css:351-352），而静音、音量、按住说话、改名、复位窗口、语音缓存等控件都在 aside.panel 里（pet.html:63-91）。
- 右键菜单（desktop-shell.ts:607-714）没有「静音」「音量」「暂停动画」「隐藏」任何一项；只有「TTS 声明与语音确认…」会打开声明，而不是开关。
- TTS 声明确认后，同一 config 在同一会话内 ensureTts 直接返回 true（consent/gate.ts:639-647）；用户想停，只能再次打开 TTS 声明并拒绝（语义是「拒绝声明」而不是「静音」），或退出应用。（严格说，菜单末尾的「完整面板（开发/E2E）」可切到 window 壳并找到静音，但这是开发入口、会改变布局，不应作为产品控制路径。）
- hero 动画由 requestAnimationFrame 驱动（src/pet/hero.ts:328-330；main.ts:2417-2449、2500-2504）；prefers-reduced-motion 只在 CSS 层折叠 transition/animation（pet.css:673-690），JS 画布循环完全不读取该媒体查询（grep src/pet 无 matchMedia/prefers-reduced-motion 的使用）。
- 产品壳没有帧动画/动效开关；设置页 setup.html 也没有。插件反而有「帧动画」开关（client.js:948-951 附近）。

**心理/人因影响**
- 对前庭敏感、焦虑、ADHD、需要低刺激环境的用户，「一只一直在动且关不掉、还可能突然说话」的桌面常驻物是不可用而不是不好用。
- 控制感（Burger & Cooper, 1979；见 PET-UX-PSYCHOLOGY-2026-11-18 §3.3）是可预期性与信任的核心；当「安静」需要拒绝一份法律声明才能实现，用户学到的是「没有真正的控制」。
- WCAG 2.2.2 Pause/Stop/Hide（A 级）针对自动开始、持续 >5 秒、与其他内容并行的移动信息；桌面宠动画属于典型场景。WCAG 2.5.8 还要求指针目标至少 24×24 CSS px，而 About 按钮 22px、菜单按钮 min-height 22px（pet.css:482、965-975），处于临界/不达标区。
- TTS 是不可预期打扰（用户可能忘记自己曾同意）；无法一键静音会直接导致卸载或关闭应用。

**建议**
1. 在右键菜单一层加「声音：开/关」与「音量…」（或子菜单），状态持久化；与现有 muted 状态同源。
2. 加「安静模式（暂停动效 + 不主动气泡）」开关；或拆成「暂停动效」「安静气泡」两项，默认值不变；用 prefers-reduced-motion 决定首次默认（reduce 时动画静止，只保留可选中状态）。
3. 加「暂时隐藏 1 小时 / 直到明天」菜单项；实现方式可用隐藏窗口 + 定时恢复，或最小化为仅托盘（若无托盘则直接 hide + 菜单热键恢复；注意不要变成无法找回）。
4. 让画布动画消费 reduce 设置：在 hero/runtime 层读取 matchMedia('(prefers-reduced-motion: reduce)')，reduce 时停在 idle 第一帧或改为低频帧；同步停止待机抽帧。
5. 不要改坏：aside.panel 的 E2E 选择器与 DOM 保留；新增控制通过菜单调用既有函数，不用新窗口。

**验收（可测试）**
- 菜单 DOM 测试包含 sound/volume/motion/hide 四项；点击后 localStorage 状态写入；TTS 播放前检查 muted 直接走字幕。
- 新增单元测试：在 fake window.matchMedia 返回 reduce 时，hero 不起 rAF 或只渲染一帧；退出 reduce 后恢复。
- 手工验收（未在本评审执行）：接受 TTS 后，从菜单两次点击内静音并确认不再出声；开启安静模式后 1 分钟内无气泡/无帧动画。

**成本/风险**：[估算] 0.5–1 人日；低风险。风险点：hide 后如何恢复（需菜单外恢复路径或托盘/热键）；建议先做静音/动效，隐藏单独评估。

#### P0-2 dsh-famling 的人格化自由聊天缺少危机/健康/可见告知地板

**现象**
- 插件有真实自由 LLM 聊天：client.js:806-827 发送 op:chat；index.js:158-185 调用 ctx.llm.stream，system prompt 是汀岚/猫/狗人格（index.js:22-27）。其 LEGAL-NOTICE 自己写明「插件有真实 LLM 聊天，所以不能写不提供自由 LLM 对话」（docs/LEGAL-NOTICE-2026-11-18.md:52）。
- LEGAL-NOTICE 已如实列出缺口（同文件 :27、:123-127、:168-172）：无首启告知、无 About/法律页、无危机资源 UI、无每次回复/播放的 AI 标签、无版本化同意记录、无清除本机数据按钮。
- 插件代码中没有 12356/110/120 危机资源文案（grep 无命中）；没有 2h 提醒/休息提示；输入面板的 AI 声明只说「是 AI 生成、不是真人；不提供自由 LLM 角色扮演或情感陪伴」（client.js:918、944），没有说明「文本会发送给你在 DSH 配置的模型供应商」。
- LEGAL-NOTICE 的版本表头仍写「适用插件版本 0.8.5」，而 package.json/README 是 0.10.0（文档漂移，另见 P1-6）。

**心理/人因影响**
- 这是全项目最接近「AI 陪伴」的表面：用户在侧栏和汀岚/猫/狗自由聊天，聊孤独、压力、自伤想法的概率不低；没有危机资源、没有「这是 AI 不是真人」的重复提示、没有休息边界，正好命中 AI 陪伴研究中最常报告的风险：模拟需求、平台变更带来的关系破裂、依赖与误读（参见系统综述 Friends, lovers, and companions, 2026, ScienceDirect S2949882126001374；MIT Media Lab/OpenAI 2025 的孤独与依赖相关性报道，转引自 PET-UX-PSYCHOLOGY-2026-11-18 §2.3）。
- 没有首启告知意味着用户可能不知道聊天会出网/发给模型供应商；这既是隐私也是知情同意问题。
- 与 famling 的「工作助手/非陪伴」边界不一致：同一品牌，一个端有严格 TOS/年龄/危机/健康门，另一个端没有。用户会把两端当成同一产品。

**建议（轻量、不做全家桶）**
1. 在 Host 侧（index.js，模型调用前）加本地危机关键词检查：自伤/自杀/轻生/想死/结束生命等，命中时不调用模型，直接返回固定资源文案（12356、110/120、可信任的人/专业机构），并记录最小审计（不存原文）。可直接复用 famling 的 safety/disclosure.ts 文案思路，但不要跨仓复用运行时。
2. 在输入面板和设置面板的 AI 声明里加一句：「聊天文本会发送给你在 DSH 中配置的模型供应商；不要把密码、他人隐私、客户资料发进来。」（中英）。
3. 加一个一次性首启卡片（可关闭、非阻断）：这是技术演示插件；无记忆/无主动推送；聊天走你的模型；不是陪伴/roleplay 产品；危机请拨 110/120、12356；设置里可清除本机设置/同意。
4. 设置面板增加「清除本机设置与同意」按钮（清 dsh-famling/settings、consent 保留键；DSH 会话数据以宿主为准）。
5. 如果短期不做 1–4，至少把插件从「人格化自由聊天」降级为「工作助手模板/命令」或在 README/设置显著标注这是未完成的研究原型，不作为陪伴使用。此项需要产品拍板（见 §11）。

**验收**：输入含自伤关键词时，返回固定危机资源且不调用 ctx.llm.stream（可单测）；输入面板含发送去向句；首启卡片只出现一次且可关闭；清除按钮清空两个 localStorage 键并回读核验。

**成本/风险**：[估算] 0.5–1 人日；低风险。风险：本地关键词误报率与语言覆盖；建议先做高精度词表 + 明确「不是诊断」。

#### P0-3 首启在读 TOS 之前强制自报出生日期，但 roleplay 当前没有公开入口

**现象**
- consent/gate.ts:376-384 的顺序注释是「age self-report -> TOS -> app」，runBootstrap 先 ensureAgeVerification 再读 TOS；年龄未完成则只读/退出（gate.ts:327-332）。
- 年龄弹窗在 TOS 之前出现，文案写「首次启动：在阅读并同意 TOS 之前，必须先由你本人选择出生年/月/日」（modal.ts:436-443）；拒绝/取消即安全只读（modal.ts:534-548）。
- 但 roleplay 当前没有公开入口：pet.html 没有 about-roleplay 节点；main.ts:3231-3239 的绑定是 optional chaining 且源码注释自认「public element intentionally absent」；README 也写「不提供自由 LLM 对话或情感陪伴」「不公开宣传 roleplay」。
- 年龄核验记录存 localStorage（consent/age.ts:42-47；隐私声明说仅本机、可删），一般功能全年龄可用，唯一消费年龄的是 roleplay 门禁与 About 年龄段展示（grep isAdult/isAgeVerified 仅 consent 内部与 About）。

**心理/人因影响**
- 对「一般功能全年龄可用」的本地工具，首屏先要求所有用户交出出生日期，是**不必要的敏感数据收集**（PIPL 意义上的最小化问题，也是研究伦理问题）；用户无法判断这个数据为什么必须给、给了会怎样，容易产生被审查/被记录感。
- 顺序倒置：先采集，再告知（TOS 在其后）。即使年龄弹窗自己有数据说明，整体体验仍是「先交数据后看条款」，削弱同意的自愿性。
- 拒绝即只读会制造强制感（reactance；Steindl et al., 2015），对一个研究原型来说没有必要。
- 与「仅用于技术研究与原型验证」的定位冲突：研究原型不应为未公开功能向所有试用者收集敏感信息。

**建议**
1. 首选：在 roleplay 入口真正公开之前，移除首启年龄核验；把年龄核验移到「开始 roleplay」动作之前（gate 已有 requestRoleplay 的 age-required/minor 分支，改造面小）。这样一般功能不再采集出生日期，roleplay 开放时仍能 18+ 门禁。
2. 若产品/法务坚持首启核验：把它移到 TOS 之后，并在弹窗顶部用一行说清「为什么现在需要」与「不用于什么」，同时提供「不填写也可使用一般功能」的路径（如果合规允许）。
3. 数据最小化：只保存年龄是否满 18 的布尔/年龄段而非完整出生日期（当前保存完整日期，虽然仅本机）；或在 roleplay 开放时再提升到完整日期。
4. 文档：同步修改 README/PRIVACY/CONSUMER-MINORS-HEALTH 中「首启自报出生日期」的描述，避免与实际入口不一致。

**验收**：首次启动不出现年龄弹窗；一般功能可用；roleplay（若通过内部测试入口）仍被 18+ 门禁阻止；删除全部数据仍清年龄记录（若保留）。

**成本/风险**：[估算] 0.5 人日（若移除）；1–2 人日（若改为入口前置 + 文案/文档同步）。风险：法务/用户此前已拍板首启核验；本建议需用户重新拍板，不应擅自实施。

---

### 4.2 P1（发布前应修复或明确接受）

#### P1-1 首启同意是「1 万字全文 + 36vh 滚动区 + 11px 字」，缺少关键事实层，实际可读性低

**证据**
- src/pet/consent/terms.ts:578 渲染 TOS_TEXT；镜像 docs/legal/TOS.md 当前 173 行、约 1.04 万字符、18 个二级节（wc -l/wc -m/grep 计数）。
- 同意弹窗样式：.consent-dialog font-size 12px（pet.css:731）；.consent-tos max-height 36vh、内部 p/li 11px（pet.css:788-810）。pet 窗口 480×336，36vh ≈ 121px，11px/1.55 行高 ≈ 17px/行 → 约 7 行可见；按 40 字/行估算全文约 260 行、约 30–40 屏滚动 [按 CSS/文本量估算，非实测]。
- 每次修改/导入/DLC/TTS/ASR/roleplay 都重新展示完整文本或对应声明（gate.ts:609-632、639-690；modal.ts 各 dialog）。
- APP-DISCLOSURE-TEXTS.md:28 定义的 firstRun.body「1 屏关键事实」明确标注「未实现（首启=完整长 TOS）」；:67 的 health.2h.confirm 按钮文案也未接。

**影响**：长文 + 小字 + 多次重复会训练用户「不看就勾」，同意从 informed 变成 click-through；真正重要的风险（AI 非真人、语音出网、危机资源、数据删除）被淹没。这是同意质量的核心问题，而不是「文案不够全」。

**建议**：保留完整 TOS（不可删除，满足「每次修改须展示完整声明」的要求），但在完整文本之前加一屏/一卡「关键事实（5 条）」：
1) 这是 AI 原型，不是真人、不是陪伴/治疗/专业建议；
2) 默认本地；开启云 TTS/ASR 会把文本/音频发给服务商并可能产生费用；
3) 危机时拨 110/120、12356，本应用不能代为求助；
4) 数据可撤回/删除；删除结果会列出残留；
5) 可随时关闭/退出；角色扮演当前未公开/仅本地模板（按实际能力写）。
关键事实用 12–14px、≥4.5:1；完整 TOS 仍在可滚动 region 中，勾选与按钮语义不变。
同时把「每次动作重弹」从「重复全文」改为「动作摘要 + 完整文本可展开 + 仍保留原文 region」（法律要求的是展示与确认，不是让用户重复滚 30 屏；此改动需法务确认）。

**验收**：首启第一屏（无需滚动）可见 5 条关键事实；完整 TOS 可键盘滚动；勾选不预选；Escape=拒绝；新增 DOM 测试断言关键事实先于滚动区与勾选框。

**成本/风险**：[估算] 1–2 人日 + 法务确认；中风险（涉及同意流程与 TOS 版本/哈希；改文案需 bump 版本并重算，可能触发既有用户重同意）。

#### P1-2 强制披露与关键设置的字号/对比度/缩放不达标

**证据（静态计算）**
- .note 颜色 #6a5a48 在 #1b1410 上 = **2.75:1**；在 #12100e 上 = **2.86:1**（按 CSS 常量计算）。.note 用于 About 面板大量重要说明，包括使用限制、AI 声明、健康/危机、数据控制说明（pet.html:139-214）。
- 使用限制 About 段本身就是 p.note（pet.html:140-143），字号 .note=7px（pet.css:87），仅靠 inline 红边强调；与之对照，首启 consent 弹窗的红色使用限制块是 12px 且前景 #7a1f1a/背景 #fff6f5（modal.ts:284-353），对比更高。
- About 面板的按钮 font-size 9px、min-height 22px（pet.css:965-975）；健康提醒按钮 min-height 22px、font-size 10px（pet.css:916-926）；菜单条目 min-height 22px、font calc(9px * --ui-scale)（482-485）。
- 文字缩放只作用于部分选择器：desktop-shell.ts:403-411 写 --ui-scale；pet.css 中使用 --ui-scale 的主要是 bubble/menu/setup-notice/composer/result card（384、394、485、584-663），consent/about/content-hub 全部固定 px（717-733、897-926、940-975、1000-1013、1045-1131）。用户把「文字大小」调到 200% 时，最重要的 TOS/隐私/健康文本不变。
- 内容中心卡片元数据 8–9px、标签 8px（pet.css:1111-1130、1187-1199），在 480 窗口内阅读负担大。

**影响**：需要放大文字的用户无法把关键安全文本放大；低对比把「必读」变成「看不清」；About 是用户查找撤回/删除/危机说明的主要入口（菜单也有撤回/删除，但没有解释），却在 7px/2.86:1 下呈现。WCAG 1.4.3（对比 4.5:1）、1.4.4（文本缩放 200%）、2.5.8（目标 24×24）均不满足或临界。

**建议**：把文字缩放做成真正的全局层（至少覆盖 consent/about/content hub），并设最小字号 12px（法律文本建议 13–14px）；.note 提升到 ≥4.5:1；About 危险/安全按钮 ≥24px 高。保留紧凑的宠物/菜单视觉，但「读的内容」和「点的危险按钮」必须达到可读/可点标准。

**验收**：CSS 静态断言：consent/about/content hub 的选择器使用 --ui-scale 或最小 font-size ≥12px；.note 对比计算脚本 ≥4.5:1；按钮 min-height ≥24px；对比计算脚本进 CI（可做纯 Node）。

**成本/风险**：[估算] 1–2 人日；中风险（视觉回归；480 窗口内容可能溢出，需要滚动）。收益高，不是重构。

#### P1-3 操作无障碍：气泡没有 live region、宠物不可键盘聚焦、画布不尊重 reduced-motion

**证据**
- #bubble 是普通 div（pet.html:61），没有 role=status/aria-live；而设计文档明确要求「气泡 aria-live=polite 只播用户触发文字」（docs/DESKTOP-PET-UX-2026-11-16.md:127-132；PET-UX-PSYCHOLOGY-2026-11-18 §6.5）。
- #pet 是 div id=pet class=fold-pet title=摸摸它（pet.html:44）：无 tabindex、无 role=button、无 aria-label；设计稿却写了 tabindex=0 role=button aria-label（DESKTOP-PET-UX-2026-11-16.md:128）。键盘用户无法聚焦宠物本体完成摸头。
- hero canvas 无 aria-label/替代文本（pet.html:53）；像素动画是 JS 驱动，reduce-motion 不生效（见 P0-1）。
- 插件：宠物按钮键盘 Enter 触发 click 时，clickArtPoint 拿不到 offsetX/offsetY，clientX/clientY 为 0，映射为负坐标 → return null → 无反应（client.js:312-332；onPetClick 698-721）。插件也没有 prefers-reduced-motion（grep 无 matchMedia），只有手动「帧动画」开关且默认开（client.js:406、948-951）。
- 插件尾巴热区在 72px 显示下约 19.5×25.5 CSS px（prior research §5.3），低于 WCAG 2.5.8 的 24×24；无 hit slop。

**影响**：屏幕阅读器用户听不到角色的任何回应；键盘用户无法完成核心互动；前庭/感官敏感用户无法让动画停下。对一个「陪伴/存在感」产品，这等于把一部分人排除在核心体验之外。

**建议**：给 #bubble 加 role=status + aria-live=polite + aria-atomic=false（仅用户触发/交互台词；ambient 默认关）；给 #pet 加 tabindex=0 role=button + aria-label（Enter/Space=摸头，Shift+F10 菜单）；hero canvas 加 aria-label=「汀兰/猫/狗，桌面宠物」；reduce-motion 时停画布/只保留静态帧；插件 Enter 无坐标时回退到「摸头」或打开互动面板，并加 hit slop；插件默认读取 prefers-reduced-motion。不要给 ambient 气泡用 assertive。

**验收**：DOM/fake DOM 测试断言 #bubble 的 role/aria-live、#pet 的 role/tabindex、hero canvas aria-label；键盘 e2e（或 fake dispatch）Enter 触发 pat；插件 hit slop 单测 + Enter 回退单测。

**成本/风险**：[估算] 0.5–1 人日；低风险。注意 aria-live 过频会反噬（只播用户触发；ambient 不播或合并）。

#### P1-4 语音透明度和控制：TTS 的 AI 标识在桌面壳不可见；ASR/PTT、静音、音量、改名在桌面壳无入口

**证据**
- #voice-mode 的「语音：预生成/系统 TTS · AI 合成」徽标在 aside.panel（pet.html:85），桌面壳隐藏 aside（pet.css:352）→ 播放时无可见 AI 语音标签；About 只说「不在界面常驻浮标」（pet.html:149-153）。
- APP-DISCLOSURE-TEXTS.md:65-66 的 ai.label.audio.player / ai.label.audio.start 均标「未接」；AI-LABELING.md §0 也承认播放器/音频层标识未落。
- 同一隐藏 aside 还带走了 #talk（按住说话）、#mute、#vol、#rename、#reset-window、#voice-cache；菜单没有这些替代项（desktop-shell.ts:607-714）。菜单只有「TTS 声明与语音确认…」和「模型 / API Key 设置…」。
- 结果是：桌面壳用户能听（若同意）但不能静音/调音量；能看但不能说话；不能改名；不能复位窗口。

**影响**：语音是 AI 合成这一点在「听」的当下不可见，降低 AI 披露的显著性；用户对声音/麦克风/唤醒没有即时控制，违反「可预期/可关闭」的低打扰原则；隐藏功能让 README/产品文案与体验不一致（用户找不到「按住说话」）。

**建议**：在菜单加「声音：开/关」「音量」「按住说话…」「改名…」「复位窗口」；播放时在气泡或菜单标题显示一行 12px「AI 语音 · 合成（不是真人）」；首次播放加一次口头/文字提示（canon）；标注 audio label 与 TTS 配置变化时重弹的既有逻辑不变。若产品决定不开放 PTT，则 README 与 About 删除「按住说话」承诺，避免虚假能力。

**验收**：菜单 DOM 测试包含新项；TTS 播放时存在可见 label 节点，字号/对比达标；ASR 入口仍先过 ASR 独立声明。

**成本/风险**：[估算] 0.5–1 人日；低风险。注意不要把「按住说话」做成默认全时监听。

#### P1-5 2h 健康提醒不完整：只在 pet 页计时、页面隐藏即暂停、重启清零、游戏窗口无提醒；按钮文案与依赖/危机机制缺失

**证据**
- startHealthReminder 只在 src/pet/main.ts:3420 调用；内部每 tick 检查 doc.visibilityState === hidden 就 return（consent/runtime.ts:978-1006）→ 最小化/切到其他窗口/隐藏时不计时；计时不持久化，重启清零。
- 产品路由在同意后会关闭 pet 窗口并打开游戏窗口（docs/audit/RESOLUTION-CONSENT-GATE-2026-11-19.md §1.3）；游戏页没有 startHealthReminder（grep 仅 main.ts）→ 在一次 2 小时的 aquarium/stall/town 会话中，不会有休息提醒。
- 提醒按钮文案是「休息并关闭提醒」（modal.ts:1126），容易被读成永久关闭；canon 目标文案是「休息一下（2 小时后仍会提醒）」（APP-DISCLOSURE-TEXTS.md:67，未接）。
- 2h banner 用 role=alert（modal.ts:1120-1124），又设 aria-live=polite，语义冲突（alert 期望 assertive）；健康提醒提到「每满 2 小时再次提醒（不能彻底关闭）」（terms.ts:561），但依赖信号识别明确写「尚未启用，仅保留固定 2h」（terms.ts:297）；crisis.card / health.dependency 在 APP-DISCLOSURE-TEXTS.md:143 仍列未实现。
- famling 不是没有危机资源：safety/local.ts:436-457 的 self-harm-ideation 会走 safety/disclosure.ts:130-146 的 12356/110/120 文案（trust.ts:222-223），这是一条应保留的防线；缺的是「独立危机卡」与跨入口的一致性。

**影响**：对「工作一整晚」的真实使用场景，2h 提醒恰好在最需要时（游戏/后台）失效；session-only 计时让用户可以通过重启规避；「关闭提醒」文案可能让用户以为关掉了义务；依赖风险只有固定 2h 一条，且无轻量自检。

**建议**
1. 计时改成持久化时间戳（localStorage 或 Rust 侧），跨 pet/游戏窗口共享；页面隐藏按「无输入超过 10–15 分钟才视为中断」的 canon 口径（APP-DISCLOSURE-TEXTS.md:121），而不是一隐藏就暂停。
2. 游戏窗口也接同一健康计时（或由 Rust 宿主统一计时）。
3. 按钮文案改为「休息一下（2 小时后仍会提醒）」；加「10 分钟后再提醒」选项；不加永久关闭。
4. role 改为 status + polite（非 alert），或 alert + assertive 二选一；不要两者混用。
5. 危机卡：在 About 常驻资源之外，出现危机信号时显示独立、可复制的资源卡（110/120/12356 + 身边可信任的人/专业机构），并停止个性化/角色化输出；famling 已有危机文案，把它升级为结构化卡片即可。
6. 依赖自检（不做画像）：可选的「最近是否只和 AI 聊」自评 + 现实社交提示（canon health.dependency），触发频率低、可跳过，不采集内容。

**成本/风险**：[估算] 1–2 人日（计时 + 跨窗口 + 文案）；危机卡额外 0.5–1 人日。风险：持久计时涉及隐私（只存时间戳，不存内容）；跨窗口需要 Rust/前端协调，需测试。

#### P1-6 法务/声明文档与实现漂移，削弱知情同意的可信度

**证据（具体矛盾）**
- README.md:243 说「ASR 会录音上传 DeepSeek（当前无告知/同意）、无撤回/全清入口」，但代码已实现 ASR 独立声明与前置门禁（main.ts:1611-1655；consent/asr.ts）与撤回/清空（consent/data-controls.ts）。
- docs/legal/PRIVACY.md:36 仍写 ASR「无告知/无同意/无开关/无配额」；:74-79 写「删除全部：无」，但同一文件 :58 与隐私清单 :64 又写已提供；:75 写「撤回同意：已提供」却与 :74 的「删除全部无」并列，内部自相矛盾。
- docs/legal/RELEASE-BLOCKERS.md:4 写「用户已拍板年龄口径为全年龄、不设年龄门」，与 README/terms.ts 当前「一般功能全年龄，roleplay 18+，首启自报出生日期」矛盾。
- docs/legal/APP-DISCLOSURE-TEXTS.md:57-59 写 ASR「未实现/当前 PTT 直接上传，无告知/同意」，与代码现状相反。
- dsh-famling docs/LEGAL-NOTICE-2026-11-18.md:3 写适用插件 0.8.5，而 package.json/README 是 0.10.0（内容中心/角色 bundle 等能力未反映）。
- 这些不是「文案小错」：它们是用户/法务/审计判断「是否已经告知、是否可撤回」的依据；一处说无、一处说有，等于没有可信的告知。

**影响**：知情同意的核心是「用户能知道真实发生了什么」；文档漂移会让用户无法判断，也让 release gate 失效（RELEASE-BLOCKERS 自认 legal-check 不扫 TOS/PRIVACY/DECLARATIONS）。研究用途/合规叙事一旦被证明不准确，修复成本远高于现在。

**建议**：建立单一事实源与自动生成/校验：
1. terms.ts 生成 TOS.md/TTS/ASR/roleplay 文本（已有 renderLegalText 与 hash 测试），docs/legal 与 public/legal 全部由脚本生成，禁止手改（USE-RESTRICTIONS 已采用此模式，可复制）。
2. 加 CI 门禁：legal-check --strict 扩展到 TOS/PRIVACY/DECLARATIONS/README 首屏；版本/hash 与 terms.ts 一致；README 能力句与代码事实对照（至少 ASR/删除/年龄三条字符串测试）。
3. README 的「已知发布阻断」段改为自动生成的「当前实现状态」或加显式日期/版本；不要手写会漂移的现状。
4. PRIVACY 与 RELEASE-BLOCKERS 增加「本文件事实时点」并在 CI 检测超期/被引用版本不一致。

**成本/风险**：[估算] 1–2 人日；中风险（生成器改造文档布局）。收益：把「法务文档」从会漂移的散文变成可验证资产；这是同意质量的基础设施。

#### P1-7 情感文案与健康目标冲突：等待/留灯暗示；夜间无安静默认；软性内疚不在过滤范围

**证据**
- 启动问候：「你回来了。书页一直停在这里。」（main.ts:2190）；深夜：「……这么晚。我给你留了灯。」（main.ts:2203-2204）；「你忙你的，我在这里。」（main.ts:2204 与 lines.idle:524）。
- safety/local.ts:726-736 的 dependency-manipulation 只匹配硬操纵（只有我懂你/不要离开我/只属于你等）；「留了灯/一直停在这里/手别走」不触发；这些是软性等待/挽留线索，长期+深夜会变味（PET-UX-PSYCHOLOGY-2026-11-18 §6.6 已把这类列为灰区）。
- 夜间只有视觉 sleepy（main.ts:814-822）与一个问候，没有 quiet hours 声明；「夜间默认安静」在 README:241 被提到，但代码中没有夜间静默/降频逻辑（grep quiet 仅内容中心的 dialogue 语义与 presence）。
- 健康目标要求「不制造内疚/不诱导依赖」；同一条深夜问候又在强化「它在等你、留灯」的关系脚本，语义冲突。

**影响**：对孤独/夜间使用的用户，这类文案是最容易产生义务感与情感依赖的微线索；它不需要「想你/别走」那么露骨就有效。尤其与 2h 健康提醒并列时，产品同时在说「该休息」和「我在等你」，信息不一致。

**建议**
1. 文案层：夜间改为低唤醒、无挽留：「这么晚还在呀。早点休息，明天见。」；回来问候去掉等待暗示：「你回来了。」/「书页翻到你上次那页。」；「手别走」只在狗角色且低频保留（狗的身体社交），人形/猫不用。
2. 加 quiet hours：22:00–08:00 只保留视觉在场与用户主动触发的回应；不主动起新话题；若未来有主动消息，沿用 presence 的 22–8 + 日预算。
3. 把软性灰区词加入内容评审清单（不一定要硬 block，但需人工评审/抽样）：等、留灯、一直、别走、想你、回来、别丢下、只有你。
4. 情绪检查：不要用「宠物需要你」制造存在感；用「它有自己的事」制造存在感（prior research §3.2/§6.6）。

**验收**：文案单元测试对夜间/回归台词做黑名单断言（至少不含「等你/留灯/别走/一直停在这里」）；聊天路径不回归；操作者可用内容中心 quiet 模式降低主动气泡。

**成本/风险**：[估算] 0.5 人日（文案）+ 0.5 人日（quiet hours）；低风险。风险：改动可能被视为「人格变冷」，建议只改深夜/等待句，保留日常温度。

#### P1-8 dsh-famling 的低打扰/无障碍默认值不足：微动作与气泡较密、无 quiet hours、无 reduce-motion、无隐藏、键盘与目标尺寸问题

**证据**
- 默认 settings：sound:false, motion:true, bubble:true（client.js:406）；微动作每 11–20s 随机（client.js:568-578）；眨眼每 3.6–6.2s（563）；环境/动作气泡默认随 settings.bubble 显示，3.2s 消失（619-628）；没有 quiet hours/夜间/主动消息预算（grep 无 quiet/silent 相关逻辑，仅 dialogue quiet 模式把 ambient 概率降到 35%：client.js:76-81）。
- 没有隐藏/收起/仅角色模式；插件始终注册在 sidebar.footer.action（client.js:1029-1033），只能通过卸载/禁用插件或宿主 UI 控制。
- 无 prefers-reduced-motion（grep 无 matchMedia）；帧动画默认开。
- 键盘 Enter 在宠物按钮上 no-op（见 P1-3）；面板的关闭按钮有焦点，但无完整 Tab 焦点陷阱；内容中心 tablist 有 role=tab 但无方向键/aria-controls（client.content.js:306-315）。
- 按钮 font:inherit（11px）+ padding 4px 7px（client.js:394-399、1020-1023）→ 高度约 21–23 CSS px，低于 24×24 的 AA 目标（WCAG 2.5.8）。
- 正面：切角色会 cancel speech（client.js:734-736）；猫/狗永不 TTS；brief 失焦自动隐藏（client.js:606-615）。

**影响**：DSH 是工作环境，侧栏常驻一个每 11–20 秒动一下、偶尔冒泡的角色，比独立桌面壳更容易打断；没有 quiet hours 与隐藏意味着「低打扰」只在单次交互内成立，而不是在工作时段成立。键盘/目标尺寸问题让插件对键盘用户和精细操作困难用户不友好。

**建议**
1. 设置里加「安静时段（22:00–08:00 自动静止/不冒泡）」与「仅角色（隐藏四个按钮，悬停/点击才出现）」；默认保持现状或更安静（建议 ambient 气泡默认关，交互触发才说话）。
2. 首次读取 prefers-reduced-motion；reduce 时默认关 motion，或至少把 micro-action 间隔拉长到 ≥60s。
3. 宠物按钮 Enter/Space 回退到摸头或打开互动面板；加 6 art px hit slop。
4. 面板焦点陷阱 + Escape + 焦点返回；tablist 加方向键与 aria-controls；目标尺寸 ≥24px。
5. 内容中心设置里的按钮字号/间距在 300px 面板内保持可读（≥12px 或按 DSH 字号缩放）。

**成本/风险**：[估算] 1–1.5 人日；低风险。风险：需要 DSH 宿主 UI 的插槽约束验证；quiet hours 需用户可配置。

#### P1-9 roleplay 设施与公开能力不一致：TOS/About/审计保留大量 roleplay 条款，但产品没有公开入口

**证据**
- pet.html 没有 roleplay 入口（grep 无 about-roleplay 节点）；main.ts:3231-3239 的绑定是 optional chaining，源码注释明说「public element intentionally absent」。README:240 说「不提供自由 LLM 对话或情感陪伴」、roleplay 仅内部保留。
- 但 TOS 文本包含多节 roleplay 18+ 条款（terms.ts:470-544 等），About 页面也渲染 roleplay 声明节与状态（consent/runtime.ts:474-502），虽然 DOM 节点缺失时为空；用户会从 TOS/About 文案推断「有 roleplay 这个功能」，然后找不到入口。
- APP-DISCLOSURE-TEXTS.md:16 R5 仍把 roleplay 作为常驻入口/横幅描述；这与「无公开入口」的现状不一致。

**影响**：同意文本承诺/约束了一个用户无法使用的功能，增加阅读负担与困惑；对研究原型而言，「文档里有的能力」应可被用户验证，否则会产生「是不是藏起来了」的不信任。另一方面，如果未来重新开放入口，年龄/声明/表单门禁已在位，是资产。

**建议**：二选一，明确写进 README 和 About：
A) 保留内部门禁但公开能力移除：TOS 把 roleplay 移动为「可选模式（当前版本未开放）」一节，About 显示「当前版本未开放」而不是声明表单；删除死绑定或标注 dev-only。
B) 重新开放入口：按现有门禁接回 About/菜单，并同步文案/测试（此前用户已决定不公开，需重新拍板）。
无论哪种，都应让用户能回答「我现在能不能用 roleplay」。

**成本/风险**：[估算] 0.5 人日（A）/ 1 人日（B）；低风险（不涉核心代码）。注意 TOS 改文案要 bump 版本/哈希。

#### P1-10 「研究原型/工作助手」口径与产品体验、跨产品能力的冲突

**证据**
- USE-RESTRICTIONS-2026-11-19.md 规范短句：仅用于技术研究与原型验证，不得用于情感陪伴/虚拟伴侣/专业建议等；README 首屏、About、TOS 抬头、插件 README 都有。
- famling README:240 说「当前版本仍只有本地模板，不提供自由 LLM 对话」；但 dsh-famling 是同一品牌/角色体系，官方插件确实用 DSH LLM 做自由聊天（index.js:158-185；LEGAL-NOTICE:52 自认「有真实 LLM 聊天，不能写不提供自由 LLM 对话」）。
- 同时 famling 的 UX 有问候、记忆回放、拟人存在感、角色切换、语音；这不是错，但它与「研究原型」的口径需要更清楚地说明：研究原型 ≠ 没有情感影响。
- 插件的 README 说「不是情感陪伴产品」「不宣传 roleplay」，但人格聊天本身很容易被用户当作陪伴使用；缺少首启告知（P0-2）加重了这一点。

**影响**：用户/监管/媒体会看「同一个 PerryLink 角色」在两个端的行为；如果 famling 说「不提供自由 LLM 对话」而插件提供，口径就不可信。研究用途边界应约束「对外如何呈现」，而不是只在 README 里写一句。

**建议**：建立跨产品的一句话边界，并在两端首屏/About 使用同一句式（按端适配）：
「这是技术研究与原型验证版本的 AI 角色，不是真人，也不是情感陪伴/虚拟伴侣/专业顾问；对话/语音可能发送给你配置的服务商；可以随时关闭和删除数据；危机请拨 110/120、12356。」
同时：
- famling 的「不提供自由 LLM 对话」改成「不提供官方自由 LLM 角色扮演/情感陪伴；插件端的自由聊天是工作助手型 AI 回复，不是陪伴/恋爱模式」（或直接统一为事实描述）。
- 插件增加首启卡片与 AI/数据去向句（P0-2）。
- README 首屏的「研究用途」段加一行 plain-language「这意味着什么」：可能变更/停止、无支持承诺、不是陪伴产品、可以随时关掉。

**成本/风险**：[估算] 0.5–1 人日（文案 + 两端一致性测试）；低风险，但需产品拍板口径。

---

### 4.3 P2（可接受但应排期）

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| P2-1 | 右键菜单 17+ 项、开发入口与危险项混排 | desktop-shell.ts:607-714；「完整面板（开发/E2E）」:712；「撤回同意」「删除全部本地数据」:705-710 | 把开发面板挪到 dev-only（?shell=window 或 debug build）；把撤回/删除收进「数据与同意…」二级入口；P0-1 的安静控制放第一层 |
| P2-2 | 内容中心向终端用户展示协议/密码学细节 | content-hub.ts:1898-1912（远程市场安装契约、fail-closed 步骤）；1100-1112 契约步骤；market 文案 | 市场契约细节移到 docs/开发者页；用户面板只显示「未配置/不会联网」与安全承诺一句话 |
| P2-3 | 内容中心/同意页 8–10px 元数据、密集信息 | pet.css:1067、1111-1130、1187-1199；content-hub.ts 大量 9px 标签 | 与 P1-2 同批做字号层；给市场/技术信息折叠（details） |
| P2-4 | 「安静」在两个产品语义不同 | famling library.json quiet: bubbleChance 0.05、maxChars 50；插件 client.js:76-81 quiet: bubbleChance 0.35、maxChars 0 | 同名必须同义；建议统一「安静=关闭自动/环境气泡，交互仍短句」，或改名「简短/安静/静默」三档对齐 |
| P2-5 | 插件内容中心 tablist 无键盘模型、对话框无焦点陷阱 | client.content.js:306-315；client.js:596-604（仅 Escape/外点关闭） | 加 roving tabindex/方向键/aria-controls；dialog focus trap + 焦点返回 |
| P2-6 | 插件缺「清除本机设置/同意」与撤回入口 | LEGAL-NOTICE:27、134、171 自认 | 设置页加清除按钮；说明只清插件 localStorage，DSH/宿主数据按其条款 |
| P2-7 | 2h banner 语义/层级小问题 | modal.ts:1120-1124（role=alert + aria-live=polite）；pet.css:897-912（z-index 90，低于内容中心 150/consent 200） | 统一 role；在内容中心打开时把健康提醒提升到最上层或延后（不要丢失） |
| P2-8 | 产品壳隐藏了既有功能（改名/PTT/保存读取/语音缓存/复位窗口），但 README/旧文案仍暗示可用 | pet.html:63-91；pet.css:352；菜单无对应项 | 菜单补入口或文档删承诺；至少补「改名」和「复位窗口」（用户控制/所有权） |
| P2-9 | 启动时无主动请求的记忆回放可能像「被监视」 | main.ts:2192-2199（canRecall && last && activeMemories>2 时显示「我还记得：…」）；可读/可忘 | 改为只在用户打开折页簿时显示；或在首次回放前给一次「它记得你之前记的事」提示与「不再自动提」开关；保留 forget-all |
| P2-10 | 全程 alwaysOnTop、无托盘、无全屏自动隐藏（设计稿曾承诺） | tauri.conf.json:24；main.rs 无 pet hide-on-fullscreen；DESKTOP-PET-UX-2026-11-16.md:97（设计「全屏→hide()」） | 需 Windows 实测「桌宠是否盖住全屏视频/游戏」；如盖住，补全屏检测隐藏/暂停；无托盘则保留菜单退出 |
| P2-11 | 研究/试玩协议中的依恋探测（断联 24h、想念）缺正式 debrief/伦理审查 | COMPANION-PLAYTEST.md:9、29、49-53；PLAYTEST-PROTOCOL.md:12-15 | 试玩前加 debrief（告知这是研究、可退出、数据删除、不要因测试产生义务感）；不把「想念/依赖」当成功指标；脆弱人群排除；伦理审查/预注册（即使小样本） |
| P2-12 | 插件设置里的 AI 声明/使用限制是 11px 文本，且无每条回复 AI 标签 | client.js:918、939、944；LEGAL-NOTICE:123、127 | 与 P1-8 同批提升可读性；至少在每条回复气泡角落加一个极轻的「AI」标记或 aria-label（不遮挡） |

---

## 5. 交互原则（建议作为 P0 设计约束）

> 这些原则不替代现有法律/安全要求，而是把它们翻译成用户能感受到的行为。每条给出「允许/禁止」和验收线索。

### 5.1 十条原则

1. **边缘存在，默认静默**：默认无主动文字/声音；存在感来自呼吸/眨眼/小动作。主动消息只在用户主动交互或真实 P0 提醒时出现；无 backlog、不补发。
   - 禁止：每次启动都说话、随机弹「在吗」、用通知拉回。
2. **一层可达的全局控制**：暂停动效、静音/音量、隐藏、退出、撤回/删除——最多两次点击可达；状态可持久化；没有「只能拒绝法律声明才能安静」的路径。
   - 禁止：把静音藏在三级设置、把退出做成唯一关闭方式、关闭时有羞辱文案。
3. **可预测的因果 + 不可预测的表演**：同一输入语义一致（摸头=温暖回应），随机只用于「歪头/眯眼/这句还是那句」，不决定关系/数值/付费/稀有度。
   - 禁止：近失、隐藏台词收集、稀有反应、连击奖励。
4. **不制造义务与内疚**：不出现等待、挽留、责怪、独占、比较（「别人不懂你」）；缺席无惩罚、回来无追问；关闭/卸载中性。
   - 禁止：想你、别走、只属于你、你很久没来、手别走（人形/猫）、留灯等你。
5. **同意分层、可读、可撤回**：关键事实（AI 非真人/非陪伴/非专业；数据去向；费用；危机资源；如何停/删）在首屏可读；完整文本可滚动可查；显式勾选；随时可撤回/删除；拒绝不被羞辱。
   - 禁止：预勾选、倒计时、遮挡取消、把「关闭」做成唯一拒绝方式、用长文淹没要点。
6. **最小采集与用途限定**：不采集当前公开功能不需要的敏感数据；不收集自由文本用于画像/训练；遥测默认关；出生日期/语音/记忆按需、可删。
   - 禁止：为未公开功能收集出生日期、以「改进体验」默认开遥测、把聊天内容用于训练。
7. **研究用途边界可见但不恐吓**：用 plain language 说明「原型、可能变、无支持承诺、不是陪伴产品、不是专业帮助」；不把它写成免责声明墙之外的黑话。
   - 禁止：一边说研究原型一边用陪伴营销；假称已审核/已合规。
8. **感知预算**：主动文字默认 0；如未来加入：quiet hours 22–8、≤1 条/活跃小时、≤3 条/天 P1（P0 1 条/天）、同一时刻只有一个通道、输入/面板/后台暂停。
   - 禁止：TTS+气泡+大动作同时触发；用环境气泡填满空闲。
9. **无障碍即默认**：reduce-motion 停画布；文字缩放覆盖 consent/about/content hub；关键文本 ≥12–14px、≥4.5:1；目标 ≥24×24；键盘可达宠物与菜单；屏幕阅读器能听到用户触发的回应。
   - 禁止：把关键披露放在 7–11px、用颜色/动画单独传达状态、键盘焦点丢失。
10. **危机与依赖是产品边界，不是增长功能**：危机资源常驻/可触发、停止角色化输出、不承诺保密；不做依赖画像/排行榜；依赖自检低频、可跳过、不采集内容；2h 休息不可彻底关闭。
    - 禁止：把「陪伴时长/连续使用」当 KPI；用「它需要你」做留存；把危机当内容消费。

### 5.2 感知预算（建议值，来自既有研究 + 本项目现状）

| 层 | 形式 | 何时 | 预算 | 现状 |
|---|---|---|---|---|
| L0 静默在场 | 呼吸/眨眼/姿势 | 始终 | 常驻 | 有（帧动画），但不可暂停 |
| L1 身体提示 | 看过来/耳朵/尾巴/微动作 | 用户靠近/低频事件 | ≤6 次/小时 | famling 只在启动/交互；插件 11–20s 微动作偏密 |
| L2 短气泡 | ≤40 字（猫狗）/≤120 字（人形） | 用户主动交互；P1 提醒 | 用户触发不限；主动 ≤3/天 | famling 启动最多 1 条；插件 ambient 默认开 |
| L3 需要处理 | 到期/健康/危机 | 真·重要且时效 | P0 1/天；危机即时 | Advisers 有预算；健康 2h 只在 pet 页；危机卡未实现 |

### 5.3 菜单与设置原则（与 task-61 UX 评审衔接）

- **第一层只放高频 + 安全控制**：声音开/关、安静/暂停、暂时隐藏、内容中心、数据与同意、退出。
- **危险项集中且离高频远**：撤回/删除放在「数据与同意…」二级，并在二级页里仍是两步确认；不与「关于」混排。
- **开发/实验项不可见**：「完整面板（开发/E2E）」仅 debug 或 ?shell=window。
- **设置不重复法律长篇**：设置里给「关于与声明 / 危机资源 / 隐私摘要」入口，正文在 About 或独立页。
- **状态可回溯**：任何「已切换/已关闭/已隐藏」都要有可见状态；用户不应靠猜。

---

## 6. 文案规范与具体改写

### 6.1 文案规则（拟人但不索取）

1. **AI 身份可复述**：任何角色不应否认 AI/非真人；首启、About、TTS 首播、插件首启至少各一次。
2. **温暖但不索取**：不表达等待、孤独、需要、嫉妒、内疚；不用「你会不会不要我」。
3. **不承诺**：不承诺保密、不承诺治愈、不承诺永远在线、不承诺真实关系、不承诺专业能力。
4. **具体、短、可执行**：健康/危机/费用/数据类文案给数字与动作（2 小时/110/120/在哪删），不要只说「注意安全」。
5. **拒绝不羞辱**：用户拒绝 TTS/ASR/roleplay/删除时，短句确认，不劝导、不重复弹（除法律要求的再次动作）。
6. **状态诚实**：不把本地模板说成模型、不把占位说成 final、不把未实现说成已提供（CREATE 既有原则）。
7. **同一句在两端一致**：同一 label（「安静」「语音」「AI 声明」）语义必须一致，或改名区分。

### 6.2 现有文案 → 建议文案

| 位置/触发 | 现在 | 建议 | 理由 |
|---|---|---|---|
| 深夜启动问候（main.ts:2203-2204） | 「……这么晚。我给你留了灯。」 | 「这么晚还在呀。早点休息，明天见。」 | 去掉等待/留灯暗示；与 2h 健康目标一致 |
| 回归问候（main.ts:2190） | 「你回来了。书页一直停在这里。」 | 「你回来了。」或「书页翻到你上次那页。」 | 不暗示「它一直在等你」；保留连续性但不制造义务 |
| 记忆回放（main.ts:2198） | 「我还记得：…」 | 默认不自动说；若保留：「折页簿里有一条你之前记的：…（可在折页簿里改/忘掉）。」 | 降低「被监视」感；把控制权交给用户 |
| 狗摸头（regions.json pet-dog） | 「手别走。」 | 「再摸一下！」/「（把头顶进你手心）」 | 保留狗的社交需求，去掉依赖式挽留；人形/猫不要用 |
| 2h 提醒按钮（modal.ts:1126） | 「休息并关闭提醒」 | 「休息一下（2 小时后仍会提醒）」 | 避免被读成永久关闭；与 canon health.2h.confirm 对齐 |
| 2h 提醒标题（modal.ts:1123） | 「健康使用提醒 · 已连续使用 2 小时」 | 保留，但加「折角不会因为你离开而生气」类一句（canon 已有） | 降低内疚/义务感 |
| 菜单 TTS 入口（desktop-shell.ts:711） | 「TTS 声明与语音确认…」 | 「声音：开/关…」+ 声明在切换时自动弹 | 把「控制」和「声明」分开；用户找的是开关 |
| 菜单新增 | 无 | 「安静一会（暂停动效与气泡）」/「暂时隐藏 1 小时」 | 低打扰控制；P0-1 |
| AI 语音播放中标签 | 无 | 「AI 语音 · 合成（不是真人）」（12px，对比 ≥4.5:1） | 透明；不遮挡宠物，可放气泡内小字/菜单标题 |
| About 使用限制（pet.html:140-143） | 7px .note、2.86:1 | 12–14px、正文色、保留红边/role=note | 必读文本必须可读；不改文本字义 |
| 插件输入面板 AI 声明（client.js:918） | 只写 AI 生成、不提供 roleplay | 加「聊天文本会发送给你在 DSH 配置的模型供应商；不要输入密码/他人隐私/客户资料。」 | 知情同意/隐私；P0-2 |
| 插件首启卡片（新增） | 无 | 「这是技术演示插件，不是陪伴/roleplay 产品；回复由你配置的模型生成，文本会发给该供应商；无记忆、无主动推送；可随时清除本机设置；危机拨 110/120、12356。」 | 一次告知；不阻断；不变成第二份 TOS |
| 插件设置「清除」 | 无 | 「清除本机设置与同意（不删除 DSH/宿主数据）」 | 控制感；自认缺口 |
| 研究用途 About 段 | 只有 canonical 短句 | 加一句「这意味着：可能变更/停止、无支持承诺、不是陪伴产品、不提供专业建议；你可以随时关掉并删除数据。」 | 让「研究原型」对用户有意义，而不是免责黑话 |
| 退出/关闭 | 「退出」 | 「退出（存档保留在本机，可在 About 删除）」 | 中性、不羞辱；告知数据状态 |
| roleplay（若保持未开放） | TOS/About 仍像有入口 | About 显示「当前版本未开放」，TOS 标「可选模式（未开放）」 | 消除死链/困惑；P1-9 |

### 6.3 首启「关键事实」建议骨架（12–14px，完整 TOS 在其下）

- 这是 **AI 角色/原型，不是真人**，也不是情感陪伴、心理治疗、医疗/法律/金融建议。
- **默认本地**；开启云 TTS/ASR 时，文本/音频会发送给服务商并可能产生费用（你的账户）。
- **危机**：如有自伤/他伤/重大损失信号，请联系可信任的人、专业机构；紧急 110/120，心理援助 12356。本应用不能代为求助。
- **数据**：同意可撤回、可删除全部本地数据；删除结果会列出无法清除/核验的残留。
- **可以随时关掉**：右上/菜单可退出；AI 生成内容可能出错。

> 注：加入关键事实不改变法律文本；TOS 版本/哈希是否 bump 由法务/维护者决定。若首启仍必须展示完整 TOS，建议保留全文 region，只把「关键事实」放在全文之前。

### 6.4 文案黑名单（在既有基础上补充软性词）

- 硬黑名单（已有安全规则覆盖）：想你、别走、只属于你、只有我懂你、你离开我会难过、永远陪你、你必须每天来、不找我就惩罚。
- 建议新增人工/抽样检查的灰区：等你、留灯、一直停在这里、手别走（人形/猫）、回来、别丢下、没有你不行、早点回来、我一直在等。
- 允许的温暖（用户主动触发时）：今天也辛苦了、我在听、慢慢来、晚安（但不以「留灯/等你」包装）。

---

## 7. 无障碍验收清单（WCAG 映射）

| WCAG/要求 | 本产品对应 | 现状 | 验收方式 |
|---|---|---|---|
| 1.4.3 对比（AA，4.5:1） | .note/About/健康/内容中心文本 | .note 2.75–2.86:1（按 CSS 常量计算）；About 必读段 7px | Node 对比脚本对固定色对断言；渲染截图人工抽查 |
| 1.4.4 文本缩放 200% | 文字大小 A−/A+ | 仅覆盖部分选择器；consent/about/content hub 固定 px | 静态 grep + CSS 断言 + 200% 视觉检查 |
| 2.2.2 Pause/Stop/Hide（A） | hero 动画持续 | 无暂停；reduce-motion 只影响 CSS | 在 reduce 媒体下停 rAF 的单测；菜单项存在性测试 |
| 2.3.3 Animation from Interactions（AAA） | 交互触发的动画 | 无 reduce 检查 | 同 2.2.2 |
| 2.5.8 Target Size（AA，24×24） | 菜单/About/健康/插件按钮 | 多处 22px / 插件 ~21–23px；插件尾巴热区 19.5px | CSS min-height 断言；插件 hit slop 单测 |
| 4.1.2 Name/Role/Value | #pet 不可聚焦；#bubble 无 role；canvas 无名称 | 见 P1-3 | DOM 测试：role/tabindex/aria-label/aria-live |
| 1.4.10 Reflow / 1.4.12 文本间距 | 480×336 窗口 | 未验证；内容中心信息密集 | 200% 缩放下的截图/人工；不裁切 |
| 4.1.3 Status Messages | 气泡/结果/健康提醒 | 部分 live region 有；气泡没有 | 只对用户触发文本用 polite；ambient 不播 |
| 键盘全路径 | 菜单/同意/About/内容中心 | 菜单/同意/About 较好；宠物本体与插件宠物无键盘 | Tab/Enter/Esc 手工矩阵 + 相关单测 |

**建议加入 CI 的三条静态测试**（0.5 人日内）：
1. 关键选择器必须含 aria-live/role/aria-label（bubble/pet/hero-canvas）。
2. consent/about/content-hub 的 CSS 不得出现 <12px 正文（或必须使用 --ui-scale）。
3. .note 等固定色对做对比度计算 ≥4.5（纯 Node，无浏览器）。

---

## 8. 优化/重构建议（收益 / 成本 / 风险 / 是否值得重构）

| # | 建议 | 收益 | 成本 [估算] | 风险 | 是否值得重构 |
|---|---|---|---|---|---|
| 1 | 桌面壳最小安静控制面（静音/音量/暂停/隐藏） | 高：直接兑现低打扰承诺；解决 WCAG 2.2.2 | 0.5–1 人日 | 低；隐藏恢复路径需设计 | 小改，值得立即做 |
| 2 | 插件轻量安全地板（危机关键词 + 发送去向 + 首启 + 清除） | 高：覆盖项目最大情感/危机风险面 | 0.5–1 人日 | 低；关键词误报/语言覆盖 | 小改，值得立即做 |
| 3 | 同意分层（关键事实 + 全文） | 高：提高同意质量，不削弱法律文本 | 1–2 人日 + 法务 | 中；TOS 版本/重同意 | 值得，做「展示层」重构，不动 terms 字义 |
| 4 | 出生日期采集移到 roleplay 入口/移除 | 高：数据最小化、减少强制感 | 0.5 人日（移除）/1–2（迁移） | 中高；需用户拍板，可能影响合规叙事 | 建议做，但必须先确认产品/法务 |
| 5 | 全局文字缩放 + 对比 + 目标尺寸（a11y pass） | 高：可读性/公平使用 | 1–2 人日 | 中；480 窗口布局需回归 | 值得，CSS 层重构而非架构 |
| 6 | 2h 持久计时 + 跨窗口 + 游戏窗口 + 危机卡 | 高：健康/危机义务真实生效 | 1–2 人日 | 中；跨窗口/Rust 协调、隐私（只存时间戳） | 值得，需测试 |
| 7 | 文档单一事实源 + CI 漂移门 | 中高：知情同意可信、审计可复验 | 1–2 人日 | 中；生成器改造 | 值得，长期收益高 |
| 8 | 插件复用 famling 的完整 consent 子系统 | 低–中：一致性 | 3–5 人日 | 高；宿主不同、DSH 条款、体积/复杂度 | **不建议**；用轻量安全地板而非移植 |
| 9 | 内容中心技术信息折叠/移出用户面 | 中：降低认知负荷 | 0.5 人日 | 低 | 值得，小改 |
| 10 | 文案软性灰区治理 + quiet hours | 中：依赖风险/夜间健康 | 0.5–1 人日 | 低 | 值得，低风险 |

**总判断**：不需要大重构；需要一次「控制面 + 同意展示层 + 跨产品安全地板」的产品级收口。已有的 consent/data-controls/content-market 架构应保留，只在可用性与一致性上补。

---

## 9. 建议先做的 3 件（可执行、可验收）

### 9.1 第一件：桌面壳「安静控制面」

- **做什么**：菜单第一层加「声音：开/关」「音量…」「安静一会（暂停动效 + 不主动气泡）」「暂时隐藏 1 小时」；让 hero/canvas 读取 prefers-reduced-motion 并停帧；muted/quiet/hide 状态持久化。
- **为什么先做**：这是「低打扰/可关掉」的产品承诺本身；改动小、可验证；同时解决 WCAG 2.2.2 的硬伤。
- **验收**：菜单项 DOM/状态测试；reduce 媒体下英雄循环不启动/静止；手工验收（未在本评审执行）：菜单 2 次内静音，1 分钟内无新气泡/帧动画。
- **成本/风险**：[估算] 0.5–1 人日；低。不要改 aside.panel 的 DOM/E2E 契约。

### 9.2 第二件：dsh-famling 轻量安全地板

- **做什么**：Host 侧危机关键词前置检查 → 固定资源回复（不调模型）；输入面板/设置加「聊天发送给模型供应商」；一次性首启卡片（可关闭）；设置加「清除本机设置与同意」。
- **为什么先做**：这是目前最接近「无护栏 AI 陪伴」的面；成本低、独立于 famling 的大 TOS。
- **验收**：自伤关键词输入不触发 LLM 调用且有资源文案；首启卡片只出现一次；清除按钮回读 localStorage 为空；LEGAL-NOTICE 版本更新到 0.10.0。
- **成本/风险**：[估算] 0.5–1 人日；低。不要试图把 famling 的整套 consent 移植过来。

### 9.3 第三件：同意可读性与数据最小化

- **做什么**：首启/每动作 TOS 前加 5 条关键事实；About 必读文本 12–14px、≥4.5:1；consent/about/content hub 接入文字缩放；把出生日期采集从首启移到 roleplay 入口（或入口未开放期间移除）。
- **为什么先做**：现有 consent 的工程很强，但用户实际读不到；这是「已做的安全」能不能兑现的最后一公里。数据最小化则避免研究原型为未公开功能收集敏感数据。
- **验收**：首屏无需滚动可见关键事实；TOS 全文仍可滚动；字体/对比/目标尺寸静态断言；首启无出生日期（若拍板移除）；roleplay 内部入口仍 18+。
- **成本/风险**：[估算] 1–2 人日 + 法务/用户拍板；中（TOS 版本、既有用户重同意、产品口径）。

---

## 10. 与既有任务/审计的关系（避免重复与越界）

- **task-28 / docs/research/PET-UX-PSYCHOLOGY-2026-11-18.md**：已给出心理学机制、三物种互动、感知预算与伦理护栏；本文不重复研究综述，只做「当前实现 vs 已定原则」的评审，并补上 consent/内容中心/插件/法务漂移这些该文之后新增的面。
- **task-43（consent/TOS 下沉 Rust/路由）**：本文不审安全绕过；只审「同意是否可读、可撤回、是否与功能对等」。P0-3/P1-1 与 task-43 的 RESOLUTION-CONSENT-GATE-2026-11-19 相关但不同。
- **task-47（使用限制免责声明）**：本文引用其 canonical 短句；P1-6 指出文档漂移，不修改其文本。
- **task-50/51/53（内容中心/主题市场 UI）**：本文对 P2-1/P2-2/P2-4 只给交互/信息架构建议；具体菜单树由 task-61（UX 评审）负责。
- **task-61（使用/UX 评审）**：菜单 IA、信息架构、错误恢复由该任务主责；本文只从心理/低打扰/同意角度给输入。
- **其他 review（架构/软件/网络/游戏/测试）**：安全/协议/性能/测试覆盖不在本文结论内；本文引用的既有审计不重新判定其结论。
- **DSH checkout 只读**：未修改 /home/yy/deepseek-harness；只作宿主行为参照。

---

## 11. 待决策问题（给 lead / 用户）

1. **出生日期**：是否同意把年龄核验从首启移到 roleplay 入口（或在入口开放前移除）？若不同意，是否至少把顺序改为 TOS→年龄，并说明必要性与保留期限？
2. **插件边界**：dsh-famling 的自由人格聊天是保留为「工作助手型 AI 回复」，还是降级为命令/模板？如果保留，是否接受「轻量安全地板」而不是完整 consent？
3. **AI 披露形态**：用户已决定不做常驻角标；是否接受「TTS 每次播放/首播的轻量 AI 标签 + About 常驻说明」作为最小可感知披露？（不建议恢复浮层角标。）
4. **依赖/健康**：是否上线轻量依赖自检（低频、可跳过、不采集内容）？还是维持固定 2h + 危机卡即可？
5. **2h 计时**：是否持久化跨窗口计时（只存时间戳，不存内容），并把游戏窗口纳入？这会影响「可被用户重启清零」的现状。
6. **研究伦理**：试玩协议中的「断联 24h/想念」探测是否保留？若保留，是否加正式 debrief/伦理审查/不把依恋当成功指标？
7. **文案口径**：famling「不提供自由 LLM 对话」与插件真实 LLM 聊天如何统一表述？建议采用「不提供官方自由 LLM 角色扮演/情感陪伴；插件端聊天为工作助手型 AI 回复」。
8. **发布状态**：在以上未收口前，对外是否只做内部演示/研究，不对外称「陪伴产品/已可用」？（与 USE-RESTRICTIONS 一致。）

---

## 附录 A：只读复现命令（不改任何文件）

以下命令在 /mnt/d/Projects/dsh/desktop-games 或插件仓执行；输出用于复核本文关键断言：

    1) 控制面/动画：
    grep -n "aside.panel" src/pet/pet.css          # 352: display:none
    grep -n "mute\|vol\|talk\|rename" pet.html    # 63-91: 控件在 aside
    grep -n "requestAnimationFrame" src/pet/hero.ts # 328-330
    grep -rn "prefers-reduced-motion\|matchMedia" src/pet | cat

    2) 2h/危机：
    grep -rn "startHealthReminder" src | cat        # 仅 main.ts
    sed -n '978,1006p' src/pet/consent/runtime.ts    # visibilityState 暂停/不持久
    grep -rn "12356" src/pet | cat                   # safety/disclosure + About 文本

    3) 同意长度/字号：
    wc -l -m docs/legal/TOS.md
    grep -n "consent-tos\|font-size: 11px\|max-height: 36vh" src/pet/pet.css
    grep -n "firstRun.body\|health.2h.confirm" docs/legal/APP-DISCLOSURE-TEXTS.md

    4) 年龄：
    sed -n '376,384p' src/pet/consent/gate.ts
    grep -n "about-roleplay" pet.html src/pet/main.ts | cat   # pet.html 无，main.ts 仅 optional

    5) 插件：
    grep -n "SAFETY_BOUNDARY\|ctx.llm.stream" index.js
    grep -n "AI 声明\|useRestrictions" client.js
    grep -n "无首启告知\|无危机资源" docs/LEGAL-NOTICE-2026-11-18.md

    6) 对比度（纯计算，无渲染）：
    node -e "function L(h){const c=h.slice(1);const v=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*v[0]+.7152*v[1]+.0722*v[2]}function C(a,b){let x=L(a),y=L(b);if(x<y)[x,y]=[y,x];return((x+.05)/(y+.05)).toFixed(2)};console.log(C('#6a5a48','#1b1410'))"

---

## 附录 B：证据索引（文件:行，快照 2026-11-19 13:00 前后）

| 主题 | 证据 |
|---|---|
| 桌面壳隐藏 aside | src/pet/pet.css:351-352；pet.html:63-91 |
| 菜单无静音/暂停/隐藏 | src/pet/desktop-shell.ts:607-714（renderMenu 全部 add 项） |
| 画布 rAF / reduce 未接 | src/pet/hero.ts:328-330；src/pet/main.ts:2417-2449、2500-2504；grep 无 matchMedia（src/pet） |
| 同意/数据控制 | src/pet/consent/modal.ts:187-258、297-393；consent/data-controls.ts:510-568、596-641；consent/gate.ts:605-764 |
| TOS 规模/滚动区 | docs/legal/TOS.md（173 行/约 1.04 万字符/18 节）；src/pet/pet.css:731、788-810 |
| 年龄先于 TOS | src/pet/consent/gate.ts:376-384、456-497；modal.ts:436-443；pet.html 无 roleplay 节点 |
| 2h 计时 | consent/runtime.ts:978-1006；main.ts:3419-3422；modal.ts:1115-1143；terms.ts:297、561 |
| 游戏窗口无 2h | grep startHealthReminder 仅 main.ts；RESOLUTION-CONSENT-GATE-2026-11-19.md §1.3 |
| 软性等待文案 | main.ts:2190、2198、2203-2204；lines.idle 524；safety/local.ts:726-736（只拦硬操纵） |
| 危机/依赖安全资产 | safety/local.ts:436-457；safety/disclosure.ts:130-146；trust.ts:222-223；presence/pet-brief.ts:186-190 |
| 无签到/无bond衰减 | kernel/pet.ts:23、40-65、93-104、372-373 |
| presence 预算/静默 | presence/types.ts:56-58；presence/projector.ts:13-79、110-114 |
| 字号/对比 | pet.css:87（.note）、965-975（About 按钮）、916-926（健康按钮）、1000-1131（内容中心）；计算见 P1-2 |
| 气泡/宠物可访问性 | pet.html:44（#pet）、:53（canvas）、:61（#bubble）；DESKTOP-PET-UX-2026-11-16.md:127-132 |
| 插件聊天/人格 | plugins/dsh-famling/index.js:22-27、158-185；client.js:806-827 |
| 插件缺危机/首启 | plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md:27、123-127、168-172；client.js:918、939、944 |
| 插件默认/节奏/键盘 | client.js:20（SIZE 72）、406（默认 settings）、563/576（眨眼/微动作）、312-332（键盘无坐标）、698-721、948-951 |
| 内容市场边界 | src/pet/content-library.ts（纯函数无网络）；content-extension.mjs:374-381；content-hub.ts:1100-1112、1898-1912 |
| 内容中心技术文案 | content-hub.ts:1898-1912；pet.css:1067-1130 |
| 「安静」语义漂移 | public/content/library.json:312-320（0.05/50）vs client.js:76-81（0.35/0） |
| 文档漂移 | README.md:239-244；docs/legal/PRIVACY.md:36、58、74-79；RELEASE-BLOCKERS.md:4；APP-DISCLOSURE-TEXTS.md:57-59、67；插件 LEGAL-NOTICE:3 |
| 设计承诺未落 | DESKTOP-PET-UX-2026-11-16.md:97（全屏 hide）、127-132（#pet 键盘/reduce） |
| 研究伦理/试玩 | docs/COMPANION-PLAYTEST.md:9、29、49-53；PLAYTEST-PROTOCOL.md:12-15 |

---

## 附录 C：证据等级、外部来源与限制

**外部来源（转引/公开检索，按需复核原文）**
- WCAG 2.2.2 Pause, Stop, Hide：https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- WCAG 2.5.8 Target Size (Minimum)：https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.3.3 Animation from Interactions：https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- 虚拟宠物/依恋与 AI 陪伴证据：见 docs/research/PET-UX-PSYCHOLOGY-2026-11-18.md §2、§10（含 Dodd et al. 2025 综述、MIT Media Lab/OpenAI 2025 报道、FTC 6(b) 调查的 APA 链接等）。
- AI 人际关系系统综述（2026）：Friends, lovers, and companions: A systematic scoping review of empirical evidence on human-AI relationships（ScienceDirect S2949882126001374；公开检索摘要，未在本地复现全文）。
- 需求/控制/反应的理论依据：Ryan & Deci（SDT, 2000）、Burger & Cooper（1979）、Steindl et al.（2015）；见 PET-UX-PSYCHOLOGY-2026-11-18.md §3.3、§10。

**限制**
1. 本评审未运行任何产品代码、测试、构建或真机；所有行为结论来自静态阅读，可能与运行时不同。
2. 对比度来自 CSS 常量计算，未考虑系统主题/透明度/叠加背景的最终像素值；需要渲染层抽查。
3. 行号是工作树快照；并发修改可能漂移；引用时用原文搜索复核。
4. 成本/工时是 [估算]，不是承诺；是否实施由 lead/用户/法务决定。
5. 本文件不是法律意见、不是合规认证、不是心理诊断；涉及消费者/未成年人/AI 标识的结论以 docs/legal 与律师意见为准。
6. 未对任何真实用户做访谈/实验；不代表用户实测偏好。

---

> 本评审只新增本文件；未改代码/资产/配置，未 commit/push，未打印/写入任何凭据。若后续实施，建议按 §9 的验收项逐条回填证据（命令 + 输出 + 日期），并更新本文的「未验证」清单。
