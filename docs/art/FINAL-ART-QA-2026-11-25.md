# Final Art QA（汀岚 / 猫 / 狗，2026-11-25）

## 结论

- 三套内置角色的 final art 已在本机 Famling 0.2.1 portable（Tauri + WebView2）实际渲染，并通过视觉 smoke。
- 汀岚 human：29 tags / 141 帧；布偶猫 cat：29 tags / 143 帧；金毛 dog：28 tags / 136 帧（含 12-tag 兼容别名，共 420 帧）。
- 逐帧 contact sheet：
  - [human](qa/final-human-all-frames-2026-11-25.png)
  - [cat](qa/final-cat-all-frames-2026-11-25.png)
  - [dog](qa/final-dog-all-frames-2026-11-25.png)
  - [UI badges/icons](qa/final-ui-icons-badges-2026-11-25.png)
- 生成/来源：2026-11-22 final art；见 [ART-REBUILD-2026-11-22.md](../ART-REBUILD-2026-11-22.md)。AI-assisted，模型许可 UNVERIFIED。

## 本机 smoke 记录

- 启动 `Famling_0.2.1_x64-portable` 的 `famling-tauri.exe`；WebView2 remote debugging 连接成功。
- 设置 `desktop-games/pet/hero=1` 与 `desktop-games/pet/heroCharacter=humanoid|cat|dog` 后重载，canvas 192×192 可见，三套 final art 均正常渲染。
- 第二次启动同一 exe：进程 exit 0，tasklist 仍只有第一个 PID（单实例路径）。
- 默认渲染器仍为折纸（origami），final art 需从角色中心/渲染器切换；这是现有产品默认，不是资产缺失。
- 页面 `document.title` 仍为旧名 Pagefold，TOS 文案也使用 Pagefold / 汀岚；身份与法务命名待 owner 决策后统一。

## 未验证

- 托盘图标可视化、panic crash 报告真实写盘（需受控触发）。
- approval pending > 0 的真机 DSH 审批（需要 agent turn + 工具审批）；dsh-famling 的字段可用性见 DSH smoke 记录。

## 2026-11-25 复核（用户反馈后）

- 猫/汀岚/狗的 PNG 均为 **alpha 0/255 透明底**（transparent checker 预览可见）；当前 contact sheet 已改为棋盘格透明底，不再用深色底造成“黑背景”误读。
- 狗 source art 中有一条纵向浅色胸口/腹部带（红框标注图在本地 audit 目录）；不是透明缺口，也不是 alpha 黑洞。
- 汀岚 idle 的帧差只覆盖 y≈4–55（头/上身），身体静止；walk/run 帧差覆盖到 y=90（腿/全身）。若需要 idle 全身动，需新增/重绘 idle 动画。
- native Tauri 窗口为 layered+transparent；黑底若在 app 窗口出现，属于窗口合成/桌面背景问题，不是 PNG 资产。

## 0.2.2 修复（2026-11-25）

- 狗：去除 final art 中纵向浅色胸口/腹部条（`y=42-90` 内的浅色像素统一为身体橙金色 `#f2cf87`；136 帧全部处理）。
- 汀岚 idle：6 帧整体做 ±1px 横向摆动（whole-sprite sway，不做部件错位），让身体参与轻微运动而不产生内部接缝。
- 透明背景：高对比度主题的 `--famling-content-bg` 不再绘制到桌宠窗口的 `.book::before`（透明背景选择优先），修复本机运行时黑框与动画中透明缝隙发黑。
- 重新生成 checkerboard QA contact sheets。

## 0.2.3 追加修复

- 狗：清除臀部纵向黑色接缝列（x=70–74 内的暗色像素用相邻非暗色填充），136 帧全部处理。
- 应用层：启动时调用 WebView2 setBackgroundColor([0,0,0,0]) 并添加 capability，Windows 透明 WebView2 默认黑底不再出现在透明缝隙。
