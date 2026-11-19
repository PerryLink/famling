# ADR-SCALE-DPI-2026-11-20：缩放四层语义、窗口溢出与 DPI 策略

> **Status: ACCEPTED（策略）；实现与验证状态见 §6。**
> **2026-11-20 更新（task-110）：D-SCALE-4 末尾登记的两个 200% 溢出缺陷已修复**，脚本探针由
> 只记录改为门禁（known-gap-fixed:*），证据见 §5.4 与 §6。
> 关联：task-109 / task-110 / MASTER-BACKLOG E5 MB-050（缩放 ADR）与 MB-054（缩放回归/DPI）；
> D7（缩放语义）裁定；实现基线 HEAD 4e50b3d，验证运行于 2026-11-20 工作树（并发任务改动见 §5.2）。
> 位置：docs/plan（与 ADR-UPDATER / ADR-IDENTITY-MIGRATION 同目录）。
> 本文件是**决策记录**，不是“真机 DPI 已验收”的声明；边界见 §5 与 §7。

## 1. 决策摘要（一句话）

famling 的缩放采用**四层语义**：整体缩放（默认、第一层）= 所有内容一起变；UI+文本 与 图像
是第二层的两个**独立轴**（相对整体缩放）；气泡/右键菜单/角色与内容中心/设置/关于是更下一层的
**组件级覆盖**（默认继承）。窗口溢出策略 = **所有可见界面必须在 480×336 CSS 窗口内完整可见**
（图像 fit-clamp、面板 viewport 相对尺寸除以 zoom、不出现文档级滚动/裁切）。DPI 策略 =
**布局以 CSS 像素计、跨 DPR 不变；设备像素只乘光栅**（hero canvas 背板 = round(CSS 尺寸 × DPR)，
截图 = 480×DPR × 336×DPR），DPR 只在启动时读取；非 1 DPI 的证据用可重复的 CDP 设备缩放矩阵
采集，但**不等于真实 Windows 显示缩放验收**。

## 2. 背景与问题

1. **MB-050 缺口**：src/pet/scaling.ts 顶部已有四级契约与 clamp/迁移/不裁切说明，tests/scaling.test.ts
   锁定纯模型；但**没有独立 ADR** 把“整体 / UI+文本 / 图像 / 组件级”与“窗口溢出 / DPI 策略”写成
   可引用的决策记录。跨端（famling 与 dsh-famling）也无法引用一份共同语义文档。
2. **MB-054 缺口**：既有 artifacts/scale-ux-verify 的 19 组截图（failures=[]）在 480×336 覆盖了
   设置/菜单/内容中心/关于，但**非 1 DPI 只采集了设置窗**；角色（折叠纸/hero）、右键菜单、
   角色与内容中心在 DPR 1.25 / 1.5 / 2 下没有截图与断言。对比度也未验证。
3. **已知历史缺口**：MB-046 记录 DPR 只在启动读一次（无 resize/matchMedia 重排）；多屏/混合 DPI/
   拔插未验。本 ADR 必须把“当前能力”和“未验证/已知缺陷”分开写，避免用浏览器模拟冒充真机。
4. **既有实现**（只读核对，不改）：src/pet/scaling.ts（模型/夹取/CSS 变量）、
   src/pet/desktop-shell.ts（写 CSS 变量 + fitScaleToViewport）、src/pet/pet.css（面板
   calc((100vw|100vh - gutter) / var(--*-zoom)) + transform scale）、src/pet/hero-runtime.ts
   （背板 = round(layout × dpr)、ctx.setTransform(dpr)）、src/pet/pixel-scale.ts（显示缩放策略）。

## 3. 决策记录

### D-SCALE-1 四层语义（ACCEPTED）

| 层 | 名称 | 语义 | 入口 |
| --- | --- | --- | --- |
| 1 | 整体缩放 | 所有内容一起缩放：角色图像 + UI/文本 + 气泡/面板 | 设置 → 常用 → 整体缩放（默认、最常用） |
| 2 | UI+文本 | 相对整体缩放的独立乘数；只影响 UI/文本/组件，不影响角色图像 | 设置 → 缩放（独立轴） |
| 2 | 图像 | 相对整体缩放的独立乘数；只影响角色图像，不影响 UI/组件 | 设置 → 缩放（独立轴） |
| 3 | 组件级 | 气泡 / 右键菜单 / 角色与内容中心 / 设置 / 关于各自乘数；默认继承 UI 缩放，可单独覆盖/恢复继承 | 设置 → 高级 · 组件缩放 |

