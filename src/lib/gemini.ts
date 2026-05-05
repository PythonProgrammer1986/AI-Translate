import { GoogleGenAI, Type } from '@google/genai';

const getAiClient = () => {
    const key = localStorage.getItem('CUSTOM_GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY. Please provide it in the API Key settings.");
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
  const chunkSize = 50;
  
  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += chunkSize) {
    chunks.push(texts.slice(i, i + chunkSize));
  }

  const results = await asyncMapLimit(chunks, 3, async (chunk) => {
    const needsTranslation = chunk.some(t => t && String(t).trim().length > 0 && /[a-zA-ZäöüåÄÖÜÅ]/.test(String(t)));
    if (!needsTranslation) {
         return chunk;
    }

    const payloadObjects = chunk.map((text, index) => ({ id: index, text: String(text) }));
    const payloadText = JSON.stringify(payloadObjects);

    const prompt = `You are an expert Swedish-to-English translator. Translate the following JSON array of objects.
    - Read the 'text' field of each object. If it contains Swedish or another foreign language, translate it to English natively.
    - If it's already English, numbers, formulas, or untranslatable, keep it exactly as it is.
    - You MUST return a JSON array of objects with the exact same 'id' and the translated 'text'.
    - Do NOT drop any items. Exactly ${chunk.length} items must be returned.
    
    Input:
    ${payloadText}`;

    try {
       const response = await ai.models.generateContent({
           model: 'gemini-2.5-flash',
           contents: prompt,
           config: {
               responseMimeType: "application/json",
               responseSchema: {
                   type: Type.ARRAY,
                   items: {
                       type: Type.OBJECT,
                       properties: {
                           id: { type: Type.INTEGER },
                           text: { type: Type.STRING }
                       },
                       required: ["id", "text"]
                   }
               },
               temperature: 0.05
           }
       });
       
       let jsonStr = response.text || "[]";
       jsonStr = jsonStr.replace(/^```json/m, '').replace(/```$/m, '').trim();
       
       const parsed = JSON.parse(jsonStr) as {id: number, text: string}[];
       const translatedChunk = [...chunk]; // Default to original

       if (Array.isArray(parsed)) {
           for (const item of parsed) {
               if (item && typeof item.id === 'number' && item.id >= 0 && item.id < chunk.length && typeof item.text === 'string') {
                   translatedChunk[item.id] = item.text;
               }
           }
       }
       return translatedChunk;

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
                     { text: "You are an expert Swedish-to-English translator. Translate all text found in this document/image from Swedish to English. Provide ONLY the translated English text. Try to maintain the natural paragraph structure, format, and layout as closely as possible." }
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

