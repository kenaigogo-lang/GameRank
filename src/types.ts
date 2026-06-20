
export enum Platform {
  PS = 'PS',
  XBOX = 'XBOX',
  SWITCH = 'SWITCH',
  PC = 'PC'
}

export const GENRE_OPTIONS = [
  '角色扮演',
  '動作冒險',
  '類魂',
  '互動式電影',
  'Roguelike',
  '類惡魔城',
  '恐怖',
  '音樂/節奏',
  '策略/模擬',
  '視覺小說',
  '休閒益智',
  '運動競速',
  '射擊',
  '格鬥'
] as const;

export interface Game {
  id: string;
  title: string;
  platform: Platform;
  score: number; // 1-10
  comment: string;
  genre?: string;
  ratingDate: string; // YYYY-MM-DD
  playtime?: number; // Hours
  imageUrl?: string;
  addedAt: number;
}

export type SortOption = 'SCORE_DESC' | 'SCORE_ASC' | 'DATE_DESC' | 'DATE_ASC' | 'PLAYTIME_DESC' | 'PLAYTIME_ASC';

export interface GameInfoResponse {
  genre: string;
  releaseYear: string;
  shortDescription: string;
}

export interface AIReviewResponse {
  review: string;
}