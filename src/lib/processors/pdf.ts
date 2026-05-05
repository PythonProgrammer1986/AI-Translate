import { jsPDF } from 'jspdf';
import { extractAndTranslateImageOrPDF } from '../gemini';

export async function processPdf(file: File, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("Analyzing and Translating PDF using AI...");
    const translatedText = await extractAndTranslateImageOrPDF(file);

    if (!translatedText) {
        throw new Error("Could not extract or translate text from this PDF.");
    }

    onProgress("Generating new translated PDF...");
    const doc = new jsPDF();

    const margins = 15;
    const maxLineWidth = doc.internal.pageSize.width - (margins * 2);
    const textLines = doc.splitTextToSize(translatedText, maxLineWidth);

    doc.text(textLines, margins, margins);

    return doc.output('blob');
}
