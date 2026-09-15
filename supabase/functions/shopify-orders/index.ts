// ============================================================================
// Hills of Hems Hub – Edge Function `shopify-orders`
// ----------------------------------------------------------------------------
// EINZIGER Zugriff auf die Shopify Admin API (nur lesend). Hält die Shopify-
// Zugangsdaten als Supabase-Secrets, die niemals ins Frontend gehen.
//
// Aufruf vom Client:  supabase.functions.invoke('shopify-orders', { body })
//   body = { action: 'list', first?, after?, from?, to?, paidOnly?, channel?, search? }
//   body = { action: 'get',  id: 'gid://shopify/Order/…' }
//
// Zugriff nur für eingeloggte Hub-User: Das Supabase-Access-Token des Aufrufers
// wird gegen Supabase Auth geprüft (zusätzlich zur JWT-Prüfung des Gateways).
//
// Shopify-Zugang (siehe src/invoices/README.md) – zwei Varianten:
//   A) Dev-Dashboard-App (Standard seit 2025): SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.
//      Die Function holt sich per "client credentials grant" selbst ein Admin-API-Token
//      (24 h gültig) und erneuert es automatisch.
//   B) Alte, im Admin angelegte Custom App: festes SHOPIFY_ADMIN_TOKEN (shpat_…).
//
//   supabase secrets set --env-file supabase/functions/.env
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'

const SHOPIFY_STORE_DOMAIN = (Deno.env.get('SHOPIFY_STORE_DOMAIN') ?? '').trim()
const SHOPIFY_CLIENT_ID = (Deno.env.get('SHOPIFY_CLIENT_ID') ?? '').trim()
const SHOPIFY_CLIENT_SECRET = (Deno.env.get('SHOPIFY_CLIENT_SECRET') ?? '').trim()
const SHOPIFY_ADMIN_TOKEN = (Deno.env.get('SHOPIFY_ADMIN_TOKEN') ?? '').trim()
const SHOPIFY_API_VERSION = (Deno.env.get('SHOPIFY_API_VERSION') ?? '2026-07').trim()
const HAS_CLIENT_CREDENTIALS = Boolean(SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET)
// Werden von Supabase automatisch in jede Edge Function injiziert.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ----------------------------------------------------------------------------
// GraphQL-Dokumente (Admin API, gegen das Schema 2026-07 validiert)
// ----------------------------------------------------------------------------
const MONEY = 'shopMoney { amount currencyCode }'
const TAX_LINES = `taxLines { rate ratePercentage title priceSet { ${MONEY} } }`
const ADDRESS =
  'firstName lastName name company address1 address2 zip city province provinceCode country countryCodeV2 phone'
const DISCOUNT_ALLOCATIONS = `discountAllocations {
  allocatedAmountSet { ${MONEY} }
  discountApplication {
    allocationMethod targetType targetSelection
    ... on DiscountCodeApplication { code }
    ... on AutomaticDiscountApplication { title }
    ... on ManualDiscountApplication { title description }
  }
}`

const LIST_QUERY = `
query HubListOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      createdAt
      tags
      sourceName
      displayFinancialStatus
      displayFulfillmentStatus
      email
      customer { displayName defaultEmailAddress { emailAddress } }
      billingAddress { name company countryCodeV2 }
      shippingAddress { name company countryCodeV2 }
      totalPriceSet { ${MONEY} }
    }
  }
}`

