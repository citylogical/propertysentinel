// SR Short Code Categories
// Source: Chicago 311 dataset v6vf-nfxy — full universe as of March 2026
//
// FILTER LOGIC:
// Default view ("Only Building Complaints") shows codes where defaultVisible = true
// "All Complaints" toggle shows everything
//
// defaultVisible = true for: Building, Business/Consumer, and selected Other codes
// defaultVisible = false for: Street Infrastructure, Street Nuisance (graffiti, parking, waste)

export type SRCategory = 'building' | 'street_infrastructure' | 'street_nuisance' | 'business' | 'other'

export interface SRCodeEntry {
  code: string
  label: string
  category: SRCategory
  defaultVisible: boolean
}

export const SR_CODES: SRCodeEntry[] = [

  // ── BUILDING — property condition, safety, compliance ──────────────────────
  { code: 'BBA',     label: 'Building Violation',                          category: 'building',           defaultVisible: true },
  { code: 'BBC',     label: 'Buildings - Plumbing Violation',              category: 'building',           defaultVisible: true },
  { code: 'BBD',     label: 'No Building Permit and Construction Violation', category: 'building',         defaultVisible: true },
  { code: 'BBK',     label: 'Vacant/Abandoned Building Complaint',         category: 'building',           defaultVisible: true },
  { code: 'BPI',     label: 'Porch Inspection Request',                    category: 'building',           defaultVisible: true },
  { code: 'FAC',     label: 'Commercial Fire Safety Inspection Request',   category: 'building',           defaultVisible: true },
  { code: 'HDF',     label: 'Lead Inspection Request',                     category: 'building',           defaultVisible: true },
  { code: 'SCB',     label: 'Sanitation Code Violation',                   category: 'building',           defaultVisible: true },
  { code: 'SHVR',    label: 'Shared Housing/Vacation Rental Complaint',    category: 'building',           defaultVisible: true },
  { code: 'NAC',     label: 'No Air Conditioning',                         category: 'building',           defaultVisible: true },
  { code: 'AAF',     label: 'Water in Basement Complaint',                 category: 'building',           defaultVisible: true },
  { code: 'WCA2',    label: 'Water Lead Test Kit Request',                 category: 'building',           defaultVisible: true },
  { code: 'WCA3',    label: 'Water Lead Test Visit Request',               category: 'building',           defaultVisible: true },
  { code: 'WM3',     label: 'Check for Leak',                              category: 'building',           defaultVisible: true },
  { code: 'WBJ',     label: 'No Water Complaint',                          category: 'building',           defaultVisible: true },
  { code: 'WBK',     label: 'Low Water Pressure Complaint',                category: 'building',           defaultVisible: true },
  { code: 'PETCO',   label: 'Petcoke Dust Complaint',                      category: 'building',           defaultVisible: true },
  { code: 'WCA',     label: 'Water Quality Concern',                       category: 'building',           defaultVisible: true },


  // ── BUSINESS / CONSUMER ────────────────────────────────────────────────────
  { code: 'HFB',     label: 'Restaurant Complaint',                        category: 'business',           defaultVisible: true },
  { code: 'RBL',     label: 'Business Complaints',                         category: 'business',           defaultVisible: true },
  { code: 'BAG',     label: 'Tobacco - General Complaint',                 category: 'business',           defaultVisible: true },
  { code: 'BAM',     label: 'Tobacco - Sale to Minors Complaint',          category: 'business',           defaultVisible: true },
  { code: 'LIQUORCO',label: 'Liquor Establishment Complaint',              category: 'business',           defaultVisible: true },
  { code: 'CSF',     label: 'Consumer Fraud Complaint',                    category: 'business',           defaultVisible: true },
  { code: 'CST',     label: 'Consumer Retail Business Complaint',          category: 'business',           defaultVisible: true },
  { code: 'CAFE',    label: 'Sidewalk Café/Outdoor Dining Complaint',      category: 'business',           defaultVisible: true },
  { code: 'CORNVEND',label: 'Pushcart Food Vendor Complaint',              category: 'business',           defaultVisible: true },
  { code: 'FPC',     label: 'Inaccurate Fuel Pump Complaint',              category: 'business',           defaultVisible: true },
  { code: 'INR',     label: 'Inaccurate Retail Scales Complaint',          category: 'business',           defaultVisible: true },
  { code: 'ODM',     label: 'Outdated Merchandise Complaint',              category: 'business',           defaultVisible: true },
  { code: 'MWC',     label: 'Wage Complaint',                              category: 'business',           defaultVisible: true },
  { code: 'PSL',     label: 'Paid Sick Leave Violation',                   category: 'business',           defaultVisible: true },
  { code: 'NOSOLCPP',label: 'No Solicitation Complaint',                   category: 'business',           defaultVisible: true },
  { code: 'HFF',     label: 'Smokeless Tobacco at Sports Event Complaint', category: 'business',           defaultVisible: true },
  { code: 'LPRC',    label: 'Licensed Pharmaceutical Representative Complaint', category: 'business',      defaultVisible: true },
  { code: 'RFC',     label: 'Renters and Foreclosure Complaint',           category: 'business',           defaultVisible: true },
  

  // ── OTHER — selected codes included in default view ────────────────────────
  { code: 'EAB',     label: 'Nuisance Animal Complaint',                   category: 'other',              defaultVisible: true },
  { code: 'EAE',     label: 'Stray Animal Complaint',                      category: 'other',              defaultVisible: true },
  { code: 'EAF',     label: 'Vicious Animal Complaint',                    category: 'other',              defaultVisible: true },
  { code: 'EAQ',     label: 'Report an Injured Animal',                    category: 'other',              defaultVisible: true },
  { code: 'EBD',     label: 'Animal In Trap Complaint',                    category: 'other',              defaultVisible: true },
  { code: 'CIAC',    label: 'Coyote Interaction Complaint',                category: 'other',              defaultVisible: true },
  { code: 'SCT',     label: 'Clean Vacant Lot Request',                    category: 'other',              defaultVisible: true },
  { code: 'SCX',     label: 'Recycling Inspection Request',                category: 'other',              defaultVisible: true },
  { code: 'PET',     label: 'Pet Wellness Check Request',                  category: 'other',              defaultVisible: true },
  { code: 'BUNGALOW',label: 'Bungalow/Vintage Home Information Request',   category: 'other',              defaultVisible: true },
  { code: 'SGA',     label: 'Rodent Baiting/Rat Complaint',                category: 'other',              defaultVisible: true },

  // ── STREET NUISANCE — hidden by default (graffiti, parking, waste) ─────────
  { code: 'GRAF',    label: 'Graffiti Removal Request',                    category: 'street_nuisance',    defaultVisible: false },
  { code: 'TNP',     label: 'Ridesharing Complaint',                       category: 'street_nuisance',    defaultVisible: false },
  { code: 'FPCE',    label: 'Finance Parking Code Enforcement Review',     category: 'street_nuisance',    defaultVisible: false },
  { code: 'SKA',     label: 'Abandoned Vehicle Complaint',                 category: 'street_nuisance',    defaultVisible: false },
  { code: 'CSP',     label: 'Public Vehicle/Valet Complaint',              category: 'street_nuisance',    defaultVisible: false },
  { code: 'CSC',     label: 'Cab Feedback',                                category: 'street_nuisance',    defaultVisible: false },
  { code: 'VBL',     label: 'Vehicle Parked in Bike Lane Complaint',       category: 'street_nuisance',    defaultVisible: false },
  { code: 'SCC',     label: 'Missed Garbage Pick-Up Complaint',            category: 'street_nuisance',    defaultVisible: false },
  { code: 'SCP',     label: 'Weed Removal Request',                        category: 'street_nuisance',    defaultVisible: false },
  { code: 'SCQ',     label: 'Yard Waste Pick-Up Request',                  category: 'street_nuisance',    defaultVisible: false },
  { code: 'SCS',     label: 'Wire Basket Request',                         category: 'street_nuisance',    defaultVisible: false },
  { code: 'SIE',     label: 'Garbage Cart Maintenance',                    category: 'street_nuisance',    defaultVisible: false },
  { code: 'SRRC',    label: 'Blue Recycling Cart',                         category: 'street_nuisance',    defaultVisible: false },
  { code: 'SRRP',    label: 'Recycling Pick Up',                           category: 'street_nuisance',    defaultVisible: false },
  { code: 'SDR',     label: 'Fly Dumping Complaint',                       category: 'street_nuisance',    defaultVisible: false },
  { code: 'SGQ',     label: 'Dead Animal Pick-Up Request',                 category: 'street_nuisance',    defaultVisible: false },
  { code: 'SGV',     label: 'Dead Bird',                                   category: 'street_nuisance',    defaultVisible: false },
  { code: 'SGG',     label: 'Bee/Wasp Removal',                            category: 'street_nuisance',    defaultVisible: false },
  { code: 'NAA',     label: 'Clean and Green Program Request',             category: 'street_nuisance',    defaultVisible: false },
  { code: 'ESPC',    label: 'E-Scooter Parking Complaint',                 category: 'street_nuisance',    defaultVisible: false },
  { code: 'DBPC',    label: 'Divvy Bike Parking Complaint',                category: 'street_nuisance',    defaultVisible: false },
  { code: 'DBES',    label: 'Submerged Divvy or Lime Device in the Lake/River', category: 'street_nuisance', defaultVisible: false },
  { code: 'PCL',     label: 'Bicycle Request/Complaint',                   category: 'street_nuisance',    defaultVisible: false },
  { code: 'QAC',     label: 'City Vehicle Sticker Violation',              category: 'street_nuisance',    defaultVisible: false },
  { code: 'PCL3',    label: 'E-Scooter',                                   category: 'street_nuisance',    defaultVisible: false },

  // ── STREET INFRASTRUCTURE — hidden by default ──────────────────────────────
  { code: 'AAD',     label: 'Sewer Cave-In Inspection Request',            category: 'street_infrastructure', defaultVisible: false },
  { code: 'AAE',     label: 'Water On Street Complaint',                   category: 'street_infrastructure', defaultVisible: false },
  { code: 'AAI',     label: 'Alley Sewer Inspection Request',              category: 'street_infrastructure', defaultVisible: false },
  { code: 'PHB',     label: 'Alley Pothole Complaint',                     category: 'street_infrastructure', defaultVisible: false },
  { code: 'PHF',     label: 'Pothole in Street Complaint',                 category: 'street_infrastructure', defaultVisible: false },
  { code: 'PBD',     label: 'Inspect Public Way Request',                  category: 'street_infrastructure', defaultVisible: false },
  { code: 'PBE',     label: 'Pavement Cave-In Inspection Request',         category: 'street_infrastructure', defaultVisible: false },
  { code: 'PBS',     label: 'Sidewalk Inspection Request',                 category: 'street_infrastructure', defaultVisible: false },
  { code: 'PBLDR',   label: 'Protected Bike Lane - Debris Removal',        category: 'street_infrastructure', defaultVisible: false },
  { code: 'SCSP',    label: 'Shared Cost Sidewalk Program Request',        category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFA',     label: 'Alley Light Out Complaint',                   category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFB',     label: 'Traffic Signal Out Complaint',                category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFC',     label: 'Viaduct Light Out Complaint',                 category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFD',     label: 'Street Light Out Complaint',                  category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFK',     label: 'Street Light Pole Damage Complaint',          category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFN',     label: 'Street Light On During Day Complaint',        category: 'street_infrastructure', defaultVisible: false },
  { code: 'SFQ',     label: 'Street Light Pole Door Missing Complaint',    category: 'street_infrastructure', defaultVisible: false },
  { code: 'SDO',     label: 'Ice and Snow Removal Request',                category: 'street_infrastructure', defaultVisible: false },
  { code: 'SDP',     label: 'Street Cleaning Request',                     category: 'street_infrastructure', defaultVisible: false },
  { code: 'SDW',     label: 'Snow - Object/Dibs Removal Request',          category: 'street_infrastructure', defaultVisible: false },
  { code: 'SNPBLBS', label: 'Snow Removal - Protected Bike Lane or Bridge Sidewalk', category: 'street_infrastructure', defaultVisible: false },
  { code: 'SWSNOREM',label: 'Snow – Uncleared Sidewalk Complaint',         category: 'street_infrastructure', defaultVisible: false },
  { code: 'PCB',     label: 'Sign Repair Request - Stop Sign',             category: 'street_infrastructure', defaultVisible: false },
  { code: 'PCC',     label: 'Sign Repair Request - One Way Sign',          category: 'street_infrastructure', defaultVisible: false },
  { code: 'PCD',     label: 'Sign Repair Request - Do Not Enter Sign',     category: 'street_infrastructure', defaultVisible: false },
  { code: 'PCE',     label: 'Sign Repair Request - All Other Signs',       category: 'street_infrastructure', defaultVisible: false },
  { code: 'WBT',     label: 'Open Fire Hydrant Complaint',                 category: 'street_infrastructure', defaultVisible: false },
  { code: 'SEC',     label: 'Tree Emergency',                              category: 'street_infrastructure', defaultVisible: false },
  { code: 'SED',     label: 'Tree Planting Request',                       category: 'street_infrastructure', defaultVisible: false },
  { code: 'SEE',     label: 'Tree Removal Inspection',                     category: 'street_infrastructure', defaultVisible: false },
  { code: 'SEF',     label: 'Tree Trim Request (NO LONGER BEING ACCEPTED)', category: 'street_infrastructure', defaultVisible: false },
  { code: 'SEL',     label: 'Tree Debris Clean-Up Request',                category: 'street_infrastructure', defaultVisible: false },
  { code: 'CHECKFOR',label: 'Sewer Cleaning Inspection Request',           category: 'street_infrastructure', defaultVisible: false },

  // ── OTHER — hidden by default ──────────────────────────────────────────────
  { code: '311IOC',  label: '311 Information Only Call',                   category: 'other',              defaultVisible: false },
  { code: 'AVN',     label: 'Aircraft Noise Complaint',                    category: 'other',              defaultVisible: false },
  { code: 'HOP',     label: 'Home Buyer Program Info Request',             category: 'other',              defaultVisible: false },
  { code: 'JNS',     label: 'Extreme Weather Notification',                category: 'other',              defaultVisible: false },
  { code: 'OCC',     label: 'Cable TV Complaint',                          category: 'other',              defaultVisible: false },
]

// Lookup map for O(1) access
export const SR_CODE_MAP: Record<string, SRCodeEntry> = Object.fromEntries(
  SR_CODES.map(e => [e.code, e])
)

// Set of codes visible by default — used to filter PropertyFeed
export const DEFAULT_VISIBLE_CODES = new Set(
  SR_CODES.filter(e => e.defaultVisible).map(e => e.code)
)

// Returns true if a complaint should show in default "Only Building Complaints" view
export function isDefaultVisible(srShortCode: string | null | undefined): boolean {
  if (!srShortCode) return true // show unknowns by default
  return DEFAULT_VISIBLE_CODES.has(srShortCode)
}