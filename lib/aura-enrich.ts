/**
 * lib/aura-enrich.ts
 *
 * Reusable CHI311 Salesforce Aura fetch logic.
 * Returns enrichment data without writing to the DB — callers handle persistence.
 *
 * Used by /api/portfolio/backfill/process. The /api/complaints/enrich-on-demand
 * route currently has its own copy (kept separate for minimal regression risk).
 */

const AURA_CONTEXT = JSON.stringify({
  mode: 'PROD',
  fwuid: 'TXFWNVprQUZzQnEtNXVXYTFLQ2ppdzJEa1N5enhOU3R5QWl2VzNveFZTbGcxMy4tMjE0NzQ4MzY0OC4xMzEwNzIwMA',
  app: 'siteforce:communityApp',
  loaded: {
    'APPLICATION@markup://siteforce:communityApp': '1542_MvzRU4EK4FAU3HkS3YNvyA',
  },
  dn: [],
  globals: {},
  uad: true,
})

const AURA_HEADERS: HeadersInit = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
}
const AURA_BASE = 'https://311.chicago.gov/s/sfsites/aura'
const URL_SR_SEARCH = `${AURA_BASE}?r=2&other.CommunityUtility.getAllServiceRequestResults=1`
const URL_GET_SERVICE_REQUEST = `${AURA_BASE}?r=2&other.CommunityUtility.getServiceRequest=1`
const URL_FLEX_ANSWERS = `${AURA_BASE}?r=81&aura.ApexAction.execute=1`

const SKIP_IDS = new Set([
  'a1Yt0000000Lg6SEAS',
  'a1Yt0000000Lg7HEAS',
  'a1Yt0000000Lg4YEAS',
  'a1Yt0000000Lg5pEAC',
  'a1Yt0000000Lj2HEAS',
])

const QUESTION_MAP: Record<string, Record<string, string>> = {
  '08qt0000000CabpAAC': {
    description: 'a1Yt0000000LfxuEAC',
    complainant_type: 'a1Yt0000000Lg7FEAS',
    unit_number: 'a1Yt0000000Lg6cEAC',
    danger_reported: 'a1Yt0000000Lg6uEAC',
    owner_notified: 'a1Yt0000000Lg72EAC',
    owner_occupied: 'a1Yt0000000Lg73EAC',
  },
  '08qt0000000CabrAAC': { description: 'a1Yt0000000LjBVEA0' },
  '08qt0000000CacJAAS': {
    description: 'a1Yt0000000Lg7IEAS',
    concern_category: 'a1Yt0000000Lg7iEAC',
    unit_number: 'a1Yt0000000Lg7JEAS',
  },
  '08qt0000000CacgAAC': { description: 'a1Yt0000000Lg4aEAC' },
  '08qt0000000CacoAAC': {
    description: 'a1Yt0000000Lg9sEAC',
    complainant_type: 'a1Yt0000000LgA6EAK',
    owner_notified: 'a1Yt0000000Lg9xEAC',
  },
  '08qt0000000CaYeAAK': { description: 'a1Yt0000000Lj2IEAS' },
  '08qt0000000CacaAAC': {
    description: 'a1Yt0000000LirDEAS',
    concern_category: 'a1Yt0000000LfjBEAS',
  },
  '08qt0000000CaYiAAK': {
    restaurant_name: 'a1Yt0000000Lj1JEAS',
    description: 'a1Yt0000000Lj1IEAS',
    problem_category: 'a1Yt0000000LimCEAS',
    unit_number: 'a1Yt0000000Lj1HEAS',
  },
  '08qt0000000CacSAAS': {
    business_name: 'a1Yt0000000cCDfEAM',
    description: 'a1Y8z0000006zcCEAQ',
    concern_category: 'a1Y8z0000006xYHEAY',
  },
  '08qt0000000CadBAAS': {
    business_name: 'a1Yt0000000cCDpEAM',
    concern_category: 'a1Y8z00000075hxEAA',
    description: 'a1Y8z00000075i7EAA',
  },
  '08qt0000000CadIAAS': {
    business_name: 'a1Yt0000000Lj4dEAC',
    description: 'a1Yt0000000Lj4cEAC',
    unit_number: 'a1Yt0000000Lj4bEAC',
  },
  '08qt0000000CaexAAC': {
    complainant_type: 'a1Yt0000000LihQEAS',
    concern_category: 'a1Yt0000000LihREAS',
    description: 'a1Yt0000000LiubEAC',
  },
  '08qt0000000CadNAAS': {
    concern_category: 'a1Yt0000000LiSJEA0',
    description: 'a1Yt0000000Lj2AEAS',
  },
  '08qt0000000CaeeAAC': {
    business_name: 'a1Yt0000000cCDVEA2',
    concern_category: 'a1Yt0000000LiY6EAK',
    description: 'a1Yt0000000Lj8XEAS',
  },
  '08qt0000000Cac2AAC': {
    business_name: 'a1Yt0000000LjCkEAK',
    concern_category: 'a1Yt0000000LifFEAS',
    description: 'a1Yt0000000LjCmEAK',
  },
  '08qt0000000Cab5AAC': {
    business_name: 'a1Yt0000000LjCgEAK',
    description: 'a1Yt0000000LjCjEAK',
  },
  '08qt0000000CaXQAA0': {
    business_name: 'a1Yt0000000cCDaEAM',
    concern_category: 'a1Yt0000000LiRsEAK',
    description: 'a1Yt0000000LjBxEAK',
  },
  '08qt0000000CaaoAAC': {
    business_name: 'a1Yt0000000cCDkEAM',
    concern_category: 'a1Yt0000000LiNKEA0',
    description: 'a1Yt0000000Lix4EAC',
  },
  '08qt0000000CaaLAAS': { business_name: 'a1Ycs000002sErFEAU' },
}

