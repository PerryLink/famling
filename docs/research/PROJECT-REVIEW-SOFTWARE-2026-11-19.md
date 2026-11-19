# 软件工程师视角全项目评审（famling / dsh-famling · 2026-11-19）

> 评审人：review-software（独立评审，非修改者）。
> 对象：`/mnt/d/Projects/dsh/desktop-games`（famling，Tauri v2）+ `/mnt/d/Projects/dsh/plugins/dsh-famling`（DSH 插件）；DSH checkout `/home/yy/deepseek-harness` 仅作只读参照。
> 边界：只读评审；未改代码/资产/配置；未 commit/push；本文件是本轮唯一写入。
> 快照：2026-11-19 12:50–13:10 +08:00，HEAD `779354b`。评审期间工作树含并行 task-54（内容模型 v2）的未提交改动：13 个文件修改 + 若干未跟踪条目（评审期间并行文档仍在增加），`git diff --stat` 约 +6079/−785 行。
> 证据等级：**A** = 本轮命令实测；**B** = 本轮读源码/文档；**C** = 静态推断（未运行，文中会标明）。
> 优先级：**P0** = 质量门/发布可信度失效，发布前必须关闭；**P1** = 显著抬高回归风险或维护成本，近期应做；**P2** = 局部债，可排期。

---

## 0. 执行摘要

### 0.1 一句话判断

功能交付速度明显快于工程化速度：代码能跑、测试数量很大、安全/权限类修复也已落地；但**质量门并没有真正运行**（仓库无 git remote，CI 从未执行），而且**从 HEAD 干净导出时测试必红**（依赖跨仓路径与被 gitignore 的生成物）。当前最大的工程风险不是某个具体 bug，而是「每次交付都靠人工在脏工作树上跑一遍本地门禁」这种模式；其次是 `main.ts`（3555 行）与 `content-hub.ts` 的 `initContentHub`（单函数约 1010 行）这类单体，以及 famling 与插件之间**三份手写内容目录/校验器**的静默漂移。

### 0.2 支撑判断的硬事实（全部本轮实测，除非标注 B）

| # | 事实 | 证据 |
|---|---|---|
| 1 | **仓库无 git remote，CI 不存在**。`ci.yml` 自述没有 remote，`git remote -v` 为空；但 README 第 11 行宣称「私有远端已建、CI 已加入」 | `git remote -v`（空）；`.github/workflows/ci.yml:3-5`；`README.md:11` |
| 2 | **HEAD 干净导出的测试会失败**：1046 个测试中 1037 通过、4 失败；其中 2 个在任何干净 clone/CI 上必失败（跨仓 `../plugins/dsh-famling`、指向被 gitignore 的 `art/_placeholder/*` 生成图），另 2 个仅因 WSL 下 `/tmp` 无法映射 Windows 路径 | `git archive HEAD` 导出到 `/tmp/dg-baseline` 后 `npm test`：`1046/1037 pass/4 fail`，28.05s |
| 3 | 干净导出 typecheck 通过；当前工作树（含未提交 v2 改动）typecheck 通过、`npm test` **1118/1118 通过**，29.79s | `npx tsc --noEmit` exit 0；`npm test` |
| 4 | 插件质量：76 个测试全绿（3.37s）；`verify:anims` 通过；首屏 `client.js` 66.1 KiB，首绘 127.9 KiB，全量懒载 313.5 KiB | `npm test`、`npm run verify:anims`、`npm run check:anims` |
| 5 | 前端构建 8.47s，产物 9.5 MiB；pet 入口 JS 362,133 B，加上 5 个 modulepreload 共 **557,953 B（约 545 KiB；按构建日志 gzip 合计约 184.6 KiB）**；语音 WAV 占 4.3 MiB | `npx vite build --outDir /tmp/dg-dist-build` 日志 |
| 6 | 代码结构：`main.ts` 3555 行；`content-library.ts` 4568 行；`initContentHub` 单函数 L1278–2287（约 1010 行）；`initDesktopShell` 414–888 行（475 行）；插件 `client.js` 的 `FamlingFooter` 412–1027 行（616 行，28 个 useState / 17 个 useEffect） | `wc -l` + 逐文件函数跨度脚本 |
| 7 | 测试结构：124 个测试文件 / 1118 个测试；**0 个测试 import `src/pet/main.ts`**（19 个文件只把它当文本读）；无 jsdom；无覆盖率工具；无 lint/格式化配置 | `ls tests/*.test.ts`、`grep -rl from '../src/pet/main' tests`（0）、`package.json` |
| 8 | 工程门禁缺位：无 Dependabot/OSV；`npm audit` 在 npmmirror 镜像返回 404（安全公告端点未实现）；Rust 无 clippy/fmt 门；Tauri Rust 测试 `continue-on-error: true` | `npm audit` 输出；`.github/workflows/ci.yml:123-124` |
| 9 | 文档漂移：`docs/` 下 359 个 md、11 MiB（224 个文件名带日期）；入口 README/HANDOFF 对版本、测试数、能力、remote 的描述与当前代码不一致 | `find docs -name '*.md'`；HANDOFF §2/§3（0.7.2 / 842 tests / 只有汀岚）vs 当前 0.10.0 / 1118 tests / 三形象 |
| 10 | 代码契约三源：famling `public/content/library.json`、插件 `client.js` 的 `ROLE_BUNDLES`、插件 `content-extension.mjs` v3 各自维护内容枚举，已经出现真实差异（famling 有 `high-contrast` 主题，插件没有；角色 id `humanoid` vs `human` 靠手写映射） | `public/content/library.json:372`；`client.js:83`；`content-extension.mjs:56`；`content-library.ts` 的 `CONTENT_CHARACTER_PRODUCT_IDS` |

### 0.3 问题清单与优先级（摘要，详见 §3–§5）

| ID | 级别 | 问题 | 一句话证据 |
|---|---|---|---|
| P0-1 | P0 | 质量门不存在 + 干净 checkout 必红 | 无 remote；干净导出 2 个测试必然失败 |
| P1-1 | P1 | `main.ts` 3555 行单体：35 个模块级可变 `let`、23 个模块级事件注册、30s 定时器、0 行为测试 | `main.ts:1537+`、`:2139`、`:3344`、`:3555` |
| P1-2 | P1 | `initContentHub` 单函数约 1010 行，DOM 构建/文件读取/导入确认/焦点管理混在一起 | `content-hub.ts:1278-2287` |
| P1-3 | P1 | famling 与插件内容目录/校验器三份手写源，已漂移 | 见 0.2 #10 |
| P1-4 | P1 | 测试金字塔倒置：主入口 0 行为测试，20 个测试读源码文本；跨仓/生成物依赖使测试不可迁移 | `grep -rl "from '../src/pet/main" tests` = 0；`tests/use-restrictions.test.ts:27-45`；`tests/ui-assets.test.ts:905-910` |
| P1-5 | P1 | 插件客户端纯 JS、无 typecheck/lint/构建；host 桥接 7 个 catch 全部吞错且无日志 | `plugins/dsh-famling/package.json:7-13`；`index.js:187-256` |
| P1-6 | P1 | 持久化状态散落（famling 约 30 个 localStorage key，插件 8+ 个），无统一 schema/迁移；切角色靠整页 reload | `src/pet` 键名清单；`main.ts:1163` 的 `location.reload()` |
| P1-7 | P1 | 产物包含演示栈与旧工具链：9 个页面全量构建，`pixi/cordis/sentry/electron` 只服务 demo/旧探针；无 bundle size 预算 | `vite.config.ts:352-362`；`package.json:46-57`；`electron` 仅 app/electron 脚本 |
| P2-1 | P2 | `scripts/` 工具 sprawl：约 62 个脚本 + 12 个 ps1，含 20 个 `cdp-*` 一次性探针；三套 Python 生成器 45–62 KB/个 | `ls scripts`；`du`/`wc` |
| P2-2 | P2 | 文档漂移与体积：359 md / 11 MiB，入口文档数字过期；README 关于 remote/CI 的描述已不实 | `README.md:11`；`docs/` 统计 |
| P2-3 | P2 | 测试可移植性：`toWindowsPath` 只接受 `/mnt/<盘>/`；`@types/node` 22 vs CI Node 24；无 `engines` | `tests/release-sign.test.ts:139-160`；`package.json` |
| P2-4 | P2 | 具体错误处理缺陷：`sendTask` 的 `toISOString()` 在 try 外；`handleBridge` 的 `request.text()` 在 try 外；死 locale 键；面板锚点不随 resize 更新 | `client.js:835`；`index.js:191`；`client.js:362/386` |
| P2-5 | P2 | 供应链/CI 细节：actions 未按 SHA pin；无 clippy/fmt；Rust 测试不 gate；依赖安全扫描缺失 | `.github/workflows/*.yml`；`npm audit` 404 |
| P2-6 | P2 | 构建不可重建：插件嵌入数据来自兄弟私有仓（`../../desktop-games`），单独 clone 插件仓只能自洽校验，无法重生成 | `scripts/embed-anims.mjs:82-84`；`scripts/verify-anims.mjs:562-580` |
| P2-7 | P2 | `content-library.ts` 4568 行纯函数单体，同时兼容 3 代 schema（v0.1 catalog/pack、v0.2 catalog/pack、远端市场契约） | `content-library.ts:1-53`、`:115-136`、`:3703`、`:4304` |

