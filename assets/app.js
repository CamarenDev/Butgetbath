document.querySelectorAll('form[data-form]').forEach(form => {
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    const button = form.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    button.disabled = true;
    status.className = 'form-status mt-3 text-muted';
    status.textContent = 'Sending...';
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Something went wrong.');
      window.location.assign('/thank-you/');
    } catch (error) {
      status.className = 'form-status mt-3 alert alert-danger';
      status.textContent = error.message;
      button.disabled = false;
    }
  });
});
