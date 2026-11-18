# UI / roleplay 91 资产映射（MAPPING）

- 生成：`art/_placeholder/ui-91-2026-11-17/gen_ui91.py`（本地确定性像素绘制，0 API / 0 模型 / 0 网络）；日期 2026-11-17。
- 注册表：`docs/art/per-image/INVENTORY-UI-ROLEPLAY-2026-11-16.md`；报告：`docs/art/UI-91-GENERATION-2026-11-17.md`；manifest：`public/assets/ui/manifest.json`。
- 口径：**91 逻辑资产 = 91 主档文件 + 6 个 roleplay 2x 档 = 97 物理文件**（INV-91 §1/§3.9；`docs/audit/UI-DEFAULTS-GAP-AUDIT-2026-11-17.md` §1 亦注明「91 是 registry 条目，不是物理文件数」）。
- 状态：**占位/试点资产，未接入 UI 代码、未做人工像素终审、非 final**。许可 `placeholder-only`（禁商用）；工程接入后按 DECLARATIONS/ASSET-LICENSES 政策补登；AI 披露 = none。

## 组总览

| 组 | 资产 | 文件 | 尺寸档 | 优先级 | 色数上限 | 轮廓 | 说明 |
|---|---:|---:|---|---:|---:|---|---|
| 右键菜单图标 (`menu`) | 20 | 20 | 32 母版 + 64=2x 整数放大；hover/focus/disabled 由 CSS | P1 | 12 | `#1b1612` | 透明底，四角透明 |
| 道具/计数图标 (`props`) | 18 | 18 | 16 单独重绘 + 32 母版 + 64=2x | P1 | 12 | `#1b1612` | 透明底，四角透明 |
| 状态徽章 (`badges`) | 12 | 12 | 16 母版 + 32=2x；图标+颜色，不依赖文字 | P1 | 6 | `#1b1612` | 透明底，四角透明 |
| 占位/加载/错误/回落 (`placeholders`) | 8 | 8 | 48 母版 + 96=2x；不伪造角色 | P1 | 8 | `#8fa8c0` | 透明底，四角透明 |
| 指示器 (`indicators`) | 18 | 18 | 12/16/24 各自重绘（无整数倍链） | P1 | 8 | `#1b1612` | 透明底，四角透明 |
| 应用/托盘图标 (`icons`) | 4 | 4 | 16/32 母版，256=32x8，ICO 打包 16/32/48/256 | P0 | 6 | `#1b1612` | 透明底，四角透明 |
| 背景/装饰 (`backgrounds`) | 3 | 3 | 480x336（10:7）；图内无字，文字由 DOM 承载 | P2 | 16 | `#1b1612` | 见 BG 说明 |
| 动效位图（可选） (`fx`) | 2 | 2 | 24x24 气泡 tail / 48x48 折页闪光；CSS 可替代 | P2 | 6 | `#1b1612` | 透明底，四角透明 |
| roleplay 合规 UI (`roleplay`) | 6 | 12 | 母版 + 2x 同 ID 两档；RP-002 为中性全年龄标识（无文字） | P1 | 16 | `#1b1612` | 透明底，四角透明 |

合计 **91 资产 / 97 文件**；P0 10 / P1 76 / P2 5。

