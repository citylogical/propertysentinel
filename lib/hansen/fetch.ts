// lib/hansen/fetch.ts
//
// Runs the webapps1.chicago.gov/buildingrecords session handshake and returns
// the raw doSearch results HTML. Pairs with lib/hansen/parse.ts (HTML → tables).
//
// This module does NETWORK ONLY. It does not parse table data and does not
// touch Supabase — the route handler orchestrates fetch → parse → persist.
//
// ── The handshake chain ──────────────────────────────────────────────────────
//   1. GET  /buildingrecords/            → establishes JSESSIONID + BIG-IP cookies,
//                                          lands on the User Agreement page
//   2. POST <agreement accept>           → flips the session's "agreed" flag
//                                          *** see AGREEMENT_ACCEPT below — this is
//                                          the one step never captured from a real
//                                          request; verify it on first run ***
//   3. GET  /buildingrecords/search      → the address search form; scrape _csrf
//   4. POST /buildingrecords/validateaddress  (fullAddress + _csrf)
//                                          → confirmation page: the city splits the
//                                          address into streetNumber/Direction/
//                                          Name/Type hidden inputs + a fresh _csrf
//   5. POST /buildingrecords/doSearch    (the split parts + fresh _csrf)
//                                          → the results HTML we actually want
//
// Confirmed by live capture: steps 3–5 (validateaddress accepts fullAddress alone
// and returns the split parts; doSearch replays with JSESSIONID + BIG-IP cookie).
// NOT captured: step 2. The code below DETECTS whether the agreement is still
// blocking and only then POSTs the acceptance, so a fresh session is handled —
// but the POST target/body are best-guess until verified.
//
// Per-request session: every call runs the whole chain with its own cookie jar.
// Slower than pooling, but bulletproof — no shared session to go stale mid-run.
// For a user-facing "Query Hansen" button that's the right trade.

const HANSEN_BASE = 'https://webapps1.chicago.gov/buildingrecords'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

// *** UNVERIFIED — step 2 was never captured from a real request. ***
// When a fresh session hits the agreement gate, this is what we POST to clear it.
// To confirm: open DevTools → Network, accept the agreement by hand, find the
// request fired on Submit, and update the path + body here to match exactly.
// The detection logic below means a WRONG value here fails loudly at step 3/4
// (search form never appears) rather than silently — so this is safe to ship
// as a best guess and correct on first real run.
// Confirmed against a real captured agreement-Submit request.
const AGREEMENT_ACCEPT = {
    path: '/buildingrecords/agreement',
    // The "I accept the terms of this license" radio posts agreement=Y.
    // submit is sent empty. _csrf is injected at call time from the
    // agreement page's hidden input.
    bodyFields: { agreement: 'Y', submit: '' } as Record<string, string>,
  }

// ─────────────────────────────────────────────────────────────────────────────
// Cookie jar — minimal, no dependency. Node's fetch does not persist cookies
// across requests, so we accumulate Set-Cookie ourselves and replay them.
// ─────────────────────────────────────────────────────────────────────────────

class CookieJar {
  private jar = new Map<string, string>()

  /** Read every Set-Cookie on a response and store name=value (attributes dropped). */
  absorb(res: Response): void {
    // getSetCookie() returns the unfolded array of Set-Cookie headers (undici).
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : []
    for (const raw of setCookies) {
      const pair = raw.split(';')[0] ?? ''
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (name) this.jar.set(name, value)
    }
  }