**理由**：用户第一诉求通常是“全部大一点”；独立轴兼顾“字大图不变/图大 UI 不变”；组件级只给
高级用户，避免默认界面出现十个滑块造成认知负担。

**替代方案**：(A) 只有单一整体缩放——无法满足“只看清文字”；(B) 整体 + 图像 + 文本三层无组件级——
气泡/菜单仍会过大或过小且无法单独调；(C) 每个组件都放常用——设置面板过载。
**后果**：新增设置项必须判定属于哪一层；组件级不得默认展开；跨端（插件）必须保持一致语义
（插件侧见 MB-053 的四层模型，本 ADR 不改变插件实现）。

### D-SCALE-2 100% 基线 = 既有观感（ACCEPTED）

100% / 1× 在每一轴上都等于本模型引入前的发布观感：折叠纸宠物 2×、文本 2×、面板几何 1×。
**理由**：升级后视觉中性、不惊吓用户；纯模型可用同一个基线做测试。
**后果**：--ui-scale 默认是 2 不是 1；新增 UI 文本必须用 calc(基准px × var(--ui-scale)) 而不是
硬编码 px，否则会破坏“整体缩放=所有内容”的承诺。

### D-SCALE-3 范围、步长与生效上限（ACCEPTED）

| 设置 | 存储范围 | 步长 | 说明 |
| --- | --- | --- | --- |
| 整体 | 50%–200% | 5% | 默认 100% |
| UI+文本（相对） | 40%–150% | 5% | 1 = 跟随整体；下限保留旧 0.8 绝对文本缩放 |
| 图像（相对） | 50%–200% | 5% | 1 = 跟随整体；保留旧 1×–4× 宠物缩放 |
| 组件（相对） | 75%–150% | 5% | 默认继承（缺失=1）；组件=继承值×覆盖值 |

**生效上限（clamp，防止 480×336 内不可读/被裁切）**：UI 绝对缩放 0.8–3.5×；折叠纸图像 0.5–4×；
hero zoom 0.5–2×；组件 zoom 0.5–2×。
因此 **整体 200% 时 UI 实际被夹到 3.5×、组件夹到 1.75×**（不是 4×/2×）；这是有意的防溢出设计，
脚本 tests/scale-dpi-contract.test.ts 与 src/pet/scaling.ts 的 resolveScaleSettings 一致锁定。

### D-SCALE-4 窗口溢出策略（ACCEPTED）

窗口口径：**480×336 CSS 像素**（产品目标；实际 Tauri 窗口外框/真实像素见 §7）。策略：

1. **角色图像**：desktop-shell 用 fitScaleToViewport 以 104×90（折叠纸）或实际 hero canvas
   布局尺寸计算最大 zoom，保证 scale 后图像在窗口内（折叠纸留 8/8/12px 边距，hero 留 4/6/18px）。
2. **面板/菜单/对话框**：CSS 用
   width: min(设计宽, calc((100vw - gutter) / var(--*-zoom))) 与
   max-height: calc((100vh - gutter) / var(--*-zoom))，再 transform: scale(var(--*-zoom))；
   因此**视觉尺寸**不超过窗口减 gutter。当前 gutter：菜单 8px、设置 12px、内容中心 24px、
   关于 20px/92vh。
3. **不允许**：文档级横向/纵向滚动、面板被窗口边缘裁切、把面板做得比窗口大再靠内部滚动兜底
   （面板内部滚动是允许的，面板外框必须在窗口内）、用 --pet-scale 二次缩放 hero canvas（会双重放大）。
4. **可执行判定**：每个可见 rect（#pet、#hero-stage、#hero-canvas、#pet-shell-menu、
   .content-hub-panel、#bubble 可见时）满足 left/top >= -1 且 right/bottom <= 窗口+1 CSS px；
   document.scrollWidth/Height <= 480/336 +1。脚本
   scripts/scale-dpi-verify.mjs 在 200% 压力档逐 DPR 执行该判定。

