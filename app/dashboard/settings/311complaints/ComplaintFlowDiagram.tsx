'use client'

import { useEffect, useRef } from 'react'

/**
 * ComplaintFlowDiagram — owner-relevance / liability / department Sankey for
 * Chicago 311 SR codes. Ported from the internal sr-flow reference diagram.
 *
 * Enrichment encoding (node/link colour + legend) is ADMIN-ONLY. When
 * isAdmin is false, every code node renders in one neutral owner-relevance
 * tone, the enrichment legend is omitted, and the enrichment footer line is
 * dropped — enrichment is invisible to non-admins.
 *
 * Data (RAW, ENF) is byte-identical to the reference diagram; do not hand-edit
 * here — regenerate from the source of truth.
 */

type Liability = 'citizen' | 'city' | 'info'
interface CodeRow {
  code: string
  name: string
  dept: string
  liab: Liability
  owner: boolean
  edge: boolean
  state: 'city' | 'port' | 'none'
}

const RAW: Array<[string, string, string, Liability, boolean, boolean?]> = [
  ['BBA','Building Violation','DOB','citizen',true],
  ['BBC','Plumbing Violation','DOB','citizen',true],
  ['BBD','No Permit / Construction','DOB','citizen',true],
  ['BBK','Vacant/Abandoned Bldg','DOB','citizen',true],
  ['BPI','Porch Inspection','DOB','citizen',true],
  ['NAC','No Air Conditioning','DOB','citizen',true],
  ['AAF','Water in Basement','DWM','citizen',true],
  ['WBJ','No Water','DWM','citizen',true],
  ['WBK','Low Water Pressure','DWM','citizen',true],
  ['WCA','Water Quality Concern','DWM','citizen',true],
  ['WCA2','Water Lead Test Kit','DWM','citizen',true],
  ['WCA3','Water Lead Test Visit','DWM','citizen',true],
  ['WM3','Check for Leak','DWM','citizen',true],
  ['AAD','Sewer Cave-In Inspection','DWM','citizen',true,true],   // edge
  ['AAI','Alley Sewer Inspection','DWM','citizen',true,true],     // edge
  ['AAE','Water On Street','DWM','city',false],
  ['WBT','Open Fire Hydrant','DWM','city',false],
  ['CHECKFOR','Sewer Cleaning Inspection','DWM','city',false],
  ['HFB','Restaurant Complaint','Health','citizen',false],
  ['HDF','Lead Inspection','Health','citizen',true],
  ['CORNVEND','Pushcart Food Vendor','Health','citizen',false],
  ['PETCO','Petcoke Dust','Health','citizen',false],
  ['HFF','Smokeless Tobacco @ Event','Health','citizen',false],
  ['LPRC','Lic. Pharma Rep','Health','citizen',false],
  ['RBL','Business Complaint','BACP','citizen',false],
  ['BAG','Tobacco — General','BACP','citizen',false],
  ['BAM','Tobacco — Sale to Minors','BACP','citizen',false],
  ['LIQUORCO','Liquor Establishment','BACP','citizen',false],
  ['CSF','Consumer Fraud','BACP','citizen',false],
  ['CST','Consumer Retail Biz','BACP','citizen',false],
  ['CAFE','Sidewalk Café / Dining','BACP','citizen',false],
  ['FPC','Inaccurate Fuel Pump','BACP','citizen',false],
  ['INR','Inaccurate Retail Scales','BACP','citizen',false],
  ['ODM','Outdated Merchandise','BACP','citizen',false],
  ['MWC','Wage Complaint','BACP','citizen',false],
  ['PSL','Paid Sick Leave','BACP','citizen',false],
  ['NOSOLCPP','No Solicitation','BACP','citizen',false],
  ['RFC','Renters & Foreclosure','BACP','citizen',true],
  ['SHVR','Shared Housing / STR','BACP','citizen',true],
  ['CSC','Cab Feedback','BACP','citizen',false],
  ['CSP','Public Vehicle / Valet','BACP','citizen',false],
  ['TNP','Ridesharing','BACP','citizen',false],
  ['OCC','Cable TV Complaint','BACP','citizen',false],
  ['SCB','Sanitation Code Violation','DSS','citizen',true],
  ['SGA','Rodent Baiting / Rat','DSS','citizen',true],
  ['SCX','Recycling Inspection','DSS','citizen',true],
  ['SCT','Clean Vacant Lot','DSS','citizen',true],
  ['SCP','Weed Removal','DSS','citizen',true],
  ['GRAF','Graffiti Removal','DSS','city',false],
  ['SDR','Fly Dumping','DSS','citizen',true],
  ['SEC','Tree Emergency','DSS','city',true],   // owner-relevant via portfolio, city pays
  ['SEE','Tree Removal Inspection','DSS','city',false],
  ['SCC','Missed Garbage Pickup','DSS','city',false],
  ['SCQ','Yard Waste Pickup','DSS','city',false],
  ['SCS','Wire Basket Request','DSS','city',false],
  ['SIE','Garbage Cart Maint.','DSS','city',false],
  ['SRRC','Blue Recycling Cart','DSS','city',false],
  ['SRRP','Recycling Pickup','DSS','city',false],
  ['SGQ','Dead Animal Pickup','DSS','city',false],
  ['SGV','Dead Bird','DSS','city',false],
  ['SGG','Bee / Wasp Removal','DSS','city',false],
  ['NAA','Clean & Green Program','DSS','city',false],
  ['SKA','Abandoned Vehicle','DSS','city',false],
  ['SDO','Ice & Snow Removal','DSS','city',false],
  ['SDP','Street Cleaning','DSS','city',false],
  ['SDW','Snow / Dibs Removal','DSS','city',false],
  ['SED','Tree Planting','DSS','city',false],
  ['SEF','Tree Trim (discontinued)','DSS','city',false],
  ['SEL','Tree Debris Cleanup','DSS','city',false],
  ['SWSNOREM','Snow — Uncleared Sidewalk','CDOT','citizen',true],
  ['SCSP','Shared Cost Sidewalk','CDOT','citizen',true],
  ['PBE','Pavement Cave-In','CDOT','city',false],
  ['PBD','Inspect Public Way','CDOT','city',false],
  ['PBS','Sidewalk Inspection','CDOT','city',false],
  ['PBLDR','Bike Lane Debris','CDOT','city',false],
  ['SFA','Alley Light Out','CDOT','city',false],
  ['SFB','Traffic Signal Out','CDOT','city',false],
  ['SFC','Viaduct Light Out','CDOT','city',false],
  ['SFD','Street Light Out','CDOT','city',false],
  ['SFK','Light Pole Damage','CDOT','city',false],
  ['SFN','Street Light On Day','CDOT','city',false],
  ['SFQ','Light Pole Door Missing','CDOT','city',false],
  ['SNPBLBS','Snow — Bike Lane/Bridge','CDOT','city',false],
  ['PCB','Sign Repair — Stop','CDOT','city',false],
  ['PCC','Sign Repair — One Way','CDOT','city',false],
  ['PCD','Sign Repair — Do Not Enter','CDOT','city',false],
  ['PCE','Sign Repair — Other','CDOT','city',false],
  ['PHB','Alley Pothole','CDOT','city',false],
  ['PHF','Pothole in Street','CDOT','city',false],
  ['PCL','Bicycle Request','CDOT','citizen',false],
  ['PCL3','E-Scooter','CDOT','citizen',false],
  ['VBL','Vehicle in Bike Lane','CDOT','citizen',false],
  ['EAF','Vicious Animal','ACC','citizen',true],
  ['EAB','Nuisance Animal','ACC','citizen',false],
  ['EAE','Stray Animal','ACC','city',false],
  ['EAQ','Injured Animal','ACC','city',false],
  ['EBD','Animal In Trap','ACC','city',false],
  ['CIAC','Coyote Interaction','ACC','city',false],
  ['PET','Pet Wellness Check','ACC','citizen',false],
  ['FAC','Commercial Fire Safety','Fire','citizen',true],
  ['FPCE','Parking Code Enf. Review','Finance','citizen',false],
  ['QAC','City Vehicle Sticker','Clerk','citizen',false],
  ['AVN','Aircraft Noise','Aviation','info',false],
  ['BUNGALOW','Bungalow Info Request','Housing','info',false],
  ['HOP','Home Buyer Program Info','Housing','info',false],
  ['DBPC','Divvy Bike Parking','Outside','citizen',false],
  ['ESPC','E-Scooter Parking','Outside','citizen',false],
  ['DBES','Submerged Divvy/Lime','Outside','citizen',false],
  ['311IOC','311 Info Only Call','311','info',false],
  ['JNS','Extreme Weather Notice','EWN','info',false],
]

