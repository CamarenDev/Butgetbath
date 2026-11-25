// Branded transactional email templates. Every template returns { subject, html, text }.
// All dynamic values are HTML-escaped; layouts use tables and inline styles for email-client compatibility.
const { esc, brand, paragraphs, button, details, rich, quote, build } = require('./email-layout');

const replyMarker = '--- Reply above this line ---';
const ignore = 'If you did not expect this email, you can safely ignore it.';

function createTemplates(siteUrl, { phone = '' } = {}) {
  const siteUrlOf = () => siteUrl;
  const make = opts => build(siteUrl, { phone, ...opts });
  const makeEs = opts => build(siteUrl, { phone, lang: 'es', ...opts });
  const templates = {
    verifyEmail: ({ name, url }) => make({
      subject: 'Confirm your email address', preheader: 'One quick step to activate your free account.', heading: `Welcome, ${name}!`,
      htmlBody: paragraphs(['Thanks for creating a free Budget Bath Solutions account. Please confirm your email address to start sending us your project details and photos.']) + button(url, 'Confirm my email') + paragraphs([`This link expires in 24 hours. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all;color:${brand.brass};">${esc(url)}</span>`]),
      footnote: ignore, text: `Welcome, ${name}!\n\nConfirm your email to activate your free account:\n${url}\n\nThis link expires in 24 hours. ${ignore}`
    }),
    accountExists: ({ name, loginUrl, resetUrl }) => make({
      subject: 'You already have an account', preheader: 'Someone tried to register with this email address.', heading: 'You already have an account',
      htmlBody: paragraphs([`Hi ${esc(name)}, someone just tried to create an account with this email address, but you already have one.`]) + button(loginUrl, 'Sign in') + paragraphs([`Forgot your password? <a href="${esc(resetUrl)}" style="color:${brand.brass};">Reset it here</a>.`]),
      footnote: ignore, text: `Hi ${name},\n\nSomeone tried to create an account with this email, but you already have one.\nSign in: ${loginUrl}\nReset your password: ${resetUrl}\n\n${ignore}`
    }),
    welcome: ({ name, dashboardUrl }) => make({
      subject: 'Your account is ready', preheader: 'Tell us about your project and upload photos.', heading: 'Your email is confirmed',
      htmlBody: paragraphs([`Hi ${esc(name)}, your free account is ready. Describe what you are looking for and upload photos of your space so we can understand your project before we talk.`]) + button(dashboardUrl, 'Start a project request'),
      text: `Hi ${name},\n\nYour account is ready. Start a project request here:\n${dashboardUrl}`
    }),
    passwordReset: ({ name, url }) => make({
      subject: 'Reset your password', preheader: 'Use this link within one hour.', heading: 'Reset your password',
      htmlBody: paragraphs([`Hi ${esc(name)}, we received a request to reset your password.`]) + button(url, 'Choose a new password') + paragraphs(['This link expires in 1 hour and can be used once.']),
      footnote: `${ignore} Your password will not change.`, text: `Hi ${name},\n\nReset your password (link expires in 1 hour):\n${url}\n\n${ignore} Your password will not change.`
    }),
    passwordChanged: ({ name, loginUrl }) => make({
      subject: 'Your password was changed', preheader: 'Your account password was just updated.', heading: 'Password changed',
      htmlBody: paragraphs([`Hi ${esc(name)}, the password on your account was just changed and any other devices were signed out.`, 'If this was not you, reset your password right away or contact us.']) + button(loginUrl, 'Sign in'),
      text: `Hi ${name},\n\nYour password was just changed and other devices were signed out. If this was not you, reset it immediately: ${loginUrl}`
    }),
    requestReceived: ({ name, request, photoCount, requestUrl }) => make({
      subject: 'We received your project request', preheader: 'We will review your details and reach out soon.', heading: 'We got your request',
      htmlBody: paragraphs([`Hi ${esc(name)}, thank you for sending us your project. Our team will review your details${photoCount ? ' and photos' : ''} and follow up to talk about next steps.`]) + details([['Project', request.title], ['Type', request.project_type], ['County', request.location], ['Photos', String(photoCount)]]) + button(requestUrl, 'View your request'),
      text: `Hi ${name},\n\nWe received your project request "${request.title}" (${photoCount} photo${photoCount === 1 ? '' : 's'}). We will review it and follow up.\n\nView it: ${requestUrl}`
    }),
    newRequestAlert: ({ user, request, photoCount, adminUrl }) => make({
      subject: `New project request: ${request.title}`, preheader: `${user.name} in ${request.location} sent a request.`, heading: 'New project request',
      htmlBody: details([['Customer', user.name], ['Email', user.email], ['Phone', user.phone], ['Project', request.title], ['Type', request.project_type], ['County', request.location], ['Timeline', request.timeline], ['Budget', request.budget], ['Photos', String(photoCount)], ['Details', request.description]]) + button(adminUrl, 'Review request and photos'),
      text: `New project request\n\nCustomer: ${user.name} <${user.email}> ${user.phone}\nProject: ${request.title} (${request.project_type})\nCounty: ${request.location}\nTimeline: ${request.timeline}\nBudget: ${request.budget}\nPhotos: ${photoCount}\n\n${request.description}\n\nReview: ${adminUrl}`
    }),
    ticketMessage: ({ audience, recipientName, authorName, request, body, photoCount, url, canReply }) => {
      const toStaff = audience === 'staff';
      const photos = photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'} attached - open the request to view ${photoCount === 1 ? 'it' : 'them'}.` : '';
      const marker = canReply ? replyMarker : '';
      return make({
        subject: `[Request #${request.id}] ${request.title}`, preheader: toStaff ? `${authorName} sent a new message.` : `${authorName} replied to your request.`,
        heading: toStaff ? `New message from ${authorName}` : 'New reply on your request',
        htmlBody: (canReply ? `<p style="margin:0 0 16px;font-size:12px;color:${brand.muted};">${esc(replyMarker)}</p>` : '') + paragraphs([toStaff ? `${esc(authorName)} wrote on "${esc(request.title)}":` : `Hi ${esc(recipientName)}, ${esc(authorName)} replied to "${esc(request.title)}":`])
          + quote(`${esc(body).replace(/\n/g, '<br>')}${photos ? `<br><br><em style="font-size:14px;color:${brand.muted};">${esc(photos)}</em>` : ''}`)
          + button(url, toStaff ? 'Open the request' : 'View and reply') + (canReply ? paragraphs(['You can also reply directly to this email and your message will be added to the request. Photos you attach will be added too.']) : ''),
        footnote: toStaff ? '' : 'You are receiving this because you have an open request. You can turn off reply emails in your account.',
        text: `${marker ? marker + '\n\n' : ''}${toStaff ? `${authorName} wrote` : `Hi ${recipientName}, ${authorName} replied`} on "${request.title}":\n\n${body}\n\n${photos ? photos + '\n\n' : ''}Open the request: ${url}${canReply ? '\n\nYou can reply to this email and your message will be added to the request.' : ''}`
      });
    },
    ticketStatus: ({ name, request, label, url }) => make({
      subject: `[Request #${request.id}] Status: ${label}`, preheader: `Your request is now "${label}".`, heading: `Your request is now "${label}"`,
      htmlBody: paragraphs([`Hi ${esc(name)}, the status of "${esc(request.title)}" changed to <strong>${esc(label)}</strong>.`, label === 'Resolved' ? 'If everything looks good, no action is needed. If you need more help, just reply and we will reopen it.' : '']) + button(url, 'View your request'),
      footnote: 'You can turn off status emails in your account.', text: `Hi ${name},\n\nThe status of "${request.title}" is now: ${label}.\n\nView it: ${url}`
    }),
    leadConfirmation: ({ name, type }) => {
      const copy = { project: ['your estimate request', 'We will be in touch to schedule your free estimate.'], work: ['your application', 'If there is a fit, we will contact you about next steps. Submitting this form does not create an employment or contracting relationship.'], question: ['your question', 'Our team will review it and reply.'], callback: ['your free estimate request', 'Thanks for choosing Budget Bath Solutions. One of our team members will call you at the phone number you gave us to talk about your project and schedule your free in-home estimate. There is no obligation.'] }[type] || ['your message', 'We will be in touch soon.'];
      return make({
        subject: `We received ${copy[0]}`, preheader: copy[1], heading: 'Thanks for reaching out',
        htmlBody: paragraphs([`Hi ${esc(name)}, we received ${copy[0]}.`, esc(copy[1]), ...(type === 'project' ? ['Prefer to pick the time yourself? <a href="' + esc(siteUrl) + '/book/" style="color:' + brand.brass + ';">Book a phone call, video call or free in-home estimate</a> and get a calendar invite with reminders.'] : []), 'Want to speed things up? <a href="' + esc(siteUrl) + '/account/register/" style="color:' + brand.brass + ';">Create a free account</a> to upload photos of your project.']),
        text: `Hi ${name},\n\nWe received ${copy[0]}. ${copy[1]}\n\n${type === 'project' ? `Pick a time yourself: ${siteUrl}/book/\n\n` : ''}Create a free account to upload photos: ${siteUrl}/account/register/`
      });
    },
    appointment: ({ name, kind, change, when, duration, location, notes, url, googleUrl, icsUrl }) => {
      const heading = { new: 'Your appointment is confirmed', updated: 'Your appointment was rescheduled', cancelled: 'Your appointment was cancelled' }[change];
      const intro = { new: 'We scheduled a time to talk about your project.', updated: 'We updated the time of your appointment. The details below replace the earlier ones.', cancelled: 'This appointment was cancelled. Reply on your request if you would like to find a new time.' }[change];
      const rows = details([['When', when], ['Length', `${duration} minutes`], ['Type', kind], ['Where / how', location], ['Notes', notes]]);
      const links = change === 'cancelled' ? '' : paragraphs([`Add it to your calendar: <a href="${esc(googleUrl)}" style="color:${brand.brass};">Google Calendar</a> &middot; <a href="${esc(icsUrl)}" style="color:${brand.brass};">Apple / Outlook (.ics, also attached)</a>`]);
      return make({
        subject: `${{ new: 'Appointment confirmed', updated: 'Appointment rescheduled', cancelled: 'Appointment cancelled' }[change]}: ${when}`, preheader: `${kind} - ${when}`, heading,
        htmlBody: paragraphs([`Hi ${esc(name)}, ${intro}`]) + rows + links + button(url, 'View your request'),
        text: `Hi ${name},\n\n${intro}\n\nWhen: ${when}\nLength: ${duration} minutes\nType: ${kind}\n${location ? `Where / how: ${location}\n` : ''}${notes ? `Notes: ${notes}\n` : ''}\n${change === 'cancelled' ? '' : `Add to Google Calendar: ${googleUrl}\nApple / Outlook: ${icsUrl}\n\n`}View your request: ${url}`
      });
    },
    appointmentCancelledByCustomer: ({ customerName, when, url }) => make({
      subject: `Appointment cancelled by ${customerName}: ${when}`, preheader: when, heading: 'Customer cancelled an appointment',
      htmlBody: paragraphs([`${esc(customerName)} cancelled the appointment on ${esc(when)}.`]) + button(url, 'Open the request'),
      text: `${customerName} cancelled the appointment on ${when}.\n${url}`
    }),
    booking: ({ name, change, kind, when, duration, where, notes, inHome, phone, manageUrl, googleUrl, outlookUrl, icsUrl }) => {
      const heading = { new: 'You are booked!', updated: 'Your appointment was rescheduled', cancelled: 'Your appointment was cancelled', reminder: 'Reminder: your appointment is coming up' }[change];
      const intro = { new: `Thanks for booking with Budget Bath Solutions. Your ${kind.toLowerCase()} is confirmed. There is nothing to prepare, and it is free with no obligation.`, updated: 'Your appointment time changed. The details below replace the earlier ones, and the attached calendar file updates the event in your calendar.', cancelled: 'This appointment was cancelled. You can book a new time whenever you are ready.', reminder: 'This is a friendly reminder about your upcoming appointment with us.' }[change];
      const rows = details([['When', when], ['Length', `${duration} minutes`], ['Type', kind], ['Where / how', where], ['Notes', notes]]);
      const prep = change === 'cancelled' ? '' : paragraphs([inHome ? 'To get the most from the visit: show us the bathroom, tell us what you like and dislike about it, and have any inspiration photos ready. Please make sure someone 18 or older is home.' : 'To get the most from the call: have your bathroom size, what you would like to change and a rough budget in mind. Photos help; you can send them from your free account any time.']);
      const calendar = change === 'cancelled' ? '' : paragraphs([`<strong>Add it to your calendar</strong> (you get a reminder a day before and an hour before):<br><a href="${esc(googleUrl)}" style="color:${brand.brass};">Google Calendar</a> &middot; <a href="${esc(icsUrl)}" style="color:${brand.brass};">Apple Calendar / iPhone (.ics)</a> &middot; <a href="${esc(outlookUrl)}" style="color:${brand.brass};">Outlook</a><br><span style="font-size:13px;color:#64748b;">The .ics file is also attached. Open it on your phone to add the event.</span>`]);
      const manage = change === 'cancelled' ? button(`${siteUrlOf(manageUrl)}/book/`, 'Book a new time') : button(manageUrl, 'Reschedule or cancel');
      const help = phone ? paragraphs([`Questions? Call us at <a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" style="color:${brand.brass};">${esc(phone)}</a>.`]) : '';
      return make({
        subject: `${{ new: 'Appointment confirmed', updated: 'Appointment rescheduled', cancelled: 'Appointment cancelled', reminder: 'Reminder: appointment' }[change]}: ${when}`, preheader: `${kind} - ${when}`, heading,
        htmlBody: paragraphs([`Hi ${esc(name)}, ${intro}`]) + rows + prep + calendar + manage + help,
        text: `Hi ${name},\n\n${intro}\n\nWhen: ${when}\nLength: ${duration} minutes\nType: ${kind}\n${where ? `Where / how: ${where}\n` : ''}${notes ? `Notes: ${notes}\n` : ''}\n${change === 'cancelled' ? `Book a new time: ${siteUrlOf(manageUrl)}/book/` : `Add to Google Calendar: ${googleUrl}\nApple Calendar / iPhone: ${icsUrl}\nOutlook: ${outlookUrl}\n\nReschedule or cancel: ${manageUrl}`}${phone ? `\n\nQuestions? Call ${phone}.` : ''}`
      });
    },
    bookingAlert: ({ change, kind, when, name, email, phone, where, interest, notes, adminUrl }) => make({
      subject: `${{ new: 'New booking', updated: 'Booking rescheduled', cancelled: 'Booking cancelled' }[change]}: ${name}, ${when}`, preheader: `${kind} - ${when}`, heading: { new: 'New estimate booking', updated: 'Customer rescheduled', cancelled: 'Customer cancelled a booking' }[change],
      htmlBody: details([['Customer', name], ['Email', email], ['Phone', phone], ['When', when], ['Type', kind], ['Where / how', where], ['Project', interest], ['Notes', notes]]) + button(adminUrl, 'Open bookings'),
      text: `${name} <${email}> ${phone}\n${kind}: ${when}\n${where}\n${interest || ''}\n${notes || ''}\n\n${adminUrl}`
    }),
    customerMessage: ({ name, subject, body, url, cta, lang }) => {
      const es = lang === 'es';
      return (es ? makeEs : make)({
        subject, preheader: String(body).slice(0, 90), heading: subject,
        htmlBody: paragraphs([`${es ? 'Hola' : 'Hi'} ${esc(name)},`, ...rich(body)]) + (url ? button(url, cta || (es ? 'Abrir' : 'Open')) : ''),
        text: `${es ? 'Hola' : 'Hi'} ${name},\n\n${body}${url ? `\n\n${url}` : ''}`
      });
    },
    employeeInvite: ({ name, setupUrl, portalUrl }) => make({
      subject: 'Welcome to the Budget Bath Solutions team', preheader: 'Set your password to open the employee portal.', heading: `Welcome aboard, ${name}!`,
      htmlBody: paragraphs(['Your employee portal account is ready. There you can see open jobs, log your hours, review payments, sign contracts and send us requests.']) + (setupUrl ? button(setupUrl, 'Set my password') + paragraphs(['This link expires in 7 days.']) : '') + button(portalUrl, 'Open the employee portal'),
      text: `Welcome aboard, ${name}!\n\nYour employee portal account is ready.\n${setupUrl ? `Set your password (link expires in 7 days): ${setupUrl}\n` : ''}Employee portal: ${portalUrl}`
    }),
    staffNotice: ({ name, subject, body, url }) => make({
      subject, preheader: String(body).slice(0, 90), heading: subject, eyebrow: 'Employee portal',
      htmlBody: paragraphs([`Hi ${esc(name)},`, ...rich(body)]) + button(url, 'Open the employee portal'),
      text: `Hi ${name},\n\n${body}\n\n${url}`
    }),
    officeAlert: ({ subject, body, url, cta }) => make({
      subject, preheader: String(body).slice(0, 90), heading: subject, eyebrow: 'Team alert',
      htmlBody: paragraphs(rich(body)) + (url ? button(url, cta || 'Open the admin portal') : ''),
      text: `${body}${url ? `\n\n${url}` : ''}`
    }),
    campaignSummary: ({ greeting, name, year, sent, failed, offer, adminUrl }) => make({
      subject: `${greeting} campaign finished`, preheader: `${sent} sent, ${failed} failed.`, heading: `${greeting} campaign finished`, eyebrow: 'Team alert',
      htmlBody: details([['Campaign', `${name} ${year}`], ['Sent', String(sent)], ['Failed', String(failed)], ['Offer', offer || 'Greeting only']]) + (adminUrl ? button(adminUrl, 'Open the admin portal') : ''),
      text: `${name} ${year}: ${sent} sent, ${failed} failed. ${offer || 'Greeting only.'}${adminUrl ? `\n\n${adminUrl}` : ''}`
    }),
    estimateReady: ({ name, number, title, total, url, email, lang }) => {
      const es = lang === 'es';
      return (es ? makeEs : make)({
        subject: es ? `Su estimado de Budget Bath Solutions: ${title}` : `Your estimate from Budget Bath Solutions: ${title}`,
        preheader: es ? `El estimado ${number} está listo para revisar.` : `Estimate ${number} is ready to review.`, heading: es ? 'Su estimado está listo' : 'Your estimate is ready',
        htmlBody: paragraphs([es ? `Hola ${esc(name)}, su estimado está listo para revisar. Inicie sesión para ver los detalles, elegir los artículos opcionales, firmarlo y pagar su depósito en línea.` : `Hi ${esc(name)}, your estimate is ready to review. Sign in to see the details, choose any optional items, sign it and pay your deposit online.`])
          + details([[es ? 'Estimado' : 'Estimate', number], [es ? 'Proyecto' : 'Project', title], ['Total', total]]) + button(url, es ? 'Ver mi estimado' : 'Review my estimate')
          + paragraphs([es ? `¿Aún no tiene cuenta? Cree una con este correo (${esc(email)}) y el estimado aparecerá automáticamente.` : `No account yet? Create one with this email address (${esc(email)}) and the estimate will appear automatically.`]),
        text: es ? `Hola ${name},\n\nSu estimado ${number} (${total}) está listo para revisar:\n${url}\n\nSi aún no tiene cuenta, cree una con este correo (${email}) y aparecerá automáticamente.`
          : `Hi ${name},\n\nYour estimate ${number} (${total}) is ready to review:\n${url}\n\nIf you do not have an account yet, create one with this email address (${email}) and it will appear automatically.`
      });
    },
    paymentReceipt: ({ name, amount, number, title, online, url, lang }) => {
      const es = lang === 'es';
      return (es ? makeEs : make)({
        subject: es ? `Pago recibido: ${number}` : `Payment received: ${number}`, preheader: es ? `Recibimos su pago de ${amount}.` : `We received your payment of ${amount}.`, heading: es ? 'Pago recibido' : 'Payment received',
        htmlBody: paragraphs([es ? `Hola ${esc(name)}, recibimos su pago${online ? ' en línea' : ''}. ¡Gracias!` : `Hi ${esc(name)}, we received your ${online ? 'online ' : ''}payment. Thank you!`])
          + details([[es ? 'Monto' : 'Amount', amount], [es ? 'Estimado' : 'Estimate', number], [es ? 'Proyecto' : 'Project', title], [es ? 'Método' : 'Method', online ? (es ? 'Tarjeta (en línea)' : 'Card (online)') : '']]) + (url ? button(url, es ? 'Ver mi estimado' : 'View my estimate') : ''),
        text: es ? `Hola ${name},\n\nRecibimos su pago${online ? ' en línea' : ''} de ${amount} para ${title} (${number}). ¡Gracias!${url ? `\n\n${url}` : ''}` : `Hi ${name},\n\nWe received your ${online ? 'online ' : ''}payment of ${amount} for ${title} (${number}). Thank you!${url ? `\n\n${url}` : ''}`
      });
    },
    permitUpdate: ({ name, title, permit, status, url, lang }) => {
      const es = lang === 'es';
      return (es ? makeEs : make)({
        subject: es ? `Actualización del permiso para ${title}` : `Permit update for ${title}`, preheader: `${permit}: ${status}`, heading: es ? 'Actualización del permiso' : 'Permit update',
        htmlBody: paragraphs([es ? `Hola ${esc(name)}, buenas noticias sobre su proyecto.` : `Hi ${esc(name)}, good news about your project.`]) + details([[es ? 'Proyecto' : 'Project', title], [es ? 'Permiso' : 'Permit', permit], [es ? 'Estado' : 'Status', status]])
          + paragraphs([es ? 'Puede ver todos los permisos e inspecciones en su cuenta, bajo este estimado.' : 'You can see all permits and inspections in your account under this estimate.']) + (url ? button(url, es ? 'Ver mi estimado' : 'View my estimate') : ''),
        text: es ? `Hola ${name},\n\nEl permiso ${permit} de ${title} ahora está: "${status}".${url ? `\n\n${url}` : ''}` : `Hi ${name},\n\nThe ${permit} permit for ${title} is now "${status}".${url ? `\n\n${url}` : ''}`
      });
    },
    applicationReceived: ({ name, testUrl, questions, minutes, lang }) => {
      const es = lang === 'es';
      return (es ? makeEs : make)({
        subject: es ? 'Recibimos su solicitud' : 'We received your application', preheader: es ? 'Un paso más: la prueba de habilidades.' : 'One more step: the skills test.', heading: es ? 'Gracias por postularse' : 'Thanks for applying',
        htmlBody: paragraphs([es ? `Hola ${esc(name)}, gracias por postularse para trabajar con Budget Bath Solutions. Haga la prueba de habilidades de ${questions} preguntas para su oficio (unos ${minutes} minutos, un intento por oficio).` : `Hi ${esc(name)}, thank you for applying to work with Budget Bath Solutions. Please take the ${questions}-question skills test for your trade (about ${minutes} minutes, one attempt per trade).`])
          + button(testUrl, es ? 'Empezar la prueba' : 'Start the skills test')
          + paragraphs([es ? 'Nuestro equipo revisará sus datos y el resultado de su prueba y se comunicará si hay compatibilidad. Enviar una solicitud no crea una relación laboral ni contractual.' : 'Our team will review your details and your test result and contact you if there is a fit. Submitting an application does not create an employment or contracting relationship.']),
        text: es ? `Hola ${name},\n\nHaga la prueba de habilidades de ${questions} preguntas (unos ${minutes} minutos, un intento por oficio): ${testUrl}\n\nEnviar una solicitud no crea una relación laboral ni contractual.` : `Hi ${name},\n\nPlease take the ${questions}-question skills test for your trade (about ${minutes} minutes, one attempt per trade): ${testUrl}\n\nSubmitting an application does not create an employment or contracting relationship.`
      });
    },
    holidayGreeting: ({ name, greeting, wish, intro, sale, ctaUrl, unsubscribeUrl, address }) => {
      const hello = String(name || '').trim().split(/\s+/)[0] || 'friend';
      const paras = [`${esc(greeting)}, ${esc(hello)}! ${esc(wish)}`, ...(intro ? rich(intro) : [])];
      const saleHtml = sale ? details([['Your holiday offer', `${sale.pct}% off your project`], ['Use code', sale.code], ['Good through', sale.until]]) + paragraphs([`Mention the code when you request your free estimate and we will apply the discount. Valid on new bathroom, tile and handyman projects; cannot be combined with other offers.`]) + button(ctaUrl, 'Request my free estimate') : '';
      const foot = `You are receiving this because you have worked with or contacted ${brand.name}. ${address ? esc(address) + '. ' : ''}<a href="${esc(unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a> from holiday messages.`;
      return make({
        subject: sale ? `${greeting} from Budget Bath Solutions: ${sale.pct}% off through ${sale.until}` : `${greeting} from Budget Bath Solutions`,
        preheader: sale ? `${sale.pct}% off with code ${sale.code}` : wish, heading: `${greeting}!`,
        htmlBody: paragraphs(paras) + saleHtml + paragraphs([`With gratitude,<br>Your friends at ${brand.name}`]), footnote: foot,
        text: `${greeting}, ${hello}! ${wish}\n\n${intro ? intro + '\n\n' : ''}${sale ? `Your holiday offer: ${sale.pct}% off your project with code ${sale.code}, good through ${sale.until}.\nRequest your free estimate: ${ctaUrl}\n\n` : ''}With gratitude,\nYour friends at ${brand.name}\n\nUnsubscribe: ${unsubscribeUrl}`
      });
    },
    leadAlert: ({ submission }) => {
      const label = { project: 'Estimate request', work: 'Work-with-us application', question: 'Community question', callback: 'Free estimate callback request' }[submission.type] || 'Website message';
      return make({
        subject: `${label}: ${submission.name}`, preheader: `${submission.location} - ${submission.interest}`, heading: label,
        htmlBody: details([['Name', submission.name], ['Email', submission.email], ['Phone', submission.phone], ['County', submission.location], ['Interest / role', submission.interest], ['Message', submission.message], ['Received', submission.receivedAt]]),
        text: `${label}\n\nName: ${submission.name}\nEmail: ${submission.email}\nPhone: ${submission.phone}\nCounty: ${submission.location}\nInterest: ${submission.interest}\n\n${submission.message}`
      });
    }
  };
  // Spanish versions of the customer-facing account emails. Used when the account or sign-up language is Spanish.
  const ignoreEs = 'Si no esperaba este correo, puede ignorarlo sin problema.';
  const es = (make => ({
    verifyEmail: ({ name, url }) => make({
      subject: 'Confirme su correo electrónico', preheader: 'Un paso rápido para activar su cuenta gratuita.', heading: `¡Bienvenido, ${name}!`,
      htmlBody: paragraphs(['Gracias por crear una cuenta gratuita de Budget Bath Solutions. Confirme su correo para enviarnos los detalles y fotos de su proyecto.']) + button(url, 'Confirmar mi correo') + paragraphs([`Este enlace vence en 24 horas. Si el botón no funciona, copie esta dirección en su navegador:<br><span style="word-break:break-all;color:${brand.brass};">${esc(url)}</span>`]),
      footnote: ignoreEs, text: `¡Bienvenido, ${name}!\n\nConfirme su correo para activar su cuenta gratuita:\n${url}\n\nEste enlace vence en 24 horas. ${ignoreEs}`
    }),
    accountExists: ({ name, loginUrl, resetUrl }) => make({
      subject: 'Ya tiene una cuenta', preheader: 'Alguien intentó registrarse con este correo.', heading: 'Ya tiene una cuenta',
      htmlBody: paragraphs([`Hola ${esc(name)}, alguien intentó crear una cuenta con este correo, pero usted ya tiene una.`]) + button(loginUrl, 'Iniciar sesión') + paragraphs([`¿Olvidó su contraseña? <a href="${esc(resetUrl)}" style="color:${brand.brass};">Restablézcala aquí</a>.`]),
      footnote: ignoreEs, text: `Hola ${name},\n\nAlguien intentó crear una cuenta con este correo, pero usted ya tiene una.\nIniciar sesión: ${loginUrl}\nRestablecer contraseña: ${resetUrl}\n\n${ignoreEs}`
    }),
    welcome: ({ name, dashboardUrl }) => make({
      subject: 'Su cuenta está lista', preheader: 'Cuéntenos sobre su proyecto y suba fotos.', heading: 'Su correo está confirmado',
      htmlBody: paragraphs([`Hola ${esc(name)}, su cuenta gratuita está lista. Describa lo que busca y suba fotos de su espacio para que entendamos su proyecto antes de hablar.`]) + button(dashboardUrl, 'Iniciar una solicitud de proyecto'),
      text: `Hola ${name},\n\nSu cuenta está lista. Inicie una solicitud de proyecto aquí:\n${dashboardUrl}`
    }),
    passwordReset: ({ name, url }) => make({
      subject: 'Restablezca su contraseña', preheader: 'Use este enlace dentro de una hora.', heading: 'Restablezca su contraseña',
      htmlBody: paragraphs([`Hola ${esc(name)}, recibimos una solicitud para restablecer su contraseña.`]) + button(url, 'Elegir una contraseña nueva') + paragraphs(['Este enlace vence en 1 hora y solo se puede usar una vez.']),
      footnote: `${ignoreEs} Su contraseña no cambiará.`, text: `Hola ${name},\n\nRestablezca su contraseña (el enlace vence en 1 hora):\n${url}\n\n${ignoreEs} Su contraseña no cambiará.`
    }),
    passwordChanged: ({ name, loginUrl }) => make({
      subject: 'Su contraseña fue cambiada', preheader: 'La contraseña de su cuenta acaba de actualizarse.', heading: 'Contraseña cambiada',
      htmlBody: paragraphs([`Hola ${esc(name)}, la contraseña de su cuenta acaba de cambiarse y se cerró la sesión en los demás dispositivos.`, 'Si no fue usted, restablezca su contraseña de inmediato o contáctenos.']) + button(loginUrl, 'Iniciar sesión'),
      text: `Hola ${name},\n\nSu contraseña acaba de cambiarse y se cerró la sesión en otros dispositivos. Si no fue usted, restablézcala de inmediato: ${loginUrl}`
    }),
    requestReceived: ({ name, request, photoCount, requestUrl }) => make({
      subject: 'Recibimos su solicitud de proyecto', preheader: 'Revisaremos sus detalles y nos comunicaremos pronto.', heading: 'Recibimos su solicitud',
      htmlBody: paragraphs([`Hola ${esc(name)}, gracias por enviarnos su proyecto. Nuestro equipo revisará sus detalles${photoCount ? ' y fotos' : ''} y le contactará para hablar de los siguientes pasos.`]) + details([['Proyecto', request.title], ['Tipo', request.project_type], ['Condado', request.location], ['Fotos', String(photoCount)]]) + button(requestUrl, 'Ver su solicitud'),
      text: `Hola ${name},\n\nRecibimos su solicitud de proyecto "${request.title}" (${photoCount} foto${photoCount === 1 ? '' : 's'}). La revisaremos y le contactaremos.\n\nVéala: ${requestUrl}`
    })
  }))(makeEs);
  for (const [name, spanish] of Object.entries(es)) {
    const english = templates[name];
    templates[name] = args => (args && args.lang === 'es' ? spanish(args) : english(args));
  }
  return templates;
}

module.exports = { createTemplates };
