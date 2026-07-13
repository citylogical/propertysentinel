// SR Short Code Categories
// Source: Chicago 311 dataset v6vf-nfxy — full universe as of March 2026
//
// AXES (per the SR-flow categorization):
//   department      — modal owner_department that resolves the complaint
//   liability       — who bears cost/fault: 'citizen' (any private party) | 'city' | 'info'
//   ownerRelevant   — does a property owner need to act? Seeds user_sr_preferences
//                     at first-property-add. THIS is the property-owner default view.
//   defaultVisible  — LEGACY generic filter. Still used by the public property page
//                     (isDefaultVisible) and explore tables. Being retired in favor of
//                     ownerRelevant on authenticated surfaces. Do not remove yet.
//   enrichable      — has a QUESTION_MAP entry (Aura enrichment supported). Gates the
//                     admin enrichment chevron + on-demand enrich endpoint. Independent
//                     of citywide-vs-portfolio (that distinction lives in the workers).

export type SRCategory = 'building' | 'street_infrastructure' | 'street_nuisance' | 'business' | 'other'
export type SRLiability = 'citizen' | 'city' | 'info'

export interface SRCodeEntry {
  code: string
  label: string
  category: SRCategory
  /** City department that owns resolution (modal owner_department). */
  department: string
  /** Who bears cost/fault. 'citizen' = any private party (incl. the owner). */
  liability: SRLiability
  /** Does a property owner need to act? Default seed for user_sr_preferences. */
  ownerRelevant: boolean
  /** LEGACY generic filter — public property page + explore tables only. */
  defaultVisible: boolean
  /** Has Aura enrichment support (QUESTION_MAP entry). Must stay in sync with
   *  QUESTION_MAP in enrich_complaints.py + enrich-on-demand/route.ts. */
  enrichable?: boolean
}

