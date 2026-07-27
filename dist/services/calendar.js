import { google } from 'googleapis';
import { config } from '../config.js';
import fs from 'fs';
export class CalendarService {
    calendar;
    constructor() {
        let auth;
        // Support Vercel env variable stringified JSON OR local credentials.json file
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            try {
                const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
                auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/calendar'],
                });
            }
            catch (e) {
                console.error('[CalendarService] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env var:', e);
            }
        }
        if (!auth && fs.existsSync(config.google.keyFilePath)) {
            auth = new google.auth.GoogleAuth({
                keyFile: config.google.keyFilePath,
                scopes: ['https://www.googleapis.com/auth/calendar'],
            });
        }
        if (!auth) {
            auth = new google.auth.GoogleAuth({
                scopes: ['https://www.googleapis.com/auth/calendar'],
            });
        }
        this.calendar = google.calendar({ version: 'v3', auth });
    }
    /**
     * List events between timeMin and timeMax
     */
    async listEvents(timeMin, timeMax) {
        try {
            const response = await this.calendar.events.list({
                calendarId: config.google.calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return response.data.items || [];
        }
        catch (error) {
            console.error('[CalendarService] Error listing events:', error);
            throw error;
        }
    }
    /**
     * Create a new event on Google Calendar
     */
    async createEvent(eventInput) {
        try {
            const response = await this.calendar.events.insert({
                calendarId: config.google.calendarId,
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
        }
        catch (error) {
            console.error('[CalendarService] Error creating event:', error);
            throw error;
        }
    }
    /**
     * Delete event by eventId
     */
    async deleteEvent(eventId) {
        try {
            await this.calendar.events.delete({
                calendarId: config.google.calendarId,
                eventId: eventId,
            });
            return true;
        }
        catch (error) {
            console.error('[CalendarService] Error deleting event:', error);
            throw error;
        }
    }
}
export const calendarService = new CalendarService();
