# Famling / dsh-famling 游戏工程师视角全项目评审（2026-11-19）

| 项 | 内容 |
|---|---|
| 文档 | `docs/research/PROJECT-REVIEW-GAME-2026-11-19.md`（私有仓 `desktop-games`，本评审唯一写入物） |
| 日期 | 2026-11-19（Asia/Shanghai，快照约 12:50–13:05） |
| 评审人 | review-game（子代理，task-58） |
| 范围 | `DG/` = `<private-path> = `<private-path> checkout `/home/yy/deepseek-harness` 只读 |
| 形式 | **只读评审**：未改任何代码/资产/配置；只新增本文件；未 commit/push；未联网；未读取或打印任何凭据 |
| 快照 | `desktop-games` branch `master`，HEAD `779354b`（2026-11-19），工作树 **20 项未提交**（内容中心 v2/角色主题 UI 正在并行落地）；插件本地 0.10.0 |
| 读者 | lead；动画/内容/DLC/游戏基座方向的后续执行者 |

---

## 0. 执行摘要

**一句话**：动画/角色子系统本身已经达到「可玩原型」的质量——12 clip 计时契约、holdMs 非均匀播放、三套 68/72/68 帧资产、命中区与点击穿透都有代码/测试/实机证据；但**作为游戏/内容平台，当前有三个结构性缺口**：

1. **内容市场/角色主题只能交付「数据与换皮」，不能交付「新角色」**：运行时角色注册表仍是硬编码 4 个 id，动画资产包没有进入 `famling.content-pack/0.2`/远程市场契约，第三方角色最多复用 dog/cat/humanoid 三套 rig（见 P0-1）。
2. **发布构建的 DLC 实为「全失败」**：生产签名信任根 `keys: []`，仓库内两个 pack 只有 dev/legacy 签名；release 模式 `verify_pack_embedded` fail-closed 拒绝一切包（我用仓库内 verifier CLI 实测复现），CI 却是绿的（见 P0-2）。
3. **玩法循环尚未定义/验证**：桌宠只有 ambient + 三区点击 + bond/纸片计数（bond 100 封顶），三个游戏 demo 仍是 `demo: true` 的旧原型、三套时间尺度；`docs/GAMEPLAY-AUDIT-2026-11` 的结论（三款都不够好玩）没有被后续数据推翻，README 记录的试玩 gate 仍是「未执行，需真人」（见 P0-3）。

**评级：P0 × 3、P1 × 8、P2 × 9。** 其中 P0-1/P0-2 是工程可执行项；P0-3 是 owner 必须拍板的产品形态问题（否则内容市场/DLC 的投入有路线级返工风险）。

**先记住这 6 条实测事实（全部见 §10 证据索引）**：

1. `npm test`（famling 私有仓当前工作树）→ **tests 1118 / pass 1118 / fail 0**（28.15 s）；`npx tsc --noEmit` → exit 0。
2. 插件 `npm test` → **76/76**；`embed-anims.mjs --check` 与 `verify-anims.mjs` 全绿；`measure-bundle.mjs` 实测 entry **66.1 KiB**、首帧（+human chunk）**127.9 KiB**、三角色全量 **313.5 KiB**。
3. 动画资产 = 208 帧（dog 68 / cat 72 / human 68），源 PNG 351.6 KiB；三套生成器 `--check` 全部通过（dog + cat + human，human 68 唯一帧/≤19 色/地线 y=89）。
4. holdMs 已经不是「只存在数据里」：`src/pet/hero.ts:229-250` 与 `plugins/dsh-famling/client.js:260-278` 都按逐帧 holdMs 播放（旧审计的 P0 已修）。
5. 资产预算被 **baked WAV** 支配：`public/assets/voice/pet` 42 个 WAV 共 **4,289,208 B（约 4.2 MB）**，占 `public/` 7.0 MB 的约 60%、`dist/` 8.8 MB 的约 48%；格式 24 kHz/mono/16-bit（我实测第一句 1.000 s = 48,044 B）。
6. DLC 实测：`native/dlc-verify/target/release/dlc-verify --print-trust` → active/retired/revoked 全空；对 `packs/farm-seasons` 返回 `ok:false`，错误信息为 `trust root contains no signing keys; DLC verification is fail-closed until a production key is provisioned`。

**建议先做 3 件**（详细收益/成本/风险见 §8）：

1. **把角色/动画纳入可签名内容包**：定义 `famling.pet-anim/0.2` 资产包（帧/atlas + clip/holdMs + anchor/footBox + regions + 预览 + 许可/AI/用途声明 + sha256 + 签名），并把 `HERO_CHARACTER_IDS` 改成数据驱动注册表 + 热切换；否则内容市场永远只能卖主题/皮肤。
2. **闭合发布信任链**：owner 执行生产 Ed25519 ceremony → 写 `production-trust-root.json` → 用生产 key 重签两个 pack（`signature.json`）→ release 模式 `verify-dlc-trust --staged/--exe` + CI 门禁；否则 DLC/市场在安装包里永远是 `skipped:`。
3. **收敛动画运行时 + 削资产预算**：让唯一一套调度器（behavior/SceneRuntime）成为事实源，删除或接入 `anim/idle.ts` 死代码；WAV→Opus/OGG（估算 4.2 MB → 0.4–0.6 MB）+ 首屏 idle-first；然后做一次真实 Windows GUI 的点击/缩放/多显示器/懒载验证。

---

## 1. 评审范围、方法与限制

### 1.1 快照与工作树状态

- 私有仓 `desktop-games`：`master`，HEAD `779354b`（`docs(content): align shared catalog mapping with dsh-famling 0.9.1 content-extension v2`）。
- 工作树 **20 项未提交**：`src/pet/{main,desktop-shell,content-hub,content-library}.ts`、`pet.html`、`pet.css`、`public/content/*`、`tests/content-*` 等（内容中心 v2 UI / 角色主题并行落地中）；另有 `docs/art/CALIBRATION-SET-2026-11-16.md`、`docs/content-packs/` 等未跟踪新文件。**本评审按工作树读取；v2 UI 合并后 §2.9 与 P0-1 的部分细节需复核一次。**
- 插件 `plugins/dsh-famling`：0.10.0；不是 git 仓库（本地目录靠拷贝/软链同步）。
- 私有仓 `git remote -v` 为空（实测）；README:11 写「私有远端已建（PerryLink/desktop-games）」与 HANDOFF §2.1（`FAMLING-DSH-HANDOFF-2026-11-18.md:75`「无 Git remote」）冲突——这直接影响「CI 是否真的在跑」（见 P2-6）。

### 1.2 我实际执行的命令与结果（第一手）

`DG/`：

```text
npm test                     -> tests 1118 / pass 1118 / fail 0（28.15 s）
npx tsc --noEmit             -> exit 0
python3 scripts/gen-pet-anim-frames.py --check
  -> dog 生成；cat 委托 scripts/gen-cat-anim.py --check；human 委托 scripts/gen-human-anim.py --check
  -> check ok: dog + cat + human animation packs verified
python3 scripts/gen-cat-anim.py --check   -> check ok
python3 scripts/gen-human-anim.py --check -> 68 frames, 68 unique, max 19 colours, ground y=89；ok
```

`DF/`：

```text
node --check client.js / index.js              -> syntax ok
npm test                                       -> tests 76 / pass 76 / fail 0
node scripts/embed-anims.mjs --check           -> check ok: client.js + 3 lazy character chunks match the asset pack
node scripts/verify-anims.mjs                  -> OK（首屏 client.js 66.1 KiB；首帧 127.9 KiB；全量 313.5 KiB）
node scripts/measure-bundle.mjs                -> entry 66.1 KiB / gzip 18.9 KiB / brotli 15.7 KiB（-78.5% vs 314,762 B 基线）
```

`native/dlc-verify/target/release/dlc-verify`（仓库内已有构建产物）：

```text
--print-trust        -> devOverrideAvailable: true; trustRoot.active/retired/revoked 均为 []
packs/farm-seasons   -> ok:false；错误 trust root contains no signing keys; DLC verification is fail-closed until a production key is provisioned
```

（注：该二进制是带 dev-trust 的构建，`devOverrideAvailable:true`；但 active key 为空这一点对 release 构建更严格——release 编译期嵌入同一份 `production-trust-root.json` 且禁用 override，结论一致：**当前任何 release 构建都无法验过一个 DLC 包**。）

其它只读实测：`du -sh`/`find`/`wc` 统计资产与行数；PIL/numpy 计算 idle_blink 与 idle_00 像素差；`git status`/`git remote -v`/`git log`；对源码/文档做 grep 证据定位。

### 1.3 未验证 / 不在本次范围

- **没有**在 Windows/Tauri 实机上重跑 UI、点击穿透、多显示器 DPI、插件真实 GUI Network；相关结论中标注〔推断〕的部分必须实机验证。
- **没有**做真人 playtest；所有「好玩/留存」判断引用 `docs/GAMEPLAY-AUDIT-2026-11.md` 的历史审计结论，不是本次新数据。
- **没有**重跑 cargo/Tauri 构建、未跑 `cargo test`、未跑 release 签名流水线；DLC 结论来自 verifier CLI + 代码/文档交叉。
- 未评审安全/网络/法务细节本身（见既有审计与同批 review-network 文档），只引用与游戏系统相关的结论。

### 1.4 严重度口径（本评审）

