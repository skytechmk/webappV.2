import { GoogleGenAI } from "@google/genai";

// Safe access to env variables for environments where import.meta.env might be undefined
// @ts-ignore
const env: any = import.meta.env || {};

const OLLAMA_BASE_URL = env.VITE_OLLAMA_URL || 'http://192.168.20.30:11434';
const OLLAMA_MODEL = env.VITE_OLLAMA_MODEL || 'phi4:latest';

const getAiClient = () => {
  // API Key must be obtained exclusively from process.env.API_KEY
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key is missing in .env file");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateEventDescription = async (title: string, date: string, type: string): Promise<string> => {
  // Attempt to use local Ollama instance first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); 

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `Write a short, exciting, and inviting description (max 2 sentences) for a ${type} event named "${title}" happening on ${date}. Use emojis. Do not include quotes.`,
        stream: false,
        options: {
          temperature: 0.8
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.response) {
        return data.response.trim().replace(/^"|"$/g, '');
      }
    }
  } catch (error) {
    // Silent fail for Ollama
  }

  // Fallback to Gemini
  const ai = getAiClient();
  if (!ai) return "Join us for an amazing celebration!";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a short, exciting, and inviting description (max 2 sentences) for a ${type} event named "${title}" happening on ${date}. Use emojis.`,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating description:", error);
    return "Join us for an amazing celebration!";
  }
};

export const generateImageCaption = async (base64Image: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Event memory";

  try {
    // Clean base64 string if it has data URI prefix
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            // Updated prompt to include searchable keywords
            text: "Generate a short caption (max 10 words) for this photo. Include key objects, colors, or the mood (e.g., 'Birthday cake with candles', 'People dancing happily')."
          }
        ]
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error generating caption:", error);
    return "Captured moment";
  }
};