## 右键菜单图标（`menu`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-MENU-01a` | `menu/U-MENU-01a_32x32.png` | 32 | 摸摸（互动·pat） | P1 | 右键菜单项「摸摸」；hover/focus/disabled 由 CSS，勾选用 DOM | 开掌 + 3 条 1px 动线 |
| `U-MENU-01b` | `menu/U-MENU-01b_64x64.png` | 64 | 摸摸（互动·pat） | P1 | 右键菜单项「摸摸」；hover/focus/disabled 由 CSS，勾选用 DOM | 开掌 + 3 条 1px 动线；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-02a` | `menu/U-MENU-02a_32x32.png` | 32 | 给纸片（互动·给纸片） | P1 | 右键菜单项「给纸片」；与 U-PROP-01 同语义母版 | 纸片 + 折角 + 金色加号 |
| `U-MENU-02b` | `menu/U-MENU-02b_64x64.png` | 64 | 给纸片（互动·给纸片） | P1 | 右键菜单项「给纸片」；与 U-PROP-01 同语义母版 | 纸片 + 折角 + 金色加号；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-03a` | `menu/U-MENU-03a_32x32.png` | 32 | 折纸（互动·折一下） | P1 | 右键菜单项「折纸」；与 U-PROP-02 折物同族 | 折纸狐 + 折痕，非写实动物 |
| `U-MENU-03b` | `menu/U-MENU-03b_64x64.png` | 64 | 折纸（互动·折一下） | P1 | 右键菜单项「折纸」；与 U-PROP-02 折物同族 | 折纸狐 + 折痕，非写实动物；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-04a` | `menu/U-MENU-04a_32x32.png` | 32 | 折页簿（合并态） | P1 | 右键菜单项「折页簿」；与 U-PROP-03 同语义母版 | 合起簿 + 1px 书签带 |
| `U-MENU-04b` | `menu/U-MENU-04b_64x64.png` | 64 | 折页簿（合并态） | P1 | 右键菜单项「折页簿」；与 U-PROP-03 同语义母版 | 合起簿 + 1px 书签带；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-05a` | `menu/U-MENU-05a_32x32.png` | 32 | 导入 | P1 | 右键菜单项「导入」；方向=向内，与 U-MENU-10 相反 | 收件托盘 + 下箭头 |
| `U-MENU-05b` | `menu/U-MENU-05b_64x64.png` | 64 | 导入 | P1 | 右键菜单项「导入」；方向=向内，与 U-MENU-10 相反 | 收件托盘 + 下箭头；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-06a` | `menu/U-MENU-06a_32x32.png` | 32 | Advisers | P1 | 右键菜单项「Advisers」；禁用鲸鱼/官方联想，非官方剪贴板 mark | 剪贴板 + 三条勾线 + 角标 |
| `U-MENU-06b` | `menu/U-MENU-06b_64x64.png` | 64 | Advisers | P1 | 右键菜单项「Advisers」；禁用鲸鱼/官方联想，非官方剪贴板 mark | 剪贴板 + 三条勾线 + 角标；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-07a` | `menu/U-MENU-07a_32x32.png` | 32 | 设置 | P1 | 右键菜单项「设置」；滑杆语义，非齿轮，避免与系统设置撞形 | 两组横滑杆 + 方形旋钮 |
| `U-MENU-07b` | `menu/U-MENU-07b_64x64.png` | 64 | 设置 | P1 | 右键菜单项「设置」；滑杆语义，非齿轮，避免与系统设置撞形 | 两组横滑杆 + 方形旋钮；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-08a` | `menu/U-MENU-08a_32x32.png` | 32 | 缩放（宠物大小） | P1 | 菜单缩放项/面板入口；禁 1x/2x 文字，无数字字母 | 放大镜 + 四向外角箭头 |
| `U-MENU-08b` | `menu/U-MENU-08b_64x64.png` | 64 | 缩放（宠物大小） | P1 | 菜单缩放项/面板入口；禁 1x/2x 文字，无数字字母 | 放大镜 + 四向外角箭头；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-09a` | `menu/U-MENU-09a_32x32.png` | 32 | 关于 | P1 | 右键菜单项「关于」；纯几何信息环，非官方 i-mark | 信息环 + 1px 竖条 + 点 |
| `U-MENU-09b` | `menu/U-MENU-09b_64x64.png` | 64 | 关于 | P1 | 右键菜单项「关于」；纯几何信息环，非官方 i-mark | 信息环 + 1px 竖条 + 点；32 母版整数 2x，不重采样、不加细节 |
| `U-MENU-10a` | `menu/U-MENU-10a_32x32.png` | 32 | 退出 | P1 | 右键菜单项「退出」；方向=向外，与 U-MENU-05 导入相反 | 门框 + 向右外指箭头 |
| `U-MENU-10b` | `menu/U-MENU-10b_64x64.png` | 64 | 退出 | P1 | 右键菜单项「退出」；方向=向外，与 U-MENU-05 导入相反 | 门框 + 向右外指箭头；32 母版整数 2x，不重采样、不加细节 |