| 级别 | 定义 |
|---|---|
| **P0** | 阻断「可玩角色/可发布 DLC/产品形态」成立，或继续投入会造成路线级返工；必须在下一阶段前修/拍板 |
| **P1** | 让内容/循环/资产难以扩展或用户体验明显受损；下一阶段前应修（部分需实机验证） |
| **P2** | 打磨、验证缺口、文档漂移、边界体验；可排期 |

---

## 2. 游戏系统现状盘点

### 2.1 两端运行时拓扑

| 面 | famling（Tauri 独立版） | dsh-famling（DSH 插件） |
|---|---|---|
| 显示 | 480×336 透明置顶窗（`app/tauri/src-tauri/tauri.conf.json:13-26`），`pet.html` 单窗口；`--game=` 路由到 aquarium/town/stall 页面 | DSH 左下 `sidebar.footer.action`，72 px 图，React 客户端模块 |
| 渲染 | Canvas 2D：`src/pet/hero.ts`（`CharacterRenderer`，96 art px × 1/2/4 整数缩放）+ `hero-runtime`（多 actor、state→tag）+ `render/hero-backend`（每 pack 私有 stage canvas + blit） | `<img>` 逐帧 data URL（每帧 `data:image/png;base64,...`），懒加载 chunk |
| 驱动 | `main.ts` rAF 60 Hz → `hero.tick` + dirty `renderKey` 门控；SceneRuntime 行为步进固定 4 Hz（`src/pet/scene/runtime.ts:156,370-400`） | `setTimeout` 逐帧（holdMs 优先，否则 1000/fps），眨眼 3.6–6.2 s，随机微动作 11–20 s |
| 输入 | canvas 指针命中（alpha tile 点击穿透）、`regions.json` 三区、右键菜单、拖拽 >6 px 调 `startDragging()` 移动窗口 | 点击图片按 96 逻辑画布映射头/身/尾；互动菜单读嵌入 `regions.actions` |
| 游戏页 | `--game=aquarium|town|stall|farm|pet` 分页；每页独立 `setInterval(250)` + `WallClockStepper` | 无游戏页 |

结论：这不是一个「引擎」，而是**一个桌宠运行时 + 三个各自独立的小游戏页面**。桌宠运行时相对完整；游戏页面是三套并行实现（时间尺度、存档、离线策略都不同，见 P2-7）。

### 2.2 动画管线（当前真实状态）

```text
scripts/gen-pet-anim-frames.py (1402 行)      dog   -> scripts/dog_golden5.py (1241 行)
scripts/gen-cat-anim.py (400 行)              cat   -> scripts/cat_selkirk.py (1416 行)
scripts/gen-human-anim.py (664 行)            human -> scripts/human_tinglan.py (1110 行)
生成物 -> public/assets/pet/anim/{dog,cat,human}/{12 clip}/<clip>_NN.png + manifest.json
测试/门禁: gen-*.py --check（字节）、tests/pet-anim*.test.ts（契约/磁盘/色调/地线）、hero.ts validateCharacterPack
插件: scripts/embed-anims.mjs 读 manifest/PNG + regions.json -> client.{js,anims.*.js}（无损索引 PNG 重编码）
```

- 契约：`famling.pet-anim/0.1`（`src/pet/anim/manifest.ts:34`），12 clip；画布 96×96、anchor 48/96、footBox `-36,-18,72,18`、地线 y=89；硬 alpha、1 px 闭合轮廓、≤20 色。
- 计时表：`src/pet/anim/clips.ts` 单一 TS 表 + 唯一 per-character override（cat `stand_wag` 10 帧/6 fps/3200 ms/holdMs，`clips.ts:29-39,60-66`）；`FPS_BANDS` 只在 `types.ts:98-103` 约束 idle/walk/run/attack。
- 播放：`hero.ts:229-250` 优先 `holdMs` 累加（非均匀 attack 439 ms、cat 伸懒腰 3.2 s），否则均匀 `floor(elapsed/1000*fps)`；插件 `client.js:260-278` 同策略——**旧审计「holdMs 不在屏幕上」的 P0 已关闭**。
- 占位美术：三套均为脚本确定性生成的占位包（`placeholder`/`ai:none`），还不是最终美术；设计替换契约见 `docs/design/PET-ANIMATION-2026-11-18.md` §9。

### 2.3 12 clip × 3 角色：计时与可达性（当前工作树）

| clip | 帧/fps/duration | holdMs | dog | cat | human | 运行时入口（standalone / plugin） |
|---|---:|---|---|---|---|---|
| idle | 6/6/1000 ms loop | – | ✅ | ✅ | ✅ | 基础循环 / 基础循环 |
| idle_blink | 3/12/250 ms | – | ✅ | ✅ | ✅ | 行为 ambient + 眨眼 / 定时替换 |
| walk | 8/10/800 ms loop | – | ❌ | ❌ | ❌ | **无 state/slot/action/EVENT_CLIPS → 死 clip** |
| run | 6/14/429 ms loop | – | ✅ | ✅ | ❌ | 狗/猫「跑一跑」action；human 无入口 / 同左 |
| pat_head | 4/8/500 ms | – | ✅ | ✅ | ✅ | 摸头 / 点头部 |
| ball_throw | 5/10/500 ms | – | ✅ | ❌ | ❌ | 仅狗「丢球」/ 同左 |
| ball_chase | 6/12/500 ms | – | ✅ | ❌ | ❌ | 仅狗丢球 follow-up/捡球 / 同左 |
| paw_face | 5/8/625 ms | – | ✅ | ✅ | ✅ | ambient 微动作 + cat「洗脸」/ micro |
| scratch | 6/8/750 ms | – | ✅ | ✅ | ✅ | ambient 微动作 / micro |
| stand_wag | 6/8/750 ms（cat 10/6/3200 ms + holdMs） | cat 用 holdMs | ✅ | ✅ | ✅ | regions body / 同左（猫 3.2 s 慢伸展） |
| chase_tail | 6/10/600 ms | – | ✅ | ✅ | ✅ | ambient + regions tail / micro + 点尾 |
| attack | 7/16/439 ms 非均匀 | 83/83/63/42/42/63/63 | ❌ | ❌ | ❌ | **无任何 UI/事件触发 → spec-only** |

证据：`src/pet/anim/clips.ts:44-58`、`public/characters/pet-dog/regions.json:92-146`、`client.js:34-45`、`behavior.json:22-41,43-126,235-246`。旧研究 `docs/research/PET-ANIMATION-TIMING-2026-11-18.md:192-206` 已指出同一可达性矩阵；后续没有接入口。

**工程量含义**：`walk`+`attack` 每角色 15 帧，共 45/208 帧（21.6% 帧数）没有用户可见出口；cat/human 的 `ball_throw`+`ball_chase` 11 帧也没有入口。若按帧数线性折算，插件动画 payload 中约 1/4 是死内容（估算，非逐帧字节实测）。

### 2.4 资产预算（实测口径）

| 类别 | 大小 | 说明 |
|---|---:|---|
| `public/` 总计 | 7.0 MB（573 文件） | `public/assets` 6.3 MB + `public/legal` 632 KB + `public/content` 48 KB + `public/characters` 104 KB |
| `public/assets/voice` | **4.2 MB**（42 WAV） | 24 kHz/mono/16-bit；42 句共 4,289,208 B；默认随 dist/安装包发布（`vite.config.ts:56-130` baked-voice guard 强制 42 行） |
| `public/assets/pet` | 1.9 MB | 三套 anim 300/280/280 KB + 传统 pet 占位/tinglan-256 等 |
| 三套动画源 | **351.6 KiB**（208 帧 PNG） | dog 108.3 / cat 159.6 / human 83.8 KiB；插件无损重编码后 167.8 KiB / base64 224.0 KiB |
| 插件分发 | entry 66.1 KiB；首帧 127.9 KiB；全量 313.5 KiB（gzip 170.4 KiB） | human 61.7 / cat 108.0 / dog 77.6 KiB 懒 chunk；内容中心 24.3 KiB 懒 chunk |
| `dist/` | 8.8 MB / 103 文件 | voice 4.2 MB + pet 1.9 MB + ui 172 KB + 其余（JS/CSS/HTML/legal/characters 等） |
| 安装物（文档记录，非本次实测） | NSIS 约 4.35 MB / exe 约 17.5 MB / 公开 CI artifact 14.3 MB | 见 HANDOFF §12 与 `docs/audit/RESOLUTION-AUTHENTICODE-2026-11-19.md` |

判读：**动画本身很便宜（351.6 KiB 源数据），语音才是预算大头（4.2 MB，约 60%）**。如果目标是「桌宠常驻、安装包可控」，优化顺序应是 WAV→Opus、再谈帧/atlas，而不是继续给 96 px 占位帧加内容。

### 2.5 DLC / pack 管线（现状）

- 数据模型：`src/pack/manifest.ts:11-24`（id/version/contentApi/minBase/entitlement/content/files[] sha256）+ `signature.txt`；`loader.ts:57-141` 校验顺序 = manifest schema → ABI → minBase → entitlement → signature → 逐文件 sha256 → 内容 schema；内容只有 `items/crops/buildings/fish/decorations` 五类（`loader.ts:26-39`、`dlc-content.ts:22-33,273-288`）。
- 运行路径：Tauri `dlc_verify`（`main.rs:688-716`）Rust 验签+哈希 → 返回 JSON → webview `validateDlcPack` 二次 schema/ABI/bounds → `contentPackFromData` mount（farm 路由 `src/demo/main.ts:44-63`；aquarium `src/aquarium/main.ts:86-92` 用 `dlc_list` + `dlc_verify`；town/stall 的 capability 未授予 dlc 命令且 `GAMES.packs` 为空）。
- 信任：release 编译期嵌入 `production-trust-root.json`（`native/dlc-verify/src/lib.rs:18-24,303-320`）；debug 才允许 `--dlc-key`/dev key（`main.rs:1044-1056`）；当前 `production-trust-root.json:8` 为 `keys: []`。
- 随包内容：`tauri.conf.json:47-49` 把 `packs/farm-seasons`、`packs/reef-pack` 复制进安装包 resources；两个包是 dev key/legacy 签名（`packs/*/signature.txt`）。
- 结论：DLC 管线是**数据包**管线，不是资产包管线；且发布信任根为空 → release 下 DLC 全 fail-closed（见 P0-2）。

