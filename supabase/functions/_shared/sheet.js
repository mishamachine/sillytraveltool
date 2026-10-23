// Spreadsheet itineraries as text the AI can read: CSV as is, XLSX unzipped and flattened to CSV (every sheet).
// No dependencies (DecompressionStream + regex XML), so it runs in the app and in Edge Functions alike.

const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The files in a zip: Map(name → Uint8Array), only those `want(name)` accepts. */
export async function unzip(bytes, want = () => true) {
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a zip file')
  const count = u16(bytes, eocd + 10)
  let p = u32(bytes, eocd + 16)
  const out = new Map()
  const dec = new TextDecoder()
  for (let n = 0; n < count && u32(bytes, p) === 0x02014b50; n++) {
    const method = u16(bytes, p + 10), size = u32(bytes, p + 20)
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32)
    const local = u32(bytes, p + 42)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!want(name)) continue
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    const data = bytes.subarray(start, start + size)
    out.set(name, method === 8 ? await inflateRaw(data) : method === 0 ? data : null)
  }
  return out
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('')
const colIndex = ref => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
const csvCell = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

// Built-in number formats that are dates or times
const DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

/** Excel serial → 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM' (or 'HH:MM' for a time of day). */
function serialToText(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  const ms = Math.round((n - 25569) * 86400000)
  const iso = new Date(ms).toISOString()
  if (n < 1) return iso.slice(11, 16)
  return n % 1 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10)
}

/** An .xlsx file's sheets as CSV text, each headed "# Sheet: <name>". */
export async function xlsxToText(bytes) {
  const files = await unzip(bytes, n => /^xl\/(sharedStrings|styles|workbook)\.xml$|^xl\/worksheets\/sheet\d+\.xml$/.test(n))
  const dec = new TextDecoder()
  const read = n => (files.get(n) ? dec.decode(files.get(n)) : '')
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]))
  // Which cell styles are dates
  const styles = read('xl/styles.xml')
  const custom = new Map([...styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map(m => [Number(m[1]), m[2]]))
  const xfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '')
  const dateStyle = [...xfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map(m => {
    const id = Number(m[1])
    return DATE_FMT.has(id) || (custom.has(id) && /[dmyh]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')))
  })
  const names = [...read('xl/workbook.xml').matchAll(/<sheet\s[^>]*name="([^"]*)"/g)].map(m => unxml(m[1]))
  const sheets = [...files.keys()].filter(n => /worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml/)[1]) - Number(b.match(/(\d+)\.xml/)[1]))

  const parts = []
  sheets.forEach((name, si) => {
    const rows = []
    for (const row of read(name).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = []
      for (const c of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], body = c[2] || ''
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
        const type = attrs.match(/t="(\w+)"/)?.[1]
        const style = Number(attrs.match(/s="(\d+)"/)?.[1] ?? -1)
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let text = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? texts(body) : v != null ? unxml(v) : ''
        if (!type && v != null && dateStyle[style]) text = serialToText(v)
        cells[ref ? colIndex(ref) : cells.length] = text
      }
      if (cells.some(x => x)) rows.push(Array.from(cells, x => csvCell(x ?? '')).join(','))
    }
    if (rows.length) parts.push(`# Sheet: ${names[si] || `Sheet ${si + 1}`}\n${rows.join('\n')}`)
  })
  return parts.join('\n\n')
}

/** Text for the AI from a spreadsheet file, by name or type; null when it isn't one. */
export async function sheetToText(bytes, { name = '', mime = '' } = {}) {
  if (/\.csv$|\.tsv$|\.txt$/i.test(name) || /text\/(csv|plain|tab-separated-values)/.test(mime)) return new TextDecoder().decode(bytes)
  if (/\.xlsx$/i.test(name) || /spreadsheetml/.test(mime)) return xlsxToText(bytes)
  return null
}