### 0.4 建议先做 3 件（详见 §8）

1. **把质量门变成真的、并让干净 checkout 绿**（0.5–1 人日）：修 2 个环境依赖测试 + 增加 `npm run ci`（= ci.yml 同一组步骤）+ 建 remote 让 CI 真正跑。不做这一步，后面所有「测试全绿」都不构成发布证据。
2. **`main.ts` 减重第一刀**（2–3 人日）：先提取 save 子系统、content-runtime、hero-page 三块（约 1500 行），并把 boot/save/角色切换补成 3 条行为测试；目标 `main.ts` < 2000 行。
3. **内容目录单源化 + 漂移门禁，并给插件加静态检查**（1.5–2 人日）：先写一个 drift-check（读 famling `library.json` 与插件 `ROLE_BUNDLES`/`content-extension` 比对角色/主题/声音/限制），立刻会暴露 `high-contrast` 缺失与 `humanoid↔human` 映射；然后决定代码生成方向；顺手给插件加 `tsc --allowJs --checkJs`（或迁移 TS）门禁。

---

## 1. 评审边界、材料与方法

### 1.1 对象与读取范围

- 私有仓：`/mnt/d/Projects/dsh/desktop-games`（famling，Tauri v2 + Vite 多页 + 纯 TS 内核）。
- 插件仓：`/mnt/d/Projects/dsh/plugins/dsh-famling`（DSH client 插件；本地目录**不是 git 仓**，`git log` 报 not a repository）。
- 只读参考：`/home/yy/deepseek-harness`（DSH checkout）、`/mnt/d/Projects/dsh/deepseek-community-hub/00-live/FAMLING-DSH-HANDOFF-2026-11-18.md`、`docs/audit/*`、`docs/design/CONTENT-MARKET-2026-11-19.md`、`docs/research/QA-RELEASE-AUDIT.md`。
- 重点代码：`src/pet/main.ts`、`desktop-shell.ts`、`content-hub.ts`、`content-library.ts`、`hit-regions.ts`、`hero*.ts`、`plugins/dsh-famling/{index.js,client.js,client.content.js,content-extension.mjs,scripts/*,test/*}`、`app/tauri/src-tauri/{tauri.conf.json,capabilities,build.rs,src/main.rs}`、`.github/workflows/*`。

### 1.2 本轮实际执行的命令（可复现，全部只读或写 `/tmp`）

```bash
# 1) 当前工作树
cd /mnt/d/Projects/dsh/desktop-games
npm run typecheck            # exit 0（13:00 快照）
npm test                     # 1118 pass / 0 fail / 29.79s
npm run version:check        # ok: 6 version mirrors match 0.1.0
npm run validate:content     # ok: 3 个 content.json
npm run verify:pack          # ok
npm run fci:validate         # ok
npx vite build --outDir /tmp/dg-dist-build --emptyOutDir   # exit 0, 8.47s
cd /mnt/d/Projects/dsh/plugins/dsh-famling
npm test                     # 76 pass / 0 fail / 3.37s
npm run verify:anims         # OK；首屏 66.1 KiB / 首绘 127.9 KiB / 全量 313.5 KiB
npm run check:anims          # check ok: client.js + 3 lazy chunks 与资产一致
# 2) HEAD 干净导出（模拟 CI checkout）
rm -rf /tmp/dg-baseline && mkdir -p /tmp/dg-baseline
git archive HEAD | tar -x -C /tmp/dg-baseline
ln -s /mnt/d/Projects/dsh/desktop-games/node_modules /tmp/dg-baseline/node_modules
cd /tmp/dg-baseline && npx tsc --noEmit        # exit 0
cd /tmp/dg-baseline && npm test                # 1046 tests / 1037 pass / 4 fail / 28.05s
```

说明：干净导出复用工作树 `node_modules`（不 `npm install`），因此测的是**源码/资产/脚本**的可迁移性；这正是 CI `npm ci` 之后的行为。

### 1.3 本轮没有做（不要当作已验证）

- 没有构建/启动当前源码的 Tauri EXE，也没有做真实 WebView2 GUI 验证（旧 exe 是 2026-11-14 产物，不能代表当前源码；见 HANDOFF §2.5）。
- 没有运行 `npm install`/`npm ci`（工作树已有 node_modules，锁文件未重新解析）。
- 没有做真实计时级性能剖析；性能结论引用本轮可测的产物大小/测试时长，以及仓库内既有审计报告的**历史实测**（会标注）。
- 没有验证 DSH 宿主上的实际插件 UI（当前工作区可能未安装 0.10.0）。

---

## 2. 现状基线（本轮实测）

### 2.1 质量门现状

| 门禁 | 本地当前工作树 | HEAD 干净导出（模拟 CI） | 备注 |
|---|---|---|---|
| `tsc --noEmit`（src+tests+scripts+app） | ✅ exit 0 | ✅ exit 0 | strict + noUncheckedIndexedAccess，类型纪律整体较好 |
| `npm test`（Node 24.22.1） | ✅ 1118/1118，29.79s | ❌ 1046 中 4 fail，28.05s | 4 fail 见 §2.2 |
| `version:check` | ✅ 6 个版本镜像一致 | 未单独跑 | 版本漂移防护是加分项 |
| `validate:content` / `verify:pack` / `fci:validate` | ✅ 全部通过 | 未单独跑 | 签名包/角色包门禁存在 |
| 插件 `npm test` | ✅ 76/76，3.37s | 未单独跑（插件目录本机非 git 仓） | 纯 node:test + 自制 React 假运行时 |
| 插件 `verify:anims` / `check:anims` | ✅ | 未单独跑（缺私有资产时会跳过字节级比对） | 见 P2-5 |
| GitHub Actions | ❌ **从未运行**（无 remote） | — | `.github/workflows/ci.yml:3-5` 自述 |
| lint / 格式化 | ❌ 无配置（无 eslint/prettier/biome/editorconfig） | — | — |
| 覆盖率 | ❌ 无（无 c8/nyc） | — | — |
| 依赖漏洞扫描 | ❌ `npm audit` 在 npmmirror 返回 404；无 Dependabot/OSV | — | 实测输出 NOT_IMPLEMENTED |
| Rust lint/格式 | ❌ 无 clippy/rustfmt 门 | — | `Cargo.toml` 用宽版本（`tauri = 2`），靠 Cargo.lock 锁 |

> 过程证据：12:52 时工作树曾红（`tsc` 4 个错误、`content-hub.test.ts` 4 个失败），13:00 并行任务收尾后恢复绿。这说明「执行者手动在收尾时跑门禁」是唯一防线；没有 hook/CI 会在中途拦截。

### 2.2 HEAD 干净导出失败的 4 个测试（关键）

| 测试 | 失败方式 | 判定 |
|---|---|---|
| `tests/use-restrictions.test.ts` 的「both products expose the use restriction…」 | `missing disclaimer entry: ../plugins/dsh-famling/README.md` | **真实 CI 必红**：测试把插件仓三个文件写进 `entries`（`tests/use-restrictions.test.ts:27-45`），但 desktop-games 仓内不含该兄弟目录 |
| `tests/ui-assets.test.ts` 的「contact sheets + verify report…」 | `ENOENT: art/_placeholder/ui-91-2026-11-17/contact-sheet.png` | **真实 CI 必红**：`public/assets/ui/manifest.json:18` 的 `generation.contactSheets` 指向被 `.gitignore:25` 忽略的生成图；干净 clone 没有这些文件，CI 也没有生成步骤 |
| `tests/release-sign.test.ts` 的 authenticode-report 测试 | `cannot map to a Windows path: /tmp/dg-baseline/...` | 仅 WSL 把仓库放到 `/mnt/<盘>/` 之外时失败；Linux CI 不会 spawn 到 powershell，Windows CI 路径正常。属可移植性 P2 |
| `tests/release-sign.test.ts` 的 reproducible-zip 测试 | 同上 | 同上 |

结论：**「干净 clone + npm ci + npm test」当前不可能全绿**。这与「仓库没有 remote、CI 从未跑过」互相印证——一旦建 remote 推送，CI 首跑即红。

### 2.3 构建产物与包体（本轮 `vite build` 实测）

