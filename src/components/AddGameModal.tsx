import React, { useState, useEffect } from 'react';
import { Platform, Game, GameInput, GENRE_OPTIONS } from '../types';
import { fetchGenre, fetchImageViaProxy, searchCovers, UnifiedGame } from '../services/api';
import { useUi } from '../theme';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (game: GameInput) => void;
  initialData?: Game | null;
}

// 10 → 1，每 0.5 一級
const SCORE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5);
const PLATFORMS = [Platform.PS, Platform.XBOX, Platform.SWITCH, Platform.PC];
const MAX_TAGS = 5;
const MAX_COVER_SIZE = 400; // 封面最長邊，控制儲存大小

type SearchSource = 'ALL' | UnifiedGame['source'];

// 用本地時區的今天（toISOString 是 UTC，台灣早上 8 點前會變成昨天）
const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toCoverDataUrl = (img: HTMLImageElement): string => {
  const scale = Math.min(1, MAX_COVER_SIZE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
};

const loadImage = (src: string, crossOrigin = false) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });

// Tag Categories Definition
const TAG_CATEGORIES = [
  {
    id: 'positive',
    label: '正面評價（推坑）',
    tags: [
      '#畫面精美', '#劇情神作', '#美術風格獨特', '#打擊感爽', '#地圖設計精妙',
      '#音樂神曲', '#沉浸感絕佳', '#角色刻畫生動', '#創意十足', '#優化良好'
    ]
  },
  {
    id: 'negative',
    label: '負面評價（勸退）',
    tags: [
      '#優化極差', '#BUG多', '#作業感重', '#操作手感差', '#流程太短',
      '#劇情爛尾', '#視角鏡頭爛', '#新手引導差', '#翻譯品質差'
    ]
  },
  {
    id: 'neutral',
    label: '風格與節奏（中性）',
    tags: [
      '#硬派高難', '#休閒療癒', '#極度燒腦', '#節奏慢熱', '#恐怖壓抑', '#重視探索',
      '#電影式敘事', '#多重結局', '#自由度高', '#一本道流程', '#文字量大', '#懷舊復古'
    ]
  }
];

