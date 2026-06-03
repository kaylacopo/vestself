(function () {
  // Header hides on scroll-down past 120px, returns on scroll-up.
  var header = document.querySelector('.header');
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y > lastY && y > 120) header.classList.add('hidden');
    else header.classList.remove('hidden');
    lastY = y;
  }, { passive: true });

  // Reveal-on-scroll for [data-reveal] elements.
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });

  // Waitlist: validate, submit to Web3Forms, dedupe, swap to success card.
  var KEY = 'vestself.waitlist';
  function getList() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }

  function showSuccess(form, email) {
    var list = getList();
    if (list.indexOf(email) === -1) { list.push(email); localStorage.setItem(KEY, JSON.stringify(list)); }
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

      // Already joined from this browser — show success without re-submitting.
      if (getList().indexOf(email) !== -1) { showSuccess(form, email); return; }

      var btn = form.querySelector('button[type=submit]');
      var errEl = form.parentElement.querySelector('[data-error]');
      var label = btn.textContent;

      submitting = true;
      btn.disabled = true;
      btn.textContent = 'Joining…';
      if (errEl) errEl.classList.remove('show');

      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      })
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.success) {
            showSuccess(form, email);
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