**历史已知缺陷（2026-11-20 已修复，task-110）**：重载后“整体 200% + 金毛 hero”曾违反本策略：
hero canvas 视觉 384×384、top=-66（窗口 480×336）。根因是启动顺序：desktop-shell 在 hero
stage/canvas 还没有布局尺寸时先应用缩放，fit 回退到未夹取的 heroZoom=2。
登记 id **MB-050-overflow-global200-hero-reload**；发现证据见 §5.4。
修复（task-110）：所有尺寸可用后重新执行同一套 fitScaleToViewport ——
`requestDesktopShellScaleRefit()`（main.ts 在 hero 激活后显式调用）+ desktop-shell 对
stage/canvas/pet 的 ResizeObserver 与 `data-pet-render` MutationObserver；
修复后 --hero-zoom=1.625、canvas rect 84,6,312×312（DPR1），探针 fixed=true 并改为门禁。

**历史已知缺陷 2（2026-11-20 已修复，task-110）**：整体 200% 时对话气泡曾违反本策略：气泡
字体 10px × 3.5(UI) × 1.75(气泡组件) = 61.25px 被写进 font-size，`--bubble-zoom` 又被
transform 再乘一次（双重缩放），且定位只用未缩放的布局盒，实测（DPR1）
rect 30,-1475.031,420×1475.031、bottom=0——可见时整体在窗口上沿之外。
登记 id **MB-050-overflow-bubble-global200**；发现证据见 §5.4。
修复（task-110）：font-size 改为固定 panel 基座（组件 zoom 只由容器 transform 施加一次，与其它
面板一致）；shell-layout.ts 用“布局尺寸 × 缩放”后的实际盒子做 fitScaleToViewport 与四边夹取
（pet 上方放不下时下移到窗口 top margin，可能覆盖角色但绝不出窗；布局盒固定在 left:0、
视觉中心由 transform 携带，使折行宽度不依赖锚点）。
修复后可见 rect 4.05,4.452,471.9×119.548（DPR1），探针 fixed=true 并改为门禁。

### D-SCALE-5 DPI 策略（ACCEPTED）

1. **布局用 CSS 像素，跨 DPR 不变**：DPR 是光栅分辨率属性，不是布局属性。同一窗口尺寸、同一
   缩放设置下，1 / 1.25 / 1.5 / 2 DPR 的 rect 必须一致（容差 1 CSS px）。脚本实测 10 组
   （折叠纸/菜单/内容中心 × 默认与 200% + hero stage/canvas）maxDelta=0。
2. **栅格乘 DPR**：hero canvas 背板 = round(布局 CSS 尺寸 × DPR)，CSS 尺寸不变，
   ctx.setTransform(DPR,0,0,DPR,0,0) 让绘制仍以 CSS 像素进行；DPR 在 main.ts 里夹到 1–3。
3. **像素艺术显示缩放仍只用整数/整数倒数**（2×/1×/0.5× 等，见 pixel-scale.ts）；1.25/1.5 这类
   分数 DPR 只改变光栅密度，不得变成“1.25 倍像素画显示缩放”。
4. **截图 = 设备像素**：480×336 CSS 窗口在 DPR 1/1.25/1.5/2 下分别是 480×336 / 600×420 /
   720×504 / 960×672 PNG；若截图仍是 480×336 则视为 DPR 未生效（脚本会失败）。
5. **DPR 读取时机**：当前只在启动读一次（main.ts 传给 hero runtime），运行中改变显示缩放不会
   重排背板（MB-046）。因此**产品口径：切换 Windows 显示缩放后需要重启应用**；在实现 resize/
   matchMedia 监听前，不得宣称“运行时 DPI 自适应”。
6. **真机口径**：CDP 的 Emulation.setDeviceMetricsOverride 只模拟 devicePixelRatio；**不是真实
   Windows 显示缩放**，也不是 Tauri/WebView2 窗口。发布验收仍需 RM-08（DPI 100/125/150/175/200）、
   RM-09（多屏/混合 DPI）真机矩阵；本 ADR 不改变该要求。

