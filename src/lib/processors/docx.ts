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
    
    // Process text by paragraph rather than isolated w:t nodes because words are often split across nodes
    const paragraphs = xmlDoc.getElementsByTagName("w:p");
    
    const pData: { p: Element, original: string, tNodes: Element[] }[] = [];
    const texts: string[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const tNodes = Array.from(p.getElementsByTagName("w:t"));
        if (tNodes.length > 0) {
            const original = tNodes.map(t => t.textContent || "").join("");
            if (original.trim().length > 0 && /[a-zA-ZäöüåÄÖÜÅ]/.test(original)) {
                 pData.push({ p, original, tNodes });
                 texts.push(original);
            }
        }
    }

    onProgress(`Translating ${texts.length} paragraphs/segments...`);
    const translatedTexts = await batchTranslate(texts);

    onProgress("Rebuilding Word document...");
    for (let i = 0; i < pData.length; i++) {
         const translated = translatedTexts[i];
         if (translated !== undefined) {
             const { tNodes } = pData[i];
             // Put the entire translated text in the first text node, clear the rest
             tNodes[0].textContent = translated;
             for (let j = 1; j < tNodes.length; j++) {
                  tNodes[j].textContent = "";
             }
         }
    }

    const serializer = new XMLSerializer();
    const newDocXml = serializer.serializeToString(xmlDoc);
    zip.file("word/document.xml", newDocXml);

    return await zip.generateAsync({ type: "blob" });
}
