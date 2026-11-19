# 低打扰 / 健康 / 语音透明（E7）实现记录（2026-11-19）

| 项 | 内容 |
|---|---|
| 任务 | task-84（E7 / MB-070 quiet hours、MB-071 reduce-motion、MB-072 2h 健康提醒、MB-076 AI 标识） |
| 输入评审 | PSY-P0-1（残项）、PSY-P1-3（画布 reduced-motion）、PSY-P1-5（2h 提醒）、PSY-P1-7（情感文案/夜间）、PSY-P1-8（插件低打扰，插件侧不在本仓）；REVIEW-TRIAGE-UX 的 Q-01/Q-03/Q-04、C-11 |
| 范围 | 仅 /mnt/d/Projects/dsh/desktop-games（famling 桌面壳 + pet 页 + aquarium/stall/town/world 游戏页）；不改 plugins/dsh-famling，不 commit/push |
| 状态 | 已实现；npm test 1293 项（1288 pass / 5 skip / 0 fail）、npm run typecheck、npm run build 全绿（Windows Node 24.22 / 2026-11-19） |

## 1. 新增模块（纯逻辑 + 可注入 DOM/时钟，便于 Node 测试）

| 文件 | 职责 |
|---|---|
| src/pet/low-disturb.ts | quiet hours 模型/持久化/判定；情感文案过滤（waiting/留灯/guilt/dependency）；旧文案清单 LEGACY_SOFT_COPY_INVENTORY |
| src/pet/reduce-motion.ts | 减少动效唯一判定：系统 prefers-reduced-motion 为默认，显式设置覆盖；html[data-reduce-motion]；游戏页注入 CSS；跨窗口 storage 同步 |
| src/pet/health-reminder.ts | 2h 健康提醒状态机（持久时间戳/断线重置/10 分钟延后/休息重置/跨窗口 claim）+ 游戏页自包含 banner |
| src/pet/ai-label.ts | 气泡内可见 AI 标识控制器（回复 / TTS 播放两种文案） |

## 2. ① Quiet hours / 夜间安静（MB-070，Q-01）

- **默认**：22:00–08:00，**默认开启**；用户可在「设置… → 安静 / 健康 / AI 标识」改开始/结束时间或整体关闭。
- **持久化**：desktop-games/pet/quiet-hours（单 JSON：{enabled,start,end}）。损坏/非法值回退默认窗口（不会误关安静）。
- **语义**（按 C-11 / Q-01「安静 = 关闭自动/环境输出，交互回应仍可用」）：
  - 安静时段内 main.ts 的 sayLater(..., 'ambient') 直接不输出（自动气泡、回归/深夜问候、环境台词全部降为 0）；用户点击/说话触发的互动回复照常。
  - 2h 健康提醒**延后而非丢弃**：consent/runtime.ts 在安静时段跳过弹窗，安静结束后下一个 tick 继续提醒。
  - 2h 提醒的启动时间戳不受安静时段影响。
- **可见性**：设置里实时显示「安静时段当前：22:00–08:00（已开启）」；「更多 → 夜间安静 / 健康提醒 / AI 标识…」可直达同一设置组。**没有**新增角色周围常驻按钮。
- **边界**：21:59 不安静 / 22:00 安静 / 07:59 安静 / 08:00 不安静；start === end 视为关闭（避免手滑造成 24h 静默）。
- **测试**：tests/low-disturb.test.ts（边界、持久化、损坏回退、自定义时段、关闭开关、静态入口检查）与 tests/quiet-hours-settings.test.ts（DOM 行为：默认值、切换/改时间持久化并回调 main、非法时间保留原值、已存值回填）。

## 3. ② Reduce-motion 覆盖画布与游戏页（MB-071，PSY-P0-1/P1-3）

