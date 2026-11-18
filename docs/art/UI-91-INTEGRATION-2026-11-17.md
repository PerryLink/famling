# UI 91 接入（右键菜单图标）— 2026-11-17

Status: **最小真实消费已接；资产本身仍 `placeholder-only`，非 final。**

## 已接

`src/pet/desktop-shell.ts` 的右键菜单主操作图标（16px 显示，32px 源，`image-rendering: pixelated`）：

| 菜单项 | 资产 |
|---|---|
| 摸摸 | `menu/U-MENU-01a_32x32.png` |
| 给纸片 | `menu/U-MENU-02a_32x32.png` |
| 折一下 | `menu/U-MENU-03a_32x32.png` |
| 折页簿 | `menu/U-MENU-04a_32x32.png` |
| 导入 DeepSeek 网页会话… | `menu/U-MENU-05a_32x32.png` |
| Advisers 开关 | `menu/U-MENU-06a_32x32.png` |
| 模型 / API Key 设置… | `menu/U-MENU-07a_32x32.png` |
| 关于与声明（完整 TOS/免责声明）… | `menu/U-MENU-09a_32x32.png` |
| 退出 | `menu/U-MENU-10a_32x32.png` |

- 文本仍保留；图标 `alt=""` + `aria-hidden`，不改变可访问名称；图标在文本右侧，不遮挡。
- 静态 consent 测试已同步（仍锁 TOS 门禁顺序）。
- 其余 82 个逻辑资产未接线：菜单 scale/10 号、props、badges、placeholders、indicators、app icons、backgrounds、FX、roleplay；留给托盘/面板/roleplay/设置页消费。

## 验证

- `npm test`：620/620 pass
- `npm run typecheck`：PASS
- `npm run build`：PASS（`dist/assets/ui/**` 99 files）
- 资产：91 逻辑 / 97 物理；0 API；manifest/MAPPING/QA contact sheets 见 `public/assets/ui/`、`docs/art/UI-91-GENERATION-2026-11-17.md`

## 仍待

- 人工 16/32px 深浅底、DPR 125/150 截图验收
- tray/app icon 定稿与 Windows 实测
- roleplay 卡片法务/内容复核
- 未接 UI 的其余资产（不是 91 生成遗漏）
