# 审批 HUD UI 资产（2026-11-25）

- 范围：public/assets/ui/badges/U-BADGE-13/14/15，3 组徽章（每组 16px 母版 + 32px 整数 2x），共 6 个 PNG/资产。
- 用途：dsh-famling 0.14.0 的只读“审批等待”HUD（approvals.pending > 0），不显示工具名/参数/会话/agent id。
- 生成：art-rebuild/work/tools/gen_approval_ui.py（Python/Pillow 确定性像素绘制；无 AI 模型、无网络、无第三方素材）。
- 规范：8-bit RGBA、硬 alpha 0/255、1px #1b1612 墨线、famling-ui-pixel@0.1 调色板、每资产 ≤6 色、32px 为母版最近邻整数 2x。
- 清单：public/assets/ui/manifest.json（id/title/counts/fileIndex/assets 已更新为 97 资产 / 103 文件）。
- 语义：13 = 待确认提醒（气泡 + !）；14 = 工作完成（对勾）；15 = 等待中（沙漏）。
- 未做：未接入 pet.html/main.ts/desktop-shell.ts；未做接触表/深浅底人工验收；需要产品决定是否在 UI 中显示数量。