- **优先级**：显式设置 > 系统偏好；未显式设置时默认跟随系统，且**运行中跟随系统变化**；显式关闭后不再被系统偏好覆盖。规则集中在 resolveReduceMotionPreference(explicit, systemPrefers)。
- **落地面**：
  - html[data-reduce-motion="1"]：pet.css 折叠所有 transition/animation/smooth-scroll（原有）；
  - **hero canvas rAF**：main.ts heroFrame() 冻结 heroSceneNow、跳过 hero.tick/locomotion，只对交互产生的 renderKey 静态重绘一次；
  - **游戏页**：aquarium/stall/town/world 入口调用 installReduceMotion(document, window)，注入全局动画折叠 CSS（覆盖 aquarium 的 swim、world 的 tile transition 等），并把 aquarium/world 的装饰性刷新从 250/120ms 降到 1000ms；
  - 跨窗口（设置页与实际窗口）通过 storage 事件同步。
- **测试**：tests/reduce-motion.test.ts（行为：系统默认、显式双向覆盖、运行中系统变化、注入 CSS、静态检查 heroFrame 与四游戏入口）。

## 4. ③ 2h 健康提醒跨页/跨游戏/重启（MB-072，PSY-P1-5，Q-03）

状态（desktop-games/pet/health-reminder，仅时间戳、不含内容）：

{ startedAt, lastInteractionAt, deferredUntil, lastShownAt }

- **2h 连续使用**：now - startedAt >= 2h 且未延后 → 提醒。
- **页面隐藏不再暂停**：计时完全基于系统时钟；隐藏只阻止「绘制 banner」，窗口重新可见立即补弹。
- **跨窗口**：pet 页与四个游戏窗口共享同一 key；每 tick 读取并 mergeHealthStates()（最新交互决定会话起点；延后/claim 取最大值），再用 lastShownAt 做 8s claim，避免双窗重复。一个窗口「休息/稍后」会通过 storage 事件让另一个窗口收掉 banner。
- **重启不清零**：startedAt 持久化；重启后若距上次交互 <15 分钟则保留原 2h 计时（tests/health-reminder.test.ts 用 fake clock 直接验证）。
- **中断语义**：无交互 >15 分钟视为本次连续使用结束，下次交互重新计时（Q-03：「以无交互 10–15 分钟为中断而非页面隐藏」）。
- **按钮**（不可永久关闭）：
  - 「休息一下（2 小时后仍会提醒）」→ startedAt = now，2h 后再提醒；
  - 「10 分钟后再提醒」→ deferredUntil = now + 10min；
  - 可选「健康使用与求助…」（pet 页打开 About）。
- **可访问性**：banner 从旧的 role=alert + aria-live=polite（冲突语义）改为 role=status + aria-live=polite + aria-atomic。
- **接线**：pet 页仍由 startHealthReminder()（保持既有审计 health.2h-reminder 记录）驱动，使用新状态机 + 安静时段判断；游戏页使用 installHealthReminder() 自包含 banner（同样的文案与按钮）。
- **测试**：tests/health-reminder.test.ts（2h 边界、隐藏不断计时、重启保留、10 分钟延后到期、休息重置、跨窗口 claim/合并、静默时段延后、静态接线/旧 elapsedMs 累加器已移除）。

## 5. ④ AI 标识在桌面壳可见（MB-076，PSY-P1-4）

- pet.html 的 #bubble 内新增两行结构：#bubble-text（台词）+ #bubble-ai（AI 标识）；桌面壳隐藏 aside.panel 后仍随气泡可见。
- 每次 AI 回复（含猫/狗思想泡）显示「**AI 生成 · 不是真人**」；TTS 真正开始播放时切换为「**AI 语音 · 合成（不是真人）**」，播放时长后回落到回复标识；气泡 3.2s 收起时标识一起隐藏（不是常驻角标/按钮）。
- 设置「安静 / 健康 / AI 标识」组内固定说明该标识与首次播放提示；About 的 AI 声明继续保留。
- **测试**：tests/ai-label-surface.test.ts（控制器行为、DOM 位置、main.ts 接线、CSS、设置文案）。

## 6. ⑤ 情感文案过滤：等待/留灯/内疚暗示（MB-075，PSY-P1-7，Q-04）

**运行时**：filterProactiveLine() 只作用于 ambient/主动输出；命中软性等待/内疚词时替换为中性低唤醒句（NEUTRAL_AMBIENT_LINES），交互回复和显式错误/声明不经过此过滤。

**旧文案清单（2026-11-19 盘点，代码常量同源）**：

