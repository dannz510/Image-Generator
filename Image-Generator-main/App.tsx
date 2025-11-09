
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { generateImageWithPromptAndImages, upscaleImage, refinePrompt, generateNarrative } from './services/geminiService';
import { translations } from './translations';
import { 
    GenerateIcon, ImageIcon, DownloadIcon, CloseIcon, UploadIcon, HistoryIcon, UpscaleIcon, CropIcon, RefineIcon, SaveIcon, FilterIcon, 
    RemixIcon, ExpandIcon, FixIcon, LockClosedIcon, QueueListIcon, CpuChipIcon, Squares2X2Icon, PrinterIcon, FolderIcon, TagIcon, 
    FolderPlusIcon, SearchIcon, MicrophoneIcon, PencilSquareIcon, BeakerIcon, GlobeAltIcon, BookOpenIcon, AdjustmentsHorizontalIcon, 
    ArrowsRightLeftIcon, CameraIcon, SparklesIcon, LanguageIcon, SunIcon, MoonIcon, BrushIcon, UserPlusIcon,
    HomeIcon, CogIcon, QuestionMarkCircleIcon, StarIcon, TrashIcon, CodeBracketSquareIcon, ArrowLeftIcon, ClipboardIcon, BookmarkSquareIcon
} from './components/icons';
import { fileToBase64 } from './utils/fileUtils';

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

type Locale = 'en' | 'vi';
type ActiveView = 'generator' | 'gallery' | 'favorites' | 'settings' | 'about';

// Utility function to get cropped image data URL
function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<string> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('Failed to get canvas context'));
  }

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = crop.width * pixelRatio;
  canvas.height = crop.height * pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width,
    crop.height,
  );
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
             resolve(reader.result as string);
        };
      },
      'image/jpeg',
      0.95
    );
  });
}

const CropperModal: React.FC<{ imageSrc: string; onClose: () => void; onCrop: (croppedImageUrl: string) => void; t: (key: keyof typeof translations) => string;}> = ({ imageSrc, onClose, onCrop, t }) => {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height));
    }

    const handleApplyCrop = async () => {
        if (!completedCrop || !imgRef.current) return;
        try {
            const croppedImageUrl = await getCroppedImg(imgRef.current, completedCrop);
            onCrop(croppedImageUrl);
        } catch (e) { console.error(e); }
    };
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('cropImageTitle')}</h2><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 flex-1 overflow-y-auto flex justify-center items-center bg-gray-100 dark:bg-gray-900/50"><ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}><img ref={imgRef} src={imageSrc} onLoad={onImageLoad} style={{ maxHeight: '60vh' }} alt="Crop preview" /></ReactCrop></div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button><button onClick={handleApplyCrop} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors">{t('applyCropButton')}</button></div>
            </div>
        </div>
    );
};

const AdvancedEditModal: React.FC<{
    imageSrc: string;
    onClose: () => void;
    onSave: (editedUrl: string) => void;
    t: (key: keyof typeof translations) => string;
}> = ({ imageSrc, onClose, onSave, t }) => {
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [saturation, setSaturation] = useState(100);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const applyFilters = useCallback(() => {
        const canvas = canvasRef.current;
        const image = imageRef.current;
        if (canvas && image) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
                ctx.drawImage(image, 0, 0);
            }
        }
    }, [brightness, contrast, saturation]);

    useEffect(() => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = imageSrc;
        image.onload = () => {
            imageRef.current = image;
            applyFilters();
        };
    }, [imageSrc, applyFilters]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            onSave(canvas.toDataURL('image/jpeg', 0.95));
        }
    };
    
    const handleReset = () => {
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row">
                <div className="flex-[3] p-4 flex justify-center items-center bg-gray-100 dark:bg-black/20 rounded-t-lg md:rounded-l-lg md:rounded-t-none">
                    <canvas ref={canvasRef} className="max-w-full max-h-[80vh] object-contain" />
                </div>
                <div className="flex-[1] p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('advancedEditTitle')}</h2>
                        <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button>
                    </div>
                    <div className="space-y-4 flex-1 overflow-y-auto pr-2 -mr-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between"><span>{t('brightness')}</span><span>{brightness}%</span></label>
                            <input type="range" min="0" max="200" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between"><span>{t('contrast')}</span><span>{contrast}%</span></label>
                            <input type="range" min="0" max="200" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex justify-between"><span>{t('saturation')}</span><span>{saturation}%</span></label>
                            <input type="range" min="0" max="200" value={saturation} onChange={e => setSaturation(Number(e.target.value))} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                    </div>
                    <div className="mt-auto pt-4 flex flex-col gap-2">
                        <button onClick={handleReset} className="w-full bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">{t('resetButton')}</button>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="flex-1 bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button>
                            <button onClick={handleSave} className="flex-1 bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors">{t('applyButton')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EditImageModal: React.FC<{
    imageSrc: string;
    onClose: () => void;
    onSave: (prompt: string) => void;
    t: (key: keyof typeof translations) => string;
    titleKey: keyof typeof translations;
    descriptionKey: keyof typeof translations;
    placeholderKey: keyof typeof translations;
}> = ({ imageSrc, onClose, onSave, t, titleKey, descriptionKey, placeholderKey }) => {
    const [editPrompt, setEditPrompt] = useState('');
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-xl flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t(titleKey)}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{t(descriptionKey)}</p>
                </div>
                <div className="p-6 space-y-4">
                    <img src={imageSrc} className="rounded-md max-h-[40vh] w-full object-contain" />
                    <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder={t(placeholderKey)} className="w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-sm rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500" rows={3}/>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg">
                    <button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button>
                    <button onClick={() => onSave(editPrompt)} disabled={!editPrompt.trim()} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">{t('generateButton')}</button>
                </div>
            </div>
        </div>
    );
};


const SketchModal: React.FC<{ onClose: () => void; onSave: (dataUrl: string) => void; t: (key: keyof typeof translations) => string; }> = ({ onClose, onSave, t }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const isDark = document.documentElement.classList.contains('dark');
                ctx.fillStyle = isDark ? "#1f2937" : "#f9fafb";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = isDark ? "white" : "black";
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
            }
        }
    }, []);

    const startDrawing = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement>) => {
        const { offsetX, offsetY } = nativeEvent;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(offsetX, offsetY);
            setIsDrawing(true);
        }
    };
    const stopDrawing = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.closePath();
        setIsDrawing(false);
    };
    const draw = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = nativeEvent;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.lineTo(offsetX, offsetY);
            ctx.stroke();
        }
    };
    const handleSave = () => { onSave(canvasRef.current?.toDataURL('image/png') ?? ''); };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('sketchPoseTitle')}</h2><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 bg-gray-50 dark:bg-gray-900/50"><canvas ref={canvasRef} width="400" height="400" className="bg-gray-100 dark:bg-gray-900 rounded-md cursor-crosshair w-full" onMouseDown={startDrawing} onMouseUp={stopDrawing} onMouseOut={stopDrawing} onMouseMove={draw}></canvas></div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button><button onClick={handleSave} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors">{t('useSketchButton')}</button></div>
            </div>
        </div>
    );
};

const AddObjectSketchModal: React.FC<{ imageSrc: string; onClose: () => void; onSave: (mask: string, prompt: string) => void; t: (key: keyof typeof translations) => string; }> = ({ imageSrc, onClose, onSave, t }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [objectPrompt, setObjectPrompt] = useState('');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                if(ctx) {
                    ctx.drawImage(img, 0, 0);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                    ctx.lineWidth = Math.max(8, img.width / 50); // Responsive brush size
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                }
            };
            img.src = imageSrc;
        }
    }, [imageSrc]);

    const startDrawing = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement>) => {
        const { offsetX, offsetY } = nativeEvent;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (offsetX / rect.width) * canvas.width;
        const y = (offsetY / rect.height) * canvas.height;
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            setIsDrawing(true);
        }
    };
    const stopDrawing = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
             ctx.closePath();
             // Fill the shape to create a solid mask area
             if (ctx.isPointInPath(0,0) === false) { // A heuristic to check if it's a closed-enough path
                ctx.fill();
             }
        }
        setIsDrawing(false);
    };
    const draw = ({ nativeEvent }: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = nativeEvent;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (offsetX / rect.width) * canvas.width;
        const y = (offsetY / rect.height) * canvas.height;
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };
    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas || !objectPrompt.trim()) return;
        onSave(canvas.toDataURL('image/png'), objectPrompt);
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col">
                 <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('addObjectSketchTitle')}</h2><p className="text-sm text-gray-600 dark:text-gray-400">{t('addObjectSketchDescription')}</p></div>
                <div className="p-6 bg-gray-100 dark:bg-gray-900/50">
                    <canvas ref={canvasRef} className="rounded-md cursor-crosshair w-full h-auto" style={{maxHeight: '50vh', aspectRatio: 'auto'}} onMouseDown={startDrawing} onMouseUp={stopDrawing} onMouseOut={stopDrawing} onMouseMove={draw}></canvas>
                    <input type="text" value={objectPrompt} onChange={e => setObjectPrompt(e.target.value)} placeholder={t('addObjectSketchPlaceholder')} className="mt-4 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"/>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button><button onClick={handleSave} disabled={!objectPrompt.trim()} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">{t('addButton')}</button></div>
            </div>
        </div>
    )
};

const AddPersonModal: React.FC<{ baseImageSrc: string, onSave: (imageToAdd: {file: File, base64: string}, prompt: string) => void, onClose: ()=> void, t: (key: keyof typeof translations) => string;}> = ({ baseImageSrc, onSave, onClose, t}) => {
    const [imageToAdd, setImageToAdd] = useState<{file: File, base64: string} | null>(null);
    const [addPersonPrompt, setAddPersonPrompt] = useState('');
    const addImageInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const base64 = await fileToBase64(file);
            setImageToAdd({file, base64});
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
             <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-2xl flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('addPersonTitle')}</h2><p className="text-sm text-gray-600 dark:text-gray-400">{t('addPersonDescription')}</p></div>
                <div className="p-6 grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">{t('originalImage')}</p>
                        <img src={baseImageSrc} className="rounded-md" />
                    </div>
                     <div>
                        <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">{t('imageToAdd')}</p>
                        <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" ref={addImageInputRef} />
                        {imageToAdd ? <img src={imageToAdd.base64} className="rounded-md" /> : <button onClick={()=>addImageInputRef.current?.click()} className="w-full h-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50"><UploadIcon className="w-8 h-8" /><span className="text-sm mt-2">{t('selectImageButton')}</span></button>}
                    </div>
                </div>
                <div className="px-6 pb-6">
                     <input type="text" value={addPersonPrompt} onChange={e => setAddPersonPrompt(e.target.value)} placeholder={t('addPersonPlaceholder')} className="mt-4 w-full bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-sm rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"/>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button><button onClick={()=> imageToAdd && onSave(imageToAdd, addPersonPrompt)} disabled={!imageToAdd || !addPersonPrompt.trim()} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">{t('addButton')}</button></div>
            </div>
        </div>
    )
}


