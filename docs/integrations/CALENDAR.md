# Calendar and booking

Configure your business's existing booking URL and Calendar ID. The offline demo uses `https://example.org/book` and a fictional event; it does not create a calendar or meeting.

The default permits the booking URL only inside a response linked to explicit verified interest, and that response needs fresh human exact-copy approval and its own release. An optional Google schedule experiment permits the configured link in initials and third follow-ups after current schedule identity and human duration review; follow-ups 1 and 2 remain link-free. A later inbound message supersedes old response approval. Link clicks never mark a meeting booked.

`GoogleCalendar.event(eventId)` reads a specifically associated event using Calendar read-only access. It maps actual status, organizer, date/time and accepted attendees. `verifyBooking()` checks the initial/thread, a sent booking link or an interest-linked sent response, configured organizer, matching accepted recipient and valid interval after the relevant send. An existing cancelled event updates the local outcome and remains in the audit. Unknown cancelled IDs are refused.

See the official [event read API](https://developers.google.com/workspace/calendar/api/v3/reference/events/get). Event-ID association must be established through a reviewed integration, not keyword matching the title. The console records reviewed event associations, and the scheduled worker reads them and updates confirmation/cancellation with owner alerts. The adapter does not create events, infer bookings from link clicks or perform broad calendar correlation. Authorized live event read/association and cancellation proof remain required before claiming actual booking reliability.