| 指标 | 数值 |
|---|---|
| 构建耗时 | 8.47s（Vite/Rolldown；日志报告 1 个插件回调占 5.9s/8.5s，构建期 HTML 处理偏重） |
| 产物总大小 | 9.5 MiB（45 个 JS chunk；语音 WAV 4.3 MiB） |
| pet 页首屏 JS | 入口 `pet-*.js` 362,133 B + 5 个 modulepreload（80,276 + 112,157 + 1,102 + 1,615 + 670 B）= **557,953 B**；按日志 gzip 合计约 184.6 KiB |
| 分页构建 | 9 个 HTML 入口：index/presence/world/aquarium/stall/town/pet/chat-import/setup（`vite.config.ts:352-362`） |
| 与产品相关性 | pet/setup/chat-import 是产品页；index/presence/world/aquarium/stall/town 是 P0 小游戏/demo，仍随发布物构建与打包 |
| 插件首屏 | `client.js` 66.1 KiB；首绘（+ 默认角色 chunk）127.9 KiB；三形象全量懒载 313.5 KiB（`verify:anims` 实测输出） |

### 2.4 结构与测试度量

| 指标 | 数值 | 说明 |
|---|---|---|
| `src/pet/main.ts` | 3555 行，48 个 import，35 个模块级 `let`，99 处 `void` fire-and-forget，21 处手动 `render()` | 应用入口 + DOM + 语音 + 存档 + 内容 + hero + Advisers + consent 全在一文件 |
| `initContentHub` | L1278–2287（**约 1010 行**单函数，30+ 内部函数；评审开始时测到 1022 行） | 同函数内做 DOM 构造、tab 渲染、文件读取、导入确认、焦点/键盘、市场状态 |
| `content-library.ts` | 4568 行，纯函数 + 严格校验 | v1/v2 适配器 + 远端市场契约 + 角色主题全在单文件 |
| `initDesktopShell` | 414–888 行（475 行），内含 `renderMenu` 537–712 行 | 菜单 IA 与 DOM 细节仍是命令式 |
| 插件 `FamlingFooter` | 412–1027 行（616 行），28 个 useState / 17 个 useEffect / 16 处 localStorage | 单组件承载角色、动画、TTS/ASR、桥接、提醒、内容中心入口 |
| 测试规模 | 124 文件 / 1118 测试 / 29.79s | 数量充足、速度可接受；结构问题在覆盖面类型（见 §2.5） |
| 测试方式 | 20 个文件读 `src/**` 文本做断言；19 个读 `main.ts`；**0 个 import main.ts**；无 jsdom/happy-dom | 主入口只有「源码字符串门禁」，没有行为测试 |
| 文档 | 359 个 md / 11 MiB / 224 个带日期文件名；git 跟踪 406 md vs 305 ts | 文档密度远高于代码，但入口文档漂移 |

### 2.5 依赖与工具链

| 项 | 现状 | 风险判断 |
|---|---|---|
| 运行时依赖 | `@sentry/browser`、`@tauri-apps/api`、`cordis`（精确 `4.0.0-rc.12`）、`pixi.js@^8.22` | pet 产品路径只用 `@tauri-apps/api`；`pixi/cordis` 只被 demo/game 页引用，`@sentry` 只被 aquarium demo 的 telemetry 引用（`src/aquarium/main.ts:34`） |
| 开发依赖 | `electron@^45.3.0`（仅旧截图/探针脚本）、`ajv`、`fake-indexeddb`、`tsx`、`typescript`、`vite` | electron 安装体积大且不在 CI/产品路径；`fake-indexeddb` 用于 content-assets 测试（合理） |
| Node 版本 | 本机 24.22.1；CI 固定 24；`@types/node@22.20.5`；package 无 `engines` | 类型与运行时差一个大版本；建议统一到 24 或加 engines |
| 版本镜像 | `scripts/check-version.mjs` 校验 6 处（package/lock/tauri.conf/Cargo/main.ts 内 gameVersion） | 好的实践，应保留 |
| 插件依赖 | 0 依赖（React 等由 DSH 宿主注入）；无 lockfile | 轻量是优点；但没有类型/构建步骤 |

### 2.6 本轮明确未验证

- Tauri 窗口在 Windows/WebView2 下的真实行为（透明、置顶、点击穿透、consent 门）；本轮只读了 `main.rs`/`tauri.conf.json`/capabilities 与既有审计。
- 插件在 DSH Web 中的真实渲染与 Host 桥接（无运行中的 DSH 会话 token，未发请求）。
- 并发/长稳/内存：引用 `deepseek-community-hub/docs/audit/PET-PERFORMANCE-AUDIT-2026-11-18.md`、`deepseek-community-hub/docs/audit/PET-ROBUSTNESS-AUDIT-2026-11-18.md` 的历史实测（A 级是那两份报告的口径，不是本轮）。

---

## 3. P0 问题

### P0-1 质量门不存在：仓库没有 remote，CI 从未运行；干净 checkout 的测试必红

**现象（A 级证据）**

1. `git remote -v` 为空；`.github/workflows/ci.yml:1-8` 自述：「This repo has no git remote yet, so this workflow only starts running once a remote is added…Until then `npm run preflight` is the local equivalent」。
2. 但 `README.md:11` 写：「私有远端已建（`PerryLink/desktop-games`，2026-11-15，private）；CI workflow 已加入，首次运行结果见 GitHub Actions」。两处说法互相矛盾，且当前事实支持前者。
3. 把 HEAD 导出到 `/tmp`（等价于 CI 的干净 checkout）后，`npm test` 有 4 个失败；其中两个不是环境噪声，而是仓库自身的可迁移性缺陷：
   - `tests/use-restrictions.test.ts:27-45`：测试硬编码读取 `../plugins/dsh-famling/README.md`、`../plugins/dsh-famling/docs/LEGAL-NOTICE-2026-11-18.md`、`../plugins/dsh-famling/docs/DETAIL.md`。desktop-games 的干净 clone 里没有这个兄弟目录 ⇒ 必红。
   - `tests/ui-assets.test.ts:905-910`：读 `manifest.generation.contactSheets`（来自 `public/assets/ui/manifest.json:18`），这四个路径全部位于 `art/_placeholder/ui-91-2026-11-17/`，而 `.gitignore:25` 忽略 `art/_placeholder/*`，仅 `.gitkeep` 被跟踪 ⇒ 干净 clone 必红；CI 也没有生成步骤。
4. 实际执行：`git archive HEAD | tar -x -C /tmp/dg-baseline` 后 `npm test` 结果 `1046 tests / 1037 pass / 4 fail / 28.05s`；`npx tsc --noEmit` 反而通过。

**为什么是 P0（而不是「测试写得不好」）**

- 它直接让「CI 通过 / 可复现 / 可发布」这三类声明失去证据。HANDOFF §9 的验证口径仍是「npm test 最近记录 842/842」，而当前连干净 checkout 都过不了；后续任何一个新会话/新协作者照文档操作都会得到红。
- 没有 CI 时，唯一的门禁是执行者在收尾时手动跑；本轮就观察到 12:52 工作树红、13:00 才恢复——说明「红着继续改」不会被任何机制拦截。
- 建 remote 是对外发布的前置动作；如果先建 remote 再修测试，第一次 CI 就是红的，会污染信心与历史。

**可执行修复（按顺序，S 工作量）**

1. `tests/use-restrictions.test.ts`：famling 仓只校验本仓条目；跨仓三份声明移到插件仓自己的测试（插件已有 76 个测试，可加 1 个）；若坚持留在 famling，则用 `skip: !existsSync(path)` 明确标注「需要兄弟仓」并在输出说明，不能默认失败。
2. `tests/ui-assets.test.ts`：把 `public/assets/ui/manifest.json` 的 `generation.contactSheets` 改指向已跟踪的 `docs/art/ui-91-qa/contact-sheet*.png`（这四个文件本来就已纳入 git：`docs/art/ui-91-qa/`），或把 QA contact sheet 复制进 `public/assets/ui/qa/` 并跟踪；不要把仓库门禁绑在 gitignore 的生成物上。
3. 新增 `npm run ci`（= `.github/workflows/ci.yml` 的同一组步骤：version:check → typecheck → test → validate:content → verify:pack → fci:validate → build），让本地/代理/CI 共用一条命令；`scripts/preflight.mjs` 已覆盖大部分，可直接复用并补齐 CI 中的 release-sign/repro-check smoke step。
4. 建立私有 remote 后推送并确认首个 CI run 真实变绿；同时把 `README.md:11` 改成与事实一致（或删除该段），HANDOFF 顶部加「快照日期 + 以当前代码/实测为准」的醒目说明。

**验收**：把仓库 `git archive HEAD` 到任意目录，执行 `npm ci && npm run ci`，全绿；GitHub Actions 至少一次真实 run 通过（给出 run 链接或截图证据）。

**收益/成本/风险**：收益极高（恢复发布信心、让后续重构有护栏）；成本 0.5–1 人日；风险低（只动测试/文档/脚本）。

---

## 4. P1 问题

### P1-1 `main.ts` 是 3555 行单体 + 35 个模块级可变状态 + 模块级副作用，且没有行为测试

