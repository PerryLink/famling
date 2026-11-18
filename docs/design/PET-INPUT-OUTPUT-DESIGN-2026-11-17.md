# 桌宠输入 / 任务结果呈现设计建议（2026-11-17）

Status: **研究综合稿；未实现代码**。依据 5 份并行研究：
[输入方式](../research/INPUT-MODALITY-2026-11-17.md)、[结果呈现](../research/TASK-OUTPUT-PRESENTATION-2026-11-17.md)、[Advisers 闭环](../research/ADVISERS-TASK-LOOP-2026-11-17.md)、[产品定位](../research/SECRETARY-PET-PRODUCT-2026-11-17.md)、[技术可行性](../research/INPUT-TECH-FEASIBILITY-2026-11-17.md)。

## 0. 结论（先做这个）

**v1 输入：宠物气泡内联输入框（打字 first-class），右键菜单/⋯/点气泡打开；Enter 提交，Esc 取消；语音 PTT 作为辅助入口。**
**v2 输入：全局热键 + 宠物上方 520×132 临时 composer（建议默认 Ctrl+Alt+Space，可改键/冲突检测/托盘兜底）。**
**结果：气泡摘要（A）→ 紧凑结果卡（B）→ 同窗展开工作区（C，v1 不新开窗；v1.1 可独立 720×560 结果窗）。**
**Advisers：宠物只做本地捕获/草稿/确认 → pending candidate；用户到 Advisers 人工 accept；宠物只读 brief/结果投影，不直读写 SQLite。**

## 1. 为什么是气泡内联，不是聊天窗/命令面板

- 桌宠窗口是 480×336 透明置顶小窗，现有 `#bubble`/右键菜单即可复用；不增加窗口、不抢焦点、不破坏“宠物”形态。
- 打字必须 first-class：语音受环境/隐私/麦克风权限限制，且 ASR 有延迟/错误；中文 IME 需要真实输入框。
- 不做常驻聊天侧栏/命令面板/游戏轮盘：会变成“第二聊天窗/任务管理器”，与秘书皮冲突。
- v1 不启用全局热键：Tauri `global-shortcut` 默认权限未开、Windows 注册冲突、焦点/杀软风险；先在菜单/气泡里验证需求，v2 再上热键 composer。

## 2. v1 交互流

1. 右键/⋯/点气泡 → 气泡切换为输入框（单行/两行，≤240 字；中文 IME `isComposing` 时 Enter 只上屏）。
2. 本地意图路由（不依赖网络/模型）：
   - “提醒我/记一笔/明天…” → 草稿任务卡；
   - “说一句/聊聊” → 情感回应；
   - 文件拖放 → 附件草稿（v1 可后置）。
3. 提交前显示**确认卡**：意图、时间、对象、是否写入/出网、费用提示、TOS/隐私。
4. 确认后才：本地保存 / Advisers pending candidate / 只读 brief；不确认不写盘、不出网。
5. 失败/离线进入本地草稿箱，可重试/复制命令；不自动重试外网。
6. 语音 PTT：仅辅助；ASR 文本先显示可编辑再提交，不直接执行。

## 3. 结果呈现三层

| 层 | 形式 | 尺寸/时长 | 内容 |
|---|---|---|---|
| A 气泡 | 宠物上方气泡 | ≤432×88，1–2 行，8s；私密/失败 30s | 一句话结果/“已收到/正在做/需确认” |
| B 紧凑卡 | 同窗底部 sheet | 480×≤208，≤3 行+2 动作；普通 12s / 私密·失败 30s / 待确认 60s 收起为 badge | 清单/摘要/批准/打开产物/稍后 |
| C 展开工作区 | 同窗覆盖层两页（v1）或独立结果窗（v1.1） | 空闲 5min 收回 | 完整结果/artifact/diff/审批/来源/时间/AI 标识 |

- 统一结果信封（研究建议，未来与 Advisers 另立契约）：`text/card/list/artifact/approval/reminder/error`；状态 `accepted/running/waiting/needs_input/done/failed/expired/cancelled`。
- 回看：本地收件箱；未读 badge；回来 recap；每日 brief 卡；每条记 createdAt/seenAt/actedAt/archivedAt。
- 隐私：`displayPolicy` private 30s/失焦/隐藏清空；public 常驻+“公开显示”角标；none 不渲染内容/计数；未知按 private。
- 写操作：批准前不落盘；代码/配置 diff 仅在 C；可逆 5min 撤销；导出不覆盖同名文件。
- 不做 TUI：不显示终端文本流/滚动日志/逐行输出；诊断日志仅折叠。

