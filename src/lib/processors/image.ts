import { extractAndTranslateImageOrPDF } from '../gemini';

export async function processImage(file: File, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("Analyzing and Translating Image...");
    const translatedText = await extractAndTranslateImageOrPDF(file);

    onProgress("Generating new Image layout...");
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        const objectUrl = URL.createObjectURL(file);
        
        img.onload = () => {
             URL.revokeObjectURL(objectUrl);
             const canvas = document.createElement('canvas');
             canvas.width = img.width;
             canvas.height = img.height;
             const ctx = canvas.getContext('2d');
             if (!ctx) return reject("Canvas not supported");

             // Blank white background to replace old image
             ctx.fillStyle = '#ffffff';
             ctx.fillRect(0, 0, canvas.width, canvas.height);

             // Draw translated text
             ctx.fillStyle = '#000000';
             let fontSize = Math.max(16, Math.floor(canvas.width / 40));
             ctx.font = `${fontSize}px sans-serif`;
             ctx.textBaseline = 'top';

             const words = translatedText.split(' ');
             let line = '';
             let y = fontSize;
             const x = fontSize;
             const maxWidth = canvas.width - (fontSize * 2);
             const lineHeight = fontSize * 1.5;

             for(let n = 0; n < words.length; n++) {
               const testLine = line + words[n] + ' ';
               let metrics;
               try {
                   metrics = ctx.measureText(testLine);
               } catch (e) {
                   continue; // Fallback for bizarre rendering errors in jsdom if present
               }
               const testWidth = metrics.width;
               if (testWidth > maxWidth && n > 0) {
                 ctx.fillText(line, x, y);
                 line = words[n] + ' ';
                 y += lineHeight;
               } else {
                 line = testLine;
               }
             }
             ctx.fillText(line, x, y);

             canvas.toBlob((blob) => {
                 if (blob) resolve(blob);
                 else reject("Failed to generate image blob");
             }, file.type);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject("Failed to load original image");
        };
        img.src = objectUrl;
    });
}
