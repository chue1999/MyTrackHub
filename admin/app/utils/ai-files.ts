/**
 * Getting a file ready for the AI chat, in the browser:
 * - Word (.docx) and Excel (.xlsx) become plain text (the AI APIs cannot read them directly);
 * - very big photos are made smaller (AI APIs limit picture size);
 * - pictures, PDFs and text/code files are sent as they are.
 */
export interface PreparedFile {
  name: string
  type: string
  body: Blob
}

export const AI_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  '.docx',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.html',
  '.log',
  '.sql',
  '.js',
  '.ts',
  '.vue',
  '.py',
  '.java',
  '.php',
  '.yaml',
  '.yml',
].join(',')

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|vue|py|java|kt|go|rb|php|cs|c|cpp|h|sql|sh|ya?ml|ini|env|log|conf)$/i
const MAX_SIDE = 2400

export const aiFileKind = (name: string, type: string): 'image' | 'pdf' | 'text' =>
  IMAGE_TYPES.includes(type) ? 'image' : type === 'application/pdf' || /\.pdf$/i.test(name) ? 'pdf' : 'text'

async function wordToText(file: File) {
  const mod = await import('mammoth')
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

async function excelToText(file: File) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const out: string[] = []
  wb.eachSheet((ws) => {
    out.push(`Sheet: ${ws.name}`)
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      for (let c = 1; c <= row.cellCount; c++) cells.push(csv(String(row.getCell(c).text ?? '').trim()))
      out.push(cells.join(','))
    })
    out.push('')
  })
  return out.join('\n')
}

/** Big photos → at most 2400 px on the long side, as JPEG. GIFs stay as they are (animation). */
async function shrinkImage(file: File): Promise<PreparedFile> {
  if (file.type === 'image/gif') return { name: file.name, type: file.type, body: file }
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return { name: file.name, type: file.type, body: file }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size <= 4 * 1024 * 1024) return { name: file.name, type: file.type, body: file }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) return { name: file.name, type: file.type, body: file }
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', body: blob }
}

export async function prepareAiFile(file: File): Promise<PreparedFile> {
  const name = file.name || 'pasted-image.png'
  if (/\.docx$/i.test(name)) return { name, type: 'text/plain', body: new Blob([await wordToText(file)]) }
  if (/\.xlsx$/i.test(name)) return { name, type: 'text/plain', body: new Blob([await excelToText(file)]) }
  if (/\.(doc|xls|ppt|pptx)$/i.test(name)) {
    throw new Error(`"${name}": save it as .docx / .xlsx / PDF first (old Office and PowerPoint files are not supported).`)
  }
  if (IMAGE_TYPES.includes(file.type)) return shrinkImage(new File([file], name, { type: file.type }))
  if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) return { name, type: 'application/pdf', body: file }
  if (file.type.startsWith('text/') || TEXT_EXT.test(name) || /json|xml/.test(file.type)) {
    return { name, type: file.type || 'text/plain', body: file }
  }
  throw new Error(`"${name}": this file type is not supported. Use pictures, PDF, Word, Excel, CSV or text files.`)
}