| 文件 | 原文 | 处置 |
|---|---|---|
| src/pet/main.ts | 你回来了。书页一直停在这里。 | 改写为「你回来了。书页翻到你上次那页。」 |
| src/pet/main.ts | ……这么晚。我给你留了灯。 | 改写为「……这么晚还在呀。早点休息，明天见。」 |
| src/pet/main.ts | 你忙你的，我在这里。 | idle/ambient 台词改写为「风翻到下一页。」等 |
| src/pet/main.ts | 晚安。灯我留着，明天见。 | 改写为「晚安，明天见。」 |
| src/pet/main.ts | 我在。你忙你的，我在这里。 | 改写为「我在。你说。」 |
| src/pet/desktop-shell.ts | 同上两句 typed-input 模板 | 同步改写（防止桌面壳二次出现） |
| src/kernel/pet.ts | 你忙你的，我在这里。 / 我给你留了灯。 | petSchedule 下午/夜间台词改为中性句 |
| public/characters/pet-dog/regions.json | 手别走。 | **保留**：仅金毛的身体社交短句、低频、非主动输出（Q-04 允许狗保留） |
| public/characters/pet-tinglan-anim/behavior.json | （翻开一页纸，等你继续说） | **保留**：人形交互舞台指示，仅用户说话时出现 |
| src/content/stall-core.ts | 我也给你留灯 | **保留**：游戏剧情台词，非桌宠主动输出 |

**静态门禁**：tests/low-disturb.test.ts 扫描上述文件，要求「改写项必须消失、允许项必须存在、任何新的软性文案必须先登记清单」，从而满足「至少禁新增」。

## 7. ⑥ 设置入口

- 全部新控件都在既有 **#pet-settings 总设置弹窗**里（root 菜单「设置…」或「更多 → 夜间安静 / 健康提醒 / AI 标识…」）。
- 角色周围仍**零常驻按钮**（#pet-menu-button 默认 hidden，和 task-65 一致）；未新增任何浮层角标/按钮。AI 标识只随气泡存在。

## 8. 验证命令（实测，2026-11-19）

Windows Node 24.22（WSL 下通过 cmd.exe 调用仓库既有 Windows node_modules；Linux 侧 esbuild 二进制不匹配，因此不要用 Linux node --import tsx）：

- cmd.exe /c "npm test" → 1293 tests: 1288 pass, 5 skipped, 0 fail (~8s)
- cmd.exe /c "npm run typecheck" → tsc --noEmit exit 0
- cmd.exe /c "npm run build" → vite build exit 0（含 baked voice / legal package 检查）

新增/更新的测试文件：

- tests/low-disturb.test.ts
- tests/quiet-hours-settings.test.ts
- tests/reduce-motion.test.ts
- tests/health-reminder.test.ts
- tests/ai-label-surface.test.ts
- tests/desktop-shell-menu.test.ts（reduce-motion 静态断言改为共享 watcher）
- tests/scaling-shell.test.ts（设置分组顺序加入新增组）

## 9. 已知限制 / 后续

1. **插件侧低打扰（PSY-P1-8 / P-04）不在本仓**：dsh-famling 的 quiet hours、默认 ambient 关、微动作间隔 ≥60s、reduce-motion 需在 plugins/dsh-famling 单独实现；本仓只完成 famling 桌面壳/游戏页。
2. **跨窗口依赖同源 localStorage**：pet 与游戏窗口同属一个 WebView 数据目录时生效；若未来把游戏窗口放到独立 origin/独立 profile，需要 Rust 宿主统一计时（MB-072 的备选方案）。
3. **安静时段是「主动输出为 0」**，没有做「降频到 N 次/小时」的复杂预算；如需保留极低频环境气泡，可后续在 sayLater 里加概率而非全抑制。
4. **reduce-motion 不改变游戏逻辑**：stall/town 的 250ms tick 仍推进时间（避免暂停玩法）；只折叠视觉动画 + 降低装饰性重绘频率。
5. 危机资源卡（PSY-P1-5 第 5 点）与依赖自检仍未实现，属于独立任务（A-04/Q-03 后续）。
