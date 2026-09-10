/**
 * Vest Self -- waitlist signup log.
 *
 * Deployed as a Google Apps Script Web App bound to the signups spreadsheet.
 * The landing page POSTs every waitlist submission here so the sheet is the
 * permanent source of truth; Web3Forms still sends the email notification and
 * acts as the backup record if a browser request never arrives.
 *
 * -- One-time setup ------------------------------------------------------------
 *  1. Create a Google Sheet ("Vest Self -- Waitlist").
 *  2. Extensions -> Apps Script. Delete the stub, paste this file, save.
 *  3. Run `setup` once and grant the permission prompt. This creates the
 *     "Signups" tab with headers.
 *  4. Deploy -> New deployment -> type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone            <-- required; the page posts anonymously
 *  5. Copy the /exec URL and put it in SHEET_ENDPOINT in js/app.js.
 *
 * After ANY edit here you must Deploy -> Manage deployments -> Edit -> Version
 * "New version". Saving alone does not update the live endpoint.
 *
 * -- Note on access ------------------------------------------------------------
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
 * Subscribers' email addresses must never be exposed publicly -- the site repo
 * is public, so signup data lives only in the Sheet, never in the repo.
 */

const SHEET_NAME = 'Signups';

// Kept to what actually carries information. Medium, Campaign, Form, Referrer,
// landing page, user agent and Goal were all dropped as noise or permanently blank.
// Source keeps the part that matters (instagram / linkedin / direct / website).
const HEADERS = ['#', 'Date', 'Email', 'Source'];

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
    sheet.setColumnWidth(1, 50);   // #
    sheet.setColumnWidth(2, 170);  // Date
    sheet.setColumnWidth(3, 260);  // Email
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check. Deliberately returns nothing but { ok: true } -- no row count,
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

    // Serialise appends -- two people submitting at once must not collide.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return json_({ ok: false, error: 'busy' });

    try {
      // Repeat signups are still RECORDED as their own row, never skipped -- an
      // earlier landing page silently dropped genuine re-signups (see 45c7a95).
      //
      // Written positionally rather than with appendRow, because column A is a
      // running number that has to be computed. Founders and the section labels
      // above carry no number, so they are skipped automatically.
      const sheet = getSheet_();
      const row = sheet.getLastRow() + 1;
      sheet.getRange(row, 1, 1, 4).setValues([[
        nextNumber_(sheet),
        new Date(),
        email,
        str_(data.source, 120)
      ]]);

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

/**
 * Next waitlist number. Scans column A for the highest number already used, so
 * anything unnumbered -- the FOUNDERS block, the section labels, blank spacers --
 * is ignored. Deleting a row leaves a gap in the sequence rather than renumbering,
 * which is the safer failure: numbers already given out never change meaning.
 */
function nextNumber_(sheet) {
  const last = sheet.getLastRow();
  if (last < 1) return 1;
  const values = sheet.getRange(1, 1, last, 1).getValues();
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    if (typeof v === 'number' && isFinite(v) && v > max) max = v;
  }
  return max + 1;
}

function str_(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

/** Crude global throttle: at most 30 writes per rolling minute. */
function isThrottled_() {
  const cache = CacheService.getScriptCache();
  const key = 'wl_' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n > 30;
}
