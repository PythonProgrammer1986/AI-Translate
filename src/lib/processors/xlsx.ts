import * as XLSX from 'xlsx';
import { batchTranslate } from '../gemini';

export async function processXlsx(file: File, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("Reading Excel file...");
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
        if (cellsToTranslate[i] && t) {
            cellsToTranslate[i].cell.v = t;
        }
    });

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
