# GameRank 技術規格

## 架構

- **前端**：React 18 + Vite 單頁應用，部署在 Vercel。樣式是純 CSS，紅白機主題使用 NES.css。
- **登入**：Firebase Authentication（Google 登入）。
- **資料**：Firestore（使用輕量版 SDK `firebase/firestore/lite`，只做單次讀寫，不做即時同步）。
- **封面**：Firebase Storage，資料庫只存圖片下載網址。
- **伺服器端函式**：`api/` 底下的 Vercel Functions，負責所有需要金鑰的外部服務。每個請求都要附上 Firebase 登入憑證（ID token），函式用 Google 的公開金鑰驗證，不需要服務帳戶。

## 資料格式

每款遊戲一筆，欄位定義在 `src/types.ts`：

| 欄位 | 說明 |
|---|---|
| `title` | 遊戲名稱 |
| `platform` | `PS`、`XBOX`、`SWITCH`、`PC` |
| `score` | 1–10，0.5 一級（極舊資料可能是 100 分制，顯示時會換算） |
| `comment` | 評語，常見是形容標籤如 `#畫面精美 #硬派高難` |
| `genre` | 類型，多個以 `, ` 分隔 |
| `ratingDate` | 評分日期 `YYYY-MM-DD` |
| `playtime` | 遊玩時數 |
| `imageUrl` | 封面：Storage 下載網址；舊資料可能是 base64（`data:` 開頭） |
| `addedAt` | 新增時間（毫秒） |

### 存放位置

- `users/{uid}/backups/{gameId}`：主要資料來源，開站時讀這裡。另有 `backupOrder`、`updatedAt` 欄位。
- `games/{gameId}`：舊的集合，每筆多一個 `userId`。`backups` 沒有資料時才讀它。
- `users/{uid}`：備份摘要（`gameCount`、`backupUpdatedAt`）。
- Storage `covers/{uid}/{gameId}-{時間}.jpg`：封面圖，每次換封面都是新檔名，舊檔會刪除。

新增、編輯、刪除時，兩個集合都只寫那一筆，其中一處成功就算存好。「雲端備份」與匯入 JSON 是少數會整批重寫 `backups` 的操作。

## 儲存流程

1. 畫面先更新、視窗立刻關閉。
2. 背景處理：封面是 base64 的話先上傳 Storage，換成網址；Storage 不能用（例如權限規則未設定）就保留 base64。
3. 寫入那一筆資料。失敗時把畫面還原，並告知使用者。
4. 寫入期間頁面顯示 `NOW SAVING...`，關閉分頁會被提醒。

還存在資料庫裡的 base64 封面，頁面上方會出現「搬移封面」提示，按下後逐張上傳並改成網址；任一張失敗就停止，已完成的保留，未完成的照常顯示。

## 伺服器端函式（`api/`）

| 路徑 | 用途 | 需要的環境變數 |
|---|---|---|
| `GET /api/cover-search?q=` | 同時搜尋 Steam、IGDB、Google 圖片的封面。中文名稱先用維基百科換成英文再查 IGDB。單一來源失敗不影響其他來源。 | `IGDB_CLIENT_ID`、`IGDB_CLIENT_SECRET`、`GOOGLE_API_KEY`、`GOOGLE_CX` |
| `GET /api/genre?title=` | 用 Gemini 從固定清單選一個類型 | `GEMINI_API_KEY`（選填 `GEMINI_MODEL`） |
| `GET /api/image?url=` | 圖片轉送。有些圖片網站不允許跨網域讀取，瀏覽器無法縮圖時才走這裡。只轉送圖片、上限 8 MB、不轉送內網位址。 | — |

所有函式都需要 `FIREBASE_PROJECT_ID` 來驗證登入憑證。舊的 `VITE_` 前綴名稱目前仍相容。

## 外部服務與額度

| 服務 | 用途 | 免費額度／限制 |
|---|---|---|
| Firebase Auth | Google 登入 | Google 登入不計費 |
| Firestore | 遊戲資料 | 每天 5 萬次讀取、2 萬次寫入 |
| Firebase Storage | 封面圖 | 依方案而定；新的儲存桶需要 Blaze 方案（用量內仍免費） |
| IGDB | 封面搜尋 | 每秒 4 次請求 |
| Steam 商店搜尋 | 封面搜尋 | 無公開限制 |
| Google Custom Search | 封面搜尋 | 每天 100 次，超過每千次 5 美元 |
| Gemini | 類型判斷 | 依 Google AI Studio 的免費額度 |

## 功能

- 新增、編輯、刪除評分；同平台同名稱不可重複。
- 統計：遊戲總數、平均分數、遊戲總時數，依目前選的平台計算。
- 平台分頁依遊戲數量排序；類型篩選只列出目前平台有的類型。
- 排序：分數、評分日期、遊玩時數，各有正反向。
- 封面：上傳、貼上（Ctrl+V）、線上搜尋；一律縮到最長邊 400px、JPEG 品質 0.8。
- 評語可從正面／負面／中性三組形容標籤挑最多 5 個。
- 匯出／匯入 JSON；登入時可整批備份到雲端或從雲端還原。
- 兩套主題一鍵切換，選擇記在瀏覽器裡。
