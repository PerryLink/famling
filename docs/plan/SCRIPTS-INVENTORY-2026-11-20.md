# SCRIPTS-INVENTORY-2026-11-20 — 脚本/生成器收敛清单（E10 · MB-108）

> 性质：**唯一脚本清单 + 机器校验**。本表由 `scripts/scripts-check.mjs` 校验（`node scripts/scripts-check.mjs`；测试 `tests/scripts-convergence.test.ts`），
> 并随 `npm test` 进入 canonical gate。**新增/删除/改名 `scripts/` 下任何文件必须同步本表**，否则校验红。
>
> 列含义：
> - `path`：相对仓根路径（`scripts/lib/*` 也必须列）。
> - `category`：`gate`（发布/真值门，必须接进 package.json 或 ci.mjs）、`generator`（生成物写入仓库，必须声明漂移检查模式）、
>   `probe`（人工/真机探针，不阻断门）、`release`（发布打包/签名/证据辅助）、`art`（美术管线辅助）、`tool`（运维/工具 CLI）、`baseline`（基线 JSON）。
> - `check`：生成器的漂移检查模式；`n/a` = 非生成器；`none: <理由>` = 明确不做可复现检查的原因（校验要求写理由）。
> - `notes`：用途/边界一句话。
>
> 已退役（MB-106 删除 Electron 宿主后不再存在；校验器断言它们**保持缺失**且不被任何脚本/package.json/ci.mjs 引用）：
> - `scripts/electron-demo-probe.ps1` — 驱动已删除的 `app/electron` + `.electron-win` 二进制。
> - `scripts/probe-electron.ps1` — 同上（Electron 内存探针）。