**证据（A/B 级）**

- `src/pet/main.ts` 3555 行；文件前 185 行里 48 个 import，来自 kernel/voice/hero/anim/Advisers/consent/content/security/observability 等至少 30 个模块（`main.ts:1-185`）。
- 35 个模块级 `let`（`state`、`hero`、`heroCtx`、`heroRaf`、`contentRuntime`、`dialogueBehavior`、`booted`、`saveInFlight`、`saveRecoveryNeeded`、`startupStage`…），状态生命周期靠模块求值顺序与若干 `wired.*` 布尔量管理。
- 模块级副作用：`main.ts:1537` 起 23 个 `$('...').addEventListener(...)`、3 个 `document.addEventListener`、`:2139` 的 30s 自动保存 `setInterval`、`:3545` 的顶层 `void startConsentApp()`。也就是说 **import 这个模块就开始绑 DOM/起定时器**，无法在 Node 测试里安全导入。
- 99 处 `void <promise>` fire-and-forget（多数有 `.catch(reportFailure(...))`，习惯是好的），21 处手动 `render()`；`initializeApp()`（`:3344`）负责 consent/shell/content/about/health 的幂等装配。
- **0 个测试 import `main.ts`**（`grep -rl "from '../src/pet/main" tests` = 0）；19 个测试只把它当文本 `readFileSync('src/pet/main.ts')` 后做字符串断言。

**风险**

- 改 DOM id/顺序/文案，可能悄悄破坏 consent 门、hero 启动、内容中心入口；静态测试只保证某些字符串还在，不保证行为。
- 单一文件承载太多生命周期：boot 失败重试（`startupStage`/`booted`/`startupRetryInFlight`）与 content/hero/advisers 初始化互相耦合，任何新增功能都要在这 3.5k 行里找插入点。
- 并行开发冲突放大会被放大：本轮并行任务的 diff 里 `main.ts` 单文件改了约 610 行（`git diff --stat`），合并/审查成本高。

**重构建议（分两步，先搬运后抽象）**

1. **第一步：机械提取 3 个模块（不改行为）**
   - `src/pet/runtime/save.ts`：`invokeTimed`、`encryptSave/decryptSave`、`parsePetSave`、`loadNow`、`saveNowInternal/saveNow`、`saveAndPurgeBackup`、恢复标记（现 L1689–1955 + L2119–2153 + L2305–2358，约 350 行）。注入 `canInteract`、`state` 读写、`showBubble/reportFailure`。
   - `src/pet/runtime/content.ts`：`contentRuntime/ensureContentRuntime/buildContentHubController/openContentHubFromMenu/applyRoleThemeFromHub/customizeRoleComponent/restoreCurrentRoleDefaults/prepareContentImport/commitContentImport/installedPackSummaries/resolveRolePreviewUrl/hydrateInstalledAssets`（L862–1412，约 550 行）。导出 `loadContentRuntime(deps)` 供测试注入 fake fetch/storage。
   - `src/pet/runtime/hero-page.ts`：`setHeroStatus/stopHeroLoop/fallbackHero/heroFrame/applyHeroLocomotion/startHeroLoop/attachHeroPointer/startHeroPage`（L2359–2801，约 440 行）。注入 canvas/doc/window 与 `reportFailure`；已有 `hero-runtime.ts` 的 `startHeroRuntime` 可复用其可测模式。
2. **第二步：收口事件绑定**：把所有模块级 `$('...').addEventListener` 收进 `wirePetEvents(deps)`，由 `initializeApp()` 调用；`main.ts` 目标 < 2000 行，最终 < 1200 行。
3. **补 3 条行为测试（优先于视觉/样式）**：boot 失败→重试成功；坏档→从 `.bak` 恢复且不覆盖备份；应用角色主题→写 6+1 键并触发 reload 分支（可用 fake `location.reload`）。

**收益/成本/风险**：收益高（可测性、并行开发、降低回归面）；成本 2–3 人日（机械搬运 1d + 依赖注入与测试 1–2d）；风险中（hero 指针/拖动与 consent 时序是难点，建议先做 save/content 两个低风险块，hero 最后）。

**是否值得重构：值得，且应作为第一优先的结构性改造。**

### P1-2 `initContentHub` 单函数约 1010 行：DOM 构建、文件读取、导入确认、焦点管理全混在一起

**证据（A/B 级）**

- `src/pet/content-hub.ts:1278-2287` 的 `initContentHub` 是约 1010 行单函数（评审开始时为 1022 行）；内部定义 30+ 个函数，包括 `renderRoles`、`renderCustomize`、`renderPacks`、`renderMarket`、`renderPanel`、`handleImportFile`、`handleConfirmImport`、`focusableElements`/`onDocumentKeydown`、`open`/`close`。
- 同函数里还做**文件读取**：`fileListOf`、`readSingleSelection`、`readFolderSelection`、`handleImportFile`、`handleConfirmImport`（约 L1980–2140 一带；行号随并行改动有小偏移）——这些是纯 IO 逻辑，却只能通过 DOM 事件间接测试。
- 文件 2304 行无 `class`，状态（`openState`、`activeTab`、`pendingImport`、`importBusy`、`marketState`）全部在闭包里。
- 测试侧 `tests/content-hub.test.ts` 已经长到约 1980 行（并行任务期间 +1207 行），说明功能在涨、测试也在涨，但都堆在同一个 API 面上。

**重构建议**

- 目录化：`src/pet/content-hub/{index.ts,controller.ts,tabs/roles.ts,tabs/customize.ts,tabs/packs.ts,tabs/market.ts,import-flow.ts,a11y.ts}`。
- 每个 tab 渲染器接收「已计算好的数据 + 回调」，不自己读 storage/事件；controller 只做 open/close/focus/tab 状态。
- `import-flow.ts` 接收注入的 `File/FileList/DirectoryReader` 接口，返回 `ContentPackFileSelection`，可纯 Node 测试（plugin 的 file reading 也有同名问题）。
- 保持现有 DOM class/id 与文案不变，先搬运再拆分；`tests/content-hub.test.ts` 的 fake DOM 装配可继续用，只需改 import 路径。

**收益/成本/风险**：收益中高（新增 tab/内容包入口成本下降、IO 可测）；成本 1.5–2 人日；风险低（纯内部重构，DOM 契约不变）。**值得做**，排在 main.ts 之后。

### P1-3 内容目录/校验器三份手写源，已经发生可指出的漂移

**三个「源」**

1. famling：`public/content/library.json`（schema `famling.content/0.2`）+ `src/pet/content-library.ts`（4568 行校验/合并/选择/应用）。
2. 插件内容中心：`plugins/dsh-famling/client.js:129-144` 的 `ROLE_BUNDLES` / `THEMES` / `BACKGROUNDS` / `FONTS` / `CONTENT_CATALOG`（手写常量）。
3. 插件扩展契约：`plugins/dsh-famling/content-extension.mjs`（`CONTENT_PACK_SCHEMA_VERSION = 3`、`CONTENT_LIMITS`、`CHARACTER_IDS`、`THEME_IDS`）。

**已发生的具体漂移（A 级静态核对）**

| 维度 | famling | dsh-famling | 后果 |
|---|---|---|---|
| 主题集合 | `default, paper, night, high-contrast`（`public/content/library.json:152,372`） | `default, paper, night`（`client.js:83`、`content-extension.mjs:56`） | 插件内容中心看不到/选不了 high-contrast；用户以为两边是同一套 |
| 角色 id | `humanoid, dog, cat, origami`（library.json `characters`） | `human, cat, dog, origami`（`content-extension.mjs:58`） | 靠 `CONTENT_CHARACTER_PRODUCT_IDS` 手写映射；新增角色时容易漏 |
| 包体大小限制 | `maxPackBytes: 32 MiB`、`maxPackJsonBytes: 256 KiB`、`maxEntriesPerCategory: 64`（`content-library.ts:115-136`） | `maxBytes: 64 KiB`、`maxEntries: 32`、`maxEntriesPerKind: 16`（`content-extension.mjs:102-122`） | 同一条内容包在两个产品里「能不能进」标准不同；文档说「共享核心」不成立 |
| 版本号体系 | catalog `0.2` / pack `0.2`（`content-library.ts:72-87`） | extension `version: 3` / pack schema `3`（`content-extension.mjs:46,140-158`） | 对接人需要额外一份映射表；错误信息/兼容性语义不同 |

**风险**：任何「加一个角色/主题/声音」的需求要改 2–3 处，且没有测试会失败；产品侧会先发现（插件少一个主题），而不是 CI 发现。

**修复路径（分两级）**

