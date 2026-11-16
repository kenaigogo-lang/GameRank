import { createContext, useContext } from 'react';

export type ThemeName = 'nes' | 'arcade';

export const THEME_LABEL: Record<ThemeName, string> = { nes: '紅白機', arcade: '街機' };
const STORAGE_KEY = 'gamerank_theme';
const THEME_COLOR: Record<ThemeName, string> = { nes: '#212529', arcade: '#07060d' };

export const loadTheme = (): ThemeName => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'arcade' ? 'arcade' : 'nes';
  } catch {
    return 'nes';
  }
};

export const applyTheme = (theme: ThemeName) => {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 無法儲存偏好（例如無痕模式）時，這次瀏覽仍可切換
  }
};

/** 兩套主題共用同一份對話框結構，只有元件的 class 不同 */
const UI = {
  nes: {
    box: 'nes-container is-rounded mbox',
    heading: (editing: boolean) => (editing ? 'EDIT GAME' : 'NEW GAME'),
    btn: 'nes-btn',
    btnOk: 'nes-btn is-success',
    btnInfo: 'nes-btn is-primary',
    btnConfirm: 'nes-btn is-primary',
    input: 'nes-input',
    textarea: 'nes-textarea',
    selectWrap: 'nes-select selw',
    option: (active: boolean, _key?: string) => `nes-btn sm${active ? ' is-primary' : ''}`,
    optionAccent: 'nes-btn is-warning sm',
  },
  arcade: {
    box: 'mbox',
    heading: (editing: boolean) => (editing ? 'EDIT SCORE' : 'ENTER YOUR SCORE'),
    btn: 'btn',
    btnOk: 'btn go',
    btnInfo: 'btn cy',
    btnConfirm: 'btn go',
    input: '',
    textarea: '',
    selectWrap: 'selw',
    option: (active: boolean, key?: string) => `${key ? `p-${key}` : ''}${active ? ' on' : ''}`.trim(),
    optionAccent: 'on',
  },
};

export const ThemeContext = createContext<ThemeName>('nes');
export const useUi = () => UI[useContext(ThemeContext)];
