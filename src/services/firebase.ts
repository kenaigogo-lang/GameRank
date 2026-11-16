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
    console.error('Error fetching user backup games', error);
    return [];
  }
};

export const saveUserBackupGames = async (userId: string, games: Game[]): Promise<void> => {
  try {
    const backupCollection = collection(db, 'users', userId, 'backups');
    const existingBackupDocs = await getDocs(backupCollection);
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
const settleEither = async (label: string, writes: Promise<unknown>[]): Promise<void> => {
  const results = await Promise.allSettled(writes);
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  failures.forEach((f) => console.warn(`${label}: one store rejected the write`, f.reason));
  if (failures.length === results.length) throw failures[0].reason;
};

/**
 * 只寫入「這一款」遊戲。取代以往每次儲存都把整個收藏刪掉重寫的做法。
 * isNew 時給一個比現有都小的 backupOrder，重新載入後仍排在最前面。
 */
export const saveGameRecord = async (userId: string, game: Game, isNew: boolean): Promise<void> => {
  const { id, ...data } = game;
  const now = Date.now();
  await settleEither('saveGameRecord', [
    setDoc(doc(db, 'users', userId, 'backups', id), { ...game, updatedAt: now, ...(isNew ? { backupOrder: -now } : {}) }, { merge: true }),
    setDoc(doc(db, 'games', id), { ...data, userId }, { merge: true }),
  ]);
};

/** 只更新封面網址（搬移封面用），不碰其他欄位 */
export const updateGameCover = async (userId: string, id: string, imageUrl: string): Promise<void> => {
  const now = Date.now();
  await settleEither('updateGameCover', [
    setDoc(doc(db, 'users', userId, 'backups', id), { imageUrl, updatedAt: now }, { merge: true }),
    setDoc(doc(db, 'games', id), { imageUrl, userId }, { merge: true }),
  ]);
};

export const deleteGameRecord = async (userId: string, id: string): Promise<void> => {
  await settleEither('deleteGameRecord', [
    deleteDoc(doc(db, 'users', userId, 'backups', id)),
    deleteDoc(doc(db, 'games', id)),
  ]);
};
