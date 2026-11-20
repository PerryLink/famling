# 内容日历 / 台词包（`famling.calendar/0.1`）

> 状态：**纯数据 + 纯函数已落地；UI/main 接线未做**（root 统一接线）。
> 日期：2026-11-21（Asia/Shanghai）。
> 数据：`public/content/library.json` 顶层新增 `calendarEvents`（additive）。
> 选择逻辑：`src/pet/calendar-events.ts`（纯叶子模块，无 import、无网络、无时钟副作用）。
> 校验/加载/暴露：`src/pet/content-library.ts`（`parseContentLibrary` / `library.calendarEvents?` / `resolveCalendarLine`）。
> 回归测试：`tests/calendar-events.test.ts`。

## 0. 目标与非目标

| 目标 | 实现 |
|---|---|
| 3 个内置角色（humanoid / cat / dog）按**本地日期**确定性选择 1 句台词 | `pickCalendarLine(events, query)` / `resolveCalendarLine(library, query)` |
| 覆盖季节（春夏秋冬）、中性公共节日（元旦/春节/元宵/清明/端午/中秋/国庆/圣诞）、工作日/周末 | 14 个 canonical occasion（8 festival + 4 season + 2 day-kind） |
| 可叠加在现有 dialogue 模式之上：只产出 1 句 ambient 或 interactive 台词 + occasion id | 输出 `CalendarLine`（`occasionId` / `occasionKind` / `channel` / `line` / `date`） |
| 无网络、无时区库依赖、可注入时钟、非法输入降级 null | 纯函数；`date` 显式注入或 `now` 注入；全部降级路径返回 null |

**非目标（明确不做）**：签到/连续天数/打卡/推送/倒计时/限时/签到奖励等 FOMO 机制；新增美术帧/音频；新增网络请求；修改六分类 schema 或 bump 目录 `version`；接线 UI/`main.ts`/`desktop-shell.ts`（root 之后统一做）。

## 1. 数据契约（`public/content/library.json` → `calendarEvents`）

`calendarEvents` 是**可选**顶层字段；缺失时 `parseContentLibrary` 行为与之前完全一致（旧目录/旧调用方无感）。
字段为 closed schema（未知字段拒绝）：

```json
{
  "calendarEvents": {
    "schema": "famling.calendar/0.1",
    "version": "1.0.0",
    "updatedAt": "2026-11-21",
    "occasions": [
      { "id": "new-year", "name": "元旦", "kind": "festival", "dates": ["01-01"] },
      { "id": "spring-festival", "name": "春节", "kind": "festival", "dates": ["2026-02-17", "..."] },
      { "id": "season-spring", "name": "春天", "kind": "season", "months": [3, 4, 5] },
      { "id": "weekend", "name": "周末", "kind": "day-kind", "weekdays": [0, 6] }
    ],
    "characters": [
      {
        "id": "humanoid",
        "name": "汀岚",
        "source": "builtin",
        "available": true,
        "lines": {
          "new-year": { "ambient": ["..."], "interactive": ["..."] }
        }
      }
    ]
  }
}
```

| 字段 | 规则（`content-library.ts` 校验） |
|---|---|
| `schema` | 固定 `famling.calendar/0.1` |
| `version` / `updatedAt` | SemVer / `YYYY-MM-DD`（块级版本，不 bump 目录 `version`） |
| `occasions[]` | 恰好 14 条 canonical id，id/kind 必须与代码 taxonomy 一致；重复/未知 id 拒绝 |
| festival `dates[]` | `MM-DD`（每年重复）或 `YYYY-MM-DD`（指定年）；必须是真实日期、去重、≤24 条 |
| season `months[]` | 1..12 整数；四个季节必须恰好无重叠覆盖 1..12 |
| day-kind `weekdays[]` | 0..6（0=周日，JS `getDay()`）；两个 day-kind 必须恰好覆盖 0..6 |
| `characters[]` | 恰好 humanoid/cat/dog 三条；`source:'builtin'`、`available` 布尔 |
| `lines` | 必须覆盖全部 14 个 occasion；每个 occasion 至少一个 channel；数组 1..4 条 |
| 台词文本 | 纯文本（无 `<`/`>`、无控制/双向/换行字符）、去首尾空白、≤40 码点、同 channel 内不重复 |

内置数据：3 角色 × 14 occasion × 2 channel × 2 句 = **168 句**（不含美术/音频引用，不含 URL）。

## 2. 选择规则（`pickCalendarLine`）

1. **OFF**：`query.enabled === false` → `null`。
2. **模式门禁**：`dialogueMode` 必须是 `standard|brief|quiet|custom`，未知 → `null`；`quiet` 的 `ambient` 一律 `null`（安静模式只保留显式交互短句），`interactive` 仍可用。
3. **日期**：优先显式 `date`；否则用注入的 `now`（默认 `new Date()`）取**本地** 年/月/日。非法/未知日期 → `null`（如 2 月 30 日、13 月、非法 `Date`）。
4. **匹配**：festival 按 `dates`；season 按月份；day-kind 按 JS 星期。
5. **优先级**：
   - festival > 其余（同一天多个 festival 时按 canonical 顺序，如 2031-10-01 = 中秋 + 国庆 → 中秋）；
   - 无 festival 时按 channel：`ambient` = 季节 > 工作日/周末；`interactive` = 工作日/周末 > 季节。
