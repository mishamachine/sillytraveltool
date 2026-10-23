#!/usr/bin/env node
// Spreadsheet reader (supabase/functions/_shared/sheet.js): builds a real .xlsx (shared strings, a date style, two
// sheets), reads it back as text, and writes supabase/tests/files/flagship-itinerary.{xlsx,csv} for import tests.
//   node scripts/test-sheet.mjs
import assert from 'node:assert/strict'
import { deflateRawSync, crc32 } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { xlsxToText, sheetToText } from '../supabase/functions/_shared/sheet.js'

function zip(files) {
  const enc = new TextEncoder(), locals = [], centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text), data = deflateRawSync(raw), nm = enc.encode(name), crc = crc32(raw)
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8)
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26)
    locals.push(h, nm, data)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42)
    centrals.push(c, nm)
    offset += 30 + nm.length + data.length
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10)
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, cd, e]))
}

// The flagship trip as a travel planner's spreadsheet: dates as Excel serials with a date style
const rows = [
  ['Date', 'Time', 'What', 'From', 'To', 'Confirmation'],
  [46336, '13:05', 'Flight IB 6852', 'Seattle SEA', 'Madrid MAD', 'K7Q2LM'],
  [46337, '', 'Hotel Urban Letras, 3 nights', 'Madrid', '', '58213377'],
  [46340, '07:05', 'Train Renfe AVE', 'Madrid Atocha', 'Granada', 'RNF8812'],
  [46340, '', 'Casa Morisca, 2 nights', 'Granada', '', 'CM-3310'],
  [46342, '09:12', 'Train Renfe', 'Granada', 'Sevilla Santa Justa', 'RNF9920'],
  [46344, '08:45', 'Train Renfe AVE', 'Sevilla', 'Barcelona Sants', 'RNF1044'],
  [46346, '10:15', 'Flight VY 1886', 'Barcelona BCN', 'Berlin BER', 'VY77QK'],
  [46348, '09:40', 'Train ICE', 'Berlin Hbf', 'Dresden Hbf', 'DB55120'],
  [46349, '08:58', 'Train ICE', 'Dresden Hbf', 'München Hbf', 'DB55121'],
  [46351, '20:15', 'Nightjet', 'München Hbf', 'Roma Termini', 'NJ40233'],
  [46354, '10:30', 'Flight DL 225', 'Rome FCO', 'Seattle SEA', 'K7Q2LN'],
]
const strings = [...new Set(rows.flat().filter(v => typeof v === 'string'))]
const col = i => String.fromCharCode(65 + i)
const sheet1 = `<worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => typeof v === 'number'
  ? `<c r="${col(ci)}${ri + 1}" s="1"><v>${v}</v></c>`
  : v === '' ? '' : `<c r="${col(ci)}${ri + 1}" t="s"><v>${strings.indexOf(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
const sheet2 = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Notes &amp; contacts</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>`
const files = {
  '[Content_Types].xml': '<Types/>',
  'xl/workbook.xml': '<workbook><sheets><sheet name="Itinerary" sheetId="1"/><sheet name="Notes" sheetId="2"/></sheets></workbook>',
  'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>',
  'xl/sharedStrings.xml': `<sst>${strings.map(s => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`,
  'xl/worksheets/sheet1.xml': sheet1,
  'xl/worksheets/sheet2.xml': sheet2,
}
const bytes = zip(files)
const text = await xlsxToText(bytes)
console.log(text.split('\n').slice(0, 4).join('\n'), '\n…')
assert.match(text, /^# Sheet: Itinerary\nDate,Time,What,From,To,Confirmation\n2026-11-10,13:05,Flight IB 6852,Seattle SEA,Madrid MAD,K7Q2LM/)
assert.match(text, /2026-11-25,20:15,Nightjet,München Hbf,Roma Termini,NJ40233/)
assert.match(text, /# Sheet: Notes\nNotes & contacts,42/)
assert.equal(await sheetToText(new TextEncoder().encode('a,b'), { name: 'x.csv' }), 'a,b')
assert.equal(await sheetToText(bytes, { name: 'trip.pdf' }), null)
writeFileSync(new URL('../supabase/tests/files/flagship-itinerary.xlsx', import.meta.url), bytes)
writeFileSync(new URL('../supabase/tests/files/flagship-itinerary.csv', import.meta.url), text.replace(/^# Sheet: Itinerary\n/, '').split('\n\n')[0] + '\n')
console.log('\nok  xlsx → text (shared strings, date style, inline strings, two sheets); csv passthrough; wrote test files')
