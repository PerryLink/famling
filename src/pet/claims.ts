export interface ClaimContext {
  userName?: string
  /** Capabilities the pet can actually perform; empty means no OS actions. */
  capabilities: string[]
}

export interface ClaimIssue {
  code: 'name-mismatch' | 'unsupported-capability' | 'unsupported-action'
  detail: string
}

const ACTION_WORDS = ['关灯', '叫你起床', '提醒你', '帮你买', '帮你发', '打开文件', '删除文件']

/**
 * Deterministic guard for template/LLM output. It catches the two highest-risk
 * companion fabrications: wrong user facts and claimed OS capabilities.
 */
export function verifyUtterance(text: string, context: ClaimContext): ClaimIssue[] {
  const issues: ClaimIssue[] = []
  if (context.userName) {
    const match = text.match(/你叫([^\s，。！？]{1,8})/)
    if (match && match[1] !== context.userName) {
      issues.push({ code: 'name-mismatch', detail: `said name ${match[1]}, known ${context.userName}` })
    }
  }
  for (const action of ACTION_WORDS) {
    if (text.includes(action) && !context.capabilities.some((cap) => cap === action)) {
      issues.push({ code: 'unsupported-capability', detail: action })
    }
  }
  if (/(已经|刚刚)?帮你(把)?(关|开|发|删|买)/.test(text) && context.capabilities.length === 0) {
    issues.push({ code: 'unsupported-action', detail: 'claims an OS action' })
  }
  return issues
}

export const SAFE_REFUSAL = '这个我没做过，也不记得。你再说一次？'
