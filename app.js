const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
// 允許跨域請求 (讓你的前端可以打這個 API)
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- 設定 Google Sheets 資訊 ---
// 請確保你的 Google Sheet ID 正確，且 Service Account email 已經被加入為編輯者
const SHEET_ID = process.env.GOOGLE_SHEET_ID || "請填入你的SheetID";

// 設定寫入範圍，對應我們規劃的 4 個欄位 (id, created_at, nickname, story)
const RESPONSE_SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || "'responses'!A:D";

// 定義欄位順序，程式會依照這個順序寫入資料
const RESPONSE_COLUMNS = ["id", "created_at", "nickname", "story"];

/**
 * Google Sheets 驗證與連線設定 (沿用參考範例的邏輯)
 */
const buildCredentialsFromEnv = () => {
  const requiredKeys = [
    "GOOGLE_SA_TYPE",
    "GOOGLE_SA_PROJECT_ID",
    "GOOGLE_SA_PRIVATE_KEY_ID",
    "GOOGLE_SA_PRIVATE_KEY",
    "GOOGLE_SA_CLIENT_EMAIL",
    "GOOGLE_SA_CLIENT_ID",
  ];

  const hasAll = requiredKeys.every((key) => !!process.env[key]);
  if (!hasAll) return null;

  return {
    type: process.env.GOOGLE_SA_TYPE,
    project_id: process.env.GOOGLE_SA_PROJECT_ID,
    private_key_id: process.env.GOOGLE_SA_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_SA_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_SA_CLIENT_ID,
  };
};

const getSheetsClient = (() => {
  let cached;
  return () => {
    if (cached) return cached;

    const credentials = buildCredentialsFromEnv();
    const auth = new google.auth.GoogleAuth({
      ...(credentials
        ? { credentials }
        : {
            // 如果沒有環境變數，嘗試讀取本地 JSON 檔 (開發測試用)
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                     path.join(__dirname, "service-account.json"),
          }),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    cached = google.sheets({ version: "v4", auth });
    return cached;
  };
})();

/**
 * 核心功能：將資料附加到 Google Sheet 的最後一列
 */
const appendRow = async (range, columns, payload) => {
  const sheets = getSheetsClient();
  
  // 依照 columns 的順序將 payload 轉為陣列
  const row = columns.map((key) => {
    const value = payload[key];
    return value === undefined || value === null ? "" : value;
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });
};

// --- API 路由區 ---

app.get("/", (req, res) => {
  res.json({ message: "8號茶水間 API 運作中" });
});

/**
 * POST /api/responses
 * 功能：接收前端送來的暱稱與故事，寫入 Google Sheet
 */
app.post("/api/responses", async (req, res) => {
  try {
    const { nickname, story } = req.body;

    // 1. 基本驗證
    if (!nickname || !story) {
      return res.status(400).json({ message: "請填寫暱稱與故事內容" });
    }

    // 2. 準備要寫入的資料物件
    // 這裡我們在後端生成 id 和時間，確保資料一致性
    const newResponse = {
      id: Date.now().toString(), // 簡單使用 Timestamp 當 ID
      created_at: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }), // 台灣時間格式
      nickname: nickname,
      story: story,
    };

    // 3. 寫入 Google Sheet
    await appendRow(RESPONSE_SHEET_RANGE, RESPONSE_COLUMNS, newResponse);

    // 4. 回傳成功訊息
    console.log("成功寫入一筆資料:", newResponse.nickname);
    res.status(201).json({
      message: "故事已成功送出",
      data: newResponse,
    });

  } catch (error) {
    console.error("寫入 Google Sheet 失敗:", error);
    res.status(500).json({ 
      message: "伺服器錯誤，無法儲存回應", 
      error: error.message 
    });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});