# Pet Brief — Advisers → Pearl read-only contract v0.1

Status: **design contract; not implemented.**
Date: 2026-11-14
Purpose: let Advisers (the brain) feed Famling / Pearl (the face) without merging codebases or exposing private data.

> The pet must not read the Advisers database directly. It reads a small, redacted, expiring JSON brief produced by an explicit Advisers command.

---

## 0. One line

**Advisers owns the truth; Pearl gets a short, redacted, expiring brief and never writes back.**

---

## 1. Principles

1. **Read-only.** Pearl cannot create, update, delete, or confirm commitments.
2. **Local-first.** Brief is generated on the same machine; no network upload by default.
3. **Minimal.** Max 10 items per section; no full documents, no client files, no raw chat logs.
4. **No raw CoT.** No reasoning traces, no hidden prompts, no model signatures.
5. **Evidence-based.** Every commitment/risk carries an `id` and `confidence`; `suggestedLines` must not invent facts.
6. **Expiring.** `expiresAt` default +5 minutes; Pearl must discard stale briefs.
7. **Opt-in.** User can disable the brief, hide a matter, or redact fields.
8. **No emotional fields.** No "missed you", no "streak", no "mood about the user"; `mood` is about workload, not affection.
9. **No free chat.** Pearl maps the brief to fixed lines/animations; it does not feed the brief into an LLM for open conversation.

---

## 2. JSON schema