## 道具/计数图标（`props`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-PROP-01a` | `props/U-PROP-01a_16x16.png` | 16 | 纸片（羁绊计数） | P1 | HUD 羁绊计数 / 给纸片同源；16 单独重绘 | 单张纸片 + 折痕，三阶明暗；16 单独重绘（不缩 32） |
| `U-PROP-01b` | `props/U-PROP-01b_32x32.png` | 32 | 纸片（羁绊计数） | P1 | HUD 羁绊计数 / 给纸片同源；16 单独重绘 | 单张纸片 + 折痕，三阶明暗 |
| `U-PROP-01c` | `props/U-PROP-01c_64x64.png` | 64 | 纸片（羁绊计数） | P1 | HUD 羁绊计数 / 给纸片同源；16 单独重绘 | 单张纸片 + 折痕，三阶明暗；32 母版整数 2x |
| `U-PROP-02a` | `props/U-PROP-02a_16x16.png` | 16 | 折纸小动物（鹤） | P1 | 折物计数 / 折页簿；16 只留鹤剪影 | 折纸鹤 + 三个折面，非写实鸟；16 单独重绘（不缩 32） |
| `U-PROP-02b` | `props/U-PROP-02b_32x32.png` | 32 | 折纸小动物（鹤） | P1 | 折物计数 / 折页簿；16 只留鹤剪影 | 折纸鹤 + 三个折面，非写实鸟 |
| `U-PROP-02c` | `props/U-PROP-02c_64x64.png` | 64 | 折纸小动物（鹤） | P1 | 折物计数 / 折页簿；16 只留鹤剪影 | 折纸鹤 + 三个折面，非写实鸟；32 母版整数 2x |
| `U-PROP-03a` | `props/U-PROP-03a_16x16.png` | 16 | 折页簿（合） | P1 | 折页簿入口/面板入口；与 U-MENU-04 同语义 | 合起簿 + 书签带，与 04 开态成对；16 单独重绘（不缩 32） |
| `U-PROP-03b` | `props/U-PROP-03b_32x32.png` | 32 | 折页簿（合） | P1 | 折页簿入口/面板入口；与 U-MENU-04 同语义 | 合起簿 + 书签带，与 04 开态成对 |
| `U-PROP-03c` | `props/U-PROP-03c_64x64.png` | 64 | 折页簿（合） | P1 | 折页簿入口/面板入口；与 U-MENU-04 同语义 | 合起簿 + 书签带，与 04 开态成对；32 母版整数 2x |
| `U-PROP-04a` | `props/U-PROP-04a_16x16.png` | 16 | 折页簿（开） | P1 | 面板有内容态；与 03 合态成对 | 打开两页 + 1px 横线；16 单独重绘（不缩 32） |
| `U-PROP-04b` | `props/U-PROP-04b_32x32.png` | 32 | 折页簿（开） | P1 | 面板有内容态；与 03 合态成对 | 打开两页 + 1px 横线 |
| `U-PROP-04c` | `props/U-PROP-04c_64x64.png` | 64 | 折页簿（开） | P1 | 面板有内容态；与 03 合态成对 | 打开两页 + 1px 横线；32 母版整数 2x |
| `U-PROP-05a` | `props/U-PROP-05a_16x16.png` | 16 | 书页 | P1 | 导入/记忆条目；与 04 开簿区分 | 单页 + 折角 + 1px 横线；16 单独重绘（不缩 32） |
| `U-PROP-05b` | `props/U-PROP-05b_32x32.png` | 32 | 书页 | P1 | 导入/记忆条目；与 04 开簿区分 | 单页 + 折角 + 1px 横线 |
| `U-PROP-05c` | `props/U-PROP-05c_64x64.png` | 64 | 书页 | P1 | 导入/记忆条目；与 04 开簿区分 | 单页 + 折角 + 1px 横线；32 母版整数 2x |
| `U-PROP-06a` | `props/U-PROP-06a_16x16.png` | 16 | 桌面小物（墨水瓶+羽毛） | P1 | 首启/About 装饰；非角色 | 墨水瓶 + 羽毛笔，三阶明暗；16 单独重绘（不缩 32） |
| `U-PROP-06b` | `props/U-PROP-06b_32x32.png` | 32 | 桌面小物（墨水瓶+羽毛） | P1 | 首启/About 装饰；非角色 | 墨水瓶 + 羽毛笔，三阶明暗 |
| `U-PROP-06c` | `props/U-PROP-06c_64x64.png` | 64 | 桌面小物（墨水瓶+羽毛） | P1 | 首启/About 装饰；非角色 | 墨水瓶 + 羽毛笔，三阶明暗；32 母版整数 2x |

