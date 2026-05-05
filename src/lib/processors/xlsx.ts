import * as XLSX from 'xlsx';
import { batchTranslate } from '../gemini';

export async function processXlsx(file: File, onProgress: (msg: string) => void): Promise<{blob: Blob, extension: string}> {
    onProgress(`Reading ${file.name}...`);
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    const cellsToTranslate: { cell: XLSX.CellObject, original: string }[] = [];
    const texts: string[] = [];

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        for (const cellAddress in sheet) {
            if (cellAddress[0] === '!') continue;
            const cell = sheet[cellAddress];
            if (cell && cell.t === 's' && cell.v && typeof cell.v === 'string') {
                cellsToTranslate.push({ cell, original: cell.v });
                texts.push(cell.v);
            }
        }
    });

    onProgress(`Translating ${texts.length} strings...`);
    const translatedTexts = await batchTranslate(texts);

    onProgress("Rebuilding Excel document...");
    translatedTexts.forEach((t, i) => {
        if (cellsToTranslate[i] && t !== undefined) {
            cellsToTranslate[i].cell.v = t;
            if (cellsToTranslate[i].cell.r) delete cellsToTranslate[i].cell.r; // Remove rich text so value shows
        }
    });

    const fileNameLower = file.name.toLowerCase();
    let bookType: XLSX.BookType = 'xlsx';
    let mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    let extension = '.xlsx';

    if (fileNameLower.endsWith('.csv')) {
        bookType = 'csv';
        mimeType = 'text/csv';
        extension = '.csv';
    } else if (fileNameLower.endsWith('.xls')) {
        // Output as XLSX to Ensure compatibility with free SheetJS but keep data format intact
        bookType = 'xlsx';
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        extension = '.xlsx';
    }

    const wbout = XLSX.write(workbook, { bookType, type: 'array' });
    return { blob: new Blob([wbout], { type: mimeType }), extension };
}
