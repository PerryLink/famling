# Famling 在线预览（demo）

公开仓内的 pet-only 像素宠物静态预览：3 个角色、待机循环、点击触发动作，无 DSH 依赖、无网络请求、无遥测。
由 GitHub Pages 从本目录部署；素材来自 `public/assets/pet/anim/`（2026-11-22 final art）。

- `index.html` / `style.css` / `app.js`：无依赖的 canvas 预览。
- `frames.json`：从 final art 抽出的 3 个角色 × 5 个 clip 帧清单。
- `assets/`：对应的 96×96 PNG 帧（仅演示用）。

更新方式：从 `public/assets/pet/anim/<char>/manifest.json` 与帧目录重新生成（见仓库根 `docs/demo/` 的 GIF）。