## 状态徽章（`badges`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-BADGE-01a` | `badges/U-BADGE-01a_16x16.png` | 16 | Advisers 已连接 | P1 | Advisers 状态栏（ok/fresh）→ 剪贴板 + 绿点 | 绿点 #3fa66b；≤6 色 |
| `U-BADGE-01b` | `badges/U-BADGE-01b_32x32.png` | 32 | Advisers 已连接 | P1 | Advisers 状态栏（ok/fresh）→ 剪贴板 + 绿点 | 绿点 #3fa66b；≤6 色；16 母版整数 2x |
| `U-BADGE-02a` | `badges/U-BADGE-02a_16x16.png` | 16 | Advisers 已过期 | P1 | Advisers 状态栏（stale/expired）→ 剪贴板 + 沙漏 | 琥珀 #e0b35a；与 01 色差可辨 |
| `U-BADGE-02b` | `badges/U-BADGE-02b_32x32.png` | 32 | Advisers 已过期 | P1 | Advisers 状态栏（stale/expired）→ 剪贴板 + 沙漏 | 琥珀 #e0b35a；与 01 色差可辨；16 母版整数 2x |
| `U-BADGE-03a` | `badges/U-BADGE-03a_16x16.png` | 16 | Advisers 未配置 | P1 | Advisers 状态栏（no-file/disabled）→ 剪贴板 + 灰斜杠 | 灰蓝 #8fa8c0；与 02 区分 |
| `U-BADGE-03b` | `badges/U-BADGE-03b_32x32.png` | 32 | Advisers 未配置 | P1 | Advisers 状态栏（no-file/disabled）→ 剪贴板 + 灰斜杠 | 灰蓝 #8fa8c0；与 02 区分；16 母版整数 2x |
| `U-BADGE-04a` | `badges/U-BADGE-04a_16x16.png` | 16 | 导入成功 | P1 | 导入结果提示 → 纸页 + 绿勾 | 绿勾 1px 闭合 |
| `U-BADGE-04b` | `badges/U-BADGE-04b_32x32.png` | 32 | 导入成功 | P1 | 导入结果提示 → 纸页 + 绿勾 | 绿勾 1px 闭合；16 母版整数 2x |
| `U-BADGE-05a` | `badges/U-BADGE-05a_16x16.png` | 16 | 费用提醒 | P1 | 费用/额度提醒 → 金币 + 琥珀几何「!」 | 非货币符号、非文字 |
| `U-BADGE-05b` | `badges/U-BADGE-05b_32x32.png` | 32 | 费用提醒 | P1 | 费用/额度提醒 → 金币 + 琥珀几何「!」 | 非货币符号、非文字；16 母版整数 2x |
| `U-BADGE-06a` | `badges/U-BADGE-06a_16x16.png` | 16 | 占位美术徽标（P0 占位门） | P0 | 占位状态徽标/release gate 视觉；P0 但当前无消费点（G6） | 折角页 + 灰虚线轮廓 |
| `U-BADGE-06b` | `badges/U-BADGE-06b_32x32.png` | 32 | 占位美术徽标（P0 占位门） | P0 | 占位状态徽标/release gate 视觉；P0 但当前无消费点（G6） | 折角页 + 灰虚线轮廓；16 母版整数 2x |

