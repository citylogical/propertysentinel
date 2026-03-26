/**
 * Explore Tables — column metadata for every queryable Supabase table.
 * Used by both the API route (validation / allowlist) and the client (column rendering).
 */

export type ColType = 'text' | 'number' | 'date' | 'boolean' | 'json'

export type ColumnDef = {
  key: string
  label: string
  type: ColType
  defaultVisible?: boolean
  /** If true, this is the sticky left-hand identifier column */
  sticky?: boolean
}

export type TableDef = {
  name: string
  label: string
  rowEstimate: string
  /** Default sort column */
  defaultSort: string
  defaultSortDesc?: boolean
  columns: ColumnDef[]
}

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

const properties: TableDef = {
  name: 'properties',
  label: 'Properties',
  rowEstimate: '1.86M',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'address', label: 'Address', type: 'text', defaultVisible: true },
    { key: 'address_normalized', label: 'Addr Normalized', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'zip', label: 'ZIP', type: 'text', defaultVisible: true },
    { key: 'ward', label: 'Ward', type: 'text', defaultVisible: true },
    { key: 'community_area', label: 'Community Area', type: 'text', defaultVisible: true },
    { key: 'property_class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'lat', label: 'Lat', type: 'number' },
    { key: 'lng', label: 'Lng', type: 'number' },
    { key: 'health_score', label: 'Health Score', type: 'number' },
    { key: 'open_violations_count', label: 'Open Violations', type: 'number', defaultVisible: true },
    { key: 'open_complaints_count', label: 'Open Complaints', type: 'number', defaultVisible: true },
    { key: 'last_permit_date', label: 'Last Permit', type: 'date' },
    { key: 'last_roof_permit_date', label: 'Last Roof Permit', type: 'date' },
    { key: 'roof_age_years', label: 'Roof Age (yr)', type: 'number' },
    { key: 'pin10', label: 'PIN10', type: 'text' },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'mailing_name', label: 'Mailing Name', type: 'text', defaultVisible: true },
    { key: 'mailing_address', label: 'Mailing Addr', type: 'text' },
    { key: 'mailing_city', label: 'Mailing City', type: 'text' },
    { key: 'mailing_state', label: 'Mailing State', type: 'text' },
    { key: 'mailing_zip', label: 'Mailing ZIP', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
    { key: 'updated_at', label: 'Updated', type: 'date' },
  ],
}

const complaints_311: TableDef = {
  name: 'complaints_311',
  label: '311 Complaints',
  rowEstimate: '13M+',
  defaultSort: 'created_date',
  defaultSortDesc: true,
  columns: [
    { key: 'sr_number', label: 'SR Number', type: 'text', defaultVisible: true, sticky: true },
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true },
    { key: 'address', label: 'Address', type: 'text', defaultVisible: true },
    { key: 'address_normalized', label: 'Addr Normalized', type: 'text' },
    { key: 'sr_short_code', label: 'SR Code', type: 'text', defaultVisible: true },
    { key: 'sr_type', label: 'SR Type', type: 'text', defaultVisible: true },
    { key: 'status', label: 'Status', type: 'text', defaultVisible: true },
    { key: 'created_date', label: 'Created', type: 'date', defaultVisible: true },
    { key: 'closed_date', label: 'Closed', type: 'date' },
    { key: 'last_modified_date', label: 'Last Modified', type: 'date' },
    { key: 'community_area', label: 'Community Area', type: 'text', defaultVisible: true },
    { key: 'ward', label: 'Ward', type: 'text' },
    { key: 'zip_code', label: 'ZIP', type: 'text' },
    { key: 'created_department', label: 'Created Dept', type: 'text' },
    { key: 'owner_department', label: 'Owner Dept', type: 'text' },
    { key: 'origin', label: 'Origin', type: 'text' },
    { key: 'street_number', label: 'St Number', type: 'text' },
    { key: 'street_direction', label: 'St Dir', type: 'text' },
    { key: 'street_name', label: 'St Name', type: 'text' },
    { key: 'street_type', label: 'St Type', type: 'text' },
    { key: 'duplicate', label: 'Duplicate', type: 'boolean' },
    { key: 'legacy_record', label: 'Legacy', type: 'boolean' },
    { key: 'police_district', label: 'Police Dist', type: 'text' },
    { key: 'police_beat', label: 'Police Beat', type: 'text' },
    { key: 'precinct', label: 'Precinct', type: 'text' },
    { key: 'created_hour', label: 'Hour', type: 'number' },
    { key: 'created_day_of_week', label: 'Day of Week', type: 'text' },
    { key: 'created_month', label: 'Month', type: 'text' },
    { key: 'lat', label: 'Lat', type: 'number' },
    { key: 'lng', label: 'Lng', type: 'number' },
  ],
}

