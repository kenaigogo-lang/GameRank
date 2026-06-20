import React, { useState, useEffect, useRef } from 'react';
import { Platform, Game, GENRE_OPTIONS } from '../types';
import { getGameGenre } from '../services/geminiService';
import { searchUnifiedGames, UnifiedGame } from '../services/igdbService';
import { X, Loader2, Save, Upload, Image as ImageIcon, ChevronDown, Tags, Check, RotateCcw, Clipboard, Globe, Search, Sparkles } from 'lucide-react';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, platform: Platform, score: number, comment: string, genre: string, ratingDate: string, imageUrl: string, playtime: number) => void;
  initialData?: Game | null;
}

// Generate scores from 10 down to 1 in 0.5 steps
const SCORE_OPTIONS = Array.from({ length: 19 }, (_, i) => {
  const val = 10 - i * 0.5;
  return val % 1 === 0 ? val.toString() : val.toFixed(1);
});

// Tag Categories Definition
const TAG_CATEGORIES = [
  {
    id: 'positive',
    label: '✅ 正面評價 (推坑)',
    colorClass: 'bg-emerald-900/40 text-emerald-200 border-emerald-700 hover:bg-emerald-800/60',
    selectedClass: 'bg-emerald-600 text-white border-emerald-500',
    tags: [
      '#畫面精美', '#劇情神作', '#美術風格獨特', '#打擊感爽', '#地圖設計精妙',
      '#音樂神曲', '#沉浸感絕佳', '#角色刻畫生動', '#創意十足', '#優化良好'
    ]
  },
  {
    id: 'negative',
    label: '❌ 負面評價 (勸退)',
    colorClass: 'bg-red-900/40 text-red-200 border-red-700 hover:bg-red-800/60',
    selectedClass: 'bg-red-600 text-white border-red-500',
    tags: [
      '#優化極差', '#BUG多', '#作業感重', '#操作手感差', '#流程太短',
      '#劇情爛尾', '#視角鏡頭爛', '#新手引導差', '#翻譯品質差'
    ]
  },
  {
    id: 'neutral',
    label: '⚖️ 風格與節奏 (中性)',
    colorClass: 'bg-indigo-900/40 text-indigo-200 border-indigo-700 hover:bg-indigo-800/60',
    selectedClass: 'bg-indigo-600 text-white border-indigo-500',
    tags: [
      '#硬派高難', '#休閒療癒', '#極度燒腦', '#節奏慢熱', '#恐怖壓抑', '#重視探索',
      '#電影式敘事', '#多重結局', '#自由度高', '#一本道流程', '#文字量大', '#懷舊復古'
    ]
  }
];