## 占位/加载/错误/回落（`placeholders`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-PH-01a` | `placeholders/U-PH-01a_48x48.png` | 48 | 空白/无内容 | P1 | hero 空态图槽（CSS 可兜底）；禁止出现任何角色 | 空白折页轮廓 + 1px 虚线 |
| `U-PH-01b` | `placeholders/U-PH-01b_96x96.png` | 96 | 空白/无内容 | P1 | hero 空态图槽（CSS 可兜底）；禁止出现任何角色 | 空白折页轮廓 + 1px 虚线；48 母版整数 2x |
| `U-PH-02a` | `placeholders/U-PH-02a_48x48.png` | 48 | 加载中 | P1 | hero 加载态图槽；与错误态区分 | 两张叠纸 + 三点，低对比 |
| `U-PH-02b` | `placeholders/U-PH-02b_96x96.png` | 96 | 加载中 | P1 | hero 加载态图槽；与错误态区分 | 两张叠纸 + 三点，低对比；48 母版整数 2x |
| `U-PH-03a` | `placeholders/U-PH-03a_48x48.png` | 48 | 错误/离线（P0） | P0 | hero 失败/离线图槽；不指向具体角色 | 撕角纸页 + 断线头，灰蓝 |
| `U-PH-03b` | `placeholders/U-PH-03b_96x96.png` | 96 | 错误/离线（P0） | P0 | hero 失败/离线图槽；不指向具体角色 | 撕角纸页 + 断线头，灰蓝；48 母版整数 2x |
| `U-PH-04a` | `placeholders/U-PH-04a_48x48.png` | 48 | 无角色回落（P0） | P0 | hero 失败时与 DOM 折角宠共存的回落占位 | 空白折纸剪影，仅物体、无脸 |
| `U-PH-04b` | `placeholders/U-PH-04b_96x96.png` | 96 | 无角色回落（P0） | P0 | hero 失败时与 DOM 折角宠共存的回落占位 | 空白折纸剪影，仅物体、无脸；48 母版整数 2x |

## 指示器（`indicators`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-IND-01a` | `indicators/U-IND-01a_12x12.png` | 12 | 鼠标悬停提示 | P1 | hover/curious 指示器；12/16 单独重绘、24 母版 | 像素箭头 + 1px 环 |
| `U-IND-01b` | `indicators/U-IND-01b_16x16.png` | 16 | 鼠标悬停提示 | P1 | hover/curious 指示器；12/16 单独重绘、24 母版 | 像素箭头 + 1px 环 |
| `U-IND-01c` | `indicators/U-IND-01c_24x24.png` | 24 | 鼠标悬停提示 | P1 | hover/curious 指示器；12/16 单独重绘、24 母版 | 像素箭头 + 1px 环 |
| `U-IND-02a` | `indicators/U-IND-02a_12x12.png` | 12 | 拖拽提示 | P1 | drag 开始/持续；不遮宠物脸 | 抓握手 + 一条运动线 |
| `U-IND-02b` | `indicators/U-IND-02b_16x16.png` | 16 | 拖拽提示 | P1 | drag 开始/持续；不遮宠物脸 | 抓握手 + 一条运动线 |
| `U-IND-02c` | `indicators/U-IND-02c_24x24.png` | 24 | 拖拽提示 | P1 | drag 开始/持续；不遮宠物脸 | 抓握手 + 一条运动线 |
| `U-IND-03a` | `indicators/U-IND-03a_12x12.png` | 12 | 落地一次性 | P1 | land 一次性尘弧；≤3 帧内消失、不残留 | 三团 1px 尘弧，无地面阴影块 |
| `U-IND-03b` | `indicators/U-IND-03b_16x16.png` | 16 | 落地一次性 | P1 | land 一次性尘弧；≤3 帧内消失、不残留 | 三团 1px 尘弧，无地面阴影块 |
| `U-IND-03c` | `indicators/U-IND-03c_24x24.png` | 24 | 落地一次性 | P1 | land 一次性尘弧；≤3 帧内消失、不残留 | 三团 1px 尘弧，无地面阴影块 |
| `U-IND-04a` | `indicators/U-IND-04a_12x12.png` | 12 | 提醒 FX | P1 | remind 提醒；与 U-BADGE-05 同色系 | 琥珀几何「!」竖条+点，非文字 |
| `U-IND-04b` | `indicators/U-IND-04b_16x16.png` | 16 | 提醒 FX | P1 | remind 提醒；与 U-BADGE-05 同色系 | 琥珀几何「!」竖条+点，非文字 |
| `U-IND-04c` | `indicators/U-IND-04c_24x24.png` | 24 | 提醒 FX | P1 | remind 提醒；与 U-BADGE-05 同色系 | 琥珀几何「!」竖条+点，非文字 |
| `U-IND-05a` | `indicators/U-IND-05a_12x12.png` | 12 | 静音（muted） | P1 | 静音态；有声态=同母版去斜杠派生（G2，未出文件） | 喇叭 + 1px 斜杠 |
| `U-IND-05b` | `indicators/U-IND-05b_16x16.png` | 16 | 静音（muted） | P1 | 静音态；有声态=同母版去斜杠派生（G2，未出文件） | 喇叭 + 1px 斜杠 |
| `U-IND-05c` | `indicators/U-IND-05c_24x24.png` | 24 | 静音（muted） | P1 | 静音态；有声态=同母版去斜杠派生（G2，未出文件） | 喇叭 + 1px 斜杠 |
| `U-IND-06a` | `indicators/U-IND-06a_12x12.png` | 12 | 录音 PTT | P1 | PTT 按住说话；松手即消失，PTT 环由 CSS 脉冲 | 麦克风胶囊 + 红点 #d95f5f |
| `U-IND-06b` | `indicators/U-IND-06b_16x16.png` | 16 | 录音 PTT | P1 | PTT 按住说话；松手即消失，PTT 环由 CSS 脉冲 | 麦克风胶囊 + 红点 #d95f5f |
| `U-IND-06c` | `indicators/U-IND-06c_24x24.png` | 24 | 录音 PTT | P1 | PTT 按住说话；松手即消失，PTT 环由 CSS 脉冲 | 麦克风胶囊 + 红点 #d95f5f |