const assessed_values: TableDef = {
  name: 'assessed_values',
  label: 'Assessed Values',
  rowEstimate: '14M',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'township_code', label: 'Twp Code', type: 'text' },
    { key: 'township_name', label: 'Township', type: 'text', defaultVisible: true },
    { key: 'neighborhood_code', label: 'Nbhd Code', type: 'text', defaultVisible: true },
    { key: 'mailed_bldg', label: 'Mailed Bldg', type: 'number', defaultVisible: true },
    { key: 'mailed_land', label: 'Mailed Land', type: 'number', defaultVisible: true },
    { key: 'mailed_tot', label: 'Mailed Total', type: 'number', defaultVisible: true },
    { key: 'certified_bldg', label: 'Certified Bldg', type: 'number' },
    { key: 'certified_land', label: 'Certified Land', type: 'number' },
    { key: 'certified_tot', label: 'Certified Total', type: 'number' },
    { key: 'board_bldg', label: 'Board Bldg', type: 'number' },
    { key: 'board_land', label: 'Board Land', type: 'number' },
    { key: 'board_tot', label: 'Board Total', type: 'number' },
    { key: 'row_id', label: 'Row ID', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
}

const property_chars_residential: TableDef = {
  name: 'property_chars_residential',
  label: 'Residential Chars',
  rowEstimate: '5–6M',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'year_built', label: 'Year Built', type: 'number', defaultVisible: true },
    { key: 'building_sqft', label: 'Building Sqft', type: 'number', defaultVisible: true },
    { key: 'land_sqft', label: 'Land Sqft', type: 'number', defaultVisible: true },
    { key: 'num_bedrooms', label: 'Bedrooms', type: 'number', defaultVisible: true },
    { key: 'num_rooms', label: 'Rooms', type: 'number' },
    { key: 'num_full_baths', label: 'Full Baths', type: 'number' },
    { key: 'num_half_baths', label: 'Half Baths', type: 'number' },
    { key: 'num_fireplaces', label: 'Fireplaces', type: 'number' },
    { key: 'type_of_residence', label: 'Type of Residence', type: 'text', defaultVisible: true },
    { key: 'construction_quality', label: 'Construction Quality', type: 'text' },
    { key: 'num_apartments', label: 'Apartments', type: 'number' },
    { key: 'single_v_multi_family', label: 'Single/Multi', type: 'text', defaultVisible: true },
    { key: 'ext_wall_material', label: 'Ext Wall', type: 'text' },
    { key: 'roof_material', label: 'Roof Material', type: 'text' },
    { key: 'repair_condition', label: 'Repair Condition', type: 'text' },
    { key: 'basement_type', label: 'Basement', type: 'text' },
    { key: 'attic_type', label: 'Attic', type: 'text' },
    { key: 'garage_attached', label: 'Garage Attached', type: 'text' },
    { key: 'garage_size', label: 'Garage Size', type: 'text' },
    { key: 'central_heating', label: 'Heating', type: 'text' },
    { key: 'central_air', label: 'Central Air', type: 'text' },
    { key: 'num_commercial_units', label: 'Commercial Units', type: 'number' },
    { key: 'renovation', label: 'Renovation', type: 'text' },
    { key: 'porch', label: 'Porch', type: 'text' },
  ],
}

