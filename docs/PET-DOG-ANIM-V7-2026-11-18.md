# 金毛（v7 动画）接入 hero / 桌面壳（2026-11-18）

- 范围：把 `public/assets/pet/anim/dog/`（v7 金毛占位动画：96×96、12 tags / 68 帧、anchor 48/96、footBox `[-36,-18,72,18]`）接进 pet 页 hero 渲染器与桌面壳菜单。
- 不改：kernel/存档/语音/Tauri 配置/构建配置；猫/人/旧 `dog-placeholder` 包原样保留（旧包不再被 `pet-dog` 引用，但文件未删）。
- 相关文件：`public/characters/pet-dog/{character,behavior}.json`、`src/pet/hero-runtime.ts`、`src/pet/hero-actions.ts`（新）、`src/pet/desktop-shell.ts`、`src/pet/main.ts`、`src/pet/consent/data-controls.ts`、`tests/hero-dog-integration.test.ts`（新）、`tests/{default-packs,hero-runtime,input-safety-static}.test.ts`。

## 1. 怎么看到金毛

```bash
cd /mnt/d/Projects/dsh/desktop-games
npm run dev        # http://127.0.0.1:5173/pet.html
```

三种入口（任选）：

| 方式 | 操作 | 结果 |
|---|---|---|
| URL（一次性） | `http://127.0.0.1:5173/pet.html?hero=1&character=dog` | hero 画布直接渲染 v7 金毛；`?shell=window` 可看完整布局 |
| 桌面壳菜单（持久） | 右键/菜单按钮 →「渲染器：金毛（动画）」 | 写入 `desktop-games/pet/hero=1`、`desktop-games/pet/heroCharacter=dog` 并刷新；之后不带参数打开 pet.html 也是金毛 |
| 切回折纸 | 菜单 →「渲染器：折纸（默认）」 | 写 `hero=0` 并刷新；旧摸摸/给纸片/折一下恢复 |

桌面壳菜单在 hero 已激活时提供三项动作：

- **摸头（hero）** → `HeroRuntime.emit('pat')` → v7 `pat_head`（4 帧 / 500ms，非循环，回落 idle）；
- **抛球** → `emit('ball_throw')` → `ball_throw`（5 帧 / 500ms），500ms 后自动接 `emit('ball_chase')` → `ball_chase`（6 帧 / 500ms）；
- **追球** → `emit('ball_chase')`（可单独使用，不依赖抛球）。

注意：`?character=` 的优先级高于持久 `heroCharacter`。若当前 URL 带 `?character=humanoid`，菜单切换后刷新仍会被 URL 覆盖；用不带 `?character=` 的 pet.html 测菜单持久化。

## 2. 数据映射（behavior.json）

| state | v7 tag | 类型 | 说明 |
|---|---|---|---|
| `idle` | `idle` | loop 6f@6fps | 呼吸；4–10s ambient 调度源 |
| `idle_blink` | `idle_blink` | one-shot 3f@12fps | 眨眼，250ms 回 idle |
| `rub` / `pat_head` | `pat_head` | one-shot 4f@8fps | 摸头（`pat` event / hero 菜单） |
| `play` / `stand_wag` | `stand_wag` | one-shot 6f@8fps | `play`/`feed` 与微动作 |
| `ball_throw` | `ball_throw` | one-shot 5f@10fps | hero 抛球 |
| `ball_chase` | `ball_chase` | one-shot 6f@12fps | hero 追球 / 抛球后续 |
| `paw_face` | `paw_face` | one-shot 5f@8fps | ambient 微动作 |
| `scratch` | `scratch` | one-shot 6f@8fps | ambient 微动作 |
| `chase_tail` | `chase_tail` | one-shot 6f@10fps | ambient 微动作 |
| `attack` | `attack` | one-shot 7f@16fps | 保留 tag 的事件入口（`attack`） |
| `bark` | `idle` | 瞬态 | v7 无 talk；犬吠以 idle 表现（思考气泡仍走旧 UI） |
| `nudge` | `idle` | 瞬态 + 60s cd | 提醒无独立动画 |
| `drag` | `idle` | loop | 拖拽不再有悬空帧 |
| `land` | `idle` | 瞬态 | 落地无独立动画 |
| `sleep` | `idle` | loop | 夜间以 idle 呼吸代替睡姿 |

