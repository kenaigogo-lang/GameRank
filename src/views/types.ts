import type { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { Game, Platform, SortOption } from '../types';
import { ThemeName } from '../theme';

/** 兩套主題畫面共用的資料與操作；畫面本身只負責排版 */
export interface ViewProps {
  theme: ThemeName;
  /** 頁面上方的提示列（例如封面搬移），沒有就不顯示 */
  notice?: ReactNode;
  user: User | null;
  hasGames: boolean;
  /** 讀取雲端存檔失敗（這時清單是空的，但不代表沒有資料） */
  loadFailed: boolean;
  isLoading: boolean;
  isSaving: boolean;
  /** 先顯示裝置上的清單，正在向雲端更新 */
  isSyncing: boolean;
  version: string;
  stats: { total: number; avgScore: string; totalPlaytime: number };
  tabs: ('ALL' | Platform)[];
  tabCounts: Record<string, number>;
  activeTab: 'ALL' | Platform;
  genres: string[];
  activeGenre: string;
  sortOption: SortOption;
  sortLabels: [SortOption, string][];
  games: Game[];
  onSelectTab: (tab: 'ALL' | Platform) => void;
  onSelectGenre: (genre: string) => void;
  onSort: (sort: SortOption) => void;
  /** 清單內搜尋（名稱或評語） */
  searchText: string;
  onSearch: (text: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onLogin: () => void;
  onLogout: () => void;
  onExport: () => void;
  onImport: () => void;
  onCloudBackup: () => void;
  onCloudRestore: () => void;
  onToggleTheme: () => void;
}

export const emptyState = (p: Pick<ViewProps, 'user' | 'hasGames' | 'loadFailed' | 'searchText'>) =>
  p.loadFailed
    ? { title: 'LOAD ERROR', text: '存檔讀取失敗，資料還在雲端上。請看上方的說明，修正後重新整理。' }
    : !p.user
    ? { title: 'PRESS START', text: '登入後就能把遊戲評分存到雲端。' }
    : !p.hasGames
      ? { title: 'NO DATA', text: '還沒有任何評分，新增第一款遊戲吧。' }
      : p.searchText.trim()
        ? { title: 'NO MATCH', text: `找不到名稱或評語包含「${p.searchText.trim()}」的遊戲。` }
        : { title: 'NO MATCH', text: '沒有符合目前篩選條件的遊戲。' };

export const scopeLabel = (tab: string) => (tab === 'ALL' ? '全部平台合計' : `僅計算 ${tab} 平台`);
export const userLabel = (user: User | null) => (user ? user.displayName || user.email || '已登入' : '訪客');
