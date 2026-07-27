import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string; // ISO String
  endDateTime: string;   // ISO String
}

export class CalendarService {
  private calendar: any;

  constructor() {
    this.initAuth();
  }

  private initAuth() {
    let auth;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (rawKey && rawKey.trim().length > 0) {
      try {
        let credentials: any;
        const trimmed = rawKey.trim();

        if (trimmed.startsWith('{')) {
          credentials = JSON.parse(trimmed);
        } else {
          // Decode from base64 if encoded
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          credentials = JSON.parse(decoded);
        }

        // Sanitize private_key to fix Vercel escaped newlines (\\n -> \n)
        if (credentials.private_key && typeof credentials.private_key === 'string') {
          credentials.private_key = credentials.private_key
            .replace(/\\n/g, '\n')
            .replace(/\r\n/g, '\n');
        }

        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        console.log('[CalendarService] Successfully initialized Google Auth with credentials for:', credentials.client_email);
      } catch (e: any) {
        console.error('[CalendarService] Error parsing GOOGLE_SERVICE_ACCOUNT_KEY:', e?.message || e);
      }
    }

    if (!auth && fs.existsSync(config.google.keyFilePath)) {
      try {
        auth = new google.auth.GoogleAuth({
          keyFile: config.google.keyFilePath,
          scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        console.log('[CalendarService] Authenticated via keyFile.');
      } catch (e: any) {
        console.error('[CalendarService] Error loading keyFile:', e?.message || e);
      }
    }

    if (!auth) {
      console.warn('[CalendarService] Falling back to default Google Auth.');
      auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
    }

    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * List events between timeMin and timeMax
   */
  async listEvents(timeMin: Date, timeMax: Date) {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || config.google.calendarId || 'primary';
    try {
      console.log(`[CalendarService] Listing events for calendarId=${calendarId} from ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
      const response = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      return response.data.items || [];
    } catch (error: any) {
      console.error('[CalendarService] Error listing events:', error?.message || error);
      throw error;
    }
  }

  /**
   * Create a new event on Google Calendar
   */
  async createEvent(eventInput: CalendarEventInput) {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || config.google.calendarId || 'primary';
    try {
      console.log(`[CalendarService] Creating event "${eventInput.summary}" on calendarId=${calendarId}`);
      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        requestBody: {
          summary: eventInput.summary,
          description: eventInput.description || '',
          location: eventInput.location || '',
          start: {
            dateTime: eventInput.startDateTime,
            timeZone: 'Asia/Taipei',
          },
          end: {
            dateTime: eventInput.endDateTime,
            timeZone: 'Asia/Taipei',
          },
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('[CalendarService] Error creating event:', error?.message || error);
      throw error;
    }
  }

  /**
   * Delete event by eventId
   */
  async deleteEvent(eventId: string) {
    const calendarId = process.env.GOOGLE_CALENDAR_ID || config.google.calendarId || 'primary';
    try {
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId,
      });
      return true;
    } catch (error: any) {
      console.error('[CalendarService] Error deleting event:', error?.message || error);
      throw error;
    }
  }
}

export const calendarService = new CalendarService();