### D-SCALE-6 非 1 DPI 证据协议（ACCEPTED）

1. **可重复优先**：每次证据必须能由命令重现：
   node scripts/scale-dpi-verify.mjs
   （前置 npm run build；产物 artifacts/scale-dpi-verify/run-<stamp>/report.json + PNG + latest.json）。
2. **截图必须带 provenance**：report.json 记录 HEAD/脏工作树、dist/pet.html SHA-256、Chrome 版本与
   协议版本、DPR 矩阵、viewport、逐 rect、CSS 变量、storage、raster 尺寸、exit code；
   没有 provenance 的截图不算 MB-054 证据。
3. **矩阵**：480×336 @ DPR 1 / 1.25 / 1.5 / 2；每档 3 个配置：
   默认 100%（折叠纸角色：role-shell + menu + content-center）、默认 100% + 金毛 hero
   （role-hero）、200% 压力（role-shell + menu + content-center）。角色/菜单/内容中心缺一不可。
4. **不得用本协议冒充**：真实 Windows 显示缩放、Tauri/WebView2 窗口、多屏/混合 DPI、GPU 合成、
   对比度/axe/读屏。这些都列在 report.limitations 与 §7 未验证项。

### D-SCALE-7 验证脚本与 CI 边界（ACCEPTED）

1. scripts/scale-dpi-verify.mjs 是**按需真实浏览器验证**（需要本机 Chrome/Chromium），
   默认 30s/条件、失败退出码 1、前置失败 2；它**不进入** scripts/ci.mjs，也不做成 npm script，
   避免默认 CI 依赖浏览器（tests/scale-dpi-contract.test.ts 锁定这一点）。
2. 单测（不启动浏览器）由 tests/scale-dpi-contract.test.ts 覆盖：DPR 列表/光栅换算/PNG 头/
   rect 溢出判定/跨 DPR 布局不变性/生效 clamp/ADR 契约/CI 边界。
3. 脚本与 ADR 同改：改矩阵、surface、选择器或证据字段时必须同步本 ADR 与契约测试。

## 4. 范围外 / 替代方案（记录，不实施）

- 不做“每个窗口独立缩放配置文件”（多窗口/多屏语义未定，且用户心智成本高）。
- 不做“按物理像素 N-first 选择显示缩放”（pixel-scale.ts 注释中的后续项；当前显示缩放仍按 CSS 像素
  选整数倍，DPR 只决定光栅密度）。
- 不做自动 DPI 迁移（Windows 显示缩放切换后自动重排）——MB-046 未实现前只承诺重启生效。
- 不做浏览器缩放（Ctrl+加减）支持；产品入口只认四层设置。

## 5. 本轮验证与证据（2026-11-20，真实运行）

### 5.1 运行环境与产出

| 项 | 实测值 |
| --- | --- |
| 命令 | 干净 HEAD worktree 中 npm run build + node scripts/scale-dpi-verify.mjs |
| 结果 | 发现阶段：RESULT: PASS；28 张矩阵截图 + 2 张已知缺口截图；267 项检查；failures=0。修复后（task-110）：RESULT: PASS；28 张矩阵截图 + 2 张溢出门禁截图；**269 项检查**（267 矩阵 + 2 个 known-gap-fixed 门禁）；failures=0；两个原 known-gap 探针 `policyViolated=false / fixed=true` |
| 主证据 | 发现阶段：artifacts/scale-dpi-verify/head-4e50b3d/report.json + 30 PNG（worktree 跑完归档回主仓）；修复后：artifacts/scale-dpi-verify/run-20261120-041133/report.json + 30 PNG |
| 脚本 | 发现阶段 SHA-256 f4fbadd62d91c63e60a4f235431eb439dfc514650a3085162fea81e8e9e83e53；修复后 SHA-256 fa1852300935fa8d3b0a263fbba1c731963caa1f74db688d1651451aff9752b0（report.toolSha256） |
| 环境 | WSL2 Linux；Node v24.22.1；Windows Chrome 157.0.8103.79（headless=new，CDP Protocol 1.3） |
| 基线 | HEAD 4e50b3d（git worktree --detach 干净检出；只额外放入本 ADR/脚本/测试与 node_modules 链接，src/public 为 HEAD 原样） |
| dist | 发现阶段 dist/pet.html SHA-256 a630a6b4f3760e311184d0c5d51f85c76e7508be146c9db1609f93fa992d354c；修复后 dist/pet.html SHA-256 1115918c0dc5039b6c651f75c332045e982f9ea5aaeafe8d262f9c1fc322555a |
| 耗时 | 发现阶段 durationMs 32834；修复后 durationMs 33007 |
| 可重复性 | 同一命令在开发工作树（含并发任务改动）重跑：修复后 28 矩阵截图 + 2 溢出门禁截图、269 检查、failures=0，两个原 known-gap 探针 fixed=true —— artifacts/scale-dpi-verify/run-20261120-041133/report.json（latest.json 指向最近一次）；发现阶段对照见 run-20261120-035518/report.json |

