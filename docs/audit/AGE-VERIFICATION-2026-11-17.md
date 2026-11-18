# 年龄核验与 roleplay 18+ 门槛 — 实现审计（2026-11-17）

Status: **实现完成 / DRAFT** · 非法律意见、未经律师审核。基线：`desktop-games`（2026-11-17.5）。

## 0. 用户决定（2026-11-17.5）

- **一般桌宠功能全年龄可用**（不因未成年人身份整体锁死）。
- **角色扮演/情感陪伴（roleplay）仅限年满 18 周岁用户**；未成年人不能启动 roleplay。
- **首启顺序：年龄核验 → TOS → 应用**。必须由用户本人选择出生年/月/日并显式确认；不得预填、不得默认；拒绝/取消 → 安全只读或退出（不得静默跳过）。
- 年龄核验为**自报出生日期**，**不是**官方身份证/实名核验；不承诺绝对阻止；不采集身份证/照片/住址；数据仅存本机并可删除。
- 运营者“尽最大努力防止违法/不当情感陪伴”的既有表述保留，但不承诺零违法/零伤害。

## 1. 已实现

### 1.1 数据模型与校验（`src/pet/consent/age.ts`）

- 记录：`{format, schema, birthYear, birthMonth, birthDay, verifiedAt}`，仅存本机 localStorage key
  `desktop-games/consent/age-verification-v1`；无网络、无日志、无 ID/照片/住址字段。
- 校验：公历闰年（2000-02-29 合法、1900-02-29 拒绝）、月份天数、未来日期、年份 1900..今年、
  年龄上限 120 周岁；年龄按“生日是否已过”计算；缺失年/月/日一律无效（无默认值）。
- 持久化解析 fail-closed：JSON/格式损坏 → `corrupt`，日期失效 → `invalid`，均视为**未核验**并重新核验。
- 只读展示：`ageBandView()` 返回年龄段/是否 18+/核验时间，**从不显示完整生日**。

### 1.2 Gate 状态机（`src/pet/consent/gate.ts`）

- `bootstrap()` 顺序固定：**年龄核验 → TOS**；年龄未完成 → `readonly` + `AGE_REQUIRED_BLOCKED_VIEW`
  （重试会重新走年龄 → TOS；无静默跳过路径）。
- 无 `showAge` UI 端口 → fail closed（不进入正常交互）。
- 年龄弹窗返回值由 gate 再次校验（注入 UI 不能写入未来/非法日期）；成功记录 `age.verify` 审计，
  审计只含动作/时间/`self-reported` 标记，**不写出生日期**。
- `requestRoleplay()`：在展示任何 TOS/声明/设定表单之前检查
  `ageVerified && age>=18`；未核验返回 `age-required`、未成年返回 `minor`，**不创建 roleplay 状态**、
  **不展示 roleplay 表单**；一般功能不受影响。
- `reverifyAge()`（更正）：重新校验并保存、结束当前 roleplay 会话、记录 `age.correct` 审计；
  TOS 文本/版本/哈希未变，故无需重新同意 TOS（roleplay 本身每次开始都要求完整 TOS+声明）。
- 删除全部数据：`wipeLocalConsentState()` 清除年龄记录（`ageCleared`）并进入安全只读。
- 撤回 TOS 同意**不删除**年龄记录（独立核验；如要删除用“删除全部本地数据”）。

### 1.3 UI（`modal.ts` / `runtime.ts` / `pet.html` / `setup.html` / CSS）

- `showAgeDialog()`：accessible 年/月/日 `<select>`（中文、占位“请选择”、**无预填/无默认**），
  动态按年月重建合法日列表；显式自报确认 checkbox（默认不勾选）；
  错误提示 `role="status" aria-live="polite"`；确认按钮在合法日期+勾选前 disabled；
  Escape/拒绝 = `{verified:false}`（安全只读）；无动画/transition（reduced-motion 信息一致）。
- About：`about-age-meta` 只显示年龄段/是否 18+/存储位置/“非官方身份证核验”说明；
  `about-age-correct` 更正年龄；roleplay meta 显示“仅限 18+，当前满足/未满足”；
  `about-roleplay` 入口 `aria-describedby` 指向年龄状态。
