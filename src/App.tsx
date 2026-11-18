import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Game, GameInput, Platform, GENRE_OPTIONS, SortOption } from './types';
import { normalizeScore } from './components/GameCard';
import { NesView } from './views/NesView';
import { ArcadeView } from './views/ArcadeView';
import { ThemeContext, ThemeName, applyTheme, loadTheme } from './theme';
import { AddGameModal } from './components/AddGameModal';
import { ConfirmModal } from './components/ConfirmModal';
import { signInWithGoogle, logout, getGames, getUserBackupGames, saveUserBackupGames, saveGameRecord, deleteGameRecord, updateGameCover, newGameId, auth, describeFirebaseError, missingFirebaseConfig } from './services/firebase';
import { clearCachedGames, loadCachedGames, saveCachedGames } from './services/cache';
import { deleteCoverFile, isInlineCover, prepareCover, storageUnavailableReason, uploadCover } from './services/covers';
import { User, onAuthStateChanged } from 'firebase/auth';

const APP_VERSION = '202611150000';

const PLATFORMS = [Platform.PS, Platform.XBOX, Platform.SWITCH, Platform.PC];

const SORT_LABELS: [SortOption, string][] = [
  ['SCORE_DESC', '分數 高→低'],
  ['SCORE_ASC', '分數 低→高'],
  ['DATE_DESC', '日期 新→舊'],
  ['DATE_ASC', '日期 舊→新'],
  ['PLAYTIME_DESC', '時數 長→短'],
  ['PLAYTIME_ASC', '時數 短→長'],
];

const migrateGameData = (data: any[]): Game[] => {
  return data.map(g => {
    let newPlatform = g.platform;
    if (g.platform === 'PS5') newPlatform = Platform.PS;
    if (g.platform === 'STEAM') newPlatform = Platform.PC;
    return { ...g, platform: newPlatform };
  });
};

