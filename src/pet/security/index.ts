/**
 * Pet security/robustness toolkit — pure, testable building blocks.
 *
 * This directory is additive: no host file imports it yet (writing scope for
 * this round is `src/pet/security/**` only). The wiring checklist and the real
 * risks each module addresses are in `docs/audit/HARDENING-2026-11-17.md`.
 *
 * | module            | purpose                                                     |
 * |-------------------|-------------------------------------------------------------|
 * | limits.ts         | input/text/url/archive caps + plain-text sanitizer          |
 * | safe-storage.ts   | never-throwing versioned localStorage reads/writes          |
 * | fetch-timeout.ts  | abortable, size-capped, retry-capped JSON fetch             |
 * | rate-limit.ts     | token buckets for TTS/import/retry/save                     |
 * | path-safety.ts    | Windows/POSIX/UNC/`..`/ADS DLC path validation              |
 * | html.ts           | strict escaping + safe HTML-to-plain-text                   |
 * | error-boundary.ts | error classification/redaction + logging guard              |
 *
 * All modules are pure functions or injectable classes: no DOM, no network, no
 * `node:` imports, and nothing reads the real storage/clock unless the caller
 * passes no dependency. Tests live in `tests/security*.test.ts`.
 */

export {
  SECURITY_LIMITS,
  countCodePoints,
  truncateCodePoints,
  truncateUtf8Bytes,
  utf8ByteLength,
  stripControlChars,
  stripBidiControls,
  sanitizePlainText,
  withinCharLimit,
  withinByteLimit,
  validateHttpUrl,
  checkArchiveLimits,
} from './limits.ts'
export type {
  ArchiveEntry,
  ArchiveIssueCode,
  ArchiveLimitCheck,
  ArchiveLimitInput,
  SanitizeTextOptions,
  SecurityLimits,
  UrlValidation,
  UrlValidationOptions,
  UrlValidationReason,
} from './limits.ts'

export {
  resolveStorage,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  removeKey,
  readFiniteNumber,
  readClampedInt,
  readVersioned,
  writeVersioned,
  STORAGE_SCHEMA_VERSION,
} from './safe-storage.ts'
export type {
  StorageLike,
  StorageReadResult,
  StorageReadStatus,
  StorageWriteResult,
  StorageWriteStatus,
  ReadVersionedOptions,
  WriteVersionedOptions,
  VersionedEnvelope,
} from './safe-storage.ts'

export {
  DEFAULT_RETRY_STATUSES,
  FetchAbortError,
  FetchTimeoutError,
  NetworkRequestError,
  ResponseParseError,
  ResponseTooLargeError,
  fetchWithTimeout,
  fetchJsonWithTimeout,
  readResponseText,
  isAbortError,
} from './fetch-timeout.ts'
export type {
  Fetcher,
  FetchJsonOptions,
  FetchJsonResult,
  FetchResponseLike,
  FetchTimeoutOptions,
  ReadTextOptions,
} from './fetch-timeout.ts'

export {
  RateLimitError,
  TokenBucket,
  consumeOrThrow,
  createSecurityRateLimits,
} from './rate-limit.ts'
export type {
  RateLimitDecision,
  SecurityLimitName,
  SecurityRateLimits,
  TokenBucketOptions,
} from './rate-limit.ts'

export {
  PathSafetyError,
  assertSafeRelativePath,
  checkRelativePath,
  classifyPath,
  isSafeRelativePath,
  normalizeRelativePath,
  resolveWithinRoot,
} from './path-safety.ts'
export type { PathCheck, PathIssueCode, PathKind, PathSafetyOptions } from './path-safety.ts'

export {
  MAX_PLAIN_TEXT_INPUT_CHARS,
  MAX_PLAIN_TEXT_OUTPUT_CHARS,
  escapeAttribute,
  escapeHtml,
  isHtmlSafe,
  toPlainText,
} from './html.ts'
export type { PlainTextOptions } from './html.ts'

export {
  DEFAULT_USER_FALLBACK,
  classifyError,
  createErrorBoundary,
  defaultErrorLogger,
  formatUnhandledError,
  guardAsync,
  guardSync,
  isAbortLike,
  redactErrorMessage,
  toUserMessage,
} from './error-boundary.ts'
export type {
  ErrorBoundary,
  ErrorBoundaryOptions,
  ErrorClassification,
  ErrorKind,
  ErrorLogger,
  GuardFailure,
  GuardResult,
  UserMessageOptions,
} from './error-boundary.ts'