## 4. Advisers 闭环边界（关键）

Advisers 0.2.0 **没有异步任务/结果 artifact 契约**；可写入口只有 `advisers capture`（pending candidate）和 MCP capture candidate（pending），入账需人工 `memory accept`。

**v1 不做**：直读/直写 Advisers SQLite、绕过 capture pending、自动 accept、把 Pet Brief 当聊天/任务 UI。
**v1 做**：本地草稿 + 用户确认 + 复制 `advisers capture` 命令/导出 + 只读 Pet Brief；把“重任务”明确交给 Advisers。
**v2 需 Advisers 新增**：`task-request` pending intake（幂等键）、`pet-result` 状态/事件投影、`artifact` 清单（相对路径+SHA-256+verify）、`approval`、consent/egress 元数据；仍走“文件+schema+TTL+轮询”，不开 MCP/DSH/DB 第二通道。

## 5. 技术要点（Windows/Tauri）

- 宠物/结果窗后台事件绝不 `setFocus`；只在用户显式点击气泡/菜单/全局键/托盘后 composer 获得焦点。
- v1 同窗输入会激活宠物窗；若产品要求“点击不激活”，需实机验证 Tauri `focusable:false`/`WS_EX_NOACTIVATE`，失败则接受 v1 激活、v2 双窗。
- 中文 IME：`textarea`，`isComposing`/`keyCode 229` Enter 守卫；组合期间不重绘/resize；WebView2 候选窗位置需实机复测。
- 全局热键：`RegisterHotKey`（非键盘钩子）；冲突检测/改键/托盘降级；默认待拍板。
- 通知：Windows 未安装版不稳定；v1 以窗内卡为主，系统通知/托盘 badge 作增强。
- 剪贴板/截图/文件：剪贴板默认权限全禁；无官方截图 API，截图降级 Win+Shift+S；文件走 dialog/拖放。
- 屏幕共享：`contentProtected` 可 excluded capture，但不能检测分享；不宣传“隐形”。

## 6. 产品边界

- 秘书皮 = 产品/合规定位装置：工作助手、非持续陪伴；不接自由 LLM 聊天/不宣称陪伴，避免进入拟人化互动监管范围（见产品研究 §1/§5）。
- 宠物承载轻层；猫/狗只做轻互动，不承接任务；重任务/可靠提醒走 Advisers。
- 健康：2h 提醒不可永久关闭；主动提醒频次 P0 1/日、P1 3/日；不诱导依赖/恋爱/付费关系。
- AI 标识：结果内容/产物贴“AI 生成/来源/时间”，不要求整宠常驻大标（合规与体验平衡，需拍板）。

## 7. 分阶段

- **v1**：气泡内联打字 + 确认卡 + 本地草稿 + 只读 brief + 三层结果（A/B/C 同窗）；语音 PTT 可编辑；0 新窗、0 全局热键。
- **v1.1**：独立结果窗 720×560、文件/Office artifact、回看收件箱、托盘/通知增强。
- **v2**：全局热键+composer、双窗/非激活、Advisers task-request/pet-result 契约、真实 chat completion。
- **不做**：常驻聊天侧栏、命令面板、TUI/IDE 皮、语音优先、全局键盘钩子、自动读剪贴板/窗口文本。

## 8. 待拍板

1. v1 是否接受“点击气泡会激活宠物窗”；v2 是否接受第二窗 +40–90MB。
2. 默认快捷键/是否 v1 就上全局热键。
3. 结果卡是否遮宠物（调暗 vs 上移）。
4. 系统通知/badge 在未安装版降级是否接受。
5. 2h 提醒不可关闭、提醒频次。
6. 是否只让汀岚承接任务；猫狗不接。
7. chat completion 是否上线/地区/费用；Advisers 新契约由谁维护。
8. AI 标识常驻程度（整宠 vs 仅结果/About）。
