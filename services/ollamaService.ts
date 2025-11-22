import { TranslateFn } from '../types';

// Ollama API configuration
const OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2:1b'; // Lightweight model suitable for local use

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
  };
}

export class OllamaService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string = OLLAMA_BASE_URL, model: string = DEFAULT_MODEL) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  /**
   * Check if Ollama is available and running
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.warn('Ollama service not available:', error);
      return false;
    }
  }

  /**
   * Generate image caption using Ollama
   */
  async generateImageCaption(imageBase64: string, t?: TranslateFn): Promise<string> {
    try {
      // For image captioning, we'd need a vision-capable model
      // Since most lightweight models don't support vision, we'll use text-based captioning
      // This is a fallback that generates a generic caption based on event context
      
      const prompt = `Generate a short, descriptive caption (max 10 words) for a photo from a social event. Focus on the mood, atmosphere, or common event elements.`;
      
      const response = await this.generateText(prompt, {
        temperature: 0.7,
        max_tokens: 50
      });
      
      return response || (t ? t('defaultCaption') : 'Event memory');
    } catch (error) {
      console.warn('Ollama caption generation failed:', error);
      return t ? t('defaultCaption') : 'Event memory';
    }
  }

  /**
   * Generate event description using Ollama
   */
  async generateEventDescription(title: string, date: string, type: string): Promise<string> {
    try {
      const prompt = `Write a short, exciting, and inviting description (max 2 sentences) for a ${type} event named "${title}" happening on ${date}. Use emojis. Do not include quotes.`;
      
      const response = await this.generateText(prompt, {
        temperature: 0.8,
        max_tokens: 100
      });
      
      return response || `Join us for ${title} on ${date}!`;
    } catch (error) {
      console.warn('Ollama description generation failed:', error);
      return `Join us for ${title} on ${date}!`;
    }
  }

  /**
   * Generate text using Ollama
   */
  async generateText(prompt: string, options?: {
    temperature?: number;
    max_tokens?: number;
  }): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const requestBody: OllamaGenerateRequest = {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options?.temperature || 0.7,
          max_tokens: options?.max_tokens || 150
        }
      };

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.response) {
          return data.response.trim().replace(/^"|"$/g, '');
        }
      }
      
      throw new Error(`Ollama API error: ${response.status}`);
    } catch (error) {
      console.warn('Ollama text generation failed:', error);
      throw error;
    }
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return data.models?.map((model: any) => model.name) || [];
      }
      return [];
    } catch (error) {
      console.warn('Failed to fetch Ollama models:', error);
      return [];
    }
  }

  /**
   * Switch to a different model
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Change the base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }
}

// Create a singleton instance
export const ollamaService = new OllamaService();

// Export utility functions for easy use
export const generateImageCaptionWithOllama = async (imageBase64: string, t?: TranslateFn): Promise<string> => {
  return ollamaService.generateImageCaption(imageBase64, t);
};

export const generateEventDescriptionWithOllama = async (title: string, date: string, type: string): Promise<string> => {
  return ollamaService.generateEventDescription(title, date, type);
};

export const isOllamaAvailable = async (): Promise<boolean> => {
  return ollamaService.isAvailable();
};
