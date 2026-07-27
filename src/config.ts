import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    keyFilePath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json',
  },
};
