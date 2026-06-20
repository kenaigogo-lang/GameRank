# Vercel 部署指南

## 前置要求
- GitHub 帳號（已有倉庫連接）
- Firebase 項目配置
- Google Custom Search API 金鑰
- IGDB API 金鑰（來自 Twitch 開發者控制台）

## 環境變數設置 (Vercel Dashboard)

在 Vercel 中，你需要設置以下環境變數：

### Firebase Configuration
```
VITE_FIREBASE_API_KEY=AIzaSyCfUxiC51h8PDPeejE7SN4lncp__0_iWLQ
VITE_FIREBASE_AUTH_DOMAIN=gamerankdb.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gamerankdb
VITE_FIREBASE_STORAGE_BUCKET=gamerankdb.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=593772759968
VITE_FIREBASE_APP_ID=1:593772759968:web:d793f413019450c18fb2c5
VITE_FIREBASE_MEASUREMENT_ID=G-80XWCKYSLP
```

### IGDB API (Twitch)
```
VITE_IGDB_CLIENT_ID=mbg8bt1y5si0axlkowfc1xs5crf1zw
VITE_IGDB_CLIENT_SECRET=e7zvesgcxgiy94ovthixzqrgloe4mi
```

### Google Custom Search
```
VITE_GOOGLE_API_KEY=AIzaSyB3ewWWi1ssbLEg5qxf07yt4IBhMIuBudE
VITE_GOOGLE_CX=e6d2925d2004145f2
```

## 部署步驟

### 1. 連接 GitHub 倉庫
1. 登入 [Vercel](https://vercel.com)
2. 點擊「Add New」> 「Project」
3. 選擇 GitHub 帳號並授權
4. 選擇 `GameRank` 倉庫

### 2. 配置項目
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 3. 添加環境變數
在「Environment Variables」部分：
1. 點擊「Add New」
2. 輸入上述所有環境變數
3. 對每個環境變數選擇要應用的環境（Production, Preview, Development）

### 4. 部署
1. 點擊「Deploy」
2. 等待部署完成

## 完成後
- 你的應用將在 `https://gamerank.vercel.app` (或自訂域名) 上運行
- 每次 push 到 GitHub main 分支時，Vercel 將自動部署

## 常見問題

### Firebase CORS 問題
如果遇到 Firebase 跨域問題，確保在 Firebase Console 中：
1. 進入 Authentication → Settings
2. 將 Vercel 部署 URL 添加到授權域名清單

### API 金鑰安全
- 不要在代碼中硬編碼 API 金鑰
- 使用環境變數（已完成）
- `.env.local` 已在 `.gitignore` 中，不會被上傳
- 在 Vercel 中只設置生產環境的真實金鑰

### 本地開發
使用 `.env.local` 文件進行本地開發：
```bash
npm run dev
```

## 更新部署
只需 push 到 GitHub，Vercel 將自動偵測並部署：
```bash
git add .
git commit -m "Your message"
git push origin main
```
