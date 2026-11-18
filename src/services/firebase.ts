import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, deleteDoc, doc, query, where, getDoc, setDoc, writeBatch } from 'firebase/firestore/lite';
import { Game, Platform } from '../types';

// Firebase 公開設定（這些值本來就會出現在前端，不是秘密）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

/** 建置時沒拿到的必要設定（Vercel 環境變數漏設或名稱打錯時會出現） */
export const missingFirebaseConfig: string[] = Object.entries({
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
}).filter(([, value]) => !value).map(([name]) => name);

/** 把 Firebase 的錯誤翻成看得懂、知道去哪裡修的訊息 */
export const describeFirebaseError = (error: any): string => {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '');
  if (/projectId/i.test(message)) return '網站缺少 Firebase 專案 ID（Vercel 的 VITE_FIREBASE_PROJECT_ID 沒設定），請補上後重新部署。';
  if (/API key|api-key|blocked/i.test(message) || code.includes('api-key')) {
    return `Firebase 的網頁金鑰無效，或它的「API 限制」擋住了資料庫（${message}）。請檢查 Vercel 的 VITE_FIREBASE_API_KEY，以及 Google Cloud 上這把金鑰的限制。`;
  }
  if (code.includes('permission-denied')) return 'Firestore 的權限規則拒絕讀取。請到 Firebase Console → Firestore Database → Rules 檢查規則。';
  if (code.includes('unavailable') || /network|fetch/i.test(message)) return '連不上 Firebase，請檢查網路後重新整理。';
  return message || '未知錯誤';
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

// Firestore Helpers
export const getGames = async (userId: string): Promise<Game[]> => {
  try {
    const q = query(collection(db, 'games'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
  } catch (error) {
    console.error("Error fetching games", error);
    throw error;
  }
};

const normalizeBackupGames = (gamesData: any): any[] => {
  if (!gamesData) return [];

  if (typeof gamesData === 'string') {
    try {
      gamesData = JSON.parse(gamesData);
    } catch (parseError) {
      console.warn('Failed to parse games backup string', parseError);
      return [];
    }
  }

  if (Array.isArray(gamesData)) {
    return gamesData;
  }

  if (typeof gamesData === 'object' && gamesData !== null) {
    if (Array.isArray((gamesData as any).games)) {
      return (gamesData as any).games;
    }
    return Object.values(gamesData);
  }

  return [];
};

export const getUserBackupGames = async (userId: string): Promise<Game[]> => {
  try {
    const backupDocs = await getDocs(collection(db, 'users', userId, 'backups'));
    if (!backupDocs.empty) {
      const gamesData = backupDocs.docs
        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as Game & { backupOrder?: number }))
        .sort((a, b) => (a.backupOrder ?? 0) - (b.backupOrder ?? 0));

      if (gamesData.length > 0) {
        return gamesData.map((game: any) => {
          let platform = game.platform;
          if (game.platform === 'PS5' || game.platform === 'PS') platform = Platform.PS;
          if (game.platform === 'STEAM' || game.platform === 'PC') platform = Platform.PC;
          if (game.platform === 'XBOX' || game.platform === 'Xbox') platform = Platform.XBOX;
          if (game.platform === 'SWITCH' || game.platform === 'Switch') platform = Platform.SWITCH;

          return {
            ...game,
            id: game.id || game._id,
            platform,
          } as Game;
        });
      }
    }

    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return [];
    }

    const data = userDoc.data();
    const legacyGames = normalizeBackupGames(data.games);
    if (legacyGames.length === 0) {
      return [];
    }

    return legacyGames.map((game: any) => {
      let platform = game.platform;
      if (game.platform === 'PS5' || game.platform === 'PS') platform = Platform.PS;
      if (game.platform === 'STEAM' || game.platform === 'PC') platform = Platform.PC;
      if (game.platform === 'XBOX' || game.platform === 'Xbox') platform = Platform.XBOX;
      if (game.platform === 'SWITCH' || game.platform === 'Switch') platform = Platform.SWITCH;

      return {
        ...game,
        platform,
      } as Game;
    });
  } catch (error) {
    // 讀取失敗一定要讓畫面知道，不能當成「沒有資料」，否則使用者可能拿空清單去覆蓋雲端
    console.error('Error fetching user backup games', error);
    throw error;
  }
};

