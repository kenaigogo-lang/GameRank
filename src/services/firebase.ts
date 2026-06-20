import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getDoc, setDoc } from 'firebase/firestore';
import { Game, Platform } from '../types';

// TODO: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCfUxiC51h8PDPeejE7SN4lncp__0_iWLQ",
  authDomain: "gamerankdb.firebaseapp.com",
  projectId: "gamerankdb",
  storageBucket: "gamerankdb.firebasestorage.app",
  messagingSenderId: "593772759968",
  appId: "1:593772759968:web:d793f413019450c18fb2c5",
  measurementId: "G-80XWCKYSLP"
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
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return [];
    }

    const data = userDoc.data();
    const gamesData = normalizeBackupGames(data.games);
    if (gamesData.length === 0) {
      return [];
    }

    return gamesData.map((game: any) => {
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
    await setDoc(doc(db, 'users', userId), { games }, { merge: true });
  } catch (error) {
    console.error('Error saving user backup games', error);
    throw error;
  }
};

export const updateGame = async (id: string, game: Partial<Game>): Promise<void> => {
  try {
    const gameRef = doc(db, 'games', id);
    await updateDoc(gameRef, game);
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
