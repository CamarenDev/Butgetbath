// Handyman application form: posts JSON to /api/applications.
(() => {
  const form = document.querySelector('form[data-apply]');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const tradesError = form.querySelector('[data-trades-error]');
  const show = (kind, message) => {
    status.className = `form-status mt-3 alert alert-${kind}`;
    status.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    status.textContent = message;
  };
  const yesNo = value => (value === 'Yes' ? 'yes' : value === 'No' ? 'no' : '');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const trades = data.getAll('trades');
    tradesError.hidden = trades.length > 0;
    const valid = window.bbsValidation ? window.bbsValidation.validate(form) : form.checkValidity();
    if (!valid || !trades.length) {
      form.classList.add('was-validated');
      show('danger', 'Please complete the required fields. Your application is still here.');
      if (valid && !trades.length) {
        tradesError.setAttribute('role', 'alert');
        form.querySelector('[name="trades"]').focus();
      }
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const body = { trades, lang: localStorage.getItem('bbs-lang') === 'es' ? 'es' : 'en', consent: true, over18: form.over18.checked ? 'yes' : '' };
    for (const key of ['name', 'email', 'phone', 'city', 'years', 'availability', 'licenseDetails', 'insuranceDetails', 'desiredRate', 'tools', 'experience', 'references', 'website']) body[key] = String(data.get(key) || '').trim();
    for (const key of ['licensed', 'insured', 'ownTools', 'ownVehicle', 'workAuthorized']) body[key] = yesNo(data.get(key));
    try {
      const response = await fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'We could not send your application. Please try again.');
      form.reset();
      form.classList.remove('was-validated');
      form.querySelectorAll('[aria-invalid]').forEach(window.bbsValidation ? window.bbsValidation.clearError : () => {});
      if (result.testToken) { location.href = `/handyman-application/test/?token=${encodeURIComponent(result.testToken)}`; return; }
      show('success', 'Thank you! We received your application and sent a confirmation to your email.');
    } catch (error) {
      show('danger', `${error.message} Your application has not been cleared; you can try again.`);
    } finally {
      button.disabled = false;
    }
  });
})();