### 5.2 矩阵与逐 DPR 实测（摘要）

| DPR | 截图级 | 角色（折叠纸 #pet） | 菜单 #pet-shell-menu | 内容中心 .content-hub-panel |
| --- | --- | --- | --- | --- |
| 1 | 480×336 | 208×180 @136,144 | 230×234 (200%: 402.5×327.988) | 456×309.109 |
| 1.25 | 600×420 | 同上（CSS 像素完全相同） | 同上 | 同上 |
| 1.5 | 720×504 | 同上 | 同上 | 同上 |
| 2 | 960×672 | 同上 | 同上 | 同上 |

- 200% 压力档：折叠纸 fit-clamp 到 3.511×（rect 365.144×315.99，在窗口内）；菜单 402.5×327.988
  （right 476 / bottom 332.738）；内容中心面板 456×309.094。全部无文档溢出。
- hero（100%）：stage 192×192 @144,126；canvas CSS 192×192、背板 192/240/288/384（DPR 1/1.25/1.5/2
  实测 4 档全部吻合 round(CSS×DPR)），painted>500。
- 跨 DPR 布局不变性：10 组（默认/200% 下的折叠纸、菜单、内容中心 root/panel；hero stage/canvas），
  maxDelta 全部 = 0（容差 1 CSS px）。

### 5.3 运行期 DPR 变化探针（MB-046，只记录、不设门禁）

DPR 1→1.5 不重载：devicePixelRatio 报 1.5，但 hero canvas 背板仍 192×192（应重算为 288×288），
backingStoreRecomputed=false。结论：运行时切换显示缩放不生效，重启后生效；见 D-SCALE-5 第 5 条。

### 5.4 两个 200% 溢出缺陷：发现 → 修复（task-110，2026-11-20）

两个缺陷的**发现证据**保留在 artifacts/scale-dpi-verify/head-4e50b3d/（发现阶段真实运行）；
修复后证据在同一命令的新 run（见 §5.1），探针由“只记录”改为**门禁**：
`known-gap-fixed:MB-050-overflow-global200-hero-reload` /
`known-gap-fixed:MB-050-overflow-bubble-global200`（回归即 failures>0）。

**缺陷 1（已修复）：MB-050-overflow-global200-hero-reload**

- 发现：整体缩放 200% + 金毛 hero，重载后；hero canvas rect 48,-66,384×384（top=-66），
  heroStageRect 144,126,192×192；fit violations = [top]；vars.hero=2（未夹取）。
  截图 artifacts/scale-dpi-verify/head-4e50b3d/known-gap-hero-max-dpr1.png
- 根因：启动顺序 —— desktop-shell 在 hero stage/canvas 还没有布局尺寸时先 applyScale()，
  fit 分支因 width/height=0 回退到 resolved heroZoom=2；canvas 之后才拿到 192px CSS 尺寸，
  却再没有重新 fit，于是视觉 384px 从 bottom centre 上溢（top=-66）。
- 修复：`requestDesktopShellScaleRefit()`（main.ts 在 `data-pet-render='hero'` 后调用）；
  desktop-shell 用 ResizeObserver 观察 stage/canvas/pet、用 MutationObserver 观察
  `data-pet-render`，任何晚到尺寸变化都重新执行同一套 fitScaleToViewport（同 margin 4/6/18）。
