# Commercial licensing

> **2026-11-18 公开导出边界（本仓当前状态）**：本公开导出已按清理方案 A 移除全部预生成 TTS 音频（42 WAV + manifest）、游戏内容包（`packs/`）、DLC 校验链（`native/dlc-verify`）与未使用 kernel 模块；本导出**不随包分发任何音频 / DLC / 游戏基座**。下文历史统计（18/42 WAV、baked pack、随包授权等）保留作私有 mono-repo 的历史记录，**不代表本公开导出当前内容**；音频再分发条款仍为 TBD。

The source in this repository is released under the **PolyForm Noncommercial
License 1.0.0** (see `LICENSE`). That license allows noncommercial use,
modification and redistribution, and **does not allow commercial use**.

Commercial use — including shipping a paid or free-to-play Steam game, selling
DLC, or operating a commercial service — requires a separate written commercial
license from the copyright holder.

## Why this split

- The kernel, the desktop companion and the developer tooling are meant to be
  readable, forkable and useful to other people building noncommercial things.
- The Steam games, art, content packs and DLC are the commercial product and
  stay proprietary.
- This is **source-available**, not OSI open source. Please use the accurate
  term in the README and store page.

## Contributions

Because the same code may be relicensed commercially, contributions need a
contributor license agreement (CLA) or an equivalent written grant that lets
the copyright holder include the contribution in commercial builds.

If you do not want to sign a CLA, open an issue with the idea instead of a pull
request; the maintainer can implement it independently.

## Assets

Art, audio, fonts, pets, sprites and DLC content are **not** covered by the code
license unless a file says otherwise.

- Orca/Tinglan art, setting sheets and generated/pixelized outputs are governed
  by `LICENSE-ART` (CC BY-NC-SA 4.0, per the owner's 2026-11-16 decision).
  Noncommercial sharing/adaptation is allowed under that licence; **commercial
  use requires a separate written licence**. Legal review is deferred.
- This public export tracks **no TTS audio**: the pre-generated WAV pack was
  removed on 2026-11-18, so no audio is built into `dist/` or bundled. Runtime
  cloud/system TTS output is not redistributed by this repository; DeepSeek TTS
  output terms remain unconfirmed.
- Third-party assets remain under their own licences (see `THIRD-PARTY.md`).
