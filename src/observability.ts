export interface CrashEvent {
  at: string
  kind: 'error' | 'rejection'
  message: string
  stack?: string
}

const buffer: CrashEvent[] = []
let installed = false

/** Local-only crash ring buffer; no network. Sentry can read this later. */
export function installCrashBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    buffer.push({
      at: new Date().toISOString(),
      kind: 'error',
      message: event.message,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    })
    buffer.splice(0, Math.max(0, buffer.length - 50))
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    buffer.push({
      at: new Date().toISOString(),
      kind: 'rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
    buffer.splice(0, Math.max(0, buffer.length - 50))
  })
}

export function diagnostics(): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      href: typeof location === 'undefined' ? '' : location.href,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      events: buffer,
    },
    null,
    2,
  )
}

export function downloadDiagnostics(): void {
  const blob = new Blob([diagnostics()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `desktop-games-diagnostics-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

let sentryReady = false

export interface SentryOptions {
  dsn?: string
  release?: string
  enabled: boolean
}

/** Opt-in only. Without a DSN this is a no-op; no silent network. */
export async function initSentry(options: SentryOptions): Promise<boolean> {
  if (!options.enabled || !options.dsn || sentryReady || typeof window === 'undefined') return false
  try {
    const Sentry = await import('@sentry/browser')
    Sentry.init({
      dsn: options.dsn,
      release: options.release,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        delete event.user
        if (event.request) delete event.request.cookies
        return event
      },
    })
    sentryReady = true
    return true
  } catch {
    return false
  }
}

export function sentryEnabled(): boolean {
  return sentryReady
}
