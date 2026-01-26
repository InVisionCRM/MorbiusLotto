import { GoogleGenAI, Type } from "@google/genai";
import { AISuggestion } from '../types';

export const generateMemeCaptions = async (memeName: string): Promise<AISuggestion[]> => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("NEXT_PUBLIC_GEMINI_API_KEY is missing");
    return [
      { caption: "API Key missing" },
      { caption: "Please configure env vars" },
      { caption: "To use AI features" }
    ];
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Generate 3 funny, witty, and relevant short captions for the meme template known as "${memeName}". 
    
    CRITICAL INSTRUCTIONS:
    1. LENGTH: Captions must be SHORT and relevant to the image. 
    2. WORD USAGE: You MUST include the word "MORB" or "MORBING" in every caption, used strictly as a VERB (action), NOUN (Thing) or adjective.
    3. TOPICS: The captions must strictly relate to CRYPTO, Pulsechain, Life, Scamming, STUPIDITY (dumb decisions, smooth brain), or SARCASM.
    
    Examples:
    - "So, did you morb her last night"
    - "I'm serious, don't Morb me bro"
    - "I guess I can keep Morbing if you want"
    - "he's morbing hard AF"
    
    Keep them concise and typical of internet meme humor.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) return [];

    const data = JSON.parse(text) as AISuggestion[];
    return data;
  } catch (error) {
    console.error("Error generating captions:", error);
    return [
      { caption: "AI is currently sleeping" },
      { caption: "Try again later" },
    ];
  }
};