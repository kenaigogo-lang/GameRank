import { app } from './firebase';
import type { FirebaseStorage } from 'firebase/storage';

/**
 * 封面存放：新封面上傳到 Firebase Storage，資料庫只存圖片網址。
 * 以前封面是 base64 字串直接存在每一筆遊戲資料裡，開站時要整包下載。
 * Storage 尚未開放權限時，自動退回舊做法（存在資料庫裡），不影響使用。
 */

let storagePromise: Promise<{ storage: FirebaseStorage; mod: typeof import('firebase/storage') }> | null = null;
// Storage SDK 只在真的要上傳時才載入，不拖慢開站
const loadStorage = () => {
  storagePromise ??= import('firebase/storage').then(mod => ({ storage: mod.getStorage(app), mod }));
  return storagePromise;
};

let unavailableReason: string | null = null;
/** 這次瀏覽中 Storage 是否已確定無法使用（例如權限規則尚未設定） */
export const storageUnavailableReason = () => unavailableReason;

export const isInlineCover = (url?: string) => !!url && url.startsWith('data:');
export const isStorageCover = (url?: string) => !!url && /firebasestorage\.(googleapis\.com|app)/.test(url);

const describe = (error: any): string => {
  const code = String(error?.code || '');
  if (code === 'storage/unauthorized') return 'Firebase Storage 的權限規則不允許上傳（請依 storage.rules 設定）';
  if (code === 'storage/quota-exceeded') return 'Firebase Storage 用量已達上限';
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') return 'Firebase 專案沒有啟用 Storage';
  return error?.message || '未知錯誤';
};

/** 上傳 base64 封面，回傳下載網址；失敗會丟出錯誤 */
export const uploadCover = async (uid: string, gameId: string, dataUrl: string): Promise<string> => {
  const { storage, mod } = await loadStorage();
  const objectRef = mod.ref(storage, `covers/${uid}/${gameId}-${Date.now()}.jpg`);
  try {
    await mod.uploadString(objectRef, dataUrl, 'data_url', {
      contentType: 'image/jpeg',
      // 每次換封面都是新檔名，可以放心讓瀏覽器長期快取
      cacheControl: 'public, max-age=31536000, immutable',
    });
    return await mod.getDownloadURL(objectRef);
  } catch (error: any) {
    const code = String(error?.code || '');
    if (/unauthorized|bucket-not-found|project-not-found|quota-exceeded/.test(code)) unavailableReason = describe(error);
    throw new Error(describe(error));
  }
};

/**
 * 儲存前處理封面：base64 封面先上傳，成功就換成網址；Storage 無法使用時保留 base64（舊做法）。
 */
export const prepareCover = async (uid: string, gameId: string, imageUrl?: string): Promise<string | undefined> => {
  if (!isInlineCover(imageUrl) || unavailableReason) return imageUrl;
  try {
    return await uploadCover(uid, gameId, imageUrl!);
  } catch (error) {
    console.warn('Cover upload failed, keeping it inline', error);
    return imageUrl;
  }
};

/** 刪除不再使用的封面檔（失敗不影響其他操作） */
export const deleteCoverFile = async (url?: string) => {
  if (!isStorageCover(url)) return;
  try {
    const { storage, mod } = await loadStorage();
    await mod.deleteObject(mod.ref(storage, url!));
  } catch (error) {
    console.warn('Failed to delete old cover file', error);
  }
};
