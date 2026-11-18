/**
 * `setup.html` legal/consent + voice preference panel.
 *
 * The setup page is a statement location, not a consent location: it renders
 * the same canonical TOS + TTS declaration as the pet modal, shows whether the
 * current machine has a valid acceptance, and links to the full document.
 * Acceptance itself only happens through the pet's explicit checkbox modal, so
 * a static page can never act as an implicit "I agree" click. This module
 * deliberately contains NO TOS acceptance write (it never calls
 * `createAcceptance`/`saveAcceptance` and never writes the acceptance key).
 *
 * Voice switch (VOICE-SWITCH-2026-11-17): the user can pick the DeepSeek cloud
 * TTS voice `stella` (default) or `tide` (system TTS ignores the id); the choice is persisted in
 * `desktop-games/pet/voice`. Because the voice is part of the TTS config
 * signature, changing it makes the pet window re-show the separate TTS
 * declaration (memory-only gate); this page never claims that taking the TOS
 * here satisfies it.
 *
 * Own-voice experiment: a local-only recorder (max 15 s, MediaRecorder). No
 * upload/ASR/TTS/clone path exists; the official DeepSeek clone API is
 * unsupported (see `src/voice/clone.ts`). The mic is requested only after the
 * explicit acknowledgement checkbox AND a current local TOS acceptance; a
 * refusal never calls `getUserMedia`.
 */
import {
  ACCEPTANCE_STORAGE_KEY,
  acceptanceStatus,
  parseAcceptanceRaw,
  type AcceptanceStatus,
} from './core.ts'
import { renderLegalSections } from './modal.ts'
import { AGE_STORAGE_KEY, ageBandView, parseAgeVerificationRaw } from './age.ts'
import {
  TOS_HASH,
  TOS_SECTIONS,
  TOS_TITLE,
  TOS_VERSION,
  TTS_HASH,
  TTS_SECTIONS,
  TTS_TITLE,
  TTS_VERSION,
} from './terms.ts'
import {
  VOICE_OPTIONS,
  VOICE_PREF_STORAGE_KEY,
  isTtsVoiceId,
  readVoicePref,
  voiceLabel,
  writeVoicePref,
} from '../voice-prefs.ts'
import { VOICE_CLONE_UNSUPPORTED_COPY, deepseekVoiceCloneProvider } from '../../voice/clone.ts'
import {
  VOICE_SAMPLE_MAX_MS,
  VOICE_SAMPLE_PRIVACY_POINTS,
  VoiceSampleRecorder,
  type MediaStreamLike,
  type RecorderLike,
  type VoiceSample,
  type VoiceSampleState,
} from '../../voice/sample-recorder.ts'

function consentStatusText(): string {
  try {
    if (typeof globalThis === 'undefined') return '无法读取本机存储：同意只能在桌宠内完成。'
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (!storage) return '本机存储不可用：同意状态只能在桌宠会话内保留，下次启动会再次要求同意。'
    const read = parseAcceptanceRaw(storage.getItem(ACCEPTANCE_STORAGE_KEY))
    if (!read.acceptance) {
      return read.corrupt
        ? '本机同意记录已损坏：下次打开桌宠会重新要求完整同意（安全回退）。'
        : '尚未同意：首次打开桌宠会弹出完整 TOS，必须勾选并明确同意后才能正常使用。'
    }
    if (read.status !== 'accepted') {
      return `条款已升级（旧版本 ${read.acceptance.tosVersion}）：下次打开桌宠需重新阅读并同意 ${TOS_VERSION}。`
    }
    return `已同意当前版本 ${read.acceptance.tosVersion}（${new Date(read.acceptance.acceptedAt).toLocaleString()}）。修改/DLC/TTS 每次仍会单独确认。`
  } catch {
    return '本机存储不可用：同意状态只能在桌宠会话内保留，下次启动会再次要求同意。'
  }
}

/**
 * Read-only age band status (self-reported birth date). Never writes, never
 * shows the full birth date: only the band and whether the age-gated feature
 * threshold (18+) is met, plus whether the record is local or unavailable.
 * The status copy deliberately names no gated feature (2026-11-17 user
 * decision: gated features are not advertised on public pages). Correction
 * happens in the pet's About panel.
 */