const PORTFOLIO_ONLY = new Set([
  'SEC', 'EAF', 'SGA', 'WCA3', 'SCX', 'SCT', 'SCP', 'SWSNOREM', 'SCSP', 'SDR',
])
const ENRICH = new Set([
  'BBA', 'BBC', 'BBD', 'BBK', 'BPI', 'HDF', 'SCB',
  'HFB', 'RBL', 'CAFE', 'CORNVEND', 'SHVR',
  'CSF', 'CST', 'BAG', 'BAM', 'FPC', 'ODM', 'MWC',
  'AAF', 'NAC', 'WBJ', 'WBK', 'FAC', 'WCA',
  'WM3', 'AAD', 'AAI', 'RFC',
  'SEC', 'EAF', 'SGA', 'WCA3', 'SCX', 'SCT', 'SCP', 'SWSNOREM', 'SCSP', 'SDR',
])
function enrichState(c: string): 'city' | 'port' | 'none' {
  return PORTFOLIO_ONLY.has(c) ? 'port' : ENRICH.has(c) ? 'city' : 'none'
}

const ENF_COLOR: Record<string, string> = {
  fine: '#a3392c', cost: '#8a5a1a', order: '#5b6b7d', none: '#8b95a2',
}
interface EnfEntry { cite: string; amount: string; kind: string; note?: string }
const ENF: Record<string, EnfEntry> = {
BBA: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  BBC: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  BBD: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  BBK: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  BPI: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  NAC: {cite:'MCC 13-12-040', amount:'$500–$1,000 / day', kind:'fine', note:'max; usually settled on cure'},
  SWSNOREM: {cite:'MCC 10-28 / 10-8-180', amount:'$50–$500 / day', kind:'fine', note:'owner clears abutting walk'},
  SGA: {cite:'MCC 7-28-710', amount:'$300–$600 / day', kind:'fine', note:'rat-harborage / DSS ticket'},
  SCX: {cite:'MCC Ch. 11-5', amount:'$500–$5,000', kind:'fine', note:'30-day cure; escalates on repeat'},
  SHVR: {cite:'MCC 4-6-300', amount:'$1,500–$5,000 / day', kind:'fine', note:'unlicensed/egregious higher'},
  EAF: {cite:'MCC 7-12-090', amount:'$300–$500 / day', kind:'fine', note:'+ impound at owner expense'},
  FAC: {cite:'MCC 15-4 / 2-36-300', amount:'$500 / day', kind:'fine', note:'15-day correction notice'},
  SCSP: {cite:'CDOT program', amount:'~$600–$1,500 bill', kind:'cost', note:'cost-share, paid to Finance'},
  SCB: {cite:'MCC 7-28', amount:'~$300–$600 / day', kind:'fine', note:'varies by sub-section'},
  SCT: {cite:'MCC 7-28-120', amount:'abatement + lien', kind:'cost', note:'city cleans, liens owner'},
  SDR: {cite:'MCC 7-28-450 / 440', amount:'$1,500+ / removal', kind:'fine', note:'dumper $1,500+; owner must remove debris'},
  SCP: {cite:'MCC 7-28-120', amount:'abatement + lien', kind:'cost', note:'city cuts, liens owner'},
  HDF: {cite:'MCC 7-4-030', amount:'abatement order', kind:'order', note:'CDPH order; no fixed fine'},
  RFC: {cite:'BACP enforcement', amount:'varies', kind:'order', note:'consumer-protection action'},
  AAF: {cite:'DWM determination', amount:'repair liability', kind:'none', note:'owner if private line'},
  WBJ: {cite:'DWM determination', amount:'repair liability', kind:'none', note:'owner if private line'},
  WBK: {cite:'DWM determination', amount:'repair liability', kind:'none', note:'owner if private line'},
  WCA: {cite:'DWM determination', amount:'repair liability', kind:'none', note:'owner if private line'},
  WCA2:{cite:'DWM service', amount:'no fine', kind:'none', note:'test-kit request'},
  WCA3:{cite:'DWM service', amount:'no fine', kind:'none', note:'test-visit request'},
  WM3: {cite:'DWM determination', amount:'repair liability', kind:'none', note:'"Owner\u2019s Responsibility" outcome'},
  AAD: {cite:'DWM — at resolution', amount:'repair liability', kind:'none', note:'city main vs. owner lateral'},
  AAI: {cite:'DWM — at resolution', amount:'repair liability', kind:'none', note:'city main vs. owner lateral'},
  SEC: {cite:'DSS Forestry', amount:'city-funded', kind:'none', note:'city work; portfolio signal'},
}

