# Changelog

All notable changes to this repository are documented here. This public export is
the pet-only Famling desktop app (`famling-pet`); the DSH plugin
(`dsh-famling`) is versioned and released separately.

This project is **source-available, not OSI open source**. Code is under
PolyForm Noncommercial 1.0.0; pet/UI art is under CC BY-NC-SA 4.0. Keep both
license fields unchanged when preparing releases. Legal texts remain **DRAFT**;
"approval-ready" means ready for owner/legal approval, not approved or released.

## [0.2.0] — 2026-11-25 (release candidate, unsigned, approval-ready)

### Changed

- **Final art/UI metadata truth.** Built-in human/cat/dog role presets in
  `public/content/library.json` now describe the 2026-11-22 final pixel art
  (29 tags / 141 frames human, 29 tags / 143 frames cat, 28 tags / 136 frames
  dog = 420 frames incl. 12-tag compatibility aliases) instead of placeholder
  art and 68/72-frame claims. AI provenance is now `generated: true` with
  honest disclosure and tool ids; the AI model license is marked **UNVERIFIED**.
  Provenance and verification: [docs/ART-REBUILD-2026-11-22.md](docs/ART-REBUILD-2026-11-22.md).
- Final UI truth is the 97-asset / 103-file manifest
  (`public/assets/ui/manifest.json`): 2026-11-22 final art plus 2026-11-25
  approval HUD badges, deterministic local Python/PIL, no AI model.
- Version bumped to **0.2.0** in `package.json`, `package-lock.json`,
  `app/tauri/src-tauri/tauri.conf.json` and `app/tauri/src-tauri/Cargo.toml`.
  License fields are unchanged.

### Added

- `LICENSES.md`: component-by-component licensing map (code PolyForm NC; art
  CC BY-NC-SA 4.0; AI model license **UNVERIFIED**; fonts/audio notes).
- Public CI release gates in `.github/workflows/build-windows.yml`:
  `npm ci`, `npm run typecheck`, `npm run build`, and
  `validate:character --strict` for all three built-in characters. Tag builds
  now generate `SHA256SUMS.txt` and `BUILD-INFO.txt` next to the unsigned
  Windows installer/portable zip and keep the existing unsigned build artifact.
- Dev dependencies `tsx` (TypeScript loader used by the character validator)
  and `ajv` (JSON Schema validation) are now declared, so a clean `npm ci` can
  run the validator in CI.
- **Approval-ready readiness**: version metadata, role-preset provenance,
  `LICENSES.md` and the CI checksum/BUILD-INFO gates are in place for release
  approval. Approval, Authenticode signing, store listing and AI-model-license
  clearance are still open and are not claimed.

### Release notes

- Builds are **unsigned**: no Authenticode certificate, no signing step, no
  signing secrets, no auto-updater, no store listing.
- The AI model license (local ComfyUI MiniMax-H3-Image) remains **UNVERIFIED**;
  commercial use requires owner/legal review before release approval.
- Legal texts remain DRAFT and do not constitute a compliance conclusion.