function ageStatusText(): string {
  try {
    if (typeof globalThis === 'undefined') return '无法读取本机存储：年龄核验只能在桌宠内完成。'
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (!storage) return '本机存储不可用：年龄核验状态无法读取（桌宠内可完成一次性会话内核验）。'
    const read = parseAgeVerificationRaw(storage.getItem(AGE_STORAGE_KEY), new Date())
    if (!read.record) {
      return read.status === 'corrupt'
        ? '年龄记录已损坏：下次打开桌宠会重新要求年龄核验（需年龄门槛的功能将被阻止，直到重新核验）。'
        : read.status === 'invalid'
          ? '年龄记录已失效：下次打开桌宠会重新要求年龄核验（需年龄门槛的功能将被阻止，直到重新核验）。'
          : '尚未完成年龄核验：下次打开桌宠会先要求选择出生年/月/日并确认，之后才展示 TOS。'
    }
    const view = ageBandView(read.record, new Date())
    return `年龄核验（自报）· ${view.band} · 部分功能 18+ 门槛：${view.adult ? '已满足' : '未满足（部分功能被阻止）'} · 仅显示年龄段，不显示完整生日。`
  } catch {
    return '本机存储不可用：年龄核验状态无法读取（桌宠内可完成一次性会话内核验）。'
  }
}

/** Read-only view of the persisted TOS acceptance (never writes/changes it). */
function currentAcceptance(): { accepted: boolean; status: AcceptanceStatus } {
  try {
    if (typeof globalThis === 'undefined') return { accepted: false, status: 'unavailable' }
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (!storage) return { accepted: false, status: 'unavailable' }
    const read = parseAcceptanceRaw(storage.getItem(ACCEPTANCE_STORAGE_KEY))
    if (!read.acceptance) return { accepted: false, status: read.status }
    const status = acceptanceStatus(read.acceptance)
    return { accepted: status === 'accepted', status }
  } catch {
    return { accepted: false, status: 'unavailable' }
  }
}

function fill(id: string, text: string): void {
  const element = document.getElementById(id)
  if (element) element.textContent = text
}

// ---------------------------------------------------------------------------
// Voice preference (stella / tide) — persisted preference, not consent
// ---------------------------------------------------------------------------
function initVoiceSettings(): void {
  const badge = document.getElementById('setup-voice-current')
  const status = document.getElementById('setup-voice-status')
  const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="setup-voice"]'))
  if (radios.length === 0) return
  let current = readVoicePref()
  const setStatus = (text: string): void => {
    if (status) status.textContent = text
  }
  const render = (): void => {
    if (badge) badge.textContent = voiceLabel(current)
    for (const radio of radios) radio.checked = radio.value === current
    for (const radio of radios) {
      const option = VOICE_OPTIONS.find((entry) => entry.id === radio.value)
      if (option) radio.setAttribute('aria-label', `${option.label}（${option.description}）`)
    }
  }
  render()
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return
      const next = radio.value
      if (!isTtsVoiceId(next)) {
        render()
        setStatus('未知音色：已恢复当前设置。')
        return
      }
      if (!currentAcceptance().accepted) {
        // Do not write before the pet's explicit TOS acceptance; revert the UI.
        render()
        setStatus('未保存：请先在桌宠窗口完成完整 TOS/免责声明确认。本页不会代替你同意，也不会写入同意记录。')
        return
      }
      const result = writeVoicePref(next)
      if (result !== 'ok') {
        render()
        setStatus(`保存失败（${result}）：本机存储不可用，桌宠仍使用 ${voiceLabel(current)}。`)
        return
      }
      current = next
      render()
      setStatus(
        `已切换到 ${voiceLabel(current)}。音色属于 TTS 配置：桌宠会重新显示单独的 TTS 声明并要求确认（TOS 同意不能替代）。预生成命中不产生额外费用。`,
      )
    })
  }
  // Another setup/pet window may change the preference; keep this page in sync.
  window.addEventListener('storage', (event) => {
    if (event.key !== VOICE_PREF_STORAGE_KEY) return
    current = readVoicePref()
    render()
    setStatus('音色设置已从其他窗口更新。')
  })
}

// ---------------------------------------------------------------------------
// Local-only own-voice recording panel (no upload, no clone)
// ---------------------------------------------------------------------------
function micEnvironmentSupported(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    )
  } catch {
    return false
  }
}

