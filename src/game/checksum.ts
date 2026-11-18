/** CRC32 (IEEE 802.3) for local save integrity. Not a security boundary. */
const TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(text: string): string {
  let crc = 0xffffffff
  for (let i = 0; i < text.length; i++) {
    crc = (crc >>> 8) ^ TABLE[(crc ^ text.charCodeAt(i)) & 0xff]!
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}