## 应用/托盘图标（`icons`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-ICON-01` | `icons/U-ICON-01_16x16.png` | 16 | 托盘图标（16 母版） | P0 | 托盘 Phase 2 接线；应用图标 16 档 | 折页角标记；≤4 色 + 1px 轮廓；无文字 |
| `U-ICON-02` | `icons/U-ICON-02_32x32.png` | 32 | 托盘/任务栏图标（32 母版） | P0 | 托盘/任务栏；与 16 同标记，32 重绘 | 同标记 32 母版；16 不直接缩 32 |
| `U-ICON-03` | `icons/U-ICON-03_256x256.png` | 256 | 应用图标 app-256 | P0 | 应用图标 256 档（替换 Tauri 笑脸占位） | 圆角纸块 + 折角 + 书签；≤6 色；32 网格整数 x8 |
| `U-ICON-04` | `icons/U-ICON-04_app.ico` | 256 | 应用图标 ICO 打包件 | P0 | app.ico 多档（16/32/48/256）；替换现占位并登记来源 | 由 16/32/256 打包，48=16x3 整数；来源可核 |

## 背景/装饰（`backgrounds`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-BG-01` | `backgrounds/U-BG-01_480x336.png` | 480 | 首启/引导背景 | P2 | 首启态背景（不透明底）；中心留白给 DOM 文本 | 纸桌 + 折痕、低对比 |
| `U-BG-02` | `backgrounds/U-BG-02_480x336.png` | 480 | 费用提示边框 | P2 | 费用提示态边框（透明中心）；文字/金额由 DOM 承载 | 账本 + 金币母题边框 |
| `U-BG-03` | `backgrounds/U-BG-03_480x336.png` | 480 | About 纸框（九宫格） | P2 | About 面板 9-slice 纸框；32px 边可切片，中心透明 | 折角纸框 + 平斜面，无接缝 |

## 动效位图（可选）（`fx`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `U-FX-01` | `fx/U-FX-01_24x24.png` | 24 | 气泡 tail（九宫格） | P2 | 气泡尾巴（可选位图；CSS clip-path 可 0 图） | 纸色 tail 三角，透明四角，2 阶色 |
| `U-FX-02` | `fx/U-FX-02_48x48.png` | 48 | 折页展开闪光 | P2 | 折页/折页簿展开闪光；第 2 帧由整数 scale+opacity 派生 | 纸白 + 淡金几何闪片，硬 alpha |

## roleplay 合规 UI（`roleplay`）