export const AddGameModal: React.FC<AddGameModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<Platform>(Platform.PS);
  const [score, setScore] = useState<number>(8); // Default score is 8
  const [comment, setComment] = useState('');
  
  // Changed from single string to string array
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  
  const [ratingDate, setRatingDate] = useState(new Date().toISOString().split('T')[0]);
  const [playtime, setPlaytime] = useState<number | ''>('');
  const [imageUrl, setImageUrl] = useState('');
  
  const [isGettingInfo, setIsGettingInfo] = useState(false);

  // Custom Score Select State
  const [isScoreOpen, setIsScoreOpen] = useState(false);
  const scoreRef = useRef<HTMLDivElement>(null);

  // Custom Genre Select State
  const [isGenreOpen, setIsGenreOpen] = useState(false);
  const genreRef = useRef<HTMLDivElement>(null);

  // Tag Selector State
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const tagSelectorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedGame[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchFilter, setActiveSearchFilter] = useState<'ALL' | 'STEAM' | 'IGDB' | 'GOOGLE'>('ALL');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setPlatform(initialData.platform);
        setScore(initialData.score);
        setComment(initialData.comment);
        
        // Split comma-separated string back to array
        if (initialData.genre) {
            setSelectedGenres(initialData.genre.split(', ').filter(Boolean));
        } else {
            setSelectedGenres([]);
        }
        
        setRatingDate(initialData.ratingDate);
        setPlaytime(initialData.playtime || '');
        setImageUrl(initialData.imageUrl || '');
      } else {
        // Reset form
        setTitle('');
        setScore(8); // Default to 8
        setComment('');
        setSelectedGenres([]);
        setRatingDate(new Date().toISOString().split('T')[0]);
        setPlaytime('');
        setImageUrl('');
        setPlatform(Platform.PS);
      }
      setSelectedTags([]); // Reset tags on open
      setIsTagSelectorOpen(false);
      setIsSearchOpen(false);
      setSearchResults([]);
      setActiveSearchFilter('ALL');
    }
  }, [isOpen, initialData]);

  // Click outside listener for custom select and tag selector
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scoreRef.current && !scoreRef.current.contains(event.target as Node)) {
        setIsScoreOpen(false);
      }

      if (genreRef.current && !genreRef.current.contains(event.target as Node)) {
        setIsGenreOpen(false);
      }
      
      // Check if click is outside BOTH the trigger area and the popup content
      const isOutsideTrigger = tagSelectorRef.current && !tagSelectorRef.current.contains(event.target as Node);
      const isOutsidePopup = popupRef.current && !popupRef.current.contains(event.target as Node);

      if (isOutsideTrigger && isOutsidePopup) {
        setIsTagSelectorOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!isOpen) return null;

  const handleGetInfo = async () => {
    if (!title) return;
    setIsGettingInfo(true);
    const fetchedGenre = await getGameGenre(title);
    if (fetchedGenre) {
      // Try to match the fetched genre to our list
      const matched = GENRE_OPTIONS.find(g => g === fetchedGenre) || fetchedGenre;
      // Auto fetch sets it as the single genre (or you could append it)
      setSelectedGenres([matched]);
    }
    setIsGettingInfo(false);
  };

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres(prev => {
        if (prev.includes(genre)) {
            return prev.filter(g => g !== genre);
        } else {
            return [...prev, genre];
        }
    });
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        if (prev.length >= 5) return prev; // Max 5 limit
        return [...prev, tag];
      }
    });
  };

  const handleResetTags = () => {
    setSelectedTags([]);
  };

  const handleInsertTags = () => {
    if (selectedTags.length === 0) {
      setIsTagSelectorOpen(false);
      return;
    }
    const tagsString = selectedTags.join(' ');
    setComment(tagsString); // Replaces current comment
    setSelectedTags([]);
    setIsTagSelectorOpen(false);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 400; // Resize to max 400px to save storage

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        setImageUrl(canvas.toDataURL('image/jpeg', 0.8)); // Compress quality
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePasteClick = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
         throw new Error("Clipboard API not fully supported");
      }

      // @ts-ignore
      const clipboardItems = await navigator.clipboard.read();
      
      for (const item of clipboardItems) {
        const imageType = item.types.find((type: string) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "pasted-image.png", { type: blob.type });
          processFile(file);
          return;
        }
      }
      
      alert("No image found in clipboard. Please copy an image first.");
    } catch (err: any) {
      console.error("Clipboard Error:", err);
      // Specific handling for Permission/Policy errors
      if (err.name === 'NotAllowedError' || err.message?.includes('blocked') || err.message?.includes('permission')) {
          alert("⚠️ Browser blocked direct access.\n\nDon't worry! You can still paste:\n👉 Click anywhere on the form and press Ctrl+V (or Cmd+V).");
      } else {
          alert("Could not paste via button.\n\nPlease try pressing Ctrl+V (or Cmd+V) instead.");
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault(); // Prevent pasting into inputs if it's an image
          processFile(file);
          return; // Only process the first image found
        }
      }
    }
  };

  // Search Logic
  const openSearchModal = () => {
    const trimmedTitle = title.trim();
    setSearchQuery(trimmedTitle);
    setSearchResults([]);
    setActiveSearchFilter('ALL');
    setIsSearchOpen(true);
    if (trimmedTitle) {
        handleSearchSubmit(trimmedTitle);
    }
  };

  const handleSearchSubmit = async (queryStr: string) => {
    if (!queryStr) return;
    setIsSearching(true);
    setSearchResults([]);
    setActiveSearchFilter('ALL');
    const results = await searchUnifiedGames(queryStr);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleSelectImage = async (url: string) => {
    setIsSearching(true);
    try {
        // Use img element to load and render the image to avoid CORS issues
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            
            // Convert canvas to blob and process
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], "cover_image.jpg", { type: 'image/jpeg' });
                    processFile(file);
                }
                setIsSearchOpen(false);
                setIsSearching(false);
            }, 'image/jpeg', 0.8);
        };
        
        img.onerror = () => {
            console.error("Failed to load image", url);
            alert("Failed to load image. Please try another one.");
            setIsSearching(false);
        };
        
        img.src = url;
    } catch (error) {
        console.error("Failed to select image", error);
        alert("Failed to process image. Please try another one.");
        setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !comment) return;
    
    // Join genres into a single string for storage
    const genreString = selectedGenres.join(', ');
    
    onSave(title, platform, score, comment, genreString, ratingDate, imageUrl, Number(playtime) || 0);
  };

  const getScoreColorClass = (val: number) => {
    const normalized = val > 10 ? val / 10 : val;
    if (normalized >= 9.0) return 'text-emerald-400';
    if (normalized >= 7.5) return 'text-blue-400';
    if (normalized >= 6.0) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Filter Search Results logic
  const getFilteredResults = () => {
    if (activeSearchFilter === 'ALL') return searchResults;
    return searchResults.filter(r => r.source === activeSearchFilter);
  };
  
  const getSourceCount = (source: 'STEAM' | 'IGDB' | 'GOOGLE') => {
      return searchResults.filter(r => r.source === source).length;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onPaste={handlePaste} // Add paste listener to the modal container
    >
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] relative">
        
        <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            {initialData ? 'Edit Game' : 'Add New Game'}
          </h2>
          {!isTagSelectorOpen && !isSearchOpen && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          {/* Title Input */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-400">Game Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Elden Ring"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
              required
            />
          </div>

          {/* Platform Select */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-400">Platform</label>
            <div className="grid grid-cols-4 gap-2">
              {[Platform.PS, Platform.XBOX, Platform.SWITCH, Platform.PC].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`px-1 py-2 rounded-lg text-xs sm:text-sm font-bold border transition-all truncate ${
                    platform === p
                      ? p === Platform.PS 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : p === Platform.XBOX
                          ? 'bg-[#107C10] border-green-600 text-white'
                          : p === Platform.SWITCH 
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Score, Playtime, Date */}
          <div className="flex gap-2 sm:gap-3">
            {/* Custom Score Select */}
            <div className="w-[4.5rem] sm:w-24 space-y-1 shrink-0" ref={scoreRef}>
              <label className="text-xs sm:text-sm font-medium text-slate-400 block truncate text-center">Score</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsScoreOpen(!isScoreOpen)}
                  className={`w-full h-11 bg-slate-950 border border-slate-700 rounded-lg px-2 flex items-center justify-between focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${isScoreOpen ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
                >
                  <span className={`flex-1 text-center font-bold text-lg ${getScoreColorClass(score)}`}>
                    {score}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isScoreOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isScoreOpen && (
                  <div className="absolute top-full left-0 w-full mt-1 max-h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 custom-scrollbar">
                     {!SCORE_OPTIONS.includes(score.toString()) && score > 10 && (
                        <button
                          type="button"
                          className="w-full text-center px-2 py-2 text-sm text-slate-300 border-b border-slate-800 bg-slate-800"
                        >
                          {score} (Legacy)
                        </button>
                     )}
                    {SCORE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setScore(Number(opt));
                          setIsScoreOpen(false);
                        }}
                        className={`w-full text-center px-2 py-2 text-sm font-medium transition-colors hover:bg-slate-800 ${
                          Number(opt) === score ? 'bg-slate-800 text-white' : 'text-slate-400'
                        }`}
                      >
                         <span className={getScoreColorClass(Number(opt))}>{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="w-[4.5rem] sm:w-24 space-y-1 shrink-0">
              <label className="text-xs sm:text-sm font-medium text-slate-400 block truncate text-center">Hrs</label>
               <input
                type="number"
                min="0"
                value={playtime}
                onChange={(e) => setPlaytime(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full h-11 bg-slate-950 border border-slate-700 rounded-lg px-2 sm:px-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center placeholder-slate-700 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1 min-w-0">
              <label className="text-xs sm:text-sm font-medium text-slate-400 block truncate text-center">Date</label>
              <input
                type="date"
                value={ratingDate}
                onChange={(e) => setRatingDate(e.target.value)}
                onClick={(e) => {
                  // Explicitly show picker on click for better UX
                  try {
                    if (typeof (e.target as any).showPicker === 'function') {
                      (e.target as any).showPicker();
                    }
                  } catch (error) {
                    // Ignore errors if browser doesn't support or blocks it
                  }
                }}
                className="w-full h-11 bg-slate-950 border border-slate-700 rounded-lg px-2 sm:px-3 text-white focus:outline-none focus:border-blue-500 text-sm cursor-pointer"
              />
            </div>
          </div>
          
           {/* Genre Select (Multi) & Auto Button */}
           <div className="space-y-1">
            <label className="text-sm font-medium text-slate-400">Genre</label>
            <div className="flex gap-2">
                <div className="relative flex-1" ref={genreRef}>
                  <button
                    type="button"
                    onClick={() => setIsGenreOpen(!isGenreOpen)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-left flex items-center justify-between focus:outline-none focus:border-blue-500 min-h-[38px]"
                  >
                    <span className={`text-sm block truncate ${selectedGenres.length === 0 ? 'text-slate-500' : 'text-white'}`}>
                      {selectedGenres.length === 0 ? 'Select Genre' : selectedGenres.join(', ')}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isGenreOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isGenreOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-56 overflow-y-auto custom-scrollbar">
                        {GENRE_OPTIONS.map((g) => {
                            const isSelected = selectedGenres.includes(g);
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => handleGenreToggle(g)}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800 flex items-center justify-between group"
                                >
                                    <span className={isSelected ? 'text-white font-medium' : 'text-slate-400 group-hover:text-slate-200'}>
                                        {g}
                                    </span>
                                    {isSelected && <Check className="w-4 h-4 text-blue-500" />}
                                </button>
                            );
                        })}
                    </div>
                  )}
                </div>

                <button
                    type="button"
                    onClick={handleGetInfo}
                    disabled={!title || isGettingInfo}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg flex items-center gap-2 transition-colors text-sm font-medium whitespace-nowrap"
                    title="Auto Fetch Genre"
                >
                    {isGettingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Auto
                </button>
            </div>
          </div>

          {/* Cover Image Upload */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-400">Game Cover</label>
            <div className="flex items-start gap-4">
              {imageUrl ? (
                <div className="relative group shrink-0">
                  <img src={imageUrl} alt="Cover Preview" className="w-20 h-28 object-cover rounded-lg border border-slate-700 bg-slate-950" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    title="Remove Image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-28 shrink-0 bg-slate-950 border border-slate-700 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-500 gap-1">
                  <ImageIcon className="w-6 h-6 opacity-50" />
                  <span className="text-[10px]">No Image</span>
                </div>
              )}
              
              <div className="flex-1">
                <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 cursor-pointer bg-slate-800 hover:bg-slate-700 text-white px-2 py-2 rounded-lg border border-slate-700 transition-colors h-full">
                      <Upload className="w-4 h-4" />
                      <span className="text-[10px] sm:text-sm font-medium">Upload</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="hidden" 
                      />
                    </label>
                    <button
                        type="button"
                        onClick={handlePasteClick}
                        className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 bg-slate-800 hover:bg-slate-700 text-white px-2 py-2 rounded-lg border border-slate-700 transition-colors h-full"
                        title="Paste from Clipboard"
                    >
                        <Clipboard className="w-4 h-4" />
                        <span className="text-[10px] sm:text-sm font-medium">Paste</span>
                    </button>
                    <button
                        type="button"
                        onClick={openSearchModal}
                        className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-2 rounded-lg border border-indigo-500 transition-colors h-full"
                        title="Search Cover"
                    >
                        <Globe className="w-4 h-4" />
                        <span className="text-[10px] sm:text-sm font-medium">Search</span>
                    </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  Upload, Paste (Ctrl+V), or Search online.
                </p>
              </div>
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-1 relative" ref={tagSelectorRef}>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-400">Review / Comment</label>
              <button
                type="button"
                onClick={() => setIsTagSelectorOpen(!isTagSelectorOpen)}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <Tags className="w-3 h-3" />
                Select Adjectives
              </button>
            </div>
            
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              disabled={isTagSelectorOpen || isSearchOpen}
              className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 resize-none text-sm transition-opacity ${isTagSelectorOpen || isSearchOpen ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="What did you think?"
              required
            />
          </div>

          {!isTagSelectorOpen && !isSearchOpen && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={isTagSelectorOpen || isSearchOpen}
                className={`w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${isTagSelectorOpen || isSearchOpen ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Save className="w-5 h-5" />
                {initialData ? 'Update Rating' : 'Save Rating'}
              </button>
            </div>
          )}

        </form>

        {/* Tag Popup */}
        {isTagSelectorOpen && (
          <div 
            ref={popupRef}
            className="absolute top-[69px] left-0 right-0 bottom-[10%] z-50 bg-slate-900 flex flex-col shadow-2xl border-b border-slate-700 rounded-b-2xl"
          >
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/95 backdrop-blur z-10">
              <span className="text-sm font-bold text-white">Select Tags (Max 5)</span>
              <button 
                type="button"
                onClick={() => setIsTagSelectorOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-3 space-y-4 custom-scrollbar flex-1">
              {TAG_CATEGORIES.map((category) => (
                <div key={category.id}>
                  <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">{category.label}</h4>
                  <div className="flex flex-wrap gap-2">
                    {category.tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleTagToggle(tag)}
                          className={`text-[10px] sm:text-xs px-2 py-1 rounded border transition-all ${
                            isSelected 
                              ? category.selectedClass 
                              : category.colorClass
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-900/95 backdrop-blur flex justify-between items-center z-10 rounded-b-2xl">
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      Selected: <span className={selectedTags.length >= 5 ? 'text-red-400' : 'text-white'}>{selectedTags.length}</span>/5
                    </span>
                    {selectedTags.length > 0 && (
                        <button 
                            type="button" 
                            onClick={handleResetTags}
                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                        </button>
                    )}
                </div>
                <button 
                  type="button"
                  onClick={handleInsertTags}
                  disabled={selectedTags.length === 0}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-1 font-bold"
                >
                  <Check className="w-3 h-3" />
                  Insert
                </button>
            </div>
          </div>
        )}

        {/* Unified Search Overlay */}
        {isSearchOpen && (
           <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/95 backdrop-blur">
                 <h3 className="text-sm font-bold text-white flex items-center gap-2">
                   <Globe className="w-4 h-4 text-indigo-400" />
                   Search Cover
                 </h3>
                 <button 
                   type="button"
                   onClick={() => setIsSearchOpen(false)}
                   className="text-slate-400 hover:text-white p-1"
                 >
                   <X className="w-5 h-5" />
                 </button>
              </div>

              <div className="p-3 border-b border-slate-800 space-y-3">
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleSearchSubmit(searchQuery); }}
                    className="flex gap-2"
                  >
                     <input 
                       type="text" 
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       placeholder="Game Name..."
                       className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                       autoFocus={!searchQuery}
                     />
                     <button 
                       type="submit"
                       disabled={isSearching || !searchQuery}
                       className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg flex items-center justify-center"
                     >
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                     </button>
                  </form>
                  
                  {/* Search Source Filters */}
                  {searchResults.length > 0 && !isSearching && (
                      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                         <button
                            type="button"
                            onClick={() => setActiveSearchFilter('ALL')}
                            className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                               activeSearchFilter === 'ALL' 
                               ? 'bg-slate-700 text-white border-slate-600' 
                               : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                            }`}
                         >
                            All ({searchResults.length})
                         </button>
                         {getSourceCount('STEAM') > 0 && (
                             <button
                                type="button"
                                onClick={() => setActiveSearchFilter('STEAM')}
                                className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                                   activeSearchFilter === 'STEAM' 
                                   ? 'bg-slate-700 text-blue-200 border-slate-600' 
                                   : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                                }`}
                             >
                                Steam ({getSourceCount('STEAM')})
                             </button>
                         )}
                         {getSourceCount('IGDB') > 0 && (
                             <button
                                type="button"
                                onClick={() => setActiveSearchFilter('IGDB')}
                                className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                                   activeSearchFilter === 'IGDB' 
                                   ? 'bg-purple-900/50 text-purple-200 border-purple-700' 
                                   : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                                }`}
                             >
                                IGDB ({getSourceCount('IGDB')})
                             </button>
                         )}
                         {getSourceCount('GOOGLE') > 0 && (
                             <button
                                type="button"
                                onClick={() => setActiveSearchFilter('GOOGLE')}
                                className={`px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                                   activeSearchFilter === 'GOOGLE' 
                                   ? 'bg-emerald-900/50 text-emerald-200 border-emerald-700' 
                                   : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                                }`}
                             >
                                Google ({getSourceCount('GOOGLE')})
                             </button>
                         )}
                      </div>
                  )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                 {isSearching ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                       <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                       <span className="text-xs">Searching Steam, IGDB & Google...</span>
                    </div>
                 ) : getFilteredResults().length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                       {getFilteredResults().map((game) => {
                          if (!game.coverUrl) return null; // Skip games without cover
                          return (
                             <button
                               key={game.id}
                               type="button"
                               onClick={() => handleSelectImage(game.coverUrl)}
                               className="group relative aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 hover:border-indigo-500 transition-all"
                             >
                                <img 
                                  src={game.coverUrl} 
                                  alt={game.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute top-0 right-0 p-1">
                                   <span className={`text-[8px] font-bold px-1 py-0.5 rounded text-white ${
                                     game.source === 'STEAM' ? 'bg-slate-700' : 
                                     game.source === 'IGDB' ? 'bg-purple-700' : 
                                     'bg-emerald-600'
                                   }`}>
                                      {game.source}
                                   </span>
                                </div>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                   <span className="text-white text-xs font-bold px-2 py-1 bg-indigo-600 rounded">Select</span>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/70 text-[10px] text-white truncate text-center">
                                   {game.name}
                                </div>
                             </button>
                          );
                       })}
                    </div>
                 ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm">
                       {searchQuery ? 'No results found.' : 'Enter game name to search.'}
                    </div>
                 )}
              </div>
           </div>
        )}

      </div>
    </div>
  );
};