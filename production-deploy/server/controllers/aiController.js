import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

let genAI;
if (config.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
}

export const generateCaption = async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI service not configured" });
    }

    try {
        const { imageData } = req.body;
        if (!imageData) {
            return res.status(400).json({ error: "No image data provided" });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
            "Generate a short, creative caption for this image (max 50 characters):",
            {
                inlineData: {
                    data: imageData.split(',')[1],
                    mimeType: "image/jpeg"
                }
            }
        ]);

        const caption = result.response.text().trim();
        res.json({ caption });
    } catch (error) {
        console.error("AI caption generation error:", error);
        res.status(500).json({ error: "Failed to generate caption" });
    }
};

export const generateEventDescription = async (req, res) => {
    if (!genAI) {
        return res.status(503).json({ error: "AI service not configured" });
    }

    try {
        const { title, theme } = req.body;
        if (!title) {
            return res.status(400).json({ error: "No title provided" });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Generate a short, engaging description for an event titled "${title}"${theme ? ` with theme "${theme}"` : ''}. Keep it under 100 characters.`;

        const result = await model.generateContent(prompt);
        const description = result.response.text().trim();

        res.json({ description });
    } catch (error) {
        console.error("AI description generation error:", error);
        res.status(500).json({ error: "Failed to generate description" });
    }
};
