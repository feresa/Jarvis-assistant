import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { calendarService } from './calendar.js';

export class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  /**
   * Process user natural language prompt and execute requested action
   */
  async processUserMessage(userPrompt: string): Promise<string> {
    const now = new Date();
    const systemInstruction = `
你是 Jarvis，使用者的專屬 AI 行程總管與個人特助。
現在時間是：${now.toISOString()} (${now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})。
你的目標是幫使用者查詢、管理 Google Calendar 行程，並給予清楚、有條理且親切的回覆。

當使用者詢問行程時，你需要判斷意圖：
1. 【查詢行程】：如果使用者詢問「今天/明天/這週/指定日期」的行程，請分析需求並指明日期區間。
2. 【新增行程】：如果使用者想新增會議/行程，請提出時間、標題與地點。
3. 【一般對話/提醒】：若是一般交談或設定提醒，請給予溫暖專業的回覆。

請用繁體中文回覆，格式清晰，善用表情符號（如 📅, ⏰, 📍, ✨）。
    `;

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction,
      });

      const prompt = `
使用者對話："${userPrompt}"

請分析使用者的對話意圖，如果需要查詢或新增日曆，請輸出相應指令：
- 若為查詢日曆，請計算開始時間 (start) 與結束時間 (end) 的 ISO 字串，並在第一行輸出 JSON：{"action": "query", "start": "...", "end": "..."}
- 若為新增日曆，請輸出 JSON：{"action": "create", "summary": "...", "start": "...", "end": "...", "location": "..."}
- 若為一般聊天，請輸出 JSON：{"action": "chat"}
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      console.log('[GeminiService] AI Decision Raw:', responseText);

      // Extract JSON if present
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const decision = JSON.parse(jsonMatch[0]);

          if (decision.action === 'query') {
            const timeMin = new Date(decision.start || now);
            const timeMax = new Date(decision.end || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
            const events = await calendarService.listEvents(timeMin, timeMax);

            if (events.length === 0) {
              return `📅 查詢時間區間 (${timeMin.toLocaleDateString('zh-TW')} - ${timeMax.toLocaleDateString('zh-TW')}) 內目前沒有預定的行程！相當輕鬆喔 ✨`;
            }

            const eventsListText = events
              .map((e: any) => {
                const startStr = e.start?.dateTime
                  ? new Date(e.start.dateTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : e.start?.date || '';
                return `• ${startStr} - ${e.summary}${e.location ? ` (📍 ${e.location})` : ''}`;
              })
              .join('\n');

            return `📅 為您查詢到以下行程：\n\n${eventsListText}\n\n如有任何變更隨時告訴我！`;
          }

          if (decision.action === 'create') {
            const newEvent = await calendarService.createEvent({
              summary: decision.summary || '新行程',
              startDateTime: decision.start || now.toISOString(),
              endDateTime: decision.end || new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
              location: decision.location,
            });

            return `✨ 已成功為您在 Google Calendar 新增行程！\n\n📌 **標題**：${newEvent.summary}\n⏰ **時間**：${new Date(newEvent.start.dateTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}${newEvent.location ? `\n📍 **地點**：${newEvent.location}` : ''}`;
          }
        } catch (e) {
          console.error('[GeminiService] JSON parse or execution failed:', e);
        }
      }

      // Fallback to normal response
      const chatResult = await model.generateContent(userPrompt);
      return chatResult.response.text() || 'Jarvis 隨時為您服務！';
    } catch (error) {
      console.error('[GeminiService] Error processing message:', error);
      return '抱歉，Jarvis 目前處理您的要求時遇到了點問題，請稍後再試一次！';
    }
  }
}

export const geminiService = new GeminiService();
