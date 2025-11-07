import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import { generateImageWithPromptAndImages, upscaleImage, refinePrompt, generateNarrative } from './services/geminiService';
import { GenerateIcon, ImageIcon, DownloadIcon, CloseIcon, UploadIcon, HistoryIcon, UpscaleIcon, CropIcon, RefineIcon, SaveIcon, FilterIcon, RemixIcon, ExpandIcon, FixIcon, LockClosedIcon, QueueListIcon, CpuChipIcon, Squares2X2Icon, PrinterIcon, FolderIcon, TagIcon, FolderPlusIcon, SearchIcon, MicrophoneIcon, PencilSquareIcon, BeakerIcon, GlobeAltIcon, BookOpenIcon, AdjustmentsHorizontalIcon, ArrowsRightLeftIcon, CameraIcon, SparklesIcon } from './components/icons';
import { fileToBase64 } from './utils/fileUtils';

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.continuous = false;
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

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

const CropperModal: React.FC<{ imageSrc: string; onClose: () => void; onCrop: (croppedImageUrl: string) => void; }> = ({ imageSrc, onClose, onCrop }) => {
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
            <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-100">Crop Image</h2><button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 flex-1 overflow-y-auto flex justify-center items-center"><ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}><img ref={imgRef} src={imageSrc} onLoad={onImageLoad} style={{ maxHeight: '60vh' }} alt="Crop preview" /></ReactCrop></div>
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end items-center gap-4"><button onClick={onClose} className="bg-gray-600/50 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">Cancel</button><button onClick={handleApplyCrop} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Apply Crop</button></div>
            </div>
        </div>
    );
};

const SketchModal: React.FC<{ onClose: () => void; onSave: (dataUrl: string) => void; }> = ({ onClose, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = "#111827";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = "white";
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
            <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg flex flex-col">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-100">Sketch Pose / Structure</h2><button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6"><canvas ref={canvasRef} width="400" height="400" className="bg-gray-900 rounded-md cursor-crosshair w-full" onMouseDown={startDrawing} onMouseUp={stopDrawing} onMouseOut={stopDrawing} onMouseMove={draw}></canvas></div>
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end items-center gap-4"><button onClick={onClose} className="bg-gray-600/50 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">Cancel</button><button onClick={handleSave} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Use Sketch</button></div>
            </div>
        </div>
    );
};

const NarrativeModal: React.FC<{ images: GeneratedImage[]; onClose: () => void; }> = ({ images, onClose }) => {
    const [narrative, setNarrative] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const generate = async () => {
            try {
                const imageParts = images.map(img => ({
                    mimeType: img.src.match(/data:(.*);base64/)?.[1] || 'image/jpeg',
                    data: img.src.split(',')[1]
                }));
                const result = await generateNarrative(imageParts);
                setNarrative(result);
            } catch (err) {
                setNarrative(err instanceof Error ? err.message : "Failed to generate narrative.");
            } finally {
                setIsLoading(false);
            }
        };
        generate();
    }, [images]);

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-100">AI Narrative Generator</h2><button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 flex-1 overflow-y-auto">
                    {isLoading ? <div className="text-center py-8"><div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-cyan-400 mx-auto"></div><p className="mt-2 text-sm text-gray-400">Gemini is writing...</p></div> : <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{narrative}</p>}
                </div>
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end"><button onClick={onClose} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Close</button></div>
            </div>
        </div>
    );
};


const DEFAULT_PROMPT = `A vertical frame 2160x3840 pixels (4K). A triptych of three equally sized horizontal images. The main character is a young man with glasses, sad and nostalgic expression, deep lonely eyes, wearing a loose winter puffer set, wide-leg pants, and a black scarf. The atmosphere is snowy and cold, with a melancholic color palette.
Image 1 (portrait): Character holds a transparent umbrella, looking back at the frame sorrowfully. Background is blurred white snow.
Image 2 (full body): Character with umbrella, alone in a vast snowy field, looking up to catch snowflakes. Shot from above. Distant bare trees. Conveys smallness and isolation.
Image 3 (close-up): Zoomed-in on the character's sorrowful, yearning eyes.`;
interface UploadedImage { file: File; base64: string; }
interface GeneratedImage { src: string; isUpscaling: boolean; tags: string[]; }
interface HistoryItem { id: string; prompt: string; negativePrompt: string; uploadedImages: UploadedImage[]; generatedImages: string[]; settings: any; tags: string[]; folderId?: string; }
interface Folder { id: string; name: string; }

