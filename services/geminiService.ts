import { GoogleGenAI, Modality } from "@google/genai";

export interface ImagePart {
  mimeType: string;
  data: string; // base64 string without the data URL prefix
}

const callGemini = async (prompt: string, imageParts: { inlineData: { mimeType: string, data: string } }[]): Promise<string[]> => {
  if (!process.env.API_KEY) {
    throw new Error("The API_KEY environment variable is not set.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const textPart = { text: prompt };
  
  // The prompt must be the first part
  const parts = [textPart, ...imageParts];
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts },
      config: {
          responseModalities: [Modality.IMAGE],
      },
    });

    const generatedImages: string[] = [];
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        // The model returns jpeg, so we can hardcode the mime type
        generatedImages.push(`data:image/jpeg;base64,${base64ImageBytes}`);
      }
    }

    if (generatedImages.length === 0) {
      throw new Error("No images were generated. The model may have refused the request due to safety policies or an inability to fulfill it. Try adjusting your prompt.");
    }
    
    return generatedImages;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        return Promise.reject(`Error generating image: ${error.message}`);
    }
    return Promise.reject("An unknown error occurred while generating the image.");
  }
};


export const generateImageWithPromptAndImages = async (
  prompt: string,
  images: ImagePart[],
): Promise<string[]> => {
    const imageParts = images.map(img => ({
        inlineData: {
            mimeType: img.mimeType,
            data: img.data,
        },
    }));
    return callGemini(prompt, imageParts);
};

export const upscaleImage = async (base64Image: string): Promise<string[]> => {
    const prompt = "Upscale this image to the highest possible resolution, enhancing details, sharpness and clarity without altering the content or style. Aim for 8K quality.";
    
    const imagePart = {
        inlineData: {
            // Extract mime type from data URL, default to jpeg
            mimeType: base64Image.match(/data:(.*);base64/)?.[1] || 'image/jpeg',
            data: base64Image.split(',')[1],
        }
    };

    return callGemini(prompt, [imagePart]);
};

export const refinePrompt = async (userPrompt: string): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const instruction = `You are an expert prompt engineer for AI image generation models. Rewrite and expand the following user's prompt to be highly detailed and optimized. Add specifics about lighting, camera angles, art style, composition, and technical parameters like lens type and resolution. The output should be only the refined prompt, without any conversational text or preamble. User prompt: "${userPrompt}"`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Use a text model
            contents: instruction,
        });

        const refinedText = response.text.trim();
        if (!refinedText) {
            throw new Error("The model did not return a refined prompt.");
        }
        return refinedText;
    } catch (error) {
        console.error("Error refining prompt:", error);
        if (error instanceof Error) {
            return Promise.reject(`Error refining prompt: ${error.message}`);
        }
        return Promise.reject("An unknown error occurred while refining the prompt.");
    }
};

export const generateNarrative = async (images: ImagePart[]): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const textPart = { text: "Based on the following image(s), write a short, evocative, and artistic story or description. Capture the mood, setting, and potential narrative behind the visuals." };
    const imagePartsForApi = images.map(img => ({
        inlineData: {
            mimeType: img.mimeType,
            data: img.data,
        },
    }));

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // text model that can see images
            contents: { parts: [textPart, ...imagePartsForApi] },
        });

        const narrative = response.text.trim();
        if (!narrative) {
            throw new Error("The model did not return a narrative.");
        }
        return narrative;
    } catch (error) {
        console.error("Error generating narrative:", error);
        if (error instanceof Error) {
            return Promise.reject(`Error generating narrative: ${error.message}`);
        }
        return Promise.reject("An unknown error occurred while generating the narrative.");
    }
};