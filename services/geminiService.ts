import { GoogleGenAI } from "@google/genai";
import { Platform, GENRE_OPTIONS } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API Key is missing. AI features will be disabled.");
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
