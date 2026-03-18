// Class Codes 
//https://prodassets.cookcountyassessoril.gov/s3fs-public/form_documents/classcode.pdf


export const CLASS_CODE_DESCRIPTIONS: Record<string, string> = {
    // Major Class 0 — Exempt
    'EX': 'Exempt Property',
    'RR': 'Railroad Property',
  
    // Major Class 1 — Vacant
    '100': 'Vacant Land',
    '190': 'Minor Improvement on Vacant Land',
  
    // Major Class 2 — Residential
    '200': 'Residential Land',
    '201': 'Residential Garage',
    '202': 'One-story Residence (under 999 sqft)',
    '203': 'One-story Residence (1,000–1,800 sqft)',
    '204': 'One-story Residence (1,801+ sqft)',
    '205': 'Two+ story Residence, 62+ years (under 2,200 sqft)',
    '206': 'Two+ story Residence, 62+ years (2,201–4,999 sqft)',
    '207': 'Two+ story Residence, under 62 years (under 2,000 sqft)',
    '208': 'Two+ story Residence, under 62 years (3,801–4,999 sqft)',
    '209': 'Two+ story Residence (5,000+ sqft)',
    '210': 'Old Style Row House / Townhome, 62+ years',
    '211': 'Apartment Building, 2–6 Units',
    '212': 'Mixed-Use Commercial/Residential, 6 units or less',
    '213': 'Cooperative',
    '218': 'Bed & Breakfast, owner-occupied',
    '219': 'Bed & Breakfast, non-owner-occupied',
    '224': 'Farm Building',
    '225': 'Single-Room Occupancy (SRO)',
    '234': 'Split Level Residence',
    '236': 'Residential Area on Commercial/Industrial Parcel',
    '239': 'Non-Equalized Agricultural Land',
    '240': 'First-Time Agricultural Use',
    '241': 'Vacant Land Adjacent to Residence',
    '278': 'Two+ story Residence, under 62 years (2,001–3,800 sqft)',
    '288': 'Home Improvement Exemption',
    '290': 'Minor Residential Improvement',
    '295': 'Individually Owned Townhome/Row House, under 62 years',
    '297': 'Special Residential Improvement',
    '299': 'Residential Condominium',
  
    // Major Class 3 — Multi-Family
    '300': 'Land — Rental Apartments',
    '301': 'Ancillary Structures — Rental Apartments',
    '313': 'Two-or-Three Story Apartment, 7+ Units',
    '314': 'Non-Fireproof Corridor Apartments, Exterior Entrance',
    '315': 'Non-Fireproof Corridor Apartments, Interior Entrance',
    '318': 'Mixed-Use Commercial/Residential, 7+ Units',
    '391': 'Apartment Building, 3+ Stories, 7+ Units',
    '396': 'Rented Modern Row Houses, 7+ Units',
    '397': 'Special Rental Structure',
    '399': 'Rental Condominium',
  
    // Major Class 4 — Not-For-Profit
    '400': 'Not-for-Profit Land',
    '417': 'Not-for-Profit One-Story Commercial',
    '491': 'Not-for-Profit Building, 3+ Stories',
    '492': 'Not-for-Profit Two-or-Three Story Mixed-Use',
    '493': 'Not-for-Profit Industrial Building',
    '497': 'Not-for-Profit Special Structure',
    '499': 'Not-for-Profit Condominium',
  
    // Major Class 5A — Commercial
    '500': 'Commercial Land',
    '516': 'Hotel or Rooming House',
    '517': 'One-Story Commercial Building',
    '522': 'One-Story Public Garage',
    '523': 'Gasoline Station',
    '526': 'Commercial Greenhouse',
    '527': 'Theatre',
    '528': 'Bank Building',
    '529': 'Motel',
    '530': 'Supermarket',
    '531': 'Shopping Center',
    '532': 'Bowling Alley',
    '533': 'Quonset Hut / Butler Building',
    '535': 'Golf Course',
    '590': 'Commercial Minor Improvement',
    '591': 'Commercial Building, 3+ Stories',
    '592': 'Two-or-Three Story Commercial Building',
    '597': 'Special Commercial Structure',
    '599': 'Commercial Condominium',
  
    // Major Class 5B — Industrial
    '550': 'Industrial Land',
    '580': 'Industrial Minor Improvement',
    '583': 'Industrial Quonset Hut / Butler Building',
    '587': 'Special Industrial Improvement',
    '589': 'Industrial Condominium',
    '593': 'Industrial Building',
  
    // Major Class 6 — Industrial Incentive
    '651': 'Industrial Incentive Land (6b)',
    '663': 'Industrial Incentive Building (6b)',
  
    // Major Class 7 — Commercial Incentive
    '700': 'Commercial Incentive Land (7a)',
    '717': 'One-Story Commercial Incentive (7a)',
    '790': 'Office Building (7a)',
    '799': 'Commercial/Industrial Condo — Incentive',
  
    // Major Class 8 — Commercial/Industrial Incentive
    '800': 'Commercial Incentive Land (8)',
    '891': 'Office Building (8)',
    '893': 'Industrial Building (8)',
  
    // Major Class 9 — Multi-Family Incentive
    '900': 'Incentive Rental Apartment Land',
    '913': 'Two-or-Three Story Incentive Apartment, 7+ Units',
    '991': 'Incentive Apartment Building, 3+ Stories',
  }
  
  export function getClassDescription(classCode: string | null | undefined): string | null {
    if (!classCode) return null
    // Normalize: strip dashes, leading zeros on major class prefix
    const normalized = classCode.toString().replace('-', '').replace(/^0+/, '')
    return CLASS_CODE_DESCRIPTIONS[normalized] ?? null
  }