
import React, { useState, useCallback } from 'react';
import { fileToBase64 } from './utils/fileUtils';
import { editImageWithPrompt } from './services/geminiService';
import { UploadIcon, GenerateIcon, ImageIcon } from './components/icons';

interface ImageData {
  url: string;
  file: File;
}

const ImagePlaceholder: React.FC<{ title: string, isLoading?: boolean }> = ({ title, isLoading = false }) => (
  <div className="w-full h-full bg-gray-800/50 rounded-lg flex flex-col justify-center items-center p-4 aspect-square lg:aspect-[3/4]">
    {isLoading ? (
      <>
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-500"></div>
        <p className="mt-4 text-gray-300 font-semibold">Generating your image...</p>
        <p className="text-sm text-gray-400">This might take a moment.</p>
      </>
    ) : (
      <>
        <ImageIcon className="w-16 h-16 text-gray-500" />
        <p className="mt-2 text-gray-400 font-semibold">{title}</p>
      </>
    )}
  </div>
);

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const url = await fileToBase64(file);
        setOriginalImage({ url, file });
        setEditedImage(null);
        setError(null);
      } catch (err) {
        setError('Failed to load image.');
        console.error(err);
      }
    }
  };
  
  const handleSubmit = useCallback(async () => {
    if (!originalImage || !prompt) {
      setError('Please upload an image and provide a prompt.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setEditedImage(null);

    try {
      const result = await editImageWithPrompt(originalImage.url, originalImage.file.type, prompt);
      setEditedImage(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [originalImage, prompt]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col lg:flex-row font-sans">
      <aside className="w-full lg:w-96 bg-gray-900/80 backdrop-blur-sm border-b lg:border-b-0 lg:border-r border-gray-700/50 p-6 flex-shrink-0">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GenerateIcon className="w-7 h-7 text-blue-400"/>
            Gemini Image Editor
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Transform your images with a simple text prompt.</p>
        </header>

        <div className="space-y-6">
          <div>
            <label htmlFor="image-upload" className="block text-sm font-medium text-gray-300 mb-2">1. Upload Image</label>
            <label
              htmlFor="image-upload-input"
              className="group cursor-pointer w-full h-32 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center hover:border-blue-500 hover:bg-gray-800/50 transition-colors"
            >
              {originalImage ? (
                <img src={originalImage.url} alt="Preview" className="h-full w-full object-cover rounded-md"/>
              ) : (
                <>
                  <UploadIcon className="w-8 h-8 text-gray-500 group-hover:text-blue-500 transition-colors" />
                  <span className="mt-2 text-sm text-gray-400 group-hover:text-blue-400">Click to upload</span>
                </>
              )}
            </label>
            <input id="image-upload-input" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>

          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">2. Describe Your Edit</label>
            <textarea
              id="prompt"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Change the background to a snowy landscape with mountains, add a retro film filter."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-500"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading || !originalImage || !prompt}
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-100 disabled:scale-100"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <GenerateIcon className="w-5 h-5"/>
                Generate Image
              </>
            )}
          </button>
          
          {error && <div className="bg-red-900/50 border border-red-500/50 text-red-300 p-3 rounded-lg text-sm">{error}</div>}
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 h-full">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-gray-300 mb-3 text-center">Original</h2>
            <div className="flex-1">
              {originalImage ? (
                <img src={originalImage.url} alt="Original" className="w-full h-full object-contain rounded-lg bg-black/20" />
              ) : (
                <ImagePlaceholder title="Upload an image to start" />
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-gray-300 mb-3 text-center">Generated</h2>
            <div className="flex-1">
              {editedImage ? (
                <img src={editedImage} alt="Edited" className="w-full h-full object-contain rounded-lg bg-black/20" />
              ) : (
                <ImagePlaceholder title="Your generated image will appear here" isLoading={isLoading} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