const DEPT_META: Record<string, { label: string; color: string }> = {
  DOB: { label: 'DOB — Buildings', color: '#1a3a5c' },
  DWM: { label: 'DWM — Water Mgmt', color: '#2563a8' },
  Health: { label: 'Health', color: '#0f766e' },
  BACP: { label: 'BACP — Business Affairs', color: '#7c4dad' },
  DSS: { label: 'Streets & Sanitation', color: '#c2783f' },
  CDOT: { label: 'CDOT — Transportation', color: '#5b6b7d' },
  ACC: { label: 'Animal Care & Control', color: '#2f8f5b' },
  Fire: { label: 'Fire', color: '#b3401f' },
  Finance: { label: 'Finance', color: '#8a7a3f' },
  Clerk: { label: "City Clerk's Office", color: '#7a6a55' },
  Aviation: { label: 'Aviation', color: '#6b7c8c' },
  Housing: { label: 'Housing', color: '#4f7a52' },
  Outside: { label: 'Outside Agencies', color: '#9aa3ad' },
  '311': { label: '311 City Services', color: '#9aa3ad' },
  EWN: { label: 'Extreme Weather Notif.', color: '#9aa3ad' },
}
const DEPT_ORDER = ['DOB', 'DWM', 'Health', 'BACP', 'DSS', 'CDOT', 'ACC', 'Fire', 'Finance', 'Clerk', 'Aviation', 'Housing', 'Outside', '311', 'EWN']

