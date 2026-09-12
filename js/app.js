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
    var note = form.parentElement.querySelector('[data-goal-note]');
    form.style.display = 'none';
    if (note) note.hidden = true;
    if (success) success.classList.add('show');
  }

  // ---------------------------------------------------------------------
  // Hero goal step
  //
  // The HERO form only (marked [data-goal-flow]) asks for a goal before the
  // email. The bottom CTA stays a plain one-field email form on purpose, so
  // anyone who just wants in can skip straight past the goal — the two forms
  // are deliberately NOT identical any more. See CLAUDE.md.
  //
  // The goal input is an ARIA combobox over a fixed local list: suggestions
  // appear on focus and narrow as the user types. It is a suggestion list, not
  // a picker — any free text is accepted and submitted as typed.
  // ---------------------------------------------------------------------

  var GOALS = [
    'Run a 5K', 'Run a 10K', 'Run a half marathon', 'Run a marathon',
    'Run an ultramarathon', 'Run every morning', 'Finish a triathlon',
    'Do 50 push-ups in a row', 'Do 10 pull-ups in a row', 'Do a handstand',
    'Squat my bodyweight', 'Deadlift 100kg', 'Bench press my bodyweight',
    'Go to the gym 4 times a week', 'Get to 12% body fat', 'Lose 10kg',
    'Gain 5kg of muscle', 'Hold a 3-minute plank', 'Touch my toes',
    'Swim 1km without stopping', 'Cycle 100km in a day', 'Climb a 6b route',
    'Walk 10,000 steps a day', 'Hike a long-distance trail',
    'Sleep 8 hours a night', 'Wake up at 6am every day', 'Quit smoking',
    'Go sober for 90 days', 'Cut out alcohol for a year',
    'Drink 2 litres of water a day', 'Meditate every day',
    'Stop doom-scrolling', 'Cut my screen time in half',
    'Cook at home 5 nights a week',
    'Ship my side project', 'Launch my startup', 'Get my first 100 customers',
    'Land a new job', 'Get promoted this year', 'Go freelance',
    'Build my portfolio', 'Give a conference talk',
    'Grow my newsletter to 1,000 readers', 'Post on LinkedIn every week',
    'Learn Spanish', 'Learn to code', 'Learn guitar', 'Learn to play piano',
    'Learn to swim', 'Learn to drive', 'Learn to cook 10 dishes',
    'Read 24 books this year', 'Read every day', 'Finish my degree',
    'Pass my exams', 'Get a certification',
    'Write a novel', 'Write every morning', 'Finish my album',
    'Release a song', 'Draw every day', 'Take a photo every day',
    'Start a podcast', 'Make a short film',
    'Save my first 10k', 'Build a 6-month emergency fund', 'Pay off my debt',
    'Start investing monthly', 'Stick to a monthly budget',
    'Travel to Japan', 'Move to a new city', 'Call my family every week',
    'Make three new friends', 'Plan my wedding'
  ];

  // Shown before the user types anything. Shuffled per page load so the hero
  // does not always open on the same five goals.
  var POPULAR = (function () {
    var seed = [
      'Run a half marathon', 'Ship my side project', 'Learn Spanish',
      'Read 24 books this year', 'Lose 10kg', 'Wake up at 6am every day',
      'Write a novel', 'Save my first 10k', 'Meditate every day', 'Launch my startup'
    ];
    for (var i = seed.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = seed[i]; seed[i] = seed[j]; seed[j] = t;
    }
    return seed;
  })();

  var MAX_SUGGESTIONS = 5;

  function escapeHtml(v) {
    return v.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Strip the lead-ins people type before the goal itself, so "I want to run a"
  // still matches the "Run a ..." entries.
  function normaliseQuery(v) {
    return v.toLowerCase().trim()
      .replace(/^(i want to|i wanna|i'd like to|i would like to|my goal is to|my goal is)\s+/, '');
  }

  // Does `needle` start a word inside `hay`? Keeps "marathon" matching
  // "Run a marathon" without "athon" matching anything.
  function startsWord(hay, needle) {
    var i = hay.indexOf(needle);
    while (i !== -1) {
      if (i === 0 || /[\s(]/.test(hay.charAt(i - 1))) return true;
      i = hay.indexOf(needle, i + 1);
    }
    return false;
  }

  function suggestFor(query) {
    if (!query) return POPULAR.slice(0, MAX_SUGGESTIONS);

    var tokens = query.split(/\s+/).filter(Boolean);
    var hits = [];

    for (var i = 0; i < GOALS.length; i++) {
      var goal = GOALS[i], low = goal.toLowerCase(), score = -1;

      if (low.indexOf(query) === 0) score = 0;          // "run a" -> "Run a marathon"
      else if (startsWord(low, query)) score = 1;       // "marathon" -> "Run a marathon"
      else if (low.indexOf(query) !== -1) score = 2;    // anywhere
      else if (tokens.length > 1) {                     // "learn spain" style, all words present
        var all = true;
        for (var t = 0; t < tokens.length; t++) {
          if (!startsWord(low, tokens[t])) { all = false; break; }
        }
        if (all) score = 3;
      }

      if (score !== -1) hits.push({ goal: goal, score: score, order: i });
    }

    hits.sort(function (a, b) { return a.score - b.score || a.order - b.order; });
    return hits.slice(0, MAX_SUGGESTIONS).map(function (h) { return h.goal; });
  }

  function setupGoalCombo(form) {
    var input = form.querySelector('input[name=goal]');
    var list = form.querySelector('.goal-suggest');
    var status = form.querySelector('[data-goal-status]');
    if (!input || !list) return null;

    var items = [];
    var active = -1;

    function close() {
      if (list.hidden) return;
      list.hidden = true;
      list.innerHTML = '';
      items = [];
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function highlight(goal, query) {
      if (!query) return escapeHtml(goal);
      var at = goal.toLowerCase().indexOf(query);
      if (at === -1) return escapeHtml(goal);
      return escapeHtml(goal.slice(0, at)) +
        '<b>' + escapeHtml(goal.slice(at, at + query.length)) + '</b>' +
        escapeHtml(goal.slice(at + query.length));
    }

    function setActive(next) {
      if (active > -1 && items[active]) items[active].setAttribute('aria-selected', 'false');
      active = next;
      if (active > -1 && items[active]) {
        items[active].setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', items[active].id);
        if (items[active].scrollIntoView) items[active].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function accept(goal) {
      input.value = goal;
      close();
      input.focus();
    }

    function open() {
      var query = normaliseQuery(input.value);
      var results = suggestFor(query);

      // An exact match is not worth offering back to the user.
      if (results.length === 1 && results[0].toLowerCase() === query) results = [];

      if (!results.length) { close(); return; }

      list.innerHTML = '';
      items = results.map(function (goal, i) {
        var li = document.createElement('li');
        li.id = 'goal-opt-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.innerHTML = highlight(goal, query);
        // mousedown, not click: it fires before blur, so the list is still open.
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); accept(goal); });
        list.appendChild(li);
        return li;
      });

      active = -1;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
      if (status) status.textContent = results.length + ' suggestions available.';
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', open);

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (list.hidden) { open(); if (list.hidden) return; }
        var step = ev.key === 'ArrowDown' ? 1 : -1;
        var n = items.length;
        setActive(active === -1 ? (step === 1 ? 0 : n - 1) : (active + step + n) % n);
      } else if (ev.key === 'Enter') {
        // Never let Enter submit from step 1 — it would post an empty email.
        ev.preventDefault();
        if (!list.hidden && active > -1) accept(items[active].textContent);
        else form.dispatchEvent(new CustomEvent('goal:advance'));
      } else if (ev.key === 'Escape') {
        if (!list.hidden) { ev.stopPropagation(); close(); }
      } else if (ev.key === 'Tab') {
        close();
      }
    });

    input.addEventListener('blur', function () { window.setTimeout(close, 120); });

    return { input: input, close: close };
  }

  document.querySelectorAll('form[data-goal-flow]').forEach(function (form) {
    var combo = setupGoalCombo(form);
    var goalStep = form.querySelector('[data-step=goal]');
    var emailStep = form.querySelector('[data-step=email]');
    var note = form.parentElement.querySelector('[data-goal-note]');
    var back = note && note.querySelector('[data-goal-back]');
    var next = form.querySelector('[data-goal-next]');
    if (!combo || !goalStep || !emailStep) return;

    function nudge(el) {
      el.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
        { duration: 260 }
      );
    }

    function advance() {
      var goal = combo.input.value.trim();
      if (goal.length < 3) { combo.close(); combo.input.focus(); nudge(goalStep.querySelector('.field')); return; }
      combo.input.value = goal;
      combo.close();
      goalStep.hidden = true;
      emailStep.hidden = false;
      if (note) note.hidden = false;
      emailStep.querySelector('input[type=email]').focus();
    }

    if (next) next.addEventListener('click', advance);
    form.addEventListener('goal:advance', advance);

    if (back) back.addEventListener('click', function () {
      emailStep.hidden = true;
      note.hidden = true;
      goalStep.hidden = false;
      combo.input.focus();
    });
  });

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
