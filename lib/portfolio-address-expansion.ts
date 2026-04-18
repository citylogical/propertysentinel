/** Shared helpers for portfolio save: expand numeric ranges and list all queryable addresses. */

export function expandAddressRange(segment: string): string[] {
  let s = segment
    .trim()
    .toUpperCase()
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
  const suffixes: [RegExp, string][] = [
    [/\bSTREET\b/g, 'ST'],
    [/\bAVENUE\b/g, 'AVE'],
    [/\bBOULEVARD\b/g, 'BLVD'],
    [/\bDRIVE\b/g, 'DR'],
    [/\bCOURT\b/g, 'CT'],
    [/\bPLACE\b/g, 'PL'],
    [/\bLANE\b/g, 'LN'],
    [/\bROAD\b/g, 'RD'],
    [/\bWEST\b/g, 'W'],
    [/\bEAST\b/g, 'E'],
    [/\bNORTH\b/g, 'N'],
    [/\bSOUTH\b/g, 'S'],
  ]
  const normalize = (a: string) => {
    let r = a.trim().toUpperCase()
    for (const [p, rep] of suffixes) r = r.replace(p, rep)
    return r.replace(/\s+/g, ' ').trim()
  }
  const m = s.match(/^(\d+)\s*-\s*(\d+)\s+(.+)$/)
  if (m) {
    const low = parseInt(m[1], 10)
    const high = parseInt(m[2], 10)
    const street = normalize(m[3])
    const parity = low % 2
    const results: string[] = []
    for (let n = low; n <= high; n++) {
      if (n % 2 === parity) results.push(`${n} ${street}`)
    }
    return results
  }
  return [normalize(s)]
}

export function getAllAddresses(
  canonicalAddress: string,
  addressRange: string | null,
  additionalStreets: string[] | null
): string[] {
  const addrs = new Set<string>()
  addrs.add(canonicalAddress.toUpperCase().replace(/\s+/g, ' ').trim())
  if (addressRange) {
    for (const part of addressRange.split('&')) {
      for (const a of expandAddressRange(part)) addrs.add(a)
    }
  }
  if (additionalStreets) {
    for (const s of additionalStreets) {
      if (s?.trim()) {
        for (const part of s.split('&')) {
          for (const a of expandAddressRange(part)) addrs.add(a)
        }
      }
    }
  }
  addrs.delete('')
  return Array.from(addrs)
}

/** Segments of `addressRange` (split on ` & `) whose expanded addresses do not include `canonicalNormalized`. */
export function additionalStreetSegmentsForPortfolio(
  addressRange: string | null,
  canonicalNormalized: string
): string[] {
  if (!addressRange?.trim()) return []
  const canonical = canonicalNormalized.toUpperCase().replace(/\s+/g, ' ').trim()
  const segments = addressRange
    .split(' & ')
    .map((p) => p.trim())
    .filter(Boolean)
  return segments.filter((seg) => {
    const expanded = expandAddressRange(seg)
    return !expanded.includes(canonical)
  })
}
