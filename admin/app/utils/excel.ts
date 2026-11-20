import type { ColType, ReportColumn, Row } from '~/utils/reports'

interface ExportOptions {
  title: string
  periodText: string
  filtersText: string
  columns: ReportColumn[]
  rows: Row[]
  summary: { label: string; value: string | number; type?: ColType }[]
  fileName: string
  truncatedFrom?: number | null
}

const MONEY_FMT = '#,##0" ₭"'
const DATE_FMT = 'dd/mm/yyyy hh:mm:ss'

/** Builds an .xlsx file in the browser and downloads it. ExcelJS loads only when needed. */
export async function exportExcel(o: ExportOptions) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MyTPlus Activity Center'
  wb.created = new Date()

  // ── Report sheet ──
  const ws = wb.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
  })
  ws.columns = o.columns.map((c) => ({ key: c.key, width: c.width ?? 16 }))

  const last = o.columns.length
  const titleRow = ws.addRow([o.title])
  titleRow.font = { bold: true, size: 16 }
  ws.mergeCells(1, 1, 1, last)
  const infoRow = ws.addRow([`Period: ${o.periodText}`])
  ws.mergeCells(2, 1, 2, last)
  infoRow.font = { color: { argb: 'FF555555' } }
  const filterRow = ws.addRow([
    `Filters: ${o.filtersText || 'none'} · Rows: ${o.rows.length.toLocaleString()}${o.truncatedFrom ? ` (first ${o.rows.length.toLocaleString()} of ${o.truncatedFrom.toLocaleString()})` : ''} · Created ${new Date().toLocaleString('en-GB')}`,
  ])
  ws.mergeCells(3, 1, 3, last)
  filterRow.font = { color: { argb: 'FF555555' } }
  ws.addRow([])

  const header = ws.addRow(o.columns.map((c) => c.header))
  header.height = 22
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1A1A1A' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD021' } }
    cell.alignment = { vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } }
  })

  for (const r of o.rows) {
    const row = ws.addRow(
      o.columns.map((c) => {
        const v = r[c.key]
        if (v === null || v === undefined || v === '') return null
        if (c.type === 'phone') return formatPhone(String(v)) // keep as text so leading 0 stays
        // Excel has no time zones: write the local (Laos) clock time, not UTC.
        if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60_000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return v as any
      }),
    )
    o.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      if (c.type === 'money') cell.numFmt = MONEY_FMT
      else if (c.type === 'date') cell.numFmt = DATE_FMT
      else if (c.type === 'number') cell.numFmt = '#,##0'
      else if (c.type === 'percent') cell.numFmt = '0%'
      else if (c.type === 'result') {
        if (cell.value === 'Success') cell.font = { color: { argb: 'FF1D8A4A' }, bold: true }
        if (cell.value === 'Failed') cell.font = { color: { argb: 'FFC0392B' }, bold: true }
      }
    })
  }
  if (o.rows.length) {
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + o.rows.length, column: last } }
  }

  // ── Summary sheet ──
  const sum = wb.addWorksheet('Summary')
  sum.columns = [{ width: 34 }, { width: 22 }]
  const st = sum.addRow([o.title])
  st.font = { bold: true, size: 16 }
  sum.addRow([`Period: ${o.periodText}`]).font = { color: { argb: 'FF555555' } }
  sum.addRow([`Filters: ${o.filtersText || 'none'}`]).font = { color: { argb: 'FF555555' } }
  sum.addRow([])
  for (const s of o.summary) {
    const row = sum.addRow([s.label, s.value])
    row.getCell(1).font = { bold: true }
    if (s.type === 'money') row.getCell(2).numFmt = MONEY_FMT
    else if (typeof s.value === 'number') row.getCell(2).numFmt = '#,##0'
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = o.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
