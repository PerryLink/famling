# 内容窗口快速开关 hub 竞态：根因与修复（E11 / task-120）

- 任务：task-120「修复内容窗口快速开关 hub 竞态（E11 发现）」
- 日期：2026-11-20
- 发现：E11 短时 soak task-118（`docs/plan/SOAK-SHORT-E11-2026-11-20.md` §6.1）
- 范围：产品侧修复 `src/pet/content-runtime.ts` + 回归测试 `tests/content-runtime.test.ts`；未改 soak 脚本、未 commit。

## 1. 症状（soak 实测）

快速连续开关内容窗口时，偶发：

- 内容窗口本身**启动成功**：标题「内容与设置 · Desktop Games」、首页 home 正常、无 console error / 未捕获异常；
- 但 `#content-hub-root` 一直 `data-state=closed`，自动打开的 hub 没有出现；
- harness boot trace：约 197ms 两次 `showRoute(hideHome)`、202ms 一次 `showHome`、203ms 内容运行时（IndexedDB）初始化完成，此后 hub 再未打开。

## 2. 根因：`ensureContentRuntime()` 在初始化完成前就发布了半成品 runtime

`src/pet/content-runtime.ts` 的 `ensureContentRuntime()` 原本在**图目录 fetch 完成时**就把
`contentRuntime = runtime` 发布出去，而 `runtime.hub` / `assetStore` / `characterPacks` 要在此后
若干异步步骤（IndexedDB 打开、资产 hydrate、安装器创建）完成后才赋值。于是：

```ts
async function ensureContentRuntime() {
  if (contentRuntime) return contentRuntime // 半成品也直接返回
  if (contentLoad) return contentLoad
  ... // 这里中段才 contentRuntime = runtime（hub 仍为 null）
}
```

内容窗口的启动路径与这次加载是**并发**的：

1. `main.ts initializeApp()` 在模块初始化时就 `void ensureContentRuntime()` 提前预热目录；
2. `startContentWindowApp()` 随后 `await bootstrapConsent()` → `bootContentWindowOnce()`；
3. `bootContentWindowOnce()` 里 `await ensureContentRuntime()` 若落在“目录 fetch 已完成、hub/IndexedDB 未完成”的窗口内，就会拿到**半成品 runtime**；
4. boot 继续安装 chrome 并 `showRoute('content')`：`presentContentWindowRoute()` → `openContentHubInWindow()` 看到 `runtime.hub === null`，按既有诚实降级逻辑 `showBubble('内容目录没有加载出来，请稍后再试。')` 并返回 `false`；
5. 路由 fallback `if (!opened) contentWindowChrome?.showHome()` 把窗口切回首页；
6. 之后 init 完成、`runtime.hub` 建好，但**没有任何代码重新打开路由** ⇒ 首页可见、hub 永久 closed，且全程无异常/console error（降级是正常代码路径）。

`beforeunload`/窗口关闭无关：旧窗口已销毁；竞态完全发生在新窗口内部（eager load 与 boot 的 await 顺序），
快速开关/迭代越频繁、IndexedDB 越忙，eager load 先完成 fetch 的概率越高。

### 2.1 可重复的确定性复现（真实 Chrome，pre-fix 3/3 失败）

在 `Page.addScriptToEvaluateOnNewDocument` 注入两层仪表并**放慢 IndexedDB 打开成功事件**
（模拟慢盘/繁忙 profile，不修改产品代码）：

- `pagefold-vault`（存档解密 key，boot 的 `await loadNow()` 会等它）+80ms；
- `desktop-games/pet/content-assets` / `character-packs`（内容运行时初始化）+300ms。

pre-fix dist（HEAD 版 content-runtime.ts）实测 3/3 复现，boot trace 与 soak 失败完全一致：

- ~178ms `showRoute` → 两次 `hideHome`；
- ~179ms `showHome`，调用栈正是 `presentContentWindowRoute` 的 `if (!opened) showHome()`；
- 最终 `hubState=closed`、`homeHidden=false`，无 console error。

同一注入下 post-fix 5/5 全部打开 hub。复现脚本见本次会话产物
`artifacts/cw-race-repro.mjs`（gitignore 内，未提交；用法见文件头注释）。

## 3. 修复（`src/pet/content-runtime.ts`）

- **只发布初始化完成的 runtime**：`contentRuntime = runtime` 移到 hub controller 建好之后。
  于是并发调用者只会走 `if (contentLoad) return contentLoad`，await 同一个 in-flight promise，
  拿到的一定是 `hub !== null` 的完整 runtime；init 失败也不会留下“半成品已发布”的坏状态。
- `buildContentHubController(runtime)` 改为显式接收正在初始化的 runtime（而不是读已发布状态），
  `characterPacks` 也从该局部 runtime 取；其余 getter 仍惰性读同一对象。

修复后 `bootContentWindowOnce()` 的 `await ensureContentRuntime()` 会等到 hub 就绪，
`showRoute('content')` 一定 `hub.open() === true`，不会再落到 `showHome()` 降级。

## 4. 回归测试（`tests/content-runtime.test.ts`）

新增 2 个纯 Node、注入式、无浏览器的确定性回归测试（用 deferred `openAssetStore` 把 runtime 卡在初始化中段）：

| 测试 | pre-fix | post-fix |
| --- | --- | --- |
| `concurrent boot during in-flight catalog load waits for the full runtime` | FAIL（`hub.opens=0`，且出现「内容目录没有加载出来」bubble） | PASS |
| `openContentHubInWindow waits for the in-flight catalog load instead of failing` | FAIL（返回 false + 误报 bubble） | PASS |

另更新 `tests/content-hub-character-packs.test.ts` 的静态接线断言（hub 现在由局部 runtime 构建）。

## 5. 验证（2026-11-20 本机实测）

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | **1771/1771 pass**，exit 0（工作树含并发任务改动） |
| `npm run build` | exit 0（dist/pet.html sha256 `bca4f47c…`） |
| `node --import tsx scripts/soak-short.ts --duration 60s` | **PASS**，23 轮，5 场景各 23/23，`derived.recoveries = 0`，0 异常/0 console error/0 残留 target；report `artifacts/soak-short/run-20261120-062510/report.json` |
| `node --import tsx scripts/soak-short.ts --duration 120s` | **PASS**，45 轮，5 场景各 45/45，`derived.recoveries = 0`，0 异常/0 console error/0 残留 target；report `artifacts/soak-short/run-20261120-062821/report.json`（同一 dist sha `bca4f47c…`；pre-fix 120s 34 轮曾出现 `recoveries=1`） |
| 确定性浏览器复现（pre-fix dist / post-fix dist） | pre-fix 3/3 FAIL（同一 trace）→ post-fix 5/5 PASS |
| 设置深链（`#settings` + 一次性 focus target，注入慢 IndexedDB） | 2/2：对话框打开、home 隐藏、focus=`pet-settings-scale-global`、focus key 读后清除 |

## 6. 边界 / residual

- 只验证浏览器 fallback（`?shell=content`）与 CDP；未在 Tauri/WebView2 真机跑 native 窗口/IPC navigate 路径（本任务环境无 Tauri 宿主）。
- 竞态根因已消除，但本修复不改变 `presentContentWindowRoute` 的“打开失败回首页”降级语义（目录真失败时仍是诚实降级）。
- 未改 soak harness 的 300ms settle + 恢复重试；那是 harness 侧观测手段，产品修复后 60s/120s 均 `recoveries=0` 可回归。