const Placeholder: React.FC<{ isLoading?: boolean, seriesProgress?: {current: number, total: number} }> = ({ isLoading = false, seriesProgress }) => (
  <div className="w-full h-full min-h-[400px] max-w-7xl bg-black/20 rounded-lg flex flex-col justify-center items-center p-8 text-center border border-gray-800">
    {isLoading ? (
      <>
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-cyan-500"></div>
        <p className="mt-4 text-gray-200 font-semibold text-lg">{seriesProgress ? `Generating series... (${seriesProgress.current}/${seriesProgress.total})` : 'Generating your vision...'}</p>
        <p className="text-sm text-gray-400">This can take a few moments. Please wait.</p>
      </>
    ) : (
      <>
        <ImageIcon className="w-24 h-24 text-gray-700" />
        <p className="mt-4 text-xl text-gray-400 font-semibold">Viewport</p>
        <p className="text-sm text-gray-500">Your generated images will appear here.</p>
      </>
    )}
  </div>
);

const HistoryModal: React.FC<{ history: HistoryItem[]; folders: Folder[]; onClose: () => void; onUpdateHistory: (updatedHistory: HistoryItem[]) => void; onUpdateFolders: (updatedFolders: Folder[]) => void; }> = ({ history, folders, onClose, onUpdateHistory, onUpdateFolders }) => {
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [newFolderName, setNewFolderName] = useState('');

    const handleAddFolder = () => {
        if (newFolderName.trim()) {
            onUpdateFolders([...folders, { id: Date.now().toString(), name: newFolderName.trim() }]);
            setNewFolderName('');
        }
    };
    
    const filteredHistory = useMemo(() => {
        return [...history].reverse().filter(item => {
            const inFolder = activeFolderId ? item.folderId === activeFolderId : true;
            const matchesSearch = searchTerm.toLowerCase() ? item.prompt.toLowerCase().includes(searchTerm.toLowerCase()) || item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())) : true;
            return inFolder && matchesSearch;
        });
    }, [history, activeFolderId, searchTerm]);

    return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex justify-center items-start p-4 overflow-y-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl w-full max-w-7xl my-8 flex h-[90vh]">
             <div className="w-64 bg-black/20 border-r border-gray-700 p-4 flex flex-col">
                <h3 className="text-lg font-semibold text-white mb-4">Projects</h3>
                <button onClick={() => setActiveFolderId(null)} className={`w-full text-left p-2 rounded-md text-sm mb-2 transition-colors ${!activeFolderId ? 'bg-cyan-600/50 text-white' : 'hover:bg-gray-700/50'}`}>All Generations</button>
                <div className="flex-1 overflow-y-auto">{folders.map(folder => (<button key={folder.id} onClick={() => setActiveFolderId(folder.id)} className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 transition-colors ${activeFolderId === folder.id ? 'bg-cyan-600/50 text-white' : 'hover:bg-gray-700/50'}`}><FolderIcon className="w-4 h-4" /> {folder.name}</button>))}</div>
                <div className="mt-auto pt-4 border-t border-gray-700"><div className="flex gap-2"><input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="New Project..." className="flex-1 bg-gray-700 text-xs rounded-md p-2 border-gray-600 focus:ring-cyan-500 focus:border-cyan-500" /><button onClick={handleAddFolder} className="bg-cyan-600 p-2 rounded-md hover:bg-cyan-700"><FolderPlusIcon className="w-5 h-5"/></button></div></div>
             </div>
             <div className="flex-1 flex flex-col">
                <div className="sticky top-0 bg-gray-800/90 backdrop-blur-sm z-10 px-6 py-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-white">Generation History</h2><button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 relative"><SearchIcon className="w-5 h-5 text-gray-400 absolute top-9 left-9" /><input type="text" placeholder="Search by prompt or #tag..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2 pl-10 mb-6 text-sm"/></div>
                <div className="px-6 pb-6 flex-1 overflow-y-auto">
                    {filteredHistory.length === 0 ? <p className="text-gray-400 text-center py-8">No matching generations found.</p> : filteredHistory.map(item => (
                        <details key={item.id} className="bg-gray-900/50 p-4 rounded-lg mb-4">
                            <summary className="cursor-pointer font-semibold text-gray-200 hover:text-cyan-400">Generated on {new Date(parseInt(item.id)).toLocaleString()}</summary>
                            <div className="mt-4 border-t border-gray-700 pt-4"><h4 className="font-bold text-gray-300">Prompt:</h4><p className="text-sm text-gray-400 mb-2 font-mono whitespace-pre-wrap p-2 bg-black/20 rounded-md">{item.prompt}</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">{item.generatedImages.map((img, idx) => <img key={idx} src={img} className="rounded-md" alt={`Generated ${idx}`} />)}</div></div>
                        </details>
                    ))}
                </div>
             </div>
        </div>
    </div>
    )
};

const FILTERS: { [key: string]: string } = { 'none': '', 'sepia': 'sepia(1)', 'grayscale': 'grayscale(1)', 'vintage': 'sepia(0.6) contrast(1.1) brightness(0.9) saturate(1.2)' };
const PrintExportModal: React.FC<{ imageSrc: string; onClose: () => void; }> = ({ imageSrc, onClose }) => {
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
            <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg">
                <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-100">Print-Ready Export</h2><button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-6 h-6" /></button></div>
                <div className="p-6 space-y-4">
                    <img src={imageSrc} alt="Export preview" className="max-h-64 w-full object-contain rounded-md bg-black/20" />
                    <div><label htmlFor="dpi-input" className="block text-sm font-medium text-gray-300">Resolution (DPI)</label><input id="dpi-input" type="number" value={dpi} onChange={e => setDpi(parseInt(e.target.value) || 72)} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg p-2" /></div>
                    <div className="text-sm text-gray-400 bg-gray-900/50 p-3 rounded-lg">Calculated Print Size: <span className="font-bold text-white">{dimensions.width.toFixed(2)}" x {dimensions.height.toFixed(2)}"</span></div>
                    <div><label htmlFor="format-select" className="block text-sm font-medium text-gray-300">Format</label><select id="format-select" value={format} onChange={e => setFormat(e.target.value as 'jpeg' | 'png')} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg p-2"><option value="jpeg">JPEG (High Quality)</option><option value="png">PNG (Lossless)</option></select></div>
                </div>
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-4"><button onClick={onClose} className="bg-gray-600/50 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600">Cancel</button><button onClick={handleDownload} className="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Export</button></div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [negativePrompt, setNegativePrompt] = useState<string>('bad anatomy, extra limbs, blurry, watermark, text, signature');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [controlNetImage, setControlNetImage] = useState<UploadedImage | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [croppingImage, setCroppingImage] = useState<{ src: string; index: number } | null>(null);
  const [printExportImage, setPrintExportImage] = useState<string | null>(null);
  const [activeLab, setActiveLab] = useState('core');
  
  // Voice Prompt
  const [isListening, setIsListening] = useState(false);

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
  const [styleProfiles, setStyleProfiles] = useState<Record<string, any>>({});
  const [newProfileName, setNewProfileName] = useState<string>('');
  const [watermark, setWatermark] = useState({ enabled: true, text: 'Dannz Generator' });
  const [activeFilters, setActiveFilters] = useState<Record<number, string>>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlNetInputRef = useRef<HTMLInputElement>(null);
  const fineTuneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
        const savedProfiles = localStorage.getItem('dannz-style-profiles'); if (savedProfiles) setStyleProfiles(JSON.parse(savedProfiles));
        const savedHistory = localStorage.getItem('dannz-generation-history'); if(savedHistory) setHistory(JSON.parse(savedHistory));
        const savedFolders = localStorage.getItem('dannz-project-folders'); if(savedFolders) setFolders(JSON.parse(savedFolders));
    } catch (e) { console.error("Failed to load data from localStorage", e); }
  }, []);

  const updateHistory = (newHistory: HistoryItem[]) => { setHistory(newHistory); localStorage.setItem('dannz-generation-history', JSON.stringify(newHistory)); }
  const updateFolders = (newFolders: Folder[]) => { setFolders(newFolders); localStorage.setItem('dannz-project-folders', JSON.stringify(newFolders)); }

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
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) { setError("Could not create canvas context to download image."); return; }
        const filterCss = FILTERS[activeFilters[index] || 'none']; if (filterCss) { ctx.filter = filterCss; }
        ctx.drawImage(img, 0, 0);
        if (watermark.enabled && watermark.text) {
            ctx.filter = 'none';
            const fontSize = Math.max(24, Math.min(canvas.width / 30, canvas.height / 30));
            ctx.font = `bold ${fontSize}px 'Inter', sans-serif`; ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
            ctx.fillText(watermark.text, canvas.width - (fontSize/2), canvas.height - (fontSize/2));
        }
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/jpeg', 0.9); link.download = `dannz_generated_image_${Date.now()}.jpeg`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
    img.src = base64Image;
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

  const handleSubmit = useCallback(async (isSeries = false) => {
    const isSeriesRun = isSeries && seriesBasePrompt && seriesChanges.trim();
    const changes = isSeriesRun ? seriesChanges.trim().split('\n').filter(line => line.trim() !== '') : [];
    
    if (isSeriesRun && changes.length === 0) {
        setError("Please provide a base prompt and at least one sequential change for the series.");
        return;
    }
    if (!isSeriesRun && !prompt) { setError('Please provide a prompt.'); return; }
    
    setIsLoading(true); setError(null); setGeneratedImages([]); setActiveFilters({});
    
    const combinedResults: string[] = [];
    const runCount = isSeriesRun ? changes.length : 1;

    try {
      for (let i = 0; i < runCount; i++) {
        if (isSeriesRun) setSeriesProgress({ current: i + 1, total: changes.length });
        
        const currentPromptText = isSeriesRun ? `${seriesBasePrompt}\n\nStep ${i+1}/${changes.length}: ${changes[i]}` : prompt;
        const fullPromptForStep = buildFullPrompt(currentPromptText);

        const allImages = [...uploadedImages, ...(controlNetImage ? [controlNetImage] : [])];
        const imageParts = allImages.map(img => ({ mimeType: img.file.type, data: img.base64.split(',')[1] }));

        const results = await generateImageWithPromptAndImages(fullPromptForStep, imageParts);
        combinedResults.push(...results);
      }
      
      setGeneratedImages(combinedResults.map(src => ({ src, isUpscaling: false, tags: [] })));
      
      const currentSettings = { faceLockIntensity, preserveGlasses, controlNetType, aspectRatio, baseModel, characterIds, consistencyLock, stylisticBudget, simulatedForce, cameraSensor, seriesChanges: isSeriesRun ? seriesChanges : undefined };
      const historyItem: HistoryItem = { id: Date.now().toString(), prompt: isSeriesRun ? `Series: ${seriesBasePrompt}` : prompt, negativePrompt, uploadedImages, generatedImages: combinedResults, settings: currentSettings, tags: isSeriesRun ? ['series'] : [] };
      updateHistory([...history, historyItem]);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(isSeriesRun ? `Error on step ${seriesProgress?.current || 1}: ${errorMessage}` : errorMessage);
    } finally {
      setIsLoading(false);
      setSeriesProgress(null);
    }
  }, [prompt, negativePrompt, uploadedImages, controlNetImage, aspectRatio, faceLockIntensity, preserveGlasses, controlNetType, baseModel, characterIds, consistencyLock, stylisticBudget, simulatedForce, cameraSensor, history, seriesBasePrompt, seriesChanges]);

  const handleUpscale = async (imageSrc: string, index: number) => {
    setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, isUpscaling: true } : img));
    try {
        const [upscaledImage] = await upscaleImage(imageSrc);
        setGeneratedImages(prev => prev.map((img, i) => i === index ? { src: upscaledImage, isUpscaling: false, tags: img.tags } : img));
    } catch (err) {
        setError("Failed to upscale image. Please try again.");
        setGeneratedImages(prev => prev.map((img, i) => i === index ? { ...img, isUpscaling: false } : img));
    }
  }

  const handleRefinePrompt = async () => {
      if (!prompt) return; setIsRefining(true); setError(null);
      try { setPrompt(await refinePrompt(prompt)); } 
      catch (err) { setError(err instanceof Error ? err.message : "Failed to refine prompt."); } 
      finally { setIsRefining(false); }
  };
  
  const handleCropComplete = (croppedImageSrc: string) => {
    if (croppingImage) setGeneratedImages(prev => prev.map((img, i) => i === croppingImage.index ? { ...img, src: croppedImageSrc } : img));
    setCroppingImage(null);
  };
  
  const LabButton: React.FC<{labName: string; children: React.ReactNode; icon: React.ReactNode}> = ({labName, children, icon}) => (
    <button onClick={() => setActiveLab(labName)} className={`flex-1 p-2 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-colors ${activeLab === labName ? 'bg-cyan-600/80 text-white' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>{icon}{children}</button>
  );

  return (
    <>
    {croppingImage && <CropperModal imageSrc={croppingImage.src} onClose={() => setCroppingImage(null)} onCrop={handleCropComplete} />}
    {printExportImage && <PrintExportModal imageSrc={printExportImage} onClose={() => setPrintExportImage(null)} />}
    {showHistory && <HistoryModal history={history} folders={folders} onUpdateHistory={updateHistory} onUpdateFolders={updateFolders} onClose={() => setShowHistory(false)}/>}
    {showSketch && <SketchModal onClose={() => setShowSketch(false)} onSave={handleSketchSave} />}
    {showNarrative && <NarrativeModal images={generatedImages} onClose={() => setShowNarrative(false)} />}

    <div className="min-h-screen bg-gray-900 text-gray-200 flex font-sans antialiased">
      <nav className="w-16 bg-black/30 border-r border-gray-800 flex flex-col items-center py-4 space-y-6">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-bold text-black text-xl">D</div>
          <button className="p-2 rounded-lg bg-gray-700/50 text-cyan-400" title="Generator Workspace"><Squares2X2Icon className="w-6 h-6" /></button>
          <button onClick={() => setShowHistory(true)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-700/50 hover:text-cyan-400" title="Generation History"><HistoryIcon className="w-6 h-6"/></button>
      </nav>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        {isLoading ? <Placeholder isLoading={true} seriesProgress={seriesProgress} /> : generatedImages.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 w-full max-w-7xl grid-cols-1">
            {generatedImages.map((image, index) => (
              <div key={index} className="rounded-lg overflow-hidden bg-black/20 shadow-lg relative group">
                {image.isUpscaling && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center z-20"><div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-cyan-400"></div><p className="text-white mt-3 font-semibold">Upscaling...</p></div>}
                <img src={image.src} alt={`Generated image ${index + 1}`} className="w-full h-full object-contain" style={{ filter: FILTERS[activeFilters[index] || 'none'] }}/>
                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={() => setShowNarrative(true)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500" aria-label="Generate Narrative"><BookOpenIcon className="w-5 h-5"/></button>
                    <button onClick={() => setPrintExportImage(image.src)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500" aria-label="Print-ready export"><PrinterIcon className="w-5 h-5"/></button>
                    <button onClick={() => setCroppingImage({ src: image.src, index: index })} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500" aria-label="Crop image"><CropIcon className="w-5 h-5"/></button>
                    <button onClick={() => handleUpscale(image.src, index)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500" aria-label="Upscale to 8K"><UpscaleIcon className="w-5 h-5"/></button>
                    <button onClick={() => handleDownloadImage(image.src, index)} className="bg-black/50 backdrop-blur-sm text-white p-2.5 rounded-full hover:bg-cyan-500" aria-label="Download image"><DownloadIcon className="w-5 h-5"/></button>
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-auto flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/50 backdrop-blur-sm p-1.5 rounded-full border border-gray-700">
                    <select onChange={(e) => setActiveFilters(p => ({...p, [index]: e.target.value}))} defaultValue="none" className="text-xs bg-transparent text-white border-0 focus:ring-0 appearance-none pl-2 pr-6" style={{backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.2em 1.2em'}}>
                        <option value="none">Filter</option><option value="sepia">Sepia</option><option value="grayscale">Grayscale</option><option value="vintage">Vintage</option>
                    </select>
                    <div className="w-px h-5 bg-gray-600 mx-1"></div>
                    <button onClick={() => alert('Remix: Re-generate this image with a new prompt.')} className="text-white p-2 rounded-full hover:bg-white/10" aria-label="Remix Image"><RemixIcon className="w-4 h-4"/></button>
                    <button onClick={() => alert('Expand Canvas: Use AI to expand the image beyond its original borders.')} className="text-white p-2 rounded-full hover:bg-white/10" aria-label="Expand Canvas"><ExpandIcon className="w-4 h-4"/></button>
                    <button onClick={() => alert('Fix Imperfections: Select an area of the image to fix with a new prompt.')} className="text-white p-2 rounded-full hover:bg-white/10" aria-label="Fix Imperfections"><FixIcon className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
          </div>
        ) : <Placeholder />}
      </main>

      <aside className="w-full lg:w-[400px] xl:w-[450px] bg-black/30 border-l border-gray-800 p-6 flex flex-col">
        <header className="mb-6"><h1 className="text-xl font-semibold text-white">Meta-Creative Studio</h1><p className="text-sm text-gray-400">Your cognitive creative partner.</p></header>
        
        <div className="flex bg-gray-900/50 p-1 rounded-lg mb-4 border border-gray-700/50"><LabButton labName="core" icon={<SparklesIcon className="w-4 h-4"/>}>Core</LabButton><LabButton labName="structure" icon={<AdjustmentsHorizontalIcon className="w-4 h-4"/>}>Structure</LabButton><LabButton labName="advanced" icon={<BeakerIcon className="w-4 h-4"/>}>Advanced</LabButton></div>

        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-2 -mr-4">
            {/* CORE LAB */}
            {activeLab === 'core' && (<>
                <div className="flex flex-col"><div className="flex justify-between items-center mb-2"><label htmlFor="prompt" className="block text-sm font-medium text-gray-300">Prompt</label><button onClick={handleRefinePrompt} disabled={isRefining || !prompt} className="text-xs bg-cyan-600/50 text-white font-semibold py-1 px-2 rounded-md flex items-center gap-1 hover:bg-cyan-600/80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">{isRefining ? 'Refining...' : <><RefineIcon className="w-4 h-4"/> AI Refine</>}</button></div>
                <div className="relative"><textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A detailed description of the image..." className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-500 font-mono text-xs" rows={6}/><button onClick={handleToggleListening} className={`absolute bottom-2 right-2 p-2 rounded-full transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`} title="Voice-to-Prompt"><MicrophoneIcon className="w-4 h-4 text-white"/></button></div></div>
                <div><label htmlFor="negativePrompt" className="block text-sm font-medium text-gray-300 mb-2">Negative Prompt</label><textarea id="negativePrompt" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="e.g., bad anatomy, blurry, text" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-cyan-500 placeholder:text-gray-500 font-mono text-xs" rows={2}/></div>
                <details className="space-y-2"><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none flex items-center justify-between p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">Series Generator<span className="text-xs text-gray-500">{'>'}</span></summary><div><label htmlFor="seriesBasePrompt" className="block text-xs font-medium text-gray-400 mb-1">Base Prompt</label><textarea id="seriesBasePrompt" value={seriesBasePrompt} onChange={e=>setSeriesBasePrompt(e.target.value)} rows={3} className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-xs" placeholder="e.g., A character standing in a field."/></div><div><label htmlFor="seriesChanges" className="block text-xs font-medium text-gray-400 mb-1">Sequential Changes (one per line)</label><textarea id="seriesChanges" value={seriesChanges} onChange={e=>setSeriesChanges(e.target.value)} rows={4} className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-xs" placeholder="e.g., The character smiles."/></div><button onClick={() => handleSubmit(true)} disabled={isLoading || !seriesBasePrompt} className="w-full mt-2 bg-purple-600/80 text-white text-sm font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-purple-600 disabled:bg-gray-700">Generate Series</button></details>
            </>)}
            {/* STRUCTURE LAB */}
            {activeLab === 'structure' && (<>
                <details className="space-y-2" open><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">Face & Character Reference</summary><div className="bg-gray-800/30 border-2 border-dashed border-gray-700 rounded-lg p-3"><input type="file" accept="image/*" onChange={handleImageUpload(false)} className="hidden" ref={fileInputRef} id="image-upload" multiple/><button onClick={() => fileInputRef.current?.click()} className="bg-gray-700/50 text-gray-300 text-sm font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-700 w-full"><UploadIcon className="w-5 h-5"/> Select Face(s) (Max 5)</button></div>{uploadedImages.length > 0 && (<div className="grid grid-cols-5 gap-2 mt-2">{uploadedImages.map((image, index) => (<div key={index} className="relative group"><img src={image.base64} alt={`upload-preview-${index}`} className="w-full h-full object-cover rounded-md aspect-square"/><button onClick={() => handleRemoveImage(index, false)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="Remove image"><CloseIcon className="w-4 h-4" /></button></div>))}</div>)}<div className="space-y-3 mt-3 bg-gray-800/30 p-3 rounded-lg"><div><label htmlFor="characterIds" className="block text-xs text-gray-400 mb-1">Character IDs (comma-separated)</label><input type="text" id="characterIds" value={characterIds} onChange={(e) => setCharacterIds(e.target.value)} placeholder="e.g., Dannz-001, Friend-002" className="w-full bg-gray-700/50 border border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"/></div><label className="flex items-center justify-between text-xs text-gray-400">Face Lock Intensity: <span className="font-semibold text-gray-200">{Math.round(faceLockIntensity * 100)}%</span></label><input type="range" min="0.1" max="1" step="0.05" value={faceLockIntensity} onChange={e => setFaceLockIntensity(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500" disabled={preserveGlasses}/><div className="flex items-center"><input type="checkbox" id="preserveGlasses" checked={preserveGlasses} onChange={e => setPreserveGlasses(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-cyan-600 focus:ring-cyan-500"/><label htmlFor="preserveGlasses" className="ml-2 block text-xs text-gray-300">Preserve Glasses & Hair Only</label></div></div></details>
                <details className="space-y-2" open><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">Pose & Environment Control</summary><div className="bg-gray-800/30 border-2 border-dashed border-gray-700 rounded-lg p-3 grid grid-cols-2 gap-2"><input type="file" accept="image/*" onChange={handleImageUpload(true)} className="hidden" ref={controlNetInputRef} id="controlnet-upload"/><button onClick={() => controlNetInputRef.current?.click()} className="bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-700"><UploadIcon className="w-4 h-4"/> Upload Pose</button><button onClick={() => setShowSketch(true)} className="bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-700"><PencilSquareIcon className="w-4 h-4"/> Sketch Pose</button></div>{controlNetImage && <div className="relative group w-full mt-2"><img src={controlNetImage.base64} className="w-full rounded-md"/><button onClick={() => handleRemoveImage(0, true)} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white opacity-0 group-hover:opacity-100"><CloseIcon className="w-4 h-4" /></button></div>}<div className="space-y-3 mt-3 bg-gray-800/30 p-3 rounded-lg"><div><label htmlFor="controlNetType" className="block text-xs text-gray-400 mb-1">ControlNet Type</label><select id="controlNetType" value={controlNetType} onChange={e => setControlNetType(e.target.value as any)} className="w-full bg-gray-700/50 border border-gray-600 text-xs rounded-lg p-2 focus:ring-cyan-500 focus:border-cyan-500"><option>OpenPose</option><option>Depth Map</option><option>Canny Edge</option></select></div><button onClick={handleAddGeoLocation} className="w-full bg-gray-700/50 text-xs font-semibold py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-gray-700"><GlobeAltIcon className="w-4 h-4"/> Use Geo-Location Context</button></div></details>
            </>)}
            {/* ADVANCED LAB */}
            {activeLab === 'advanced' && (<>
                <details className="space-y-3" open><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">Technical & Stylistic Controls</summary>
                    <div className="bg-gray-800/30 p-3 rounded-lg space-y-3">
                        <div className="flex items-center justify-between"><label htmlFor="consistencyLock" className="text-xs text-gray-300">🔥 Consistency Lock</label><input type="checkbox" id="consistencyLock" checked={consistencyLock} onChange={e => setConsistencyLock(e.target.checked)} className="toggle-checkbox h-4 w-8 rounded-full appearance-none bg-gray-700 checked:bg-cyan-500 transition-colors cursor-pointer"/></div>
                        <div><label htmlFor="stylisticBudget" className="flex items-center justify-between text-xs text-gray-400">Stylistic Deviation Budget: <span className="font-semibold text-gray-200">{stylisticBudget}%</span></label><input type="range" min="0" max="100" step="1" value={stylisticBudget} onChange={e => setStylisticBudget(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500 mt-1"/></div>
                        <div><label htmlFor="aspectRatio" className="block text-xs text-gray-400 mb-1">Aspect Ratio</label><select id="aspectRatio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-xs rounded-lg p-2"><option>2160x3840 Vertical Frame</option><option>1:1 (Square)</option><option>16:9 (Widescreen)</option><option>9:16 (Story/Reels)</option><option>4:5 (Instagram Portrait)</option><option>2.35:1 (Cinemascope)</option></select></div>
                        <div><label htmlFor="baseModel" className="block text-xs text-gray-400 mb-1">Base Model</label><select id="baseModel" value={baseModel} onChange={e => setBaseModel(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-xs rounded-lg p-2"><option>Photorealism V3</option><option>Stylized V1</option><option>Anime Diffusion XL</option></select></div>
                    </div>
                </details>
                <details className="space-y-3"><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">Physics & Camera Simulation</summary>
                     <div className="bg-gray-800/30 p-3 rounded-lg space-y-3">
                        <div><label htmlFor="simulatedForce" className="flex items-center justify-between text-xs text-gray-400">Simulate Wind/Force: <span className="font-semibold text-gray-200">{simulatedForce}</span></label><input type="range" min="0" max="10" step="1" value={simulatedForce} onChange={e => setSimulatedForce(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-500 mt-1"/></div>
                        <div><label htmlFor="cameraSensor" className="block text-xs text-gray-400 mb-1">Camera Sensor / Film Stock</label><select id="cameraSensor" value={cameraSensor} onChange={e => setCameraSensor(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 text-xs rounded-lg p-2"><option>Default</option><option>Fuji X-Trans</option><option>Sony IMX</option><option>Kodak Portra 400</option><option>Ilford HP5 Plus</option></select></div>
                        <button onClick={() => alert("Material Editor (PBR) is a future feature.")} className="w-full text-xs bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700">Material Editor</button>
                    </div>
                </details>
                <details className="space-y-3"><summary className="text-sm font-medium text-gray-300 cursor-pointer list-none p-2 -mx-2 hover:bg-gray-800/50 rounded-lg">AI Experimentation Lab</summary>
                     <div className="bg-gray-800/30 p-3 rounded-lg space-y-2 text-center">
                        <p className="text-xs text-gray-500 mb-2">Advanced tools for AI Engineers</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => alert("A/B Testing Auto-Run is a future feature.")} className="w-full text-xs bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700">A/B Testing</button>
                          <button onClick={() => alert("Latent Space Interpolation is a future feature.")} className="w-full text-xs bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700">Latent Interpolation</button>
                          <button onClick={() => alert("Self-Correction Loop is a future feature.")} className="w-full text-xs bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700">Self-Correction Loop</button>
                          <input type="file" accept="image/*" onChange={handleImageUpload(false, true)} className="hidden" ref={fineTuneInputRef} id="finetune-upload" multiple/>
                          <button onClick={() => fineTuneInputRef.current?.click()} className="w-full text-xs bg-gray-700/50 p-2 rounded-lg hover:bg-gray-700">Fine-Tune Model</button>
                        </div>
                    </div>
                </details>
            </>)}
        </div>

        <div className="mt-auto pt-6 border-t border-gray-800">
            <button onClick={() => handleSubmit(false)} disabled={isLoading || !prompt} className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyan-600/20">
              {isLoading ? (<><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"></div><span>Generating...</span></>) : (<><GenerateIcon className="w-5 h-5"/>Generate</>)}
            </button>
            {error && <div role="alert" className="mt-4 bg-red-900/50 border border-red-500/50 text-red-300 p-3 rounded-lg text-sm">{error}</div>}
        </div>
      </aside>

    </div>
    <style>{`.toggle-checkbox:checked { background-color: #06b6d4; } .toggle-checkbox:checked::before { transform: translateX(1rem); } .toggle-checkbox::before { content: ''; display: block; width: 1rem; height: 1rem; border-radius: 9999px; background-color: white; transition: transform 0.2s ease-in-out; }`}</style>
    </>
  );
};

export default App;