const property_chars_condo: TableDef = {
  name: 'property_chars_condo',
  label: 'Condo Chars',
  rowEstimate: '~500K',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'pin10', label: 'PIN10', type: 'text' },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'card_num', label: 'Card Num', type: 'text' },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'township_code', label: 'Twp Code', type: 'text' },
    { key: 'proration_key_pin', label: 'Proration Key PIN', type: 'text' },
    { key: 'pin_proration_rate', label: 'Proration Rate', type: 'number' },
    { key: 'year_built', label: 'Year Built', type: 'number', defaultVisible: true },
    { key: 'building_sqft', label: 'Building Sqft', type: 'number', defaultVisible: true },
    { key: 'unit_sqft', label: 'Unit Sqft', type: 'number', defaultVisible: true },
    { key: 'num_bedrooms', label: 'Bedrooms', type: 'number', defaultVisible: true },
    { key: 'building_non_units', label: 'Non-Units', type: 'number' },
    { key: 'building_pins', label: 'Building PINs', type: 'number' },
    { key: 'land_sqft', label: 'Land Sqft', type: 'number' },
    { key: 'pin_is_multiland', label: 'Multi-Land', type: 'boolean' },
    { key: 'pin_num_landlines', label: 'Landlines', type: 'number' },
    { key: 'bldg_is_mixed_use', label: 'Mixed Use', type: 'boolean' },
    { key: 'is_parking_space', label: 'Parking Space', type: 'boolean' },
    { key: 'is_common_area', label: 'Common Area', type: 'boolean' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
}

const parcel_universe: TableDef = {
  name: 'parcel_universe',
  label: 'Parcel Universe',
  rowEstimate: '3.7M',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'pin10', label: 'PIN10', type: 'text' },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'ward', label: 'Ward', type: 'text', defaultVisible: true },
    { key: 'community_area_num', label: 'CA Num', type: 'text' },
    { key: 'community_area_name', label: 'Community Area', type: 'text', defaultVisible: true },
    { key: 'township_name', label: 'Township', type: 'text', defaultVisible: true },
    { key: 'neighborhood_code', label: 'Nbhd Code', type: 'text', defaultVisible: true },
    { key: 'police_district', label: 'Police Dist', type: 'text' },
    { key: 'municipality_name', label: 'Municipality', type: 'text' },
    { key: 'flood_fema_sfha', label: 'FEMA Flood', type: 'text' },
    { key: 'flood_fs_factor', label: 'Flood Factor', type: 'number' },
    { key: 'ohare_noise_contour', label: "O'Hare Noise", type: 'text' },
    { key: 'school_elementary_name', label: 'Elementary School', type: 'text' },
    { key: 'school_secondary_name', label: 'Secondary School', type: 'text' },
    { key: 'tif_district_num', label: 'TIF District', type: 'text' },
    { key: 'walkability_score', label: 'Walkability', type: 'number' },
    { key: 'lat', label: 'Lat', type: 'number' },
    { key: 'lng', label: 'Lng', type: 'number' },
  ],
}

