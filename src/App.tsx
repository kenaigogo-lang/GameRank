import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Game, GameInput, Platform, GENRE_OPTIONS, SortOption } from './types';
import { GameRow } from './components/GameRow';
import { AddGameModal } from './components/AddGameModal';
import { ConfirmModal } from './components/ConfirmModal';
import { signInWithGoogle, logout, getGames, getUserBackupGames, saveUserBackupGames, saveGameRecord, deleteGameRecord, newGameId, auth } from './services/firebase';
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

const normalizeScore = (score: number) => (score > 10 ? score / 10 : score);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 背景中尚未完成的雲端寫入數量
  const [pendingWrites, setPendingWrites] = useState(0);

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
      if (currentUser) {
        setIsLoading(true);
        try {
          let userGames = await getUserBackupGames(currentUser.uid);
          if (userGames.length === 0) {
            userGames = await getGames(currentUser.uid);
          }
          setGames(userGames);
        } catch (e) {
          console.error('Error loading games', e);
        } finally {
          setIsLoading(false);
        }
      } else {
        setGames([]);
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, []);

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
        () => saveGameRecord(uid, updated, false),
        () => setGames(prev => prev.map(g => (g.id === previous.id ? previous : g))),
        `修改《${input.title}》`
      );
    } else {
      const created: Game = { id: newGameId(), ...input, addedAt: Date.now() };
      setGames(prev => [created, ...prev]);
      closeModal();
      void syncInBackground(
        () => saveGameRecord(uid, created, true),
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
          () => deleteGameRecord(uid, id),
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
    const filtered = activeGenre === 'ALL'
      ? gamesInTab
      : gamesInTab.filter(g => (g.genre || '').split(', ').includes(activeGenre));

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
  }, [gamesInTab, activeGenre, sortOption]);

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

  return (
    <div className="crt">
      <header className="top">
        <div className="util">
          <span>{user ? (user.displayName || user.email || '已登入') : '訪客（未登入）'}</span>
          <div className="util-btns">
            <button type="button" className="link" onClick={handleBackupJSON}>匯出 JSON</button>
            <button type="button" className="link" onClick={() => fileInputRef.current?.click()}>匯入 JSON</button>
            {user && <button type="button" className="link" onClick={handleBackupToFirestore}>雲端備份</button>}
            {user && <button type="button" className="link" onClick={handleRestoreFromFirestore}>雲端還原</button>}
            {user
              ? <button type="button" className="link danger" onClick={handleLogout}>登出</button>
              : <button type="button" className="link" onClick={handleLogin}>Google 登入</button>}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleRestoreJSON} accept=".json" hidden />
        </div>

        <div className="hi">
          <span>1UP　{String(stats.total).padStart(2, '0')} GAMES</span>
          <span className="mid">HI-SCORE　{stats.avgScore}</span>
          <span>PLAY　{stats.totalPlaytime}H</span>
        </div>
        <h1 className="marquee">GAMERANK</h1>
        <p className="sub">— 我的遊戲排行榜 —</p>
        <button type="button" className="coin" onClick={() => setIsModalOpen(true)}>
          <i>INSERT COIN</i>＋ 新增遊戲
        </button>
        <p className={`sync${pendingWrites > 0 ? ' busy' : ''}`} role="status" aria-live="polite">
          {pendingWrites > 0 ? 'NOW SAVING...' : ''}
        </p>
      </header>

      <main className="wrap">
        <div className="sel" role="tablist" aria-label="平台">
          <span className="lb">SELECT</span>
          {platformTabs.tabs.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'on' : ''}
              onClick={() => selectTab(tab)}
            >
              {tab === 'ALL' ? '全部' : tab}
              <small>{platformTabs.counts[tab]}</small>
            </button>
          ))}
        </div>

        <div className="bar">
          <div className="chips">
            <button type="button" className={`chip${activeGenre === 'ALL' ? ' on' : ''}`} onClick={() => setActiveGenre('ALL')}>全部類型</button>
            {sortedGenres.map(g => (
              <button key={g} type="button" className={`chip${activeGenre === g ? ' on' : ''}`} onClick={() => setActiveGenre(g)}>{g}</button>
            ))}
          </div>
          <select value={sortOption} onChange={(e) => setSortOption(e.target.value as SortOption)} aria-label="排序方式">
            {SORT_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="board">
          <div className="row hd" aria-hidden="true">
            <span className="rk">RANK</span>
            <span className="sc">SCORE</span>
            <span />
            <span className="nm">NAME</span>
            <span className="pl">SYS</span>
            <span className="gn hs">GENRE</span>
            <span className="hr hs">TIME</span>
            <span className="dt hs">DATE</span>
            <span className="ac" />
          </div>

          {isLoading ? (
            <div className="state">
              <h3>LOADING...</h3>
              <p>正在讀取你的遊戲清單</p>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="state">
              <h3>{!user ? 'PRESS START' : games.length === 0 ? 'NO DATA' : 'NO MATCH'}</h3>
              <p>
                {!user
                  ? '登入後就能把遊戲評分存到雲端。'
                  : games.length === 0
                    ? '排行榜還是空的，投下第一枚硬幣吧。'
                    : '沒有符合目前篩選條件的遊戲。'}
              </p>
              {!user && <button type="button" className="btn cy" onClick={handleLogin}>Google 登入</button>}
              {user && games.length === 0 && <button type="button" className="btn yl" onClick={() => setIsModalOpen(true)}>＋ 新增第一款遊戲</button>}
            </div>
          ) : (
            <ol>
              {filteredGames.map((game, index) => (
                <GameRow key={game.id} game={game} rank={index} onDelete={handleDeleteGame} onEdit={handleEditGame} />
              ))}
            </ol>
          )}
        </div>

        <p className="foot">© GAMERANK　CREDIT 01　v{APP_VERSION}</p>
      </main>

      {isModalOpen && <AddGameModal isOpen onClose={closeModal} onSave={handleSaveGame} initialData={editingGame} />}

      <ConfirmModal
        isOpen={dialog.isOpen}
        onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        isAlert={dialog.isAlert}
      />
    </div>
  );
};

export default App;