6. **确定性**：`line = lines[FNV1a(date|occasion|channel|character) % lines.length]`；同一 `(日期, 角色, 模式, channel)` 永远同一句。无 `Math.random`。
7. **降级**：未知角色 / `available:false` / 缺块 / 缺句 → `null`；某个候选 occasion 没句子时按优先级继续尝试下一个候选（最终仍可 `null`）。

```ts
import { resolveCalendarLine } from './src/pet/content-library.ts'

const line = resolveCalendarLine(library, {
  // 渲染器/插件的角色 id `human` 需要先映射到 `humanoid`（cat/dog 同名）；
  // 共享映射见 dsh-famling 插件 characterIdMap 与 tests/parity-contract.test.ts。
  characterId: currentCharacterId,   // humanoid | cat | dog
  dialogueMode: dialogue.mode,      // standard | brief | quiet | custom
  channel: 'ambient',               // 自动气泡；显式交互传 interactive
  now,                              // 可注入 Date（测试/确定性）；默认 new Date()
})
if (line !== null) {
  // 可叠加：line.line + line.occasionId；是否真正显示仍由现有 dialogue 模式/概率决定
}
```

接线建议（root）：先按现有 `dialogue.ambientBubbles` / `shouldShowBubble()` 决定是否弹气泡，再在原有台词池之外**以低概率**叠加日历句（例如每 N 次 ambient 才尝试一次，避免每句都是节日）；`quiet` 模式只走 `interactive`。本任务不实现该策略。

## 3. 数据来源与核对（2026–2036）

- 春节 / 元宵 / 端午 / 中秋：2026-11-21 双源交叉核对（表一致）：
  - `https://tushuoit.com/xx/ref-lunar-festivals.html`（农历节日速查表 2024–2036）
  - `https://knowyourbazi.com/zh-hans/nongli/`（农历/公历对照 2026–2036）
- 清明（按节气，公历 4/4–4/6 摆动）：双源核对 `https://www.rili.com.cn/24jieqi/qingming/` 与公开万年历列表；另用 `[Y×0.2422+4.81]−[Y/4]` 公式自检 2026–2036 全部一致。
- 元宵在数据中显式列出，并由测试断言 `元宵 == 春节 + 14 天`（农历十五 = 初一后 14 天）。
- 元旦 / 国庆 / 圣诞为固定 `MM-DD`，任意年份可用。

**覆盖范围**：lunar/清明表覆盖 **2026–2036**。范围外年份不报错、不猜测：当天仍会回退到季节/工作日-周末台词；若需要更长时间线，只需在 `library.json` 追加日期（不改代码）。

## 4. 内容红线（测试已固化）

- 只做中性公共节点；台词为陈述/观察句，**不制造情感依赖**（禁：想你/陪你/爱你/喜欢你/抱抱/亲亲/别走/永远/主人 等）。
- 不做 FOMO/推送/签到（禁：签到/打卡/连续/倒计时/限时/最后一天/错过/礼物 等）。
- 不含政治标语、不含 URL/`url(`/`@import`/`javascript:`、不引用 `.png/.ogg/.wav//assets/`（不新增美术/音频）。

## 5. 验证（2026-11-21，Windows 靶向执行）

```text
> npx tsx --test tests/calendar-events.test.ts
✔ 18 tests / 18 pass / 0 fail

> npx tsx --test tests/content-library.test.ts tests/parity-contract.test.ts
✔ 48 tests / 48 pass / 0 fail   （既有目录/插件 parity 无回归：version 0.2.0 / updatedAt 2026-11-19 未 bump）
```

## 6. 未做 / 风险 / 集成事项

| 项 | 说明 |
|---|---|
| UI/main 接线未做 | 本任务只交付数据 + 纯函数；`main.ts` / `desktop-shell.ts` / 气泡调度器未改。 |
| 叠加频率策略未定 | 当前函数只回答“这台词是什么”；何时弹、与现有台词池如何轮换由接线方决定（建议低概率叠加）。 |
| 覆盖范围有限 | 农历/清明表止于 2036；范围外回退到季节/星期台词。2036 年需要人工追加。 |
| origami 未覆盖 | 任务要求 3 个内置角色；origami 传入选角会降级 `null`（不会报错）。 |
| 目录 `updatedAt` 未改 | 为保持与 dsh-famling 插件冻结的 `version/updatedAt` parity（`tests/parity-contract.test.ts`），目录级 `version: 0.2.0` / `updatedAt: 2026-11-19` 保持不变；新块自带 `updatedAt: 2026-11-21`。 |
| `public/content/README.md` 待补 | 该文件是目录 schema 文档（不在本次写 scope 内），§2.1 顶层字段表需要新增 `calendarEvents` 一行（root 同步）。 |
| 未跑全量 CI | 本子任务只跑靶向测试 + `tsc --noEmit`；全量 `npm run ci` / 覆盖率门禁由 root 统一跑。 |