function sampleExtension(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  return 'bin'
}

function initVoiceRecording(): void {
  const openButton = document.getElementById('voice-record-open')
  const panel = document.getElementById('voice-record-panel')
  const privacyHost = document.getElementById('voice-record-privacy')
  const cloneStatus = document.getElementById('voice-record-clone-status')
  const ack = document.getElementById('voice-record-ack') as HTMLInputElement | null
  const startButton = document.getElementById('voice-record-start') as HTMLButtonElement | null
  const stopButton = document.getElementById('voice-record-stop') as HTMLButtonElement | null
  const clearButton = document.getElementById('voice-record-clear') as HTMLButtonElement | null
  const downloadLink = document.getElementById('voice-record-download') as HTMLAnchorElement | null
  const playback = document.getElementById('voice-record-playback') as HTMLAudioElement | null
  const declineButton = document.getElementById('voice-record-decline')
  const closeButton = document.getElementById('voice-record-close')
  const status = document.getElementById('voice-record-status')
  if (!openButton || !panel || !startButton || !status) return

  // Single-source privacy copy + truthful clone capability statement.
  if (privacyHost) {
    privacyHost.replaceChildren()
    for (const point of VOICE_SAMPLE_PRIVACY_POINTS) {
      const item = document.createElement('li')
      item.textContent = point.text
      privacyHost.append(item)
    }
  }
  if (cloneStatus) {
    const capability = deepseekVoiceCloneProvider.supported ? '可用' : '未提供（unsupported）'
    cloneStatus.textContent = `克隆能力：${capability}。${VOICE_CLONE_UNSUPPORTED_COPY}`
  }

  const setStatus = (text: string): void => {
    status.textContent = text
  }
  let recorder: VoiceSampleRecorder | null = null
  let objectUrl: string | null = null
  let hasSample = false

  const releaseObjectUrl = (): void => {
    if (!objectUrl) return
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Revoking a stale URL is best effort; playback is already cleared below.
    }
    objectUrl = null
  }

  const gateMessage = (): string => {
    if (!currentAcceptance().accepted) {
      return '未同意完整 TOS：本页不能代替同意，也不会请求麦克风。请先在桌宠窗口完成同意。'
    }
    if (!micEnvironmentSupported()) return '此环境不支持录音（MediaRecorder/麦克风不可用）。'
    if (!ack?.checked) return '请先勾选上方确认；未确认前不会请求麦克风，也不会录音。'
    return '已就绪：可以开始录音（最多 15 秒），录音只留在本页内存。'
  }

  const updateControls = (): void => {
    const recording = recorder?.state === 'recording'
    const requesting = recorder?.state === 'requesting'
    if (startButton) {
      startButton.hidden = hasSample
      startButton.disabled = hasSample || requesting || recording || !currentAcceptance().accepted || !micEnvironmentSupported() || !ack?.checked
    }
    if (stopButton) stopButton.hidden = !recording
    if (clearButton) clearButton.hidden = !hasSample
    if (downloadLink) downloadLink.hidden = !hasSample
    if (playback) playback.hidden = !hasSample
  }

  const renderSample = (sample: VoiceSample | null): void => {
    releaseObjectUrl()
    hasSample = sample !== null
    if (!sample) {
      if (playback) playback.removeAttribute('src')
      if (downloadLink) downloadLink.removeAttribute('href')
      updateControls()
      return
    }
    try {
      objectUrl = URL.createObjectURL(sample.blob)
      if (playback) {
        playback.src = objectUrl
        playback.hidden = false
      }
      if (downloadLink) {
        downloadLink.href = objectUrl
        downloadLink.download = `pagefold-voice-sample.${sampleExtension(sample.mimeType)}`
        downloadLink.hidden = false
      }
    } catch {
      setStatus('录音已完成，但本页无法生成试听/下载链接；录音仍只在本页内存，没有上传。')
    }
    updateControls()
  }

  const onRecorderState = (state: VoiceSampleState): void => {
    if (state === 'recording') {
      setStatus(`录音中…最多 ${Math.round(VOICE_SAMPLE_MAX_MS / 1000)} 秒，结束会自动停止；不会上传。`)
    }
    updateControls()
  }

  const ensureRecorder = (): VoiceSampleRecorder => {
    if (recorder) return recorder
    recorder = new VoiceSampleRecorder({
      getUserMedia: () =>
        navigator.mediaDevices.getUserMedia({ audio: true }) as unknown as Promise<MediaStreamLike>,
      createRecorder: (stream) => new MediaRecorder(stream as unknown as MediaStream) as unknown as RecorderLike,
      onState: onRecorderState,
      onError: (error) => {
        // Report, never upload; the UI keeps an actionable short message.
        try {
          console.warn('[voice-sample] recording failed:', error instanceof Error ? error.message : String(error))
        } catch {
          // console may be unavailable; the status line below still reports it.
        }
        setStatus('录音失败：麦克风不可用、权限被拒绝或浏览器不支持；没有上传任何内容，也没有克隆。')
        updateControls()
      },
    })
    return recorder
  }

  const closePanel = (message: string): void => {
    const active = ensureRecorder()
    if (active.active || active.current) {
      active.clear()
      renderSample(null)
    }
    panel.hidden = true
    openButton.setAttribute('aria-expanded', 'false')
    openButton.hidden = false
    setStatus(message)
  }

  openButton.addEventListener('click', () => {
    panel.hidden = false
    openButton.setAttribute('aria-expanded', 'true')
    openButton.hidden = true
    setStatus(gateMessage())
    updateControls()
    ack?.focus()
  })

  ack?.addEventListener('change', () => {
    setStatus(gateMessage())
    updateControls()
  })

  startButton.addEventListener('click', () => {
    if (!currentAcceptance().accepted || !ack?.checked || !micEnvironmentSupported()) {
      // Refusal path: no getUserMedia, no recording.
      setStatus(gateMessage())
      updateControls()
      return
    }
    const active = ensureRecorder()
    void active
      .start({ localOnly: true, ownVoice: true, noCloningOthers: true, aiDisclosed: true })
      .then((started) => {
        if (!started) {
          setStatus('没有开始录音：确认未完成、麦克风被拒绝或已有录音在进行。')
          updateControls()
          return
        }
        setStatus('正在请求麦克风权限…（不会上传）')
        updateControls()
      })
      .catch(() => {
        setStatus('没有开始录音：麦克风请求失败。没有上传任何内容。')
        updateControls()
      })
  })

  stopButton?.addEventListener('click', () => {
    const active = ensureRecorder()
    void active
      .stop()
      .then((sample) => {
        renderSample(sample)
        setStatus(
          sample
            ? '录音完成：只在本页内存，未上传、未转写、未克隆。可试听/下载/清除。'
            : '没有录到内容（可能未授权或太短）；没有上传任何内容。',
        )
        updateControls()
      })
      .catch(() => {
        setStatus('停止录音时出错；没有上传任何内容。请清除后重试。')
        updateControls()
      })
  })

  clearButton?.addEventListener('click', () => {
    if (recorder) recorder.clear()
    renderSample(null)
    if (ack) ack.checked = false
    setStatus('录音已从本页内存清除（下载到你设备的文件需要你自己删除）；再次录音需重新勾选确认。')
    updateControls()
  })

  declineButton?.addEventListener('click', () => {
    closePanel('已拒绝：没有请求麦克风权限，也没有录音。')
  })
  closeButton?.addEventListener('click', () => {
    closePanel('已收起录音面板；本页内存中的录音已丢弃（如需保留请先下载）。')
  })

  // Never leave the microphone open when the page is hidden/closed.
  window.addEventListener('pagehide', () => {
    if (recorder) recorder.clear()
    releaseObjectUrl()
  })

  updateControls()
}

function main(): void {
  fill('setup-consent-status', consentStatusText())
  fill('setup-age-status', ageStatusText())
  fill('setup-tos-meta', `${TOS_TITLE} · 版本 ${TOS_VERSION} · SHA-256 ${TOS_HASH}`)
  fill('setup-tts-meta', `${TTS_TITLE} · 版本 ${TTS_VERSION} · SHA-256 ${TTS_HASH}`)
  const tosHost = document.getElementById('setup-tos-sections')
  if (tosHost) renderLegalSections(document, tosHost, TOS_SECTIONS)
  const ttsHost = document.getElementById('setup-tts-sections')
  if (ttsHost) renderLegalSections(document, ttsHost, TTS_SECTIONS)
  initVoiceSettings()
  initVoiceRecording()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main, { once: true })
  else main()
}
