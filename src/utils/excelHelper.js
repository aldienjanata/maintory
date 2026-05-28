import ExcelJS from 'exceljs'

/**
 * Helper: apply styled header row to a worksheet
 * @param {ExcelJS.Worksheet} ws
 * @param {string[]} headers
 * @param {string} [accentColor='1E40AF'] - hex color without #
 */
export function applyHeaderStyle(ws, headers, accentColor = '0369A1') {
  const headerRow = ws.getRow(1)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${accentColor}` } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    }
  })
  headerRow.height = 22
}

/**
 * Helper: apply alternating row colors and borders to data rows
 * @param {ExcelJS.Worksheet} ws
 * @param {number} startRow - row index (1-based) where data rows start
 */
export function applyDataRowStyles(ws, startRow = 2) {
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return
    const isEven = (rowNumber - startRow) % 2 === 0
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = isEven
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        left: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        right: { style: 'hair', color: { argb: 'FFD1D5DB' } }
      }
      cell.alignment = { vertical: 'middle', wrapText: false }
    })
  })
}

/**
 * Set column widths on a worksheet
 * @param {ExcelJS.Worksheet} ws
 * @param {number[]} widths - array of column widths
 */
export function setColumnWidths(ws, widths) {
  ws.columns = widths.map(w => ({ width: w }))
}

/**
 * Download a workbook as .xlsx file
 * @param {ExcelJS.Workbook} workbook
 * @param {string} filename
 */
export async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