const permits: TableDef = {
  name: 'permits',
  label: 'Permits',
  rowEstimate: '~700K',
  defaultSort: 'issue_date',
  defaultSortDesc: true,
  columns: [
    { key: 'permit_number', label: 'Permit #', type: 'text', defaultVisible: true, sticky: true },
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true },
    { key: 'address', label: 'Address', type: 'text', defaultVisible: true },
    { key: 'address_normalized', label: 'Addr Normalized', type: 'text' },
    { key: 'permit_status', label: 'Status', type: 'text', defaultVisible: true },
    { key: 'permit_type', label: 'Type', type: 'text', defaultVisible: true },
    { key: 'work_description', label: 'Work Description', type: 'text', defaultVisible: true },
    { key: 'issue_date', label: 'Issue Date', type: 'date', defaultVisible: true },
    { key: 'is_roof_permit', label: 'Roof Permit', type: 'boolean' },
    { key: 'community_area', label: 'Community Area', type: 'text' },
    { key: 'ward', label: 'Ward', type: 'text' },
    { key: 'street_number', label: 'St Number', type: 'text' },
    { key: 'street_direction', label: 'St Dir', type: 'text' },
    { key: 'street_name', label: 'St Name', type: 'text' },
    { key: 'lat', label: 'Lat', type: 'number' },
    { key: 'lng', label: 'Lng', type: 'number' },
    { key: 'created_at', label: 'Created', type: 'date' },
    { key: 'updated_at', label: 'Updated', type: 'date' },
  ],
}

const violations: TableDef = {
  name: 'violations',
  label: 'Violations',
  rowEstimate: '~570K',
  defaultSort: 'violation_date',
  defaultSortDesc: true,
  columns: [
    { key: 'violation_id', label: 'Violation ID', type: 'text', defaultVisible: true, sticky: true },
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true },
    { key: 'address', label: 'Address', type: 'text', defaultVisible: true },
    { key: 'address_normalized', label: 'Addr Normalized', type: 'text' },
    { key: 'violation_date', label: 'Violation Date', type: 'date', defaultVisible: true },
    { key: 'violation_last_modified_date', label: 'Last Modified', type: 'date' },
    { key: 'violation_code', label: 'Code', type: 'text', defaultVisible: true },
    { key: 'violation_status', label: 'Violation Status', type: 'text', defaultVisible: true },
    { key: 'violation_description', label: 'Description', type: 'text', defaultVisible: true },
    { key: 'violation_inspector_comments', label: 'Inspector Comments', type: 'text' },
    { key: 'violation_ordinance', label: 'Ordinance', type: 'text' },
    { key: 'inspection_number', label: 'Inspection #', type: 'text' },
    { key: 'inspection_status', label: 'Inspection Status', type: 'text' },
    { key: 'inspection_category', label: 'Category', type: 'text' },
    { key: 'department_bureau', label: 'Bureau', type: 'text' },
    { key: 'community_area', label: 'Community Area', type: 'text' },
    { key: 'ward', label: 'Ward', type: 'text' },
    { key: 'is_stop_work_order', label: 'Stop Work', type: 'boolean' },
    { key: 'lat', label: 'Lat', type: 'number' },
    { key: 'lng', label: 'Lng', type: 'number' },
    { key: 'created_at', label: 'Created', type: 'date' },
    { key: 'updated_at', label: 'Updated', type: 'date' },
  ],
}

const property_chars_commercial: TableDef = {
  name: 'property_chars_commercial',
  label: 'Commercial Chars',
  rowEstimate: '~109K',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'year_built', label: 'Year Built', type: 'number', defaultVisible: true },
    { key: 'building_sqft', label: 'Building Sqft', type: 'number', defaultVisible: true },
    { key: 'land_sqft', label: 'Land Sqft', type: 'number', defaultVisible: true },
    { key: 'property_type_use', label: 'Property Type', type: 'text', defaultVisible: true },
    { key: 'keypin', label: 'Key PIN', type: 'text' },
    { key: 'township_code', label: 'Twp Code', type: 'text' },
    { key: 'township_name', label: 'Township', type: 'text' },
    { key: 'neighborhood_code', label: 'Nbhd Code', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
}

const property_tax_exempt: TableDef = {
  name: 'property_tax_exempt',
  label: 'Tax Exempt',
  rowEstimate: '~30K',
  defaultSort: 'pin',
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'tax_year', label: 'Tax Year', type: 'number', defaultVisible: true },
    { key: 'class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'owner_name', label: 'Owner', type: 'text', defaultVisible: true },
    { key: 'township_name', label: 'Township', type: 'text', defaultVisible: true },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
}

