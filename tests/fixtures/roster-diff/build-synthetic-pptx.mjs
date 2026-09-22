/**
 * Builds a small pptx in memory from synthetic-deck.json, in the shape Google Slides exports the
 * "Meet the Alpha <Campus> Team" template: a left column (portrait, name, title) and a right column
 * (BACKGROUND and PASSIONS & INTERESTS labels, each followed by its text). Everyone in it is invented.
 */
import zlib from 'node:zlib'

const WIDTH = 12191675
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** Distinct bytes per label so each synthetic portrait has its own sha256. */
export function syntheticImage(label) { return Buffer.concat([PNG, Buffer.from(`synthetic:${label}`)]) }

export function buildSyntheticPptx(spec) {
  const files = []
  const slideRels = []
  const media = new Map()
  spec.slides.forEach((slide, index) => {
    const n = index + 1
    const rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>']
    let shapes = ''
    let id = 100
    const text = (value, x, y, cy = 300000) => `<p:sp><p:nvSpPr><p:cNvPr id="${++id}" name="Google Shape;${id};p${n}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="3100000" cy="${cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${String(value).split('\n').map((line) => `<a:p><a:r><a:rPr lang="en"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`
    if (slide.kind === 'cover' || slide.kind === 'closing') {
      shapes += text(slide.text, 4000000, 2800000)
    } else {
      shapes += text(slide.name, 868680, 5523028) + text(slide.title, 777240, 6035092)
      shapes += text(spec.campusLabel, 4864608, 1325880) + text('BACKGROUND', 4864608, 2134009) + text(slide.bio ?? '[ Background ]', 4864608, 2536345)
      shapes += text('PASSIONS & INTERESTS', 4864608, 4449600) + text(slide.interests ?? '[ Passions & interests ]', 4864608, 4851936)
      // The portrait frame is a tall text box; some real decks have stray words typed into it.
      if (slide.frameText) shapes += text(slide.frameText, 664430, 1227325, 3647888)
      shapes += text(slide.placeholder || 'Insert/Copy Image', 678233, 1164390, 3648000)
      if (slide.image) {
        if (!media.has(slide.image)) media.set(slide.image, `image${media.size + 1}.png`)
        rels.push(`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media.get(slide.image)}"/>`)
        shapes += `<p:pic><p:nvPicPr><p:cNvPr id="${++id}" name="Google Shape;${id};p${n}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="1012350" y="1253820"/><a:ext cx="2584698" cy="3415381"/></a:xfrm></p:spPr></p:pic>`
      }
    }
    files.push([`ppt/slides/slide${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="a" xmlns:r="r" xmlns:p="p"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`])
    files.push([`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships>${rels.join('')}</Relationships>`])
    slideRels.push(`<Relationship Id="rId${n + 5}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`)
  })
  // Relationship order is shuffled on purpose: slide order comes from sldIdLst, as in a real export.
  files.push(['ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships>${[...slideRels].reverse().join('')}</Relationships>`])
  files.push(['ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:r="r" xmlns:p="p"><p:sldIdLst>${spec.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 6}"/>`).join('')}</p:sldIdLst><p:sldSz cy="6858000" cx="${WIDTH}"/></p:presentation>`])
  for (const [label, name] of media) files.push([`ppt/media/${name}`, syntheticImage(label), true])
  return zip(files)
}

function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function zip(files) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, content, store] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const body = store ? data : zlib.deflateRawSync(data)
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = zlib.crc32 ? zlib.crc32(data) : 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(store ? 0 : 8, 10); header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(body.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(nameBytes.length, 28); header.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, body)
    central.push(header, nameBytes)
    offset += 30 + nameBytes.length + body.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
