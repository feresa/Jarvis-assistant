import { messagingApi } from '@line/bot-sdk';
import { config } from '../config.js';

const { MessagingApiClient } = messagingApi;

export class LineService {
  private client: messagingApi.MessagingApiClient;

  constructor() {
    this.client = new MessagingApiClient({
      channelAccessToken: config.line.channelAccessToken,
    });
  }

  /**
   * Reply to a message using replyToken
   */
  async replyText(replyToken: string, text: string) {
    return this.client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  /**
   * Reply with Flex Message
   */
  async replyFlex(replyToken: string, altText: string, flexContainer: any) {
    return this.client.replyMessage({
      replyToken,
      messages: [
        {
          type: 'flex',
          altText,
          contents: flexContainer,
        },
      ],
    });
  }

  /**
   * Push message to specific user
   */
  async pushText(toUserId: string, text: string) {
    return this.client.pushMessage({
      to: toUserId,
      messages: [{ type: 'text', text }],
    });
  }

  /**
   * Build a beautiful Weekly Digest Flex Message Card
   */
  buildWeeklyDigestCard(events: any[]): any {
    const eventBubbles = events.map((event) => {
      const startTime = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
        : '全天';
      const startDate = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })
        : event.start?.date || '';

      const boxContents: any[] = [
        {
          type: 'text',
          text: `${startDate} ${startTime}`,
          size: 'xs',
          color: '#00B4D8',
          weight: 'bold',
        },
        {
          type: 'text',
          text: event.summary || '未命名行程',
          size: 'sm',
          weight: 'bold',
          color: '#1E293B',
        },
      ];

      if (event.location) {
        boxContents.push({
          type: 'text',
          text: `📍 ${event.location}`,
          size: 'xs',
          color: '#64748B',
        });
      }

      return {
        type: 'box',
        layout: 'vertical',
        margin: 'md',
        contents: boxContents,
      };
    });

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: 'JARVIS 行程週報',
            weight: 'bold',
            color: '#38BDF8',
            size: 'sm',
          },
          {
            type: 'text',
            text: '📅 本週行程總覽與規劃',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'xl',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: `本週共有 ${events.length} 個預定行程：`,
            size: 'xs',
            color: '#64748B',
            margin: 'none',
          },
          {
            type: 'separator',
            margin: 'md',
          },
          ...eventBubbles,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🤖 Jarvis AI 行程特助為您服務',
            size: 'xs',
            color: '#94A3B8',
            align: 'center',
          },
        ],
      },
    };
  }
}

export const lineService = new LineService();