export const saveUserBackupGames = async (userId: string, games: Game[]): Promise<void> => {
  try {
    const backupCollection = collection(db, 'users', userId, 'backups');
    const existingBackupDocs = await getDocs(backupCollection);
    if (games.length === 0 && !existingBackupDocs.empty) {
      throw new Error('目前的清單是空的；為了避免把雲端存檔整個清掉，已取消這次備份。');
    }
    const batch = writeBatch(db);

    existingBackupDocs.docs.forEach((backupDoc) => {
      batch.delete(backupDoc.ref);
    });

    games.forEach((game, index) => {
      const backupDocRef = doc(backupCollection, game.id || `backup-${index}`);
      batch.set(backupDocRef, {
        ...game,
        backupOrder: index,
        updatedAt: Date.now(),
      });
    });

    batch.set(doc(db, 'users', userId), {
      backupVersion: 2,
      backupUpdatedAt: Date.now(),
      gameCount: games.length,
    }, { merge: true });

    await batch.commit();
  } catch (error) {
    console.error('Error saving user backup games', error);
    throw error;
  }
};

// 新遊戲的 id 在本機就能產生，畫面不必等雲端回應
export const newGameId = (): string => doc(collection(db, 'games')).id;

// 兩個存放位置都寫（讀取時以 backups 為主、games 為備援），只要其中一處成功就算存好。
/**
 * 資料只存一份：users/{uid}/backups/{gameId}（開站時讀的地方）。
 * 舊的 games 集合是 AI Studio 時期的設計，只在 backups 寫入被拒絕時才當備援，
 * 刪除時順手清掉，避免 backups 清空後舊資料又被讀回來。
 */
const backupRef = (userId: string, id: string) => doc(db, 'users', userId, 'backups', id);
const legacyRef = (id: string) => doc(db, 'games', id);

const writeWithFallback = async (label: string, primary: () => Promise<unknown>, legacy: () => Promise<unknown>) => {
  try {
    await primary();
  } catch (error: any) {
    if (!String(error?.code || '').includes('permission-denied')) throw error;
    console.warn(`${label}: backups rejected the write, using the legacy games collection`, error);
    await legacy();
  }
};

/**
 * 只寫入「這一款」遊戲。取代以往每次儲存都把整個收藏刪掉重寫的做法。
 * isNew 時給一個比現有都小的 backupOrder，重新載入後仍排在最前面。
 */
export const saveGameRecord = async (userId: string, game: Game, isNew: boolean): Promise<void> => {
  const { id, ...data } = game;
  const now = Date.now();
  await writeWithFallback(
    'saveGameRecord',
    () => setDoc(backupRef(userId, id), { ...game, updatedAt: now, ...(isNew ? { backupOrder: -now } : {}) }, { merge: true }),
    () => setDoc(legacyRef(id), { ...data, userId }, { merge: true })
  );
};

/** 只更新封面網址（搬移封面用），不碰其他欄位 */
export const updateGameCover = async (userId: string, id: string, imageUrl: string): Promise<void> => {
  await writeWithFallback(
    'updateGameCover',
    () => setDoc(backupRef(userId, id), { imageUrl, updatedAt: Date.now() }, { merge: true }),
    () => setDoc(legacyRef(id), { imageUrl, userId }, { merge: true })
  );
};

export const deleteGameRecord = async (userId: string, id: string): Promise<void> => {
  await deleteDoc(backupRef(userId, id));
  // 舊集合可能沒有這一筆，或規則不允許，失敗不影響結果
  await deleteDoc(legacyRef(id)).catch(() => undefined);
};