export const AddGameModal: React.FC<AddGameModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const ui = useUi();
  // 視窗每次開啟都是重新掛載（見 App.tsx），所以初始值直接取自 initialData
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [platform, setPlatform] = useState<Platform>(initialData?.platform ?? Platform.PS);
  const [score, setScore] = useState<number>(initialData?.score ?? 8);
  const [comment, setComment] = useState(initialData?.comment ?? '');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => (initialData?.genre ? initialData.genre.split(', ').filter(Boolean) : []));
  const [ratingDate, setRatingDate] = useState(() => initialData?.ratingDate || todayLocal());
  const [playtime, setPlaytime] = useState<number | ''>(initialData?.playtime || '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? '');
  const [notice, setNotice] = useState('');

  const [isGettingInfo, setIsGettingInfo] = useState(false);

  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedGame[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFilter, setSearchFilter] = useState<SearchSource>('ALL');
  const [searchError, setSearchError] = useState('');

  // Esc：先關子畫面，再關視窗
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isTagSelectorOpen) setIsTagSelectorOpen(false);
      else if (isSearchOpen) setIsSearchOpen(false);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isTagSelectorOpen, isSearchOpen, onClose]);

  if (!isOpen) return null;

  const handleGetInfo = async () => {
    if (!title) return;
    setIsGettingInfo(true);
    try {
      const genre = await fetchGenre(title);
      const matched = GENRE_OPTIONS.find(g => g === genre);
      if (matched) {
        setSelectedGenres([matched]);
        setNotice('');
      } else {
        setNotice('AI 判斷不出這款遊戲的類型，請手動選擇。');
      }
    } catch (error: any) {
      setNotice(`AI 自動判斷失敗：${error?.message || '請稍後再試'}`);
    } finally {
      setIsGettingInfo(false);
    }
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => (prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, tag];
    });
  };

  const insertTags = () => {
    if (selectedTags.length > 0) {
      setComment(selectedTags.join(' ')); // 取代目前評語（沿用原本行為）
      setSelectedTags([]);
    }
    setIsTagSelectorOpen(false);
  };

  const useImageFile = (file: Blob) => {
    const objectUrl = URL.createObjectURL(file);
    loadImage(objectUrl)
      .then(img => { setImageUrl(toCoverDataUrl(img)); setNotice(''); })
      .catch(() => setNotice('這張圖片讀不出來，請換一張。'))
      .finally(() => URL.revokeObjectURL(objectUrl));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) useImageFile(file);
    e.target.value = '';
  };

  const handlePasteClick = async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('Clipboard API not supported');
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          useImageFile(await item.getType(imageType));
          return;
        }
      }
      setNotice('剪貼簿裡沒有圖片，請先複製一張圖。');
    } catch (err) {
      console.error('Clipboard Error:', err);
      setNotice('瀏覽器不允許按鈕直接讀取剪貼簿，請點一下表單後按 Ctrl+V（Mac 為 Cmd+V）貼上。');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          useImageFile(file);
          return;
        }
      }
    }
  };

  const runSearch = async (queryStr: string) => {
    if (!queryStr) return;
    setIsSearching(true);
    setSearchResults([]);
    setSearchFilter('ALL');
    setSearchError('');
    try {
      const { results, failed } = await searchCovers(queryStr);
      setSearchResults(results);
      if (failed.length > 0) setSearchError(`${failed.join('、')} 這次沒有回應，結果可能不完整。`);
    } catch (error: any) {
      setSearchError(error?.message || '搜尋失敗，請稍後再試。');
    } finally {
      setIsSearching(false);
    }
  };

  const openSearch = () => {
    const trimmedTitle = title.trim();
    setSearchQuery(trimmedTitle);
    setSearchResults([]);
    setSearchFilter('ALL');
    setIsSearchOpen(true);
    if (trimmedTitle) void runSearch(trimmedTitle);
  };

  const selectSearchImage = async (url: string) => {
    setIsSearching(true);
    try {
      // 先直接載入；圖片網站不允許跨網域讀取時，改由伺服器轉送
      let img: HTMLImageElement;
      try {
        img = await loadImage(url, true);
      } catch {
        const objectUrl = URL.createObjectURL(await fetchImageViaProxy(url));
        try {
          img = await loadImage(objectUrl);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
      setImageUrl(toCoverDataUrl(img));
      setNotice('');
      setIsSearchOpen(false);
    } catch (error) {
      console.error('Failed to use searched image', url, error);
      setNotice('這張圖片下載不了，請換一張，或另存後用「上傳」。');
      setIsSearchOpen(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !comment.trim()) return;
    onSave({
      title: title.trim(),
      platform,
      score,
      comment,
      genre: selectedGenres.join(', '),
      ratingDate,
      imageUrl,
      playtime: Number(playtime) || 0,
    });
  };

  const sourceCount = (source: UnifiedGame['source']) => searchResults.filter(r => r.source === source).length;
  const visibleResults = (searchFilter === 'ALL' ? searchResults : searchResults.filter(r => r.source === searchFilter)).filter(r => r.coverUrl);
  const subOpen = isTagSelectorOpen || isSearchOpen;

  return (
    <div className="mback" role="dialog" aria-modal="true" aria-labelledby="game-modal-title" onPaste={handlePaste}>
      <div className={ui.box}>
        <div className="mhead">
          <h2 id="game-modal-title">
            {ui.heading(!!initialData)}
            <small>{initialData ? '修改遊戲評分' : '新增遊戲評分'}</small>
          </h2>
          <button type="button" className="x" onClick={onClose} aria-label="關閉">×</button>
        </div>

        <form className="mbody" onSubmit={handleSubmit}>
          <label className="fl">
            <span>遊戲名稱</span>
            <input className={ui.input} type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：艾爾登法環" required autoFocus={!initialData} />
          </label>

          <div className="fl">
            <span>平台</span>
            <div className="seg">
              {PLATFORMS.map(p => (
                <button key={p} type="button" aria-pressed={platform === p} className={ui.option(platform === p, p)} onClick={() => setPlatform(p)}>{p}</button>
              ))}
            </div>
          </div>

          <div className="mrow">
            <label className="fl">
              <span>分數</span>
              <div className={ui.selectWrap}>
                <select value={score} onChange={(e) => setScore(Number(e.target.value))}>
                  {!SCORE_OPTIONS.includes(score) && <option value={score}>{score}（舊資料）</option>}
                  {SCORE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </label>
            <label className="fl">
              <span>時數</span>
              <input className={ui.input} type="number" min="0" inputMode="numeric" value={playtime} onChange={(e) => setPlaytime(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
            </label>
            <label className="fl">
              <span>評分日期</span>
              <input className={ui.input} type="date" value={ratingDate} onChange={(e) => setRatingDate(e.target.value)} />
            </label>
          </div>

          <div className="fl">
            <div className="flh">
              <span>類型（可複選）</span>
              <button type="button" className="link" onClick={handleGetInfo} disabled={!title || isGettingInfo}>
                {isGettingInfo ? <><span className="spin" /> 判斷中</> : 'AI 自動判斷'}
              </button>
            </div>
            <div className="chips">
              {GENRE_OPTIONS.map(g => (
                <button key={g} type="button" aria-pressed={selectedGenres.includes(g)} className={`chip${selectedGenres.includes(g) ? ' on' : ''}`} onClick={() => toggleGenre(g)}>{g}</button>
              ))}
            </div>
          </div>

          <div className="fl">
            <span>封面</span>
            <div className="coverrow">
              <div className="thumb">
                {imageUrl ? (
                  <>
                    <img src={imageUrl} alt="封面預覽" />
                    <button type="button" className="x" onClick={() => setImageUrl('')} aria-label="移除封面">×</button>
                  </>
                ) : '無封面'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="seg">
                  <button type="button" className={ui.option(false)} onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement).click()}>上傳</button>
                  <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
                  <button type="button" className={ui.option(false)} onClick={handlePasteClick}>貼上</button>
                  <button type="button" className={ui.optionAccent} onClick={openSearch}>線上搜尋</button>
                </div>
                <p className="hint">可上傳、貼上（Ctrl+V）或線上搜尋封面。</p>
              </div>
            </div>
          </div>

          <div className="fl">
            <div className="flh">
              <span>評語</span>
              <button type="button" className="link" onClick={() => setIsTagSelectorOpen(true)}>選擇形容標籤</button>
            </div>
            <textarea className={ui.textarea} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="玩完覺得如何？" required />
          </div>

          {notice && <p className="hint notice" role="alert">{notice}</p>}

          <div className="mfoot">
            <button type="button" className={ui.btn} onClick={onClose}>取消</button>
            <button type="submit" className={ui.btnOk} disabled={subOpen}>{initialData ? '更新評分' : '存入排行榜'}</button>
          </div>
        </form>

        {isTagSelectorOpen && (
          <div className="sheet">
            <div className="mhead">
              <h2>SELECT TAGS<small>最多選 {MAX_TAGS} 個，插入後會取代目前評語</small></h2>
              <button type="button" className="x" onClick={() => setIsTagSelectorOpen(false)} aria-label="關閉標籤選擇">×</button>
            </div>
            <div className="mbody">
              {TAG_CATEGORIES.map(category => (
                <div key={category.id} className={`tagcat tk-${category.id}`}>
                  <h4>{category.label}</h4>
                  <div className="tags">
                    {category.tags.map(tag => (
                      <button key={tag} type="button" aria-pressed={selectedTags.includes(tag)} className={`tag${selectedTags.includes(tag) ? ' on' : ''}`} onClick={() => toggleTag(tag)}>{tag}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="sheet-foot">
              <span>已選 {selectedTags.length}/{MAX_TAGS}</span>
              <span className="mfoot">
                {selectedTags.length > 0 && <button type="button" className={ui.btn} onClick={() => setSelectedTags([])}>清除</button>}
                <button type="button" className={ui.btnOk} onClick={insertTags} disabled={selectedTags.length === 0}>插入</button>
              </span>
            </div>
          </div>
        )}

        {isSearchOpen && (
          <div className="sheet">
            <div className="mhead">
              <h2>SEARCH COVER<small>從 Steam、IGDB、Google 搜尋封面</small></h2>
              <button type="button" className="x" onClick={() => setIsSearchOpen(false)} aria-label="關閉封面搜尋">×</button>
            </div>
            <div className="mbody">
              <form className="searchbar" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void runSearch(searchQuery); }}>
                <input className={ui.input} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="遊戲名稱" aria-label="搜尋遊戲名稱" autoFocus={!searchQuery} />
                <button type="submit" className={ui.btnInfo} disabled={isSearching || !searchQuery}>{isSearching ? <span className="spin" /> : '搜尋'}</button>
              </form>

              {searchError && !isSearching && <p className="hint notice" role="alert">{searchError}</p>}

              {searchResults.length > 0 && !isSearching && (
                <div className="chips">
                  <button type="button" className={`chip${searchFilter === 'ALL' ? ' on' : ''}`} onClick={() => setSearchFilter('ALL')}>全部 ({searchResults.length})</button>
                  {(['STEAM', 'IGDB', 'GOOGLE'] as const).filter(src => sourceCount(src) > 0).map(src => (
                    <button key={src} type="button" className={`chip${searchFilter === src ? ' on' : ''}`} onClick={() => setSearchFilter(src)}>{src} ({sourceCount(src)})</button>
                  ))}
                </div>
              )}

              {isSearching ? (
                <p className="empty"><span className="spin" /> 搜尋中…</p>
              ) : visibleResults.length > 0 ? (
                <div className="results">
                  {visibleResults.map(game => (
                    <button key={game.id} type="button" className="res" onClick={() => selectSearchImage(game.coverUrl)} title={game.name}>
                      <img src={game.coverUrl} alt={game.name} loading="lazy" />
                      <span className="src">{game.source}</span>
                      <span className="nm2">{game.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty">{searchQuery ? (searchError ? '' : '找不到結果。') : '輸入遊戲名稱開始搜尋。'}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