- 首启安全只读视图（`age-required`）说明未完成年龄核验、可重新核验或退出。
- setup.html 只读显示年龄核验状态（年龄段），不写任何记录。
- 数据控制：`data-controls.ts` 新增 `age-verification` 删除项/标签/确认文案；纯前缀清理 + 已知键 +
  删除后核验三重覆盖。

### 1.4 文案/法务（`terms.ts` + docs）

- TOS `2026-11-17.5`：新增 `age-verification` 节（自报、非官方 ID、未成年人 roleplay 禁止、
  一般功能全年龄、错误自担、数据本机/删除/更正、运营者尽最大努力但不绝对阻止）；
  修正 §scope/§AI 披露/§health/§minors/§audit/§ack 旧“全年龄、不设年龄门”口径；
  §六之二保留“运营者已尽最大努力防止违法使用与不当情感陪伴”并更新为已实现的年龄自报核验。
- `ROLEPLAY_VERSION = 2026-11-17.4`：声明加 18+ 门槛节（未满 18 不展示表单）、独立于 TOS/TTS/ASR；
- `TTS_VERSION = 2026-11-17.4`、`ASR_VERSION = 2026-11-17.3`：仅修正旧“roleplay 全年龄/无年龄门”表述。
- 同步：`docs/legal/TOS.md`（版本+hash+逐节镜像）、`APP-DISCLOSURE-TEXTS.md`（§2D age keys）、
  `LEGAL-BASELINE.md`、`CONSUMER-MINORS-HEALTH.md`、`TTS-TERMS.md`、`PRIVACY.md`、
  `AI-CONTENT-POLICY.md`、`README.md`、`DECLARATIONS.md`、`src/pet/safety/disclosure.ts`；
  仍保留 DRAFT/非律师/不承诺绝对阻止。
- 版本/hash：TOS `b5a47fdd80f6019276271bb093a2085f74f1d71a0d27fbfbfdf10ee4a81a030c`；
  ROLEPLAY `0e0731eceb0a4a006fffb3e87483d07466ad5e64d1f4c8ead3b9fd66eafb1023`；
  TTS `ffe8b441a33a75d2d17d4163bfdedeb5538cd98add605778383e57a7eb6c6551`；
  ASR `035a4f4cff4b2fe0376f62dd1135c328f26d55cb9276314bf8fd4baab63b11ad`。

## 2. 测试

- `tests/age-verification.test.ts`：合法/闰年（2000-02-29 合法、1900-02-29 拒绝）/未来/1900/120 岁/无默认；
  存储损坏 fail-closed；年龄→TOS 顺序；拒绝→安全只读；<18 一般可用但 roleplay 拒绝（`minor`）、
  roleplay 表单/TOS action 不出现；>=18 走完整 TOS+声明；更正年龄清除 roleplay 状态；
  删除数据含 age key；审计不含出生日期；TOS/ROLEPLAY/TTS/ASR 版本+hash 与 docs 镜像。
- `tests/age-ui.test.ts`：静态检查 age 弹窗无预填/显式确认/Escape=拒绝/aria-live/无动画、
  About 只显示年龄段、首启顺序、roleplay 18+ 文案、setup 页只读。
- 更新 `tests/consent*.test.ts` 以适配首启年龄弹窗；同步更新因 18+ 口径/版本变更而受影响的
  `tests/roleplay-allages.test.ts`、`tests/legal-user-agency.test.ts`、`tests/dlc-consent.test.ts`、
  `tests/data-controls.test.ts`（lead 已授权最小同步）。
- `npm run typecheck` / `npm test` / `npm run build` 全绿（最终执行结果见交付报告）。

## 3. 限制 / 未实现（如实披露）

- **只是自报，不是实名/官方身份证核验**：无法证明真实年龄；虚假填写、冒用身份、修改本机数据或
  修改版客户端可绕过，不承诺绝对阻止；这是合理努力门槛。
- 无监护人验证、无未成年人模式、无远程删除；监护人删除需在设备上操作（可邮件要求协助）。
- 未做独立身份服务、人脸/证件 OCR、政府数据库核验；不采集证件/照片/住址。
- 年龄更正不需要重新同意 TOS（TOS 文本/版本/哈希未变），但 roleplay 仍每次重新完整确认。

## 4. 复现

```bash
npm run typecheck
node --import tsx --test tests/age-*.test.ts tests/consent*.test.ts
npm test
npm run build
```