- 短期（S，0.5 人日）：新增 `scripts/check-content-parity.mjs`（或测试）读三处数据，断言角色/主题/背景/声音 id 集合与各自声明的映射一致；立即会红并暴露 high-contrast 与 humanoid↔human。纳入 `npm run ci`/`preflight`。
- 中期（M，1–2 人日）：选一个单源——推荐 `public/content/library.json` 为唯一目录，生成插件 `client.content.js` 的 catalog 常量与 `content-extension.mjs` 的枚举（像 `embed-anims` 那样带 `--check`）；插件只保留 UI/策略差异。
- 长期（L，视发布形态）：抽成共享 npm 包（`@famling/content-model`）供两仓 consume + 版本化；但当前两仓都是「拷贝同步」，先做代码生成更划算。

**收益/成本/风险**：收益高（一次修长期漂移）；短期检查成本极低；代码生成移植风险中（需要处理插件发布包只含生成结果的问题）。**值得先做短期检查**。

### P1-4 测试金字塔倒置：主入口 0 行为测试，20 个测试读源码文本，且测试依赖仓外/生成物

**证据（A 级）**

- 124 个测试文件、1118 个测试，数量可观、29.79s 可接受——这是优点。
- 但 `grep -rl "from '../src/pet/main" tests` = **0**：应用入口的全部行为（启动顺序、consent 门、存档恢复、hero 启动、角色切换）没有行为测试。
- 20 个测试直接读源码文本（`read('src/pet/main.ts')` 等），如 `tests/consent-static.test.ts:18`、`tests/content-hub.test.ts:653`、`tests/advisers-ui-privacy.test.ts:48`；这类测试在重构时只能提供「字符串还在」的弱保证。
- 插件侧相反：`test/client-behavior.test.js`（1043 行）用自制 fake React 真正 mount `FamlingFooter`，覆盖 hooks/定时器/点击/桥接——这是本仓库测试里质量最高的模式，值得 famling 借鉴。
- 测试可迁移性差：2 个必红测试依赖兄弟仓与 gitignore 生成物（见 P0-1）；另有测试直接读写仓库内 `artifacts/`（`tests/release-sign.test.ts:45,304-305`），干净环境/并行运行有污染风险（虽已 `rmSync` 清理）。
- 构建期门禁也绑定源码文本：`scripts/verify-anims.mjs` 有 32 处 `source.includes(...)` 断言（例如 `source.includes('function onPetClick(event)')`），重命名函数会让 `npm run verify:anims` 失败——即使行为没变。

**风险**：该重构的地方不敢重构（`main.ts`/`content-hub.ts`），因为测试会在字符串层面阻止，却不会在行为层面保护；同时真正的启动/存档/权限路径缺少回归网。

**建议**

1. 为 `main.ts` 提取后的模块补行为测试（见 P1-1），优先 boot/save/content-apply 三条；DOM 可用轻量 fake（现有 `content-hub.test.ts` 已证明可行），必要时引入 `linkedom` 作为 devDependency（比 jsdom 轻）。
2. 把「策略字符串门禁」限定到真正需要的地方（法律声明、生成物 sha、版本镜像）；把「函数存在/包含某字符串」类断言改为导出函数行为断言。
3. `verify-anims.mjs` 的源码文本断言保留最小集（生成块标记、关键安全策略），其余移到 `client-behavior` 行为测试；加 `--no-assets` 之外明确的 `--embedded-only` 语义，避免发布仓误以为做了字节级校验。
4. 加覆盖率（c8）与阈值——不是为了追数字，而是确认 `main.ts`/`content-hub.ts` 的行为覆盖在上升；先在 CI 出报告，不强制卡门。

**收益/成本/风险**：收益高（解锁 P1-1/P1-2 重构）；成本约 2 人日；风险低。**值得做**，与 P1-1 同步推进。

### P1-5 插件客户端纯 JS、无 typecheck/lint/构建；host 桥接错误全部吞掉且不可观测

**证据（A/B 级）**

- `plugins/dsh-famling/package.json:7-13` 只有 `test/check/verify/embed:anims/measure:bundle`，没有 `typecheck`/`lint`/`build`。`index.js`（272 行）与 `client.js`（1037 行）是手写 JS，`client.js` 里 `FamlingFooter` 616 行、28 个 `useState`、17 个 `useEffect`、16 处 `localStorage`、26 个 `catch`。
- `index.js` 的 7 个 `catch` 全部「吞掉原因，返回固定错误码/文案」：`readBriefProjection` 区分了几种 E_MEMORY，但 `chat/task/task-delete` 一律 `E_LLM`/`E_TASK`，没有结构化日志（`index.js:187-256`）。DSH 侧排查「为什么聊天没回复」只能看客户端提示。
- `handleBridge` 的 `const text = await request.text()`（`index.js:191`）在 try 之外；`client.js` 的 `sendTask` 里 `const at = new Date(taskAt).toISOString()`（`client.js:835`）也在 try 之外——都是潜在未捕获异常（浏览器端表现为 unhandled rejection/无反馈）。
- `client.js` 有死 locale 键：`bridgeMissing` 定义了中英文两条（`client.js:362,386`），但全文件无引用；`loadSettings`/`loadConsent` 对 `JSON.parse` 结果直接对象展开（`client.js:405-411`），不校验形状，损坏的 localStorage 会把奇怪字段带进状态。
- 插件测试质量其实不错（76 个，含 fake React mount），但测试无法替代类型检查：`ROLE_BUNDLES`/`ANIMS`/`content-extension` 的字段拼写错误只能在运行时暴露。

**建议**

1. 最低成本：给 `index.js`/`client.js` 加 `// @ts-check` + JSDoc typedef（或迁移到 TS，用 esbuild 产出当前形态），新增 `npm run typecheck`（`tsc --allowJs --checkJs --noEmit`），纳入测试脚本；先修 `toISOString`/`request.text` 两个位置。
2. 加 `eslint` 或 `biome`（单文件配置即可），规则从「未使用变量/未处理 Promise」开始，不要一上来 500 条。
3. `index.js` 的 catch 加一行结构化日志（stage/op/code，绝不带 input 正文/token），让 DSH 宿主日志可定位失败类型；保持对客户端的固定文案不变。
4. 把 `content-extension.mjs` 的纯数据校验从 JS 迁移到可复用类型（或由 P1-3 的生成器产生 enum），减少手写字符串。

**收益/成本/风险**：收益中高（插件是发布物，且迭代快）；成本 1–2 人日；风险低。**值得做**。

### P1-6 持久化状态散落、无统一版本/迁移；角色切换靠整页 reload

**证据（A/B 级）**

- famling `src/pet/**` 里可数出约 30 个 localStorage key：`desktop-games/pet/content/{character,voice,dialogue-pack,theme,background,font,role-theme,installed-packs,theme-packs}`、`desktop-games/consent/*`（5 个）、`desktop-games/pet/{pet,pet.bak,scale,text-scale,hero,voice,volume,window,advisers-mode,chat-import,setup-ack-v1}` 等。只有部分 key 带版本后缀（`consent/.../v1`、`chat-import/v1`），其余无 schema 版本。
- 角色切换通过 `applyRendererChoice()` 写两个 key 后 `window.location.reload()`（`src/pet/main.ts:1163`）完成；内容中心里应用角色主题也可能走这条路径（character 变化时）。reload 简单可靠，但代价是状态重建、动画闪断，且不可在测试里验证「不 reload 的切换」。
- 插件侧 `dsh-famling/{settings,consent/v1,character,role,dialogue,theme,background,font}` 8 个 key，`loadSettings`/`loadConsent` 无形状校验（见 P1-5）；内容包/市场还预留了 `dsh-famling/market/*`。
- 已有好的基础设施可复用：`src/pet/security/safe-storage.ts` 已有 `readVersioned/writeVersioned/safeGetItem/safeSetItem`，但各调用点的 key 与 schema 仍各自为政。

**建议**

- 短期（S–M）：新增 `src/pet/state/keys.ts` + `src/pet/state/store.ts`：集中 key 常量、版本信封（`{v:1, data}`）与 `read/write/remove`，所有 UI/prefs 写入改走它；`content-library.ts` 已有的 selection 读写作参考实现。
- 中期（M）：把 character 切换改成「dispose 旧 hero → 更新存储 → 重新 `startHeroRuntime()`」，保留 reload 作为 fallback；先在浏览器 dev 页验证，再替换。
- 插件侧同构：一个 `prefsStore`（schema 校验 + 默认值 + 迁移），settings/consent 从裸 JSON 展开改为解析。

**收益/成本/风险**：收益中（减少迁移/损坏类 bug、可测）；成本 2–3 人日；风险中（character reload 语义涉及 consent/hero 时序，不要一次改完）。**部分值得做**：先做 keys/store 与插件 prefs，reload 优化延后。

### P1-7 发布产物包含演示栈与旧工具依赖，且没有 bundle 预算门

**证据（A/B 级）**

