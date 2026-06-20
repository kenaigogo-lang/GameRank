# GameRank 應用程式技術規格書

## 1. 專案概述 (Project Overview)
GameRank 是一個基於 React 19 開發的單頁應用程式 (SPA)，專注於個人遊戲收藏的評分、評論與追蹤。該應用程式採用「無伺服器 (Serverless)」與「客戶端優先 (Client-first)」架構，主要數據存儲於瀏覽器 LocalStorage，並透過 Firebase 進行雲端備份。

## 2. 使用的服務與 API 串接方式 (Services & APIs)

本專案整合了多個第三方服務，以實現自動化資訊填寫、封面搜尋與雲端同步。

### A. Google Firebase
*   **用途**: 使用者身分驗證、雲端資料備份、圖片託管。
*   **模組**:
    *   **Authentication**: 使用 Google Sign-In (`GoogleAuthProvider`) 進行登入。
    *   **Storage**:
        *   儲存備份檔 (`backup.json`)。
        *   儲存遊戲封面圖片 (將 Base64 轉為 Blob 上傳，路徑為 `images/{userId}/{gameId}.jpg`)。
*   **串接方式**: 使用 `firebase/compat` SDK 直接在前端初始化與呼叫。

### B. Google Gemini API (AI)
*   **用途**: 自動判斷遊戲的「類別 (Genre)」。
*   **模型**: `gemini-2.5-flash`。
*   **串接方式**: 使用 `@google/genai` SDK。
*   **流程**: 前端發送遊戲名稱 -> Gemini 分析並從預定義列表 (`GENRE_OPTIONS`) 中回傳最適合的單一分類。

### C. IGDB API (Twitch)
*   **用途**: 搜尋遊戲資料庫以取得精確的遊戲名稱與高畫質封面。
*   **串接方式**: REST API (需透過 CORS Proxy)。
*   **認證流程**: Client Credentials Flow。
    1.  前端 POST 請求至 Twitch Auth 取得 Access Token。
    2.  將 Token 存於 LocalStorage 避免重複請求。
    3.  使用 Token 向 IGDB 查詢遊戲資料。

### D. Steam Store API
*   **用途**: 搜尋 PC 遊戲封面與資訊。
*   **端點**: `https://store.steampowered.com/api/storesearch/`
*   **參數**: 設定 `l=tchinese` (繁體中文) 與 `cc=TW` (台灣區) 以優化搜尋結果。
*   **串接方式**: REST API (需透過 CORS Proxy)。

### E. Google Programmable Search Engine (Custom Search API)
*   **用途**: 作為備案搜尋，針對特定遊戲網站 (如巴哈姆特 GNN、Nintendo TW) 搜尋封面圖片。
*   **串接方式**: REST API (GET request)。

### F. Wikipedia API
*   **用途**: 翻譯輔助。當使用者輸入中文遊戲名稱時，呼叫 Wiki API 查詢對應的英文條目名稱 (`langlinks`)，再將英文名稱傳送給 IGDB 進行搜尋 (因 IGDB 對中文支援較弱)。
*   **串接方式**: REST API (需透過 CORS Proxy)。

### G. corsproxy.io (第三方 Proxy)
*   **用途**: 解決瀏覽器同源政策 (CORS) 限制。
*   **應用範圍**: 用於 Steam、IGDB Auth、Wikipedia API 的請求，以及下載跨網域圖片以進行 Canvas 壓縮處理。

---

## 3. 服務費用與免費額度 (Pricing & Quotas)

以下列出專案中所有服務的計費標準與限制 (截至 2024/2025 標準)：

