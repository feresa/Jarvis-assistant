import express from 'express';
import { middleware } from '@line/bot-sdk';
import { config } from './config.js';
import { geminiService } from './services/gemini.js';
import { lineService } from './services/line.js';
import { calendarService } from './services/calendar.js';
const app = express();
// Health check endpoint
app.get('/', (req, res) => {
    res.send('🤖 Jarvis AI Executive Assistant is running on Vercel Serverless!');
});
// Vercel Cron Endpoint: Weekly Digest (Mondays 08:30 AM Asia/Taipei = 00:30 UTC)
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
    }
    catch (error) {
        console.error('[Vercel Cron Weekly Error]:', error);
        res.status(500).json({ error: error.message });
    }
});
// Vercel Cron Endpoint: Daily Briefing (Daily 08:30 AM Asia/Taipei = 00:30 UTC)
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
                events.map((e) => `• ${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '全天'} - ${e.summary}`).join('\n') +
                '\n\n祝您今天工作順利！✨';
            await lineService.pushText(targetUserId, text);
        }
        res.json({ success: true, count: events.length });
    }
    catch (error) {
        console.error('[Vercel Cron Daily Error]:', error);
        res.status(500).json({ error: error.message });
    }
});
const lineMiddlewareConfig = {
    channelSecret: config.line.channelSecret,
};
// LINE Webhook Endpoint
app.post('/webhook', middleware(lineMiddlewareConfig), async (req, res) => {
    const events = req.body.events;
    try {
        const results = await Promise.all(events.map(async (event) => {
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
        }));
        res.json(results);
    }
    catch (err) {
        console.error('[LINE Webhook Error]:', err);
        res.status(500).end();
    }
});
// Start Express Server locally if not on Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(config.port, () => {
        console.log(`\n==================================================`);
        console.log(`🤖 Jarvis AI Assistant Server running locally!`);
        console.log(`🌐 URL: http://localhost:${config.port}`);
        console.log(`==================================================\n`);
    });
}
export default app;