- `vite.config.ts:352-362` 构建 9 个 HTML：除产品页 `pet/setup/chat-import` 外，`index/presence/world/aquarium/stall/town` 是 P0 游戏/demo 页。产物 9.5 MiB、45 个 JS chunk。
- 依赖归因：`pixi.js` 只被 `src/demo/main.ts` 引用；`cordis` 只被 demo/game 模块引用；`@sentry/browser` 只被 `src/aquarium/main.ts` 的 telemetry 引用（`src/aquarium/main.ts:34,42`，而 `SENTRY_DSN` 来自 URL/全局，默认不存在）；`electron` 只被 `app/electron/build.mjs` 与旧探针使用。这些依赖不进入 pet 页首屏（Vite 已分 chunk），但进入安装包/构建时间，且扩大攻击面与审计面。
- pet 页首屏 JS 约 558 KB（未压缩）/184.6 KiB gzip；其中 `main.ts` 直接 import 了 `content-hub.ts` + `content-library.ts`（约 6.9k 行校验/UI），使内容中心逻辑进入首屏路径。插件侧反而做了懒载（首屏 66.1 KiB，角色 chunk 懒载）——famling 可以借鉴。
- 没有 bundle 预算门：`verify-anims` 只为插件报告字节数，没有阈值；CI 也没有对 `dist` 大小/首屏体积做检查。

**建议**

1. 增加产品构建 profile：`vite build --mode product` 只构建 pet/setup/chat-import 三页（`input` 按 mode 选择）；游戏/demo 页归到单独的 demo 构建或移到 `demos/` 包。发布产物只带产品页 + 必需资产。
2. 内容中心按插件同样思路拆懒载（`content-hub` 动态 import），首屏只保留 catalog 元数据/入口；这一步与 P1-2 拆分天然协同。
3. CI 加 size budget：pet 入口 ≤ 400 KB（未压缩）或 gzip ≤ 140 KiB；插件首屏 ≤ 80 KiB（现有 66.1 KiB 以内）；超限失败并打印 diff。
4. 清理依赖归属：`electron` 从 devDependencies 移除或移到 `tools/electron/` 的独立 package.json；`pixi/cordis/sentry` 若只服务 demo，标成 demo-only 依赖并让产品 profile 不打包。

**收益/成本/风险**：收益中（安装包/构建时间/攻击面/首屏）；成本 0.5–1 人日；风险低（测试不会因页面清单变化失败，但文档链接/演示入口要同步）。**值得做**。

---

## 5. P2 问题（可排期）

### P2-1 工具脚本 sprawl 与生成器重复

- `scripts/` 下约 62 个脚本（`.mjs/.ts/.py`）+ 12 个 `.ps1`；其中 20 个 `cdp-*.mjs` 是一次性探针（截图/布局/语音/存档），没有索引与归档约定。
- 三套像素生成器体量接近：`dog_golden5.py` 51 KB、`cat_selkirk.py` 62 KB、`human_tinglan.py` 44 KB、`gen-pet-anim-frames.py` 61 KB；绘制原语/调色板/接触表逻辑高度相似，`--check` 入口已由 `gen-pet-anim-frames.py` 委托（task-14 落地），但代码没有共享层。
- `scripts/validate-character.mjs` 68 KB、`verify-dlc-trust.mjs` 49 KB 也属于「一文件一整套工具」的形态。
- 建议：加 `scripts/README.md`（每个脚本用途/是否 CI 使用/上次使用日期），把一次性探针移到 `scripts/probes/` 或归档；生成器抽 `pixelkit.py`（调色板、轮廓、接触表、--check 框架），先共享只读原语，不强行合并画风。收益中，成本 1–2 人日，风险低（生成产物用 `--check` 验证）。

### P2-2 文档漂移与文档体积

- 当前事实：插件 0.10.0、三形象、内容中心 v2；而入口 HANDOFF 仍写「0.7.2 / 842 tests / dsh-famling 只有汀岚」。`docs/` 359 个 md、11 MiB、224 个日期文件名，入口 README 的「当前状态真值」停在 2026-11-14。
- `README.md:11` 的 remote/CI 描述与事实相反（见 P0-1）；HANDOFF §2.1 的 HEAD `8ec2951` 也已是旧值（当前 `779354b`）。
- 建议：新增 `docs/CURRENT-STATUS.md`（由脚本从 package.json、`git rev-parse`、最近一次测试摘要生成，像社区仓的 status-auto），README/HANDOFF 顶部只留「以 CURRENT-STATUS 为准 + 快照日期」；把日期型文档明确标为「历史快照，不是现值」；给 docs 加索引（至少 research/audit/design 三类）。成本 0.5 人日，风险低。

### P2-3 测试可移植性与环境假设

- `tests/release-sign.test.ts:139-160` 的 `toWindowsPath` 只接受 `/mnt/<盘>/...`：WSL 下把仓库放在 `/tmp`、`/home` 就抛 `cannot map to a Windows path`；而 `powershellAvailable()` 在 WSL 里是真（interop 可执行 powershell.exe），于是测试不是 skip 而是 fail。应把「Windows 可执行性」与「路径可映射性」两个条件分开判断，或统一 `skip` 并打印原因。
- `@types/node@22.20.5` vs CI Node 24.22.1；`package.json` 无 `engines`。建议统一 Node 24 types 或加 `engines: {node: '>=24'}` + CI 校验。
- `tests/release-sign.test.ts:45` 把临时目录放仓库 `artifacts/` 下；建议一律 `mkdtemp(tmpdir())`，避免并行/只读 checkout 下的写权限与清理问题。

### P2-4 错误处理的具体小缺陷（不属于架构层）

| 位置 | 问题 | 建议 |
|---|---|---|
| `client.js:835`（`sendTask`） | `new Date(taskAt).toISOString()` 在 try 之外；非法/半输入时间会产生未捕获 RangeError，UI 无反馈 | 移到 try 内并给 `taskEmpty` 类提示 |
| `index.js:191`（`handleBridge`） | `await request.text()` 在 try 外；body 读取失败会以异常形式冒泡给宿主路由 | 包 try，返回 `E_INPUT` |
| `client.js:362,386` | `bridgeMissing` locale 键从未使用，误导维护者以为有该分支 | 删除或接入实际分支 |
| `client.js:640-648` | 面板锚点只在 `openPanel` 时计算；窗口 resize 后悬浮面板位置可能越界 | 监听 resize（rAF 节流）或改用 `position: fixed` + CSS anchor |
| `client.js:405-411` | settings/consent 直接对象展开，不校验形状 | 加最小 schema 校验/默认值合并 |
| `hit-regions.ts:200-229` | `setInterval`/`window`/`document` 监听没有 teardown；页面生命周期内可接受，但无法在测试里停止 | 暴露 `stop()` 或注入 timer，便于测试与热重载 |

（正向：`main.ts` 的 `reportFailure`/`ErrorBoundary`、`invokeTimed` 超时、`safe-storage`、`saveInFlight` 单飞、`saveRecoveryNeeded` 的备份保护都做得比同类项目好，应保留。）

### P2-5 CI/供应链细节

- `.github/workflows/ci.yml:123-124` 的 `rust-tauri-tests` 仍 `continue-on-error: true`；建议首次绿后移除，并加 `cargo fmt --check` / `cargo clippy -- -D warnings`（Tauri crate + `native/dlc-verify`）。
- actions 未按 commit SHA pin（`actions/checkout@v4` 等）；供应链要求高的话应 pin SHA。
- 无 Dependabot/OSV；`npm audit` 在当前 npmmirror 镜像不可用（实测 404 NOT_IMPLEMENTED）；建议 CI 用 npmjs registry 跑 `npm audit --omit=dev`，或接 OSV-Scanner/GitHub dependency review。
- ci.yml 的 `linux` job 在 `npm test` 前没有针对 Windows-only 工具的显式 skip 策略；修好 P0-1 后建议在 Linux/Windows 两 job 输出中区分 `skip` 原因。

### P2-6 插件构建不可从自身仓库重建（跨仓生成物）

- `scripts/embed-anims.mjs:82-84` 默认读 `../../desktop-games/public/assets/pet/anim` 与 `../../desktop-games/public/characters`；`scripts/verify-anims.mjs:562-580` 在找不到私有资产时只打 warning 并跳过字节级比对。
- 含义：发布包里的 `client.anims.*.js`/`client.js` 生成块**无法在插件仓单独复现**；`npm run check:anims` 在独立 clone 里只能做自洽校验（幸运的是 client.js 头部的 `source-sha256` 与 chunk-sha 仍在，可作为溯源点）。
- 建议（S）：把插件所需的三套 96×96 动画源（或压缩后的源）vendor 到插件仓 `assets/`（约 350 KB 原始 PNG，索引化后 168 KB 嵌入；也可只 vendor 生成器输入清单 + sha），或加 `scripts/fetch-anims.mjs` 从私有仓/发布地址拉取并校验 sha；在 README 的「发布流程」写明 `FAMLING_ANIM_DIR` 需求。

### P2-7 `content-library.ts` 4568 行、三代 schema 并存