export const SR_CODES: SRCodeEntry[] = [
  // ── BUILDING — property condition, safety, compliance ──────────────────────
  { code: 'BBA',         label: 'Building Violation',                               category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'BBC',         label: 'Buildings - Plumbing Violation',                   category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'BBD',         label: 'No Building Permit and Construction Violation',    category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'BBK',         label: 'Vacant/Abandoned Building Complaint',              category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'BPI',         label: 'Porch Inspection Request',                         category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'FAC',         label: 'Commercial Fire Safety Inspection Request',        category: 'building',              department: 'Fire',                                      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'HDF',         label: 'Lead Inspection Request',                          category: 'building',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SCB',         label: 'Sanitation Code Violation',                        category: 'building',              department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SHVR',        label: 'Shared Housing/Vacation Rental Complaint',         category: 'building',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'NAC',         label: 'No Air Conditioning',                              category: 'building',              department: 'DOB - Buildings',                           liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'AAF',         label: 'Water in Basement Complaint',                      category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'WCA2',        label: 'Water Lead Test Kit Request',                      category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true },
  { code: 'WCA3',        label: 'Water Lead Test Visit Request',                    category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'WM3',         label: 'Check for Leak',                                   category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'WBJ',         label: 'No Water Complaint',                               category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'WBK',         label: 'Low Water Pressure Complaint',                     category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'PETCO',       label: 'Petcoke Dust Complaint',                           category: 'building',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'WCA',         label: 'Water Quality Concern',                            category: 'building',              department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },


  // ── BUSINESS / CONSUMER ────────────────────────────────────────────────────
  { code: 'HFB',         label: 'Restaurant Complaint',                             category: 'business',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'RBL',         label: 'Business Complaints',                              category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'BAG',         label: 'Tobacco - General Complaint',                      category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'BAM',         label: 'Tobacco - Sale to Minors Complaint',               category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'LIQUORCO',    label: 'Liquor Establishment Complaint',                   category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'CSF',         label: 'Consumer Fraud Complaint',                         category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'CST',         label: 'Consumer Retail Business Complaint',               category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'CAFE',        label: 'Sidewalk Café/Outdoor Dining Complaint',           category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'CORNVEND',    label: 'Pushcart Food Vendor Complaint',                   category: 'business',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'FPC',         label: 'Inaccurate Fuel Pump Complaint',                   category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'INR',         label: 'Inaccurate Retail Scales Complaint',               category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'ODM',         label: 'Outdated Merchandise Complaint',                   category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'MWC',         label: 'Wage Complaint',                                   category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true,    enrichable: true },
  { code: 'PSL',         label: 'Paid Sick Leave Violation',                        category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'NOSOLCPP',    label: 'No Solicitation Complaint',                        category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'HFF',         label: 'Smokeless Tobacco at Sports Event Complaint',      category: 'business',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'LPRC',        label: 'Licensed Pharmaceutical Representative Complaint', category: 'business',              department: 'Health',                                    liability: 'citizen',    ownerRelevant: false,    defaultVisible: true },
  { code: 'RFC',         label: 'Renters and Foreclosure Complaint',                category: 'business',              department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },


  // ── OTHER — selected codes ─────────────────────────────────────────────────
  { code: 'EAB',         label: 'Nuisance Animal Complaint',                        category: 'other',                 department: 'Animal Care and Control',                   liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'EAE',         label: 'Stray Animal Complaint',                           category: 'other',                 department: 'Animal Care and Control',                   liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'EAF',         label: 'Vicious Animal Complaint',                         category: 'other',                 department: 'Animal Care and Control',                   liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'EAQ',         label: 'Report an Injured Animal',                         category: 'other',                 department: 'Animal Care and Control',                   liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'EBD',         label: 'Animal In Trap Complaint',                         category: 'other',                 department: 'Animal Care and Control',                   liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'CIAC',        label: 'Coyote Interaction Complaint',                     category: 'other',                 department: 'Animal Care and Control',                   liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SCT',         label: 'Clean Vacant Lot Request',                         category: 'other',                 department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SCX',         label: 'Recycling Inspection Request',                     category: 'other',                 department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'PET',         label: 'Pet Wellness Check Request',                       category: 'other',                 department: 'Animal Care and Control',                   liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'BUNGALOW',    label: 'Bungalow/Vintage Home Information Request',        category: 'other',                 department: 'Department of Housing',                     liability: 'info',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SGA',         label: 'Rodent Baiting/Rat Complaint',                     category: 'other',                 department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },


  // ── STREET NUISANCE ────────────────────────────────────────────────────────
  { code: 'GRAF',        label: 'Graffiti Removal Request',                         category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: true },
  { code: 'TNP',         label: 'Ridesharing Complaint',                            category: 'street_nuisance',       department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'FPCE',        label: 'Finance Parking Code Enforcement Review',          category: 'street_nuisance',       department: 'Finance',                                   liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'SKA',         label: 'Abandoned Vehicle Complaint',                      category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'CSP',         label: 'Public Vehicle/Valet Complaint',                   category: 'street_nuisance',       department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'CSC',         label: 'Cab Feedback',                                     category: 'street_nuisance',       department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'VBL',         label: 'Vehicle Parked in Bike Lane Complaint',            category: 'street_nuisance',       department: 'CDOT - Department of Transportation',       liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'SCC',         label: 'Missed Garbage Pick-Up Complaint',                 category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SCP',         label: 'Weed Removal Request',                             category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SCQ',         label: 'Yard Waste Pick-Up Request',                       category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SCS',         label: 'Wire Basket Request',                              category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SIE',         label: 'Garbage Cart Maintenance',                         category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SRRC',        label: 'Blue Recycling Cart',                              category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SRRP',        label: 'Recycling Pick Up',                                category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SDR',         label: 'Fly Dumping Complaint',                            category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SGQ',         label: 'Dead Animal Pick-Up Request',                      category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SGV',         label: 'Dead Bird',                                        category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SGG',         label: 'Bee/Wasp Removal',                                 category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'NAA',         label: 'Clean and Green Program Request',                  category: 'street_nuisance',       department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'ESPC',        label: 'E-Scooter Parking Complaint',                      category: 'street_nuisance',       department: 'Outside Agencies',                          liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'DBPC',        label: 'Divvy Bike Parking Complaint',                     category: 'street_nuisance',       department: 'Outside Agencies',                          liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'DBES',        label: 'Submerged Divvy or Lime Device in the Lake/River', category: 'street_nuisance',       department: 'Outside Agencies',                          liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'PCL',         label: 'Bicycle Request/Complaint',                        category: 'street_nuisance',       department: 'CDOT - Department of Transportation',       liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'QAC',         label: 'City Vehicle Sticker Violation',                   category: 'street_nuisance',       department: "City Clerk's Office",                       liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
  { code: 'PCL3',        label: 'E-Scooter',                                        category: 'street_nuisance',       department: 'CDOT - Department of Transportation',       liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },


  // ── STREET INFRASTRUCTURE ──────────────────────────────────────────────────
  { code: 'AAD',         label: 'Sewer Cave-In Inspection Request',                 category: 'street_infrastructure', department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },  // ⚑ liability set at resolution (city main vs. owner lateral)
  { code: 'AAE',         label: 'Water On Street Complaint',                        category: 'street_infrastructure', department: 'DWM - Department of Water Management',      liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'AAI',         label: 'Alley Sewer Inspection Request',                   category: 'street_infrastructure', department: 'DWM - Department of Water Management',      liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },  // ⚑ liability set at resolution (city main vs. owner lateral)
  { code: 'PHB',         label: 'Alley Pothole Complaint',                          category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PHF',         label: 'Pothole in Street Complaint',                      category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PBD',         label: 'Inspect Public Way Request',                       category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PBE',         label: 'Pavement Cave-In Inspection Request',              category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: true },
  { code: 'PBS',         label: 'Sidewalk Inspection Request',                      category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PBLDR',       label: 'Protected Bike Lane - Debris Removal',             category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SCSP',        label: 'Shared Cost Sidewalk Program Request',             category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SFA',         label: 'Alley Light Out Complaint',                        category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFB',         label: 'Traffic Signal Out Complaint',                     category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFC',         label: 'Viaduct Light Out Complaint',                      category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFD',         label: 'Street Light Out Complaint',                       category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFK',         label: 'Street Light Pole Damage Complaint',               category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFN',         label: 'Street Light On During Day Complaint',             category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SFQ',         label: 'Street Light Pole Door Missing Complaint',         category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SDO',         label: 'Ice and Snow Removal Request',                     category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SDP',         label: 'Street Cleaning Request',                          category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SDW',         label: 'Snow - Object/Dibs Removal Request',               category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SNPBLBS',     label: 'Snow Removal - Protected Bike Lane or Bridge Sidewalk', category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SWSNOREM',    label: 'Snow – Uncleared Sidewalk Complaint',              category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'citizen',    ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'PCB',         label: 'Sign Repair Request - Stop Sign',                  category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PCC',         label: 'Sign Repair Request - One Way Sign',               category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PCD',         label: 'Sign Repair Request - Do Not Enter Sign',          category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'PCE',         label: 'Sign Repair Request - All Other Signs',            category: 'street_infrastructure', department: 'CDOT - Department of Transportation',       liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'WBT',         label: 'Open Fire Hydrant Complaint',                      category: 'street_infrastructure', department: 'DWM - Department of Water Management',      liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SEC',         label: 'Tree Emergency',                                   category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: true,     defaultVisible: true,    enrichable: true },
  { code: 'SED',         label: 'Tree Planting Request',                            category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SEE',         label: 'Tree Removal Inspection',                          category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: true },
  { code: 'SEF',         label: 'Tree Trim Request (NO LONGER BEING ACCEPTED)',     category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'SEL',         label: 'Tree Debris Clean-Up Request',                     category: 'street_infrastructure', department: 'Streets and Sanitation',                    liability: 'city',       ownerRelevant: false,    defaultVisible: false },
  { code: 'CHECKFOR',    label: 'Sewer Cleaning Inspection Request',                category: 'street_infrastructure', department: 'DWM - Department of Water Management',      liability: 'city',       ownerRelevant: false,    defaultVisible: false },


  // ── OTHER — informational, hidden by default ───────────────────────────────
  { code: '311IOC',      label: '311 Information Only Call',                        category: 'other',                 department: '311 City Services',                         liability: 'info',       ownerRelevant: false,    defaultVisible: false },
  { code: 'AVN',         label: 'Aircraft Noise Complaint',                         category: 'other',                 department: 'Aviation',                                  liability: 'info',       ownerRelevant: false,    defaultVisible: false },
  { code: 'HOP',         label: 'Home Buyer Program Info Request',                  category: 'other',                 department: 'Department of Housing',                     liability: 'info',       ownerRelevant: false,    defaultVisible: false },
  { code: 'JNS',         label: 'Extreme Weather Notification',                     category: 'other',                 department: 'Extreme Weather Notification',              liability: 'info',       ownerRelevant: false,    defaultVisible: false },
  { code: 'OCC',         label: 'Cable TV Complaint',                               category: 'other',                 department: 'BACP - Business Affairs and Consumer Protection', liability: 'citizen',    ownerRelevant: false,    defaultVisible: false },
]

// Lookup map for O(1) access
export const SR_CODE_MAP: Record<string, SRCodeEntry> = Object.fromEntries(
  SR_CODES.map(e => [e.code, e])
)

// ── PROPERTY-OWNER DEFAULT VIEW ────────────────────────────────────────────
// The set of codes a property owner sees by default. Seeds user_sr_preferences
// on first-property-add. Authenticated surfaces (dashboard, portfolio, activity
// feed, daily digest) resolve a user's enabled codes from that table; this set
// is the seed, not the live filter.
export const OWNER_RELEVANT_CODES = new Set(
  SR_CODES.filter(e => e.ownerRelevant).map(e => e.code)
)

// Convenience lookups for the new axes.
export const LIABILITY_BY_CODE: Record<string, SRLiability> = Object.fromEntries(
  SR_CODES.map(e => [e.code, e.liability])
)
export const DEPARTMENT_BY_CODE: Record<string, string> = Object.fromEntries(
  SR_CODES.map(e => [e.code, e.department])
)

// ── LEGACY: generic default-visible filter ─────────────────────────────────
// Used by the PUBLIC property page (isDefaultVisible) and explore tables only.
// Authenticated property-owner surfaces use OWNER_RELEVANT_CODES instead.
export const DEFAULT_VISIBLE_CODES = new Set(
  SR_CODES.filter(e => e.defaultVisible).map(e => e.code)
)

// Set of codes with Aura enrichment support. Must stay in sync with QUESTION_MAP
// in app/api/complaints/enrich-on-demand/route.ts and ENRICH_CODES in
// property-sentinel-workers/enrich_complaints.py. When adding a new enrichable
// code, update both of those AND flip enrichable: true here.
export const ENRICHABLE_CODES = new Set(
  SR_CODES.filter(e => e.enrichable).map(e => e.code)
)

// Owner-liability codes we auto-enrich on portfolio save: the default alert
// checklist (ownerRelevant) intersected with enrichable — today the 29 owner
// codes minus WCA2 (Water Lead Test Kit Request: a kit request, nothing
// behind it to enrich).
export const OWNER_ENRICHABLE_CODES = new Set(
  SR_CODES.filter(e => e.ownerRelevant && e.enrichable).map(e => e.code)
)

// Returns true if a complaint shows in the public property page default view.
// LEGACY — authenticated surfaces use OWNER_RELEVANT_CODES / the preferences seam.
export function isDefaultVisible(srShortCode: string | null | undefined): boolean {
  if (!srShortCode) return true // show unknowns by default
  return DEFAULT_VISIBLE_CODES.has(srShortCode)
}

// Returns true if a code is owner-relevant by default (seed value).
export function isOwnerRelevant(srShortCode: string | null | undefined): boolean {
  if (!srShortCode) return false
  return OWNER_RELEVANT_CODES.has(srShortCode)
}