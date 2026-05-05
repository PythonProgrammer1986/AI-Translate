import { GoogleGenAI } from '@google/genai';

const getAiClient = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY environment variable. Please set it in AI Studio settings.");
    return new GoogleGenAI({ apiKey: key });
}

async function asyncMapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const executing = new Set<Promise<void>>();
    for (let i = 0; i < items.length; i++) {
        const p = fn(items[i]).then(r => { results[i] = r; }).finally(() => executing.delete(p));
        executing.add(p);
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return results;
}

export async function batchTranslate(texts: string[]): Promise<string[]> {
  if (!texts.length) return [];
  const ai = getAiClient();
  const chunkSize = 100;
  
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += chunkSize) {
    chunks.push(texts.slice(i, i + chunkSize));
  }

  const results = await asyncMapLimit(chunks, 3, async (chunk) => {
    const needsTranslation = chunk.some(t => t && String(t).trim().length > 0);
    if (!needsTranslation) {
         return chunk;
    }

    const payloadText = JSON.stringify(chunk);

    const prompt = `You are a highly accurate translation system. Translate the following JSON array of strings into English.
    - Maintain the exact same array length and order.
    - Do not translate numbers, URLs, or formulas.
    - If a string is already in English, leave it as is.
    - Respond ONLY with the raw JSON array. DO NOT wrap the output in markdown code blocks (\`\`\`).
    
    ${payloadText}`;

    try {
       const response = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: prompt,
           config: {
               responseMimeType: "application/json",
               temperature: 0.1
           }
       });
       
       let jsonStr = response.text || "[]";
       jsonStr = jsonStr.replace(/^```json/m, '').replace(/```$/m, '').trim();
       
       const parsed = JSON.parse(jsonStr);
       if (Array.isArray(parsed) && parsed.length === chunk.length) {
           return parsed;
       } else {
           console.warn("Mismatched array length, applying 1:1 fallback where possible");
           return chunk.map((c, idx) => parsed[idx] || c);
       }
    } catch (err) {
       console.error("Translation error", err);
       return chunk; // fallback safely
    }
  });

  return results.flat();
}

export async function extractAndTranslateImageOrPDF(file: File): Promise<string> {
     const ai = getAiClient();
     const base64 = await fileToBase64(file);

     const response = await ai.models.generateContent({
         model: 'gemini-2.5-flash',
         contents: [
             {
                 role: 'user',
                 parts: [
                     { inlineData: { mimeType: file.type, data: base64 } },
                     { text: "Translate all text found in this document/image into English. Provide only the translated English text. Try to maintain the natural paragraph structure." }
                 ]
             }
         ]
     });
     return response.text || "";
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '');
            if ((encoded?.length || 0) % 4 > 0) {
                 encoded += '='.repeat(4 - (encoded?.length || 0) % 4);
            }
            resolve(encoded || "");
        };
        reader.onerror = error => reject(error);
    });
}