Machine-readable: [`pet-brief.schema.json`](pet-brief.schema.json) · example: [`pet-brief.example.json`](pet-brief.example.json).

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-14T16:00:00+08:00",
  "expiresAt": "2026-11-14T16:05:00+08:00",
  "source": "advisers",
  "counts": { "today": 2, "commitments": 3, "risks": 1, "facts": 2 },
  "today": [
    { "id": "matter_01", "title": "给王工发报价", "status": "open" }
  ],
  "commitments": [
    {
      "id": "commit_123",
      "matter": "matter_01",
      "who": "王工",
      "what": "发报价",
      "due": "2026-11-15",
      "risk": "high",
      "confidence": 0.92
    }
  ],
  "risks": [
    {
      "id": "risk_01",
      "level": "high",
      "summary": "报价今天到期，尚未发出",
      "evidence": "commit_123",
      "confidence": 0.88
    }
  ],
  "facts": [
    {
      "id": "fact_01",
      "subject": "王工",
      "predicate": "prefers",
      "value": "PDF 报价",
      "confidence": 0.9
    }
  ],
  "mood": "focused",
  "suggestedLines": [
    "王工的报价，今天到期。",
    "先做报价，还是先回邮件？"
  ],
  "redactions": ["client names masked in evidence", "no document bodies"]
}
```

### 2.1 Field rules

| Field | Rule |
|---|---|
| `schemaVersion` | integer; reject unknown major |
| `generatedAt` / `expiresAt` | ISO 8601 with timezone; `expiresAt` > `generatedAt` |
| `source` | `"advisers"` only |
| `today` | max 10; id/title/status |
| `commitments` | max 10; id/matter/who/what/due/risk/confidence |
| `risks` | max 10; id/level/summary/evidence/confidence |
| `facts` | max 10; id/subject/predicate/value/confidence |
| `mood` | `calm`, `focused`, `concerned`, `pleased` only |
| `suggestedLines` | max 3; each ≤40 Chinese chars; must be traceable to a commitment/risk/fact |
| `redactions` | list of human-readable redaction notes; no secrets |
| `confidence` | 0–1; items below 0.7 should be omitted |

### 2.2 Forbidden fields

- `reasoning`, `cot`, `chain_of_thought`, `raw_prompt`, `system_prompt`
- `client_secret`, `api_key`, `token`, `password`
- document bodies, email bodies, chat transcripts, audio
- `affection`, `love`, `missed_you`, `streak`, `guilt`
- anything that requires a network call to interpret

---

## 3. Producer: Advisers side

### 3.1 Command

```sh
advisers pet-brief --json
```

- Read-only; no writes to `state.db`.
- Uses the same matter/commitment/fact data as `today`/`risks`.
- Applies redaction before output.
- Exits non-zero with a machine-readable error if the store is unavailable.
- Does not call a model; deterministic projection only.

### 3.2 Output channel

Preferred order:
1. stdout JSON (for CLI integration);
2. local file (`~/.advisers/pet-brief.json`, mode 600);
3. local socket/pipe (future).

No HTTP by default. No cloud.

### 3.3 Freshness

- `expiresAt` = now + 5 min.
- Pearl polls at most every 60s, or on focus/pat/reminder events.
- If expired, Pearl falls back to idle; never shows stale commitments as current.

---

## 4. Consumer: Pearl side

### 4.1 Mapping

| Brief | Pearl behavior |
|---|---|
| `mood: focused` | `calm` expression; idle; no interruption |
| `mood: concerned` | `listening` / `surprised`; one short line |
| `commitments[].risk: high` | `remind` animation; pearl glow; one line |
| `risks[]` | `remind` / `concerned`; no alarm sound by default |
| `suggestedLines[]` | baked voice lines; subtitles; max 1 per 10 min |
| empty / expired | idle; no invented memory |
| `facts[]` | only used if user asks a fixed recall intent; no open chat |

### 4.2 Claims guard

Before speaking, check:
- Does the line reference a real `id` in the brief?
- Is the due date/name present in the brief?
- Is the line non-coercive (no guilt, no "must", no "you promised" shaming)?
- Is it ≤40 chars and free of private data?

If not, fall back to a safe line: "这个我没记。" / "我还不太懂。"

### 4.3 No writes

Pearl never calls `commit add`, `remember`, `accept`, or any Advisers mutation. Pat/drag/talk events are **not** sent back by default. If future opt-in telemetry exists, it must be explicit, local, and separate.

---

## 5. Privacy / security

- Local only; no network by default.
- File mode 600; encrypted at rest if stored by Pearl.
- No client names in `suggestedLines` unless the user opted in; default mask (`某客户`).
- No document bodies; evidence is an `id`, not content.
- Delete/forget in Advisers immediately invalidates the next brief.
- `redactions` is a log, not a secret.
- No analytics, no crash upload, no remote logging.

---

## 6. Failure modes

| Failure | Behavior |
|---|---|
| Advisers not installed | idle; "还没连上账本" once, then silent |
| Store locked/unavailable | idle; no retry storm |
| Brief malformed | discard; log locally; no partial rendering |
| Brief expired | idle; no stale reminder |
| Confidence < 0.7 | omit item |
| Too many items | take top 10 by risk/due; never dump all |
| User disabled brief | no read; no error |

---

## 7. Testing (contract)

Minimum 20 cases:
1. valid brief → schema pass;
2. empty brief → idle;
3. expired brief → discard;
4. malformed JSON → discard;
5. unknown schemaVersion → discard;
6. 11 commitments → top 10;
7. confidence 0.69 → omitted;
8. forbidden `reasoning` field → reject;
9. secret-like field → reject;
10. high risk → remind;
11. no risk → no remind;
12. `suggestedLines` with unknown fact → fallback;
13. name redaction → masked;
14. no network call (test with network disabled);
15. no write to Advisers store (read-only assertion);
16. TTL boundary;
17. timezone boundary;
18. `mood` invalid → fallback calm;
19. duplicate ids → dedupe;
20. user opt-out → no read.

---

## 8. Non-goals

- No two-way chat.
- No command execution.
- No Office/document access from Pearl.
- No cloud sync.
- No emotional companion features.
- No direct SQLite access.
- No merging Advisers and Famling codebases.

---

## 9. Integration path

```
Advisers CLI (read-only projection)
  → `advisers pet-brief --json`
  → file/stdout
  → Pearl `PetBriefClient` (validate + expire + redact)
  → `PearlState` / `CharacterRenderer` / `VoiceService`
```

This is a **thin adapter**, not a merge. Advisers remains the source of truth; Pearl remains a renderer.

---

## 10. Open questions

1. Who owns the brief schema (Advisers vs Famling)?
2. Is the file path fixed or configurable?
3. Does the user want client names masked by default?
4. Is a local socket needed, or is stdout/file enough?
5. What is the exact `advisers pet-brief` command surface?

Track decisions in [`DECISIONS.md`](DECISIONS.md).