const NarrativeModal: React.FC<{ images: GeneratedImage[]; onClose: () => void; t: (key: keyof typeof translations) => string; locale: Locale; }> = ({ images, onClose, t, locale }) => {
    const [narrative, setNarrative] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const generate = async () => {
            try {
                const imageParts = images.map(img => ({
                    mimeType: img.src.match(/data:(.*);base64/)?.[1] || 'image/jpeg',
                    data: img.src.split(',')[1]
                }));
                const result = await generateNarrative(imageParts, locale);
                setNarrative(result);
            } catch (err) {
                setNarrative(err instanceof Error ? err.message : "Failed to generate narrative.");
            } finally {
                setIsLoading(false);
            }
        };
        generate();
    }, [images, locale]);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('narrativeGeneratorTitle')}</h2><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {isLoading ? <div className="text-center py-8"><div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-cyan-400 mx-auto"></div><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('narrativeLoading')}</p></div> : <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{narrative}</p>}
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors">{t('closeButton')}</button></div>
            </div>
        </div>
    );
};


const DEFAULT_PROMPT = `A vertical frame 2160x3840 pixels (4K). A triptych of three equally sized horizontal images. The main character is a young man with glasses, sad and nostalgic expression, deep lonely eyes, wearing a loose winter puffer set, wide-leg pants, and a black scarf. The atmosphere is snowy and cold, with a melancholic color palette.
Image 1 (portrait): Character holds a transparent umbrella, looking back at the frame sorrowfully. Background is blurred white snow.
Image 2 (full body): Character with umbrella, alone in a vast snowy field, looking up to catch snowflakes. Shot from above. Distant bare trees. Conveys smallness and isolation.
Image 3 (close-up): Zoomed-in on the character's sorrowful, yearning eyes.`;
interface UploadedImage { file: File; base64: string; }
interface GeneratedImage { id: string; src: string; tags: string[]; generationTime?: number; isFavorite?: boolean; prompt: string; negativePrompt: string; settings: any;}
interface GalleryImage { id: string; src: string; prompt: string; negativePrompt: string; settings: any; generationTime?: number; historyId: string; imageId: string; }
interface HistoryItem { id: string; prompt: string; negativePrompt: string; uploadedImages: UploadedImage[]; generatedImages: (Omit<GeneratedImage, 'prompt' | 'negativePrompt' | 'settings'>)[]; settings: any; tags: string[]; folderId?: string; }
interface Folder { id: string; name: string; }
interface StyleProfile {
  id: string;
  name: string;
  prompt: string;
  negativePrompt: string;
  baseModel: string;
  cameraSensor: string;
  stylisticBudget: number;
  consistencyLock: boolean;
  aspectRatio: string;
  faceLockIntensity: number;
  preserveGlasses: boolean;
  controlNetType: 'OpenPose' | 'Depth Map' | 'Canny Edge';
  simulatedForce: number;
}
const HISTORY_LIMIT = 20;
const GALLERY_LIMIT = 25;


const Placeholder: React.FC<{ isLoading?: boolean, seriesProgress?: {current: number, total: number}, t: (key: keyof typeof translations) => string; }> = ({ isLoading = false, seriesProgress, t }) => (
  <div className="w-full h-full min-h-[400px] max-w-7xl bg-gray-200/50 dark:bg-gray-800/20 rounded-lg flex flex-col justify-center items-center p-8 text-center border border-gray-200 dark:border-gray-700/50 transition-all duration-300">
    {isLoading ? (
      <>
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-cyan-500"></div>
        <p className="mt-4 text-gray-800 dark:text-gray-200 font-semibold text-lg">{seriesProgress ? `${t('generatingSeries')} (${seriesProgress.current}/${seriesProgress.total})` : t('generatingVision')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('pleaseWait')}</p>
      </>
    ) : (
      <>
        <ImageIcon className="w-24 h-24 text-gray-300 dark:text-gray-700" />
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400 font-semibold">{t('viewport')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">{t('viewportDescription')}</p>
      </>
    )}
  </div>
);

const HistoryModal: React.FC<{ history: HistoryItem[]; folders: Folder[]; onClose: () => void; onUpdateHistory: (updatedHistory: HistoryItem[]) => void; onUpdateFolders: (updatedFolders: Folder[]) => void; t: (key: keyof typeof translations) => string; }> = ({ history, folders, onClose, onUpdateHistory, onUpdateFolders, t }) => {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newFolderName, setNewFolderName] = useState('');

    const handleAddFolder = () => {
        if (newFolderName.trim()) {
            onUpdateFolders([...folders, { id: Date.now().toString(), name: newFolderName.trim() }]);
            setNewFolderName('');
        }
    };
    
    const handleDeleteFolder = (folderId: string) => {
        if (!window.confirm(t('deleteProjectConfirmation'))) return;
        onUpdateFolders(folders.filter(f => f.id !== folderId));
        onUpdateHistory(history.map(item => item.folderId === folderId ? { ...item, folderId: undefined } : item));
    };

    const handleMoveItemToFolder = (itemId: string, folderId: string) => {
        onUpdateHistory(history.map(item => item.id === itemId ? { ...item, folderId: folderId || undefined } : item));
    };

    const handleDeleteHistoryItem = (itemId: string) => {
        if (!window.confirm(t('deleteHistoryConfirmation'))) return;
        onUpdateHistory(history.filter(item => item.id !== itemId));
    };

    const filteredHistory = useMemo(() => {
        return [...history].reverse().filter(item => {
            const inFolder = activeFolderId ? item.folderId === activeFolderId : true;
            const matchesSearch = searchTerm.toLowerCase() ? item.prompt.toLowerCase().includes(searchTerm.toLowerCase()) || item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())) : true;
            return inFolder && matchesSearch;
        });
    }, [history, activeFolderId, searchTerm]);

    return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-start p-4 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-7xl my-8 flex h-[90vh]">
             <div className="w-64 bg-gray-50 dark:bg-black/20 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('projects')}</h3>
                <button onClick={() => setActiveFolderId(null)} className={`w-full text-left p-2 rounded-md text-sm mb-2 transition-colors ${!activeFolderId ? 'bg-cyan-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>{t('allGenerations')}</button>
                <div className="flex-1 overflow-y-auto pr-1 -mr-2">{folders.map(folder => (<div key={folder.id} className="group flex items-center justify-between"><button onClick={() => setActiveFolderId(folder.id)} className={`flex-1 text-left p-2 rounded-md text-sm flex items-center gap-2 transition-colors ${activeFolderId === folder.id ? 'bg-cyan-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}><FolderIcon className="w-4 h-4" /> {folder.name}</button><button onClick={() => handleDeleteFolder(folder.id)} className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"><TrashIcon className="w-4 h-4" /></button></div>))}</div>
                <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700"><div className="flex gap-2"><input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder={t('newProjectPlaceholder')} className="flex-1 bg-gray-200 dark:bg-gray-700 text-xs rounded-md p-2 border-gray-300 dark:border-gray-600 focus:ring-cyan-500 focus:border-cyan-500" /><button onClick={handleAddFolder} className="bg-cyan-600 p-2 rounded-md hover:bg-cyan-700 text-white"><FolderPlusIcon className="w-5 h-5"/></button></div></div>
             </div>
             <div className="flex-1 flex flex-col">
                <div className="sticky top-0 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm z-10 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('historyTitle')}</h2><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 relative bg-white dark:bg-gray-800"><SearchIcon className="w-5 h-5 text-gray-400 absolute top-9 left-9" /><input type="text" placeholder={t('searchPlaceholder')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded-lg p-2 pl-10 mb-6 text-sm text-gray-800 dark:text-gray-200"/></div>
                <div className="px-6 pb-6 flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                    {filteredHistory.length === 0 ? <p className="text-gray-500 dark:text-gray-400 text-center py-8">{t('noHistoryFound')}</p> : filteredHistory.map(item => (
                        <details key={item.id} className="bg-gray-100 dark:bg-gray-900/50 p-4 rounded-lg mb-4 group/history">
                            <summary className="cursor-pointer font-semibold text-gray-800 dark:text-gray-200 hover:text-cyan-500 dark:hover:text-cyan-400 flex justify-between items-center"><span>{t('generatedOn')} {new Date(parseInt(item.id)).toLocaleString()}</span> <button onClick={(e) => { e.preventDefault(); handleDeleteHistoryItem(item.id); }} className="p-1 opacity-0 group-hover/history:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"><TrashIcon className="w-4 h-4" /></button></summary>
                            <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4"><h4 className="font-bold text-gray-700 dark:text-gray-300">{t('promptLabel')}:</h4><p className="text-sm text-gray-600 dark:text-gray-400 mb-2 font-mono whitespace-pre-wrap p-2 bg-black/5 dark:bg-black/20 rounded-md">{item.prompt}</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">{item.generatedImages.map((img, idx) => <img key={idx} src={img.src} className="rounded-md" alt={`Generated ${idx}`} />)}</div>
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/50 flex items-center gap-2"><label htmlFor={`folder-select-${item.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('moveToFolderLabel')}</label><select id={`folder-select-${item.id}`} value={item.folderId || ''} onChange={(e) => handleMoveItemToFolder(item.id, e.target.value)} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm rounded-lg p-1.5 focus:ring-cyan-500 focus:border-cyan-500"><option value="">{t('noFolder')}</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div></div>
                        </details>
                    ))}
                </div>
             </div>
        </div>
    </div>
    )
};

const FILTERS: { [key: string]: string } = { 'none': '', 'sepia': 'sepia(1)', 'grayscale': 'grayscale(1)', 'vintage': 'sepia(0.6) contrast(1.1) brightness(0.9) saturate(1.2)' };
const PrintExportModal: React.FC<{ imageSrc: string; onClose: () => void; t: (key: keyof typeof translations) => string; }> = ({ imageSrc, onClose, t }) => {
    const [dpi, setDpi] = useState(300);
    const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const img = new Image();
        img.onload = () => { setDimensions({ width: img.naturalWidth / dpi, height: img.naturalHeight / dpi }); };
        img.src = imageSrc;
    }, [imageSrc, dpi]);

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageSrc; link.download = `dannz_print_ready_${Date.now()}.${format}`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-lg">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('printExportTitle')}</h2><button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 space-y-4 bg-gray-50 dark:bg-gray-900/50">
                    <img src={imageSrc} alt="Export preview" className="max-h-64 w-full object-contain rounded-md bg-black/10 dark:bg-black/20" />
                    <div><label htmlFor="dpi-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('resolutionDPI')}</label><input id="dpi-input" type="number" value={dpi} onChange={e => setDpi(parseInt(e.target.value) || 72)} className="mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2" /></div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/50 p-3 rounded-lg">{t('printSizeLabel')}: <span className="font-bold text-gray-900 dark:text-white">{dimensions.width.toFixed(2)}" x {dimensions.height.toFixed(2)}"</span></div>
                    <div><label htmlFor="format-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('formatLabel')}</label><select id="format-select" value={format} onChange={e => setFormat(e.target.value as 'jpeg' | 'png')} className="mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2"><option value="jpeg">{t('formatJPEG')}</option><option value="png">{t('formatPNG')}</option></select></div>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg"><button onClick={onClose} className="bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors">{t('cancelButton')}</button><button onClick={handleDownload} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700 transition-colors">{t('exportButton')}</button></div>
            </div>
        </div>
    );
};