### 2.6 游戏循环与时间（清单）

| 循环 | 频率 | 位置 | 说明 |
|---|---|---|---|
| 桌宠 rAF | 显示刷新率（约 60 Hz） | `src/pet/main.ts:2417-2451` | 每帧 `hero.tick`；仅 `renderKey` 变化才 `hero.render`（已修 perf P1-1） |
| 行为步进 | 4 Hz（固定步长，有 catch-up 上限） | `src/pet/scene/runtime.ts:370-400` | 确定性状态机 + ambient（4–10 s） |
| 动画 | 6–14 fps（attack 局部 12–24） | `src/pet/hero.ts:229-250`；插件 `client.js:494-536` | holdMs 支持 |
| 桌宠自动保存 | 30 s + 页面隐藏时 | `src/pet/main.ts:2143-2148` | IPC 写盘（Tauri DPAPI）；主线程 |
| demo 时间泵 | 250 ms `setInterval` + WallClockStepper | `src/game/time.ts:20-55`；town `main.ts:48`；stall `main.ts:1040-1041` | 固定步长/追帧上限 5 min、300 步 |
| 各游戏时间尺度 | aquarium 默认 `msPerTick:1000`；town `msPerTick:1000 + minutesPerTick:5`；stall `msPerTick:144000` | `kernel/types.ts:173`、`town/main.ts:40`、`stall/main.ts:79` | **三套语义/三套日长**（GAMEPLAY-AUDIT §2.5 同结论） |
| 点击穿透（JS） | 10 Hz | `src/pet/hit-regions.ts:200-229` | alpha tile 缓存 + 变化才 IPC |
| 点击穿透（Rust） | 16.7 Hz（60 ms） | `main.rs:96-129` | 读光标 → `set_ignore_cursor_events` |
| shell 布局/健康提醒 | 500 ms / 1 s | `src/pet/shell-layout.ts:72-99`、consent runtime | 后台常驻小定时器 |

### 2.7 输入与命中

- **桌宠点击**：数据驱动 `regions.json`（96 画布 rect，head 30 / body 10 / tail 20 优先级），只响应 `idle`/`idle_blink` 状态；冷却 1200 ms（全局）/2500 ms（同区）/800 ms（动作），`main.ts:1434-1436,1505,2654`。
- **拖拽**：hero canvas 指针移动 >6 px 时在 Tauri 内调用 `getCurrentWindow().startDragging()` 移动**整个窗口**（`main.ts:2596` 附近），浏览器/QA 才做本地 translate；这意味着「宠物位置」= 窗口位置，没有窗内物理/寻路。
- **点击穿透**：hero canvas 不再整块挡点击；用 alpha tile（约 2 art px/瓦片）上报可见矩形，Rust 60 ms 轮询切换 ignore-cursor（`hit-regions.ts:92-154`、`main.rs:96-129`）；readback 失败回退「整窗矩形」（`hit-regions.ts:123-127`）。
- **插件点击**：图片 `offsetX/offsetY` 按 rendered size 映射回 96 画布，按 region priority 命中，只 idle 状态响应（`client.js:286-330,700-720`）。
- **键盘/无障碍**：桌面壳菜单有 WAI-ARIA/roving tabindex；hero canvas 本身只处理 pointer（`pet.html` 无 canvas tabindex/keydown），点击式交互对键盘用户只能走菜单动作按钮（存在，但可发现性弱，见 UX 评审）。

### 2.8 玩家体验现状

- **桌宠循环**：点击 → `bond +2`（上限 100）、给纸片 +1、折纸 -1/+3；`petMood`（attached/curious/...）与 `petSchedule` 时段文案；记忆/折页本有主动回忆上限（4 h/次、2 次/天）（`src/kernel/pet.ts:20-38,90-125,361-408`）。**没有等级、解锁、目标、收集、成就、每日任务；bond 满了之后没有新出口。**
- **互动**：三区 × 5 句随机「says」+ 每物种 5 个动作（狗含丢球/捡球，猫含伸懒腰/洗脸/追尾/跑，人形含递纸/挥手/整理/聊两句）；猫狗 thought 气泡、永不走 TTS；人形 speech + 独立 TTS 确认（`regions.json`、`client.js:26-62`）。节奏研究见 `docs/research/PET-UX-PSYCHOLOGY-2026-11-18.md`（本评审未逐条复验其外部证据）。
- **游戏 demo**：`src/shell/games.ts:39,50,61,72` 四个页面仍是 `demo: true`；`docs/GAMEPLAY-AUDIT-2026-11.md:5-16` 结论「三款都还不好玩、不上瘾、不吸引人」，根因是「没有第二层决策/失败不存在/内容消耗远远大于生产/时间尺度混乱」；`GAME-PLAN-2026-11.md` 建议商业首款 C《深夜小馆》（8–12 周），B 做可读性预研，A 只做机制实验室。
- **验证缺口**：`README.md:22` 明确「试玩协议（未执行，需真人）」；GAMEPLAY-AUDIT 的 7 天验证方案没有执行数据；当前所有「玩家体验」判断都是内部推演/文档结论，不是用户数据。

### 2.9 可扩展性现状

- **角色**：`HERO_CHARACTER_IDS = ['humanoid','cat','dog','tinglan']` + `HERO_CHARACTER_SOURCES` 硬编码目录/标签（`hero-runtime.ts:86,115-137`）；新增角色 = 新目录 + 新生成器 + 改这个表 + 测试 + 菜单。`tinglan`（256 概念包）在列表里但菜单不暴露，只能 `?character=tinglan` 进入。
- **内容中心**：`public/content/library.json` 已是 `famling.content/0.2`，有 4 个 rolePresets（human/cat/dog/origami）与六类组件；`content-library.ts` 4,568 行 + `content-hub.ts` 2,304 行 + `content-assets.ts` 1,270 行（共 8,142 行）实现了严格解析、内容包 0.2/zip、Ed25519/远程市场契约、选择持久化、外观应用；但 **hero 运行时并不消费这个目录**（`hero-runtime.ts` 不 import content-library；角色切换仍写旧 localStorage 键 + reload）。
- **内容包 v2**：`famling.content-pack/0.2` 支持 roleThemes + components + zip（png/webp/json/woff2，`content-library.ts:139` 允许 png/webp/json/md/txt/wav/ogg）、usageDeclaration、sha256、签名契约；但**没有动画 clip/帧/manifest 字段**，也没有安装器/运行时加载器（`docs/design/CONTENT-MARKET-2026-11-19.md:557-600` 明确只定义不联网、不安装）。
- **对照插件**：`content-extension.mjs` v2 独立六类 schema（纯数据）；动画数据只来自私有仓生成的固定 chunk 映射（`client.js:13-18`），第三方无法在运行时新增帧。
- 结论：**内容模型已经为市场准备好「数据」，但游戏运行时只认「代码里的 4 个角色」和「私有仓生成的三套帧」**——这就是 P0-1。

---

## 3. P0（阻断项）

### P0-1 内容市场/角色主题包无法交付「可玩的新角色」

**证据链**

- 运行时角色是白名单：`src/pet/hero-runtime.ts:86`（4 个 id）、`:115-137`（目录/标签）、`:377-378`（按 id 查 source，未知直接抛错）；`?character=`/localStorage 也先过 `isHeroCharacterId`（`:172-174,196-208`）。
- 角色种类只有四个 rig：`src/pet/content-library.ts:96`（`CHARACTER_KINDS = dog/cat/humanoid/origami`）、`:2440-2447`（kind → 产品 renderer 映射）。第三方角色只能是这四个 kind 的「换皮/变体」，不能带来新骨架/新动作集。
- 导入的第三方角色默认不可用：`src/pet/content-hub.ts:381-405` 的 `evaluateRoleThemeSupport` 对 `available=false` 的角色返回「该角色动画由内容包提供，本机渲染器不支持；已导入但需远程市场安装器」。**这个安装器并不存在**（`docs/design/CONTENT-MARKET-2026-11-19.md:557-563` 只定义契约；`:600` 明确不在本任务）。
- 内容包没有动画 schema：`content-library.ts:139` 文件白名单是 png/webp/json/md/txt/wav/ogg；`src/pet/anim/manifest.ts` 的 `famling.pet-anim/0.1` 只作为「私有仓资产格式」存在，未进入内容包/远程 market 校验（全仓 grep 只在 `src/pet/anim/**`、`docs/content-packs/*`、测试中出现）。
- 插件侧同样固定：`client.js:13-18` 只有三个 chunk 与固定 `CHARACTER_CHUNKS`；`content-extension.mjs` 是纯数据校验，不加载/播放任何第三方帧。

**影响**：内容市场的主卖点「角色即主题/一键换角色」目前只能交付**主题、声音（浏览器 TTS 列表）、对话包、背景、字体**，不能交付「新的可动角色」；「新角色」实际上等于给 dog/cat/humanoid 换配色/预览图。若市场/商业化按现设计和用户预期推进，会在「买了角色但不能动/不是新角色」处产生信任与退款风险。

