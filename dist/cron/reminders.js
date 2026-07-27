import cron from 'node-cron';
import { calendarService } from '../services/calendar.js';
import { lineService } from '../services/line.js';
export function setupCronJobs(targetUserId) {
    // 週一早上 08:30 自動發送每週排程總覽
    cron.schedule('30 8 * * 1', async () => {
        console.log('[Cron] Running Monday Weekly Digest Job...');
        if (!targetUserId)
            return;
        try {
            const now = new Date();
            const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const events = await calendarService.listEvents(now, nextWeek);
            const flexCard = lineService.buildWeeklyDigestCard(events);
            await lineService.replyFlex(targetUserId, '本週行程總覽與規劃卡片', flexCard);
        }
        catch (error) {
            console.error('[Cron] Error running weekly digest:', error);
        }
    });
    // 每天早上 08:30 自動發送今日行程提醒
    cron.schedule('30 8 * * *', async () => {
        console.log('[Cron] Running Daily Morning Briefing Job...');
        if (!targetUserId)
            return;
        try {
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
        }
        catch (error) {
            console.error('[Cron] Error running daily briefing:', error);
        }
    });
    console.log('[Cron] Scheduled jobs initialized successfully.');
}
