// RFC 5545 iCalendar output (Apple Calendar, Outlook, Google Calendar and any CalDAV client) plus Google "add event" links.
const stamp = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ');

// Lines are limited to 75 octets; continuation lines start with a space.
function fold(line) {
  const out = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char) > (out.length ? 74 : 75)) { out.push(current); current = char; } else current += char;
  }
  out.push(current);
  return out.join('\r\n ');
}

function endOf(appointment) {
  return new Date(new Date(appointment.starts_at).getTime() + appointment.duration_min * 60000);
}

// events: [{ appointment, customer: { name, email }, description, url }]
function buildCalendar({ events, method = 'PUBLISH', organizerEmail, host, name = 'Budget Bath Solutions appointments', timeZone }) {
  if (!['PUBLISH', 'REQUEST', 'CANCEL'].includes(method)) throw new Error('Unsupported calendar method.');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Bath Solutions//Appointments//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`, `X-WR-CALNAME:${escapeText(name)}`];
  if (timeZone) lines.push(`X-WR-TIMEZONE:${clean(timeZone)}`);
  for (const { appointment: a, customer, description, url, summary } of events) {
    const start = new Date(a.starts_at);
    const updated = new Date(a.updated_at || a.created_at || start);
    if (Number.isNaN(start.getTime()) || Number.isNaN(updated.getTime()) || !Number.isInteger(Number(a.duration_min)) || Number(a.duration_min) <= 0) throw new Error('Invalid calendar event.');
    const cancelled = a.status === 'cancelled';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.uid}@${host}`,
      `DTSTAMP:${stamp(updated)}`,
      `DTSTART:${stamp(a.starts_at)}`,
      `DTEND:${stamp(endOf(a))}`,
      `SEQUENCE:${Math.max(0, Number(a.sequence) || 0)}`,
      `LAST-MODIFIED:${stamp(updated)}`,
      `CREATED:${stamp(a.created_at || updated)}`,
      `SUMMARY:${escapeText(summary || 'Appointment')}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE'
    );
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (a.location) lines.push(`LOCATION:${escapeText(a.location)}`);
    if (url) lines.push(`URL:${clean(url)}`);
    if (organizerEmail) lines.push(`ORGANIZER;CN=Budget Bath Solutions:mailto:${clean(organizerEmail)}`);
    if (customer?.email) lines.push(`ATTENDEE;CN=${escapeText(customer.name).replace(/[":]/g, '')};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? 'DECLINED' : 'NEEDS-ACTION'}:mailto:${clean(customer.email)}`);
    if (!cancelled) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment tomorrow', 'TRIGGER:-P1D', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment reminder', 'TRIGGER:-PT1H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function googleAddUrl({ appointment: a, summary, description }) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: summary, dates: `${stamp(a.starts_at)}/${stamp(endOf(a))}`, details: description || '', location: a.location || '' });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function outlookAddUrl({ appointment: a, summary, description }) {
  const params = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: summary, startdt: new Date(a.starts_at).toISOString(), enddt: endOf(a).toISOString(), body: description || '', location: a.location || '' });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

module.exports = { buildCalendar, googleAddUrl, outlookAddUrl, stamp, endOf };