| ID | 文件 | 尺寸 | 角色/用途 | 优先级 | 建议消费点 | 备注 |
|---|---|---|---|---|---|---|
| `RP-001` | `roleplay/RP-001_64x64.png` + `roleplay/RP-001_128x128.png` | 64 / 128 | roleplay 模式卡（场景演练/非恋爱） | P1 | roleplay 入口模式卡；中性、工作场景感 | 剧场面具 + 对话框 |
| `RP-002` | `roleplay/RP-002_32x32.png` + `roleplay/RP-002_64x64.png` | 32 / 64 | 全年龄适用标识（无文字） | P1 | roleplay 入口/声明的全年龄状态标识；不设年龄门；图内无文字 | 中性八边形 + 绿色对勾，不露骨不卖萌 |
| `RP-003` | `roleplay/RP-003_32x32.png` + `roleplay/RP-003_64x64.png` | 32 / 64 | 非真人/AI 标识 | P1 | roleplay/语音入口常驻；须与入口、TTS 首句同现 | AI 闪光 + 对话框，不是人脸 |
| `RP-004` | `roleplay/RP-004_32x32.png` + `roleplay/RP-004_64x64.png` | 32 / 64 | 2h 休息提醒 | P1 | 连续使用 2h 触发；平静色，可关闭，不制造内疚 | 钟 + 暂停条，温和 |
| `RP-005` | `roleplay/RP-005_64x64.png` + `roleplay/RP-005_128x128.png` | 64 / 128 | 危机资源卡（覆盖态） | P1 | 危机触发覆盖卡；热线由 DOM/远端配置承载，不烘焙进图 | 救生圈 + 求助卡，无医疗十字 |
| `RP-006` | `roleplay/RP-006_32x32.png` + `roleplay/RP-006_64x64.png` | 32 / 64 | 退出 roleplay / 清除记忆 | P1 | 动作确认；删除类操作有二次确认（DOM） | 开门 + 橡皮，简洁 |

## 尺寸/后处理契约（接入时勿违反）

- 整数倍档（64=32x2、96=48x2、32=16x2、RP 2x 档）均为最近邻整数放大，**禁止**重采样/Lanczos/亚像素。
- 16px 道具、12/16px 指示器、32px 徽章为**单独重绘**，不可用缩小 32 的结果替代。
- 256 应用图标 = 32 网格设计 x8；ICO 含 16/32/48(16x3)/256 四档，可由 Pillow/浏览器/Windows 读取。
- 所有 PNG 为 8-bit RGBA、硬 alpha(0/255)、透明底（BG-01 不透明；BG-02/03 中心透明）；图标四角透明。
- 渲染：必须 `image-rendering: pixelated`；UI 只做整数缩放。

## 状态映射（语义 → 资产）

| 状态 | 资产 |
|---|---|
| Advisers 已连接 / 已过期 / 未配置 | `U-BADGE-01a/b` / `U-BADGE-02a/b` / `U-BADGE-03a/b` |
| 导入成功 | `U-BADGE-04a/b` |
| 费用/额度提醒 | `U-BADGE-05a/b` + `U-IND-04a/b/c` |
| 占位美术徽标（P0 占位门） | `U-BADGE-06a/b` |
| hero 空 / 加载 / 错误离线 / 无角色回落 | `U-PH-01a/b` / `U-PH-02a/b` / `U-PH-03a/b` / `U-PH-04a/b` |
| hover / drag / land / remind / mute / PTT | `U-IND-01..06`（12/16/24 三档） |
| 折页簿 合 / 开 | `U-PROP-03b` / `U-PROP-04b` |
| roleplay 入口 / 全年龄标识 / AI 标识 / 2h / 危机 / 退出 | `RP-001` / `RP-002` / `RP-003` / `RP-004` / `RP-005` / `RP-006` |
| app / tray | `U-ICON-01`(16) `U-ICON-02`(32) `U-ICON-03`(256) `U-ICON-04`(ICO) |

## 未做 / 仍需人工

- 未接入 `pet.html` / `main.ts` / `desktop-shell.ts`（本轮只交付资产 + manifest/mapping）。
- 人工像素终审、深浅底人工截图验收、Windows 托盘实测、ICO 在 Tauri 构建中替换验证均未做。
- `U-IND-05` 有声对偶（去斜杠 3 文件）、托盘 20/24、可选 spritesheet 未出（非 91 范围）。
- roleplay 全年龄文案/热线（DOM/远端配置承载）与法务复核未做；图内无文字（RP-002 为无文字全年龄标识，不设年龄门）。

