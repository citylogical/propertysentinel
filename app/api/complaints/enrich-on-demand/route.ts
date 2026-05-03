import { currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { paraphraseComplaint } from '@/lib/paraphrase-complaint'

/** Aurora config; update `fwuid` and `loaded` when the city deploys Salesforce changes. */
const AURA_CONTEXT = JSON.stringify({
  mode: 'PROD',
  fwuid: 'ZkJhOVpLN2NZQkJrd2NWd3pMcnFOdzJEa1N5enhOU3R5QWl2VzNveFZTbGcxMy4tMjE0NzQ4MzY0OC4xMzEwNzIwMA',
  app: 'siteforce:communityApp',
  loaded: {
    'APPLICATION@markup://siteforce:communityApp': '1542_MvzRU4EK4FAU3HkS3YNvyA',
  },
  dn: [],
  globals: {},
  uad: true,
})

const AURA_HEADERS: HeadersInit = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
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
  'a1Yt0000000LiJeEAK',
  'a1Y8z0000000ZLUEA2',
])

/** SR short codes eligible for Aura flex enrichment (mirrors Worker ENRICH_CODES). */
const ENRICH_CODES = new Set([
  'BBA',
  'BBC',
  'BBD',
  'BBK',
  'BPI',
  'HDF',
  'SCB',
  'HFB',
  'RBL',
  'CAFE',
  'CORNVEND',
  'SHVR',
  'CSF',
  'CST',
  'BAG',
  'BAM',
  'FPC',
  'ODM',
  'MWC',
  'AAF',
  'NAC',
  'WBJ',
  'WBK',
  'FAC',
  'WCA',
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
  '08qt0000000CabrAAC': {
    description: 'a1Yt0000000LjBVEA0',
  },
  '08qt0000000CacJAAS': {
    description: 'a1Yt0000000Lg7IEAS',
    concern_category: 'a1Yt0000000Lg7iEAC',
    unit_number: 'a1Yt0000000Lg7JEAS',
  },
  '08qt0000000CacgAAC': {
    description: 'a1Yt0000000Lg4aEAC',
  },
  '08qt0000000CacoAAC': {
    description: 'a1Yt0000000Lg9sEAC',
    complainant_type: 'a1Yt0000000LgA6EAK',
    owner_notified: 'a1Yt0000000Lg9xEAC',
  },
  '08qt0000000CaYeAAK': {
    description: 'a1Yt0000000Lj2IEAS',
  },
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
  '08qt0000000CaaLAAS': {
    business_name: 'a1Ycs000002sErFEAU',
  },
  '08qt0000000CabOAAS': {
    concern_category: 'a1Yt0000000LiYfEAK',
    problem_category: 'a1Yt0000000Li1dEAC',
    description: 'a1Yt0000000LjFoEAK',
  },
  '08q8z0000000LkrAAE': {
    description: 'a1Y8z0000000ZLKEA2',
    concern_category: 'a1Y8z0000000ZL5EAM',
    problem_category: 'a1Y8z0000000ZLPEA2',
    owner_notified: 'a1Y8z0000000ZLFEA2',
  },
  '08qt0000000CaYtAAK': {
    concern_category: 'a1Yt0000000LiIyEAK',
    problem_category: 'a1Yt0000000LiCMEA0',
  },
  '08qt0000000CaaFAAS': {
    description: 'a1Yt0000000Lit1EAC',
    concern_category: 'a1Yt0000000Lit2EAC',
    problem_category: 'a1Yt0000000LiANEA0',
  },
  '08qt0000000CaXPAA0': {
    concern_category: 'a1Yt0000003OLaCEAW',
    problem_category: 'a1Yt0000003OLaMEAW',
  },
  '08qt0000000CaZ9AAK': {
    description: 'a1Yt0000000LfS9EAK',
  },
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
  const j = json as { actions?: { returnValue?: unknown; error?: unknown; state?: string }[] }
  const a = j?.actions?.[0]
  if (a && Array.isArray(a.error) && a.error.length > 0) {
    return { returnValue: undefined, error: a.error }
  }
  return { returnValue: a?.returnValue }
}

type WOLIStep = {
  order: number | null
  step: string | null
  status: string | null
  outcome: string | null
  end_date: string | null
}

type WOLIResult = {
  workflow_step: string | null
  work_order_steps: WOLIStep[]
  final_outcome: string | null
}

function getWOLIData(rv: unknown): WOLIResult {
  const empty: WOLIResult = { workflow_step: null, work_order_steps: [], final_outcome: null }
  const o = rv as Record<string, unknown> | null | undefined
  const sreq = o?.serviceRequest as Record<string, unknown> | undefined
  const wobjs = (sreq?.workOrderObjs ?? o?.workOrderObjs) as unknown[] | undefined
  const w0 = wobjs?.[0] as Record<string, unknown> | undefined
  const wolisRaw = (w0?.wolis as unknown[] | undefined) ?? []

  if (wolisRaw.length === 0) return empty

  // Sort by C311_Order_By__c ascending
  const wolisSorted = [...wolisRaw].sort((a, b) => {
    const aRec = (a as Record<string, unknown>)?.woliRecord as Record<string, unknown> | undefined
    const bRec = (b as Record<string, unknown>)?.woliRecord as Record<string, unknown> | undefined
    const aOrder = Number(aRec?.C311_Order_By__c ?? 0)
    const bOrder = Number(bRec?.C311_Order_By__c ?? 0)
    return aOrder - bOrder
  })

  let workflow_step: string | null = null
  let final_outcome: string | null = null
  const work_order_steps: WOLIStep[] = []

  for (const woli of wolisSorted) {
    const w = woli as Record<string, unknown>
    const rec = (w.woliRecord as Record<string, unknown>) ?? {}
    const activity = rec.C311_Activity_Type__r as { Name?: string } | undefined
    const stepName = typeof activity?.Name === 'string' ? activity.Name.trim() : null
    const status = typeof rec.Status === 'string' ? (rec.Status as string) : null
    const outcome = typeof w.outcome === 'string' ? (w.outcome as string) : null
    const end_date = typeof rec.EndDate === 'string' ? (rec.EndDate as string) : null
    const orderRaw = rec.C311_Order_By__c
    const order = orderRaw == null ? null : Number(orderRaw)

    work_order_steps.push({
      order: order != null && !Number.isNaN(order) ? order : null,
      step: stepName,
      status,
      outcome,
      end_date,
    })

    // Current step = first non-closed/non-canceled step
    if (workflow_step === null && status !== 'Closed' && status !== 'Canceled') {
      workflow_step = stepName
    }

    // Final outcome = outcome of last closed step that has outcome text
    if (status === 'Closed' && outcome && outcome.trim()) {
      final_outcome = outcome.trim()
    }
  }

  // If everything closed, current step = last step
  if (workflow_step === null && wolisSorted.length > 0) {
    const last = wolisSorted[wolisSorted.length - 1] as Record<string, unknown>
    const lastRec = (last.woliRecord as Record<string, unknown>) ?? {}
    const lastAct = lastRec.C311_Activity_Type__r as { Name?: string } | undefined
    workflow_step = typeof lastAct?.Name === 'string' ? lastAct.Name.trim() : null
  }

  return { workflow_step, work_order_steps, final_outcome }
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

function mapFlexAnswers(
  workTypeId: string | null,
  list: unknown[],
): Record<string, string> {
  if (!workTypeId) return {}
  const qmap = QUESTION_MAP[workTypeId]
  if (!qmap) return {}
  const idToField = new Map<string, string>()
  for (const [field, qid] of Object.entries(qmap)) {
    idToField.set(qid, field)
  }
  const out: Record<string, string> = {}
  for (const item of list) {
    const row = item as {
      question?: { Id?: string; C311_Question__c?: string; RecordType?: { Name?: string } }
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

export const maxDuration = 60

export async function POST(request: Request) {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: subscriber } = await supabaseAdmin
    .from('subscribers')
    .select('role')
    .eq('clerk_id', user.id)
    .maybeSingle()
  const subRole = (subscriber as { role?: string | null } | null)?.role != null
    ? String((subscriber as { role?: string | null }).role)
    : ''
  if (!subscriber || subRole !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { sr_number?: string }
  try {
    body = (await request.json()) as { sr_number?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const sr_number = (body.sr_number ?? '').trim()
  if (!sr_number) {
    return NextResponse.json({ error: 'Missing sr_number' }, { status: 400 })
  }

  // --- Step 1: find Case ID
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
  if (!res1.ok) {
    return NextResponse.json(
      { success: false, error: 'CHI 311 service unavailable' },
      { status: 502 },
    )
  }
  const text1 = await res1.text()
  let json1: unknown
  try {
    json1 = JSON.parse(text1) as unknown
  } catch {
    return NextResponse.json(
      { success: false, error: 'CHI 311 service unavailable' },
      { status: 502 },
    )
  }
  const a1 = getFirstActionJson(json1)
  if (a1.error) {
    return NextResponse.json(
      { success: false, error: 'Case ID not found' },
      { status: 404 },
    )
  }
  const ret1 = unwrapReturnValue(a1.returnValue)
  const caseId = findCaseIdInTree(ret1, sr_number)
  if (!caseId) {
    return NextResponse.json(
      { success: false, error: 'Case ID not found' },
      { status: 404 },
    )
  }

  await delay(1500)

  // --- Step 2: service request detail
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
  const form2 = buildAuraFormBody(msg2, pageUri2)
  const res2 = await fetch(URL_GET_SERVICE_REQUEST, {
    method: 'POST',
    headers: AURA_HEADERS,
    body: form2,
  })
  if (!res2.ok) {
    return NextResponse.json(
      { success: false, error: 'CHI 311 service unavailable' },
      { status: 502 },
    )
  }
  const text2 = await res2.text()
  let json2: unknown
  try {
    json2 = JSON.parse(text2) as unknown
  } catch {
    return NextResponse.json(
      { success: false, error: 'CHI 311 service unavailable' },
      { status: 502 },
    )
  }
  const a2 = getFirstActionJson(json2)
  if (a2.error) {
    return NextResponse.json(
      { success: false, error: 'Service request not found' },
      { status: 502 },
    )
  }
  const rv2 = unwrapReturnValue(a2.returnValue) as {
    serviceRequest?: { WorkOrders?: unknown[]; workOrderObjs?: unknown }
    WorkOrders?: unknown[]
  }
  const srBlock = (rv2 as { serviceRequest?: { WorkOrders?: unknown[] } })?.serviceRequest
  const wos = srBlock?.WorkOrders ?? (rv2 as { WorkOrders?: unknown[] })?.WorkOrders
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

  const work_order_id: string | null = typeof wo0?.Id === 'string' ? wo0.Id : null
  const work_type_id: string | null = typeof wo0?.WorkTypeId === 'string' ? wo0.WorkTypeId : null
  const slaN = wo0?.WorkType?.C311_SLA__c
  const meanN = wo0?.WorkType?.C311_Calculated_Mean__c
  const woliData = getWOLIData(rv2 as unknown)
  const woData: {
    sla_target_days: number | null
    actual_mean_days: number | null
    estimated_completion: string | null
    work_order_status: string | null
    workflow_step: string | null
    work_order_steps: WOLIStep[]
    final_outcome: string | null
  } = {
    sla_target_days: slaN == null || Number.isNaN(Number(slaN)) ? null : Math.round(Number(slaN)),
    actual_mean_days: meanN == null || Number.isNaN(Number(meanN)) ? null : Math.round(Number(meanN)),
    estimated_completion: wo0?.C311_Estimated_Completion_Date__c
      ? String(wo0.C311_Estimated_Completion_Date__c).trim() || null
      : null,
    work_order_status: typeof wo0?.Status === 'string' ? wo0.Status : null,
    workflow_step: woliData.workflow_step,
    work_order_steps: woliData.work_order_steps,
    final_outcome: woliData.final_outcome,
  }

  let flexAnswers: Record<string, string> = {}
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
    const form3 = buildAuraFormBody(msg3, '/s/service-request-detail?language=en_US')
    const res3 = await fetch(URL_FLEX_ANSWERS, {
      method: 'POST',
      headers: AURA_HEADERS,
      body: form3,
    })
    if (!res3.ok) {
      flexAnswers = {}
    } else {
    const text3 = await res3.text()
    try {
      const json3 = JSON.parse(text3) as unknown
      const list3 = getFlexList(json3)
      flexAnswers = mapFlexAnswers(work_type_id, list3)
    } catch {
      flexAnswers = {}
    }
    }
  }

  const update: Record<string, unknown> = {
    salesforce_case_id: caseId,
    enriched_at: new Date().toISOString(),
  }

  if (wo0) {
    if (woData.sla_target_days != null) update.sla_target_days = woData.sla_target_days
    if (woData.actual_mean_days != null) update.actual_mean_days = woData.actual_mean_days
    if (woData.estimated_completion) update.estimated_completion = woData.estimated_completion
    if (woData.work_order_status) update.work_order_status = woData.work_order_status
    if (woData.workflow_step) update.workflow_step = woData.workflow_step
    if (woData.work_order_steps.length > 0) update.work_order_steps = woData.work_order_steps
    if (woData.final_outcome) update.final_outcome = woData.final_outcome
  }

  for (const [field, value] of Object.entries(flexAnswers)) {
    if (field === 'description') update.complaint_description = value
    else if (field === 'restaurant_name') update.restaurant_name = value
    else if (field === 'business_name') update.business_name = value
    else if (field === 'problem_category') update.problem_category = value
    else update[field] = value
  }

  const { data: updatedRows, error: upErr } = await supabaseAdmin
    .from('complaints_311')
    .update(update as Record<string, unknown>)
    .eq('sr_number', sr_number)
    .select('sr_number')

  if (upErr) {
    return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })
  }
  if (!updatedRows?.length) {
    return NextResponse.json(
      { success: false, error: 'No matching complaint row' },
      { status: 404 },
    )
  }

  // --- Best-effort paraphrase overlay ---
  // Runs after Aura enrichment is committed. paraphraseComplaint returns null
  // on any failure, in which case we skip the second update and return the
  // Aura data as-is. Never throws, never blocks the success response.
  const { data: srRow } = await supabaseAdmin
    .from('complaints_311')
    .select('sr_short_code, sr_type')
    .eq('sr_number', sr_number)
    .maybeSingle()

  const sr_short_code = (srRow as { sr_short_code?: string | null } | null)?.sr_short_code ?? null
  const sr_type = (srRow as { sr_type?: string | null } | null)?.sr_type ?? null

  const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null)

  if (sr_short_code) {
    const paraphrase = await paraphraseComplaint({
      sr_short_code,
      sr_type,
      description: asString(update.complaint_description),
      complainant_type: asString(update.complainant_type),
      unit_number: asString(update.unit_number),
      danger_reported: asString(update.danger_reported),
      owner_notified: asString(update.owner_notified),
      owner_occupied: asString(update.owner_occupied),
      concern_category: asString(update.concern_category),
      restaurant_name: asString(update.restaurant_name),
      business_name: asString(update.business_name),
      problem_category: asString(update.problem_category),
    })

    if (paraphrase) {
      const paraphrasedAt = new Date().toISOString()
      const { error: paraErr } = await supabaseAdmin
        .from('complaints_311')
        .update({
          standard_description: paraphrase.standard_description,
          trade_category: paraphrase.trade_category,
          urgency_tier: paraphrase.urgency_tier,
          paraphrased_at: paraphrasedAt,
        })
        .eq('sr_number', sr_number)

      if (!paraErr) {
        update.standard_description = paraphrase.standard_description
        update.trade_category = paraphrase.trade_category
        update.urgency_tier = paraphrase.urgency_tier
        update.paraphrased_at = paraphrasedAt
      }
    }
  }

  return NextResponse.json({ success: true, data: update })
}
