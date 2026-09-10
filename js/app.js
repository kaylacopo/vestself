(function () {
  // Header: transparent at the top, solid once scrolled; hides on scroll-down past 120px.
  var header = document.querySelector('.header');
  var lastY = window.scrollY;
  function syncHeader() {
    var y = window.scrollY;
    if (y > lastY && y > 120) header.classList.add('hidden');
    else header.classList.remove('hidden');
    header.classList.toggle('scrolled', y > 8);
    lastY = y;
  }
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  // Reveal-on-scroll for [data-reveal] elements.
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });

  // ---------------------------------------------------------------------
  // Waitlist
  //
  // Every submission goes to two places:
  //   1. Web3Forms  — sends the email notification. Drives the success UI.
  //   2. SHEET_ENDPOINT — an Apps Script web app that appends a row to the
  //      Google Sheet, which is the permanent record. Web3Forms only keeps
  //      submissions for 30 days, so the sheet is the source of truth.
  //
  // The sheet write is best-effort and never blocks the user: if it fails,
  // the Web3Forms email still exists as a fallback record of the signup.
  // See tools/waitlist-sheet.gs for the receiving script and its setup.
  // ---------------------------------------------------------------------

  // Apps Script /exec URL. Until this is set, signups still reach Web3Forms
  // and nothing user-facing breaks — only the sheet logging is inactive.
  var SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzNp-nAJb4ZMHQB2FY5M34cAoynWatAICkJRWCiCe3tRUjbTiYP16eOJ9JZnK_awrhKhw/exec';

  // Where did this visitor come from? UTM tags win; otherwise infer from the
  // referrer, since links shared in DMs and apps rarely carry tags.
  function acquisition() {
    var p = new URLSearchParams(location.search);
    var ref = document.referrer || '';
    var host = '';
    try { host = ref ? new URL(ref).hostname.replace(/^www\./, '') : ''; } catch (e) {}

    var known = {
      'instagram.com': 'instagram', 'l.instagram.com': 'instagram',
      'linkedin.com': 'linkedin', 'lnkd.in': 'linkedin',
      'tiktok.com': 'tiktok', 'threads.com': 'threads', 'threads.net': 'threads',
      'facebook.com': 'facebook', 'l.facebook.com': 'facebook',
      't.co': 'twitter', 'x.com': 'twitter',
      'google.com': 'google', 'bing.com': 'bing',
      'web.whatsapp.com': 'whatsapp'
    };

    return {
      source: p.get('utm_source') || known[host] || host || 'direct',
      medium: p.get('utm_medium') || (host ? 'referral' : 'direct'),
      campaign: p.get('utm_campaign') || '',
      referrer: ref,
      landing: location.pathname + location.search
    };
  }

  // First touch wins — remember how they arrived, not where they were when
  // they happened to submit.
  var ACQ = (function () {
    try {
      var saved = sessionStorage.getItem('vestself.acq');
      if (saved) return JSON.parse(saved);
      var fresh = acquisition();
      sessionStorage.setItem('vestself.acq', JSON.stringify(fresh));
      return fresh;
    } catch (e) {
      return acquisition(); // private mode, blocked storage — still capture it
    }
  })();

  function logToSheet(form, email) {
    if (!SHEET_ENDPOINT) return;

    var section = form.closest('[data-screen-label]');
    var goalField = form.querySelector('[name=goal]'); // not collected yet

    var payload = {
      email: email,
      goal: goalField ? goalField.value : '',
      source: ACQ.source,
      medium: ACQ.medium,
      campaign: ACQ.campaign,
      referrer: ACQ.referrer,
      landing: ACQ.landing,
      form: section ? section.dataset.screenLabel : '',
      ua: navigator.userAgent,
      botcheck: form.querySelector('[name=botcheck]:checked') ? 1 : 0
    };

    // text/plain keeps this a CORS-simple request (no preflight, which Apps
    // Script does not answer). keepalive lets it finish if the page unloads.
    fetch(SHEET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () {
      // Swallowed on purpose: the signup already succeeded via Web3Forms and
      // the user must not see an error for a logging failure.
    });
  }

  function showSuccess(form) {
    var success = form.parentElement.querySelector('[data-success]');
    form.style.display = 'none';
    if (success) success.classList.add('show');
  }

  document.querySelectorAll('form[data-waitlist]').forEach(function (form) {
    var submitting = false;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (submitting) return; // guard against duplicate submissions

      var input = form.querySelector('input[type=email]');
      var email = (input.value || '').trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        input.focus();
        form.querySelector('.field').animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 260 }
        );
        return;
      }

      input.value = email; // normalise before FormData reads it

      var btn = form.querySelector('button[type=submit]');
      var errEl = form.parentElement.querySelector('[data-error]');
      var label = btn.textContent;

      submitting = true;
      btn.disabled = true;
      btn.textContent = 'Joining…';
      if (errEl) errEl.classList.remove('show');

      var payload = new FormData(form);
      payload.append('source', ACQ.source);
      payload.append('campaign', ACQ.campaign || '—');
      payload.append('referrer', ACQ.referrer || 'direct');

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: payload
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.success) {
            logToSheet(form, email);
            showSuccess(form);
          } else {
            throw new Error((json && json.message) || 'Submission failed');
          }
        })
        .catch(function () {
          submitting = false;
          btn.disabled = false;
          btn.textContent = label;
          if (errEl) errEl.classList.add('show');
        });
    });
  });
})();
