import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage"; 
import { Game } from "../types";

// Access the global firebase instance exposed by the compat scripts
const firebaseGlobal = (window as any).firebase;

// ⚠️ IMPORTANT: REPLACE WITH YOUR FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyCfUxiC51h8PDPeejE7SN4lncp__0_iWLQ",
  authDomain: "gamerankdb.firebaseapp.com",
  projectId: "gamerankdb",
  // CHANGED: Corrected bucket name based on user confirmation (gs://gamerankdb.firebasestorage.app)
  storageBucket: "gamerankdb.firebasestorage.app", 
  messagingSenderId: "593772759968",
  appId: "1:593772759968:web:d793f413019450c18fb2c5",
  measurementId: "G-80XWCKYSLP"
};

// Initialize Firebase
let app: any;
let auth: any; 
let db: any;
let storage: any;

try {
    if (firebaseGlobal && !firebaseGlobal.apps.length) {
        app = firebaseGlobal.initializeApp(firebaseConfig);
    } else if (firebaseGlobal) {
        app = firebaseGlobal.app();
    } else if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    
    if (firebaseGlobal) {
        auth = firebaseGlobal.auth();
        db = firebaseGlobal.firestore();
        storage = firebaseGlobal.storage();
    } else {
        auth = firebase.auth();
        db = firebase.firestore();
        storage = firebase.storage();
    }
} catch (error) {
    console.warn("Firebase initialization failed.", error);
}

export const signInWithGoogle = async (): Promise<firebase.User | null> => {
  if (!auth) throw new Error("Firebase not configured");
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const signOut = async () => {
  if (!auth) return;
  try {
    await auth.signOut();
  } catch (error) {
    console.error("Error signing out", error);
  }
};

// Helper: Convert Base64 Data URI to Blob
const dataURItoBlob = (dataURI: string) => {
  try {
      const splitData = dataURI.split(',');
      if (splitData.length < 2) throw new Error("Invalid Data URI");
      
      const byteString = atob(splitData[1]);
      const mimeString = splitData[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
  } catch (e) {
      console.error("Failed to convert data URI to blob", e);
      throw e;
  }
};

// Helper: Upload Image to Firebase Storage under /images
const uploadImageToStorage = async (userId: string, gameId: string, base64Image: string): Promise<string> => {
    if (!storage) throw new Error("Firebase Storage not initialized");
    
    const blob = dataURItoBlob(base64Image);
    // Path requested: images/{userId}/{gameId}.jpg
    const storageRef = storage.ref().child(`images/${userId}/${gameId}.jpg`);
    
    const metadata = {
        contentType: blob.type,
    };
    
    // Create a timeout promise to prevent infinite hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Image upload timed out (20s)")), 20000);
    });

    // Race between upload and timeout
    const uploadTask = storageRef.put(blob, metadata);
    
    await Promise.race([uploadTask, timeoutPromise]);
    
    const downloadURL = await storageRef.getDownloadURL();
    return downloadURL;
};

// Upload the JSON to Firebase Storage as a file, AFTER optimizing images
export const saveBackupToCloud = async (userId: string, games: Game[]): Promise<Game[]> => {
  if (!storage) throw new Error("Firebase Storage not initialized");
  
  try {
    // Clone games to avoid mutation before we are ready
    const updatedGames = [...games];
    
    console.log("Starting backup process...");
    
    // 1. Optimize Images: Upload Base64 to Storage and replace with URLs
    const uploadPromises = updatedGames.map(async (game, index) => {
        if (game.imageUrl && game.imageUrl.startsWith('data:image')) {
            try {
                console.log(`Optimizing image for: ${game.title}`);
                const storageUrl = await uploadImageToStorage(userId, game.id, game.imageUrl);
                updatedGames[index] = { ...game, imageUrl: storageUrl };
            } catch (err) {
                console.error(`Failed to upload image for ${game.title}. Keeping Base64.`, err);
                // On failure, we keep the Base64 so data isn't lost, just not optimized
            }
        }
        return Promise.resolve();
    });

    // Wait for all image uploads to finish
    await Promise.all(uploadPromises);
    console.log("Image optimization complete.");

    // 2. Create JSON Blob from the OPTIMIZED games list
    const jsonString = JSON.stringify(updatedGames);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Store backup JSON in users/{userId}/backup.json
    const storageRef = storage.ref().child(`users/${userId}/backup.json`);
    
    const metadata = {
        contentType: 'application/json',
    };

    // Timeout for JSON upload
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("JSON backup upload timed out.")), 30000);
    });

    await Promise.race([storageRef.put(blob, metadata), timeoutPromise]);
    
    console.log("Backup JSON uploaded successfully");
    
    // Return the updated games list so the UI can update local state with URLs
    return updatedGames;
  } catch (error: any) {
    console.error("Error saving backup to storage:", error);
    throw error;
  }
};

// Download the JSON file from Firebase Storage and parse it
export const restoreBackupFromCloud = async (userId: string): Promise<Game[] | null> => {
  if (!storage) throw new Error("Firebase Storage not initialized");
  
  try {
    const storageRef = storage.ref().child(`users/${userId}/backup.json`);
    
    // Get the download URL
    const url = await storageRef.getDownloadURL();
    
    // Use CORS proxy to bypass CORS restrictions on Firebase Storage download URLs
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

    console.log("Fetching backup from:", proxyUrl);

    // Fetch the JSON content via Proxy
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch backup file: ${response.statusText}`);
    }
    
    const games = await response.json();
    return games as Game[];
  } catch (error: any) {
    // If the error code is 'storage/object-not-found', it means no backup exists
    if (error.code === 'storage/object-not-found') {
        console.log("No backup found for user");
        return null;
    }
    console.error("Error restoring backup from storage:", error);
    throw error;
  }
};

export { auth };