- 文件同时承担：v0.1 catalog 适配、v0.2 catalog、v0.1 pack、v0.2 pack（zip/远端签名契约）、角色主题、选择读写、外观应用、市场目录校验；`CONTENT_LIMITS` 一处（`:115-136`），`parseContentPackV2` 168 行（`:3703-3870`）。纯函数、测试充分（1077 行）——拆分风险低但收益也中等。
- 建议：等 P1-1/P1-2 完成后再拆（按 schema 分文件 + barrel）；同时给 v0.1 适配器定删除里程碑（例如「下一个 minor 移除」），避免永久背兼容层。当前不建议先动。

---

## 6. 重点模块逐项结论（含正向实践）

### 6.1 模块质量速览

| 模块 | 规模 | 质量判断 | 关键观察 | 建议 |
|---|---|---|---|---|
| `src/pet/main.ts` | 3555 行 | C+ | 功能覆盖完整（consent/存档/语音/hero/内容/Advisers 全接通），但单体 + 全局状态；有 ErrorBoundary/timeout 等好习惯 | 必拆（R2） |
| `src/pet/desktop-shell.ts` | 1523 行 | B | 纯函数部分（`shellMenuBlocked`、`menuNavigationTarget`、`menuTabTarget`、`rendererChoiceWrites`、`applyRendererChoice`）可测且测试覆盖；`initDesktopShell` 475 行命令式 DOM 仍偏长；`renderMenu` 嵌套 537–712 行 | 暂不拆；若菜单 IA 变更（task-62）再抽 DOM builder |
| `src/pet/content-hub.ts` | 2304 行 | C+ | `initContentHub` 约 1010 行；文件读取与 DOM 事件混在一起；测试用 fake DOM 已验证可行 | 拆（R5） |
| `src/pet/content-library.ts` | 4568 行 | A- | 纯函数、严格校验、无 DOM/网络；测试 1077 行；缺点是体量与三代 schema 兼容 | 延后拆（R10） |
| `src/pet/hit-regions.ts` | 229 行 | B+ | alpha tile + frameKey 缓存 + 读回失败回退全画布，设计合理；10Hz DOM 查询仍在（性能审计 P1-3 的残留） | 小改（可注入 timer/stop，P2-4）；不急 |
| `src/pet/hero-runtime.ts` / `hero.ts` | 1250 / 446 行 | B+ | 结果对象（`{ok:false,reason}`）而非 throw 贯穿启动；DPR/整数缩放/首帧门/释放都考虑；`main.ts` 的 rAF 已按 renderKey 只在帧变化时重绘（性能审计 P1-1 的修复在代码里可见） | 保持；hero-page 抽出后可测 |
| `src/pet/consent/*` | 约 6000 行 | B | 策略/法律门复杂度高，测试多；`gate.ts` 1054 行、`modal.ts` 1317 行、`runtime.ts` 1019 行，仍是单体但风险主要在策略变更 | 不主动重构；改动走安全审计 |
| `plugins/dsh-famling/index.js` | 272 行 | B- | handler 校验/上限/owner-only 依赖宿主，设计简洁；catch 吞错、无日志、无类型 | 加日志 + typecheck（R4） |
| `plugins/dsh-famling/client.js` | 1037 行 | C+ | `FamlingFooter` 616 行/28 hooks；但 `test/client-behavior.test.js` 用 fake React 真 mount，测试质量高 | 拆 hooks/子组件（R4） |
| `plugins/dsh-famling/scripts/{embed,verify}-anims.mjs` | 888 / 611 行 | B | 自带 PNG 编解码、索引化、注入/校验，能 `--check` 防漂移；缺点是 32 处源码字符串断言 | 减少文本断言（R8） |
| Tauri/Rust（`app/tauri/src-tauri/src/main.rs` 1201 行、`build.rs` 432 行） | — | 未深评 | 本轮只核对配置/capabilities/build.rs 与既有审计；ACL/DLC/consent 修复已有专门文档 | 单独按安全审计跟踪 |

### 6.2 应保留的工程实践（不要在重构中弄丢）

1. **失败可见化**：`main.ts` 的 `reportFailure` + `ErrorBoundary` + 启动失败屏 + `__pet.hero` 状态，避免「静默白屏」；`docs/audit` 的历史 P0 修复值得保留。
2. **IPC/网络超时**：`invokeTimed` 默认 8s、bridge 客户端 8/15/45s 超时；比多数桌面项目严谨。
3. **存储安全**：`security/safe-storage.ts`（版本信封、探测、配额）、DPAPI/WebCrypto 存档、`.bak` 恢复保护（`saveRecoveryNeeded`）。
4. **版本镜像门**：`check-version.mjs` 校验 package/lock/tauri.conf/Cargo/main.ts，6 处一致才能过。
5. **内容/资产门禁**：`embed-anims --check`、`verify-anims`、`fci:validate`、`verify:pack`、`content pack` 校验，能挡住生成物漂移与非法内容包。
6. **插件懒载**：`client.js` 首屏 66.1 KiB，角色 chunk/内容中心 chunk 按需 `require.async`；失败降级为透明占位而非崩溃。
7. **行为测试先例**：插件 `client-behavior.test.js` 的 fake React + hooks 运行时（1043 行）证明「无 DOM 也能测组件行为」，famling 可以复用到 `main.ts` 拆出的模块。

---

## 7. 重构/优化建议总表（收益/成本/风险）

| # | 建议 | 对应问题 | 收益 | 成本 | 风险 | 是否值得 | 建议顺序 |
|---|---|---|---|---|---|---|---|
| R1 | 质量门变真：修 2 个必红测试、加 `npm run ci`、建 remote 实跑 CI、更新 README/HANDOFF 状态 | P0-1 | 极高 | S（0.5–1 人日） | 低 | 值得，立刻 | 1 |
| R2 | `main.ts` 拆分（save / content-runtime / hero-page）+ 3 条行为测试 | P1-1、P1-4 | 高 | M（2–3 人日） | 中（hero/consent 时序） | 值得 | 2 |
| R3 | 内容目录单源 + drift-check（先检查后生成） | P1-3 | 高 | S+M（0.5+1–2 人日） | 低 | 先做短期检查 | 3 |
| R4 | 插件 typecheck/lint/日志 + `FamlingFooter` 拆分 | P1-5、P2-4 | 中高 | M（1.5–2 人日） | 低 | 值得 | 4 |
| R5 | `initContentHub` 按 tab/import-flow 拆分，内容中心懒载 | P1-2、P1-7 | 中高 | M（1.5–2 人日） | 低 | 值得 | 5 |
| R6 | 产品构建 profile + bundle budget + 依赖归位（electron 移出） | P1-7 | 中 | S（0.5–1 人日） | 低 | 值得 | 6 |
| R7 | 统一持久化 store/keys + 插件 prefs 校验；reload 优化延后 | P1-6 | 中 | M（2–3 人日） | 中 | 部分值得 | 7 |
| R8 | 测试策略迁移：行为测试替代源码文本断言、加覆盖率报告 | P1-4 | 高 | M（2 人日） | 低 | 与 R2 同步 | 2（并行） |
| R9 | 脚本归档/生成器共享层、CURRENT-STATUS、docs 索引 | P2-1、P2-2 | 中 | S（1 人日） | 低 | 可并行 | 8 |
| R10 | `content-library.ts` 按 schema 拆分 + v0.1 适配器退役计划 | P2-7 | 中低 | M（1–2 人日） | 低 | 延后 | 9 |

### 7.1 成本口径

- S = 0.5–1 人日；M = 1.5–3 人日；L = 3 人日以上。按「单人会写代码 + 有现成测试可跑」估算，不含评审/等待。
- 风险 = 改动引入行为回归的概率；低风险指「有测试/可机械搬运覆盖」。

### 7.2 不建议现在做的（避免把预算花在低回报处）

1. **不要先全面迁移插件到 TypeScript**：先 `// @ts-check` + JSDoc 拿到 80% 收益（R4 前半），全面迁移在 R2/R3 之后再评估。
2. **不要先动 `content-library.ts` 的 schema 设计**：它是全仓校验最可靠的部分，三代兼容是刻意决策；等 R2/R3 完成后再拆文件。
3. **不要先重构 consent 策略层**：体量大但风险/合规优先，任何改动都应由安全审计驱动，而不是「行数多」。
4. **不要为了拆而引入框架**（React/Vue/状态库）：pet 页是少量 DOM 操作，拆成模块 + 少量纯函数足够；引入框架会改变 CSP/依赖/测试面。

---

## 8. 建议先做的 3 件事（含验收与顺序）

### 第一件：让干净 checkout 通过质量门，并把 CI 变成真的（0.5–1 人日）

**做什么**

