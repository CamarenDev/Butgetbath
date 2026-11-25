// Sample arguments for every email template. Used by the template tests and by `npm run email:preview`,
// so adding a template without a sample here fails the test suite.
const site = 'https://example.com';
const user = { name: 'Ana García', email: 'ana@example.com', phone: '(630) 555-0142' };
const request = { id: 42, title: 'Master bath remodel', project_type: 'Bathroom remodel', location: 'Kane County', timeline: 'Next 3 months', budget: '$15,000 - $25,000', description: 'Replace the tub with a walk-in shower.\nNew tile & vanity.' };
const when = 'Tue, Mar 3 at 10:00 AM (Central)';
const appointment = { name: user.name, kind: 'In-home estimate', when, duration: 60, notes: 'Please use the side door.', googleUrl: `${site}/g`, icsUrl: `${site}/a.ics`, outlookUrl: `${site}/o`, manageUrl: `${site}/book/manage/?token=abc`, phone: '(630) 555-0100' };
const submission = { type: 'project', name: user.name, email: user.email, phone: user.phone, location: 'Kane County', interest: 'Walk-in shower', message: 'Hello,\nI would like an estimate.', receivedAt: '2026-03-01T15:00:00Z' };

const samples = {
  verifyEmail: [{ name: user.name, url: `${site}/account/verify/?token=t` }],
  accountExists: [{ name: user.name, loginUrl: `${site}/account/login/`, resetUrl: `${site}/account/forgot-password/` }],
  welcome: [{ name: user.name, dashboardUrl: `${site}/account/` }],
  passwordReset: [{ name: user.name, url: `${site}/account/reset-password/?token=t` }],
  passwordChanged: [{ name: user.name, loginUrl: `${site}/account/login/` }],
  requestReceived: [{ name: user.name, request, photoCount: 3, requestUrl: `${site}/account/request/?id=42` }],
  newRequestAlert: [{ user, request, photoCount: 3, adminUrl: `${site}/admin/#requests` }],
  ticketMessage: [
    { audience: 'customer', recipientName: user.name, authorName: 'Budget Bath', request, body: 'We can start on the 12th.\n\nThanks!', photoCount: 1, url: `${site}/account/request/?id=42`, canReply: true },
    { audience: 'staff', authorName: user.name, request, body: 'Sounds good.', photoCount: 0, url: `${site}/admin/#requests`, canReply: false }
  ],
  ticketStatus: [{ name: user.name, request, label: 'Resolved', url: `${site}/account/request/?id=42` }],
  leadConfirmation: [{ name: user.name, type: 'project' }, { name: user.name, type: 'work' }, { name: user.name, type: 'question' }],
  appointment: ['new', 'updated', 'cancelled'].map(change => ({ ...appointment, change, location: 'At your home', url: `${site}/account/request/?id=42` })),
  appointmentCancelledByCustomer: [{ customerName: user.name, when, url: `${site}/admin/#requests` }],
  booking: ['new', 'updated', 'cancelled', 'reminder'].map(change => ({ ...appointment, change, where: '12 Oak St, Geneva', inHome: change !== 'reminder' })),
  bookingAlert: ['new', 'updated', 'cancelled'].map(change => ({ change, kind: 'In-home estimate', when, name: user.name, email: user.email, phone: user.phone, where: '12 Oak St', interest: 'Shower', notes: 'Dog at home', adminUrl: `${site}/admin/#bookings` })),
  customerMessage: [{ name: user.name, subject: 'A quick update', body: `Your permit was approved.\n\nDetails: ${site}/account/. Thanks!` }],
  employeeInvite: [{ name: 'Sam Lee', setupUrl: `${site}/employee/setup/?token=t`, portalUrl: `${site}/employee/` }],
  staffNotice: [{ name: 'Sam Lee', subject: 'You are scheduled tomorrow', body: 'Job #7 starts at 8:00 AM.\n\nBring the tile saw.', url: `${site}/employee/` }],
  officeAlert: [{ subject: 'Estimate signed: E-1001', body: 'Ana signed estimate E-1001 for $12,400.00.\nOpen it in the estimator.', url: `${site}/admin/#estimator`, cta: 'Open the estimator' }],
  campaignSummary: [{ greeting: 'Happy Holidays', name: 'Winter', year: 2026, sent: 120, failed: 2, offer: '10% off with code WINTER10 through Jan 31', adminUrl: `${site}/admin/` }],
  estimateReady: [{ name: user.name, number: 'E-1001', title: 'Master bath', total: '$12,400.00', url: `${site}/account/estimate/?id=1`, email: user.email }],
  paymentReceipt: [{ name: user.name, amount: '$2,000.00', number: 'E-1001', title: 'Master bath', online: true, url: `${site}/account/estimate/?id=1` }],
  permitUpdate: [{ name: user.name, title: 'Master bath', permit: 'Plumbing', status: 'Issued', url: `${site}/account/estimate/?id=1` }],
  applicationReceived: [{ name: 'Sam Lee', testUrl: `${site}/handyman-application/test/?token=t`, questions: 30, minutes: 25 }],
  holidayGreeting: [
    { name: 'Ana García', greeting: 'Happy Holidays', wish: 'Wishing you a warm season.', intro: 'Thank you for trusting us.\n\nSee you next year.', sale: { pct: 10, code: 'WINTER10', until: 'Jan 31' }, ctaUrl: `${site}/book/`, unsubscribeUrl: `${site}/unsubscribe/?t=1`, address: '1 Main St, Geneva, IL' },
    { name: '', greeting: 'Happy Thanksgiving', wish: 'Gratitude to you.', unsubscribeUrl: `${site}/unsubscribe/?t=1` }
  ],
  leadAlert: [{ submission }, { submission: { ...submission, type: 'callback' } }]
};

// Templates that also have a Spanish version, selected with `lang: 'es'`.
const spanish = ['verifyEmail', 'accountExists', 'welcome', 'passwordReset', 'passwordChanged', 'requestReceived', 'estimateReady', 'paymentReceipt', 'permitUpdate', 'applicationReceived', 'customerMessage'];

module.exports = { site, samples, spanish };