**建议（是否值得重构：值得，但可分两步）**

1. 定义 `famling.pet-anim/0.2` 资产包：复用 `famling.content-pack/0.2` 的 zip + files sha256 + 签名 + usageDeclaration，承载 `manifest.json`（canvas/anchor/footBox/palette/tags/anim clips/holdMs）、帧或 atlas、`regions.json`、preview、author/license/ai；限制尺寸/解压比/资产类型（同现有 zip 校验）。
2. 运行时：新增「资产包 → RenderBackend pack」加载器（复用 `hero-backend.load/installPack` 的能力），把 `HERO_CHARACTER_IDS` 改成「内置 4 条 + 已安装 pack 列表」的数据驱动注册表；角色切换走热切换（见 P1-4）而不是 reload；失败 fail-closed 回内置角色。
3. 产品侧：在安装器/签名/热切换没完成前，把「市场」tab 文案明确为「主题/声音/对话包市场，暂不含新动画角色」——现在 `content-hub.ts:111`、`:381-405` 的文案已经接近诚实，但角色卡仍容易被理解为「新角色」。

**成本**：schema+loader+注册表约 5–10 人日；第三方 rig 制作工具（Aseprite→包）另计。**风险**：拆包/zip 是新的攻击面（复用现有 zip fail-closed 校验、签名与配额预算可降低）；热切换生命周期（见 P1-4）。

### P0-2 发布构建的 DLC 实为「全失败」：生产信任根为空 + 旧签名

**证据链**

- `native/dlc-verify/trust/production-trust-root.json:8` → `keys: []`；`native/dlc-verify/trust/README.md:13` 明确「`keys: []` 表示 fail closed：release 构建在 ceremony 完成前会拒绝每个 pack」。
- release 路径：`main.rs:707-710` 使用 `verify_pack_embedded`（编译期 trust root，禁用参数 override）；`lib.rs:303-320` 实现；`main.rs:1044-1056` 只有 debug 才允许 `--dlc-key`。
- 仓库内两个 pack 是 dev/legacy 签名（`packs/farm-seasons/signature.txt`、`packs/reef-pack/signature.txt`），且 `production-trust-root.json` 的 policy `allowLegacySignatureWithoutKeyId:false`（`native/dlc-verify/trust/README.md` schema 段）。
- 实测（仓库内 verifier 二进制）：`--print-trust` → active/retired/revoked 全空；对 `packs/farm-seasons` → `ok:false`，错误 `trust root contains no signing keys; DLC verification is fail-closed until a production key is provisioned`。
- CI 反直觉：`scripts/test-dlc-rust.sh:40-44` **故意断言**「release verifier 必须拒绝仓库 dev-signed pack」——所以 CI 绿并不代表 release 可用；它证明的是 fail-closed 正确。`ci.yml` 的 `npm run verify:pack` 用的是 `packs/keys/dev-public.pem`（`scripts/verify-pack.ts:5`），同样不覆盖 release 路径。

**影响**：任何 release 安装包启动后，`dlc_verify` 都会失败，游戏侧显示 `skipped: ...`（`src/demo/main.ts:44-63` 的 catch 分支）；随包的两个 DLC 形同不存在，更不用说未来「付费 DLC / 内容市场」。这也是商业化/路线的前置条件，而不是普通 bug。

**建议（owner 动作 + 工程动作）**

1. 按 `docs/audit/RESOLUTION-DLC-SIGNING-2026-11-19.md` §5 Runbook A 完成生产 key ceremony（离线生成、双人保管、只把公钥写入 trust root），用 `scripts/make-pack.ts --key-id` 以生产 key 重签两个 pack 为 `signature.json`，并在发布机上跑 `verify-dlc-trust --staged/--exe`。
2. 工程侧：给 release 路径加一个「staged 包树」测试（仓库 dev 包必须被拒 + 发布树生产签名包必须全过），把 `verify-dlc-trust` 接进 release workflow；在 ceremony 完成前，不要在对外文案/商店页宣称「含 DLC」。
3. 如果短期无法 ceremony：明确把 DLC 从 release 移除（resources 不打包 + 游戏侧不显示 DLC 入口），避免「包在但永远 skipped」的半成品状态。

**成本**：owner ceremony 数小时 + 签名脚本已存在；工程门禁 0.5–1 人日。**风险**：私钥保管/双人流程是外部风险；泄露/丢失需轮换（schema 已支持 retired/revoked/notBefore/notAfter）。

### P0-3 玩法循环与产品形态未定义/未验证：不要用内容市场掩盖它

**证据链**

- 桌宠循环只有「点击/给纸片/折纸 → bond/paper/folded 计数」，bond 上限 100，无解锁/目标/收集/成就/日常（`src/kernel/pet.ts:20-38,90-125`；`main.ts:803-824` 只渲染计数）。
- 三个游戏 demo 仍标记 `demo: true`（`src/shell/games.ts:39,50,61,72`）；`docs/GAMEPLAY-AUDIT-2026-11.md:5-16` 结论「三款都还不好玩」，P0 包括 C 的 480×240 重排/经济出口、B 的经济重做、A 的每日/离线状态；`GAME-PLAN-2026-11.md:155-165` 的首款结论是 C（8–12 周），但至今没有 7 天/试玩数据。
- 试玩 gate 未执行：`README.md:22`「试玩协议（未执行，需真人）」；`GAMEPLAY-AUDIT` §6 的指标（首正反馈小于 30 s、D1/D3/D7 回访等）没有任何新数据。
- 三款 demo 的时间/离线/存档语义不一致（见 P2-7）：aquarium 默认 1 s/tick、town 1 s/tick + 5 min/tick、stall 144 s/tick；离线只有 aquarium/town 有 8 h 回报，stall/pet 没有。

**影响**：如果目标形态是「桌面常驻小游戏平台」，当前既没有统一会话/时间/离线/存档基座，也没有被验证的核心循环；此时把主要工程投入到内容市场/DLC，等于在未验证的玩法上搭商业层。反过来，如果目标形态是「研究性桌宠/陪伴运行时」（与 TOS/使用限制一致），那么就不需要游戏循环，但也不应把三个 demo 当商业首款继续投入。

**建议**：owner 在下一阶段前明确二选一（不要求本次评审拍板）：

- **A. 陪伴运行时（与现行法务定位一致）**：冻结「桌宠 + 互动 + 内容主题」范围，不做 DLC/市场变现叙事；把 P0-1/P0-2 降级为「未来选项」，先做 P1 清单的动画/资产/UX 收敛。
- **B. 桌面游戏基座**：先做统一 runtime + 1 个垂直切片（按 GAMEPLAY-AUDIT 选 C《深夜小馆》），用 5–8 人试玩 gate 验证；只有通过后才做内容市场/DLC。

**成本/风险**：这是产品决策，工程成本取决于选择；风险是「两边都做」——当前工作树正在同时推进内容市场 UI、内容包 v2、动画细节，已经呈现资源分散迹象（内容层 8,142 行 vs 动画运行时死代码未清理）。

---

## 4. P1（下一阶段前应修）

### P1-1 动画运行时双轨：IdleAnimationScheduler/bubbles/interactions 是死代码，behavior/ambient 才是事实源

**证据**

- `src/pet/anim/idle.ts:252` 的 `IdleAnimationScheduler`（500 行）、`bubbles.ts`（163 行）、`interactions.ts`（204 行）、`timeline.ts`/`prng.ts` 设计为 headless 调度/气泡/交互计划层；但 `src/pet/**` 中**没有任何运行时 import**（grep `from './anim/`：只有 `main.ts`/`hero-runtime.ts` 用 `regions.ts`、`character-voice.ts` 用 `types.ts`）。
- 设计稿自认「未接入 main/hero」（`docs/design/PET-ANIMATION-2026-11-18.md:3,16`），接入方案 §8 未执行。
- 真正的 ambient 是另一套：`src/pet/character/behavior.ts:148-160` 的 `ambientState()` + `public/characters/*/behavior.json:247+`（4–10 s 间隔、权重池），由 `SceneRuntime` 4 Hz 驱动（`scene/runtime.ts:370-400`）。
- 测试却仍在锁死死代码（`tests/pet-anim.test.ts` 17 项里含 scheduler 确定性 trace/权重/冷却/anti-repeat；我实测 17/17 通过）——给人「动画调度器已经上线」的错觉，未来维护者很容易把功能加错地方。

**影响**：两套节奏模型（scheduler 的 warmup 8–15 s、roll 10–22 s、单动作冷却 45–200 s vs behavior ambient 4–10 s + 规则冷却）并存；气泡计划被 host 的 `sayLater/pickSays` 重新实现；交互计划 `planBallFetch` 没被用，丢球 follow-up 是在 `handleHeroAction` 里手写 `setTimeout`（`main.ts:1501-1522`）。这是「新功能加在哪」的长期歧义。

**建议**：以 behavior/SceneRuntime 为唯一运行时状态机；把 `idle.ts` 的剩余价值（确定性 PRNG、冷却/anti-repeat/权重）折叠进 `behavior.ambientState` 或作为它的轻量 helper；`bubbles.ts` 的严格 speech/thought 策略上移到 host/voice gate（现在 host 已有 `character-voice.ts`/`VOICE_CAPABILITIES`）；`interactions.ts` 要么被 `handleHeroAction` 采用，要么删除。测试改为运行时集成测试（保留 golden trace 成本低）。**成本 1–2 人日，风险低–中（删除代码/测试计数会下降，需要同步文档）。**