const LIAB_META: Record<Liability, { label: string; color: string }> = {
  citizen: { label: 'Citizen Responsibility', color: '#166534' },
  city: { label: 'City Responsibility', color: '#2563a8' },
  info: { label: 'Informational', color: '#9aa3ad' },
}
const LIAB_ORDER: Liability[] = ['citizen', 'city', 'info']

const OWNER_META: Record<string, { label: string; color: string }> = {
  yes: { label: 'Owner-Relevant', color: '#b7791f' },
  no: { label: 'Not Owner-Relevant', color: '#c3c8cf' },
}
const OWNER_ORDER = ['yes', 'no']

// Enrichment palette (admin) vs neutral (non-admin).
const ENRICH_COLOR = { city: '#166534', port: '#b7791f', none: '#8a93a0' }
const NEUTRAL_NODE = '#166534' // single owner-relevance tone for non-admins

export default function ComplaintFlowDiagram({ isAdmin }: { isAdmin: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // clear any prior render (StrictMode double-invoke / re-render safety)
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const SVG_NS = 'http://www.w3.org/2000/svg'
    const el = (t: string, a: Record<string, string | number> = {}, p: Element = svg) => {
      const n = document.createElementNS(SVG_NS, t)
      for (const k in a) n.setAttribute(k, String(a[k]))
      p.appendChild(n)
      return n
    }

    const codes: CodeRow[] = RAW.map(([code, name, dept, liab, owner, edge]) => ({
      code, name, dept, liab, owner, edge: !!edge, state: enrichState(code),
    }))

    function codeColor(c: CodeRow) {
      return isAdmin ? ENRICH_COLOR[c.state] : NEUTRAL_NODE
    }

    const W = 1454, TOP = 60, NODE_W = 12, ROW_H = 18, SLICE = ROW_H, NODE_GAP = 16, COL_TOP = TOP + 12
    const X = { dept: 24, deptLbl: 24 + NODE_W + 8, liab: 214, liabLbl: 214 + NODE_W + 8, owner: 419, ownerLbl: 419 + NODE_W + 8, code: 599, enf: 829, src: 953, note: 1071, end: W - 20 }

    function orderedCodes(): (CodeRow | null)[] {
      const out: (CodeRow | null)[] = []
      for (const owner of OWNER_ORDER) {
        for (const liab of LIAB_ORDER) {
          for (const dept of DEPT_ORDER) {
            out.push(...codes.filter((c) => (c.owner ? 'yes' : 'no') === owner && c.liab === liab && c.dept === dept))
          }
        }
        out.push(null)
      }
      out.pop()
      return out
    }
    const codeOrder = orderedCodes()
    const codeY: Record<string, number> = {}
    let y = COL_TOP + 14
    for (const c of codeOrder) { if (c === null) { y += 16; continue } codeY[c.code] = y; y += ROW_H }

    type Node = { id: string; label?: string; color: string; count: number; top: number; bot: number; mid: number; h: number; outY: number; inY: number }
    function stackColumn(items: Array<{ id: string; label?: string; color: string; count: number }>): Node[] {
      let cy = COL_TOP
      return items.map((it) => {
        const h = it.count * SLICE
        const n: Node = { ...it, h, top: cy, bot: cy + h, mid: cy + h / 2, outY: cy, inY: cy }
        cy = n.bot + NODE_GAP
        return n
      })
    }

    const deptList = stackColumn(
      DEPT_ORDER.map((d) => { const c = codes.filter((x) => x.dept === d).length; return c ? { id: d, label: DEPT_META[d].label, color: DEPT_META[d].color, count: c } : null })
        .filter(Boolean) as Array<{ id: string; label: string; color: string; count: number }>
    )
    const deptNodes: Record<string, Node> = {}; deptList.forEach((n) => (deptNodes[n.id] = n))

    const liabList = stackColumn(LIAB_ORDER.map((l) => ({ id: l, label: LIAB_META[l].label, color: LIAB_META[l].color, count: codes.filter((c) => c.liab === l).length })))
    const liabNodes: Record<string, Node> = {}; liabList.forEach((n) => (liabNodes[n.id] = n))

    const ownerList = stackColumn(OWNER_ORDER.map((o) => ({ id: o, label: OWNER_META[o].label, color: OWNER_META[o].color, count: codes.filter((c) => (c.owner ? 'yes' : 'no') === o).length })))
    const ownerNodes: Record<string, Node> = {}; ownerList.forEach((n) => (ownerNodes[n.id] = n))

    const bandPath = (x0: number, ya0: number, ya1: number, x1: number, yb0: number, yb1: number) => {
      const mx = (x0 + x1) / 2
      return `M${x0},${ya0} C${mx},${ya0} ${mx},${yb0} ${x1},${yb0} L${x1},${yb1} C${mx},${yb1} ${mx},${ya1} ${x0},${ya1} Z`
    }
    const ribbon = (x0: number, y0: number, x1: number, y1: number) => {
      const mx = (x0 + x1) / 2
      return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`
    }

    // column headers
    const heads: Array<[number, string]> = [[X.dept, 'Department Owner'], [X.liab, 'Responsibility'], [X.owner, 'Property Owner'], [X.code, 'SR Code'], [X.code + NODE_W + 8 + 76, 'Complaint Type'], [X.enf, 'Enforcement'], [X.src, 'Source'], [X.note, 'Notes']]
    for (const [x, t] of heads) { const n = el('text', { x, y: 34, class: 'cf-colhead' }); n.textContent = t }

    const linkLayer = el('g')
    const nodeLayer = el('g')

    // bands: department -> liability
    for (const dept of DEPT_ORDER) {
      const dn = deptNodes[dept]; if (!dn) continue
      for (const liab of LIAB_ORDER) {
        const m = codes.filter((c) => c.dept === dept && c.liab === liab); if (!m.length) continue
        const ln = liabNodes[liab]; const h = m.length * SLICE
        const ya0 = dn.outY, ya1 = dn.outY + h, yb0 = ln.inY, yb1 = ln.inY + h
        dn.outY += h; ln.inY += h
        el('path', { d: bandPath(X.dept + NODE_W, ya0, ya1, X.liab, yb0, yb1), class: `cf-band dr-dept-${dept} dr-liab-${liab}`, fill: dn.color, opacity: 0.17 }, linkLayer)
      }
    }
    // bands: liability -> property owner
    for (const liab of LIAB_ORDER) {
      const ln = liabNodes[liab]; if (!ln.count) continue
      for (const owner of OWNER_ORDER) {
        const m = codes.filter((c) => c.liab === liab && (c.owner ? 'yes' : 'no') === owner); if (!m.length) continue
        const on = ownerNodes[owner]; const h = m.length * SLICE
        const ya0 = ln.outY, ya1 = ln.outY + h, yb0 = on.inY, yb1 = on.inY + h
        ln.outY += h; on.inY += h
        el('path', { d: bandPath(X.liab + NODE_W, ya0, ya1, X.owner, yb0, yb1), class: `cf-band lo-liab-${liab} lo-owner-${owner}`, fill: ln.color, opacity: 0.16 }, linkLayer)
      }
    }
    // links: property owner -> code
    const ownerOutCursor: Record<string, number> = {}; OWNER_ORDER.forEach((o) => (ownerOutCursor[o] = ownerNodes[o].top))
    const codeLinks: Record<string, SVGElement> = {}
    const codeLinkOy: Record<string, number> = {}
    for (const c of codeOrder) {
      if (c === null) continue
      const ownerKey = c.owner ? 'yes' : 'no'
      const oy = ownerOutCursor[ownerKey] + SLICE / 2
      ownerOutCursor[ownerKey] += SLICE
      codeLinkOy[c.code] = oy
      const p = el('path', { d: ribbon(X.owner + NODE_W, oy, X.code, codeY[c.code]), class: `cf-link code-${c.code}`, stroke: codeColor(c), 'stroke-opacity': (isAdmin && c.state === 'none') ? 0.16 : 0.4, 'stroke-width': SLICE * 0.62, fill: 'none' }, linkLayer)
      codeLinks[c.code] = p as SVGElement
    }

    // hover isolate
    function clearHot() { svg!.classList.remove('cf-hashover'); svg!.querySelectorAll('.cf-hot').forEach((n) => n.classList.remove('cf-hot')) }
    function lightCode(c: CodeRow) {
      svg!.querySelector(`.code-node-${c.code}`)?.classList.add('cf-hot')
      codeLinks[c.code]?.classList.add('cf-hot')
      svg!.querySelector(`.dept-node-${c.dept}`)?.classList.add('cf-hot')
      svg!.querySelector(`.liab-node-${c.liab}`)?.classList.add('cf-hot')
      svg!.querySelector(`.owner-node-${c.owner ? 'yes' : 'no'}`)?.classList.add('cf-hot')
      svg!.querySelector(`.dr-dept-${c.dept}.dr-liab-${c.liab}`)?.classList.add('cf-hot')
      svg!.querySelector(`.lo-liab-${c.liab}.lo-owner-${c.owner ? 'yes' : 'no'}`)?.classList.add('cf-hot')
    }
    function hookCode(g: Element, c: CodeRow) { g.addEventListener('mouseenter', () => { svg!.classList.add('cf-hashover'); g.classList.add('cf-hot'); lightCode(c) }); g.addEventListener('mouseleave', clearHot) }
    function hookDept(g: Element, d: string) { g.addEventListener('mouseenter', () => { svg!.classList.add('cf-hashover'); g.classList.add('cf-hot'); codes.filter((c) => c.dept === d).forEach(lightCode) }); g.addEventListener('mouseleave', clearHot) }
    function hookLiab(g: Element, l: string) { g.addEventListener('mouseenter', () => { svg!.classList.add('cf-hashover'); g.classList.add('cf-hot'); codes.filter((c) => c.liab === l).forEach(lightCode) }); g.addEventListener('mouseleave', clearHot) }
    function hookOwner(g: Element, o: string) { g.addEventListener('mouseenter', () => { svg!.classList.add('cf-hashover'); g.classList.add('cf-hot'); codes.filter((c) => (c.owner ? 'yes' : 'no') === o).forEach(lightCode) }); g.addEventListener('mouseleave', clearHot) }

    const drawBand = (x: number, top: number, bot: number, color: string, g: Element) => el('rect', { x, y: top, width: NODE_W, height: bot - top, fill: color, class: 'cf-noderect', rx: 3 }, g)

    for (const dept of DEPT_ORDER) {
      const dn = deptNodes[dept]; if (!dn) continue
      const g = el('g', { class: `cf-nodegroup dept-node-${dept}` }, nodeLayer)
      drawBand(X.dept, dn.top, dn.bot, dn.color, g)
      const t1 = el('text', { x: X.deptLbl, y: dn.mid - 6, class: 'cf-nodelabel' }, g); t1.textContent = dn.label || ''
      const t2 = el('text', { x: X.deptLbl, y: dn.mid + 8, class: 'cf-nodesub' }, g); t2.textContent = `${dn.count} codes`
      hookDept(g, dept)
    }
    for (const liab of LIAB_ORDER) {
      const ln = liabNodes[liab]
      const g = el('g', { class: `cf-nodegroup liab-node-${liab}` }, nodeLayer)
      drawBand(X.liab, ln.top, ln.bot, ln.color, g)
      const liabLabelY = Math.min(ln.mid, ln.top + 90)
      const t1 = el('text', { x: X.liabLbl, y: liabLabelY - 6, class: 'cf-nodelabel' }, g); t1.textContent = ln.label || ''
      const t2 = el('text', { x: X.liabLbl, y: liabLabelY + 8, class: 'cf-nodesub' }, g); t2.textContent = `${ln.count} codes`
      hookLiab(g, liab)
    }
    for (const owner of OWNER_ORDER) {
      const on = ownerNodes[owner]
      const g = el('g', { class: `cf-nodegroup owner-node-${owner}` }, nodeLayer)
      drawBand(X.owner, on.top, on.bot, on.color, g)

      const labelX = X.owner - 14
      const ruleLeft = labelX - 100
      const topRuleY = on.top - 6
      const alertLine = owner === 'yes' ? 'Alerts Enabled' : 'Alerts Off'

      // Full-width divider above the label — same color for both groups.
      el('line', { x1: ruleLeft, y1: topRuleY, x2: X.end, y2: topRuleY, class: 'cf-ownerrule' }, g)
      // Three stacked lines: group name, alert state (same font), count (sub style).
      const t1 = el('text', { x: labelX, y: on.top + 12, class: 'cf-ownerlabel', 'text-anchor': 'end' }, g); t1.textContent = on.label || ''
      const t2 = el('text', { x: labelX, y: on.top + 28, class: 'cf-ownerlabel', 'text-anchor': 'end' }, g); t2.textContent = alertLine
      const t3 = el('text', { x: labelX, y: on.top + 43, class: 'cf-nodesub', 'text-anchor': 'end' }, g); t3.textContent = `${on.count} codes`

      hookOwner(g, owner)
    }
    for (const c of codes) {
      const g = el('g', { class: `cf-nodegroup code-node-${c.code}` }, nodeLayer)
      el('rect', { x: X.code, y: codeY[c.code] - ROW_H / 2 + 3, width: NODE_W, height: ROW_H - 6, fill: codeColor(c), class: 'cf-noderect', rx: 2 }, g)
      const lab = el('text', { x: X.code + NODE_W + 8, y: codeY[c.code], class: 'cf-codelabel' }, g); lab.textContent = c.code + (c.edge ? ' ⚑' : '')
      const nm = el('text', { x: X.code + NODE_W + 8 + 76, y: codeY[c.code], class: 'cf-codename' }, g); nm.textContent = c.name
      if (c.owner && ENF[c.code]) {
        const e = ENF[c.code]
        // Three fixed, left-aligned columns: amount (X.enf), source/MCC (X.src),
        // notes (X.note). Fixed x so citations align vertically regardless of
        // amount width — MCC sits directly above MCC, etc.
        const amt = el('text', { x: X.enf, y: codeY[c.code], class: 'cf-enfamount', fill: ENF_COLOR[e.kind] }, g); amt.textContent = e.amount
        const cite = el('text', { x: X.src, y: codeY[c.code], class: 'cf-enfcite' }, g); cite.textContent = e.cite
        if (e.note) {
          const note = el('text', { x: X.note, y: codeY[c.code], class: 'cf-enfnote' }, g); note.textContent = e.note
        }
      }
      hookCode(g, c)
    }


    // fit viewBox
    let maxY = 0
    svg.querySelectorAll('.cf-noderect').forEach((r) => { maxY = Math.max(maxY, +(r.getAttribute('y') || 0) + +(r.getAttribute('height') || 0)) })
    svg.querySelectorAll('.cf-codename').forEach((t) => { maxY = Math.max(maxY, +(t.getAttribute('y') || 0)) })
    svg.setAttribute('viewBox', `0 0 ${W} ${Math.ceil(maxY) + 28}`)
  }, [isAdmin])

  return (
    <div>
      {isAdmin && (
        <div className="cf-legend">
          <span className="cf-leg-item"><span className="cf-sw" style={{ background: '#166534' }} /> Enriched · citywide</span>
          <span className="cf-leg-item"><span className="cf-sw" style={{ background: '#b7791f' }} /> Enriched · portfolio only</span>
          <span className="cf-leg-item"><span className="cf-sw" style={{ background: '#8a93a0' }} /> Not enriched</span>
          <span className="cf-leg-note">Admin view · hover any node to isolate its flow</span>
        </div>
      )}
      <div className="cf-frame">
        <svg ref={svgRef} viewBox="0 0 1760 2600" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg" />
      </div>
      <div className="cf-footer">
        Department = city department that owns resolution. Responsibility = who bears cost/fault (city vs. any private party).
        Property Owner = whether a landlord needs to act. Enforcement = exact Municipal Code section + fine/cost/repair-liability;
        per-day figures are statutory maximums that typically settle on cure. ⚑ = responsibility determined at resolution.
        {isAdmin ? ' Colour = enrichment state (admin only).' : ''}
      </div>

      <style>{`.cf-frame {
          background: #fff;
          border: 1px solid rgba(15, 39, 68, 0.14);
          border-radius: var(--card-radius, 8px);
          box-shadow: var(--card-shadow, 0 1px 3px rgba(0,0,0,0.08));
          padding: 18px 14px 10px;
          overflow-x: auto;
        }
        .cf-frame svg { display: block; width: 100%; height: auto; }
        .cf-legend {
          display: flex; flex-wrap: wrap; gap: 18px; align-items: center;
          margin-bottom: 14px; padding: 12px 16px; background: #fff;
          border: 1px solid rgba(15, 39, 68, 0.14); border-radius: var(--card-radius, 8px);
          font-family: 'DM Mono', ui-monospace, monospace; font-size: 12.5px; color: #1a2230;
        }
        .cf-leg-item { display: flex; align-items: center; gap: 8px; }
        .cf-sw { width: 26px; height: 12px; border-radius: 3px; flex: none; display: inline-block; }
        .cf-leg-note { color: #6a7585; font-family: 'Inter', system-ui, sans-serif; margin-left: auto; }
        .cf-footer {
          margin-top: 16px; font-size: 12px; color: #6a7585; line-height: 1.55;
          font-family: 'DM Mono', ui-monospace, monospace;
        }
      

        .cf-colhead { font-family: 'DM Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; fill: #8b95a2; text-transform: uppercase; }
        .cf-noderect { transition: opacity 0.18s ease; }
        .cf-nodelabel { font-size: 12px; fill: #1a2230; font-weight: 500; dominant-baseline: middle; }
        .cf-ownerlabel { font-size: 13px; fill: #0f2744; font-weight: 600; dominant-baseline: middle; }
        .cf-ownerrule { stroke: #0f2744; stroke-width: 1; opacity: 0.55; }
        .cf-nodesub { font-size: 9.5px; fill: #7b8693; font-family: 'DM Mono', ui-monospace, monospace; dominant-baseline: middle; }
        .cf-codelabel { font-family: 'DM Mono', ui-monospace, monospace; font-size: 10px; fill: #1a2230; dominant-baseline: middle; }
        .cf-codename { font-size: 9.5px; fill: #2a3340; dominant-baseline: middle; }
        .cf-enfamount { font-size: 10px; font-weight: 500; dominant-baseline: middle; font-family: 'Inter', system-ui, sans-serif; }
        .cf-enfcite { font-size: 8.5px; fill: #3a4350; font-family: 'DM Mono', ui-monospace, monospace; dominant-baseline: middle; }
        .cf-enfnote { font-size: 8.5px; fill: #4a5360; dominant-baseline: middle; font-style: italic; }
        .cf-band { stroke: none; transition: opacity 0.18s ease; }
        .cf-link { transition: stroke-opacity 0.18s ease; }
        .cf-hashover .cf-band { opacity: 0.10 !important; }
        .cf-hashover .cf-band.cf-hot { opacity: 0.92 !important; }
        .cf-hashover .cf-link { stroke-opacity: 0.07 !important; }
        .cf-hashover .cf-link.cf-hot { stroke-opacity: 0.85 !important; }
        .cf-hashover .cf-nodegroup { opacity: 0.26; }
        .cf-hashover .cf-nodegroup.cf-hot { opacity: 1; }
        .cf-nodegroup { cursor: default; }`}</style>
    </div>
  )
}