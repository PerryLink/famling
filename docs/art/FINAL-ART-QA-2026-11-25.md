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
