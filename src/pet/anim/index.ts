/**
 * Pet animation subsystem — public entry point (single-source era, E10 2026-11-20).
 *
 * Headless, dependency-free TypeScript: types + the `timing.json`-backed clip
 * table/timeline math + pack manifest validation for
 * `public/assets/pet/anim/<character>/`.
 *
 * Single sources of truth:
 * - clip timing/layer/category/priority/FPS bands/tracks: `timing.json`
 *   (shared with the Python pack generators);
 * - ambient/random micro-actions, state priorities, cooldowns and the
 *   event -> state mapping: the character `behavior.json` profile, executed by
 *   `src/pet/scene/runtime.ts` (SceneRuntime) + `BehaviorRuntime`; its authoring
 *   source is `interactions/<character>.json` (MB-104), rendered by
 *   `scripts/gen-character-interactions.mjs` into behavior.json + regions.json;
 * - speech vs. thought / TTS capability: `VOICE_CAPABILITIES`;
 * - clip reachability: `timing.json.specOnly` freezes `walk`/`attack` as
 *   spec-only (MB-047/E5-T7); manifests mirror it in `anim.specOnly`.
 *
 * Removed in E10 (were never imported by production code): the parallel
 * `IdleAnimationScheduler` (behavior ambient already drives scheduling), its
 * PRNG helpers, the interaction-plan table (behavior slots/rules own the
 * mapping) and the standalone bubble-policy helpers (VOICE_CAPABILITIES owns
 * speech/thought + TTS).
 *
 * Integration points: `validateAnimManifest()` when loading a pack, and
 * `frameIndexFor()` in `hero.ts` for frame math driven by the pack manifest.
 * Nothing in this module imports DOM, hero.ts, main.ts or pet.css.
 */
export const ANIMATION_MODULE_VERSION = '0.3.0' as const

export * from './types.ts'
export * from './timeline.ts'
export * from './timing.ts'
export * from './clips.ts'
export * from './manifest.ts'