const str_activity_summary: TableDef = {
  name: 'str_activity_summary',
  label: 'STR Activity Summary',
  rowEstimate: '~5K',
  defaultSort: 'shvr_open',
  defaultSortDesc: true,
  columns: [
    { key: 'pin', label: 'PIN', type: 'text', defaultVisible: true, sticky: true },
    { key: 'address', label: 'Address', type: 'text', defaultVisible: true },
    { key: 'community_area', label: 'Community Area', type: 'text', defaultVisible: true },
    { key: 'ward', label: 'Ward', type: 'text', defaultVisible: true },
    { key: 'shvr_open', label: 'SHVR Open', type: 'number', defaultVisible: true },
    { key: 'shvr_total', label: 'SHVR Total', type: 'number', defaultVisible: true },
    { key: 'shvr_last_year', label: 'SHVR Last Year', type: 'number', defaultVisible: true },
    { key: 'latest_shvr_date', label: 'Latest SHVR', type: 'date', defaultVisible: true },
    { key: 'earliest_shvr_date', label: 'Earliest SHVR', type: 'date' },
    { key: 'mailing_name', label: 'Mailing Name', type: 'text', defaultVisible: true },
    { key: 'is_absentee', label: 'Absentee', type: 'boolean', defaultVisible: true },
    { key: 'mailing_address', label: 'Mailing Addr', type: 'text' },
    { key: 'mailing_city', label: 'Mailing City', type: 'text' },
    { key: 'mailing_state', label: 'Mailing State', type: 'text' },
    { key: 'mailing_zip', label: 'Mailing ZIP', type: 'text' },
    { key: 'property_class', label: 'Class', type: 'text', defaultVisible: true },
    { key: 'zip', label: 'ZIP', type: 'text' },
    { key: 'open_violations_count', label: 'Open Violations', type: 'number', defaultVisible: true },
    { key: 'open_complaints_count', label: 'Open Complaints', type: 'number' },
    { key: 'last_permit_date', label: 'Last Permit', type: 'date' },
  ],
}

const test_table: TableDef = {
  name: 'test_dummy',
  label: '🔴 TEST — DELETE ME',
  rowEstimate: '0',
  defaultSort: 'id',
  defaultSortDesc: false,
  columns: [
    { key: 'id', label: 'ID', type: 'text', defaultVisible: true },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const EXPLORE_TABLES: Record<string, TableDef> = {
  str_activity_summary: str_activity_summary,
  properties: properties,
  complaints_311: complaints_311,
  assessed_values: assessed_values,
  property_chars_residential: property_chars_residential,
  property_chars_condo: property_chars_condo,
  parcel_universe: parcel_universe,
  permits: permits,
  violations: violations,
  property_chars_commercial: property_chars_commercial,
  property_tax_exempt: property_tax_exempt,
}

/** Ordered list for the table selector dropdown */
export const EXPLORE_TABLE_LIST: TableDef[] = [
  str_activity_summary,
  test_table,
  properties,
  complaints_311,
  assessed_values,
  property_chars_residential,
  property_chars_condo,
  parcel_universe,
  permits,
  violations,
  property_chars_commercial,
  property_tax_exempt,
]

/** Validate table name against allowlist */
export function isValidTable(name: string): boolean {
  return name in EXPLORE_TABLES
}

/** Validate column name against a table's known columns */
export function isValidColumn(tableName: string, colKey: string): boolean {
  const t = EXPLORE_TABLES[tableName]
  if (!t) return false
  return t.columns.some((c) => c.key === colKey)
}

/** Get default visible column keys for a table */
export function getDefaultVisibleColumns(tableName: string): Record<string, boolean> {
  const t = EXPLORE_TABLES[tableName]
  if (!t) return {}
  const vis: Record<string, boolean> = {}
  for (const c of t.columns) {
    vis[c.key] = c.defaultVisible === true
  }
  return vis
}