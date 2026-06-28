import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, query, where, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { Game, Platform } from '../types';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
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

export const addGame = async (game: Omit<Game, 'id'>, userId: string): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, 'games'), { ...game, userId });
    return docRef.id;
  } catch (error) {
    console.error("Error adding game", error);
    throw error;
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

export const updateGame = async (id: string, game: Partial<Game>, userId?: string): Promise<void> => {
  try {
    const gameRef = doc(db, 'games', id);
    // Ensure userId is included in the write if provided. This avoids
    // Firestore rules rejecting the update when request.resource.data.userId
    // is expected to match request.auth.uid.
    const payload = userId ? { ...game, userId } : game;
    await setDoc(gameRef, payload, { merge: true });
  } catch (error) {
    console.error("Error updating game", error);
    throw error;
  }
};

export const deleteGame = async (id: string): Promise<void> => {
  try {
    const gameRef = doc(db, 'games', id);
    await deleteDoc(gameRef);
  } catch (error) {
    console.error("Error deleting game", error);
    throw error;
  }
};
