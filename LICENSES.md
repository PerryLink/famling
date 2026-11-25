# LICENSES

This file maps the licenses that apply to this public pet-only export. It is a
summary for readers and release reviewers, not a license grant and not legal
advice. In case of conflict, the referenced license texts govern.

This project is **source-available, not OSI open source**. It is not MIT
licensed and is not affiliated with or endorsed by DeepSeek (unofficial project).

| Component | License | Where / notes |
| --- | --- | --- |
| Code (this repository) | **PolyForm Noncommercial 1.0.0** | `LICENSE`; commercial use requires a separate written commercial license, see `LICENSE-COMMERCIAL.md` |
| Pet/character art (human/cat/dog, 2026-11-22 final pixel art) | **CC BY-NC-SA 4.0** | `LICENSE-ART`; attribution TASL; AI-assisted, model license see below |
| UI art (97-asset / 103-file set: menu/props/badges/icons/backgrounds/fx/roleplay) | **CC BY-NC-SA 4.0** | `LICENSE-ART`; 2026-11-22 final art + 2026-11-25 approval HUD badges; deterministic local Python/PIL, no AI model |
| Character/pack metadata | Same as the content it describes | e.g. `public/characters/*/character.json`, `public/content/library.json` |
| Docs and legal drafts | Same as code (PolyForm NC) unless stated otherwise | Legal texts are DRAFT, see "Legal status" below |
| Third-party software dependencies | Their own licenses | `package.json` / `package-lock.json`, `THIRD-PARTY.md`, `NOTICE` |
| Names, logos, trademarks, product identity | **Not licensed** | `LICENSE-ART` excludes role/product names, logo, trademarks, domains; do not imply DeepSeek endorsement |
| Real-person voice/likeness, TTS audio | Not licensed here | See `docs/legal/TTS-TERMS.md` and "Audio" below |

## AI model license: UNVERIFIED

The 2026-11-22 final pet art is AI-assisted: local ComfyUI with
**MiniMax-H3-Image** (int8 DiT + qwen3vl_32b text encoder + VAE) generated the
master candidates, then local Pillow/rig scripts performed deterministic
refinement, palette locking and per-frame validation. Style/proportion
reference: pixiv artwork 152150491 (PerryLink, CC0 1.0), used as reference, not
traced.

**The AI model license has not been verified (UNVERIFIED).** This repository
does not grant and cannot grant rights that depend on the model provider's
terms. Treat the AI-assisted art as **research/internal only** and complete a
written license review before any commercial use or release approval. Do not
describe the model license as cleared, open, or approved. Full provenance:
`AI-PROVENANCE.md` and [docs/ART-REBUILD-2026-11-22.md](docs/ART-REBUILD-2026-11-22.md).

## Fonts

No font binaries are bundled or redistributed. The app uses local system font
stacks only (e.g. system-ui, Segoe UI, Noto Sans SC, Georgia, Noto Serif SC,
Consolas, monospace). Fonts installed on the user's OS remain under their own
vendor/OS licenses; no network or Google Fonts requests are made.

## Audio

This public export tracks **no pre-generated TTS audio** (the historical 42-WAV
pack was removed from public history on 2026-11-18). Runtime speech is opt-in
TTS for humanoid/origami only (cat/dog never speak), subject to
`docs/legal/TTS-TERMS.md`, the provider's (DeepSeek TTS) terms, and explicit
user consent. Audio redistribution rights remain **TBD**; do not add audio
assets to releases without clearing them. No voice cloning is provided.

## Use restrictions

All content is for technical research and prototype validation only. Prohibited
uses include emotional companionship, virtual partners, professional advice,
minor intimacy, impersonation of real people/officials, and illegal use. Full
text: `docs/legal/USE-RESTRICTIONS-2026-11-19.md`. Content packs must carry the
canonical research-only declaration and the six prohibited-use tokens.

## Legal status

All legal texts in this repository are **DRAFT**; they have not been reviewed by
counsel and do not constitute a compliance or licensing conclusion. AI model
terms, audio redistribution, store/platform AI labeling and trademark clearance
remain open until owner/legal review. Release candidates are unsigned research
prototypes (no Authenticode signing, no auto-updater, no store listing).