1. 修 `tests/use-restrictions.test.ts`（插件声明移回插件仓，或缺兄弟仓时明确 skip 并打印原因）。
2. 修 `tests/ui-assets.test.ts` + `public/assets/ui/manifest.json` 的 `generation.contactSheets`（指向已跟踪的 `docs/art/ui-91-qa/*.png`，或把 QA 图纳入 `public/assets/ui/qa/`）。
3. 新增 `npm run ci`（复用 `scripts/preflight.mjs`，补齐 CI 的 release-sign/repro-check smoke 步骤），本地/CI 同一条命令。
4. 推送私有 remote，确认首个 GitHub Actions run 全绿；更新 `README.md:11` 与 HANDOFF 的状态描述。

**验收**：任意目录 `git archive HEAD | tar -x` → `npm ci && npm run ci` 全绿；CI 有一次真实通过记录；`docs/research` 下不再出现「测试全绿」但无法在干净 checkout 复现的报告。

**为什么排第一**：它把后续所有重构从「靠人肉守门」变成「有护栏」，且成本最低、风险最低。

### 第二件：`main.ts` 减重第一刀 + 行为测试（2–3 人日）

**做什么**

1. 机械搬运（不改行为）：`runtime/save.ts`（约 350 行）、`runtime/content.ts`（约 550 行）、`runtime/hero-page.ts`（约 440 行）；`main.ts` 保留 boot/consent/glue，目标 < 2000 行。
2. 把模块级事件绑定收进 `wirePetEvents(deps)`，由 `initializeApp()` 调用（消除 import 即副作用）。
3. 补 3 条行为测试：启动失败→重试、坏档→备份恢复、角色主题应用→持久化+reload 分支。
4. 删除/迁移因此失效的源码文本断言（`tests/consent-static.test.ts` 等 19 处读 main.ts 的测试挑必要项保留）。

**验收**：`main.ts` 行数下降（目标 ≤ 2000）；`npm test` 全绿且新增 3 条行为测试真实通过；`npm run ci` 全绿；`window.__pet` 调试接口不变。

**风险控制**：先做 save/content 两个低风险块，hero-page（指针/拖动/DPR）最后做；每一步单独提交（等 remote 可用后）。

### 第三件：内容目录单源 + 漂移门禁（先检查，后生成）+ 插件静态检查（1.5–2 人日）

**做什么**

1. 写 `scripts/check-content-parity.mjs`（或测试）：对比 famling `public/content/library.json` 与插件 `client.js` 的 `ROLE_BUNDLES`/`THEMES`/`BACKGROUNDS`/`FONTS` 以及 `content-extension.mjs` 的枚举/限制；把映射白名单显式化（`humanoid↔human`）。纳入 `npm run ci`。
2. 根据检查结果修当前漂移：至少把 `high-contrast` 加入插件主题（或明确「插件不支持」并在 README/内容中心说明），避免静默差异。
3. 选型：中期用代码生成（library.json → 插件 catalog 常量），短期先保留手写 + 检查。
4. 插件加 `tsc --allowJs --checkJs`（或 TS 迁移）+ `eslint/biome` 最小规则；补 `index.js` catch 的结构化日志；修 `toISOString`/`request.text` 两个 try 外调用。

**验收**：drift-check 在 CI 跑；把 `high-contrast` 从 famling 删除时 CI 会失败（反向验证）；插件 `npm run typecheck` 0 错误；76+ 测试仍全绿。

---

## 9. 附录

### 9.1 复现命令（本轮实际使用的完整版）

```bash
# 当前工作树
cd /mnt/d/Projects/dsh/desktop-games
npm run typecheck
npm test
npm run version:check && npm run validate:content && npm run verify:pack && npm run fci:validate
npx vite build --outDir /tmp/dg-dist-build --emptyOutDir

# HEAD 干净导出（CI 等价）
rm -rf /tmp/dg-baseline && mkdir -p /tmp/dg-baseline
git archive HEAD | tar -x -C /tmp/dg-baseline
ln -s /mnt/d/Projects/dsh/desktop-games/node_modules /tmp/dg-baseline/node_modules
cd /tmp/dg-baseline && npx tsc --noEmit
cd /tmp/dg-baseline && npm test

# 插件
cd /mnt/d/Projects/dsh/plugins/dsh-famling
npm test
npm run verify:anims
npm run check:anims

# 结构度量（本轮用的临时脚本思路）
# 1) wc -l 关键文件；2) 用括号配平统计函数起止行；3) grep 统计模块级 let/事件/void/catch/localStorage
```

### 9.2 行号索引（证据速查）

| 主题 | 位置 |
|---|---|
| 单体入口/模块级副作用 | `src/pet/main.ts:1-185`（48 imports）、`:1537`（首个顶层监听）、`:2139`（30s autosave）、`:3344`（initializeApp）、`:3545`（顶层启动）、全文 3555 行 |
| 角色切换 reload | `src/pet/main.ts:1163`（`window.location.reload()`） |
| content-hub 单体 | `src/pet/content-hub.ts:1278-2287`（initContentHub）；文件读取在约 `:1980-2140` |
| content-library | `src/pet/content-library.ts:115-136`（limits）、`:1833`（parseContentLibrary）、`:2125`（v1 pack）、`:3703`（v2 pack）、`:4304`（market） |
| desktop-shell | `src/pet/desktop-shell.ts:414-888`（initDesktopShell）、`:537-712`（renderMenu）、`:1268-1523`（composer） |
| hit-regions | `src/pet/hit-regions.ts:53-90`（alpha tiles）、`:133`（缓存上限 512）、`:200-229`（10Hz sync） |
| 插件 host | `plugins/dsh-famling/index.js:187-256`（handleBridge）、`:191`（request.text 在 try 外）、`:264-272`（路由注册） |
| 插件 client | `client.js:412-1027`（FamlingFooter）、`:835`（toISOString 在 try 外）、`:405-411`（settings/consent 无校验）、`:362/386`（死键） |
| 插件生成器 | `scripts/embed-anims.mjs:82-84`（兄弟仓输入）、`scripts/verify-anims.mjs:562-580`（缺资产只 warning + 32 处 source.includes） |
| CI/门禁 | `.github/workflows/ci.yml:1-8,123-124`；`README.md:11`；`tests/use-restrictions.test.ts:27-45`；`tests/ui-assets.test.ts:905-910`；`public/assets/ui/manifest.json:18` |
| 测试可移植性 | `tests/release-sign.test.ts:139-160`（WSL 路径映射/PS 探测） |
| 内容漂移 | `public/content/library.json:152,372`（high-contrast）；`client.js:83`；`content-extension.mjs:46,56,58,102-122` |
| 构建 | `vite.config.ts:352-362`（9 页入口）；`package.json:46-57`（依赖） |

### 9.3 本轮未验证/限制

1. Tauri 当前源码未构建、未做 WebView2 GUI 验证；旧 exe（2026-11-14）不代表当前代码。
2. 未在真实 DSH 宿主中加载 0.10.0 插件；桥接/UI 行为以代码与测试为准。
3. 性能数字只到「产物大小/构建时长/测试时长」；帧率/内存引用历史审计（`deepseek-community-hub/docs/audit/PET-PERFORMANCE-AUDIT-2026-11-18.md`），非本轮实测。
4. 并行任务（task-54 内容模型 v2）在评审期间仍在改工作树；行号以 13:00 快照为准，最终提交后可能有小偏移。
5. `npm audit` 仅证明「当前镜像不支持」，不代表依赖无漏洞；建议按 P2-5 接 OSV/npmjs registry 复核。

### 9.4 本轮阅读的主要材料

- `README.md`、`docs/HANDOFF-2026-11-14.md`、`00-live/FAMLING-DSH-HANDOFF-2026-11-18.md`、`docs/design/CONTENT-MARKET-2026-11-19.md`、`docs/research/QA-RELEASE-AUDIT.md`。
- `docs/audit/{FAMLING-SECURITY-AUDIT-2026-11-18,RESOLUTION-DLC-SIGNING-2026-11-19,RESOLUTION-TAURI-ACL-2026-11-19,RESOLUTION-CONSENT-GATE-2026-11-19,RESOLUTION-INNERHTML-2026-11-19,RESOLUTION-AUTHENTICODE-2026-11-19}.md`（用于确认哪些 P0/P1 已关闭，避免复报）。
- `deepseek-community-hub/docs/audit/PET-PERFORMANCE-AUDIT-2026-11-18.md`、`deepseek-community-hub/docs/audit/PET-ROBUSTNESS-AUDIT-2026-11-18.md`（历史性能/鲁棒性实测口径）。
- 代码与配置：`src/pet/{main,desktop-shell,content-hub,content-library,hit-regions,hero,hero-runtime,content-assets}.ts`、`src/pet/anim/*`、`src/pet/security/*`、`src/pet/consent/*`、`public/content/library.json`、`plugins/dsh-famling/*`、`app/tauri/src-tauri/{tauri.conf.json,capabilities/*,build.rs,src/main.rs}`、`.github/workflows/*`、`vite.config.ts`、`package.json`。

---

*本文件由 review-software 于 2026-11-19 独立完成；只读评审，未改任何代码/资产/配置。*

