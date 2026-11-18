# Pet Brief — test cases v0.1

Status: **test vectors; no validator yet.**
Date: 2026-11-14
Files: [`pet-brief.testcases.json`](pet-brief.testcases.json) · [`pet-brief.schema.json`](pet-brief.schema.json) · [`pet-brief.example.json`](pet-brief.example.json)

---

## 0. How to use

A test runner should:

1. Load `base` (a valid brief).
2. For each case, apply root-level `overrides` (replace the field), or use `raw` for malformed JSON.
3. Validate against the contract in [`PET-BRIEF.md`](PET-BRIEF.md).
4. Compare the result to `expect`:
   - `accept` — schema OK, all items usable;
   - `accept_omit` — schema OK, low-confidence item omitted;
   - `reject` — discard the whole brief;
   - `fallback` — schema OK, but Pearl must use a safe line because the line is not traceable;
   - `skip` — do not read (user opt-out).

The runner may be a small Node/Python script; it must not call a model or network.

---

## 1. Cases

| # | ID | Expect | What it proves |
|---|---|---|---|
| 1 | `valid` | accept | happy path |
| 2 | `empty` | accept | empty brief → idle |
| 3 | `expired` | reject | TTL enforced |
| 4 | `malformed_json` | reject | parser resilience |
| 5 | `unknown_schema` | reject | version gate |
| 6 | `too_many_commitments` | reject | max 10 |
| 7 | `low_confidence_omit` | accept_omit | confidence <0.7 omitted |
| 8 | `forbidden_reasoning` | reject | no CoT |
| 9 | `forbidden_secret` | reject | no secrets |
| 10 | `high_risk_remind` | accept | high risk → remind |
| 11 | `no_risk` | accept | no risk → no remind |
| 12 | `unknown_line_source` | fallback | no invented fact |
| 13 | `redacted` | accept | redaction notes allowed |
| 14 | `ttl_boundary` | reject | expiresAt must be > generatedAt |
| 15 | `missing_timezone` | reject | ISO 8601 with timezone |
| 16 | `invalid_mood` | reject | mood enum |
| 17 | `duplicate_ids` | reject | id uniqueness |
| 18 | `counts_mismatch` | reject | counts must match arrays |
| 19 | `expires_before_generated` | reject | time ordering |
| 20 | `user_opt_out` | skip | no read |

---

## 2. What is not covered here

- No network call (must be tested with network disabled).
- No write to the Advisers store (must be tested with a read-only assertion).
- No secret leakage in logs (must be tested with a log scan).
- No UI behavior (idle/remind) — those are renderer tests.
- No real client documents — do not use real data in tests.

Add those as integration tests when the producer/consumer exist.

---

## 3. Expected behavior details

### `low_confidence_omit`

The brief may be accepted, but the item with `confidence < 0.7` must not appear in `suggestedLines` or `remind`. If the producer can omit it before output, better.

### `unknown_line_source`

A `suggestedLines` entry that cannot be traced to a commitment/risk/fact must trigger a safe fallback (`这个我没记。` / `我还不太懂。`), not a fabricated reminder.

### `counts_mismatch`

`counts` is a redundant projection; if it disagrees with the arrays, reject the brief rather than trusting one side. This catches producer bugs.

### `user_opt_out`

If the user disabled the brief, the consumer must not read the file at all. This is a policy test, not a schema test.

---

## 4. Next

- Add a small validator (no dependencies) in the Famling or Advisers repo.
- Wire it into Advisers `advisers pet-brief --json` CI.
- Add real integration tests only after Phase 2 is approved.

---

## 5. Links

- [`PET-BRIEF.md`](PET-BRIEF.md)
- [`pet-brief.schema.json`](pet-brief.schema.json)
- [`pet-brief.example.json`](pet-brief.example.json)
- [`DECISIONS.md`](DECISIONS.md)