- 修复后实测（同一探针，DPR1）：vars.hero=1.625；heroCanvasRect 84,6,312×312（right 396 /
  bottom 318），heroStageRect 144,126,192×192；fit violations=[]；policyViolated=false /
  fixed=true；截图 artifacts/scale-dpi-verify/run-20261120-041133/known-gap-hero-max-dpr1.png。

**缺陷 2（已修复）：MB-050-overflow-bubble-global200**

- 发现：整体缩放 200% + 折叠纸角色，DPR1；给 #bubble 填入真实长度句子并让它可见后重新锚定。
  实测 bubble rect 30,-1475.031,420×1475.031（right 450 / bottom 0）；font-size 61.25px；
  transform scale(1.75)；fit violations = [top]（bottom=0 意味着可见时整块都在窗口上方）。
  截图 artifacts/scale-dpi-verify/head-4e50b3d/known-gap-bubble-max-dpr1.png
- 探针口径：产品 say() 路径会请求 TTS 同意而在 headless 里阻塞，因此探针用真实 DOM 节点 +
  真实句子 + resize 重新锚定来测同一套 CSS 布局；不调用 say，不写 storage。
- 根因（两层）：① 双重缩放 —— font-size 已含 ui-scale × bubble-zoom，桌面 CSS 又用
  transform scale(--bubble-zoom) 再乘一次；② 定位只用未缩放的布局盒（offsetWidth/Height），
  没有用“布局尺寸 × zoom”的可见尺寸做视口夹取，也没有高度方向的上沿约束。
- 修复：pet.css 气泡 font-size 改为固定 panel 基座（组件 zoom 只由容器 transform 施加一次，
  与菜单/设置/内容中心一致）；shell-layout.ts 用实际可见尺寸（布局 × 适配后 zoom）执行
  fitScaleToViewport(desired, layout, viewport, margin=4) 后再做左右/上下四边夹取：
  放不下 pet 上方时下移到 top margin（可能覆盖角色但不出窗）。布局盒固定 left:0、视觉中心由
  transform 携带，保证“测量到的折行宽度 = 用户看到的折行宽度”。
- 修复后实测（同一探针，DPR1）：font-size 20px；transform scale(1.573)；bubble rect
  4.05,4.452,471.9×119.548（right 475.95 / bottom 124），fit violations=[]；
  policyViolated=false / fixed=true；截图
  artifacts/scale-dpi-verify/run-20261120-041133/known-gap-bubble-max-dpr1.png。
- 判定：不再违反窗口溢出策略；矩阵的 200% 档截图里气泡仍是隐藏态（opacity 0），所以矩阵检查
  与探针门禁是两条独立证据，**仍不得**把 CDP 矩阵冒充真机 DPI 验收（见 §7）。

## 6. 与 MB-050 / MB-054 的对账

| 项 | 本 ADR 后状态 | 说明 |
| --- | --- | --- |
| MB-050 缩放 ADR | **满足** | 本文件给出四层语义、clamp、窗口溢出与 DPI 策略、证据协议、已知缺口；实现引用 scaling.ts/desktop-shell/pet.css |
| MB-054 非 1 DPI 角色/菜单/内容中心 | **非 1 DPI 部分满足（模拟证据）** | DPR 1.25/1.5/2 三角色面 + 菜单 + 内容中心截图与断言；见 §5 |
| MB-054 真机 DPI | **仍开放** | RM-08/RM-09 需要 Windows 真机改显示缩放/多屏；本 ADR 不冒充 |
| MB-054 对比度 | **仍开放** | 未做对比度/axe/读屏；建议独立任务 |
| MB-046 运行时 DPR | **仍开放（已记录）** | 只启动读取；探针证据见 §5.3；产品口径=重启生效 |
| 200% + hero 溢出 | **已修复（task-110，2026-11-20）** | MB-050-overflow-global200-hero-reload；--hero-zoom=1.625、canvas 312×312 在窗内；门禁 known-gap-fixed:*（failures=0）；证据 §5.4 |
| 200% + 气泡溢出 | **已修复（task-110，2026-11-20）** | MB-050-overflow-bubble-global200；可见 rect 4,4,472×120 在窗内；门禁 known-gap-fixed:*（failures=0）；证据 §5.4 |

