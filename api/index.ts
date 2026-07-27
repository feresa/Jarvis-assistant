import express from 'express';
import { middleware, WebhookEvent } from '@line/bot-sdk';
import { config } from '../src/config.js';
import { geminiService } from '../src/services/gemini.js';
import { lineService } from '../src/services/line.js';
import { calendarService } from '../src/services/calendar.js';

const app = express();

// Health check endpoint (GET / or GET /api)
app.get('*', (req, res) => {
  res.status(200).send('🤖 Jarvis AI Executive Assistant is ready!');
});

const lineMiddlewareConfig = {
  channelSecret: config.line.channelSecret || process.env.LINE_CHANNEL_SECRET || '',
};

// Webhook Handler Core Function
const handleWebhook = async (req: express.Request, res: express.Response) => {
  const events: WebhookEvent[] = req.body?.events || [];
  console.log('[Webhook Handler] Request received. Event count:', events.length);

  // LINE Verify test sends empty events
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

        console.log(`[LINE Event] User (${userId}) sent: "${userText}"`);

        // Check for quick triggers
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
  } catch (err: any) {
    console.error('[LINE Webhook Error]:', err?.stack || err);
    res.status(500).send(err?.message || 'Internal Server Error');
  }
};

// Apply LINE Signature Verification middleware for ALL POST requests
app.post('*', (req, res, next) => {
  // If LINE signature header is present, run middleware
  if (req.headers['x-line-signature']) {
    return middleware(lineMiddlewareConfig)(req, res, next);
  }
  // Otherwise pass through for testing
  next();
}, handleWebhook);

export default app;
