import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { calendarService } from './calendar.js';

export class GeminiService {
  private getGenAI(): GoogleGenerativeAI {
    const apiKey = process.env.GEMINI_API_KEY || config.gemini.apiKey;
    if (!apiKey) {
      console.error('[GeminiService] GEMINI_API_KEY is missing!');
    }
    return new GoogleGenerativeAI(apiKey);
  }

  /**
   * Helper to generate content with automatic model fallback
   */
  private async generateWithFallback(genAI: GoogleGenerativeAI, prompt: string, systemInstruction: string): Promise<string> {
    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-3-flash-preview',
    ];

    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`[GeminiService] Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text) {
          console.log(`[GeminiService] Successfully generated response using model: ${modelName}`);
          return text;
        }
      } catch (err: any) {
        console.warn(`[GeminiService] Model ${modelName} failed:`, err?.message || err);
        lastError = err;
      }
    }

    throw lastError || new Error('All candidate Gemini models failed.');
  }

  /**
   * Process user natural language prompt and execute requested action
   */
  async processUserMessage(userPrompt: string): Promise<string> {
    const now = new Date();
    const systemInstruction = `
你是 Jarvis，使用者的專屬 AI 行程總管與個人特助。
現在時間是：${now.toISOString()} (${now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})。
你的目標是幫使用者查詢、管理 Google Calendar 及 iCloud 行程，並給予清楚、有條理且親切溫馨的回覆。

【行程報告格式範本要求】：
當使用者詢問「這週行程」或要求行程整理時，請比照以下格式輸出：

這週行程報告蛙蛙大大 💕

週一 MM/DD：[早上...，下午...，晚上...]
週二 MM/DD：...
週三 MM/DD：...
週四 MM/DD：...
週五 MM/DD：...
週六 MM/DD：...
週日 MM/DD：...

如某天完全沒有行程，可寫「無排定行程，好好休息 ✨」。

請用繁體中文回覆，語氣親切專業。
    `;

    try {
      const genAI = this.getGenAI();

      const decisionPrompt = `
使用者對話："${userPrompt}"

請分析使用者的對話意圖，如果需要查詢或新增日曆，請輸出相應指令：
- 若為查詢日曆，請計算開始時間 (start) 與結束時間 (end) 的 ISO 字串，並在第一行輸出 JSON：{"action": "query", "start": "...", "end": "..."}
- 若為新增日曆，請輸出 JSON：{"action": "create", "summary": "...", "start": "...", "end": "...", "location": "..."}
- 若為一般聊天，請輸出 JSON：{"action": "chat"}
      `;

      const responseText = await this.generateWithFallback(genAI, decisionPrompt, systemInstruction);
      console.log('[GeminiService] AI Decision Raw:', responseText);

      // Extract JSON if present
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const decision = JSON.parse(jsonMatch[0]);

          if (decision.action === 'query') {
            const timeMin = decision.start ? new Date(decision.start) : now;
            const timeMax = decision.end ? new Date(decision.end) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            const events = await calendarService.listEvents(timeMin, timeMax);

            if (events.length === 0) {
              return `這週行程報告蛙蛙大大 💕\n\n目前查詢時間區間內沒有排定任何行程，可以好好休息放鬆喔 ✨`;
            }

            const formatPrompt = `
使用者詢問："${userPrompt}"
查詢到的行程列表資料如下：
${JSON.stringify(events, null, 2)}

請依據系統指令的【行程報告格式範本要求】，將以上行程整理為最漂亮、清晰的週行程報告：
標題必須包含：這週行程報告蛙蛙大大 💕
每日按照 週一 ~ 週日 順序排列，並標註月/日（例如 週一 7/27）。
將上午/下午/晚上的行程順暢組合在同一行。
            `;

            return await this.generateWithFallback(genAI, formatPrompt, systemInstruction);
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
        } catch (e: any) {
          console.error('[GeminiService] Inner action execution failed:', e?.message || e);
          return `⚠️ 在存取您的日曆時發生錯誤，請稍後再試。 (${e?.message || 'Unknown Error'})`;
        }
      }

      return await this.generateWithFallback(genAI, userPrompt, systemInstruction);
    } catch (error: any) {
      console.error('[GeminiService] Error processing message:', error?.stack || error?.message || error);
      return `抱歉，Jarvis 目前處理您的要求時遇到了點問題：${error?.message || '請稍後再試一次！'}`;
    }
  }
}

export const geminiService = new GeminiService();
