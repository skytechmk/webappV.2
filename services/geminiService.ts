import { GoogleGenAI } from "@google/genai";
import { generateEventDescriptionWithOllama, generateImageCaptionWithOllama, isOllamaAvailable } from './ollamaService';

// Safe access to env variables for environments where import.meta.env might be undefined
// @ts-ignore
const env: any = import.meta.env || {};

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
    if (await isOllamaAvailable()) {
      return await generateEventDescriptionWithOllama(title, date, type);
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
  // Attempt to use local Ollama instance first
  try {
    if (await isOllamaAvailable()) {
      return await generateImageCaptionWithOllama(base64Image);
    }
  } catch (error) {
    // Silent fail for Ollama
  }

  // Fallback to Gemini
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
