import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Game, Platform, GENRE_OPTIONS, SortOption } from './types';
import { GameCard } from './components/GameCard';
import { AddGameModal } from './components/AddGameModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Plus, Gamepad2, Layers, UploadCloud, FileJson, Filter, LogIn, LogOut, CloudDownload, ArrowUpDown } from 'lucide-react';
import { signInWithGoogle, logout, getGames, getUserBackupGames, saveUserBackupGames, addGame, updateGame, deleteGame, auth } from './services/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

const APP_VERSION = '202512010000';

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
  const [sortOption, setSortOption] = useState<SortOption>('SCORE_DESC'); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    if (auth) {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser: User | null) => {
            setUser(currentUser);
            if (currentUser) {
              setIsLoading(true);
              try {
                let userGames = await getUserBackupGames(currentUser.uid);
                if (userGames.length === 0) {
                  userGames = await getGames(currentUser.uid);
                }
                setGames(userGames);
              } catch (e) {
                console.error("Error loading games", e);
              } finally {
                setIsLoading(false);
              }
            } else {
              setGames([]);
              setIsLoading(false);
            }
        });
        return unsubscribe;
    } else {
      setIsLoading(false);
    }
  }, []);

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
    await logout();
  };

  const handleSaveGame = async (title: string, platform: Platform, score: number, comment: string, genre: string, ratingDate: string, imageUrl: string, playtime: number) => {
    if (!user) {
      setConfirmModal({
        isOpen: true,
        title: 'Login Required',
        message: 'Please log in to save ratings.',
        onConfirm: () => {},
        isAlert: true
      });
      return;
    }

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

    try {
      let newGameData;
      if (editingGame) {
        const updatedGame = {
          title,
          platform,
          score,
          comment,
          genre,
          ratingDate,
          imageUrl,
          playtime,
        };
        await updateGame(editingGame.id, updatedGame);
        setGames(prev => prev.map(g => g.id === editingGame.id ? { ...g, ...updatedGame } : g));
        newGameData = [{ id: editingGame.id, ...updatedGame }, ...games.filter(g => g.id !== editingGame.id)];
      } else {
        const newGame = {
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
        let newId: string;
        try {
          newId = await addGame(newGame, user.uid);
        } catch (error) {
          console.warn('Failed to write to games collection, using local backup only', error);
          newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}`;
        }
        setGames(prev => [{ id: newId, ...newGame }, ...prev]);
        newGameData = [{ id: newId, ...newGame }, ...games];
      }

      try {
        await saveUserBackupGames(user.uid, newGameData as Game[]);
      } catch (backupError) {
        console.warn('Failed to auto backup games after save', backupError);
      }

      closeModal();
    } catch (error) {
      console.error("Error saving game", error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to save game.',
        onConfirm: () => {},
        isAlert: true
      });
    }
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
      onConfirm: async () => {
        try {
          await deleteGame(id);
        } catch (error) {
          console.warn('Failed to delete from games collection, deleting locally only', error);
        }
        const updated = games.filter(g => g.id !== id);
        setGames(updated);
        if (user) {
          try {
            await saveUserBackupGames(user.uid, updated);
          } catch (backupError) {
            console.warn('Failed to backup updated games after delete', backupError);
          }
        }
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

  const handleRestoreFromFirestore = async () => {
    if (!user) {
      setConfirmModal({
        isOpen: true,
        title: 'Login Required',
        message: 'Please log in to restore your saved games from Firestore.',
        onConfirm: () => {},
        isAlert: true
      });
      return;
    }

    setIsLoading(true);
    try {
      let userGames: Game[] = [];

      userGames = await getUserBackupGames(user.uid);
      if (userGames.length === 0) {
        userGames = await getGames(user.uid);
      }

      if (userGames.length === 0) {
        setConfirmModal({
          isOpen: true,
          title: 'No Data Found',
          message: 'No saved games were found in Firestore for this account.',
          onConfirm: () => {},
          isAlert: true
        });
      } else {
        setGames(userGames);
        setConfirmModal({
          isOpen: true,
          title: 'Restore Complete',
          message: 'Your saved games have been restored from Firestore.',
          onConfirm: () => {},
          isAlert: true
        });
      }
    } catch (error: any) {
      console.error('Error restoring games from Firestore', error);
      setConfirmModal({
        isOpen: true,
        title: 'Restore Failed',
        message: `Unable to restore games from Firestore. ${error?.message || 'Please try again.'}`,
        onConfirm: () => {},
        isAlert: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupToFirestore = async () => {
    if (!user) {
      setConfirmModal({
        isOpen: true,
        title: 'Login Required',
        message: 'Please log in to back up your games to Firestore.',
        onConfirm: () => {},
        isAlert: true
      });
      return;
    }

    setIsLoading(true);
    try {
      await saveUserBackupGames(user.uid, games);
      setConfirmModal({
        isOpen: true,
        title: 'Backup Complete',
        message: 'Your games were backed up to Firestore successfully.',
        onConfirm: () => {},
        isAlert: true
      });
    } catch (error: any) {
      console.error('Error backing up games to Firestore', error);
      setConfirmModal({
        isOpen: true,
        title: 'Backup Failed',
        message: `Unable to back up games to Firestore. ${error?.message || 'Please try again.'}`,
        onConfirm: () => {},
        isAlert: true
      });
    } finally {
      setIsLoading(false);
    }
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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2 rounded-lg">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block">
              GameRank
            </h1>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto whitespace-nowrap">
            <button
              onClick={handleBackupJSON}
              title="Export JSON"
              className="flex items-center justify-center px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50"
            >
              <FileJson className="w-3.5 h-3.5" />
              {!user ? <span className="hidden sm:inline">Export</span> : <span className="sr-only">Export JSON</span>}
            </button>

            <button
              onClick={triggerFileInput}
              title="Import JSON"
              className="flex items-center justify-center px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              {!user ? <span className="hidden sm:inline">Import</span> : <span className="sr-only">Import JSON</span>}
            </button>

            {user && (
              <button
                onClick={handleBackupToFirestore}
                title="Backup to cloud"
                className="flex items-center justify-center px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="sr-only">Backup to cloud</span>
              </button>
            )}

            {user && (
              <button
                onClick={handleRestoreFromFirestore}
                title="Restore from cloud"
                className="flex items-center justify-center px-2.5 py-2 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-slate-700/50"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                <span className="sr-only">Restore from cloud</span>
              </button>
            )}

            {!user && (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-2 text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg border border-slate-600"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log In</span>
              </button>
            )}

            {user && (
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleRestoreJSON}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex shrink-0 items-center gap-2 px-4 py-2 bg-white text-slate-900 hover:bg-slate-200 font-bold rounded-lg transition-colors shadow-lg shadow-white/10"
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
        {isLoading ? (
          <div className="text-center py-20">
             <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-slate-400">Loading your games...</p>
          </div>
        ) : filteredGames.length === 0 && (
          <div className="text-center py-20 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-800">
            <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {!user ? 'Please log in' : 'No games found'}
            </h3>
            <p className="text-slate-400 max-w-sm mx-auto mb-6">
              {!user 
                ? "Log in to start saving your game ratings to the cloud."
                : games.length === 0 
                  ? "Start building your collection by adding a new game rating."
                  : "No games match your selected filters."}
            </p>
            {games.length === 0 && user && (
              <div className="flex justify-center gap-4">
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