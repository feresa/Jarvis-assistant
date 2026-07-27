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
你是 Jarvis，使用者的專屬 AI 個人特助，這份報告是要貼心回覆或報告給使用者的女朋友（蛙蛙大大）聽的。
現在時間是：${now.toISOString()} (${now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})。

【風格要求】：
請使用超級可愛、貼心、甜美且溫馨的語氣（多用 💕, ✨, 🌸, 🧸, 🐱, 💖 等可愛表情符號）。

【二種查詢模式的格式規範】：

1. 【一週/多日行程報告】（例如詢問「這週行程」、「本週行程」）：
   - 標題必須是：這週行程報告蛙蛙大大 💕
   - **完全不要寫出具體點鐘時間**（例如不要寫 14:30、18:00）！
   - 依據當天時間，歸納簡化為「上午」、「下午」、「晚上」。
   - 範例格式：
     週一 7/27：下午工作，晚上團練 ✨
     週二 7/28：下午工作坊，晚上開會 🌸
     週三 7/29：上午登山，晚上休息 🌕
   - 若某天完全沒有行程，寫「無排定行程，可以好好約會/休息放鬆喔 🧸」。

2. 【單日行程報告】（例如詢問「今天」、「明天」、「後天」或特定某一天）：
   - **必須標示出具體時間點**（例如：15:00 - 16:00 健身房 🏋️‍♂️）。
   - 給予詳細且貼心的提醒。
    `;

    try {
      const genAI = this.getGenAI();

      const decisionPrompt = `
使用者對話："${userPrompt}"

請分析使用者的對話意圖，如果需要查詢或新增日曆，請輸出相應指令：
- 若為查詢日曆，請計算開始時間 (start) 與結束時間 (end) 的 ISO 字串，並判斷是否為單日查詢 (isSingleDay: true/false)，輸出 JSON：{"action": "query", "start": "...", "end": "...", "isSingleDay": true/false}
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
              return `這週行程報告蛙蛙大大 💕\n\n目前沒有排定任何行程，可以好好放鬆約會喔 🧸✨`;
            }

            const formatPrompt = `
使用者詢問："${userPrompt}"
是否為單日查詢：${decision.isSingleDay ? '是 (要寫出具體時間點)' : '否 (這是週報告，絕對不要寫數字點鐘時間，只寫上午/下午/晚上)'}

查詢到的行程列表資料如下：
${JSON.stringify(events, null, 2)}

請嚴格依據系統指令規範整理：
1. 若非單日查詢（週報告）：
   - 標題：這週行程報告蛙蛙大大 💕
   - 依 週一 ~ 週日 順序。
   - **嚴禁顯示具體數字點鐘時間**，只能歸納成「上午...」、「下午...」、「晚上...」。
   - 語氣無敵可愛甜美！

2. 若為單日查詢（今天/明天/後天）：
   - 清楚列出具體開始與結束時間、標題與地點，語氣貼心可愛！
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

            return `✨ 已成功為蛙蛙大大新增行程囉！💕\n\n📌 **標題**：${newEvent.summary}\n⏰ **時間**：${new Date(newEvent.start.dateTime).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}${newEvent.location ? `\n📍 **地點**：${newEvent.location}` : ''}`;
          }
        } catch (e: any) {
          console.error('[GeminiService] Inner action execution failed:', e?.message || e);
          return `⚠️ 存取日曆時遇到一點問題，請稍後再試喔！ (${e?.message || 'Unknown Error'})`;
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
