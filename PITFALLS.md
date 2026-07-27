# 🛠️ Jarvis AI 特助開發踩坑與解決方案全紀錄 (Technical Knowledge Base)

本文件紀錄開發 **LINE Bot + Google Calendar + Apple iCloud + Gemini AI** 個人智能總管過程中所遇到的所有踩坑紀錄、原因分析與終極解決方案。

---

## 📌 1. Vercel Serverless Function 構建失敗 (`public` 目錄錯誤)

### 💥 問題現象
部署 Vercel 時報錯：
`Error: No Output Directory named "public" found after the Build completed.`

### 🔍 原因分析
`package.json` 中含有 `"build": "tsc"` 指令，Vercel 預設會認為這是一個前端專案並尋找 `public` 或 `dist` 靜態目錄輸出。但此專案為純 Node.js Serverless API。

### ✅ 解決方案
1. 移除 `package.json` 中的 `"build": "tsc"`。
2. 刪除本地 `dist/` 目錄並列入 `.gitignore`。
3. 讓 Vercel 自動偵測 `api/` 目錄下的原生 TypeScript 檔案（如 `api/webhook.ts`）自動編譯執行。

---

## 📌 2. LINE Webhook 驗證失敗 (HTTP 307 / 404)

### 💥 問題現象
LINE Developers 點擊 Verify 測試跳出 Error，無法順利連線。

### 🔍 原因分析
1. Vercel 預設啟用了 SSO / Authentication Protection，導致 LINE Webhook POST 請求被重導向 (307 Temporary Redirect)。
2. LINE 的 Verify 功能會發送 `events: []` (空陣列) 進行測試，若 API 回傳非 200 OK，LINE 會判定驗證失敗。

### ✅ 解決方案
1. 關閉 Vercel 的 Authentication Protection。
2. 在 Express 路由中處理 LINE 驗證空請求：
   ```ts
   if (events.length === 0) {
     return res.status(200).send('OK');
   }
   ```

---

## 📌 3. Google Gemini API 舊版模型停用 (`gemini-1.5-flash` 404 錯誤)

### 💥 問題現象
LINE 收到錯誤訊息：
`[GoogleGenerativeAI Error]: [404 Not Found] models/gemini-1.5-flash is not found for API version v1beta`

### 🔍 原因分析
Google AI Studio 在 2026 年對新發放的 API Key 逐步下架/停用了舊版 `gemini-1.5-flash` 模型，要求升級至最新模型。

### ✅ 解決方案
1. 撰寫診斷腳本打 API `https://generativelanguage.googleapis.com/v1beta/models` 查詢帳號啟用模型。
2. 全面將後端模型升級為 **`gemini-3.6-flash`**（並搭配 `gemini-2.0-flash` 作為自動 Fallback 備援）。

---

## 📌 4. Vercel 環境變數私鑰換行轉義 (`invalid_grant: Invalid JWT Signature`)

### 💥 問題現象
存取 Google Calendar 時跳出：
`invalid_grant: Invalid JWT Signature.`

### 🔍 原因分析
1. Google Service Account 的私鑰 `private_key` 包含 RSA 換行字元 `\n`。在文字貼上 Vercel 環境變數時，被轉義為雙反斜線 `\\n`，導致 Google Auth 簽名驗證失敗。
2. 舊的服務帳號金鑰可能在 Google Cloud Console 中被重新產生或作廢。

### ✅ 解決方案
1. 在 Google Cloud Console 重新產生全新 JSON 憑證。
2. 使用 **Base64 編碼** 處理憑證，再推送至 Vercel：
   ```bash
   node -e "console.log(Buffer.from(fs.readFileSync('credentials.json')).toString('base64'))" | npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production --force
   ```
3. 在 `CalendarService` 中自動辨識並解碼 Base64：
   ```ts
   const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
   credentials = JSON.parse(decoded);
   ```

---

## 📌 5. Apple iCloud 訂閱日曆 (`webcal://`) 權限鎖定無法讀取

### 💥 問題現象
Google Calendar 上可以看到 iCloud 訂閱行程（如「健身工廠」、「工作」），但 Jarvis 只抓得到主日曆的行程。

### 🔍 原因分析
從 Mac / Apple 透過 `webcal://` 網址訂閱的外部日曆，Google 日曆將存取權限強制設為 `所有人都可以: 什麼都看不到`，Google Calendar API 嚴格禁止第三方 Service Account 機器人存取外部訂閱日曆。

### ✅ 解決方案
1. 安裝 `node-ical` 套件。
2. 在 `CalendarService` 中擴充 **直連外部 iCal 網址解析** 功能：
   * 支援將 `webcal://` 自動轉為 `https://`
   * 直接向 Apple iCloud 伺服器抓取 `.ics` 檔案並即時解析
3. 將 iCloud 訂閱網址設定至 Vercel `PUBLIC_ICAL_URLS` 環境變數中，完美跨越 Google 日曆的權限封鎖！

---

## 📌 6. 客製化語意分析與「蛙蛙大大 💕」週行程報告輸出

### 🎯 需求說明
使用者希望能以特定格式（如「這週行程報告蛙蛙大大 💕」）呈現週一至週日依時段組合的行程整理。

### ✅ 解決方案
1. 調整 Gemini 3.6 Flash 的 System Instruction 格式範本。
2. 先由 AI 判斷日期區間進行日曆查詢（Google Calendar + iCloud）。
3. 將抓取到的兩大來源行程 JSON 匯整後，再次交付 Gemini 依據範本格式重構輸出。

---

## 📊 系統最終架構圖

```mermaid
flowchart TD
    User([使用者 LINE 訊息]) -->|LINE Webhook| Vercel[Vercel Serverless Function]
    Vercel -->|1. 自然語言意圖分析| Gemini[Google Gemini 3.6 Flash]
    
    subgraph 行程資料源 (Data Sources)
        CalendarAPI[Google Calendar API v3]
        AppleiCloud[Apple iCloud Public iCal / webcal]
    end
    
    Gemini -->|2. 觸發查詢| CalendarService[CalendarService]
    CalendarService -->|主日曆 + 子日曆| CalendarAPI
    CalendarService -->|node-ical 直連解析| AppleiCloud
    
    CalendarService -->|3. 合併並排序行程| GeminiFormat[Gemini 格式美化]
    GeminiFormat -->|4. 週行程報告蛙蛙大大 💕| LineMessaging[LINE Messaging API]
    LineMessaging -->|5. 傳送 Flex/Text 訊息| User
```
