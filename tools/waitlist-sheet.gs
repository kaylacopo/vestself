/**
 * Vest Self — waitlist signup log.
 *
 * Deployed as a Google Apps Script Web App bound to the signups spreadsheet.
 * The landing page POSTs every waitlist submission here so the sheet is the
 * permanent source of truth; Web3Forms still sends the email notification and
 * acts as the backup record if a browser request never arrives.
 *
 * ── One-time setup ────────────────────────────────────────────────────────
 *  1. Create a Google Sheet ("Vest Self — Waitlist").
 *  2. Extensions → Apps Script. Delete the stub, paste this file, save.
 *  3. Run `setup` once and grant the permission prompt. This creates the
 *     "Signups" tab with headers.
 *  4. Deploy → New deployment → type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone            ← required; the page posts anonymously
 *  5. Copy the /exec URL and put it in SHEET_ENDPOINT in js/app.js.
 *
 * After ANY edit here you must Deploy → Manage deployments → Edit → Version
 * "New version". Saving alone does not update the live endpoint.
 *
 * ── Note on access ────────────────────────────────────────────────────────
 * "Anyone" means the URL is an unauthenticated write endpoint, and it is
 * visible in the page's JavaScript. That is the same trust model as the
 * Web3Forms access key already in the markup. The guards below (email shape,
 * honeypot, payload cap, per-minute throttle) keep casual abuse out; they are
 * not a defence against someone deliberately targeting the endpoint. The cost
 * of abuse here is junk rows in a sheet, which is recoverable.
 *
 * The endpoint is WRITE-ONLY BY DESIGN. It never returns sheet contents, row
 * counts, or whether a given email exists. Reading the signup list requires
 * access to the spreadsheet itself, which stays private to Kayla's account.
 * Subscribers' email addresses must never be exposed publicly — the site repo
 * is public, so signup data lives only in the Sheet, never in the repo.
 */

const SHEET_NAME = 'Signups';

const HEADERS = [
  'Timestamp',      // server-side, not the browser clock
  'Email',
  'Goal',           // reserved — the form does not collect this yet
  'Source',
  'Medium',
  'Campaign',
  'Referrer',
  'Landing page',
  'Form',           // which form on the page: Hero or Join CTA
  'Duplicate',      // TRUE if this email already appears above
  'User agent'
];

/** Run once from the editor to create and format the tab. */
function setup() {
  const sheet = getSheet_();
  SpreadsheetApp.getActive().toast('Sheet ready: ' + sheet.getName());
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#111111')
      .setFontColor('#e6c15a');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);  // Timestamp
    sheet.setColumnWidth(2, 240);  // Email
    sheet.setColumnWidth(3, 260);  // Goal
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check. Deliberately returns nothing but { ok: true } — no row count,
 * no data. The endpoint URL is public (it sits in the landing page's JS), so
 * anything returned here is readable by anyone who finds it.
 */
function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: 'empty body' });
    }
    // Cap the payload before parsing so a huge body can't tie up the script.
    if (e.postData.contents.length > 4000) {
      return json_({ ok: false, error: 'payload too large' });
    }

    const data = JSON.parse(e.postData.contents);

    // Honeypot: the form's hidden checkbox should always be empty.
    if (data.botcheck) return json_({ ok: true, skipped: 'honeypot' });

    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      return json_({ ok: false, error: 'invalid email' });
    }

    if (isThrottled_()) return json_({ ok: false, error: 'rate limited' });

    // Serialise appends — two people submitting at once must not collide.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return json_({ ok: false, error: 'busy' });

    try {
      const sheet = getSheet_();
      const duplicate = emailExists_(sheet, email);

      sheet.appendRow([
        new Date(),
        email,
        str_(data.goal, 500),
        str_(data.source, 120),
        str_(data.medium, 120),
        str_(data.campaign, 120),
        str_(data.referrer, 500),
        str_(data.landing, 500),
        str_(data.form, 60),
        duplicate,
        str_(data.ua, 400)
      ]);

      // Return nothing about the sheet's contents. Echoing the duplicate flag
      // would turn this public endpoint into an email-enumeration oracle:
      // anyone could POST an address and learn whether that person signed up.
      return json_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Never throw: an Apps Script exception returns an HTML error page, which
    // is far harder to diagnose from the browser than a JSON error.
    return json_({ ok: false, error: String(err) });
  }
}

function str_(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

/**
 * Duplicate signups are RECORDED, never dropped. An earlier version of the
 * landing page silently skipped repeat submissions and lost real re-signups
 * (see commit 45c7a95); this flags them instead so the row still exists.
 */
function emailExists_(sheet, email) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const values = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === email) return true;
  }
  return false;
}

/** Crude global throttle: at most 30 writes per rolling minute. */
function isThrottled_() {
  const cache = CacheService.getScriptCache();
  const key = 'wl_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n > 30;
}
