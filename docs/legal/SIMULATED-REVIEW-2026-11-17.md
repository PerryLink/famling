# 模拟律师 / 权利人 / 发布审查（SIMULATED）— 2026-11-17

> **这不是法律意见、不是真实律师意见、不是真实权利人授权。** 用户明确要求“律师/权利人你来模拟”，本文件仅作为**工程演练/批准矩阵的压力测试**，不得用于对外声称“已审核/已合规/已获授权”。真实发布仍以 [APPROVALS](./APPROVALS.md) 签字/书面文件为准；`legal-check --strict` 仍 BLOCKED。

## 模拟角色与结论

| 模拟角色 | 审查范围 | 模拟结论 | 必须保留的真实条件 |
|---|---|---|---|
| 中国 AI 合规（模拟） | 全年龄、roleplay 声明、AI 标识、深度合成 | 文本层可进入 DRAFT 评审；全年龄不设年龄门，roleplay 仅本地模板须如实标注 | 律师对拟人化/备案/安全评估作真实判断；商店分级 |
| 隐私/数据（模拟） | ASR/TTS/记忆/删除/撤回/第三方 | ASR 独立同意、数据控制入口、审核留痕可接受工程实现 | DeepSeek 留存/跨境/训练条款需供应商书面确认；Rust 残留需清 |
| IP/权利人（模拟） | 18 WAV、Pixiv CC0、Pearl、AI 图像 | 用户授权 DeepSeek stella 音频缓存；UI 本地绘制；256 标 concept | 真实权利人/服务商授权；Pixiv 逐文件；Pearl 上游；商标/相似性 |
| 消费者/未成年人（模拟） | 全年龄、免费、投诉、健康 | 全年龄口径文本一致；免费/退款/举报通道已披露 | 真实年龄识别/未保模式不提供；商店规则；律师 |
| 内容信任（模拟） | 审核、拒答、举报、DLC | 本地规则+审核留痕+Fix 6 类红线的工程面可接受 | 分类器/红队/人工复核；真实执法流程 |
| 发布运营（模拟） | 法务包、licensePage、portable | `public/legal` 34 文件、构建无死链、旧 portable 已隔离 | Windows HEAD NSIS 重构建/安装实测/签名；真实 release gate |

## 模拟批准项（不改变 actual APPROVALS）

- `A-04` TTS 18 stella：**SIMULATED-CLEARED under user authorization**；真实 `APPROVALS` 仍 BLANK（DeepSeek 输出再分发/商用条款未书面确认）。
- `A-06` 供应商条款：**SIMULATED-REVIEWED**；仍 TBD。
- `A-10` Pixiv CC0：**SIMULATED-NO-OBJECTION**；逐文件清单仍不可核。
- `A-11` 许可文本：**SIMULATED-DRAFT-ACCEPTABLE**；不是生效许可。
- `A-16` AI 标识：PNG tEXt 已实现；C2PA/音频/导出仍 TBD。
- `A-18` 发布总签：**SIMULATED-DO-NOT-RELEASE**；只能私域 beta，不得公开/收费/商店。

## 模拟结论

可以继续工程/私域 beta；**不能把模拟审查当作发布许可**。真实发布需：
1. 律师对 TOS/roleplay/拟人化/标识作书面意见；
2. 权利人/服务商对 TTS/Pixiv/Pearl/AI 供应商/商标作真实确认；
3. Windows HEAD 构建 + NSIS licensePage + 安装实测；
4. `legal-check --strict` 0 + APPROVALS 真实签字；
5. 真实用户数据/年龄/未成年人保护运行测试。
