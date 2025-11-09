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
        const mimeType = part.inlineData.mimeType;
        generatedImages.push(`data:${mimeType};base64,${base64ImageBytes}`);
      }
    }

    if (generatedImages.length === 0) {
      throw new Error("No images were generated. The model may have refused the request due to safety policies or an inability to fulfill it. Try adjusting your prompt.");
    }
    
    return generatedImages;

  } catch (error) {
    console.error("Detailed error calling Gemini API:", error);
    let friendlyMessage = "An unexpected error occurred while generating the image. Please check the console for details and try again later.";
    
    if (error instanceof Error) {
        if (error.message.includes('API_KEY_INVALID') || error.message.includes('permission_denied')) {
            friendlyMessage = "Image generation failed: The API key is invalid or has been revoked. Please verify your API key.";
        } else if (error.message.toLowerCase().includes('safety') || error.message.toLowerCase().includes('blocked')) {
            friendlyMessage = "Image generation failed: The prompt was blocked due to safety settings. Please modify your prompt and try again.";
        } else if (error.message.includes('404')) {
             friendlyMessage = "Image generation failed: The model name could not be found. Please contact support.";
        } else {
            friendlyMessage = `Image generation failed: ${error.message}`;
        }
    }
    return Promise.reject(friendlyMessage);
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

export const refinePrompt = async (userPrompt: string, locale: 'en' | 'vi'): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const instruction = locale === 'vi' 
        ? `Bạn là một kỹ sư prompt chuyên nghiệp cho các mô hình tạo ảnh AI. Hãy viết lại và mở rộng prompt sau của người dùng để nó trở nên cực kỳ chi tiết và được tối ưu hóa. Thêm các chi tiết cụ thể về ánh sáng, góc máy, phong cách nghệ thuật, bố cục và các thông số kỹ thuật như loại ống kính và độ phân giải. Đầu ra chỉ nên là prompt đã được tinh chỉnh bằng tiếng Việt, không có bất kỳ văn bản trò chuyện hay lời nói đầu nào. Prompt của người dùng: "${userPrompt}"`
        : `You are an expert prompt engineer for AI image generation models. Rewrite and expand the following user's prompt to be highly detailed and optimized. Add specifics about lighting, camera angles, art style, composition, and technical parameters like lens type and resolution. The output should be only the refined prompt, without any conversational text or preamble. User prompt: "${userPrompt}"`;
    
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
        console.error("Detailed error refining prompt:", error);
        let friendlyMessage = "An unexpected error occurred while refining the prompt. Please try again.";
        if (error instanceof Error) {
            if (error.message.includes('API_KEY_INVALID')) {
                friendlyMessage = "Prompt refinement failed: Invalid API key.";
            } else if (error.message.toLowerCase().includes('safety') || error.message.toLowerCase().includes('blocked')) {
                friendlyMessage = "Prompt refinement failed: The request was blocked due to safety settings.";
            } else {
                friendlyMessage = `Prompt refinement failed: ${error.message}`;
            }
        }
        return Promise.reject(friendlyMessage);
    }
};

export const generateNarrative = async (images: ImagePart[], locale: 'en' | 'vi'): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const textPart = { text: locale === 'vi' 
        ? "Dựa trên (các) hình ảnh sau, hãy viết một câu chuyện hoặc mô tả ngắn, gợi cảm và nghệ thuật bằng tiếng Việt. Nắm bắt tâm trạng, bối cảnh và câu chuyện tiềm ẩn đằng sau hình ảnh."
        : "Based on the following image(s), write a short, evocative, and artistic story or description. Capture the mood, setting, and potential narrative behind the visuals." };
        
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
        console.error("Detailed error generating narrative:", error);
        let friendlyMessage = "An unexpected error occurred while generating the narrative. Please try again.";
        if (error instanceof Error) {
            if (error.message.includes('API_KEY_INVALID')) {
                friendlyMessage = "Narrative generation failed: Invalid API key.";
            } else if (error.message.toLowerCase().includes('safety') || error.message.toLowerCase().includes('blocked')) {
                friendlyMessage = "Narrative generation failed: The request was blocked due to safety settings.";
            } else {
                friendlyMessage = `Narrative generation failed: ${error.message}`;
            }
        }
        return Promise.reject(friendlyMessage);
    }
};
