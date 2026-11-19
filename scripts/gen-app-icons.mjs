#!/usr/bin/env node
/**
 * Generate the Tauri app/tray icon set from the registered UI-91 placeholder art.
 *
 *   node scripts/gen-app-icons.mjs            # write app/tauri/src-tauri/icons/*
 *   node scripts/gen-app-icons.mjs --check    # compare committed files, exit 1 on drift
 *   node scripts/gen-app-icons.mjs --check --json
 *   node scripts/gen-app-icons.mjs --json
 *
 * Sources (registered in public/assets/ui/manifest.json; license placeholder-only,
 * ai: none, deterministic local pixel art from scripts/gen_ui91.py):
 *   public/assets/ui/icons/U-ICON-01_16x16.png   -> 16 px tray master
 *   public/assets/ui/icons/U-ICON-02_32x32.png   -> 32 px tray/taskbar master
 *   public/assets/ui/icons/U-ICON-03_256x256.png -> 256 px app mark (32-grid x8)
 *
 * Outputs (app/tauri/src-tauri/icons):
 *   icon.ico        16/32/48/64/128 BMP entries + 256 PNG entry (Windows shell + tauri-build)
 *   icon.png        256 px app mark; main.rs embeds this for the tray
 *   32x32.png       U-ICON-02 (bundle.icon; the size the Windows shell uses at 100%)
 *   128x128.png     nearest half of the 256 mark
 *   128x128@2x.png  256 px app mark
 *   README.md       provenance + regeneration command
 *
 * Why this shape:
 * - tauri-build embeds the first .ico listed in bundle.icon into the Windows
 *   executable; the generic .ico fallback is icons/icon.ico.
 * - Small ICO entries stay uncompressed 32bpp BMP (classic Windows/RC path); only
 *   the 256 entry is PNG-compressed (Vista+ convention, also used by the old
 *   Tauri-CLI default icon this replaces). 16/32 are the art-direction masters,
 *   48 = 16 x3 (per docs/art/UI-91-GENERATION-2026-11-17.md), 64/128 are exact
 *   integer /4 and /2 steps of the 256 master, so no filter blur.
 * - Pure Node, no image dependency: PNG decode/encode via node:zlib, ICO/BMP
 *   written by hand, so --check is deterministic on any OS/CI runner.
 *
 * The generated icons are placeholder brand art (not final); see the generated
 * README.md for source hashes and the provenance/registration note.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UI_ICON_DIR = join(ROOT, 'public/assets/ui/icons')
const OUT_DIR = join(ROOT, 'app/tauri/src-tauri/icons')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const SOURCE_IDS = ['U-ICON-01', 'U-ICON-02', 'U-ICON-03']
const SOURCE_FILES = {
  'U-ICON-01': 'U-ICON-01_16x16.png',
  'U-ICON-02': 'U-ICON-02_32x32.png',
  'U-ICON-03': 'U-ICON-03_256x256.png',
}

function fail(message) {
  process.stderr.write('[app-icons] error: ' + message + '\n')
  process.exit(2)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// PNG decode (strict RGBA/8-bit/non-interlaced: the UI-91 contract) + encode.

function decodePng(buffer, label) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(label + ': not a PNG')
  }
  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(label + ': expected 8-bit RGBA, non-interlaced PNG')
  }
  if (idat.length === 0) throw new Error(label + ': no IDAT')
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = width * bpp
  const data = new Uint8Array(width * height * bpp)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const lineStart = y * (stride + 1) + 1
    for (let x = 0; x < stride; x += 1) {
      const value = raw[lineStart + x]
      const index = y * stride + x
      const left = x >= bpp ? data[index - bpp] : 0
      const up = y > 0 ? data[index - stride] : 0
      const upLeft = y > 0 && x >= bpp ? data[index - stride - bpp] : 0
      let predictor = 0
      if (filter === 0) predictor = 0
      else if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      } else {
        throw new Error(label + ': unsupported PNG filter ' + filter)
      }
      data[index] = (value + predictor) & 0xff
    }
  }
  return { width, height, data }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeAndData.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(typeAndData), 8 + data.length)
  return chunk
}

function encodePng(image) {
  const { width, height, data } = image
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function resampleNearest(image, width, height) {
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width))
      const source = (sourceY * image.width + sourceX) * 4
      const target = (y * width + x) * 4
      out[target] = image.data[source]
      out[target + 1] = image.data[source + 1]
      out[target + 2] = image.data[source + 2]
      out[target + 3] = image.data[source + 3]
    }
  }
  return { width, height, data: out }
}

// ICO: uncompressed 32bpp BMP entries for small sizes + one 256 PNG entry.

function bmpEntry(image) {
  const { width, height, data } = image
  const xor = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow * width + x) * 4
      const target = (y * width + x) * 4
      xor[target] = data[source + 2]
      xor[target + 1] = data[source + 1]
      xor[target + 2] = data[source]
      xor[target + 3] = data[source + 3]
    }
  }
  const maskStride = ((width + 31) >> 5) * 4
  const mask = Buffer.alloc(maskStride * height)
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow * width + x) * 4
      if (data[source + 3] === 0) mask[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(xor.length + mask.length, 20)
  return Buffer.concat([header, xor, mask])
}

function packIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + 16 * entries.length
  entries.forEach((entry, index) => {
    const base = index * 16
    directory[base] = entry.size === 256 ? 0 : entry.size
    directory[base + 1] = entry.size === 256 ? 0 : entry.size
    directory[base + 2] = 0
    directory[base + 3] = 0
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(entry.payload.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += entry.payload.length
  })
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.payload)])
}

function readmeRows(outputs) {
  const listed = ['icon.ico', 'icon.png', '32x32.png', '128x128.png', '128x128@2x.png']
  const formats = {
    'icon.ico': 'ICO: 16/32/48/64/128 BMP + 256 PNG',
    'icon.png': 'PNG 256x256',
    '32x32.png': 'PNG 32x32',
    '128x128.png': 'PNG 128x128',
    '128x128@2x.png': 'PNG 256x256',
  }
  return listed.map((file) => '| `' + file + '` | ' + formats[file] + ' | `' + sha256(outputs.get(file)) + '` |')
}

function buildReadme(outputs, sourceHashes) {
  const sourceRows = SOURCE_IDS.map((id) => '| ' + id + ' | `' + SOURCE_FILES[id] + '` | `' + sourceHashes.get(id) + '` |')
  const lines = [
    '# Tauri app/tray icons (generated)',
    '',
    'Generated by `node scripts/gen-app-icons.mjs` from the registered UI-91 placeholder',
    'mark in `public/assets/ui/icons/`. Do not edit these binaries by hand.',
    '',
    '| file | format | sha256 |',
    '| --- | --- | --- |',
    ...readmeRows(outputs),
    '',
    'Source assets (registered in `public/assets/ui/manifest.json`):',
    '',
    '| id | file | sha256 |',
    '| --- | --- | --- |',
    ...sourceRows,
    '',
    'Derivation: 16 = U-ICON-01, 32 = U-ICON-02, 48 = U-ICON-01 x3, 64 = 256 /4,',
    '128 = 256 /2, 256 = U-ICON-03. All steps are integer nearest-neighbour, so the',
    'pixel-art edges stay hard (no filtering, no new colours).',
    '',
    'U-ICON-04 is the art batch ICO preview (16/32/48/256, all PNG entries); this',
    'wiring repacks from the same U-ICON-01/02/03 masters so the Windows RC path',
    'gets classic BMP small entries plus the extra 64/128 shell tiers.',
    '',
    'Provenance and limits:',
    '',
    '- license: `placeholder-only` (same as the UI-91 source assets in `ASSET-LICENSES.md`); `ai: none`;',
    '  deterministic local pixel drawing (`scripts/gen_ui91.py`).',
    '- This is the pagefold placeholder app mark, not final brand art. Replacing it means',
    '  updating `public/assets/ui/icons/` (and its generator) first, then re-running this',
    '  script; the CREDITS.md/ASSET-LICENSES.md registration rows are synced outside this',
    '  generated directory.',
    '- `icon.ico` is what `tauri-build` embeds into the Windows executable (first `.ico`',
    '  listed in `bundle.icon`); `icon.png` is embedded by `src/main.rs` for the tray.',
    '- Explorer/taskbar DPI rendering and installer-artwork checks still need a real',
    '  Windows desktop; this directory only pins the files and their provenance.',
    '',
    'Regenerate:',
    '',
    '    node scripts/gen-app-icons.mjs',
    '    node scripts/gen-app-icons.mjs --check',
    '',
  ]
  return lines.join('\n')
}

function buildOutputs() {
  const sources = new Map()
  const sourceHashes = new Map()
  for (const id of SOURCE_IDS) {
    const file = join(UI_ICON_DIR, SOURCE_FILES[id])
    if (!existsSync(file)) throw new Error('missing source asset (run scripts/gen_ui91.py first): ' + relative(ROOT, file))
    const bytes = readFileSync(file)
    sourceHashes.set(id, sha256(bytes))
    sources.set(id, { bytes, image: decodePng(bytes, id) })
  }
  const image16 = sources.get('U-ICON-01').image
  const image32 = sources.get('U-ICON-02').image
  const image256 = sources.get('U-ICON-03').image
  const bytes256 = sources.get('U-ICON-03').bytes
  if (image16.width !== 16 || image16.height !== 16) throw new Error('U-ICON-01 must be 16x16')
  if (image32.width !== 32 || image32.height !== 32) throw new Error('U-ICON-02 must be 32x32')
  if (image256.width !== 256 || image256.height !== 256) throw new Error('U-ICON-03 must be 256x256')

  const outputs = new Map()
  outputs.set('icon.png', bytes256)
  outputs.set('128x128@2x.png', bytes256)
  outputs.set('32x32.png', sources.get('U-ICON-02').bytes)
  outputs.set('128x128.png', encodePng(resampleNearest(image256, 128, 128)))
  const entries = [
    { size: 16, payload: bmpEntry(image16) },
    { size: 32, payload: bmpEntry(image32) },
    { size: 48, payload: bmpEntry(resampleNearest(image16, 48, 48)) },
    { size: 64, payload: bmpEntry(resampleNearest(image256, 64, 64)) },
    { size: 128, payload: bmpEntry(resampleNearest(image256, 128, 128)) },
    { size: 256, payload: bytes256 },
  ]
  outputs.set('icon.ico', packIco(entries))
  outputs.set('README.md', Buffer.from(buildReadme(outputs, sourceHashes), 'utf8'))
  return { outputs, sourceHashes }
}

function usage() {
  process.stdout.write([
    'Generate the Tauri app/tray icon set from the UI-91 placeholder assets.',
    '',
    'Usage:',
    '  node scripts/gen-app-icons.mjs            write app/tauri/src-tauri/icons/*',
    '  node scripts/gen-app-icons.mjs --check    fail when committed files drift',
    '  node scripts/gen-app-icons.mjs --json     machine-readable summary',
    '',
    'Exit codes: 0 ok; 1 drift in --check; 2 setup/usage error.',
    '',
  ].join('\n'))
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    usage()
    return 0
  }
  const check = args.includes('--check')
  const json = args.includes('--json')
  const unknown = args.filter((arg) => !['--check', '--json', '--help', '-h'].includes(arg))
  if (unknown.length > 0) fail('unknown argument(s): ' + unknown.join(' '))

  let built
  try {
    built = buildOutputs()
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  const { outputs, sourceHashes } = built
  const files = [...outputs.keys()].sort()
  const summary = {
    mode: check ? 'check' : 'write',
    outputDir: relative(ROOT, OUT_DIR),
    files: files.map((file) => ({ file, bytes: outputs.get(file).length, sha256: sha256(outputs.get(file)) })),
    sources: SOURCE_IDS.map((id) => ({ id, file: SOURCE_FILES[id], sha256: sourceHashes.get(id) })),
  }

  if (check) {
    const drift = []
    for (const file of files) {
      const target = join(OUT_DIR, file)
      const expected = outputs.get(file)
      const actual = existsSync(target) ? readFileSync(target) : null
      if (actual === null || !actual.equals(expected)) {
        drift.push({ file, expectedSha256: sha256(expected), actualSha256: actual === null ? null : sha256(actual) })
      }
    }
    if (json) {
      process.stdout.write(JSON.stringify({ ...summary, ok: drift.length === 0, drift }, null, 2) + '\n')
    } else if (drift.length === 0) {
      process.stdout.write('[app-icons] check ok (' + files.length + ' generated files match; sources ' + SOURCE_IDS.join(', ') + ')\n')
    } else {
      for (const item of drift) {
        process.stderr.write('[app-icons] drift: ' + item.file + ' expected ' + item.expectedSha256 + ' got ' + (item.actualSha256 === null ? 'missing' : item.actualSha256) + '\n')
      }
      process.stderr.write('[app-icons] run: node scripts/gen-app-icons.mjs\n')
    }
    return drift.length === 0 ? 0 : 1
  }

  mkdirSync(OUT_DIR, { recursive: true })
  for (const file of files) writeFileSync(join(OUT_DIR, file), outputs.get(file))
  if (json) {
    process.stdout.write(JSON.stringify({ ...summary, ok: true }, null, 2) + '\n')
  } else {
    process.stdout.write('[app-icons] wrote ' + files.length + ' files to ' + relative(ROOT, OUT_DIR) + '\n')
    for (const file of files) process.stdout.write('  ' + file.padEnd(16) + ' ' + String(outputs.get(file).length).padStart(7) + ' B  ' + sha256(outputs.get(file)) + '\n')
  }
  return 0
}

process.exitCode = main()