export const ENRICHABLE_SR_CODES = [
  'BBA', 'BBC', 'BBD', 'BBK', 'BPI', 'HDF', 'SCB',
  'HFB', 'RBL', 'CAFE', 'CORNVEND', 'SHVR',
  'CSF', 'CST', 'BAG', 'BAM', 'FPC', 'ODM', 'MWC',
] as const

export interface AuraEnrichmentResult {
  caseId: string | null
  fields: Record<string, unknown>
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function buildAuraFormBody(message: object, pageURI: string): string {
  const p = new URLSearchParams()
  p.set('message', JSON.stringify(message))
  p.set('aura.context', AURA_CONTEXT)
  p.set('aura.pageURI', pageURI)
  p.set('aura.token', 'null')
  return p.toString()
}

function findCaseIdInTree(node: unknown, targetCaseNumber: string): string | null {
  if (node == null) return null
  if (typeof node === 'object' && !Array.isArray(node)) {
    const o = node as Record<string, unknown>
    const cn = o.CaseNumber
    if (typeof cn === 'string' && cn.trim() === targetCaseNumber && typeof o.Id === 'string') {
      return o.Id
    }
  }
  if (Array.isArray(node)) {
    for (const x of node) {
      const f = findCaseIdInTree(x, targetCaseNumber)
      if (f) return f
    }
  } else if (typeof node === 'object' && node !== null) {
    for (const v of Object.values(node)) {
      const f = findCaseIdInTree(v, targetCaseNumber)
      if (f) return f
    }
  }
  return null
}

function unwrapReturnValue(rv: unknown): unknown {
  if (typeof rv === 'string') {
    try {
      return JSON.parse(rv) as unknown
    } catch {
      return rv
    }
  }
  return rv
}

function getFirstActionJson(json: unknown): { returnValue: unknown; error?: unknown } {
  const j = json as { actions?: { returnValue?: unknown; error?: unknown }[] }
  const a = j?.actions?.[0]
  if (a && Array.isArray(a.error) && a.error.length > 0) {
    return { returnValue: undefined, error: a.error }
  }
  return { returnValue: a?.returnValue }
}

function getWorkflowStep(rv: unknown): string | null {
  const o = rv as Record<string, unknown> | null | undefined
  const sreq = o?.serviceRequest as Record<string, unknown> | undefined
  const wobjs = (sreq?.workOrderObjs ?? o?.workOrderObjs) as unknown[] | undefined
  const w0 = wobjs?.[0] as Record<string, unknown> | undefined
  const wolis = w0?.wolis as unknown[] | undefined
  const woli0 = wolis?.[0] as Record<string, unknown> | undefined
  const wr = woli0?.woliRecord as Record<string, unknown> | undefined
  const act = wr?.C311_Activity_Type__r as { Name?: string } | undefined
  const name = act?.Name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function getFlexList(json: unknown): unknown[] {
  const { returnValue: rv0 } = getFirstActionJson(json)
  if (rv0 == null) return []
  const un = unwrapReturnValue(rv0) as {
    returnValue?: { responseWrapperList?: unknown[] }
    responseWrapperList?: unknown[]
  }
  return un?.returnValue?.responseWrapperList ?? un?.responseWrapperList ?? []
}

function mapFlexAnswers(workTypeId: string | null, list: unknown[]): Record<string, string> {
  if (!workTypeId) return {}
  const qmap = QUESTION_MAP[workTypeId]
  if (!qmap) return {}
  const idToField = new Map<string, string>()
  for (const [field, qid] of Object.entries(qmap)) idToField.set(qid, field)
  const out: Record<string, string> = {}
  for (const item of list) {
    const row = item as {
      question?: { Id?: string }
      response?: { C311_Response__c?: string | null }
    }
    const qid = row.question?.Id
    if (!qid || SKIP_IDS.has(qid)) continue
    const field = idToField.get(qid)
    if (!field) continue
    const raw = row.response?.C311_Response__c
    if (raw == null) continue
    const s = String(raw).trim()
    if (s) out[field] = s
  }
  return out
}

/**
 * Fetch Aura enrichment for a single SR number.
 *
 * Returns { caseId, fields } on success.
 * Returns { caseId: null, fields: {} } if SR not found, Aura unreachable, or any Aura step fails.
 *
 * Never throws — callers can always write enriched_at = now() to mark "we tried"
 * regardless of outcome, preventing infinite retry on permanently-broken complaints.
 */
export async function fetchAuraEnrichment(sr_number: string): Promise<AuraEnrichmentResult> {
  const empty: AuraEnrichmentResult = { caseId: null, fields: {} }

  try {
    // Step 1: SR search → caseId
    const msg1 = {
      actions: [
        {
          id: '67;a',
          descriptor: 'apex://CommunityUtilityController/ACTION$getAllServiceRequestResults',
          callingDescriptor: 'markup://c:cocCommunityGlobalSearchListViewCmp',
          params: { searchTerm: sr_number },
        },
      ],
    }
    const res1 = await fetch(URL_SR_SEARCH, {
      method: 'POST',
      headers: AURA_HEADERS,
      body: buildAuraFormBody(msg1, '/s/global-search-results?language=en_US'),
    })
    if (!res1.ok) return empty
    const text1 = await res1.text()
    let json1: unknown
    try {
      json1 = JSON.parse(text1)
    } catch {
      return empty
    }
    const a1 = getFirstActionJson(json1)
    if (a1.error) return empty
    const ret1 = unwrapReturnValue(a1.returnValue)
    const caseId = findCaseIdInTree(ret1, sr_number)
    if (!caseId) return empty

    await delay(1500)

    // Step 2: getServiceRequest → SLA + work_order_id
    const pageUri2 = `/s/service-request-detail?language=en_US&caseid=${encodeURIComponent(caseId)}`
    const msg2 = {
      actions: [
        {
          id: '67;a',
          descriptor: 'apex://CommunityUtilityController/ACTION$getServiceRequest',
          callingDescriptor: 'markup://c:cocCommunitySRDetail',
          params: { caseId },
        },
      ],
    }
    const res2 = await fetch(URL_GET_SERVICE_REQUEST, {
      method: 'POST',
      headers: AURA_HEADERS,
      body: buildAuraFormBody(msg2, pageUri2),
    })

    const fields: Record<string, unknown> = {}

    if (res2.ok) {
      const text2 = await res2.text()
      try {
        const json2 = JSON.parse(text2) as unknown
        const a2 = getFirstActionJson(json2)
        if (!a2.error) {
          const rv2 = unwrapReturnValue(a2.returnValue) as {
            serviceRequest?: { WorkOrders?: unknown[] }
            WorkOrders?: unknown[]
          }
          const srBlock = rv2?.serviceRequest
          const wos = srBlock?.WorkOrders ?? rv2?.WorkOrders
          const wo0 = (wos as Record<string, unknown>[] | undefined)?.[0] as
            | {
                Id?: string
                WorkTypeId?: string
                Status?: string
                C311_Estimated_Completion_Date__c?: string
                WorkType?: {
                  C311_SLA__c?: number | null
                  C311_Calculated_Mean__c?: number | null
                }
              }
            | undefined

          if (wo0) {
            const slaN = wo0.WorkType?.C311_SLA__c
            const meanN = wo0.WorkType?.C311_Calculated_Mean__c
            if (slaN != null && !Number.isNaN(Number(slaN))) {
              fields.sla_target_days = Math.round(Number(slaN))
            }
            if (meanN != null && !Number.isNaN(Number(meanN))) {
              fields.actual_mean_days = Math.round(Number(meanN))
            }
            if (wo0.C311_Estimated_Completion_Date__c) {
              fields.estimated_completion = String(wo0.C311_Estimated_Completion_Date__c).trim() || null
            }
            if (wo0.Status) fields.work_order_status = wo0.Status
            const ws = getWorkflowStep(rv2)
            if (ws) fields.workflow_step = ws

            const work_order_id = typeof wo0.Id === 'string' ? wo0.Id : null
            const work_type_id = typeof wo0.WorkTypeId === 'string' ? wo0.WorkTypeId : null

            // Step 3: Flex answers (descriptions etc.)
            if (work_order_id) {
              await delay(1500)
              const msg3 = {
                actions: [
                  {
                    id: '67;a',
                    descriptor: 'aura://ApexActionController/ACTION$execute',
                    callingDescriptor: 'UNKNOWN',
                    params: {
                      namespace: '',
                      classname: 'WorkQuestionsUtility',
                      method: 'retrieveQuestionData',
                      params: {
                        recordId: work_order_id,
                        context: 'Intake',
                        userInterface: 'Community',
                      },
                      cacheable: false,
                      isContinuation: false,
                    },
                  },
                ],
              }
              const res3 = await fetch(URL_FLEX_ANSWERS, {
                method: 'POST',
                headers: AURA_HEADERS,
                body: buildAuraFormBody(msg3, '/s/service-request-detail?language=en_US'),
              })
              if (res3.ok) {
                const text3 = await res3.text()
                try {
                  const json3 = JSON.parse(text3) as unknown
                  const list3 = getFlexList(json3)
                  const flex = mapFlexAnswers(work_type_id, list3)
                  for (const [k, v] of Object.entries(flex)) {
                    if (k === 'description') fields.complaint_description = v
                    else fields[k] = v
                  }
                } catch {
                  /* swallow — we still have whatever fields we got from step 2 */
                }
              }
            }
          }
        }
      } catch {
        /* swallow */
      }
    }

    return { caseId, fields }
  } catch {
    return empty
  }
}