<!-- scripts-inventory:start -->
| path | category | check | notes |
| --- | --- | --- | --- |
| `scripts/a11y-cdp-check.mjs` | probe | n/a | real-Chrome accessibility gate (MB-116) |
| `scripts/a11y-contrast-baseline.json` | baseline | n/a | contrast baseline consumed by a11y-cdp-check |
| `scripts/anim-timing-check.ts` | gate | n/a | four-way animation timing drift gate; wired by tests/anim-timing-single-source.test.ts |
| `scripts/anim_timing.py` | art | none: shared timing helper imported by the three pet-animation generators (not a standalone generator) | undefined |
| `scripts/asr-pilot.mjs` | probe | n/a | ASR pilot (npm run voice:asr) |
| `scripts/authenticode-report.ps1` | release | n/a | Authenticode status report (C1 unsigned evidence) |
| `scripts/backup.mjs` | tool | none: operational backup CLI (npm run backup), not a reproducibility gate | undefined |
| `scripts/bake-voice.mjs` | tool | none: one-shot voice bake helper for the voice pilot; output is not part of the tree gate | undefined |
| `scripts/build-tauri-win.bat` | release | n/a | Windows Tauri release build wrapper |
| `scripts/bundle-tauri-nsis-win.bat` | release | n/a | NSIS bundling wrapper |
| `scripts/bundle-tauri-win.bat` | release | n/a | portable bundling wrapper |
| `scripts/cat_selkirk.py` | art | none: pixel-art renderer module used by the animation generators (not a standalone CLI) | undefined |
| `scripts/cdp-aquarium-play.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-aquarium-save.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-aquarium.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-fps.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-launch.ps1` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-mic-probe.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-browser-crypto.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-dpapi.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-layout.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-live-voice.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-portable.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet-voice.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-pet.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-probe.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-save-test.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-stall-demo.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-stall-layout.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-stall-milestones.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-stall.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-town.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/cdp-voice-rust.mjs` | probe | n/a | manual CDP probe (real Chrome; not part of the gate) |
| `scripts/check-tauri-win.bat` | release | n/a | Windows Tauri toolchain probe |
| `scripts/check-version.mjs` | gate | n/a | version mirrors (package/tauri/Cargo) |
| `scripts/check_specs.py` | gate | n/a | art spec contract (ci step art:check-specs) |
| `scripts/chrome-fps.ps1` | probe | n/a | browser FPS probe |
| `scripts/ci-clean-checkout.mjs` | gate | n/a | clean export + npm ci + npm run ci (MB-003) |
| `scripts/ci.mjs` | gate | n/a | single source of the canonical gate steps; ci.yml only calls it |
| `scripts/clean-build.bat` | release | n/a | clean build wrapper |
| `scripts/clean-tail-fringe.py` | art | n/a | art pipeline helper |
| `scripts/contact_sheet.py` | art | n/a | art pipeline helper |
| `scripts/coverage-baseline.json` | baseline | n/a | coverage ratchet baseline (coverage.ts) |
| `scripts/coverage-key-modules.json` | baseline | n/a | coverage key-module list (coverage.ts) |
| `scripts/coverage.ts` | gate | n/a | coverage record + thresholds (ci step coverage:check) |
| `scripts/docs-check.mjs` | gate | n/a | docs truth gate (STATUS/README/HANDOFF/claims) |
| `scripts/dog_golden5.py` | art | none: pixel-art renderer module used by the animation generators (not a standalone CLI) | undefined |
| `scripts/e2e-tauri.ps1` | probe | n/a | Tauri E2E driver (npm run e2e:tauri); needs Windows/Tauri host |
| `scripts/embed-ai-labels.mjs` | generator | --check | embeds AI label strings into legal mirrors; --check freezes output |
| `scripts/ensure-eye-highlights.py` | art | n/a | art pipeline helper |
| `scripts/export-public-pet.mjs` | tool | none: stages a public export from private assets; run manually during release prep | undefined |
| `scripts/fci-validate.mjs` | gate | n/a | FCI character pack strict validation (ci step) |
| `scripts/focus-test.ps1` | probe | n/a | focus behavior probe |
| `scripts/gen-app-icons.mjs` | generator | --check | icon source -> Tauri icon set; --check freezes output |
| `scripts/gen-cat-anim.py` | generator | --check | Selkirk Rex cat animation frames; --check freezes output |
| `scripts/gen-character-interactions.mjs` | generator | --check | MB-104 behavior/regions 单源生成；--check 是漂移门（tests/character-interactions-single-source.test.ts 接线）；类型声明在 scripts/gen-character-interactions.d.mts |
| `scripts/gen-character-interactions.d.mts` | tool | n/a | 上面生成器的 TypeScript 声明（非可执行；由 tests 单源测试导入校验） |
| `scripts/gen-human-anim.py` | generator | --check | Tinglan animation frames; --check freezes output |
| `scripts/gen-key.ts` | tool | none: DLC key generation CLI; private keys never enter the repo | undefined |
| `scripts/gen-pet-anim-frames.py` | generator | --check | dog pet-animation frames; --check freezes output (cat/human delegated) |
| `scripts/gen-pet-placeholder.py` | generator | --check | placeholder pet art; --check freezes output |
| `scripts/gen-status.mjs` | gate | --check | generates docs/STATUS.md; --check is the drift gate |
| `scripts/gen_ui91.py` | art | none: one-off UI illustration generator kept for provenance; no generated output is tracked | undefined |
| `scripts/gui-cdp-smoke.mjs` | probe | n/a | real-Chrome GUI smoke (MB-114/MB-116) |
| `scripts/human_tinglan.py` | art | none: pixel-art renderer module used by the animation generators (not a standalone CLI) | undefined |
| `scripts/i18n-check.mjs` | tool | n/a | support script |
| `scripts/import-character.mjs` | tool | none: packs an external character folder (npm run import:character); output is user data | undefined |
| `scripts/legal-check.mjs` | gate | n/a | legal package/link gate (ci step legal:check) |
| `scripts/lib/a11y-contrast.mjs` | tool | n/a | shared helper module (imported by scripts/tests) |
| `scripts/lib/a11y-scan.mjs` | tool | n/a | shared helper module (imported by scripts/tests) |
| `scripts/lib/cdp-endpoint.mjs` | tool | n/a | shared helper module (imported by scripts/tests) |
| `scripts/lib/release-signing.mjs` | tool | n/a | shared helper module (imported by scripts/tests) |
| `scripts/lib/soak-short-metrics.ts` | tool | n/a | shared helper module (imported by scripts/tests) |
| `scripts/look-test-shots.mjs` | probe | n/a | look-test contact sheets (npm run look:test:shots) |
| `scripts/make-pack.ts` | generator | none: legacy DLC signature sidecar writer; sample packs are checked in, not regenerated by the gate | undefined |
| `scripts/package-portable.ps1` | release | n/a | portable zip packaging (manual release step) |
| `scripts/pixelize.py` | art | n/a | art pipeline helper |
| `scripts/placehold.py` | art | n/a | art pipeline helper |
| `scripts/playtest-kit.mjs` | tool | none: builds a playtest kit (npm run playtest:kit); no tracked output | undefined |
| `scripts/preflight.mjs` | gate | n/a | pre-commit preflight (npm run preflight) |
| `scripts/probe-tauri.ps1` | probe | n/a | Tauri runtime probe |
| `scripts/release-evidence.mjs` | gate | --self-test | release evidence bundle + --self-test anti-tamper (ci step) |
| `scripts/release-sign.mjs` | gate | --plan | signing policy smoke, plan only (ci step release-sign:plan) |
| `scripts/release-win.mjs` | release | --verify | Windows release build + artifact verify (npm run release:win) |
| `scripts/repro-check.mjs` | gate | --check-inputs | reproducible-build input gate (ci step repro-check:inputs) |
| `scripts/reproducible-zip.ps1` | release | n/a | deterministic zip packing helper |
| `scripts/run-soak-24h.cmd` | probe | n/a | 24h soak wrapper (manual, Windows host) |
| `scripts/scale-dpi-verify.mjs` | probe | n/a | CDP DPR matrix verification (MB-054) |
| `scripts/scripts-check.mjs` | tool | n/a | support script |
| `scripts/shot.mjs` | probe | n/a | screenshot capture CLI (npm run shot) |
| `scripts/smoke.ts` | probe | n/a | module smoke (npm run smoke) |
| `scripts/soak-analyze.mjs` | probe | n/a | soak result analyzer (npm run soak:analyze) |
| `scripts/soak-short.ts` | tool | n/a | support script |
| `scripts/soak-simple.ps1` | probe | n/a | PowerShell soak wrapper |
| `scripts/soak-tauri.ps1` | probe | n/a | Tauri soak driver |
| `scripts/soak.ts` | probe | n/a | long soak harness (npm run soak) |
| `scripts/test-dlc-rust.sh` | gate | n/a | Rust DLC verifier tests (npm run verify:dlc:rust) |
| `scripts/tts-stream-pilot.mjs` | probe | n/a | streaming TTS pilot (npm run voice:stream) |
| `scripts/validate-character.mjs` | tool | none: manual character bundle validator; tests call it through fixtures | undefined |
| `scripts/validate-content.mjs` | gate | n/a | content schema validation (ci step validate:content) |
| `scripts/validate_art.py` | art | n/a | art pipeline helper |
| `scripts/verify-dlc-trust.mjs` | tool | none: manual DLC trust-root inspection helper | undefined |
| `scripts/verify-pack.ts` | gate | n/a | signed content-pack verification (ci step verify:pack) |
| `scripts/voice-pilot.mjs` | probe | n/a | TTS voice pilot (npm run voice:pilot) |
<!-- scripts-inventory:end -->

## 维护规则

1. 新增脚本：先定 category；`gate` 必须同时接进 `package.json` 或 `scripts/ci.mjs`；`generator` 必须实现并声明 `--check`/`--self-test` 等冻结模式（或在 check 列写 `none: 理由`）。
2. 删除脚本：从本表移除并在“已退役”段落登记理由；校验器会同时检查 `package.json`/`ci.mjs` 不再引用。
3. 人工探针（`probe`）不得成为发布门的隐式依赖：门只认 `package.json`/`ci.mjs` 的显式步骤。
4. 历史文档（docs/plan 快照）可以提到已删脚本，但**活脚本**不得再指向 `app/electron` 等已删除路径（校验器检查）。
