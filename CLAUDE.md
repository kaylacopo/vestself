# Vest Self — waitlist landing page

Static marketing site for the Vest Self private beta waitlist.
Production: **https://www.vestself.app** (apex 308-redirects to www) · Vercel deploy: https://vestself.vercel.app

## Stack

Deliberately dependency-free: hand-written HTML/CSS/JS. No framework, no bundler,
no npm, no build step. `index.html` is served exactly as it sits on disk.

Keep it that way unless there is a strong reason — the entire site is four source files:

| File | Role |
|---|---|
| `index.html` | The whole page, single file |
| `css/tokens.css` | Design system — source of truth |
| `css/styles.css` | Page and component styles |
| `js/app.js` | Header scroll, reveal-on-scroll, waitlist submit |

## Run locally

No install step. Static server on port 4321:

```bash
python3 -m http.server 4321
```

## Design system

`css/tokens.css` is the source of truth, derived from the "VS Brand & UI Guide" (2026).

**Never hardcode a hex value in `styles.css` or `index.html`.** Use the tokens.

- Gold-led and dark-first — `--bg` is `--void` (`#0A0A0F`). A warm-light surface
  variant is available via `.surface-light` or `[data-theme="light"]`.
- Type is Satoshi, self-hosted from `assets/fonts/*.otf`. **No 600 "Semibold" file
  was supplied**, so `Satoshi-Bold.otf` deliberately covers the 600–700 range via
  `font-weight: 600 700`. That is intentional — don't "fix" it.
- Semantic type classes (`.t-hero`, `.t-h1`, `.t-body`, …) already handle the
  desktop→mobile step-down at 640px. Prefer them over ad-hoc `font-size`.
- `.neon-blur` / `.neon-photo` are the signature card treatment. The rule is that it
  is never a single standalone colour — the bloom (purple → magenta → orange → gold)
  rises from the bottom edge and dissolves up into the card surface.
- Gradient rules: corner-anchored, single-hue per surface, fades to `--void`,
  no hard stops, never a full-page background.
- Some tokens are marked provisional in comments — `--danger-500` (the guide has no
  red) and the four named usage gradients (`--grad-energy`, `--grad-focus`,
  `--grad-growth`, `--grad-discipline`, pending page-16 artwork). Confirm with Kayla
  before leaning on those.

## The waitlist form — read this before touching it

Every submission goes to **two** places:

1. **Web3Forms** — sends the email notification, and drives the success UI. The
   submission only counts as successful if this call succeeds.
2. **A Google Sheet**, via the Apps Script web app in `tools/waitlist-sheet.gs`. This
   is the **permanent source of truth** — Web3Forms only retains submissions for 30
   days. The endpoint lives in `SHEET_ENDPOINT` at the top of `js/app.js`.

The sheet write is deliberately **best-effort and non-blocking**: it never gates the
success UI, and its failures are swallowed. If it fails, the Web3Forms email is still
a complete record of the signup, because the acquisition data is appended to that
submission too. A logging outage must never cost the user their signup.

If `SHEET_ENDPOINT` is empty the page still works normally — only sheet logging is
inactive. Setup steps are in the header comment of `tools/waitlist-sheet.gs`.

### Privacy — this repo is public, subscriber emails are not

Signup data lives **only** in the Sheet, which is private to Kayla's Google account
(owner-only, no link sharing). It must never enter this repo — `.gitignore` blocks
CSVs as a second line of defence, and exports belong in `~/vest-self-private/`.

The Apps Script endpoint URL is public by necessity (it sits in `js/app.js`), so the
endpoint is **write-only by design**: it returns `{ok:true}` and nothing else. It does
not report row counts, sheet contents, or whether a given email already exists.

That last point matters — an earlier version echoed a `duplicate` flag back to the
caller, which turned the public endpoint into an **email-enumeration oracle**: anyone
could POST an address and learn whether that person was on the waitlist. Duplicates
are still recorded in the sheet's `Duplicate` column; they are just never disclosed in
the response. **Do not add data to the endpoint's response.**

### Sheet layout

`Signups` tab, columns: **Timestamp · Email · Source · Medium · Campaign · Form**.
Referrer, landing page, user agent, goal and the duplicate flag were dropped as noise
in Sept 2026. Adding a column back means editing `HEADERS` **and** `appendRow` in
`tools/waitlist-sheet.gs` together, or rows land misaligned.

**Founders sit at the top (rows 2-5) with `Source = founder`** — Kayla, Rafa,
gonegarnergonest@, hello@vestself.app. They are at the top deliberately:
`appendRow` writes to the bottom, so a block at the top is never disturbed, whereas a
block at the bottom would end up stranded mid-table after the first new signup.