const normalizeSearch = (text: string) => text.toLowerCase().replace(/[\s:：・·'’"「」『』（）()\-—_.,，、!！?？#＃]/g, '');

interface DialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  isAlert?: boolean;
}

const App = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | Platform>('ALL');
  const [activeGenre, setActiveGenre] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>('SCORE_DESC');
  const [searchText, setSearchText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 已先顯示這台裝置上次的清單，正在向雲端更新
  const [isSyncing, setIsSyncing] = useState(false);
  // 背景中尚未完成的雲端寫入數量
  const [pendingWrites, setPendingWrites] = useState(0);
  const [theme, setTheme] = useState<ThemeName>(loadTheme);
  const [migration, setMigration] = useState<{ done: number; total: number } | null>(null);
  // 讀取雲端存檔失敗的原因；有值時畫面要顯示錯誤，並且禁止整批備份
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>({ isOpen: false, title: '', message: '', onConfirm: () => {}, isAlert: false });

  // 讓穩定的 callback 也能讀到最新的資料
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const userRef = useRef(user);
  userRef.current = user;

  const showAlert = useCallback((title: string, message: string) => {
    setDialog({ isOpen: true, title, message, onConfirm: () => {}, isAlert: true });
  }, []);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser: User | null) => {
      setUser(currentUser);
      setLoadError(null);
      if (currentUser) {
        const cached = loadCachedGames(currentUser.uid);
        if (cached) setGames(cached);
        setIsLoading(!cached);
        setIsSyncing(true);
        try {
          let userGames = await getUserBackupGames(currentUser.uid);
          if (userGames.length === 0) {
            userGames = await getGames(currentUser.uid);
            // 只有舊的 games 集合有資料：複製一份到 backups，之後就只讀寫 backups
            if (userGames.length > 0) {
              const legacy = userGames;
              void saveUserBackupGames(currentUser.uid, legacy).catch(error => console.warn('Copying legacy games to backups failed', error));
            }
          }
          setGames(userGames);
        } catch (e) {
          console.error('Error loading games', e);
          const reason = describeFirebaseError(e);
          // 有這台裝置上次的清單就繼續顯示，否則清空
          if (!cached) setGames([]);
          setLoadError(cached ? `${reason}（目前顯示的是這台裝置上次的清單）` : reason);
          showAlert('讀取存檔失敗', `${reason}\n\n雲端上的資料沒有被刪除，修正後重新整理就會回來。在那之前請不要按「雲端備份」或「匯入」。`);
        } finally {
          setIsLoading(false);
          setIsSyncing(false);
        }
      } else {
        setGames([]);
        setIsLoading(false);
        setIsSyncing(false);
      }
    });
    return unsubscribe;
  }, [showAlert]);

  // 雲端資料同步完成後，每次變動都更新這台裝置上的副本
  useEffect(() => {
    if (user && !isSyncing && !loadError) saveCachedGames(user.uid, games);
  }, [user, games, isSyncing, loadError]);

  // 建置時漏設 Firebase 設定，一開站就說清楚少了哪些
  useEffect(() => {
    if (missingFirebaseConfig.length > 0) {
      showAlert('網站設定不完整', `Vercel 缺少這些環境變數：\n${missingFirebaseConfig.join('\n')}\n\n請補上後重新部署（Deployments → Redeploy）。`);
    }
  }, [showAlert]);

  // 還有寫入沒完成時，關閉分頁前提醒
  useEffect(() => {
    if (pendingWrites === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingWrites]);

  /**
   * 畫面已經先更新了，這裡在背景把變動寫到雲端；失敗就還原畫面並告知。
   */
  const syncInBackground = useCallback(async (write: () => Promise<void>, rollback: () => void, what: string) => {
    setPendingWrites(n => n + 1);
    try {
      await write();
    } catch (error: any) {
      console.error(`Cloud write failed (${what})`, error);
      rollback();
      showAlert('儲存失敗', `「${what}」沒有存到雲端，畫面已還原成變更前的樣子。\n\n${error?.message || '請檢查網路後再試一次。'}`);
    } finally {
      setPendingWrites(n => n - 1);
    }
  }, [showAlert]);

  /** 封面先上傳到 Storage（可用時），再寫入這一筆資料；換掉的舊封面檔順手刪除 */
  const persistGame = useCallback(async (uid: string, game: Game, isNew: boolean, previousCover?: string) => {
    const imageUrl = await prepareCover(uid, game.id, game.imageUrl);
    const toSave = imageUrl === game.imageUrl ? game : { ...game, imageUrl };
    try {
      await saveGameRecord(uid, toSave, isNew);
    } catch (error) {
      if (toSave !== game) void deleteCoverFile(imageUrl);
      throw error;
    }
    if (toSave !== game) {
      setGames(prev => prev.map(g => (g.id === game.id && g.imageUrl === game.imageUrl ? { ...g, imageUrl } : g)));
    }
    if (previousCover && previousCover !== toSave.imageUrl) void deleteCoverFile(previousCover);
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.error('Login Error:', e);
      if (e.code === 'auth/unauthorized-domain') {
        showAlert('登入失敗', `這個網域尚未授權。\n\n請到 Firebase Console → Authentication → Settings → Authorized domains 加入：\n\n${window.location.hostname}`);
      } else if (e.code !== 'auth/popup-closed-by-user') {
        showAlert('登入失敗', e.message);
      }
    }
  };

  const handleLogout = async () => {
    clearCachedGames();
    await logout();
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingGame(null);
  }, []);

  const handleSaveGame = (input: GameInput) => {
    if (!user) {
      showAlert('請先登入', '登入後才能儲存評分。');
      return;
    }

    const normalizedTitle = input.title.trim().toLowerCase();
    const isDuplicate = games.some(g =>
      g.title.trim().toLowerCase() === normalizedTitle &&
      g.platform === input.platform &&
      (!editingGame || g.id !== editingGame.id)
    );
    if (isDuplicate) {
      showAlert('重複的遊戲', `${input.platform} 版的《${input.title}》已經評分過囉！`);
      return;
    }

    const uid = user.uid;
    if (editingGame) {
      const previous = editingGame;
      const updated: Game = { ...previous, ...input };
      setGames(prev => prev.map(g => (g.id === previous.id ? updated : g)));
      closeModal();
      void syncInBackground(
        () => persistGame(uid, updated, false, previous.imageUrl),
        () => setGames(prev => prev.map(g => (g.id === previous.id ? previous : g))),
        `修改《${input.title}》`
      );
    } else {
      const created: Game = { id: newGameId(), ...input, addedAt: Date.now() };
      setGames(prev => [created, ...prev]);
      closeModal();
      void syncInBackground(
        () => persistGame(uid, created, true),
        () => setGames(prev => prev.filter(g => g.id !== created.id)),
        `新增《${input.title}》`
      );
    }
  };

  const handleEditGame = useCallback((id: string) => {
    const game = gamesRef.current.find(g => g.id === id);
    if (game) {
      setEditingGame(game);
      setIsModalOpen(true);
    }
  }, []);

  const handleDeleteGame = useCallback((id: string) => {
    const target = gamesRef.current.find(g => g.id === id);
    if (!target) return;
    setDialog({
      isOpen: true,
      title: '刪除評分',
      message: `確定要刪除《${target.title}》的評分嗎？`,
      isAlert: false,
      onConfirm: () => {
        const index = gamesRef.current.findIndex(g => g.id === id);
        setGames(prev => prev.filter(g => g.id !== id));
        const uid = userRef.current?.uid;
        if (!uid) return;
        void syncInBackground(
          async () => {
            await deleteGameRecord(uid, id);
            void deleteCoverFile(target.imageUrl);
          },
          () => setGames(prev => {
            if (prev.some(g => g.id === id)) return prev;
            const next = prev.slice();
            next.splice(Math.min(Math.max(index, 0), next.length), 0, target);
            return next;
          }),
          `刪除《${target.title}》`
        );
      },
    });
  }, [syncInBackground]);

  const inlineCoverCount = useMemo(() => games.filter(g => isInlineCover(g.imageUrl)).length, [games]);

  /** 把還存在資料庫裡的 base64 封面逐張搬到 Storage；任何一張失敗就停下，已搬的保留 */
  const handleMigrateCovers = async () => {
    if (!user || migration) return;
    const uid = user.uid;
    const targets = gamesRef.current.filter(g => isInlineCover(g.imageUrl));
    let done = 0;
    setMigration({ done, total: targets.length });
    setPendingWrites(n => n + 1);
    try {
      for (const game of targets) {
        const url = await uploadCover(uid, game.id, game.imageUrl!);
        try {
          await updateGameCover(uid, game.id, url);
        } catch (error) {
          void deleteCoverFile(url);
          throw error;
        }
        setGames(prev => prev.map(g => (g.id === game.id && g.imageUrl === game.imageUrl ? { ...g, imageUrl: url } : g)));
        done += 1;
        setMigration({ done, total: targets.length });
      }
      showAlert('封面搬移完成', `已把 ${done} 張封面搬到 Firebase Storage，下次開站會快很多。`);
    } catch (error: any) {
      console.error('Cover migration stopped', error);
      showAlert('封面搬移中斷', `已完成 ${done}／${targets.length} 張。\n\n${error?.message || '請稍後再試。'}\n\n還沒搬的封面不受影響，照常顯示。`);
    } finally {
      setMigration(null);
      setPendingWrites(n => n - 1);
    }
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
    URL.revokeObjectURL(url);
  };

  const handleRestoreJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSyncing) {
      e.target.value = '';
      showAlert('請稍候', '正在從雲端讀取最新資料，讀取完成後再匯入。');
      return;
    }
    if (loadError) {
      e.target.value = '';
      showAlert('已取消匯入', `存檔還沒讀取成功，現在匯入可能覆蓋雲端資料。\n\n${loadError}`);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setDialog({
            isOpen: true,
            title: '匯入 JSON',
            message: `備份檔裡有 ${json.length} 款遊戲，匯入後會取代目前的清單${user ? '並寫回雲端' : ''}。要繼續嗎？`,
            isAlert: false,
            onConfirm: async () => {
              const migrated = migrateGameData(json);
              setGames(migrated);
              if (!user) {
                showAlert('匯入完成', '已載入備份檔。目前尚未登入，這些資料只在這個畫面上，登入後按「雲端備份」才會保存。');
                return;
              }
              // 整份取代是少見操作，這裡才使用整批寫入
              setPendingWrites(n => n + 1);
              try {
                await saveUserBackupGames(user.uid, migrated);
                showAlert('匯入完成', '備份檔已匯入並存到雲端。');
              } catch (error: any) {
                console.error('Failed to persist imported games', error);
                showAlert('匯入未存到雲端', `資料已顯示在畫面上，但寫回雲端失敗，重新整理後會消失。\n\n${error?.message || ''}`);
              } finally {
                setPendingWrites(n => n - 1);
              }
            },
          });
        } else {
          showAlert('匯入失敗', '備份檔格式不正確。');
        }
      } catch (error) {
        console.error('Error parsing JSON', error);
        showAlert('匯入失敗', '這不是有效的 JSON 檔。');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreFromFirestore = async () => {
    if (!user) {
      showAlert('請先登入', '登入後才能從雲端還原。');
      return;
    }

    setIsLoading(true);
    try {
      let userGames = await getUserBackupGames(user.uid);
      if (userGames.length === 0) {
        userGames = await getGames(user.uid);
      }

      if (userGames.length === 0) {
        showAlert('找不到資料', '這個帳號在雲端沒有已儲存的遊戲。');
      } else {
        setGames(userGames);
        showAlert('還原完成', `已從雲端還原 ${userGames.length} 款遊戲。`);
      }
    } catch (error: any) {
      console.error('Error restoring games from Firestore', error);
      showAlert('還原失敗', `無法從雲端還原。${error?.message || '請再試一次。'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupToFirestore = async () => {
    if (!user) {
      showAlert('請先登入', '登入後才能備份到雲端。');
      return;
    }

    if (isSyncing) {
      showAlert('請稍候', '正在從雲端讀取最新資料，讀取完成後再備份。');
      return;
    }
    if (loadError) {
      showAlert('已取消備份', `存檔還沒讀取成功，現在備份會用不完整的清單覆蓋雲端。\n\n${loadError}`);
      return;
    }

    setPendingWrites(n => n + 1);
    try {
      await saveUserBackupGames(user.uid, games);
      showAlert('備份完成', `已把 ${games.length} 款遊戲完整備份到雲端。`);
    } catch (error: any) {
      console.error('Error backing up games to Firestore', error);
      const msg = String(error?.message || error || '');
      const isPermissionError = /permission|authorize|auth|insufficient/i.test(msg);

      if (isPermissionError) {
        try {
          handleBackupJSON();
        } catch (e) {
          console.error('Failed to create local JSON backup', e);
        }
        showAlert('已改存到本機', '因為權限問題無法寫入雲端，已改為下載一份 JSON 備份檔。請檢查 Firebase 安全規則。');
      } else {
        showAlert('備份失敗', `無法備份到雲端。${error?.message || '請再試一次。'}`);
      }
    } finally {
      setPendingWrites(n => n - 1);
    }
  };

  const gamesInTab = useMemo(
    () => (activeTab === 'ALL' ? games : games.filter(g => g.platform === activeTab)),
    [games, activeTab]
  );

  const filteredGames = useMemo(() => {
    const byGenre = activeGenre === 'ALL'
      ? gamesInTab
      : gamesInTab.filter(g => (g.genre || '').split(', ').includes(activeGenre));
    // 名稱或評語包含搜尋字（忽略大小寫、空白與標點，「地平線5」也找得到「地平線 5」）
    const needle = normalizeSearch(searchText);
    const filtered = needle
      ? byGenre.filter(g => normalizeSearch(g.title).includes(needle) || normalizeSearch(g.comment || '').includes(needle))
      : byGenre;

    // 先複製再排序，避免直接改動 state 裡的陣列
    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'SCORE_ASC':
          return normalizeScore(a.score) - normalizeScore(b.score);
        case 'DATE_DESC':
          return (b.ratingDate || '').localeCompare(a.ratingDate || '');
        case 'DATE_ASC':
          return (a.ratingDate || '').localeCompare(b.ratingDate || '');
        case 'PLAYTIME_DESC':
          return (b.playtime || 0) - (a.playtime || 0);
        case 'PLAYTIME_ASC':
          return (a.playtime || 0) - (b.playtime || 0);
        case 'SCORE_DESC':
        default:
          return normalizeScore(b.score) - normalizeScore(a.score);
      }
    });
  }, [gamesInTab, activeGenre, sortOption, searchText]);

  const stats = useMemo(() => {
    const total = gamesInTab.length;
    const avgScore = total > 0
      ? (gamesInTab.reduce((acc, g) => acc + normalizeScore(g.score), 0) / total).toFixed(1)
      : '0';
    const totalPlaytime = gamesInTab.reduce((acc, g) => acc + (g.playtime || 0), 0);
    return { total, avgScore, totalPlaytime };
  }, [gamesInTab]);

  const sortedGenres = useMemo(() => {
    const counts: Record<string, number> = {};
    gamesInTab.forEach(g => {
      (g.genre || '').split(', ').forEach(genre => {
        const trimmed = genre.trim();
        if (trimmed) counts[trimmed] = (counts[trimmed] || 0) + 1;
      });
    });
    return GENRE_OPTIONS
      .filter(g => counts[g] > 0)
      .sort((a, b) => counts[b] - counts[a] || GENRE_OPTIONS.indexOf(a) - GENRE_OPTIONS.indexOf(b));
  }, [gamesInTab]);

  const platformTabs = useMemo(() => {
    const counts: Record<string, number> = { ALL: games.length };
    PLATFORMS.forEach(p => { counts[p] = 0; });
    games.forEach(g => {
      if (counts[g.platform] !== undefined) counts[g.platform]++;
    });
    const sorted = [...PLATFORMS].sort((a, b) => counts[b] - counts[a] || PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
    return { tabs: ['ALL', ...sorted] as ('ALL' | Platform)[], counts };
  }, [games]);

  const selectTab = (tab: 'ALL' | Platform) => {
    setActiveTab(tab);
    setActiveGenre('ALL');
  };

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next: ThemeName = prev === 'nes' ? 'arcade' : 'nes';
      applyTheme(next);
      return next;
    });
  }, []);

  const View = theme === 'arcade' ? ArcadeView : NesView;
  const blockedReason = storageUnavailableReason();
  const coverNotice = loadError ? (
    <p><b>讀取存檔失敗：</b>{loadError} 雲端上的資料沒有被刪除，修正後重新整理即可。</p>
  ) : user && inlineCoverCount > 0 ? (
    <>
      <p>
        有 {inlineCoverCount} 張封面還存在資料庫裡，每次開站都要整包下載。搬到 Firebase Storage 後開站會快很多，原本的封面不會遺失。
        {blockedReason && !migration && <><br /><b>目前無法搬移：{blockedReason}。</b></>}
      </p>
      <button type="button" className={theme === 'nes' ? 'nes-btn is-warning sm' : 'btn yl'} onClick={handleMigrateCovers} disabled={!!migration}>
        {migration ? `搬移中 ${migration.done}／${migration.total}` : '搬移封面'}
      </button>
    </>
  ) : null;

  return (
    <ThemeContext.Provider value={theme}>
      <View
        theme={theme}
        notice={coverNotice}
        user={user}
        hasGames={games.length > 0}
        loadFailed={!!loadError}
        isLoading={isLoading}
        isSaving={pendingWrites > 0}
        isSyncing={isSyncing}
        version={APP_VERSION}
        stats={stats}
        tabs={platformTabs.tabs}
        tabCounts={platformTabs.counts}
        activeTab={activeTab}
        genres={sortedGenres}
        activeGenre={activeGenre}
        sortOption={sortOption}
        sortLabels={SORT_LABELS}
        games={filteredGames}
        onSelectTab={selectTab}
        onSelectGenre={setActiveGenre}
        onSort={setSortOption}
        searchText={searchText}
        onSearch={setSearchText}
        onAdd={() => setIsModalOpen(true)}
        onEdit={handleEditGame}
        onDelete={handleDeleteGame}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onExport={handleBackupJSON}
        onImport={() => fileInputRef.current?.click()}
        onCloudBackup={handleBackupToFirestore}
        onCloudRestore={handleRestoreFromFirestore}
        onToggleTheme={toggleTheme}
      />
      <input type="file" ref={fileInputRef} onChange={handleRestoreJSON} accept=".json" hidden />

      {isModalOpen && <AddGameModal isOpen onClose={closeModal} onSave={handleSaveGame} initialData={editingGame} />}

      <ConfirmModal
        isOpen={dialog.isOpen}
        onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        isAlert={dialog.isAlert}
      />
    </ThemeContext.Provider>
  );
};

export default App;
