# 法务 review 后续状态更新（2026-11-17，engineering draft）

> 本文件不修改 01–06 与 00 的历史审查结论；只记录**这些报告之后已经落地的工程变更**，避免文档继续写“未实现”。仍非法律意见。

> **2026-11-17 全年龄拍板（状态注记）**：用户已拍板年龄口径为**全年龄、不设年龄门**；本目录 01–06 报告中“roleplay 仅 18+/需年龄门”的 P0-1/P0-2 建议与结论已被该拍板取代；01–06 正文保持历史记录、不回改。

## 已关闭/部分关闭的 P0/P1

| 原项 | 状态 | 证据 |
|---|---|---|
| TOS/TTS/ASR live 文本未同步 | **已同步** 2026-11-17.2；三声明独立 | `src/pet/consent/terms.ts`、`docs/legal/TOS.md`/`TTS-TERMS.md` |
| ASR 无单独同意/开关 | **已实现** ASR 独立声明；`getUserMedia` 前强制确认；拒绝不上传 | `src/pet/consent/asr.ts`、`main.ts`、`tests/consent-asr.test.ts` |
| 撤回同意/删除全部数据 | **已实现入口 + 二次确认 + 删除核验 + 残留报告**；Tauri `voice/quota.json`/缓存清除仍为残留/未核验 | `src/pet/consent/data-controls.ts`、`tests/data-controls.test.ts`、`docs/audit/DATA-CONTROLS-2026-11-17.md` |
| 审核不留痕 | **已实现本地 append-only 审核摘要**（不含原文/加盐 textHash/滚动上限）；非证据级 | `src/pet/consent/safety-audit.ts` |
| DLC `packLoad` 零调用 | **已接入** 每次完整 TOS；内置 humanoid/cat/dog 豁免；CLI 每次 `--accept-tos` | `src/pet/consent/content.ts`、`src/pet/character/builtin.ts`、tests |
| AI 图片无隐式标识 | **49/49 PNG 已嵌 tEXt**（AI-Generated/Status/Model/Date/Content-ID/Final/Official/Disclosure）；像素未变 | `scripts/embed-ai-labels.mjs`、manifest `aiLabel`、`tests/ai-label.test.ts` |
| `/docs/legal/*` 打包 404 | **已改为 `/legal/*`**；34 文件进 dist/Tauri resources/portable 清单；构建守卫 | `public/legal/**`、`scripts/legal-check.mjs`、`tests/legal-package-*` |
| roleplay 不实入口 | **已禁用文案**“当前版本未开放角色扮演” | `pet.html`、TOS scope |

## 仍开放（不是文档能关闭）

1. **年龄门/18+ 核验**：TOS 已写 18+ roleplay 边界但未实现年龄门；需用户拍板成人向 v1。
2. **C2PA/Content Credentials、音频 AI 首播提示、导出元数据**：仅 PNG tEXt，音频/导出仍 TBD。
3. **Rust 数据删除**：`voice/quota.json`、TTS 缓存、卸载清理需 Rust owner；当前删除会列残留/未核验。
4. **chat-import 独立窗口 / tinglan-preview 审核留痕**：主窗口已接，独立窗口未接。
5. **真实 Windows Tauri/WebView2/NSIS**：未构建/未实机；portable zip 仍是旧包；`licensePage` 未渲染验证。
6. **TTS 18 WAV 再分发、Pixiv CC0、Pearl 上游、AI 供应商条款、商标/相似性、律师意见、备案/评估**：外部/权利人。
7. **年龄/roleplay/收费/公开仓/名称**：产品拍板。
8. **旧 artifacts/安装包**：需清理/HEAD 重构建。

## 当前门禁

- `npm test`：**723/723 pass**；`typecheck`/`build` PASS；`legal-check` 默认 WARN-ONLY（DRAFT/旧 staging），`--strict` 仍 BLOCKED。
- `public/legal` 为 canonical docs 的渲染副本；改 docs 后须 `legal-check --sync` + build。