- `character.json` 的 `fallback` 仍保留旧 tag 链：`talk/remind/drag/land/sleep/bark/nudge → idle`、`pat → pat_head`、`play → stand_wag`；旧包/QA 工具不会拿到未知 tag。
- ambient（`behavior.ambient`）：每 4–10s 从 `idle(5) / idle_blink(3) / paw_face(2) / scratch(2) / stand_wag(2) / chase_tail(1)` 加权选择；one-shot 由 pack 帧时长自动回落 idle，loop 状态（idle/drag/sleep）不参与 ambient。
- 未驱动 tag：`walk` / `run`（待移动系统）、`attack`（仅事件入口）。包仍完整加载，不会报 missing。

## 3. 持久化 / 配置

| localStorage key | 值 | 写入方 | 读取方 |
|---|---|---|---|
| `desktop-games/pet/hero` | `'1'` / `'0'` | 桌面壳渲染器菜单 | `resolveHeroConfig()`（既有） |
| `desktop-games/pet/heroCharacter` | `humanoid/cat/dog/tinglan` | 桌面壳「渲染器：金毛（动画）」写 `dog` | `resolveHeroConfig()`：仅当 URL 没有合法 `?character=` 时生效，默认 `humanoid` |

- 非法值/空白/大小写/存储抛错一律回退 `humanoid`，不会让页面启动失败。
- 新增 key 已加入 `KNOWN_PET_STORAGE_KEYS`，归类为 `preferences`，随「删除全部本地数据」一并清除。
- 渲染器菜单写入后 `location.reload()`；存储不可用时不刷新（避免“点了没变”）。

## 4. 验证（本机实测）

```bash
cd /mnt/d/Projects/dsh/desktop-games
node -e "JSON.parse(require('fs').readFileSync('public/characters/pet-dog/character.json'));JSON.parse(require('fs').readFileSync('public/characters/pet-dog/behavior.json'));console.log('json ok')"
node --import tsx --test tests/hero-dog-integration.test.ts
npm test              # 870/870 pass（2026-11-18 实测）
npx tsc --noEmit      # 0 error
npm run fci:validate  # exit 0；pet-dog: 17 states / 18 rules / 18 slots / required 10 tags / missing 0
```

## 5. 已知限制 / 风险

1. **没有移动系统**：`walk/run` 帧已加载但 behavior 不驱动；拖动角色只有本地 transform 跟随，仍是 `idle` 姿态。
2. **无 talk/sleep/land 专属帧**：犬吠/提醒/落地/睡眠在视觉上都是 idle；如需差异化，应在下一版动画包补 `talk`/`sleep`/`land` tag 再映射。
3. **v7 帧细节**：`chase_tail_03.png` 有一处 ≤10px 的贴身毛簇/爪尖未描边（默认包测试对 v7 允许 ≤5% 轮廓容忍）；同帧集的 run/chase/attack 有刻意分离的尘土/运动短线。若要严格 1px 全描边，需回到生成器修帧（`scripts/gen-pet-anim-frames.py`），本次未改帧。
4. **抛球链**：`ball_throw` 菜单动作在 500ms 后自动 `ball_chase`；若用户在此期间点「追球」，会有一次重复 chase 事件（数据层 cooldown 600ms 会忽略第二次，视觉无叠加）。
5. **URL 覆盖**：`?character=` 优先于持久选择；用带该参数的链接时菜单切换会被 URL 覆盖，这是既有约定。
6. **Tauri**：本次未改任何 Tauri 配置；桌面壳只是 web 层菜单/存储。打包后的 Tauri 窗口需重新 `npm run build` 才能看到新菜单（开发时 `npm run dev` 即时生效）。