### P1-2 计时表 6 处复制 + 三包同构承诺已被 per-character override 打破 + 无生成器与 TS 等价门禁

**证据**

- 计时真值在 `src/pet/anim/clips.ts`（TS）+ 每包 `manifest.json`（生成物）+ 三套 Python 生成器各自的 CLIPS（`scripts/gen-pet-anim-frames.py:80`、`gen-cat-anim.py:51-61`、`gen-human-anim.py:60`、`human_tinglan.py:1079-1083`）+ 插件 embed 复制——共 6 类副本（旧研究 `PET-ANIMATION-TIMING-2026-11-18.md:321,348-355` 已列，当前仍成立，且 cat `stand_wag` 10 帧/3200 ms 的 per-character override 是新变量）。
- `--check` 只证明「磁盘字节 = 该生成器重跑结果」；测试证明「manifest = clips.ts」；**没有**任何门禁直接证明「Python CLIPS = clips.ts」。今天之所以没红，是靠测试间接兜住，但改一处漏一处仍有窗口。
- 同构承诺已破：dog/human 68 帧、cat 72 帧；插件 embed/verify 已按 per-character 帧数适配（这是对的），但 `clips.ts` 的 `CLIP_TABLE`、`FPS_BANDS`、文档里的「68 帧」描述要同步维护，认知成本上升。

**影响**：新增一个 clip 需要改 clips.ts + 3 个 Python + 3 个 manifest + 测试 + 插件 embed，且很容易只改一半；对「正式美术替换」的验收链路不友好。

**建议**：把计时抽成单一 `src/pet/anim/timing.json`（或生成 TS 的 JSON）：字段 = clip id/frames/fps/loop/layer/category/priority/holdMs（按角色 override 单独段）；Python 生成器与 TS 都读它；CI 增加「生成器输出 manifest 的 clip 字段 == timing.json」门禁；`--check` 仍保留字节校验。**成本 1–2 人日，风险中（资产字节保持不变的约束下重构；需全量重生成 + `--check` 绿）。**

### P1-3 资产预算：baked WAV 4.2 MB（60%）无压缩；散帧 PNG 无 atlas；hero 启动全量预载

**证据**

- 4,289,208 B / 42 WAV / 24 kHz mono 16-bit（我实测第一句 `hello.wav` 1.000 s = 48,044 B，按 48 kB/s 推算 42 句约 89 s）；`vite.config.ts:56-130` 的 baked-voice guard 强制 42 行、stella+tide 各 21 句，并拒绝额外 voice；构建默认包含。
- 插件/standalone 的帧是 68–72 张独立 PNG（`public/assets/pet/anim/*/<clip>/<clip>_NN.png`），无 atlas；`hero.ts:289-303` `CharacterRenderer.load()` 用 `Promise.all(pack.assetUrls.map(loadImage))` **一次性加载全部帧**；旧 perf 审计测得 dog 68 图/110,922 B、hero ready 123–259 ms（本机，可接受，但随角色数/多 actor 线性增长）。
- 插件侧已用无损索引 PNG 重编码（351.6 KiB → 167.8 KiB）并拆 chunk（首帧 127.9 KiB），但总量 313.5 KiB 仍随角色增加；cat chunk 108 KiB 是最大单块。

**建议（按收益/成本排序）**

1. **WAV→Opus/OGG**：24 kHz mono 语音在 32–48 kbps 下约 0.36–0.54 MB（估算，减少约 87%~91%），安装包/首包可减约 3.7 MB；需改 bake script、manifest sha256、vite guard、播放层（`<audio>` 对 OGG/Opus 在 WebView2/Chromium 上通常可用，需实机确认）。风险：再编码确定性、语音权利条款（42 句 baked DeepSeek TTS 的再分发权利仍属法务待确认项，见 README 许可矩阵/HANDOFF）；不要在未确认权利前对外分发新增格式。
2. **首屏 idle-first**：hero 先载 idle+idle_blink（9 帧），其余 clip 后台加载；首帧更稳（旧 perf P2-9 建议，本机当前 123–259 ms 不算瓶颈，收益是未来角色变多时）。
3. **atlas（可选）**：每角色 1 张图（如 8×9）用 `drawImage` 源矩形；收益 = 68 次请求→1、解码一次、插件 base64 体积可能略降（PNG 重编码已很省，atlas 不必然更小）；成本 = 生成器/manifest/渲染器/测试全链路改。**不建议现在做**，等 WAV/内容包优先级更高的事项完成。

### P1-4 角色切换 = 整页 reload，内容中心的「一键换角色」不是即时切换

**证据**

- 角色主题应用：`src/pet/main.ts:1122-1180`（`applyRoleThemeFromHub`）；角色变化时 `applyRendererChoice(targetRenderer, { reload: () => window.location.reload() })`（`:1160-1168`）。`desktop-shell.ts:245-266` 的 `applyRendererChoice` 写 localStorage 后调用 reload。
- `hero-runtime`/`render/hero-backend` 已具备每个 pack 独立 slot、`load()`/`dispose()` 生命周期（`hero-backend.ts:161-188,266-301`）；理论上可热切换，但当前未使用。
- 插件侧不需要 reload（React 切形象即时），两端体验不一致。

**影响**：切换角色（内容市场的主操作）会重建页面：重新初始化 consent/渲染器/行为/图片解码；用户感知是「卡一下/闪一下」，且打断对话/动画；也让「角色=主题」的一键体验在独立版明显弱于插件。

**建议**：实现 `switchHeroCharacter(id)`：加载新 bundle → `renderBackend` 新 slot → `hero.replaceActor`/重建 actor → 停旧 slot；失败保留旧角色并提示；持久化沿用现键。**成本 2–3 人日，风险中**（要覆盖 consent 重查、TTS 配置重弹、场景/时钟/保存、测试）。

### P1-5 同一套「角色/动作」数据在 4 处复制：regions / behavior / 插件 EVENT_CLIPS / 内容目录

**证据**

- `public/characters/pet-dog/regions.json`：3 区 + 3 gestures + 5 actions + says（actions 从 92 行到文件尾 156 行）；plugin 直接嵌入这份数据（`client.js:10` 生成头注明来源）。
- `public/characters/pet-dog/behavior.json`：slots 19 个（含 attack/run，无 walk）、states 18 个、rules 19 条、ambient 池（22-126、235-246、247+）。
- 插件 `EVENT_CLIPS` 手写事件到 clip（`client.js:34-45`）+ `MICRO_LINES`（`:46-52`）；verify 只检查「用到的 event 都有 clip」，不检查与 behavior slots 的等价。
- 内容目录 `library.json` 的 rolePresets/characters 又是另一份「角色是什么」的描述，但 hero 不消费（见 P0-1）。

**影响**：新增/改动一个动作（如「散步」）要同步 3–4 处；漏一处会在某端表现为「点了没反应」或「有动作没入口」。这是当前最现实的长期维护成本。

**建议**：定义单一 `character.interactions.json`（regions + actions + behavior 触发 + 气泡 says + voice 策略），由脚本生成 standalone 的 regions/behavior 与插件的嵌入数据；CI 校验跨端一致。**成本 2–3 人日，风险低**（纯数据/生成器层）。

### P1-6 DLC 只能加数据、不能加美术/音频/场景；Steam entitlement 仍是 stub

**证据**

- `src/pack/manifest.ts:11-24` + `loader.ts:26-39,127-138`：pack 只注册 `items/crops/buildings/fish/decorations` 五类数据；`dlc-content.ts:273-288` 校验也只覆盖这五类。
- `tauri.conf.json:47-49`：resources 只把两个数据 pack 目录复制进安装包；没有资产/音频/场景目录。
- `main.rs:685-687,778-790`：Steam 状态是 stub（源码注释说明 intentionally stubbed），没有真实 entitlement 接入。
- 对照 `famling.content-pack/0.2`：支持 zip 资产（png/webp/json/woff2）与签名——这套能力**没有接到 DLC 路径**；两套格式并行且互不兼容。

**影响**：DLC 的商业模式目前只能是「数据 mod」（新作物/鱼/装饰/建筑），不能卖角色皮肤、语音包、场景/主题包；这与内容市场的资产包方向脱节。

**建议**：把 DLC 与内容包收敛为一个「签名资产包」格式（content kind 区分 game-content / anim-character / theme），共用 `files[] sha256 + Ed25519 + zip 上限` 验证；Steam 接入按 `src/host/steam.ts` 适配器在真实 app ID 可用后补。**成本 3–5 人日（不含 Steam 商务）；风险中**（发布/签名/法务牵连）。

### P1-7 可达性/内容浪费：walk、attack 是死 clip；human 眨眼末帧收尾跳（我实测 286 px）

**证据**

- `walk` 8 帧（`clips.ts:47`）：behavior slots/states 无 walk；regions actions 无 walk；插件 EVENT_CLIPS 无 walk → **任何入口都没有**。
- `attack` 7 帧（`clips.ts:56`）：behavior 有 state/rule（`behavior.json:125-126,235-236`），但全仓没有任何 `emit('attack')`/UI/regions 触发；插件也没有 EVENT_CLIPS → spec-only。
- cat/human 的 `ball_throw`/`ball_chase`：regions actions 只有 dog 有 fetch/retrieve（我逐个解析了三份 regions.json）；插件 EVENT_CLIPS 有 event 但对应角色没有 action → 不可达。
- 眨眼收尾：我用 PIL 实测（当前磁盘资产）human `idle_blink_02` vs `idle_00` = **286 像素差**（dog 15、cat 112；human idle 相邻帧均值 561）——眨眼作为「全身替换」结束回 idle 时会有可感知的一跳；dog 是干净的。生成器 `scripts/human_tinglan.py:778-785` 的 blink 三帧 tail/head 参数与 idle 不对齐。

