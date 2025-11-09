import { GoogleGenAI, Modality } from "@google/genai";

// --- START: IndexedDB Service ---
const DB_NAME = 'DannzStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'keyValueStorage';

let db: IDBDatabase | null = null;

/**
 * Opens and initializes the IndexedDB database.
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(new Error('Failed to open IndexedDB.'));
    };

    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

/**
 * Saves data to IndexedDB, mimicking localStorage.setItem.
 * @param key The key to store the data under.
 * @param data The data to be stored.
 */
export const saveData = async (key: string, data: any): Promise<void> => {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ key, data }); 

    request.onerror = () => {
      console.error('Failed to save data to IDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
};

/**
 * Loads data from IndexedDB, mimicking localStorage.getItem.
 * @param key The key of the data to retrieve.
 * @returns The stored data, or null if not found.
 */
export const loadData = async (key: string): Promise<any | null> => {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => {
      console.error('Failed to load data from IDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.data);
      } else {
        resolve(null);
      }
    };
  });
};
// --- END: IndexedDB Service ---


export interface ImagePart {
  mimeType: string;
  data: string; // base64 string without the data URL prefix
}

export type StructureMode = 'none' | 'canny' | 'depth' | 'pose';

export interface GenerationConfig {
  seed?: number;
  stylePromptSnippet?: string;
  structureReferenceImage?: ImagePart;
  structureMode?: StructureMode;
}

const callGemini = async (prompt: string, imageParts: { inlineData: { mimeType: string, data: string } }[], config: GenerationConfig): Promise<string[]> => {
  if (!process.env.API_KEY) {
    throw new Error("The API_KEY environment variable is not set.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const textPart = { text: prompt };
  
  let parts: (object)[] = [textPart, ...imageParts];

  if (config.structureReferenceImage && config.structureMode && config.structureMode !== 'none') {
    const structureInstruction = `Use the provided image as a structural reference. Extract the ${config.structureMode} map (edges for canny, depth for depth, skeleton for pose) to control the composition and pose of the output image. The style should follow the main text prompt.`;
    parts = [
      { text: structureInstruction },
      { inlineData: { mimeType: config.structureReferenceImage.mimeType, data: config.structureReferenceImage.data } },
      ...parts
    ];
  }
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts as any },
      config: {
          responseModalities: [Modality.IMAGE],
          ...(config.seed !== undefined && { seed: config.seed }),
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
  config: GenerationConfig,
): Promise<string[]> => {
    let fullPrompt = prompt;
    if (config.stylePromptSnippet) {
      fullPrompt = `${config.stylePromptSnippet}, ${prompt}`;
    }

    const imageParts = images.map(img => ({
        inlineData: {
            mimeType: img.mimeType,
            data: img.data,
        },
    }));
    return callGemini(fullPrompt, imageParts, config);
};

export const upscaleImage = async (image: ImagePart, upscaleFactor: number, refinePrompt: string): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let upscalePrompt = `Upscale this image by ${upscaleFactor}x and add high-frequency details. Focus on ${refinePrompt}.`;
    
    try {
        const parts = [{ text: upscalePrompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }];
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: parts as any },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const upscaledImage = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        const mimeType = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.mimeType;

        if (!upscaledImage || !mimeType) {
            throw new Error("Upscale/Refine model did not return an image.");
        }
        return `data:${mimeType};base64,${upscaledImage}`;
    } catch (error) {
        console.error("Detailed error during Super Resolution:", error);
        return Promise.reject("Failed to perform AI Super Resolution. Check API response.");
    }
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

export const analyzelmageStyleAndGeneratePrompt = async (image: ImagePart): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemInstruction = "You are an AI style analyst. Analyze the provided image and generate a detailed, comma-separated prompt snippet (under 50 words) describing its artistic style, color palette, lighting, texture, and composition. The output must be ready to be prepended to a user's prompt for image generation. DO NOT include any conversational text or formatting. Start directly with the prompt snippet.";
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: systemInstruction },
                    { inlineData: { mimeType: image.mimeType, data: image.data } }
                ]
            },
        });
        
        const stylePrompt = response.text.trim();
        if (!stylePrompt) {
            throw new Error("Style analysis model did not return a prompt.");
        }
        return stylePrompt;
    } catch (error) {
        console.error("Detailed error during style analysis:", error);
        return Promise.reject("Failed to analyze image style. Check API response.");
    }
};

// --- START: Prompt Analysis Service ---
export interface PromptAnalysisResult {
    score: number;
    suggestions: string[];
    negativeSuggestions: string[];
    conflictDetected: boolean;
    conflictReason: string;
}

export const analyzeAndScorePrompt = async (prompt: string, styleSnippet: string | null): Promise<PromptAnalysisResult> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const analysisPrompt = `Analyze the following user prompt for image generation, considering the optional style snippet provided:
    
    User Prompt: "${prompt}"
    Style Snippet (if available): "${styleSnippet || 'None'}"
    
    Task:
    1. Score the prompt's quality from 0.0 to 1.0 (1.0 being perfect).
    2. Suggest 3-5 keywords to make the prompt more detailed.
    3. Suggest 3-5 negative keywords for the Negative Prompt (e.g., 'bad anatomy', 'deformed').
    4. Detect if there is a severe conflict between the User Prompt and the Style Snippet (e.g., photorealistic prompt with cartoon style snippet).
    
    Return the result in a strict JSON format (no extra text, no markdown block quotes):
    {
      "score": number, 
      "suggestions": ["suggestion1", "suggestion2"], 
      "negativeSuggestions": ["neg1", "neg2"], 
      "conflictDetected": boolean, 
      "conflictReason": string 
    }`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [{ parts: [{ text: analysisPrompt }] }],
            config: { 
                responseMimeType: "application/json" 
            } 
        });

        const resultText = response.text.trim().replace(/^```json|```$/g, '').trim();
        return JSON.parse(resultText) as PromptAnalysisResult;
        
    } catch (error) {
        console.error("Detailed error during prompt analysis:", error);
        return Promise.reject("Failed to analyze prompt. Check API response or JSON format.");
    }
};
// --- END: Prompt Analysis Service ---


// --- START: Material Generation Service ---

const generateMaterialMap = async (prompt: string, image: ImagePart): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("The API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const parts = [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }];
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: parts as any },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const resultImage = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        const mimeType = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.mimeType;

        if (!resultImage || !mimeType) {
            throw new Error("Material generation model did not return an image.");
        }
        return `data:${mimeType};base64,${resultImage}`;
    } catch (error) {
        console.error("Detailed error during material generation:", error);
        return Promise.reject("Failed to generate material. Check API response.");
    }
};

export const generateSeamlessTexture = async (image: ImagePart): Promise<string> => {
    const prompt = "From the given image snippet, generate a high-quality, seamless, tileable PBR texture. The output should be only the albedo/color map, perfectly tileable on all four sides.";
    return generateMaterialMap(prompt, image);
};

export const generateNormalMap = async (texture: ImagePart): Promise<string> => {
    const prompt = "From this albedo texture image, generate a high-quality, tangent space normal map suitable for a PBR workflow in a game engine. The output should only be the normal map image, with correct blue/purple coloration.";
    return generateMaterialMap(prompt, texture);
};

export const generateDisplacementMap = async (texture: ImagePart): Promise<string> => {
    const prompt = "From this albedo texture image, generate a corresponding height map (displacement map) suitable for a PBR workflow. The output should be a grayscale image where white represents the highest points and black represents the lowest points. The output should only be the displacement map image.";
    return generateMaterialMap(prompt, texture);
};
// --- END: Material Generation Service ---