const GET_QUERY = `
query HubGetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    createdAt
    processedAt
    cancelledAt
    tags
    note
    sourceName
    displayFinancialStatus
    displayFulfillmentStatus
    taxesIncluded
    taxExempt
    currencyCode
    paymentGatewayNames
    discountCodes
    email
    customer { id displayName firstName lastName defaultEmailAddress { emailAddress } }
    billingAddress { ${ADDRESS} }
    shippingAddress { ${ADDRESS} }
    fulfillments(first: 10) { id createdAt status deliveredAt }
    lineItems(first: 100) {
      nodes {
        id
        title
        variantTitle
        sku
        quantity
        currentQuantity
        originalUnitPriceSet { ${MONEY} }
        originalTotalSet { ${MONEY} }
        discountedTotalSet { ${MONEY} }
        totalDiscountSet { ${MONEY} }
        ${DISCOUNT_ALLOCATIONS}
        ${TAX_LINES}
      }
    }
    shippingLines(first: 10) {
      nodes {
        id
        title
        code
        originalPriceSet { ${MONEY} }
        discountedPriceSet { ${MONEY} }
        ${DISCOUNT_ALLOCATIONS}
        ${TAX_LINES}
      }
    }
    discountApplications(first: 20) {
      nodes {
        allocationMethod
        targetSelection
        targetType
        value {
          ... on MoneyV2 { amount currencyCode }
          ... on PricingPercentageValue { percentage }
        }
        ... on DiscountCodeApplication { code }
        ... on ManualDiscountApplication { title description }
        ... on AutomaticDiscountApplication { title }
      }
    }
    subtotalPriceSet { ${MONEY} }
    totalShippingPriceSet { ${MONEY} }
    totalDiscountsSet { ${MONEY} }
    totalTaxSet { ${MONEY} }
    totalPriceSet { ${MONEY} }
    currentTotalPriceSet { ${MONEY} }
    totalRefundedSet { ${MONEY} }
    refunds(first: 20) {
      id
      createdAt
      note
      totalRefundedSet { ${MONEY} }
    }
  }
}`

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ShopifyGraphQLError {
  message: string
  extensions?: { code?: string }
}

// ----------------------------------------------------------------------------
// Access-Token: client credentials grant (24 h gültig), im Speicher der
// Function-Instanz gecacht und kurz vor Ablauf erneuert.
// ----------------------------------------------------------------------------
let cachedToken: { value: string; expiresAt: number } | null = null
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000

async function fetchClientCredentialsToken(): Promise<string> {
  const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new HttpError(
      502,
      `Shopify gibt kein Access-Token heraus (HTTP ${res.status}). Client-ID/Secret prüfen und ob die App im Shop installiert ist. ${text.slice(0, 200)}`,
    )
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new HttpError(502, 'Shopify-Antwort enthält kein access_token.')
  const ttlMs = (data.expires_in ?? 86399) * 1000
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs }
  return data.access_token
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!HAS_CLIENT_CREDENTIALS) return SHOPIFY_ADMIN_TOKEN
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.value
  }
  return fetchClientCredentialsToken()
}

/** Führt eine GraphQL-Query gegen die Shopify Admin API aus (nur lesend). */
async function shopifyQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  retryOnAuthError = true,
): Promise<T> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  const token = await getAccessToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 401 || res.status === 403) {
    // Token abgelaufen/widerrufen? Bei client credentials einmal frisch holen.
    if (HAS_CLIENT_CREDENTIALS && retryOnAuthError) {
      cachedToken = null
      await getAccessToken(true)
      return shopifyQuery<T>(query, variables, false)
    }
    throw new HttpError(
      502,
      `Shopify lehnt den Zugriff ab (HTTP ${res.status}): ${
        HAS_CLIENT_CREDENTIALS ? 'Client-ID/Secret, Installation der App und Scopes prüfen.' : 'SHOPIFY_ADMIN_TOKEN oder Scopes prüfen.'
      }`,
    )
  }
  if (res.status === 429) {
    throw new HttpError(429, 'Shopify-Rate-Limit erreicht. Bitte kurz warten und erneut versuchen.')
  }
  if (!res.ok) {
    throw new HttpError(502, `Shopify antwortet mit HTTP ${res.status}.`)
  }

  const payload = (await res.json()) as { data?: T; errors?: ShopifyGraphQLError[] }
  if (payload.errors?.length) {
    const throttled = payload.errors.some((e) => e.extensions?.code === 'THROTTLED')
    if (throttled) {
      throw new HttpError(429, 'Shopify-Rate-Limit erreicht. Bitte kurz warten und erneut versuchen.')
    }
    const denied = payload.errors.some((e) => e.extensions?.code === 'ACCESS_DENIED')
    if (denied) {
      throw new HttpError(
        502,
        `Shopify: fehlender Scope – ${payload.errors.map((e) => e.message).join(' | ')}`,
      )
    }
    throw new HttpError(502, `Shopify-Fehler: ${payload.errors.map((e) => e.message).join(' | ')}`)
  }
  if (!payload.data) throw new HttpError(502, 'Shopify lieferte keine Daten.')
  return payload.data
}

