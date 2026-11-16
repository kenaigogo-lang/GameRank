# GameRank

個人的遊戲評分清單：記錄每款玩過的遊戲的分數、平台、類型、時數與評語，並依平台、類型篩選與排序。

- 兩套介面可一鍵切換：**紅白機**（NES.css 像素風，預設）與**街機**（CRT 霓虹排行榜）
- 資料存在 Firebase（Firestore），封面圖存在 Firebase Storage
- 網站部署在 Vercel；封面搜尋與 AI 類型判斷走 Vercel 伺服器端函式，金鑰不會出現在網頁裡

## 專案結構

| 路徑 | 內容 |
|---|---|
| `src/App.tsx` | 資料讀寫、篩選排序、儲存流程 |
| `src/views/` | 兩套主題各自的頁面排版（`NesView`、`ArcadeView`） |
| `src/themes/` | 兩套主題的樣式，以 `<html data-theme>` 切換 |
| `src/components/` | 新增／編輯表單、確認視窗、遊戲卡片與排行榜列 |
| `src/services/firebase.ts` | 登入、Firestore 讀寫（每次只寫變動的那一筆） |
| `src/services/covers.ts` | 封面上傳到 Storage；Storage 不能用時退回存在資料庫 |
| `src/services/api.ts` | 呼叫伺服器端函式 |
| `api/` | Vercel 函式：`cover-search`（Steam／IGDB／Google 封面搜尋）、`genre`（Gemini 類型判斷）、`image`（圖片轉送） |
| `firestore.rules`、`storage.rules` | 建議的 Firebase 權限規則 |

## 本機開發

```bash
npm install
```

```bash
cp .env.example .env.local
```

填好 `.env.local` 後：

```bash
npm run dev
```

`npm run dev` 只跑前端，封面搜尋與 AI 判斷會顯示「找不到伺服器端功能」。要連同 `api/` 一起跑，請用 Vercel CLI：

```bash
npx vercel dev
```

其他指令：`npm run build`（型別檢查＋建置）、`npm run typecheck`（前端與 `api/` 都檢查）。

部署與環境變數設定見 [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)，架構與資料格式見 [SPECIFICATION.md](SPECIFICATION.md)。