| 服務名稱 | 方案/層級 | 免費額度限制 | 超額/收費標準 | 潛在風險 |
| :--- | :--- | :--- | :--- | :--- |
| **Google Firebase** | Spark Plan (免費) | **Storage**: 5GB 儲存空間, 1GB 下載/天, 20k 上傳/天<br>**Auth**: 簡訊驗證有額度，Google 登入通常無限制 | **Blaze Plan**: Pay-as-you-go<br>儲存: $0.026/GB<br>下載: $0.12/GB | 若圖片未經壓縮直接上傳，易超過下載頻寬限制。 |
| **Google Gemini API** | Free Tier | **Rate Limits**: 15 RPM (每分請求), 100萬 TPM (每分 Token), 1,500 RPD (每天請求) | **Pay-as-you-go**: 需綁定 Billing 專案才可使用付費層級 | 用於個人的 "Auto Genre" 功能通常不會超標。 |
| **IGDB API** | 免費 (需 Twitch 帳號) | **Rate Limits**: 4 Requests / Second (每秒 4 次) | 無付費解鎖額度，純硬性限制 | 並發搜尋過多時可能觸發 429 Too Many Requests。 |
| **Google Custom Search** | 免費層級 | **每日 100 次搜尋查詢** | **$5 USD / 1,000 次查詢** | **最高風險項目**。只要超過 100 次/天，搜尋功能會直接失效或產生費用。 |
| **Steam Web API** | 公開免費 | 無官方公佈硬性限制，通常依 IP 限制 (每 5 分鐘 200 次左右) | 無 | 依賴 CORS Proxy，若 Proxy 掛掉則失效。 |
| **Wikipedia API** | 公開免費 | 無嚴格限制，建議 User-Agent 識別 | 無 | 依賴 CORS Proxy。 |
| **corsproxy.io** | 公共免費服務 | 無保證 SLA，隨時可能變慢或阻擋高流量來源 | 無 (亦有付費自架版) | 若公共服務失效，整個 App 的搜尋功能會癱瘓。 |

---

## 4. 應用程式完整功能列表 (Functional Specifications)

### 核心功能 (Core Features)
1.  **遊戲管理 (CRUD)**:
    *   新增、編輯、刪除遊戲評分。
    *   欄位包含：標題、平台 (PS, XBOX, SWITCH, PC)、分數 (1-10)、評論、類別、評分日期、遊玩時數、封面圖。
2.  **資料持久化**:
    *   主要資料存儲於 `localStorage`，確保離線可用且無後端讀寫成本。
    *   圖片在本地端儲存為 Base64 字串 (備份至雲端時會轉為 Storage URL)。
3.  **統計儀表板**:
    *   顯示總遊戲數、平均分數、總遊玩時數。
    *   數據會根據當前選定的「平台篩選器」動態變更。

### 篩選與排序 (Filtering & Sorting)
1.  **平台篩選**:
    *   支援 ALL, PS, XBOX, SWITCH, PC。
    *   平台按鈕依據「遊戲數量」動態排序 (由多到少)。
2.  **類別篩選 (Genre)**:
    *   根據當前平台擁有的遊戲類別動態生成篩選按鈕。
    *   若該平台下無某類別遊戲，該類別按鈕會自動隱藏。
3.  **排序功能**:
    *   分數 (高/低)、日期 (新/舊)、遊玩時數 (長/短)。

### 自動化與 AI 功能 (Automation)
1.  **統一搜尋引擎 (Unified Search)**:
    *   在新增遊戲時，輸入關鍵字可同時搜尋 **Steam**, **IGDB**, **Google Images**。
    *   **並行處理**: 使用 `Promise.all` 同時發起請求，包含中文轉英文的 Wiki 查詢流程。
    *   支援透過 Proxy 下載圖片並繪製到 Canvas 進行壓縮。
2.  **AI 類別分類**:
    *   點擊 "Auto" 按鈕，Gemini AI 會分析遊戲標題，自動填入最適合的遊戲類型。
3.  **圖片優化**:
    *   上傳或貼上的圖片會透過 HTML Canvas 自動縮放 (Max 400px) 並壓縮 (Quality 0.8) 為 JPEG，減少儲存空間佔用。
4.  **剪貼簿支援**:
    *   支援直接 Ctrl+V 貼上圖片作為遊戲封面。

### 雲端備份與還原 (Cloud Sync)
1.  **備份 (Backup)**:
    *   將本地 JSON 資料上傳至 Firebase Storage。
    *   **圖片優化流程**: 備份時，程式會檢查是否為 Base64 圖片。若是，則先上傳至 Firebase Storage (`/images`) 取得 URL，再替換 JSON 中的內容，最後才上傳 JSON 檔。這大幅減少了 JSON 體積與 LocalStorage 壓力。
2.  **還原 (Restore)**:
    *   從 Firebase 下載 JSON 檔並覆蓋本地資料。
    *   包含自動資料遷移邏輯 (Migration)，例如將舊版 `PS5` 標籤自動轉為 `PS`。

### 資料遷移 (Data Migration)
*   **版本相容性**: 系統包含 `migrateGameData` 函式。
*   **邏輯**: 應用程式啟動或還原備份時，會自動檢測舊資料格式 (如 `PS5`, `STEAM`) 並轉換為新格式 (`PS`, `PC`)，確保舊存檔不會損壞。