**影响**：45/208 帧（约 21.6%）没有用户可见出口，却持续进入插件 payload/测试/文档维护；human 眨眼在每次眨眼（当前由 behavior ambient 触发：4–10 s 轮询、idle_blink 权重 15）都有一次小跳。

**建议**：先拍板——(a) 接入口：walk 用于「慢速漫游/菜单散步」，attack 用于「被连续戳/玩闹」带冷却且不产生负面情绪；或 (b) 明确 spec-only：从 manifest/资产/测试中移除或标注冻结，不再投入调参，并在设计文档写「未来接入条件」。无论哪种，**现在不要再给 walk/attack 调像素**。human blink 对齐 idle_00 或做真 overlay（成本小–中）。

### P1-8 多显示器 DPI/缩放：渲染 DPR 启动时读一次写死，缺少跨屏重配（静态推断，需实机）

**证据**

- `src/pet/main.ts:2747-2748` 在 `startHeroRuntime` 时取一次 `window.devicePixelRatio`（clamp 1–3）；`src/pet/hero-runtime.ts:1205-1211` 一次性设置 canvas backing = layout×dpr 与 `setTransform(dpr)`；全仓没有 `matchMedia('(resolution...)')`/`devicechange`/DPR 变化监听（grep 实测；`resize` 监听只在 hit-regions/shell-layout 用于布局，不重建 hero 后备）。
- 窗口 `resizable:false`（`tauri.conf.json:20`），但可拖动跨显示器；Rust 点击穿透每次 poll 重新读 `scale_factor`（`main.rs:96-129`），所以**命中坐标可能仍正确，而渲染可能变糊/欠采样**（未实机验证）。
- `place_bottom_right` 只基于 primary monitor（`main.rs:830-855`），多屏摆放策略也未覆盖。

**建议**：监听 Tauri `ScaleFactorChanged`/window moved + WebView `matchMedia`/`visualViewport` 变化，重建 hero canvas backing/重算 layout；在 100%/125%/150%/200% 两屏上实测「清晰度/命中/点击穿透/窗口位置」。**成本 1–2 人日 + 实机；风险中**（错误的 resize 会造成黑帧/闪烁，需回归测试）。

---

## 5. P2（打磨/验证/文档）

### P2-1 点击穿透的 60 ms 轮询与 readback 失败回退

`main.rs:96-129` 每 60 ms 读光标并 toggle `set_ignore_cursor_events`；JS 侧 10 Hz 上报（`hit-regions.ts:200-229`）。交互区内的点击最坏有约 60 ms 的「窗口还不接受点击」延迟；`getImageData` 失败时回退整窗矩形（`hit-regions.ts:123-127`），在异常 GPU readback 的机器上会退化成「透明区也挡点击」。建议实测延迟 p95；长期方案是构建期预计算 art-space tile mask（旧 perf P1-3 建议），把 readback 清零。

### P2-2 性能修复后缺少复测数据；rAF 仍 60 Hz 常驻

旧 perf 审计的 P1-1/P1-2/P1-3 都已在当前代码中修复（dirty `renderKey` 门控 `hero-runtime.ts:871-883` + `main.ts:2426-2438`；`hero.ts` resize 有 size 相等短路 `:422-433`；插件拆 chunk；alpha tile 缓存）。但仓库里**没有修复后的 CDP 复测数字**（旧审计的 61 fps/117 drawImage 是修复前）；当前 rAF 仍每帧 `hero.tick` + locomotion，空闲时也有约 60 Hz 回调。建议补一次 CDP A/B（drawImage/秒、TaskDuration、空闲功耗）作为验收；若空闲成本仍高于 1% 单核，考虑「内容帧率对齐的定时器 + 仅 run/拖拽用 rAF」或省电模式（DPR 上限 2）。

### P2-3 human 眨眼收尾与 cat 眨眼中间帧

（证据见 P1-7）human blink 末帧 vs idle_00 = 286 px；cat 中间帧 vs idle_00 = 1055 px（cat 设计上允许轻微 secondary motion，但需人工目视确认是否只是身体/尾巴的自然摆动）。dog 干净（15 px）。属于像素验收项，不是运行时 bug。

### P2-4 插件懒加载 chunk 只有 Node vm 仿真，没有真实 GUI Network 证据

`docs/audit/RESOLUTION-PLUGIN-BUNDLE-2026-11-19.md:116` 自认「没有做真实浏览器/DSH GUI 首屏网络 A/B（GUI owner-only 401）」；当前验证是 `npm test` + Node vm 模块表仿真 + DSH 源码契约 + 字节量化。风险：chunk 加载失败时只显示 1×1 透明占位且静默（`client.js:221-258`），若 DSH 版本/路由变化，用户会看到「形象没了但没报错」。建议：一次已登录 GUI 的 Network 截图/日志 + QA 计数器（chunk 成功/失败次数）写进设置面板或诊断日志；失败时优雅降级为「静态单帧 + 提示」而不是透明。

### P2-5 首屏预算回涨 + 内容层代码量大于动画运行时

插件 entry 从拆分时的 50,578 B 涨到当前 67,726 B（+34%），首屏预算也从 64 KiB 上调到 72 KiB（`scripts/verify-anims.mjs:62-63`、README 0.10.0 记录）；`content-hub.ts` 2,304 行 + `content-library.ts` 4,568 行 + `content-assets.ts` 1,270 行 = 8,142 行，而动画运行时（含死代码）约 2,222 行。若继续加市场 UI，首屏/维护成本会继续涨；建议在市场 installer 落地前冻结 UI 增量，把新增能力放到懒 chunk。

### P2-6 文档/发布事实漂移

`README.md:11` 称「私有远端已建（PerryLink/desktop-games，2026-11-15）」，但 `git remote -v` 为空，HANDOFF（`FAMLING-DSH-HANDOFF-2026-11-18.md:75`）也写「无 Git remote」；因此 `.github/workflows/ci.yml` 对本私有仓**并不运行**（工作流注释也自认「This repo has no git remote yet」），所有「CI 全绿」实际指公开仓。建议统一 README/HANDOFF 的发布事实，或恢复 remote + CI。另：`docs/design/CONTENT-MARKET-2026-11-19.md` 的状态行还写「UI/安装器未实现」，而工作树已实现 v2 UI（并行任务），合并前需更新。

### P2-7 三套游戏时间尺度 + 离线/存档语义不一致（若做游戏基座必须先统一）

aquarium 默认 1 s/tick；town `msPerTick:1000` + `minutesPerTick:5`（`town/main.ts:40,48`）；stall `msPerTick:144_000`（`stall/main.ts:79`）；离线只有 aquarium（8 h cap、按缸鱼收入）与 town（8 h 推进）有，stall 明确「不结算离线故事/无离线惩罚」（`kernel/stall.ts:357`），pet 无离线。存档是每页 30 s + save envelope，各自独立（`aquarium/main.ts:496`、`town/main.ts:366-367`、`stall/main.ts:1040-1041`）。做统一游戏基座时，应先定义共享 `GameClock`/离线结算/存档槽（`src/shell/games.ts` 已有 registry，可作为入口），否则会继续维护三套时标。

### P2-8 30 s 自动保存仍在 rAF 主线程；dirty-only/idle 保存未做

`src/pet/main.ts:2143-2148` 每 30 s 保存 + 页面隐藏保存；state 小于 10 KB，但 Tauri DPAPI/IPC 可能阻塞数十 ms（旧 perf 审计 P2-7 未测）；与 rAF 动画同线程。建议 dirty 时才保存 + `requestIdleCallback`/可见性变化合并；不改保存语义/安全（鲁棒性审计 P0/P1 的恢复链不能回退）。

### P2-9 QA/概念角色 `tinglan` 与多 actor 能力未产品化

`HERO_CHARACTER_IDS` 含 `tinglan`（256 概念/预览包，`hero-runtime.ts:86,131-136`），但 `RENDERER_MENU_ITEMS` 只有 dog/cat/humanoid/origami（`desktop-shell.ts:210-215`），只能通过 `?character=tinglan` 进入；`MAX_HERO_ACTORS=4` 支持多 actor（`hero-runtime.ts:89-90`），但产品 UI 没有多角色场景。建议：把 `tinglan` 标为 QA-only（或移出发布构建），多 actor 能力要么给一个明确玩法（多宠同屏/访客），要么在发布说明里标实验性。

---

## 6. 优化/重构建议总表（收益/成本/风险/是否值得现在做）