  /** Serialize to a Cookie header value. */
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  get size(): number {
    return this.jar.size
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML scraping helpers — just enough regex to pull form fields out of a page.
// (Deliberately not cheerio here — fetch.ts stays dependency-light; structured
// table parsing is parse.ts's job.)
// ─────────────────────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract the `value` of a hidden (or any) <input> by its `name`, regardless of
 * attribute order. Returns null if the input or its value is absent.
 */
function extractInputValue(html: string, name: string): string | null {
  // Grab the whole <input ...> tag that carries name="<name>", then read value.
  const tagRe = new RegExp(
    `<input\\b[^>]*\\bname=["']${escapeRegExp(name)}["'][^>]*>`,
    'i'
  )
  const tag = html.match(tagRe)?.[0]
  if (!tag) return null
  const val = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1]
  // value="" is a real (empty) value — return '' not null in that case so the
  // caller can distinguish "field present but empty" from "field missing".
  return val ?? null
}

/** Convenience: the _csrf hidden input that every form page carries. */
function extractCsrf(html: string): string | null {
  return extractInputValue(html, '_csrf')
}

/**
 * Does this HTML look like the address SEARCH FORM (step 3 target) rather than
 * the agreement gate? The search form has the `fullAddress`/street inputs or at
 * least the search action; the agreement page does not.
 */
function looksLikeSearchForm(html: string): boolean {
  return (
    /name=["']fullAddress["']/i.test(html) ||
    /\/buildingrecords\/validateaddress/i.test(html) ||
    /name=["']streetName["']/i.test(html)
  )
}

/** Does this HTML look like the User Agreement gate (step 2)? */
function looksLikeAgreement(html: string): boolean {
  return (
    /User Agreement/i.test(html) ||
    /accept the terms of this license/i.test(html)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level request helpers
// ─────────────────────────────────────────────────────────────────────────────

type StepName =
  | 'landing'
  | 'agreement-accept'
  | 'search-form'
  | 'validateaddress'
  | 'doSearch'

class HansenFetchError extends Error {
  constructor(
    public step: StepName,
    message: string,
    public status?: number
  ) {
    super(`Hansen fetch [${step}]: ${message}`)
    this.name = 'HansenFetchError'
  }
}

async function getPage(
  jar: CookieJar,
  url: string,
  referer: string | null,
  step: StepName
): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(jar.size > 0 ? { Cookie: jar.header() } : {}),
        ...(referer ? { Referer: referer } : {}),
      },
    })
  } catch (e) {
    throw new HansenFetchError(
      step,
      `network error — ${e instanceof Error ? e.message : String(e)}`
    )
  }
  jar.absorb(res)
  if (!res.ok) {
    throw new HansenFetchError(step, `HTTP ${res.status}`, res.status)
  }
  return res.text()
}

async function postForm(
  jar: CookieJar,
  url: string,
  fields: Record<string, string>,
  referer: string,
  step: StepName
): Promise<string> {
  const body = new URLSearchParams(fields).toString()
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://webapps1.chicago.gov',
        Referer: referer,
        ...(jar.size > 0 ? { Cookie: jar.header() } : {}),
      },
      body,
    })
  } catch (e) {
    throw new HansenFetchError(
      step,
      `network error — ${e instanceof Error ? e.message : String(e)}`
    )
  }
  jar.absorb(res)
  if (!res.ok) {
    throw new HansenFetchError(step, `HTTP ${res.status}`, res.status)
  }
  return res.text()
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type HansenFetchResult = {
  /** Raw doSearch results HTML — feed straight into parseHansenResults(). */
  html: string
  /** Echo of what we searched, normalized to the form the city expects. */
  queriedAddress: string
  /** The split parts the city resolved the address into (useful for logging). */
  resolvedParts: {
    streetNumber: string | null
    streetDirection: string | null
    streetName: string | null
    streetType: string | null
  }
}

/**
 * Run the full handshake for one address and return the doSearch results HTML.
 *
 * @param fullAddress  A Chicago address, e.g. "1501 N LEAMINGTON AVE". Case is
 *                     normalized to upper; the city's validateaddress step does
 *                     the actual parsing into street parts, so we don't need a
 *                     local address parser.
 *
 * Throws HansenFetchError (with `.step`) on any failure so the caller can tell
 * a stale-session retry from a genuine "address not found".
 */
