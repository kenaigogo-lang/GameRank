import { GoogleGenAI } from "@google/genai";
import { GENRE_OPTIONS } from "../types";

const getAIClient = () => {
  // Use VITE_API_KEY from environment variables
  // Check if import.meta.env exists to prevent crash in raw browser preview
  const env = (import.meta as any).env || {};
  const apiKey = env.VITE_API_KEY;
  
  if (!apiKey) {
    console.warn("API Key is missing. AI features will be disabled. Please set VITE_API_KEY in Vercel.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const getGameGenre = async (gameTitle: string): Promise<string | null> => {
  const ai = getAIClient();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Classify the video game "${gameTitle}" into exactly one of these Traditional Chinese categories: ${GENRE_OPTIONS.join(', ')}.
      Return ONLY the category name. If it fits multiple, pick the most dominant one.
      Do not add punctuation or extra text.`,
    });

    return response.text?.trim() || null;
  } catch (error) {
    console.error("Error finding game genre:", error);
    return null;
  }
};