| # | 建议 | 收益 | 成本 | 风险 | 现在做？ |
|---|---|---|---|---|---|
| R1 | 收敛动画运行时（behavior 为唯一源；删/接 idle/bubbles/interactions） | 去掉双轨与认知歧义；删约 900 行死代码；测试聚焦真实路径 | 1–2 人日 | 低–中（测试数量下降、需迁移 golden trace） | **是** |
| R2 | 单一 timing JSON + 生成器读取 + CI 等价门禁 | 加 clip 只改一处；正式美术替换链路可验收 | 1–2 人日 | 中（必须保证资产字节不变；全量重生成 + --check） | **是** |
| R3 | 角色/动画资产包 v0.2 + 数据驱动注册表 + 热切换 | 内容市场能交付「可玩角色」；切角色不闪断 | 5–10 人日 | 中（zip/签名/生命周期；必须 fail-closed 回内置） | **是（P0-1 的工程解法）** |
| R4 | WAV 转 Opus/OGG | 安装包/分发减约 3.7 MB（语音字节减少约 87%~91%） | 1–2 人日 + 法务确认 | 中（权利/回放兼容/manifest 哈希） | **是（先做 1 句 A/B 验证再全量）** |
| R5 | 统一动作数据（regions+behavior+plugin 生成） | 新增动作只改一处；消除跨端漂移 | 2–3 人日 | 低 | 是（R1/R2 后） |
| R6 | DLC 资产包格式与内容包收敛 | 能卖皮肤/语音/主题；双格式维护成本下降 | 3–5 人日 | 中（发布/签名/法务） | 是（依赖 R3/信任根） |
| R7 | 生产签名 ceremony + release DLC 门禁 | 解锁 DLC/市场发布 | 外部数小时 + 0.5–1 人日 | 低（流程风险在密钥保管） | **是（owner 动作，越早越好）** |
| R8 | 多显示器 DPR 重配 + 实机验证 | 跨屏清晰/命中一致 | 1–2 人日 + 实机 | 中 | 是（可与 R3 一起实机验） |
| R9 | 游戏基座统一（clock/offline/save/session）+ 垂直切片 | 让「游戏」真正成立 | 2–4 周 + 试玩 | 高（产品/范围） | **先拍板 P0-3 再做** |
| R10 | atlas 化帧 | 请求数/解码次数下降 | 3–5 人日 | 中（全链路改） | 否（等 R3/R4 后按需） |

---

## 7. 技术路线（分阶段）

### 阶段 0：产品形态与市场范围拍板（owner，1 周内）

- 选择 A（陪伴运行时）或 B（桌面游戏基座），见 P0-3；决定内容市场是否包含「新角色/新动画」，还是先只做主题/声音/对话（P0-1 的降级方案）。
- 决定 DLC/付费是否在近期路线内（决定 P0-2 的优先级；若纯研究原型，可把 DLC 从 release 移除并明确标注）。
- 输出：一页决策记录（不要求代码），同步 README/CONTENT-MARKET 状态。

**退出条件**：owner 明确 A/B 与市场范围；否则后续所有阶段都按 A 的保守范围执行（动画/资产/UX 收敛，不做市场变现叙事）。

### 阶段 1：运行时收敛与预算（1–2 周，低风险）

- R1 动画运行时单一化；R2 timing 单一源；R4 WAV 压缩 A/B；P1-7 死 clip 决策（接入口或冻结）；human blink 对齐。
- 补一次真实 GUI 验证：点击穿透延迟、DPR/多屏、插件 chunk Network（P2-1/P2-4/P1-8）。
- 验收：`npm test`/typecheck/`--check`/`embed --check`/`verify:anims` 全绿 + 新增运行时集成测试；安装包估算缩约 3.7 MB；无「未声明入口的死 clip」进入下一阶段。

### 阶段 2：可玩角色资产包（2–4 周，P0-1 主工程）

- R3：`famling.pet-anim/0.2` 资产包 + loader + 数据驱动注册表 + 热切换；R5 动作数据单一源；插件同步消费同一 manifest（避免两套）。
- 交付 demo：把现有 dog/cat/human 之外的一个变体（例如金毛换色/主题变体）做成**纯数据包**，不改代码即可出现在内容中心并热切换；再做一个「新 rig 需要改代码」的边界说明。
- 验收：新角色包安装/卸载/损坏包/未签名包/超限 zip 全部 fail-closed；热切换不重启页面；内置角色不受影响。

### 阶段 3：发布信任链与 DLC（owner 动作 + 1 周工程）

- R7：生产 key ceremony → 重签两个 pack → release 模式验证 + CI/发布门禁；R6 DLC 资产包与内容包收敛（若阶段 0 决定做 DLC）。
- 验收：release 构建 `verify-dlc-trust --exe` 全绿；安装包内 pack 全部生产签名；staged 测试证明「dev 包被拒 + 生产包通过」。

### 阶段 4：游戏基座（仅在选择 B 且通过试玩 gate 后，4–8 周）

- R9：统一 clock/offline/save/session（复用 `src/shell/games.ts` registry、`src/game/{time,wall-clock,offline,envelope}`）；选 C《深夜小馆》做垂直切片（GAMEPLAY-AUDIT/GAME-PLAN 的结论），补第二层决策/失败/经济出口。
- 5–8 人试玩，按 GAMEPLAY-AUDIT §6 指标判定（首正反馈小于 30 s、D1/D3/D7、内容消耗等）；不过 gate 就不做商业内容/DLC。

### 明确不要做（现在）

- 不要先做远程市场 UI/支付/安装器（契约已够；等 R3/R7 与网络评审的传输层规范）。
- 不要新增第 4 个手工 rig/手工逐帧角色（先把注册表和资产包做完）。
- 不要继续给 walk/attack 调像素、不要为 demo A/B 投入商业内容。
- 不要把 96 px 占位美术扩张成「正式内容量」，也不要把 AI 生成帧直接当生产像素动画（HANDOFF 已明确）。

---

## 8. 建议先做的 3 件事（展开）

### 8.1 角色/动画资产包 v0.2 + 数据驱动注册表 + 热切换（R3，P0-1）

- **为什么第一**：这是内容市场唯一的「可玩角色」缺口；不补，市场只能卖主题。schema 设计可完全复用内容包 0.2 的 zip/sha256/签名/用途声明，工程风险可控。
- **做什么**：`famling.pet-anim/0.2`（manifest 现有字段 + 帧/atlas + regions + palette/license/ai + files sha256 + usageDeclaration）→ Rust/TS 验签与解包（复用 content pack v2 的 zip 校验）→ `hero-backend.load` 挂载 → `HERO_CHARACTER_IDS` 改为内置 + 已安装列表 → 热切换。
- **收益/成本/风险**：内容市场从「数据」变成「可玩内容」；5–10 人日；风险集中在 zip 解包安全（已有 fail-closed 校验可复用）、热切换生命周期、包体积（可设上限）。
- **验收**：纯数据包新增一个可切换角色（无需改代码）；损坏/未签名/超限包被拒；切换不超过 1 s 且无页面刷新；`npm test`/typecheck/插件 verify 全绿。

### 8.2 生产签名 ceremony + 重签 packs + release 门禁（R7，P0-2）

- **为什么**：release 构建的 DLC 目前 100% 失败；这是「可发布 DLC/市场」的硬前置，且 owner 动作往往比工程动作更慢，越早启动越好。
- **做什么**：按 `RESOLUTION-DLC-SIGNING-2026-11-19.md` §5 完成 key generation/写入 trust root/重签 `farm-seasons`、`reef-pack`（`signature.json` + keyId）；`verify-dlc-trust --staged`/`--exe` + release workflow 门禁；CI 增加 staged 正/反例。
- **收益/成本/风险**：解锁 DLC；owner 数小时 + 工程 0.5–1 人日；风险是私钥保管（离线、双人、轮换/吊销 schema 已就绪）。
- **验收**：release 模式 verifier 对两个发布 pack 全绿；对仓库 dev 包仍拒绝；安装包内 `packs/*/signature.json` 均为生产 key。

### 8.3 动画运行时收敛 + 资产预算（R1/R2/R4，P1-1/P1-2/P1-3）

- **为什么**：内容/角色扩展前必须先把「动画事实源」和「资产成本」收敛；否则每加一个角色/动作都在放大双轨和 4.2 MB 语音成本。
- **做什么**：behavior/SceneRuntime 为唯一运行时（删除或折叠 idle/bubbles/interactions）；timing 抽单一 JSON 并接生成器；WAV 转 Opus A/B（先 3 句验证回放/权利）；首屏 idle-first；补真实 GUI/多屏/插件 chunk 验证。
- **收益/成本/风险**：加 clip/角色成本显著下降；安装包估算减少约 3.7 MB；2–4 人日；风险在资产重生成与法务（WAV 权利待确认，见 README 许可矩阵/HANDOFF）。
- **验收**：全量测试/门禁绿；timing 单源 CI 绿；安装包体积下降；`idle_blink` 收尾无跳变；插件首屏/全量字节不回升。

---

## 9. 与既有审计/其它评审的关系（避免重复报告已闭合项）

**已闭合（本评审复核代码层面已修，不再作为新问题）**

| 旧问题 | 现状证据 |
|---|---|
| perf P1-1 hero 60 fps 全量重绘 + 每帧 resize | `hero-runtime.ts:871-883` dirty renderKey；`main.ts:2426-2438` 仅在 key 变化渲染；`hero.ts:422-433` size 相等短路 |
| perf P1-2 插件 302 KB 启动即载动画 | 拆 lazy chunks（entry 66.1 KiB，首帧 127.9 KiB，全量 313.5 KiB）；`package.json` `immediately:false`（0.8.6 拆分） |
| perf P1-3 10 Hz 全画布 getImageData | `hit-regions.ts:92-134` alpha tile 帧级缓存；仅在帧 key 变化时 readback |
| DLC P1-1 信任根 dev key/可覆盖 | 编译期 production root + `verify_pack_embedded`；debug 才允许 `--dlc-key`（`main.rs:1044-1056`；`lib.rs:303-320`）；**但生产根仍空（P0-2 是「未 ceremony」而非「设计未做」）** |
| Tauri ACL P1-2 | `build.rs` COMMANDS/CAPABILITIES 矩阵 + 7 个 capability；`main.rs:1065-1089` |
| innerHTML P1-3 | DLC/游戏 UI 已改 textContent（`src/pet/safety/sanitize.ts` 等；见 RESOLUTION-INNERHTML） |
| consent 绕过 P1-4 | Rust HostConsent + 每窗口 capability（`main.rs:15-42,662-716`） |
| 鲁棒性 P0 坏档 / P1 IPC 超时等 | 见 RESOLUTION/HANDOFF（save .bak 回退、8 s IPC 超时、bridge 超时等） |

