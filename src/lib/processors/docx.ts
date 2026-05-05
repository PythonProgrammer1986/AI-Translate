import JSZip from 'jszip';
import { batchTranslate } from '../gemini';

export async function processDocx(file: File, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("Unzipping Word document...");
    const zip = await JSZip.loadAsync(file);
    const docXmlFile = zip.file("word/document.xml");
    
    if (!docXmlFile) {
        throw new Error("Invalid or corrupted DOCX format: word/document.xml not found");
    }

    let docXml = await docXmlFile.async("text");

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, "application/xml");
    const textNodes = xmlDoc.getElementsByTagName("w:t");

    const texts: string[] = [];
    for (let i = 0; i < textNodes.length; i++) {
        texts.push(textNodes[i].textContent || "");
    }

    onProgress(`Translating ${texts.length} text segments...`);
    const translatedTexts = await batchTranslate(texts);

    onProgress("Rebuilding Word document...");
    for (let i = 0; i < textNodes.length; i++) {
        if (translatedTexts[i] !== undefined) {
            textNodes[i].textContent = translatedTexts[i];
        }
    }

    const serializer = new XMLSerializer();
    const newDocXml = serializer.serializeToString(xmlDoc);
    zip.file("word/document.xml", newDocXml);

    return await zip.generateAsync({ type: "blob" });
}
