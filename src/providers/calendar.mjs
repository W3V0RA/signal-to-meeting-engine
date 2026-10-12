export class GoogleCalendar {
  mode='google-calendar';
  constructor({gmail,calendarId,fetcher=fetch}){this.gmail=gmail;this.calendarId=calendarId;this.fetcher=fetcher;}
  async event(eventId) {
    if(!this.calendarId||!eventId)throw Error('Calendar and associated event ID required');
    const response=await this.fetcher(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,{headers:{Authorization:`Bearer ${await this.gmail.token()}`},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Calendar read failed (${response.status})`);
    const raw=await response.json();
    return {id:raw.id,status:raw.status,provider:this.mode,organizer:raw.organizer?.email,start:raw.start?.dateTime,end:raw.end?.dateTime,
      attendees:(raw.attendees??[]).map(a=>({email:a.email?.toLowerCase(),accepted:a.responseStatus==='accepted'}))};
  }
}
