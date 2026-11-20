# Character interaction sources (MB-104 single source)

`dog.json` / `cat.json` / `human.json` are the **authoring source** for the
shipped character behaviour + tap-region data. Do not edit the generated files
by hand:

| Source | Generated (committed, runtime data) |
|---|---|
| `src/pet/anim/interactions/dog.json` | `public/characters/pet-dog/{behavior,regions}.json` |
| `src/pet/anim/interactions/cat.json` | `public/characters/pet-cat/{behavior,regions}.json` |
| `src/pet/anim/interactions/human.json` | `public/characters/pet-tinglan-anim/{behavior,regions}.json` |

```bash
# regenerate the six committed files
node scripts/gen-character-interactions.mjs
# drift gate (exit 1 when a source is invalid or an output is stale)
node scripts/gen-character-interactions.mjs --check
# one character / machine-readable
node scripts/gen-character-interactions.mjs --only dog --json
```

`npm test` runs `tests/character-interactions-single-source.test.ts`, which
executes the same drift gate, so a hand edit to a generated file (or a source
edit without regeneration) turns CI red. The generator stays plain-JS ESM (so
`node` can run it without a loader); `scripts/gen-character-interactions.d.mts`
holds the type declarations the test is checked against.

## What is derived

Each state entry is one row and owns its trigger table (`rules`). From it the
generator derives:

- `behavior.slots` (host event -> state): by default `slots[rule.on] = state`,
  overridable with `rule.slot` (`"drag"` renames `drag.start`; `false` means
  "rule only, no slot", used for `wake`). `idle` has no rule and declares
  `slots: ["idle"]` explicitly;
- `behavior.rules` (`on` -> owning state, priority defaults to the state
  priority, optional `cooldownMs` / `probability` / `requiresBrief`);
- `regions.gestures` (a state with `gesture` must expose exactly one slot event,
  which becomes the gesture event);
- `regions.actions` (menu actions; `says` may be inherited from the state that
  owns the action event);
- `regions.boxes` and `behavior.speech`/`needs`/`abilities` pass through.

`says` lives on the state entry when a gesture and its menu action share the
same lines (pat, tail, ...); a side that needs different lines overrides with
`gesture.says` or `action.says` (e.g. the cat stretch vs. body-tap lines).

## Invariants the gate enforces

- `contract` must be `famling.interactions/1` and `character` must match the
  file name; unknown fields are rejected (typo protection);
- every behaviour tag must be a clip id in that character's animation manifest
  and must not be a `timing.json` spec-only clip (`walk`, `attack`);
- every region box stays inside the canvas, which must match the pack canvas;
- each event is declared once: the canonical `SLOT_ORDER` (host events) and
  `RULE_ORDER` (triggers) must be covered exactly - if a new event is added the
  generator fails and asks you to extend the order constant;
- every region gesture/action event resolves through a behaviour rule, and the
  plugin `EVENT_CLIPS` table can be re-derived from the output and must agree
  across all three characters (cross-product gate without the plugin checkout).

## Byte stability

Generated text is `JSON.stringify(document, null, 2) + "\n"`, the same format
as the pre-MB-104 hand-written files. The migration produced byte-identical
files, so dsh-famling's `gen-content-constants.mjs` `source-sha256` and the
embedded animation chunks stay valid. If a future regeneration really changes
the bytes, run the plugin regeneration (`npm run gen:content` in
`plugins/dsh-famling`) in the same change.