## 7. 明确不覆盖 / 不得宣称

1. **真实 Windows 显示缩放**：本 ADR 与脚本的 DPR 是 CDP 设备缩放模拟，不是 Windows 设置里的
   100/125/150/200%；不得作为 RM-08 真机验收。
2. **Tauri/WebView2 原生窗口**：未启动 Tauri；透明/置顶/无边框窗口、真实外框像素、Rust 窗口代码
   未验。
3. **多屏 / 混合 DPI / 拔插 / 负坐标**：RM-09 仍未做。
4. **GPU/合成质量**：headless=new + --disable-gpu；不测 GPU 合成、帧率、清晰度主观观感。
5. **对比度/axe/读屏/字体可读性**：未验证（MB-054 对比度仍开放）。
6. **不伪造**：本 ADR 与 report 的数字全部来自真实运行输出；未跑的项目一律写“未验证”，
   不得用模拟矩阵替代真机或发布验收。

## 8. 维护指南

- 改缩放语义/夹取：同步 src/pet/scaling.ts、tests/scaling.test.ts、tests/scaling-shell.test.ts、本 ADR §3。
- 改面板 CSS 溢出规则：同步 src/pet/pet.css、tests/scaling-shell.test.ts、本 ADR D-SCALE-4。
- 改气泡 fit/anchor（--bubble-zoom、宽度、fit/clamp 策略）：同步 src/pet/shell-layout.ts、
  src/pet/pet.css、tests/scale-overflow.test.ts、tests/e11-coverage-gaps.test.ts、脚本
  MB-050-overflow-bubble-global200 探针与本 ADR D-SCALE-4。
- 改 hero 启动/重载 fit：同步 src/pet/desktop-shell.ts、src/pet/main.ts、
  tests/scale-overflow.test.ts、脚本 MB-050-overflow-global200-hero-reload 探针与本 ADR。
- 改 DPR/背板：同步 src/pet/hero-runtime.ts、src/pet/main.ts、本 ADR D-SCALE-5、脚本探针。
- 改矩阵/surface/选择器：同步 scripts/scale-dpi-verify.mjs、tests/scale-dpi-contract.test.ts、本 ADR §5。
- 两个 200% 溢出缺陷已于 task-110 修复并改成门禁（known-gap-fixed:*）：回归会让
  scripts/scale-dpi-verify.mjs failures>0；不要静默删除历史证据（§5.4 保留发现阶段数据）。
- 真机 RM-08/09 有结果后：在 §6 更新状态并链接 artifacts 证据；无 provenance 的截图不算证据。

## 9. 引用

- 模型与 clamp：src/pet/scaling.ts（SCALE_MODEL_VERSION=2，范围/上限常量，resolveScaleSettings）
- 应用与 fit：src/pet/desktop-shell.ts（applyScale/applyScaleVariables，fitScaleToViewport）
- 溢出 CSS：src/pet/pet.css（--menu-zoom/--settings-zoom/--hub-zoom/--about-zoom/--bubble-zoom）
- 背板/DPR：src/pet/hero-runtime.ts（canvas.width=round(layout*dpr)）、src/pet/main.ts（DPR clamp 1–3）、
  src/pet/pixel-scale.ts（显示缩放策略与 DPI 说明）
- 气泡锚点/fit：src/pet/shell-layout.ts（fitBubbleZoom / resolveBubblePlacement）
- hero 晚布局 refit：src/pet/desktop-shell.ts（requestDesktopShellScaleRefit + 布局观察器）
- 测试：tests/scaling.test.ts、tests/scaling-shell.test.ts、tests/scale-dpi-contract.test.ts、
  tests/scale-overflow.test.ts（溢出回归：纯 fit/anchor + fake-DOM hero refit + CSS 契约）
- 脚本：scripts/scale-dpi-verify.mjs（本 ADR 的可执行矩阵）
- 既有证据：artifacts/scale-ux-verify/results.json（DPR1 的 19 组，failures=[]）
- 任务/缺口：MASTER-BACKLOG-2026-11-19.md（MB-050/054、D7）、EXECUTION-STATUS-2026-11-20.md
