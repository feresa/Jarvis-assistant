import express from 'express';
import { middleware, WebhookEvent } from '@line/bot-sdk';
import { config } from '../src/config.js';
import { geminiService } from '../src/services/gemini.js';
import { lineService } from '../src/services/line.js';
import { calendarService } from '../src/services/calendar.js';

const app = express();

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('🤖 Jarvis AI Executive Assistant is running on Vercel!');
});

app.get('/api', (req, res) => {
  res.status(200).send('🤖 Jarvis API is ready!');
});

// Vercel Cron Endpoint: Weekly Digest
app.get('/api/cron/weekly', async (req, res) => {
  try {
    const targetUserId = process.env.MY_LINE_USER_ID;
    if (!targetUserId) {
      return res.status(400).json({ error: 'MY_LINE_USER_ID not configured in Vercel' });
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await calendarService.listEvents(now, nextWeek);

    const flexCard = lineService.buildWeeklyDigestCard(events);
    await lineService.pushText(targetUserId, '📅 這是 Jarvis 為您整理的本週行程總覽卡片');
    await lineService.replyFlex('', '本週行程總覽卡片', flexCard);

    res.json({ success: true, count: events.length });
  } catch (error: any) {
    console.error('[Vercel Cron Weekly Error]:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vercel Cron Endpoint: Daily Briefing
app.get('/api/cron/daily', async (req, res) => {
  try {
    const targetUserId = process.env.MY_LINE_USER_ID;
    if (!targetUserId) {
      return res.status(400).json({ error: 'MY_LINE_USER_ID not configured in Vercel' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const events = await calendarService.listEvents(startOfDay, endOfDay);
    if (events.length > 0) {
      const text = `🌅 早安！Jarvis 為您報告今日 (${startOfDay.toLocaleDateString('zh-TW')}) 行程：\n\n` +
        events.map((e: any) => `• ${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '全天'} - ${e.summary}`).join('\n') +
        '\n\n祝您今天工作順利！✨';
      await lineService.pushText(targetUserId, text);
    }
    res.json({ success: true, count: events.length });
  } catch (error: any) {
    console.error('[Vercel Cron Daily Error]:', error);
    res.status(500).json({ error: error.message });
  }
});

const lineMiddlewareConfig = {
  channelSecret: config.line.channelSecret || process.env.LINE_CHANNEL_SECRET || '',
};

// Webhook Handler Function
const handleWebhook = async (req: express.Request, res: express.Response) => {
  const events: WebhookEvent[] = req.body?.events || [];

  // LINE Verify button sends an empty events array. Respond 200 OK immediately!
  if (events.length === 0) {
    return res.status(200).send('OK');
  }

  try {
    const results = await Promise.all(
      events.map(async (event) => {
        if (event.type !== 'message' || event.message.type !== 'text') {
          return null;
        }

        const userText = event.message.text;
        const replyToken = event.replyToken;
        const userId = event.source.userId;

        console.log(`[LINE Event] Received text from ${userId}: "${userText}"`);

        // Check for specific quick triggers
        if (userText.includes('週報') || userText.includes('每週排程')) {
          const now = new Date();
          const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const calendarEvents = await calendarService.listEvents(now, nextWeek);
          const flexCard = lineService.buildWeeklyDigestCard(calendarEvents);
          return lineService.replyFlex(replyToken, 'Jarvis 每週行程總覽卡片', flexCard);
        }

        // Process with Gemini AI Service
        const aiReply = await geminiService.processUserMessage(userText);
        return lineService.replyText(replyToken, aiReply);
      })
    );

    res.status(200).json(results);
  } catch (err) {
    console.error('[LINE Webhook Error]:', err);
    res.status(500).end();
  }
};

// Support both /webhook and /api/webhook paths
app.post('/webhook', middleware(lineMiddlewareConfig), handleWebhook);
app.post('/api/webhook', middleware(lineMiddlewareConfig), handleWebhook);

export default app;
