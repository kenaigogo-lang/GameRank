# Vercel 部署指南

GameRank 連著 GitHub，push 到 `main` 就會自動部署正式站；其他分支與 PR 會產生預覽網址（PR 頁面上 vercel[bot] 留言裡的 **Preview** 連結）。

## 環境變數（Vercel → 專案 → Settings → Environment Variables）

### 前端用（會打包進網頁）

Firebase 的網頁設定本來就是公開的，安全性靠 Firebase 權限規則，不靠隱藏這些值。

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

### 伺服器端用（只有 `api/` 函式讀得到）

**不要加 `VITE_` 前綴。** 有 `VITE_` 前綴的變數一旦被前端程式引用，就會被打包進網頁、任何人都看得到。

```
FIREBASE_PROJECT_ID=      # 用來驗證登入憑證，填和 VITE_FIREBASE_PROJECT_ID 一樣的值
IGDB_CLIENT_ID=           # Twitch Developer Console
IGDB_CLIENT_SECRET=
GOOGLE_API_KEY=           # Google Custom Search（封面搜尋）
GOOGLE_CX=
GEMINI_API_KEY=           # Google AI Studio（AI 自動判斷類型）
GEMINI_MODEL=             # 選填，預設 gemini-2.5-flash
```

為了不中斷服務，`api/` 目前也讀得到舊名稱（`VITE_IGDB_CLIENT_SECRET`、`VITE_API_KEY` 等）。改好新名稱後，請把舊的 `VITE_` 版本刪掉。

### 金鑰外洩處理

這份文件的舊版曾把真實的 IGDB Client Secret 與 Google API Key 提交到 GitHub，舊版的網頁打包也含有這些金鑰。即使現在已移除，它們仍留在 Git 歷史裡，請到各服務後台**重新產生**：

- IGDB：Twitch Developer Console → 你的應用 → New Secret
- Google API Key：Google Cloud Console → APIs & Services → Credentials → 重新產生或刪除舊金鑰，並限制只能用 Custom Search API
- Gemini：Google AI Studio → API keys

產生新的之後，更新上面的 Vercel 環境變數，再重新部署一次。

## Firebase 設定

1. **授權網域**：Authentication → Settings → Authorized domains，加入正式網域與要測試的預覽網域，否則 Google 登入會被拒絕。
2. **Firestore 規則**：Firestore Database → Rules，參考專案根目錄的 `firestore.rules`。貼上前請先和現有規則比對。
3. **Storage 規則**：Storage → Rules，貼上 `storage.rules` 的內容。沒設定的話，新封面會自動退回存在資料庫裡（舊做法），網站仍可使用，只是開站比較慢。

## 部署設定

- Framework：Vite
- Build Command：`npm run build`
- Output Directory：`dist`
- `api/` 資料夾裡的檔案會自動部署成伺服器端函式，不需要額外設定