const Accordion: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-3 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors"
            >
                <span>{title}</span>
                <svg
                    className={`w-4 h-4 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className="p-4 bg-gray-50 dark:bg-black/20">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

const Tooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => (
    <div className="relative group/tooltip flex items-center">
        {children}
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-auto p-2 bg-black/80 text-white text-xs rounded-md shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50 pointer-events-none">
            {content}
        </div>
    </div>
);

const FilterDropdown: React.FC<{
    onSelect: (filter: string) => void;
    t: (key: keyof typeof translations) => string;
}> = ({ onSelect, t }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (filter: string) => {
        onSelect(filter);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Tooltip content={t('filter')}>
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"
                >
                    <FilterIcon className="w-4 h-4"/>
                </button>
            </Tooltip>
            {isOpen && (
                <div className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 w-32 bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-md shadow-lg z-10">
                    <a onClick={() => handleSelect('none')} className="block px-4 py-2 text-xs text-gray-200 hover:bg-cyan-500/50 cursor-pointer rounded-t-md">None</a>
                    <a onClick={() => handleSelect('sepia')} className="block px-4 py-2 text-xs text-gray-200 hover:bg-cyan-500/50 cursor-pointer">Sepia</a>
                    <a onClick={() => handleSelect('grayscale')} className="block px-4 py-2 text-xs text-gray-200 hover:bg-cyan-500/50 cursor-pointer">Grayscale</a>
                    <a onClick={() => handleSelect('vintage')} className="block px-4 py-2 text-xs text-gray-200 hover:bg-cyan-500/50 cursor-pointer rounded-b-md">Vintage</a>
                </div>
            )}
        </div>
    );
};


const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [negativePrompt, setNegativePrompt] = useState<string>('bad anatomy, extra limbs, blurry, watermark, text, signature');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [controlNetImage, setControlNetImage] = useState<UploadedImage | null>(null);
  const [generatedImages, setGeneratedImages] = useState<(Omit<GeneratedImage, 'prompt' | 'negativePrompt' | 'settings'>)[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [croppingImage, setCroppingImage] = useState<{ src: string; index: number, historyId: string, imageId: string } | null>(null);
  const [printExportImage, setPrintExportImage] = useState<string | null>(null);
  const [activeLab, setActiveLab] = useState('core');

  // New Features State
  const [userId, setUserId] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [editingImage, setEditingImage] = useState<{src: string, index: number, id: string} | null>(null);
  const [advancedEditingImage, setAdvancedEditingImage] = useState<{src: string, index: number, historyId: string, imageId: string} | null>(null);
  const [showAddObjectSketch, setShowAddObjectSketch] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('generator');
  const [copied, setCopied] = useState(false);
  
  const [remixingImage, setRemixingImage] = useState<(Omit<GeneratedImage, 'prompt'|'negativePrompt'|'settings'> & { index: number }) | null>(null);
  const [expandingImage, setExpandingImage] = useState<(Omit<GeneratedImage, 'prompt'|'negativePrompt'|'settings'> & { index: number }) | null>(null);
  const [fixingImage, setFixingImage] = useState<(Omit<GeneratedImage, 'prompt'|'negativePrompt'|'settings'> & { index: number }) | null>(null);

  // Gallery State
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [viewingGalleryImage, setViewingGalleryImage] = useState<GalleryImage | null>(null);
  
  // Granular Processing State
  const [processingImages, setProcessingImages] = useState<Map<string, string>>(new Map());


  // Responsive state
  const [isControlsOpen, setIsControlsOpen] = useState(false);

  // i18n helper
  const t = useCallback((key: keyof typeof translations) => {
    return translations[key][locale] || translations[key]['en'];
  }, [locale]);

  useEffect(() => {
    const doc = document.documentElement;
    if (theme === 'dark') {
      doc.classList.add('dark');
      doc.classList.remove('light');
    } else {
      doc.classList.add('light');
      doc.classList.remove('dark');
    }
    localStorage.setItem('dannz-theme', theme);
    doc.lang = locale;
  }, [theme, locale]);

  // Voice Prompt
  const [isListening, setIsListening] = useState(false);
  useEffect(() => {
      if(recognition) recognition.lang = locale === 'vi' ? 'vi-VN' : 'en-US';
  }, [locale]);

  // Advanced options state
  const [faceLockIntensity, setFaceLockIntensity] = useState<number>(1.0);
  const [preserveGlasses, setPreserveGlasses] = useState<boolean>(true);
  const [controlNetType, setControlNetType] = useState<'OpenPose' | 'Depth Map' | 'Canny Edge'>('OpenPose');
  const [aspectRatio, setAspectRatio] = useState<string>("2160x3840 Vertical Frame");
  const [baseModel, setBaseModel] = useState<string>('Photorealism V3');
  const [characterIds, setCharacterIds] = useState<string>('Dannz-ID-001');
  const [consistencyLock, setConsistencyLock] = useState<boolean>(true);
  const [stylisticBudget, setStylisticBudget] = useState(10);
  const [simulatedForce, setSimulatedForce] = useState(0);
  const [cameraSensor, setCameraSensor] = useState('Default');
  
  // Series Generator
  const [seriesBasePrompt, setSeriesBasePrompt] = useState<string>('');
  const [seriesChanges, setSeriesChanges] = useState<string>('The character looks slightly to the left.\nThe character smiles faintly.\nThe character closes their eyes.');
  const [seriesProgress, setSeriesProgress] = useState<{current: number, total: number} | null>(null);

  // Modals
  const [showSketch, setShowSketch] = useState(false);
  const [showNarrative, setShowNarrative] = useState(false);

  // New Features State
  const [styleProfiles, setStyleProfiles] = useState<StyleProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [watermark, setWatermark] = useState({ enabled: true, text: 'Dannz Generator' });
  const [activeFilters, setActiveFilters] = useState<Record<number, string>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlNetInputRef = useRef<HTMLInputElement>(null);
  const fineTuneInputRef = useRef<HTMLInputElement>(null);
  
  const updateUserData = useCallback((key: string, data: any): boolean => {
      if (!userId) return false;
      try {
        localStorage.setItem(`dannz-${key}-${userId}`, JSON.stringify(data));
        return true;
      } catch (e) {
        if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            console.error(`LocalStorage quota exceeded while saving key: ${key}`);
            setError(t('storageQuotaError'));
        } else {
            console.error(`Failed to save to localStorage for key: ${key}`, e);
            setError(t('storageGenericError'));
        }
        return false;
      }
  }, [userId, t]);

  const updateHistory = useCallback((newHistory: HistoryItem[]) => {
      if (updateUserData('generation-history', newHistory)) {
          setHistory(newHistory);
      }
  }, [updateUserData]);
  
  const updateFolders = useCallback((newFolders: Folder[]) => {
      if (updateUserData('project-folders', newFolders)) {
        setFolders(newFolders);
      }
  }, [updateUserData]);

  const updateStyleProfiles = useCallback((newProfiles: StyleProfile[]) => {
      if(updateUserData('style-profiles', newProfiles)) {
        setStyleProfiles(newProfiles);
      }
  }, [updateUserData]);

  const updateGallery = useCallback((newGallery: GalleryImage[]) => {
      if(updateUserData('gallery-collection', newGallery)) {
        setGallery(newGallery);
      }
  }, [updateUserData]);


  useEffect(() => {
    let id = localStorage.getItem('dannz-user-id');
    if (!id) {
        id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('dannz-user-id', id);
    }
    setUserId(id);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const migrateAndLoad = (key: string) => {
        const userKey = `dannz-${key}-${userId}`;
        const globalKey = `dannz-${key}`;
        
        let data = null;
        try {
            data = JSON.parse(localStorage.getItem(userKey) || 'null');
        } catch (e) {
            console.error(`Error parsing localStorage for key ${userKey}, clearing it.`, e);
            localStorage.removeItem(userKey);
        }

        if (!data) {
            const globalDataRaw = localStorage.getItem(globalKey);
            if (globalDataRaw) {
                try {
                    const globalData = JSON.parse(globalDataRaw);
                    if (globalData) {
                        data = globalData;
                        localStorage.setItem(userKey, JSON.stringify(data));
                    }
                } catch (e) {
                    console.error(`Failed to parse global data for key ${globalKey}`, e);
                }
            }
        }
        const isArrayKey = key.includes('history') || key.includes('profiles') || key.includes('folders') || key.includes('gallery');
        return data || (isArrayKey ? [] : {});
    };

    try {
        const savedProfiles = migrateAndLoad('style-profiles');
        if (Array.isArray(savedProfiles)) setStyleProfiles(savedProfiles);
        
        const savedHistory: HistoryItem[] = migrateAndLoad('generation-history');
        if (Array.isArray(savedHistory)) {
            const migratedHistory = savedHistory.map((item: any) => {
                 const generatedWithIds = item.generatedImages.map((img: any) => ({
                    id: img.id || crypto.randomUUID(), // Assign new ID if missing
                    ...img,
                }));
                return { ...item, generatedImages: generatedWithIds };
            });
            setHistory(migratedHistory);
        }

        const savedFolders = migrateAndLoad('project-folders');
        if(Array.isArray(savedFolders)) setFolders(savedFolders);

        const savedGallery = migrateAndLoad('gallery-collection');
        if(Array.isArray(savedGallery)) setGallery(savedGallery);
        
        const savedTheme = localStorage.getItem('dannz-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

    } catch (e) { console.error("Failed to load data from localStorage", e); }
  }, [userId]);

  const handleImageUpload = (isControlNet: boolean, isFineTune: boolean = false) => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; if (!files || files.length === 0) return;
    if(isFineTune) { alert(`You have selected ${files.length} images for fine-tuning. This feature is coming soon!`); return; }
    const file = files[0]; if (!file) return;
    if (!isControlNet && uploadedImages.length >= 5) { setError("You can upload a maximum of 5 face reference images."); return; }
    setError(null);
    try {
        const base64 = await fileToBase64(file);
        if (isControlNet) { setControlNetImage({ file, base64 }); } else { setUploadedImages(prev => [...prev, { file, base64 }]); }
    } catch (err) { setError("Error reading file. Please try again."); } 
    finally { if (event.target) event.target.value = ''; }
  };
  
  const handleSketchSave = (dataUrl: string) => {
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], "sketch.png", {type: mimeString});
    
    setControlNetImage({file, base64: dataUrl});
    setShowSketch(false);
  };
  
  const handleAddGeoLocation = () => {
    if (!navigator.geolocation) { setError("Geolocation is not supported by your browser."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        setPrompt(p => p + `\n\n(Geo-Location Context: Generate based on lighting and environment typical for latitude ${latitude.toFixed(4)}, longitude ${longitude.toFixed(4)})`);
    }, () => { setError("Unable to retrieve your location."); });
  };
  
  const handleToggleListening = () => {
    if (!recognition) { setError("Speech recognition is not supported by your browser."); return; }
    if (isListening) { recognition.stop(); setIsListening(false); return; }
    recognition.start();
    setIsListening(true);
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(p => p ? `${p} ${transcript}` : transcript);
        setIsListening(false);
    };
    recognition.onerror = (event) => { setError(`Speech recognition error: ${event.error}`); setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };
  };

  const handleRemoveImage = (index: number, isControlNet: boolean) => { if (isControlNet) { setControlNetImage(null); } else { setUploadedImages(prev => prev.filter((_, i) => i !== index)); } };

  const handleDownloadImage = (base64Image: string, index: number) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) { setError("Could not create canvas context to download image."); return; }
        const filterCss = FILTERS[activeFilters[index] || 'none']; if (filterCss) { ctx.filter = filterCss; }
        ctx.drawImage(img, 0, 0);
        if (watermark.enabled && watermark.text) {
            ctx.filter = 'none';
            const fontSize = Math.max(24, Math.min(canvas.width / 30, canvas.height / 30));
            ctx.font = `bold ${fontSize}px 'Inter', sans-serif`; ctx.fillStyle = theme === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
            ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
            ctx.fillText(watermark.text, canvas.width - (fontSize/2), canvas.height - (fontSize/2));
        }
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/jpeg', 0.9); link.download = `dannz_generated_image_${Date.now()}.jpeg`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
    img.src = base64Image;
  };

    const updateImageInStates = useCallback((historyId: string, imageId: string, updates: Partial<GeneratedImage>) => {
        const newHistory = history.map(item => {
            if (item.id === historyId) {
                const newGeneratedImages = item.generatedImages.map(img =>
                    img.id === imageId ? { ...img, ...updates } : img
                );
                return { ...item, generatedImages: newGeneratedImages };
            }
            return item;
        });
        updateHistory(newHistory);
    
        const findImageInNewHistory = (imageIdToFind: string) => {
            for (const item of newHistory) {
                const found = item.generatedImages.find(img => img.id === imageIdToFind);
                if (found) return found;
            }
            return null;
        }

        setGeneratedImages(prev => prev.map(img => img.id === imageId ? { ...img, ...updates } : img));
        updateGallery(gallery.map(item => {
            if (item.imageId === imageId) {
                const updatedImage = findImageInNewHistory(imageId);
                return updatedImage ? { ...item, ...updates, src: updatedImage.src } : item;
            }
            return item;
        }));

        if (viewingGalleryImage?.imageId === imageId) {
            const updatedImage = findImageInNewHistory(imageId);
             if (updatedImage) {
                setViewingGalleryImage(prev => prev ? { ...prev, ...updates, src: updatedImage.src } : null);
             }
        }

    }, [history, updateHistory, updateGallery, viewingGalleryImage, gallery]);


  const handleFavoriteToggle = (historyItemId: string, imageId: string, isFavorite: boolean) => {
    updateImageInStates(historyItemId, imageId, { isFavorite: !isFavorite });
  };
  
  const handleDeleteImage = (historyItemId: string, imageId: string) => {
      if (!window.confirm(t('deleteConfirmation'))) return;

      const imageToRemove = history.find(h => h.id === historyItemId)?.generatedImages.find(img => img.id === imageId);
      if (!imageToRemove) return;

      const newHistory = history.map(item => {
          if (item.id === historyItemId) {
              const newGeneratedImages = item.generatedImages.filter(img => img.id !== imageId);
              if (newGeneratedImages.length === 0) return null; // Mark for deletion
              return { ...item, generatedImages: newGeneratedImages };
          }
          return item;
      }).filter(Boolean) as HistoryItem[];
      updateHistory(newHistory);
      
      updateGallery(gallery.filter(g => g.imageId !== imageId));
      setGeneratedImages(generatedImages.filter(g => g.id !== imageId));
      if (viewingGalleryImage?.imageId === imageId) {
          setViewingGalleryImage(null);
      }
  };

  const handleSaveToGallery = (imageToSave: GeneratedImage, historyId: string) => {
      const isInGallery = gallery.some(item => item.imageId === imageToSave.id);

      if (isInGallery) {
          updateGallery(gallery.filter(item => item.imageId !== imageToSave.id));
      } else {
          const newGalleryItem: GalleryImage = {
              id: `gallery-${Date.now()}`,
              src: imageToSave.src,
              prompt: imageToSave.prompt,
              negativePrompt: imageToSave.negativePrompt,
              settings: imageToSave.settings,
              generationTime: imageToSave.generationTime,
              historyId: historyId,
              imageId: imageToSave.id
          };
          updateGallery([...gallery, newGalleryItem].slice(-GALLERY_LIMIT));
      }
  };
  
  const buildFullPrompt = (promptOverride?: string) => {
    let fullPrompt = promptOverride || prompt;
    const constraints = [];
    if(aspectRatio !== "default") constraints.push(`- Aspect Ratio: ${aspectRatio}.`);
    if(uploadedImages.length > 0) {
        if(preserveGlasses) constraints.push('- Face Reference: Strictly preserve only the glasses and hairstyle from the reference face(s).');
        else constraints.push(`- Face Reference: Adhere to the facial features of the reference face(s) with ${Math.round(faceLockIntensity * 100)}% intensity.`);
    }
    if(characterIds) {
        constraints.push(`- Character IDs: The scene contains character(s) identified as "${characterIds}". Ensure all physical attributes for these characters remain consistent.`);
    }
    if(controlNetImage) constraints.push(`- Structure Reference: Use the final uploaded image for structure. Strictly conform to its ${controlNetType} information.`);
    if (consistencyLock) constraints.push('- Consistency Lock: Maintain a highly consistent color palette, lighting, film grain, and overall aesthetic style across multiple generations.');
    if(stylisticBudget > 0) constraints.push(`- Stylistic Deviation Budget: AI creativity is limited to ${stylisticBudget}%. 90% must match the core prompt.`);
    if(simulatedForce > 0) constraints.push(`- Physics Simulation: Apply wind/force at an intensity of ${simulatedForce}. Affect hair, clothing, and environment.`);
    if(cameraSensor !== 'Default') constraints.push(`- Camera Sensor: Simulate the look of a ${cameraSensor} sensor, including its specific noise, dynamic range, and color profile.`);
    
    if(constraints.length > 0) fullPrompt += "\n\n--- Generation Constraints ---\n" + constraints.join("\n");
    if(negativePrompt) fullPrompt += `\n\n--- Negative Prompt ---\nAvoid the following: ${negativePrompt}`;
    return fullPrompt;
  }
  
  const setImageProcessing = (src: string, action: string | null) => {
    setProcessingImages(prev => {
        const next = new Map(prev);
        if (action) {
            next.set(src, action);
        } else {
            next.delete(src);
        }
        return next;
    });
  };

  const handleSubmit = useCallback(async (isSeries = false, editingOptions?: {baseImage: Omit<GeneratedImage, 'prompt'|'negativePrompt'|'settings'> & { historyId: string, index: number }, newImages?: UploadedImage[], editPrompt: string, processingMessage?: string}) => {
    const isSeriesRun = isSeries && seriesBasePrompt && seriesChanges.trim();
    const changes = isSeriesRun ? seriesChanges.trim().split('\n').filter(line => line.trim() !== '') : [];
    
    if (isSeriesRun && changes.length === 0) {
        setError("Please provide a base prompt and at least one sequential change for the series.");
        return;
    }
    if (!isSeriesRun && !editingOptions && !prompt) { setError('Please provide a prompt.'); return; }
    
    setError(null); 

    const oldSrc = editingOptions?.baseImage.src;
    const imageId = editingOptions?.baseImage.id;
    if (oldSrc) {
        setImageProcessing(oldSrc, editingOptions.processingMessage || t('processingImage'));
    } else {
        setIsLoading(true);
        setGeneratedImages([]);
        setActiveFilters({});
    }
    
    const combinedResults: (Omit<GeneratedImage, 'prompt' | 'negativePrompt' | 'settings'>)[] = [];
    const runCount = isSeriesRun ? changes.length : 1;
    const startTime = Date.now();
    const currentSettings = { faceLockIntensity, preserveGlasses, controlNetType, aspectRatio, baseModel, characterIds, consistencyLock, stylisticBudget, simulatedForce, cameraSensor, seriesChanges: isSeriesRun ? seriesChanges : undefined };

    try {
      for (let i = 0; i < runCount; i++) {
        if (isSeriesRun) setSeriesProgress({ current: i + 1, total: changes.length });
        
        const currentPromptText = editingOptions ? editingOptions.editPrompt : (isSeriesRun ? `${seriesBasePrompt}\n\nStep ${i+1}/${changes.length}: ${changes[i]}` : prompt);
        const fullPromptForStep = editingOptions ? currentPromptText : buildFullPrompt(currentPromptText);

        const baseImages = editingOptions ? [ {file: new File([], 'base.jpg'), base64: editingOptions.baseImage.src}, ...(editingOptions.newImages || [])] : uploadedImages;
        const allImages = [...baseImages, ...(controlNetImage ? [controlNetImage] : [])];

        const imageParts = allImages.map(img => ({ mimeType: img.file.type || 'image/png', data: img.base64.split(',')[1] }));

        const results = await generateImageWithPromptAndImages(fullPromptForStep, imageParts);
        const generationTime = Math.round((Date.now() - startTime) / runCount);
        
        if (editingOptions && oldSrc && imageId) {
            const newSrc = results[0];
            updateImageInStates(editingOptions.baseImage.historyId, imageId, { src: newSrc, generationTime });
        } else {
            combinedResults.push(...results.map(src => ({ id: crypto.randomUUID(), src, tags: [], isFavorite: false, generationTime })));
        }
      }
      
      if (!editingOptions) {
          setGeneratedImages(combinedResults);
          const newHistoryItem: HistoryItem = { 
              id: Date.now().toString(), 
              prompt: isSeriesRun ? `Series: ${seriesBasePrompt}` : prompt, 
              negativePrompt, 
              uploadedImages, 
              generatedImages: combinedResults, 
              settings: currentSettings, 
              tags: isSeriesRun ? ['series'] : [] 
          };
          updateHistory([...history, newHistoryItem].slice(-HISTORY_LIMIT));
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(isSeriesRun ? `Error on step ${seriesProgress?.current || 1}: ${errorMessage}` : errorMessage);
    } finally {
      if (oldSrc) setImageProcessing(oldSrc, null);
      setIsLoading(false);
      setSeriesProgress(null);
      setEditingImage(null);
      setShowAddObjectSketch(false);
      setShowAddPerson(false);
      setRemixingImage(null);
      setExpandingImage(null);
      setFixingImage(null);
      setIsControlsOpen(false);
    }
  }, [prompt, negativePrompt, uploadedImages, controlNetImage, aspectRatio, faceLockIntensity, preserveGlasses, controlNetType, baseModel, characterIds, consistencyLock, stylisticBudget, simulatedForce, cameraSensor, history, gallery, seriesBasePrompt, seriesChanges, locale, updateHistory, updateGallery, viewingGalleryImage, t, updateImageInStates]);

  const handleUpscale = async (imageSrc: string, imageId: string, historyId: string) => {
    setImageProcessing(imageSrc, t('processingUpscale'));
    try {
        const [upscaledImage] = await upscaleImage(imageSrc);
        updateImageInStates(historyId, imageId, { src: upscaledImage });
    } catch (err) {
        setError("Failed to upscale image. Please try again.");
    } finally {
        setImageProcessing(imageSrc, null);
    }
  }


  const handleRefinePrompt = async () => {
      if (!prompt) return; setIsRefining(true); setError(null);
      try { setPrompt(await refinePrompt(prompt, locale)); } 
      catch (err) { setError(err instanceof Error ? err.message : "Failed to refine prompt."); } 
      finally { setIsRefining(false); }
  };
  
  const handleEditComplete = (newSrc: string, originalImage: { src: string; historyId: string; imageId: string; index: number; }) => {
    updateImageInStates(originalImage.historyId, originalImage.imageId, { src: newSrc });
    setCroppingImage(null);
    setAdvancedEditingImage(null);
  };
  
  const handleSaveProfile = () => {
      if (!newProfileName.trim()) return;
      const newProfile: StyleProfile = {
          id: Date.now().toString(),
          name: newProfileName.trim(),
          prompt, negativePrompt, baseModel, cameraSensor, stylisticBudget, consistencyLock,
          aspectRatio, faceLockIntensity, preserveGlasses, controlNetType, simulatedForce
      };
      updateStyleProfiles([...styleProfiles, newProfile]);
      setNewProfileName('');
  };

  const handleApplyProfile = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const profileId = e.target.value;
      const profile = styleProfiles.find(p => p.id === profileId);
      if (profile) {
          setPrompt(profile.prompt);
          setNegativePrompt(profile.negativePrompt);
          setBaseModel(profile.baseModel);
          setCameraSensor(profile.cameraSensor);
          setStylisticBudget(profile.stylisticBudget);
          setConsistencyLock(profile.consistencyLock);
          setAspectRatio(profile.aspectRatio);
          setFaceLockIntensity(profile.faceLockIntensity);
          setPreserveGlasses(profile.preserveGlasses);
          setControlNetType(profile.controlNetType);
          setSimulatedForce(profile.simulatedForce);
      }
  };

  const handleDeleteProfile = (profileId: string) => {
      updateStyleProfiles(styleProfiles.filter(p => p.id !== profileId));
  };
  
  const LabButton: React.FC<{labName: string; children: React.ReactNode; icon: React.ReactNode}> = ({labName, children, icon}) => (
    <button onClick={() => setActiveLab(labName)} className={`flex-1 p-2 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-colors duration-200 ${activeLab === labName ? 'bg-cyan-600 text-white shadow-md' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'}`}>{icon}{children}</button>
  );

  const NavButton: React.FC<{viewName: ActiveView; title: string; children: React.ReactNode;}> = ({viewName, title, children}) => (
    <Tooltip content={title}>
        <button onClick={()=> setActiveView(viewName)} className={`p-3 rounded-lg transition-all duration-200 ease-in-out ${activeView === viewName ? 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-500 dark:text-cyan-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {children}
        </button>
    </Tooltip>
  );

  const findImageHistoryInfo = (imageId: string): { historyId: string, index: number, image: GeneratedImage } | null => {
    for (const historyItem of history) {
        const index = historyItem.generatedImages.findIndex(gi => gi.id === imageId);
        if (index !== -1) {
            return { historyId: historyItem.id, index, image: historyItem.generatedImages[index] as GeneratedImage };
        }
    }
    return null;
  }


  const allFavoritedImages = useMemo(() => {
    return history
      .flatMap(item => item.generatedImages.map((img, index) => ({ ...img, historyId: item.id, index, prompt: item.prompt })))
      .filter(img => img.isFavorite)
      .reverse();
  }, [history]);
  
  const mainContent = () => {
    const animationClass = "opacity-100 transition-opacity duration-500 ease-in-out";
    switch(activeView) {
        case 'gallery': return (
            <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto ${animationClass}`}>
                <header className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('galleryTitle')}</h1><p className="text-sm text-gray-500 dark:text-gray-400">{t('galleryDescription')}</p></header>
                {gallery.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {[...gallery].reverse().map((image) => (
                            <div key={image.id} onClick={() => setViewingGalleryImage(image)} className="group relative rounded-lg overflow-hidden shadow-lg hover:shadow-cyan-500/20 transition-shadow duration-300 cursor-pointer">
                                <img src={image.src} className="w-full h-full object-cover aspect-square" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <ImageIcon className="w-24 h-24 text-gray-300 dark:text-gray-700" />
                        <h2 className="mt-4 text-xl font-semibold text-gray-700 dark:text-gray-300">{t('noGalleryItems')}</h2>
                        <p>{t('noGalleryItemsDescription')}</p>
                    </div>
                )}
            </main>
        );
        case 'favorites': return (
            <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto ${animationClass}`}>
                <header className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('favoritesTitle')}</h1><p className="text-sm text-gray-500 dark:text-gray-400">{t('favoritesDescription')}</p></header>
                {allFavoritedImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {allFavoritedImages.map((image) => {
                            const historyItem = history.find(h => h.id === image.historyId);
                            if (!historyItem) return null;
                            const date = new Date(parseInt(historyItem.id));
                            const formattedDate = date.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric'});
                            const formattedTime = date.toLocaleTimeString(locale === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' });

                            return (
                                <div key={image.src} className="group relative rounded-lg overflow-hidden shadow-lg hover:shadow-cyan-500/20 transition-shadow duration-300">
                                    <img src={image.src} className="w-full h-full object-cover aspect-square" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="absolute bottom-0 left-0 p-4 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-4 group-hover:translate-y-0">
                                        <p className="text-white text-xs font-mono">{formattedDate} - {formattedTime}</p>
                                    </div>
                                    <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -translate-x-4 group-hover:translate-x-0">
                                        <Tooltip content={t('deleteImage')}><button onClick={() => handleDeleteImage(historyItem.id, image.id)} className="p-2 bg-black/50 rounded-full text-white hover:bg-red-500 backdrop-blur-sm transition-colors"><TrashIcon className="w-4 h-4" /></button></Tooltip>
                                        <Tooltip content={t('tooltipUnfavorite')}><button onClick={() => handleFavoriteToggle(historyItem.id, image.id, image.isFavorite)} className={`p-2 bg-black/50 rounded-full hover:bg-yellow-500 ${image.isFavorite ? 'text-yellow-400' : 'text-white'} backdrop-blur-sm transition-colors`}><StarIcon className="w-4 h-4" filled={true} /></button></Tooltip>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <StarIcon className="w-24 h-24 text-gray-300 dark:text-gray-700" />
                        <h2 className="mt-4 text-xl font-semibold text-gray-700 dark:text-gray-300">{t('noFavorites')}</h2>
                        <p>{t('noFavoritesDescription')}</p>
                    </div>
                )}
            </main>
        );
        case 'settings':
            const handleCopy = () => {
                if(userId) {
                    navigator.clipboard.writeText(userId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            };
            return (
            <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto ${animationClass}`}>
                <header className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settingsTitle')}</h1><p className="text-sm text-gray-500 dark:text-gray-400">{t('settingsDescription')}</p></header>
                <div className="max-w-xl space-y-6">
                    <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{t('userProfileTitle')}</h3>
                        <label htmlFor="userId" className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('userIdLabel')}</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input id="userId" type="text" readOnly value={userId || ''} className="flex-1 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-xs font-mono"/>
                            <button onClick={handleCopy} className="bg-cyan-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2 text-sm">
                                <ClipboardIcon className="w-4 h-4" />
                                {copied ? t('idCopied') : t('copyIdButton')}
                            </button>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{t('watermarkSettings')}</h3>
                        <div className="flex items-center justify-between">
                            <label htmlFor="enableWatermark" className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('enableWatermark')}</label>
                            <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="enableWatermark" className="sr-only peer" checked={watermark.enabled} onChange={e => setWatermark(w => ({...w, enabled: e.target.checked}))} /><div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div></label>
                        </div>
                        {watermark.enabled && (
                            <div className="mt-4">
                                <label htmlFor="watermarkText" className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('watermarkText')}</label>
                                <input id="watermarkText" type="text" value={watermark.text} onChange={e => setWatermark(w => ({...w, text: e.target.value}))} className="mt-1 w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-sm" />
                            </div>
                        )}
                    </div>
                </div>
            </main>
        );
        case 'about': return (
            <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto ${animationClass}`}>
                <header className="mb-6"><h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('aboutTitle')}</h1><p className="text-sm text-gray-500 dark:text-gray-400">{t('aboutDescription')}</p></header>
                <div className="max-w-2xl prose prose-sm sm:prose-base dark:prose-invert prose-h2:font-semibold prose-h2:text-cyan-500 bg-white dark:bg-gray-800/50 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
                    <h2>{t('aboutWelcome')}</h2>
                    <p>{t('aboutIntro')}</p>
                    <h3>{t('aboutCoreLab')}</h3>
                    <p>{t('aboutCoreLabDesc')}</p>
                    <h3>{t('aboutStructureLab')}</h3>
                    <p>{t('aboutStructureLabDesc')}</p>
                    <h3>{t('aboutAdvancedLab')}</h3>
                    <p>{t('aboutAdvancedLabDesc')}</p>
                    <h3>{t('aboutEditing')}</h3>
                    <p>{t('aboutEditingDesc')}</p>
                    <ul>
                        <li><strong>{t('aboutRemix')}</strong></li>
                        <li><strong>{t('aboutExpand')}</strong></li>
                        <li><strong>{t('aboutFix')}</strong></li>
                        <li><strong>{t('aboutCRT')}</strong></li>
                    </ul>
                </div>
            </main>
        );
        case 'generator':
        default: return (
            <>
                <header className="lg:hidden sticky top-0 z-10 bg-white/80 dark:bg-gray-900/90 backdrop-blur-sm p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                         <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-bold text-black text-xl shrink-0">D</div>
                         <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('appTitle')}</h1>
                    </div>
                    <button onClick={() => setIsControlsOpen(true)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                        <AdjustmentsHorizontalIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className={`flex-1 p-4 sm:p-6 lg:p-8 flex items-center justify-center overflow-y-auto ${animationClass}`}>
                    {isLoading ? <Placeholder isLoading={true} seriesProgress={seriesProgress} t={t} /> : generatedImages.length > 0 ? (
                    <div className="grid gap-4 sm:gap-6 w-full max-w-7xl grid-cols-1">
                        {generatedImages.map((image, index) => {
                            const historyInfo = findImageHistoryInfo(image.id);
                            if (!historyInfo) return null;
                            const { historyId } = historyInfo;
                            const historyItem = history.find(h => h.id === historyId);
                            if (!historyItem) return null;

                            const fullImage = { ...image, prompt: historyItem.prompt, negativePrompt: historyItem.negativePrompt, settings: historyItem.settings };
                            const isInGallery = gallery.some(g => g.imageId === image.id);
                            const processingMessage = processingImages.get(image.src);
        
                            return (
                            <div key={`${image.id}-${index}`} className="rounded-lg overflow-hidden bg-white dark:bg-black/20 shadow-lg relative group">
                                {processingMessage && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center z-20"><div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-cyan-400"></div><p className="text-white mt-3 font-semibold">{processingMessage}</p></div>}
                                <img src={image.src} alt={`Generated image ${index + 1}`} className="w-full h-full object-contain" style={{ filter: FILTERS[activeFilters[index] || 'none'] }}/>
                                <div className="absolute top-2 right-2 text-xs bg-black/40 text-white dark:text-gray-200 rounded-full px-2 py-0.5 backdrop-blur-sm">
                                    {image.generationTime ? `${(image.generationTime / 1000).toFixed(1)}s` : '...'}
                                </div>
                                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-4 group-hover:translate-x-0">
                                    <Tooltip content={t('tooltipNarrative')}><button onClick={() => setShowNarrative(true)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500 transition-colors"><BookOpenIcon className="w-5 h-5"/></button></Tooltip>
                                    <Tooltip content={t('tooltipPrint')}><button onClick={() => setPrintExportImage(image.src)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500 transition-colors"><PrinterIcon className="w-5 h-5"/></button></Tooltip>
                                    <Tooltip content={t('tooltipCrop')}><button onClick={() => setCroppingImage({ src: image.src, index, historyId, imageId: image.id })} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500 transition-colors"><CropIcon className="w-5 h-5"/></button></Tooltip>
                                    <Tooltip content={t('tooltipUpscale')}><button onClick={() => handleUpscale(image.src, image.id, historyId)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500 transition-colors"><UpscaleIcon className="w-5 h-5"/></button></Tooltip>
                                    <Tooltip content={t('tooltipDownload')}><button onClick={() => handleDownloadImage(image.src, index)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500 transition-colors"><DownloadIcon className="w-5 h-5"/></button></Tooltip>
                                </div>
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-auto flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 bg-gray-900/60 backdrop-blur-sm p-1.5 rounded-full border border-gray-700 shadow-lg">
                                    <Tooltip content={image.isFavorite ? t('tooltipUnfavorite') : t('tooltipFavorite')}><button onClick={() => handleFavoriteToggle(historyId, image.id, image.isFavorite || false)} className={`p-2 rounded-full hover:bg-white/20 transition-colors transform active:scale-90 ${image.isFavorite ? 'text-yellow-400' : 'text-gray-200'}`}><StarIcon className="w-4 h-4" filled={image.isFavorite} /></button></Tooltip>
                                    <Tooltip content={isInGallery ? t('tooltipRemoveFromGallery') : t('tooltipSaveToGallery')}><button onClick={() => handleSaveToGallery(fullImage as GeneratedImage, historyId)} className={`p-2 rounded-full hover:bg-white/20 transition-colors ${isInGallery ? 'text-cyan-400' : 'text-gray-200'}`}><BookmarkSquareIcon className="w-4 h-4" /></button></Tooltip>
                                    <FilterDropdown onSelect={(filter) => setActiveFilters(p => ({...p, [index]: filter}))} t={t} />
                                    <div className="w-px h-5 bg-gray-600 mx-1"></div>
                                    <Tooltip content={t('tooltipAddObject')}><button onClick={() => {setEditingImage({src: image.src, index: index, id: image.id}); setShowAddObjectSketch(true);}} className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"><BrushIcon className="w-4 h-4"/></button></Tooltip>
                                    <Tooltip content={t('tooltipAddPerson')}><button onClick={() => {setEditingImage({src: image.src, index: index, id: image.id}); setShowAddPerson(true);}} className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"><UserPlusIcon className="w-4 h-4"/></button></Tooltip>
                                    <div className="w-px h-5 bg-gray-600 mx-1"></div>
                                    <Tooltip content={t('advancedEditTitle')}><button onClick={() => setAdvancedEditingImage({src: image.src, index, historyId, imageId: image.id})} className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"><AdjustmentsHorizontalIcon className="w-4 h-4"/></button></Tooltip>
                                    <Tooltip content={t('tooltipRemix')}><button onClick={() => setRemixingImage({...(fullImage as GeneratedImage), index: index})} className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"><RemixIcon className="w-4 h-4"/></button></Tooltip>
                                    <Tooltip content={t('tooltipFix')}><button onClick={() => setFixingImage({...(fullImage as GeneratedImage), index: index})} className="text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"><FixIcon className="w-4 h-4"/></button></Tooltip>
                                </div>
                            </div>
                            )})}
                    </div>
                    ) : <Placeholder t={t}/>}
                </main>
                
                {isControlsOpen && (
                    <div 
                        className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                        onClick={() => setIsControlsOpen(false)}
                    ></div>
                )}
        
                <aside className={`w-full max-w-sm bg-white dark:bg-gray-950/95 backdrop-blur-sm p-6 flex flex-col border-gray-200 dark:border-gray-800 transition-transform duration-300 ease-in-out fixed top-0 right-0 h-full z-40 transform ${isControlsOpen ? 'translate-x-0' : 'translate-x-full'} lg:static lg:transform-none lg:h-auto lg:max-w-none lg:w-[400px] xl:w-[450px] lg:border-l lg:z-auto`}>
                    <header className="mb-6 flex justify-between items-start">
                        <button onClick={() => setIsControlsOpen(false)} className="lg:hidden p-1 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                            <ArrowLeftIcon className="w-6 h-6" />
                        </button>
                        <div className="flex-1 lg:flex-none text-left lg:text-left ml-2 lg:ml-0">
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{t('appTitle')}</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('appSubtitle')}</p>
                        </div>
                    </header>
                    
                    <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg mb-4 border border-gray-200 dark:border-gray-700/50"><LabButton labName="core" icon={<SparklesIcon className="w-4 h-4"/>}>{t('core')}</LabButton><LabButton labName="structure" icon={<AdjustmentsHorizontalIcon className="w-4 h-4"/>}>{t('structure')}</LabButton><LabButton labName="advanced" icon={<BeakerIcon className="w-4 h-4"/>}>{t('advanced')}</LabButton></div>
        
                    <div className="flex-1 flex flex-col overflow-y-auto pr-2 -mr-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950">
                        {activeLab === 'core' && (<>
                            <Accordion title={t('promptLabel')} defaultOpen>
                                <div className="space-y-4">
                                <div className="flex flex-col"><div className="flex justify-between items-center mb-2"><label htmlFor="prompt" className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('promptLabel')}</label><button onClick={handleRefinePrompt} disabled={isRefining || !prompt} className="text-xs bg-cyan-500/80 dark:bg-cyan-600/50 text-white font-semibold py-1 px-2 rounded-md flex items-center gap-1 hover:bg-cyan-600/80 disabled:bg-gray-500 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">{isRefining ? t('refining') : <><RefineIcon className="w-4 h-4"/> {t('aiRefine')}</>}</button></div>
                                <div className="relative"><textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('promptPlaceholder')} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-500 font-mono text-xs" rows={6}/><button onClick={handleToggleListening} className={`absolute bottom-2 right-2 p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-600 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600'}`} title={t('voicePromptTitle')}><MicrophoneIcon className="w-4 h-4 text-white"/></button></div></div>
                                <div><label htmlFor="negativePrompt" className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('negativePromptLabel')}</label><textarea id="negativePrompt" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder={t('negativePromptPlaceholder')} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-500 font-mono text-xs" rows={2}/></div>
                                </div>
                            </Accordion>
                            <Accordion title={t('seriesGeneratorTitle')}>
                                <div className="space-y-2">
                                <div><label htmlFor="seriesBasePrompt" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('seriesBasePromptLabel')}</label><textarea id="seriesBasePrompt" value={seriesBasePrompt} onChange={e=>setSeriesBasePrompt(e.target.value)} rows={3} className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-xs" placeholder={t('seriesBasePromptPlaceholder')}/></div><div><label htmlFor="seriesChanges" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('seriesChangesLabel')}</label><textarea id="seriesChanges" value={seriesChanges} onChange={e=>setSeriesChanges(e.target.value)} rows={4} className="w-full bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-xs" placeholder={t('seriesChangesPlaceholder')}/></div><button onClick={() => handleSubmit(true)} disabled={isLoading || !seriesBasePrompt} className="w-full mt-2 bg-purple-600 text-white text-sm font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-purple-500 disabled:bg-gray-400 dark:disabled:bg-gray-700 transition-colors">{t('generateSeriesButton')}</button>
                                </div>
                            </Accordion>
                        </>)}
                        {activeLab === 'structure' && (<>
                             <Accordion title={t('faceCharacterRefTitle')} defaultOpen>
                                <div className="space-y-3">
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3"><input type="file" accept="image/*" onChange={handleImageUpload(false)} className="hidden" ref={fileInputRef} id="image-upload" multiple/><button onClick={() => fileInputRef.current?.click()} className="bg-gray-300 dark:bg-gray-700/50 text-gray-800 dark:text-gray-300 text-sm font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-400 dark:hover:bg-gray-700 w-full transition-colors"><UploadIcon className="w-5 h-5"/> {t('selectFacesButton')}</button></div>{uploadedImages.length > 0 && (<div className="grid grid-cols-5 gap-2 mt-2">{uploadedImages.map((image, index) => (<div key={index} className="relative group"><img src={image.base64} alt={`upload-preview-${index}`} className="w-full h-full object-cover rounded-md aspect-square"/><button onClick={() => handleRemoveImage(index, false)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Remove image"><CloseIcon className="w-4 h-4" /></button></div>))}</div>)}
                                <div className="space-y-3"><div><label htmlFor="characterIds" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('characterIdsLabel')}</label><input type="text" id="characterIds" value={characterIds} onChange={(e) => setCharacterIds(e.target.value)} placeholder={t('characterIdsPlaceholder')} className="w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"/></div><label className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">{t('faceLockIntensityLabel')}: <span className="font-semibold text-gray-800 dark:text-gray-200">{Math.round(faceLockIntensity * 100)}%</span></label><input type="range" min="0.1" max="1" step="0.05" value={faceLockIntensity} onChange={e => setFaceLockIntensity(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500" disabled={preserveGlasses}/>
                                <div className="flex items-center gap-2"><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="preserveGlasses" className="sr-only peer" checked={preserveGlasses} onChange={e => setPreserveGlasses(e.target.checked)} /><div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div></label><label htmlFor="preserveGlasses" className="text-xs text-gray-700 dark:text-gray-300">{t('preserveGlassesLabel')}</label></div></div>
                                </div>
                            </Accordion>
                            <Accordion title={t('poseEnvControlTitle')}>
                                <div className="space-y-3">
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3 grid grid-cols-2 gap-2"><input type="file" accept="image/*" onChange={handleImageUpload(true)} className="hidden" ref={controlNetInputRef} id="controlnet-upload"/><button onClick={() => controlNetInputRef.current?.click()} className="bg-gray-300 dark:bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors"><UploadIcon className="w-4 h-4"/> {t('uploadPoseButton')}</button><button onClick={() => setShowSketch(true)} className="bg-gray-300 dark:bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors"><PencilSquareIcon className="w-4 h-4"/> {t('sketchPoseButton')}</button></div>{controlNetImage && <div className="relative group w-full mt-2"><img src={controlNetImage.base64} className="w-full rounded-md"/><button onClick={() => handleRemoveImage(0, true)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100"><CloseIcon className="w-4 h-4" /></button></div>}
                                <div className="space-y-3"><div><label htmlFor="controlNetType" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('controlNetTypeLabel')}</label><select id="controlNetType" value={controlNetType} onChange={e => setControlNetType(e.target.value as any)} className="w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500 text-gray-800 dark:text-gray-200"><option>OpenPose</option><option>Depth Map</option><option>Canny Edge</option></select></div><button onClick={handleAddGeoLocation} className="w-full bg-gray-300 dark:bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-400 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors"><GlobeAltIcon className="w-4 h-4"/> {t('useGeoLocationButton')}</button></div>
                                </div>
                            </Accordion>
                        </>)}
                        {activeLab === 'advanced' && (<>
                            <Accordion title={t('styleProfilesTitle')} defaultOpen>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="apply-profile" className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('applyProfileLabel')}</label>
                                        <select id="apply-profile" onChange={handleApplyProfile} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500">
                                            <option value="">{t('selectProfile')}</option>
                                            {styleProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="border-t border-gray-200 dark:border-gray-700/50 pt-4">
                                        <label htmlFor="save-profile" className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('saveProfileLabel')}</label>
                                        <div className="flex gap-2">
                                            <input id="save-profile" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder={t('profileNamePlaceholder')} className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500" />
                                            <button onClick={handleSaveProfile} disabled={!newProfileName.trim()} className="bg-cyan-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-cyan-700 disabled:bg-gray-500 transition-colors text-sm">{t('saveButton')}</button>
                                        </div>
                                    </div>
                                    {styleProfiles.length > 0 && (
                                    <div className="border-t border-gray-200 dark:border-gray-700/50 pt-4">
                                        <h4 className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{t('manageProfilesLabel')}</h4>
                                        <ul className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                            {styleProfiles.map(p => (
                                                <li key={p.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-800/50 p-2 rounded-md">
                                                    <span className="text-sm text-gray-800 dark:text-gray-200">{p.name}</span>
                                                    <button onClick={() => handleDeleteProfile(p.id)} className="text-gray-400 hover:text-red-500 p-1"><TrashIcon className="w-4 h-4" /></button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    )}
                                </div>
                            </Accordion>
                            <Accordion title={t('technicalControlsTitle')}>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between"><label htmlFor="consistencyLock" className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-2">🔥 {t('consistencyLockLabel')}</label><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="consistencyLock" className="sr-only peer" checked={consistencyLock} onChange={e => setConsistencyLock(e.target.checked)} /><div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div></label></div>
                                    <div><label htmlFor="stylisticBudget" className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">{t('styleDeviationLabel')}: <span className="font-semibold text-gray-800 dark:text-gray-200">{stylisticBudget}%</span></label><input type="range" min="0" max="100" step="1" value={stylisticBudget} onChange={e => setStylisticBudget(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500 mt-1"/></div>
                                    <div><label htmlFor="aspectRatio" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('aspectRatioLabel')}</label><select id="aspectRatio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 text-gray-800 dark:text-gray-200"><option>2160x3840 Vertical Frame</option><option>1:1 (Square)</option><option>16:9 (Widescreen)</option><option>9:16 (Story/Reels)</option><option>4:5 (Instagram Portrait)</option><option>2.35:1 (Cinemascope)</option></select></div>
                                    <div><label htmlFor="baseModel" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('baseModelLabel')}</label><select id="baseModel" value={baseModel} onChange={e => setBaseModel(e.target.value)} className="w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 text-gray-800 dark:text-gray-200"><option>Photorealism V3</option><option>Stylized V1</option><option>Anime Diffusion XL</option></select></div>
                                </div>
                            </Accordion>
                             <Accordion title={t('simulationTitle')}>
                                <div className="space-y-3">
                                    <div><label htmlFor="simulatedForce" className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">{t('simulateForceLabel')}: <span className="font-semibold text-gray-800 dark:text-gray-200">{simulatedForce}</span></label><input type="range" min="0" max="10" step="1" value={simulatedForce} onChange={e => setSimulatedForce(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500 mt-1"/></div>
                                    <div><label htmlFor="cameraSensor" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('cameraSensorLabel')}</label><select id="cameraSensor" value={cameraSensor} onChange={e => setCameraSensor(e.target.value)} className="w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-xs rounded-lg p-2 text-gray-800 dark:text-gray-200"><option>Default</option><option>Fuji X-Trans</option><option>Sony IMX</option><option>Kodak Portra 400</option><option>Ilford HP5 Plus</option></select></div>
                                    <button onClick={() => alert("Material Editor (PBR) is a future feature.")} className="w-full text-xs bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors">{t('materialEditorButton')}</button>
                                </div>
                            </Accordion>
                            <Accordion title={t('experimentationLabTitle')}>
                                <div className="space-y-2 text-center">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('experimentationLabDescription')}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => alert("A/B Testing Auto-Run is a future feature.")} className="w-full text-xs bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors">{t('abTestingButton')}</button>
                                    <button onClick={() => alert("Latent Space Interpolation is a future feature.")} className="w-full text-xs bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors">{t('latentInterpolationButton')}</button>
                                    <button onClick={() => alert("Self-Correction Loop is a future feature.")} className="w-full text-xs bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors">{t('selfCorrectionButton')}</button>
                                    <input type="file" accept="image/*" onChange={handleImageUpload(false, true)} className="hidden" ref={fineTuneInputRef} id="finetune-upload" multiple/>
                                    <button onClick={() => fineTuneInputRef.current?.click()} className="w-full text-xs bg-gray-200 dark:bg-gray-800/50 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 transition-colors">{t('fineTuneButton')}</button>
                                    </div>
                                </div>
                            </Accordion>
                        </>)}
                    </div>
        
                    <div className="mt-auto pt-6">
                        <button onClick={() => handleSubmit(false)} disabled={isLoading || !prompt} className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-cyan-500 disabled:bg-gray-500 dark:disabled:bg-gray-700 disabled:text-gray-300 dark:disabled:text-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyan-600/20">
                        {isLoading ? (<><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"></div><span>{t('generating')}</span></>) : (<><GenerateIcon className="w-5 h-5"/>{t('generateButton')}</>)}
                        </button>
                        {error && <div role="alert" className="mt-4 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-300 p-3 rounded-lg text-sm">{error}</div>}
                    </div>
                </aside>
            </>
        );
    }
  }

  return (
    <>
    {croppingImage && <CropperModal imageSrc={croppingImage.src} onClose={() => setCroppingImage(null)} onCrop={(newSrc) => handleEditComplete(newSrc, croppingImage)} t={t} />}
    {advancedEditingImage && <AdvancedEditModal imageSrc={advancedEditingImage.src} onClose={() => setAdvancedEditingImage(null)} onSave={(newSrc) => handleEditComplete(newSrc, advancedEditingImage)} t={t} />}
    {printExportImage && <PrintExportModal imageSrc={printExportImage} onClose={() => setPrintExportImage(null)} t={t} />}
    {showHistory && <HistoryModal history={history} folders={folders} onUpdateHistory={updateHistory} onUpdateFolders={updateFolders} onClose={() => setShowHistory(false)} t={t}/>}
    {showSketch && <SketchModal onClose={() => setShowSketch(false)} onSave={handleSketchSave} t={t}/>}
    {showNarrative && generatedImages.length > 0 && <NarrativeModal images={generatedImages.map(img => ({...img, prompt: '', negativePrompt: '', settings: {}}))} onClose={() => setShowNarrative(false)} t={t} locale={locale} />}
    
    {remixingImage && <EditImageModal imageSrc={remixingImage.src} onClose={() => setRemixingImage(null)} onSave={(editPrompt) => { const historyInfo = findImageHistoryInfo(remixingImage.id); if(historyInfo) handleSubmit(false, { baseImage: { ...remixingImage, ...historyInfo }, editPrompt, processingMessage: t('processingRemix') }); }} t={t} titleKey="remixImageTitle" descriptionKey="remixImageDescription" placeholderKey="remixPlaceholder" />}
    {expandingImage && <EditImageModal imageSrc={expandingImage.src} onClose={() => setExpandingImage(null)} onSave={(editPrompt) => { const historyInfo = findImageHistoryInfo(expandingImage.id); if(historyInfo) handleSubmit(false, { baseImage: { ...expandingImage, ...historyInfo }, editPrompt, processingMessage: t('processingImage') }); }} t={t} titleKey="expandCanvasTitle" descriptionKey="expandCanvasDescription" placeholderKey="expandPlaceholder" />}
    {fixingImage && <EditImageModal imageSrc={fixingImage.src} onClose={() => setFixingImage(null)} onSave={(editPrompt) => { const historyInfo = findImageHistoryInfo(fixingImage.id); if(historyInfo) handleSubmit(false, { baseImage: { ...fixingImage, ...historyInfo }, editPrompt, processingMessage: t('processingFix') }); }} t={t} titleKey="fixImperfectionsTitle" descriptionKey="fixImperfectionsDescription" placeholderKey="fixPlaceholder" />}
    
    {showAddObjectSketch && editingImage && <AddObjectSketchModal imageSrc={editingImage.src} onClose={() => setShowAddObjectSketch(false)} onSave={(mask, objPrompt)=>{
        const editPrompt = locale === 'vi' ? `Trong ảnh gốc, thêm "${objPrompt}" vào khu vực được phác thảo trong ảnh thứ hai.` : `In the original image, add a "${objPrompt}" in the area sketched in the second image.`;
        const historyInfo = findImageHistoryInfo(editingImage.id); if(!historyInfo) return;
        handleSubmit(false, { baseImage: { ...(generatedImages.find(g => g.id === editingImage.id)!), ...historyInfo }, newImages: [{file: new File([], 'mask.png'), base64: mask}], editPrompt, processingMessage: t('processingRemix') });
    }} t={t} />}
    {showAddPerson && editingImage && <AddPersonModal baseImageSrc={editingImage.src} onClose={() => setShowAddPerson(false)} onSave={(imageToAdd, personPrompt)=>{
        const editPrompt = personPrompt || (locale === 'vi' ? 'Thêm người này vào cảnh một cách tự nhiên.' : 'Add this person into the scene naturally.');
        const historyInfo = findImageHistoryInfo(editingImage.id); if(!historyInfo) return;
        handleSubmit(false, { baseImage: { ...(generatedImages.find(g => g.id === editingImage.id)!), ...historyInfo }, newImages: [imageToAdd], editPrompt, processingMessage: t('processingRemix') });
    }} t={t} />}

    {viewingGalleryImage && <GalleryDetailModal image={viewingGalleryImage} history={history} onClose={() => setViewingGalleryImage(null)} t={t} 
        onUpscale={handleUpscale}
        onCrop={(src, index, historyId, imageId) => setCroppingImage({src, index, historyId, imageId})}
        onAdvancedEdit={(src, index, historyId, imageId) => setAdvancedEditingImage({src, index, historyId, imageId})}
        onRemix={(img, index) => setRemixingImage({...img, index})}
        onFix={(img, index) => setFixingImage({...img, index})}
        onAddObject={(src, index) => { setEditingImage({src, index, id: viewingGalleryImage.imageId}); setShowAddObjectSketch(true); }}
        onDownload={handleDownloadImage}
        onDelete={handleDeleteImage}
        onFavoriteToggle={handleFavoriteToggle}
        onSaveToGallery={handleSaveToGallery}
        isFavorite={history.find(h => h.id === viewingGalleryImage.historyId)?.generatedImages.find(g => g.id === viewingGalleryImage.imageId)?.isFavorite || false}
        isInGallery={gallery.some(g => g.imageId === viewingGalleryImage.imageId)}
        isProcessingMessage={processingImages.get(viewingGalleryImage.src)}
    />}

    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex font-sans antialiased">
      <nav className="w-20 bg-white dark:bg-black/20 border-r border-gray-200 dark:border-gray-800 flex-col items-center p-4 hidden sm:flex">
          <div className="w-10 h-10 mb-8 bg-cyan-500 rounded-lg flex items-center justify-center font-bold text-black text-2xl shrink-0">D</div>
          <div className="flex flex-col items-center justify-start space-y-2 flex-grow">
              <NavButton viewName="gallery" title={t('navGallery')}><HomeIcon className="w-6 h-6"/></NavButton>
              <NavButton viewName="generator" title={t('navGenerator')}><Squares2X2Icon className="w-6 h-6" /></NavButton>
              <NavButton viewName="favorites" title={t('navFavorites')}><StarIcon className="w-6 h-6"/></NavButton>
              <Tooltip content={t('navHistory')}><button onClick={() => setShowHistory(true)} className="p-3 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ease-in-out"><HistoryIcon className="w-6 h-6"/></button></Tooltip>
          </div>
          <div className="flex flex-col items-center justify-end space-y-2">
            <NavButton viewName="settings" title={t('navSettings')}><CogIcon className="w-6 h-6"/></NavButton>
            <NavButton viewName="about" title={t('navAbout')}><QuestionMarkCircleIcon className="w-6 h-6"/></NavButton>
            <Tooltip content={t('navToggleTheme')}>
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-3 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ease-in-out">
                    {theme === 'dark' ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
                </button>
            </Tooltip>
            <Tooltip content={t('navChangeLanguage')}>
                <button onClick={() => setLocale(locale === 'en' ? 'vi' : 'en')} className="p-3 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ease-in-out">
                    <span className="font-semibold text-lg">{locale === 'en' ? 'VI' : 'EN'}</span>
                </button>
            </Tooltip>
          </div>
      </nav>

        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
            {mainContent()}
        </div>
        
        {/* Bottom Nav for Mobile */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-black/50 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 flex justify-around p-2 z-30">
            <NavButton viewName="gallery" title={t('navGallery')}><HomeIcon className="w-6 h-6"/></NavButton>
            <NavButton viewName="generator" title={t('navGenerator')}><Squares2X2Icon className="w-6 h-6" /></NavButton>
            <NavButton viewName="favorites" title={t('navFavorites')}><StarIcon className="w-6 h-6" /></NavButton>
            <Tooltip content={t('navHistory')}><button onClick={() => setShowHistory(true)} className="p-3 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 ease-in-out"><HistoryIcon className="w-6 h-6"/></button></Tooltip>
            <NavButton viewName="settings" title={t('navSettings')}><CogIcon className="w-6 h-6"/></NavButton>
        </nav>
    </div>
    </>
  );
};