/** Entfernt Zeichen, die die Shopify-Suchsyntax durcheinanderbringen könnten. */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/["'\\\n\r()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ORDER_GID_RE = /^gid:\/\/shopify\/Order\/\d+$/

interface ListParams {
  first?: number
  after?: string | null
  from?: string
  to?: string
  paidOnly?: boolean
  channel?: 'all' | 'onlineshop' | 'orderchamp'
  search?: string
}

/** Baut die Shopify-Suchquery aus strukturierten Filtern (kein Freitext-Passthrough). */
function buildSearchQuery(p: ListParams): string {
  const parts: string[] = []
  if (p.from && DATE_RE.test(p.from)) parts.push(`created_at:>='${p.from}T00:00:00Z'`)
  if (p.to && DATE_RE.test(p.to)) parts.push(`created_at:<='${p.to}T23:59:59Z'`)
  if (p.paidOnly) parts.push('financial_status:paid')
  if (p.channel === 'orderchamp') parts.push('tag:Orderchamp')
  if (p.channel === 'onlineshop') parts.push('-tag:Orderchamp')
  if (p.search) {
    const term = sanitizeSearchTerm(p.search)
    if (term) {
      // Bestellnummern gezielt, alles andere als Freitext (Name, E-Mail …)
      const asName = term.replace(/^#/, '')
      parts.push(/^(oc)?\d+$/i.test(asName) ? `name:${asName}` : term)
    }
  }
  return parts.join(' ')
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (!SHOPIFY_STORE_DOMAIN || (!HAS_CLIENT_CREDENTIALS && !SHOPIFY_ADMIN_TOKEN)) {
    return json(
      {
        error:
          'Edge Function nicht konfiguriert: SHOPIFY_STORE_DOMAIN und SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (oder SHOPIFY_ADMIN_TOKEN) fehlen.',
      },
      500,
    )
  }

  // --- 1) Aufrufer verifizieren: muss eingeloggter Hub-User sein --------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return json({ error: 'Kein Token.' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Ungültiges oder abgelaufenes Token.' }, 401)

  // --- 2) Aktion ausführen ------------------------------------------------------
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = body.action

    if (action === 'list') {
      const p = body as ListParams
      const first = Math.min(Math.max(Number(p.first) || 25, 1), 50)
      const after = typeof p.after === 'string' && p.after ? p.after : null
      const query = buildSearchQuery(p)
      const data = await shopifyQuery<{
        orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: unknown[] }
      }>(LIST_QUERY, { first, after, query: query || null })
      return json({ orders: data.orders.nodes, pageInfo: data.orders.pageInfo, query })
    }

    if (action === 'get') {
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      if (!ORDER_GID_RE.test(id)) {
        return json({ error: 'Ungültige Bestell-ID (erwartet gid://shopify/Order/…).' }, 400)
      }
      const data = await shopifyQuery<{ order: unknown | null }>(GET_QUERY, { id })
      if (!data.order) return json({ error: 'Bestellung nicht gefunden (ggf. älter als 60 Tage → Scope read_all_orders).' }, 404)
      return json({ order: data.order })
    }

    return json({ error: 'Unbekannte action (erlaubt: list, get).' }, 400)
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler.' }, 500)
  }
})