**同批其它评审的分工**：架构（review-architect）覆盖系统边界/契约分层；网络（review-network）覆盖远程市场传输/信任链/发布签名；软件（review-software）覆盖代码质量/依赖/性能热点；QA/UX/心理分别覆盖测试/菜单/伦理。本评审只从**游戏系统**（动画/资产/DLC 内容/循环/输入/可玩性）给出结论，避免重复。

---

## 10. 证据索引

### 10.1 关键文件与行号

| 主题 | 证据 |
|---|---|
| 12 clip 计时/override | `src/pet/anim/clips.ts:29-66`；`src/pet/anim/types.ts:80-103`；`src/pet/anim/timeline.ts` |
| holdMs 播放 | `src/pet/hero.ts:229-250`；`plugins/dsh-famling/client.js:260-278,494-536` |
| hero 角色白名单/加载 | `src/pet/hero-runtime.ts:86,115-137,377-378,340-450` |
| hero rAF/dirty/locomotion | `src/pet/main.ts:2417-2451,2456-2494,2500` |
| 指针/命中/拖拽 | `src/pet/main.ts:2518+`、`:2649`；`src/pet/anim/regions.ts`；`public/characters/*/regions.json` |
| 点击穿透 | `src/pet/hit-regions.ts:92-154,200-229`；`app/tauri/src-tauri/src/main.rs:96-129` |
| 行为/ambient/4 Hz | `src/pet/character/behavior.ts:148-160`；`src/pet/scene/runtime.ts:156,370-400`；`public/characters/*/behavior.json:22-41,43-126,235-246,247+` |
| 死代码（scheduler 等） | `src/pet/anim/idle.ts:252`、`bubbles.ts`、`interactions.ts`；`docs/design/PET-ANIMATION-2026-11-18.md:3,16` |
| 生成器 | `scripts/gen-pet-anim-frames.py:80`；`scripts/gen-cat-anim.py:51-61`；`scripts/gen-human-anim.py:60`；`scripts/human_tinglan.py:778-785,1079-1083` |
| 资产/预算 | `du -sh public/*`；`public/assets/voice/pet/manifest.json`；`vite.config.ts:56-130`；`public/assets/pet/anim/*` |
| DLC | `src/pack/manifest.ts:11-24`；`src/pack/loader.ts:26-39,57-141`；`src/pack/dlc-content.ts:22-33,273-288`；`app/tauri/src-tauri/src/main.rs:688-716,1033-1056`；`native/dlc-verify/trust/production-trust-root.json:8`；`native/dlc-verify/trust/README.md:13`；`scripts/test-dlc-rust.sh:40-44` |
| 内容市场/资产缺口 | `src/pet/content-library.ts:96,139,2440-2447`；`src/pet/content-hub.ts:111,381-405`；`docs/design/CONTENT-MARKET-2026-11-19.md:548-600`；`content*.ts`（content-hub/content-library/content-assets 共 8,142 行） |
| 角色切换 reload | `src/pet/main.ts:1122-1180`；`src/pet/desktop-shell.ts:210-215,245-266` |
| 游戏循环/时间 | `src/game/time.ts:20-55`；`src/game/wall-clock.ts`；`src/town/main.ts:40,48`；`src/stall/main.ts:79,1040-1041`；`src/aquarium/main.ts:496,568`；`src/pet/main.ts:2143-2148` |
| 游戏 demo 状态 | `src/shell/games.ts:24-76`；`docs/GAMEPLAY-AUDIT-2026-11.md:5-16`；`docs/GAME-PLAN-2026-11.md:155-165`；`README.md:22` |
| 桌宠循环 | `src/kernel/pet.ts:20-38,90-125,361-408`；`src/pet/main.ts:803-824` |
| 发布/CI 事实 | `git remote -v`（空）；`README.md:11`；`00-live/FAMLING-DSH-HANDOFF-2026-11-18.md:75`；`.github/workflows/ci.yml` 头注释 |
| 插件懒载/门禁 | `plugins/dsh-famling/client.js:13-18,216-258,494-536`；`scripts/embed-anims.mjs`；`scripts/verify-anims.mjs:62-63`；`docs/audit/RESOLUTION-PLUGIN-BUNDLE-2026-11-19.md:116` |

### 10.2 本次实测输出（节选，可复现）

```text
$ cd <private-path> && npm test
tests 1118 / pass 1118 / fail 0 / duration_ms 28154.271489

$ npx tsc --noEmit
（无输出，exit 0）

$ python3 scripts/gen-pet-anim-frames.py --check
cat: delegating to scripts/gen-cat-anim.py --check
check ok: cat animation pack matches the generator
human: delegating to scripts/gen-human-anim.py --check
check ok: human animation pack matches the generator (68 frames, 68 unique, max 19 colours, ground y=89)
check ok: dog + cat (delegated) + human (delegated) animation packs verified

$ cd <private-path> && npm test
tests 76 / pass 76 / fail 0

$ node scripts/embed-anims.mjs --check
human frames=68 raw=83.8 KiB embedded=40.5 KiB base64=54.0 KiB
cat   frames=72 raw=159.6 KiB embedded=75.0 KiB base64=100.0 KiB
dog   frames=68 raw=108.3 KiB embedded=52.4 KiB base64=69.9 KiB
total frames=208 raw=351.6 KiB embedded=167.8 KiB base64=224.0 KiB
first-screen payload: client.js 66.1 KiB; + default character chunk 127.9 KiB (only when used)
check ok: client.js + 3 lazy character chunks match the asset pack

$ node scripts/measure-bundle.mjs
client.js entry (initial payload)           66.1 KiB raw /  18.9 KiB gzip /  15.7 KiB brotli (-78.5% vs baseline)
first paint (+human chunk)                127.9 KiB raw /  54.0 KiB gzip /  49.6 KiB brotli (-58.4% vs baseline)
all three chunks loaded                   313.5 KiB raw / 170.4 KiB gzip / 163.1 KiB brotli (+2.0% vs baseline)

$ native/dlc-verify/target/release/dlc-verify --print-trust
devOverrideAvailable: true; trustRoot.active/retired/revoked 均为 []
$ native/dlc-verify/target/release/dlc-verify packs/farm-seasons
ok:false；错误 trust root contains no signing keys; DLC verification is fail-closed until a production key is provisioned

$ du -sh ...
4.2M public/assets/voice；1.9M public/assets/pet；三套动画源 351.6 KiB（见 embed 输出）
42 个 WAV / 4,289,208 B；hello.wav = 48,044 B / 1.000 s（24 kHz/mono/16-bit）

$ python3（PIL）idle_blink 末帧 vs idle_00 像素差
dog 15 / cat 112 / human 286（idle 相邻帧均值 dog 256 / cat 902 / human 561）

$ git remote -v
（空）
```

### 10.3 本次未验证（诚实边界）

- Windows/Tauri 实机：点击穿透/拖拽/多显示器 DPR/NSIS 安装包/签名 exe 的实际行为（引用 HANDOFF/verification 文档的历史实测，不是本次复跑）。
- 真人 playtest/留存数据（不存在）。
- 插件真实 DSH GUI 的 Network/懒 chunk 加载（仅 Node vm + 源码契约 + 字节量化）。
- `cargo`/Tauri 构建、release 签名流水线、crates 供应链（见同批软件/网络评审）。
- 外部研究结论（帧率/心理学/市场）只引用仓库内研究文档，未重新联网核对。

---

## 11. 剩余未知与需要 owner 拍板的问题

| # | 问题 | 影响 | 建议 owner |
|---|---|---|---|
| Q1 | 产品形态选 A（陪伴运行时）还是 B（桌面游戏基座）？ | 决定 P0-3/R9 是否做；决定内容市场范围 | 用户/产品 owner，下一阶段前 |
| Q2 | 内容市场是否允许第三方「新角色/新动画」？还是只做主题/声音/对话包？ | 决定 P0-1 是否升级为阻塞、R3 的优先级 | 同上 |
| Q3 | 近期是否做 DLC/付费？ | 决定 P0-2 ceremony 的时间窗；若否，建议把 DLC 从 release 移除 | 用户/法务/商业 |
| Q4 | 42 句 baked DeepSeek TTS WAV 的再分发权利是否已确认？ | 决定 R4 能否对外发布压缩音频；不确定则只能内部/研究构建使用 | 用户/法务（README 许可矩阵已列 TBD） |
| Q5 | 占位美术何时替换为正式美术？替换时是否保留生成器/`--check`？ | 决定 R2 的单一 timing 源是否必须与生成器解耦 | 美术 owner |
| Q6 | 是否接受「内容市场暂不交付新角色」的对外表述？ | 影响 UI/文案与预期管理 | 产品/市场 |

---

## 12. 一句话结论（给 lead）

**动画与互动的单点工程质量已经够用，真正的游戏工程债在「资产/内容契约」和「发布信任链」：先把 `famling.pet-anim/0.2` 资产包 + 数据驱动角色注册表 + 热切换做出来，同时完成生产 DLC key ceremony；在此之前的唯一正确动作是收敛运行时与预算，而不是继续扩内容市场 UI 或给死 clip 调像素。**