const GalleryDetailModal: React.FC<{
    image: GalleryImage;
    history: HistoryItem[];
    onClose: () => void;
    t: (key: keyof typeof translations) => string;
    onUpscale: (src: string, imageId: string, historyId: string) => void;
    onCrop: (src: string, index: number, historyId: string, imageId: string) => void;
    onAdvancedEdit: (src: string, index: number, historyId: string, imageId: string) => void;
    onRemix: (image: GeneratedImage, index: number) => void;
    onFix: (image: GeneratedImage, index: number) => void;
    onAddObject: (src: string, index: number) => void;
    onDownload: (src: string, index: number) => void;
    onDelete: (historyId: string, imageId: string) => void;
    onFavoriteToggle: (historyId: string, imageId: string, isFavorite: boolean) => void;
    onSaveToGallery: (image: GeneratedImage, historyId: string) => void;
    isFavorite: boolean;
    isInGallery: boolean;
    isProcessingMessage?: string;
}> = ({ image, history, onClose, t, onUpscale, onCrop, onAdvancedEdit, onRemix, onFix, onAddObject, onDownload, onDelete, onFavoriteToggle, onSaveToGallery, isFavorite, isInGallery, isProcessingMessage }) => {

    const historyInfo = useMemo(() => {
        const historyItem = history.find(h => h.id === image.historyId);
        if (!historyItem) return null;
        const index = historyItem.generatedImages.findIndex(gi => gi.id === image.imageId);
        if (index === -1) return null;
        return { historyItem, index };
    }, [history, image]);
    
    if (!historyInfo) {
        // This can happen briefly if history is cleared while modal is open.
        // Or if data is somehow inconsistent.
        return null; 
    }

    const fullImage: GeneratedImage = {
        ...(historyInfo.historyItem.generatedImages[historyInfo.index] as GeneratedImage),
        ...image,
        isFavorite: isFavorite,
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('galleryDetailTitle')}</h2>
                    <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"><CloseIcon className="w-6 h-6" /></button>
                </div>
                <div className="p-6 flex-1 flex flex-col md:flex-row gap-6 overflow-y-auto">
                    <div className="flex-1 md:flex-[2] relative bg-gray-100 dark:bg-black/20 rounded-lg">
                        {isProcessingMessage && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center z-20 rounded-lg"><div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-cyan-400"></div><p className="text-white mt-3 font-semibold">{isProcessingMessage}</p></div>}
                        <img src={image.src} alt={image.prompt} className="w-full h-full object-contain rounded-lg" />
                    </div>
                    <div className="flex-1 md:flex-[1] flex flex-col">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('details')}</h3>
                        <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700/50 max-h-48 overflow-y-auto">
                            <strong className='block mb-1'>{t('promptLabel')}:</strong>
                            <p className="font-mono text-xs whitespace-pre-wrap">{image.prompt}</p>
                        </div>
                        <div className="mt-auto pt-4 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => onUpscale(image.src, image.imageId, image.historyId)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><UpscaleIcon className="w-4 h-4" /> {t('tooltipUpscale')}</button>
                                <button onClick={() => onCrop(image.src, historyInfo.index, image.historyId, image.imageId)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><CropIcon className="w-4 h-4" /> {t('tooltipCrop')}</button>
                                <button onClick={() => onAdvancedEdit(image.src, historyInfo.index, image.historyId, image.imageId)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><AdjustmentsHorizontalIcon className="w-4 h-4" /> {t('advancedEditTitle')}</button>
                                <button onClick={() => onRemix(fullImage, historyInfo.index)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><RemixIcon className="w-4 h-4" /> {t('tooltipRemix')}</button>
                                <button onClick={() => onFix(fullImage, historyInfo.index)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><FixIcon className="w-4 h-4" /> {t('tooltipFix')}</button>
                                <button onClick={() => onDownload(image.src, historyInfo.index)} className="w-full flex items-center justify-center gap-2 p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors text-sm"><DownloadIcon className="w-4 h-4" /> {t('tooltipDownload')}</button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => onFavoriteToggle(image.historyId, image.imageId, isFavorite)} className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors text-sm ${isFavorite ? 'bg-yellow-400/20 text-yellow-500 hover:bg-yellow-400/30' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}><StarIcon className="w-4 h-4" filled={isFavorite}/> {isFavorite ? t('tooltipUnfavorite') : t('tooltipFavorite')}</button>
                                <button onClick={() => onSaveToGallery(fullImage, image.historyId)} className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors text-sm ${isInGallery ? 'bg-cyan-500/20 text-cyan-500 hover:bg-cyan-500/30' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}><BookmarkSquareIcon className="w-4 h-4" /> {isInGallery ? t('tooltipRemoveFromGallery') : t('tooltipSaveToGallery')}</button>
                            </div>
                            <button onClick={() => onDelete(image.historyId, image.imageId)} className="w-full flex items-center justify-center gap-2 p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors text-sm"><TrashIcon className="w-4 h-4" /> {t('deleteImage')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