export async function fetchHansenRecords(
  fullAddress: string
): Promise<HansenFetchResult> {
  const queriedAddress = fullAddress.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!queriedAddress) {
    throw new HansenFetchError('landing', 'empty address')
  }

  const jar = new CookieJar()

  // ── Step 1: landing — establish the session cookies ──────────────────────
  const landingHtml = await getPage(jar, `${HANSEN_BASE}/`, null, 'landing')
  if (jar.size === 0) {
    throw new HansenFetchError(
      'landing',
      'no session cookie set by landing page — site may be down or changed'
    )
  }

  // ── Step 2: agreement — only if the gate is actually blocking ────────────
  // A fresh session lands on the User Agreement. An already-agreed session (or
  // a site that dropped the gate) lands straight on something usable. We act
  // only on what we actually see.
  let pageAfterAgreement = landingHtml
  if (looksLikeAgreement(landingHtml) && !looksLikeSearchForm(landingHtml)) {
    const agreementCsrf = extractCsrf(landingHtml)
    const acceptFields: Record<string, string> = {
      ...AGREEMENT_ACCEPT.bodyFields,
      ...(agreementCsrf ? { _csrf: agreementCsrf } : {}),
    }
    pageAfterAgreement = await postForm(
      jar,
      `https://webapps1.chicago.gov${AGREEMENT_ACCEPT.path}`,
      acceptFields,
      `${HANSEN_BASE}/`,
      'agreement-accept'
    )
  }

  // ── Step 3: search form — scrape the _csrf for validateaddress ───────────
  // Use the post-agreement page if it's already the search form; otherwise GET
  // /search explicitly.
  let searchFormHtml = pageAfterAgreement
  if (!looksLikeSearchForm(searchFormHtml)) {
    searchFormHtml = await getPage(
      jar,
      `${HANSEN_BASE}/search`,
      `${HANSEN_BASE}/`,
      'search-form'
    )
  }
  if (!looksLikeSearchForm(searchFormHtml)) {
    // Still not the search form → the agreement step almost certainly didn't
    // take. This is the loud failure that tells you to fix AGREEMENT_ACCEPT.
    throw new HansenFetchError(
      'search-form',
      'could not reach the address search form — the agreement-accept step ' +
        '(AGREEMENT_ACCEPT in this file) likely needs its real path/body'
    )
  }
  const searchCsrf = extractCsrf(searchFormHtml)
  if (!searchCsrf) {
    throw new HansenFetchError('search-form', 'no _csrf token on search form')
  }

  // ── Step 4: validateaddress — the city splits the address for us ─────────
  // Confirmed by live test: posting fullAddress + _csrf alone is enough; the
  // response carries streetNumber/Direction/Name/Type as hidden inputs plus a
  // fresh _csrf for doSearch.
  const validateHtml = await postForm(
    jar,
    `${HANSEN_BASE}/validateaddress`,
    { fullAddress: queriedAddress, _csrf: searchCsrf },
    `${HANSEN_BASE}/search`,
    'validateaddress'
  )

  const resolvedParts = {
    streetNumber: extractInputValue(validateHtml, 'streetNumber'),
    streetDirection: extractInputValue(validateHtml, 'streetDirection'),
    streetName: extractInputValue(validateHtml, 'streetName'),
    streetType: extractInputValue(validateHtml, 'streetType'),
  }
  const doSearchCsrf = extractCsrf(validateHtml) ?? searchCsrf

  // streetNumber and streetName are the non-negotiable parts. Direction/Type can
  // legitimately be empty for some addresses, so we don't hard-require them.
  if (!resolvedParts.streetNumber || !resolvedParts.streetName) {
    // The validateaddress page renders without the split inputs when the
    // address didn't resolve — treat that as "address not found", distinct
    // from a transport error.
    throw new HansenFetchError(
      'validateaddress',
      `address did not resolve to a building — "${queriedAddress}" ` +
        '(no streetNumber/streetName returned by validateaddress)'
    )
  }

  // ── Step 5: doSearch — the results page ──────────────────────────────────
  const doSearchFields: Record<string, string> = {
    streetNumber: resolvedParts.streetNumber,
    streetDirection: resolvedParts.streetDirection ?? '',
    streetName: resolvedParts.streetName,
    streetType: resolvedParts.streetType ?? '',
    fullAddress: queriedAddress,
    _csrf: doSearchCsrf,
  }
  const html = await postForm(
    jar,
    `${HANSEN_BASE}/doSearch`,
    doSearchFields,
    `${HANSEN_BASE}/validateaddress`,
    'doSearch'
  )

  // Cheap sanity check — the results page always renders the "Range address"
  // block. If it's absent we got handed something unexpected; surface it now
  // rather than letting parse.ts throw a vaguer error downstream.
  if (!/Range address/i.test(html) && !/resultstable_/i.test(html)) {
    throw new HansenFetchError(
      'doSearch',
      'doSearch response is not a recognizable results page'
    )
  }

  return { html, queriedAddress, resolvedParts }
}

export { HansenFetchError }