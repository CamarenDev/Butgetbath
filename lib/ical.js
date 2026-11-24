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
function buildCalendar({ events, method = 'PUBLISH', organizerEmail, host, name = 'Budget Bath Solutions appointments' }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Bath Solutions//Appointments//EN', 'CALSCALE:GREGORIAN', `METHOD:${method}`, `X-WR-CALNAME:${escapeText(name)}`];
  for (const { appointment: a, customer, description, url, summary } of events) {
    const cancelled = a.status === 'cancelled';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.uid}@${host}`,
      `DTSTAMP:${stamp(a.updated_at || a.created_at)}`,
      `DTSTART:${stamp(a.starts_at)}`,
      `DTEND:${stamp(endOf(a))}`,
      `SEQUENCE:${a.sequence}`,
      `SUMMARY:${escapeText(summary || 'Appointment')}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE'
    );
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (a.location) lines.push(`LOCATION:${escapeText(a.location)}`);
    if (url) lines.push(`URL:${clean(url)}`);
    if (organizerEmail) lines.push(`ORGANIZER;CN=Budget Bath Solutions:mailto:${clean(organizerEmail)}`);
    if (customer?.email) lines.push(`ATTENDEE;CN=${escapeText(customer.name).replace(/[":]/g, '')};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancelled ? 'DECLINED' : 'NEEDS-ACTION'}:mailto:${clean(customer.email)}`);
    if (!cancelled) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Appointment reminder', 'TRIGGER:-PT1H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function googleAddUrl({ appointment: a, summary, description }) {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: summary, dates: `${stamp(a.starts_at)}/${stamp(endOf(a))}`, details: description || '', location: a.location || '' });
  return `https://calendar.google.com/calendar/render?${params}`;
}

module.exports = { buildCalendar, googleAddUrl, stamp, endOf };
