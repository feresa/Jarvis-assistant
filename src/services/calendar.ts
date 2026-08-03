import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';
import ical from 'node-ical';

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
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          credentials = JSON.parse(decoded);
        }

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
   * Fetch and parse events from external iCal (.ics / webcal://) URLs with RRULE expansion
   */
  private async fetchICalEvents(urlsStr: string, timeMin: Date, timeMax: Date): Promise<any[]> {
    const events: any[] = [];
    const urls = urlsStr.split(',').map(u => u.trim()).filter(Boolean);

    for (const url of urls) {
      try {
        const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
        console.log(`[CalendarService] Fetching iCal feed from: ${httpUrl}`);
        const parsed: any = await ical.async.fromURL(httpUrl);

        for (const k in parsed) {
          const item = parsed[k];
          if (!item || item.type !== 'VEVENT') continue;

          // Expand recurring events (RRULE)
          if (item.rrule) {
            try {
              const dates = item.rrule.between(timeMin, timeMax);
              const duration = item.end ? new Date(item.end).getTime() - new Date(item.start).getTime() : 3600000;
              for (const d of dates) {
                const start = new Date(d);
                const end = new Date(d.getTime() + duration);
                events.push({
                  summary: item.summary || '未命名行程',
                  description: item.description || '',
                  location: item.location || '',
                  start: { dateTime: start.toISOString() },
                  end: { dateTime: end.toISOString() },
                });
              }
            } catch (err: any) {
              console.warn(`[CalendarService] RRULE error for "${item.summary}":`, err?.message || err);
            }
          } else {
            // Single event
            const start = new Date(item.start);
            const end = item.end ? new Date(item.end) : start;

            if (start <= timeMax && end >= timeMin) {
              events.push({
                summary: item.summary || '未命名行程',
                description: item.description || '',
                location: item.location || '',
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[CalendarService] Error fetching iCal URL (${url}):`, err?.message || err);
      }
    }

    return events;
  }

  /**
   * List events across Google Calendar and external iCal subscriptions
   */
  async listEvents(timeMin: Date, timeMax: Date) {
    const primaryId = process.env.GOOGLE_CALENDAR_ID || config.google.calendarId || 'primary';
    const targetCalendarIds = new Set<string>();
    targetCalendarIds.add(primaryId);

    try {
      const listRes = await this.calendar.calendarList.list();
      const userCalendars = listRes.data.items || [];
      for (const cal of userCalendars) {
        if (cal.id) {
          targetCalendarIds.add(cal.id);
        }
      }
    } catch (e: any) {
      console.warn('[CalendarService] Could not fetch calendarList, falling back to primary:', e?.message || e);
    }

    const allEvents: any[] = [];

    // 1. Fetch Google Calendar events
    for (const calId of targetCalendarIds) {
      try {
        const response = await this.calendar.events.list({
          calendarId: calId,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        const items = response.data.items || [];
        allEvents.push(...items);
      } catch (error: any) {
        console.warn(`[CalendarService] Skipping calendar "${calId}":`, error?.message || error);
      }
    }

    // 2. Fetch external iCal (.ics / webcal://) subscription URLs if configured
    const icalUrls = process.env.PUBLIC_ICAL_URLS;
    if (icalUrls) {
      const extraEvents = await this.fetchICalEvents(icalUrls, timeMin, timeMax);
      allEvents.push(...extraEvents);
    }

    // Sort combined events by startTime
    allEvents.sort((a, b) => {
      const startA = new Date(a.start?.dateTime || a.start?.date || 0).getTime();
      const startB = new Date(b.start?.dateTime || b.start?.date || 0).getTime();
      return startA - startB;
    });

    return allEvents;
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