`I1` holds the live count, `=COUNTA(B2:B)-COUNTIF(C2:C,"founder")`, which is why the
founder marker matters. Keep stray notes out of column B or the count drifts.

### Redeploying the script

Editing the Apps Script and saving does **not** change what the live `/exec` URL runs —
a web app deployment is pinned to a version. After any edit: Deploy → Manage
deployments → pencil → Version → **New version** → Deploy. The URL stays the same, so
`js/app.js` needs no change. Forgetting this is silent: the sheet keeps taking writes
in the old shape.

Acquisition source is captured on **first touch** and kept in `sessionStorage`, so it
records how someone arrived rather than where they were when they submitted. UTM tags
win; otherwise the referrer host is mapped to a known name (instagram, linkedin,
tiktok…), falling back to `direct`.

There is still no backend and no build step — the Apps Script runs on Google's side.

The form markup is **duplicated in two places** — the hero (`index.html:65`) and the
bottom CTA (`index.html:203`). Both are bound by the `form[data-waitlist]` selector in
`js/app.js`. **If you change one, change the other.** They must stay identical.

The `access_key` visible in the markup is a Web3Forms *public* key. It is designed to
be client-side and is not a leaked secret.

### Do not reintroduce the localStorage dedupe

An earlier version cached submitted emails in `localStorage` under `vestself.waitlist`
and skipped the network call on a repeat entry — which silently dropped genuine
re-signups while still showing them a success card. It was removed in `45c7a95`.

The in-flight `submitting` guard already prevents double-click duplicates.
Do not add client-side dedupe back.

The same rule governs the sheet: `waitlist-sheet.gs` **records** repeat signups and
flags them in a `Duplicate` column rather than dropping them.

## Deploy

Vercel, connected to GitHub. **Pushing to `main` deploys straight to production.**
There is no staging branch — verify locally before you push.

`vercel.json` sets `cleanUrls: true` and `trailingSlash: false`.

### Domains — don't confuse the two

The live domain is **vestself.app**, registered on GoDaddy nameservers
(`ns43`/`ns44.domaincontrol.com`) and pointed at Vercel. It works and has been fine.

**vestself.com is a different, unrelated domain** sitting on Namecheap and serving a
parking page. It has never served this site. Don't "fix" it and don't use it as a
health check — checking `.com` and concluding the site is down is a mistake that has
already been made once.

To check the real site:

```bash
curl -sIL https://vestself.app | grep -i "^HTTP\|^location"
```

## Social preview

`index.html` carries full Open Graph and Twitter Card tags. The live card is
`assets/og/og-app-v2.jpg` (1200x630), built from `assets/og/_source.og-app-v2.html` — it
renders with Chrome headless off the real Satoshi files and `assets/screens/*`. The
render command is in a comment at the top of that file.

**Design constraint, learned the hard way:** a link preview renders 170–330px wide.
Body copy is illegible at that size and a call-to-action button is actively misleading,
since nothing in a preview is clickable. The card therefore carries **no text but the
wordmark** and sells the product by showing the app. Verify any new card by downscaling
it to ~300px and checking it still reads.

The warm base (`--oregon` #9C3807 sweeping into `--gold` #E6C15A) is sampled from Figma
frame `964:8`, which is Kayla's preferred treatment. Devices are deliberately **upright — no rotation** (Kayla's call). Superseded cards
(`og-default.jpg`, the text-led original; `og-app.jpg`, a tilted variant) stay in the
repo only so links cached against them still resolve.

Two constraints worth knowing:

- **Keep the image under ~300KB.** WhatsApp silently drops previews over roughly that
  size. JPEG q95 with 4:4:4 subsampling lands around 150KB and looks identical to PNG.
- **Scrapers cache hard.** If the artwork changes, ship it under a **new filename**
  and update the meta tags — overwriting leaves the old image served for weeks.

## Assets

- `assets/brand/` — logo masters (SVG, PNG, print EPS, Figma source). Not used by the
  page; kept for collateral.
- `assets/fonts/` — licensed Satoshi files. Don't redistribute them outside this project.
- `assets/screens/` — the five How It Works step images, in order.

## Conventions

- Commit messages: short imperative subject, plus a body explaining *why* when the
  change isn't self-evident. `45c7a95` is the house style.
- Comments explain intent, not mechanics. Match the surrounding density — the CSS is
  heavily commented with brand-guide references, the JS is deliberately sparse.
- Accessibility isn't optional: forms keep real `<label>`s, the honeypot stays
  `aria-hidden`, and error text keeps `role="alert"`.
