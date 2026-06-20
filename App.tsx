import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Game, Platform, GENRE_OPTIONS, SortOption } from './types';
import { GameCard } from './components/GameCard';
import { AddGameModal } from './components/AddGameModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Plus, Gamepad2, Layers, UploadCloud, FileJson, Filter, LogIn, LogOut, CloudUpload, CloudDownload, RefreshCw, ArrowUpDown, Calendar, Star } from 'lucide-react';
import { signInWithGoogle, signOut, saveBackupToCloud, restoreBackupFromCloud, auth } from './services/firebase';
import firebase from 'firebase/compat/app';

const APP_VERSION = '202511302100';
const STORAGE_KEY = 'gamerank_ai_data';

// Helper to migrate old platform names to new ones
const migrateGameData = (data: any[]): Game[] => {
  return data.map(g => {
    let newPlatform = g.platform;
    if (g.platform === 'PS5') newPlatform = Platform.PS;
    if (g.platform === 'STEAM') newPlatform = Platform.PC;
    
    return {
      ...g,
      platform: newPlatform
    };
  });
};

const App = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | Platform>('ALL');
  const [activeGenre, setActiveGenre] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('SCORE_DESC'); // Default to score high-low
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth State
  const [user, setUser] = useState<firebase.User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isAlert?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isAlert: false
  });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Run migration logic on load
        const migrated = migrateGameData(parsed);
        setGames(migrated);
      } catch (e) {
        console.error("Failed to parse games", e);
      }
    }

    if (auth) {
        const unsubscribe = auth.onAuthStateChanged((currentUser: firebase.User | null) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }, [games]);

  // Reset active genre when switching platforms to prevent empty states
  useEffect(() => {
    setActiveGenre('ALL');
  }, [activeTab]);

  const handleLogin = async () => {
    try {
        await signInWithGoogle();
    } catch (e: any) {
        console.error("Login Error:", e);
        if (e.code === 'auth/unauthorized-domain') {
            setConfirmModal({
                isOpen: true,
                title: 'Login Failed',
                message: `Domain not authorized.\n\nPlease go to Firebase Console -> Authentication -> Settings -> Authorized Domains.\nAdd this domain:\n\n${window.location.hostname}`,
                onConfirm: () => {},
                isAlert: true
            });
        } else if (e.code === 'auth/popup-closed-by-user') {
            // User closed popup, ignore
        } else {
            setConfirmModal({
                isOpen: true,
                title: 'Login Failed',
                message: e.message,
                onConfirm: () => {},
                isAlert: true
            });
        }
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleCloudBackup = async () => {
    if (!user) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'GameRank',
      message: '將會覆蓋現有雲端存檔，確定嗎?',
      isAlert: false,
      onConfirm: async () => {
        setIsSyncing(true);
        try {
            // saveBackupToCloud now returns the optimized list (with Image URLs instead of Base64)
            const optimizedGames = await saveBackupToCloud(user.uid, games);
            
            // Update local state with the optimized list
            // This replaces local Base64 images with Cloud URLs, reducing local storage usage
            setGames(optimizedGames);
            
            // Show Success Alert
            setConfirmModal({
                isOpen: true,
                title: 'GameRank',
                message: '資料備份至雲端成功!',
                onConfirm: () => {},
                isAlert: true
            });
        } catch (e: any) {
            console.error(e);
            // Show Error Alert with specific message
            let errorMessage = '備份失敗，請稍後再試。';
            if (e.code === 'storage/unauthorized') {
                errorMessage = '備份失敗：權限不足。請檢查 Firebase Storage Rules。';
            } else if (e.code === 'storage/retry-limit-exceeded' || e.message?.includes('timed out')) {
                errorMessage = '備份失敗：連線逾時。請檢查網路或 Storage 是否已啟用。';
            } else if (e.message) {
                errorMessage = `備份失敗：${e.message}`;
            }

            setConfirmModal({
                isOpen: true,
                title: 'GameRank',
                message: errorMessage,
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            setIsSyncing(false);
        }
      }
    });
  };

  const handleCloudRestore = async () => {
    if (!user) return;

    const runRestore = async () => {
        setIsSyncing(true);
        try {
            const cloudGames = await restoreBackupFromCloud(user.uid);
            if (cloudGames) {
                // Run migration logic on restored data
                const migrated = migrateGameData(cloudGames);
                setGames(migrated);
                setConfirmModal({
                    isOpen: true,
                    title: 'GameRank',
                    message: '資料從雲端載入成功!',
                    onConfirm: () => {},
                    isAlert: true
                });
            } else {
                setConfirmModal({
                    isOpen: true,
                    title: 'GameRank',
                    message: '此帳號無備份紀錄。',
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } catch (e: any) {
             console.error(e);
             setConfirmModal({
                isOpen: true,
                title: 'GameRank',
                message: `資料載入失敗：${e.message || '未知錯誤'}`,
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            setIsSyncing(false);
        }
    };

    if (games.length > 0) {
        setConfirmModal({
            isOpen: true,
            title: 'GameRank',
            message: '將從雲端覆蓋本地資料，確定嗎?',
            isAlert: false,
            onConfirm: runRestore
        });
    } else {
        runRestore();
    }
  };

  const handleSaveGame = (title: string, platform: Platform, score: number, comment: string, genre: string, ratingDate: string, imageUrl: string, playtime: number) => {
    const normalizedTitle = title.trim().toLowerCase();
    const isDuplicate = games.some(g => 
      g.title.trim().toLowerCase() === normalizedTitle && 
      g.platform === platform && 
      (!editingGame || g.id !== editingGame.id)
    );

    if (isDuplicate) {
      setConfirmModal({
        isOpen: true,
        title: 'Duplicate Game',
        message: `${platform}版的${title}已經評分過囉!`,
        onConfirm: () => {},
        isAlert: true
      });
      return;
    }

    if (editingGame) {
      setGames(prev => prev.map(g => g.id === editingGame.id ? {
        ...g,
        title,
        platform,
        score,
        comment,
        genre,
        ratingDate,
        imageUrl,
        playtime,
      } : g));
    } else {
      const newGame: Game = {
        id: crypto.randomUUID(),
        title,
        platform,
        score,
        comment,
        genre,
        ratingDate,
        imageUrl,
        playtime,
        addedAt: Date.now(),
      };
      setGames(prev => [newGame, ...prev]);
    }
    closeModal();
  };

  const handleEditGame = (id: string) => {
    const game = games.find(g => g.id === id);
    if (game) {
      setEditingGame(game);
      setIsModalOpen(true);
    }
  };

  const handleDeleteGame = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Game',
      message: 'Are you sure you want to delete this rating?',
      isAlert: false,
      onConfirm: () => {
        setGames(prev => prev.filter(g => g.id !== id));
      }
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGame(null);
  };

  const handleBackupJSON = () => {
    const jsonContent = JSON.stringify(games, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `gamerank_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRestoreJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
           setConfirmModal({
               isOpen: true,
               title: 'Import JSON',
               message: `Found ${json.length} games in backup. This will replace your current list. Continue?`,
               isAlert: false,
               onConfirm: () => {
                   // Run migration on JSON import too
                   const migrated = migrateGameData(json);
                   setGames(migrated);
                   setConfirmModal({
                       isOpen: true,
                       title: 'Success',
                       message: 'Restored successfully!',
                       onConfirm: () => {},
                       isAlert: true
                   });
               }
           });
        } else {
          alert('Invalid backup file format.');
        }
      } catch (error) {
        console.error('Error parsing JSON', error);
        alert('Failed to restore data. Invalid JSON file.');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const filteredGames = useMemo(() => {
    let filtered = games;
    if (activeTab !== 'ALL') {
      filtered = filtered.filter(g => g.platform === activeTab);
    }
    if (activeGenre !== 'ALL') {
      filtered = filtered.filter(g => (g.genre || '').includes(activeGenre));
    }
    
    return filtered.sort((a, b) => {
      switch (sortOption) {
        case 'SCORE_DESC':
          return b.score - a.score;
        case 'SCORE_ASC':
          return a.score - b.score;
        case 'DATE_DESC':
          return b.ratingDate.localeCompare(a.ratingDate);
        case 'DATE_ASC':
          return a.ratingDate.localeCompare(b.ratingDate);
        case 'PLAYTIME_DESC':
          return (b.playtime || 0) - (a.playtime || 0);
        case 'PLAYTIME_ASC':
          return (a.playtime || 0) - (b.playtime || 0);
        default:
          return b.score - a.score;
      }
    });
  }, [games, activeTab, activeGenre, sortOption]);

  const stats = useMemo(() => {
    const targetGames = activeTab === 'ALL' 
      ? games 
      : games.filter(g => g.platform === activeTab);

    const total = targetGames.length;
    const avgScore = total > 0 ? (targetGames.reduce((acc, g) => {
        const normalizedScore = g.score > 10 ? g.score / 10 : g.score;
        return acc + normalizedScore;
    }, 0) / total).toFixed(1) : '0';
    const totalPlaytime = targetGames.reduce((acc, g) => acc + (g.playtime || 0), 0);
    return { total, avgScore, totalPlaytime };
  }, [games, activeTab]);

  const sortedGenres = useMemo(() => {
    const counts: Record<string, number> = {};
    GENRE_OPTIONS.forEach(g => counts[g] = 0);
    
    const gamesToCount = activeTab === 'ALL' 
      ? games 
      : games.filter(g => g.platform === activeTab);

    gamesToCount.forEach(g => {
      if (g.genre) {
        g.genre.split(', ').forEach(genre => {
          const trimmed = genre.trim();
          if (counts[trimmed] !== undefined) {
            counts[trimmed]++;
          }
        });
      }
    });

    return [...GENRE_OPTIONS]
      .filter(g => counts[g] > 0)
      .sort((a, b) => {
        const diff = (counts[b] || 0) - (counts[a] || 0);
        if (diff !== 0) return diff;
        return GENRE_OPTIONS.indexOf(a) - GENRE_OPTIONS.indexOf(b);
      });
  }, [games, activeTab]);

  const sortedPlatforms = useMemo(() => {
    const counts: Record<string, number> = {
        [Platform.PS]: 0,
        [Platform.XBOX]: 0,
        [Platform.SWITCH]: 0,
        [Platform.PC]: 0
    };

    games.forEach(g => {
        if (counts[g.platform] !== undefined) {
            counts[g.platform]++;
        }
    });

    const platforms = [Platform.PS, Platform.XBOX, Platform.SWITCH, Platform.PC];

    const sorted = platforms.sort((a, b) => {
        const diff = counts[b] - counts[a];
        if (diff !== 0) return diff;
        return platforms.indexOf(a) - platforms.indexOf(b);
    });

    return ['ALL', ...sorted] as const;
  }, [games]);

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-lg">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
              GameRank
            </h1>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleRestoreJSON} 
               accept=".json" 
               className="hidden" 
             />
             
             <div className="flex items-center gap-2 mr-2">
                {user ? (
                   <>
                      <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-slate-800 rounded-full border border-slate-700 mr-1">
                          {user.photoURL && <img src={user.photoURL} className="w-5 h-5 rounded-full" alt="User" />}
                          <span className="text-xs font-medium text-slate-300 max-w-[100px] truncate">{user.displayName}</span>
                      </div>

                      <button
                        onClick={handleCloudBackup}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue-400 hover:text-white bg-blue-900/20 hover:bg-blue-600 rounded-lg transition-all border border-blue-500/30"
                        title="Sync to Google Cloud"
                      >
                        {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                        <span className="hidden md:inline">Backup</span>
                      </button>

                      <button
                        onClick={handleCloudRestore}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-400 hover:text-white bg-emerald-900/20 hover:bg-emerald-600 rounded-lg transition-all border border-emerald-500/30"
                        title="Load from Google Cloud"
                      >
                        {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                        <span className="hidden md:inline">Restore</span>
                      </button>

                      <button
                         onClick={handleLogout}
                         className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                         title="Logout"
                      >
                         <LogOut className="w-4 h-4" />
                      </button>
                   </>
                ) : (
                   <>
                       <div className="hidden md:flex items-center gap-2">
                           <button
                             onClick={handleBackupJSON}
                             className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-all border border-slate-700/50"
                           >
                             <FileJson className="w-3.5 h-3.5" />
                             <span>JSON</span>
                           </button>
                           <button
                             onClick={triggerFileInput}
                             className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-all border border-slate-700/50"
                           >
                             <UploadCloud className="w-3.5 h-3.5" />
                             <span>JSON</span>
                           </button>
                       </div>
                       
                       <button
                         onClick={handleLogin}
                         className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-all border border-slate-600"
                       >
                         <LogIn className="w-3.5 h-3.5" />
                         <span className="hidden sm:inline">Log In</span>
                       </button>
                   </>
                )}

                <div className="w-px h-6 bg-slate-800 mx-1 hidden md:block"></div>
                
             </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 hover:bg-slate-200 font-bold rounded-lg transition-colors shadow-lg shadow-white/10"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add Game</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Top Dashboard Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6 mb-8">
            
            {/* Stats Group */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl py-4 shadow-sm w-full lg:w-[500px] shrink-0">
               <div className="grid grid-cols-3 divide-x divide-slate-800">
                 <div className="flex flex-col items-center justify-center px-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Games</span>
                    <span className="text-2xl md:text-3xl font-bold text-white leading-none">{stats.total}</span>
                 </div>
                 <div className="flex flex-col items-center justify-center px-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Avg Score</span>
                    <div className="flex items-baseline gap-1.5 leading-none">
                       <span className="text-2xl md:text-3xl font-bold text-indigo-400">{stats.avgScore}</span>
                       <span className="text-[10px] md:text-xs font-medium text-slate-600">/ 10</span>
                    </div>
                 </div>
                  <div className="flex flex-col items-center justify-center px-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Playtime</span>
                    <div className="flex items-baseline gap-1.5 leading-none">
                        <span className="text-2xl md:text-3xl font-bold text-emerald-400">{stats.totalPlaytime}</span>
                        <span className="text-[10px] md:text-xs font-medium text-slate-600">h</span>
                    </div>
                 </div>
               </div>
            </div>
  
            {/* Platform Filter Group */}
            <div className="bg-slate-900/50 p-1 md:p-1.5 rounded-2xl border border-slate-800 w-full lg:flex-1">
               <div className="grid grid-cols-5 w-full gap-1 h-full">
                 {sortedPlatforms.map((tab) => (
                   <button
                     key={tab}
                     onClick={() => setActiveTab(tab)}
                     className={`px-1 md:px-6 py-2 md:py-3 rounded-xl font-bold transition-all whitespace-nowrap text-center flex items-center justify-center ${
                       activeTab === tab
                         ? 'bg-slate-800 text-white shadow-md border border-slate-700'
                         : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                     }`}
                   >
                     <span className="text-[10px] md:text-sm">
                       {tab === 'ALL' 
                         ? <><span className="block sm:hidden">All</span><span className="hidden sm:block">All Platforms</span></>
                         : tab
                       }
                     </span>
                   </button>
                 ))}
               </div>
            </div>
        </div>

        {/* Filters and Sorting Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            {/* Genre Filters */}
            <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 custom-scrollbar flex-1 w-full sm:w-auto">
               <div className="flex gap-2 min-w-max">
                  <div className="flex items-center px-2 text-slate-500">
                    <Filter className="w-4 h-4" />
                  </div>
                  <button
                    onClick={() => setActiveGenre('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      activeGenre === 'ALL'
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    All Genres
                  </button>
                  {sortedGenres.map((g) => (
                     <button
                       key={g}
                       onClick={() => setActiveGenre(g)}
                       className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                         activeGenre === g
                           ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                           : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                       }`}
                     >
                       {g}
                     </button>
                  ))}
               </div>
            </div>

            {/* Sort Dropdown */}
            <div className="shrink-0 relative w-fit">
               <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
               <select
                 value={sortOption}
                 onChange={(e) => setSortOption(e.target.value as SortOption)}
                 className="w-auto pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs font-medium text-slate-300 focus:outline-none focus:border-indigo-500 hover:border-slate-700 appearance-none cursor-pointer"
               >
                 <option value="SCORE_DESC">分數(高)</option>
                 <option value="SCORE_ASC">分數(低)</option>
                 <option value="DATE_DESC">日期(新)</option>
                 <option value="DATE_ASC">日期(舊)</option>
                 <option value="PLAYTIME_DESC">時數(長)</option>
                 <option value="PLAYTIME_ASC">時數(短)</option>
               </select>
               {/* Custom dropdown arrow to match theme */}
               <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                 <div className="border-t-[3px] border-t-slate-400 border-x-[3px] border-x-transparent" />
               </div>
            </div>
        </div>

        {/* Empty State */}
        {filteredGames.length === 0 && (
          <div className="text-center py-20 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800">
            <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No games found</h3>
            <p className="text-slate-400 max-w-sm mx-auto mb-6">
              {games.length === 0 
                ? "Start building your collection by adding a new game rating."
                : "No games match your selected filters."}
            </p>
            {games.length === 0 && (
              <div className="flex justify-center gap-4">
                 {!user && (
                    <button
                      onClick={triggerFileInput}
                      className="text-slate-400 hover:text-white font-medium text-sm border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      Import JSON Backup
                    </button>
                 )}
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-indigo-400 hover:text-indigo-300 font-medium text-sm px-4 py-2"
                >
                  + Rate your first game
                </button>
              </div>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} onDelete={handleDeleteGame} onEdit={handleEditGame} />
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800/50 flex flex-col items-center justify-center gap-2">
           <span className="text-[10px] text-slate-600 font-mono">
             GameRank v{APP_VERSION}
           </span>
        </div>
      </main>

      <AddGameModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSave={handleSaveGame}
        initialData={editingGame}
      />
      
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isAlert={confirmModal.isAlert}
      />
    </div>
  );
};

export default App;