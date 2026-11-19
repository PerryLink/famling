/**
 * Compatibility re-export (E10 MB-105).
 *
 * The token-bucket implementation moved to the shared leaf module
 * `src/security/rate-limit.ts` so `src/voice` no longer imports from
 * `src/pet`. Pet call sites keep importing this path; it re-exports the same
 * class/function objects (not copies), so `instanceof RateLimitError` and all
 * limiter behaviour are unchanged. New code should import from
 * `src/security/rate-limit.ts` directly.
 */
export * from '../../security/rate-limit.ts'
