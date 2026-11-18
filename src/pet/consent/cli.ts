#!/usr/bin/env node
/**
 * CLI consent gate for content/DLC import scripts (`scripts/import-character.mjs`).
 *
 * Behaviour (by design, not convenience):
 * - ALWAYS prints the full TOS + disclaimer with version + SHA-256 before any
 *   import/load work; `--accept-tos` is an explicit per-run consent flag, never
 *   a stored waiver. A second run without the flag is refused again.
 * - Consent requires a fresh `--accept-tos` on EVERY invocation; there is no
 *   "already accepted" state read from disk. The persisted audit entry is
 *   evidence only and is deliberately never consulted as an exemption.
 * - Without consent: exit code 3 and no pack files are read/copied by the caller.
 * - Audit: appends one JSONL entry (time/action/version/hash/target/decision)
 *   to `PET_CONSENT_AUDIT_FILE` or `<repo>/.consent/audit.jsonl` (gitignored).
 *   If the audit cannot be written the import is refused (exit 4) so a
 *   regulatory trail is never silently skipped.
 *
 * Usage:
 *   node --import tsx src/pet/consent/cli.ts --action dlc.character-import \
 *     --target my-pack [--accept-tos] [--json]
 *
 * `--json` keeps stdout machine-clean for the caller (all legal text goes to
 * stderr); without it the full text is printed to stdout for humans.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditEntry, type AuditEntry } from './core.ts'
import { TOS_HASH, TOS_TEXT, TOS_TITLE, TOS_VERSION } from './terms.ts'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const EXIT_OK = 0
const EXIT_USAGE = 2
const EXIT_CONSENT_REQUIRED = 3
const EXIT_AUDIT_FAILED = 4

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const acceptTos = argv.includes('--accept-tos')

function valueOf(flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined
  const value = argv[index + 1]
  return value && !value.startsWith('--') ? value : undefined
}

const action = valueOf('--action') ?? 'content.modify'
const target = valueOf('--target')
const auditPath =
  process.env.PET_CONSENT_AUDIT_FILE && process.env.PET_CONSENT_AUDIT_FILE.trim() !== ''
    ? resolve(process.env.PET_CONSENT_AUDIT_FILE)
    : resolve(ROOT, '.consent', 'audit.jsonl')

/** Human-facing output; all legal text goes to stderr in --json mode. */
function say(line: string): void {
  if (json) console.error(line)
  else console.log(line)
}

function banner(): void {
  say('============================================================')
  say(' LEGAL / CONSENT REQUIRED BEFORE IMPORT OR LOAD')
  say(` ${TOS_TITLE}`)
  say(` 版本: ${TOS_VERSION}`)
  say(` SHA-256: ${TOS_HASH}`)
  say('============================================================')
  say('全文如下；阅读后必须用 --accept-tos 明确同意本次导入/加载。')
  say('每次运行都会重新要求同意；此前的同意/审计记录不构成永久豁免。')
  say('')
  if (json) console.error(TOS_TEXT)
  else console.log(TOS_TEXT)
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage: node --import tsx src/pet/consent/cli.ts --action <id> [--target <name>] [--accept-tos] [--json]

The CLI prints the full TOS + disclaimer (version + SHA-256) and requires
--accept-tos on EVERY run. Consent is recorded to
$PET_CONSENT_AUDIT_FILE (default: <repo>/.consent/audit.jsonl) but is never
read back as an exemption. Exit codes: 0 consent+audit ok, 2 usage,
3 consent required (pass --accept-tos after reading), 4 audit unwritable.`)
  process.exit(EXIT_OK)
}

banner()

if (!acceptTos) {
  say('')
  say('[consent] REFUSED: no explicit consent flag. Nothing was read, loaded, or written.')
  say('[consent] Re-run with --accept-tos ONLY after reading the full text above:')
  say(`[consent]   node scripts/import-character.mjs <pack> --accept-tos [--apply]`)
  process.exit(EXIT_CONSENT_REQUIRED)
}

const entry: AuditEntry = createAuditEntry({
  kind: 'action',
  action,
  decision: 'accept',
  at: new Date().toISOString(),
  ...(target ? { target } : {}),
})

try {
  mkdirSync(dirname(auditPath), { recursive: true })
  appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' })
} catch (error) {
  console.error(`[consent] audit write failed (${auditPath}): ${error instanceof Error ? error.message : String(error)}`)
  console.error('[consent] refusing to continue without an audit trail; set PET_CONSENT_AUDIT_FILE to a writable path.')
  process.exit(EXIT_AUDIT_FAILED)
}

say('')
say(`[consent] ACCEPTED for this run: action=${action}${target ? ` target=${target}` : ''}`)
say(`[consent] audit appended: ${auditPath}`)
say('[consent] this record is audit evidence only; it does not exempt any future run or in-app modification.')
say('')
process.exit(EXIT_OK)
