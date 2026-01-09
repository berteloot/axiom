/**
 * DataForSEO Supported Locations
 * 
 * Common locations supported by DataForSEO API for keyword research.
 * This list includes major countries and regions commonly used for PPC campaigns.
 * 
 * Note: DataForSEO supports many more locations. This is a curated list of the most common ones.
 * For the full list, use the DataForSEO API endpoint: GET /v3/serp/google/locations
 */

export interface Location {
  name: string;
  code?: string; // ISO country code if available
  region?: string; // Geographic region
}

export const DATAFORSEO_LOCATIONS: Location[] = [
  // North America
  { name: "United States", code: "US", region: "North America" },
  { name: "Canada", code: "CA", region: "North America" },
  { name: "Mexico", code: "MX", region: "North America" },
  
  // Europe
  { name: "United Kingdom", code: "GB", region: "Europe" },
  { name: "Germany", code: "DE", region: "Europe" },
  { name: "France", code: "FR", region: "Europe" },
  { name: "Italy", code: "IT", region: "Europe" },
  { name: "Spain", code: "ES", region: "Europe" },
  { name: "Netherlands", code: "NL", region: "Europe" },
  { name: "Belgium", code: "BE", region: "Europe" },
  { name: "Switzerland", code: "CH", region: "Europe" },
  { name: "Austria", code: "AT", region: "Europe" },
  { name: "Sweden", code: "SE", region: "Europe" },
  { name: "Norway", code: "NO", region: "Europe" },
  { name: "Denmark", code: "DK", region: "Europe" },
  { name: "Finland", code: "FI", region: "Europe" },
  { name: "Poland", code: "PL", region: "Europe" },
  { name: "Ireland", code: "IE", region: "Europe" },
  { name: "Portugal", code: "PT", region: "Europe" },
  { name: "Greece", code: "GR", region: "Europe" },
  { name: "Czech Republic", code: "CZ", region: "Europe" },
  { name: "Romania", code: "RO", region: "Europe" },
  { name: "Hungary", code: "HU", region: "Europe" },
  
  // Asia Pacific
  { name: "Australia", code: "AU", region: "Asia Pacific" },
  { name: "New Zealand", code: "NZ", region: "Asia Pacific" },
  { name: "Japan", code: "JP", region: "Asia Pacific" },
  { name: "South Korea", code: "KR", region: "Asia Pacific" },
  { name: "Singapore", code: "SG", region: "Asia Pacific" },
  { name: "Hong Kong", code: "HK", region: "Asia Pacific" },
  { name: "India", code: "IN", region: "Asia Pacific" },
  { name: "China", code: "CN", region: "Asia Pacific" },
  { name: "Taiwan", code: "TW", region: "Asia Pacific" },
  { name: "Malaysia", code: "MY", region: "Asia Pacific" },
  { name: "Thailand", code: "TH", region: "Asia Pacific" },
  { name: "Philippines", code: "PH", region: "Asia Pacific" },
  { name: "Indonesia", code: "ID", region: "Asia Pacific" },
  { name: "Vietnam", code: "VN", region: "Asia Pacific" },
  
  // Middle East & Africa
  { name: "United Arab Emirates", code: "AE", region: "Middle East" },
  { name: "Saudi Arabia", code: "SA", region: "Middle East" },
  { name: "Israel", code: "IL", region: "Middle East" },
  { name: "South Africa", code: "ZA", region: "Africa" },
  { name: "Egypt", code: "EG", region: "Africa" },
  
  // Latin America
  { name: "Brazil", code: "BR", region: "Latin America" },
  { name: "Argentina", code: "AR", region: "Latin America" },
  { name: "Chile", code: "CL", region: "Latin America" },
  { name: "Colombia", code: "CO", region: "Latin America" },
  { name: "Peru", code: "PE", region: "Latin America" },
  
  // Other
  { name: "Turkey", code: "TR", region: "Europe/Asia" },
  { name: "Russia", code: "RU", region: "Europe/Asia" }, // Note: May have limited support
];

export const DATAFORSEO_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Russian",
  "Japanese",
  "Chinese",
  "Korean",
  "Arabic",
  "Hebrew",
  "Turkish",
  "Polish",
  "Swedish",
  "Norwegian",
  "Danish",
  "Finnish",
  "Czech",
  "Hungarian",
  "Romanian",
  "Greek",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malay",
  "Hindi",
  "Tagalog",
];

/**
 * Get location by name (case-insensitive)
 */
export function getLocationByName(name: string): Location | undefined {
  return DATAFORSEO_LOCATIONS.find(
    (loc) => loc.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Search locations by name or code
 */
export function searchLocations(query: string): Location[] {
  const lowerQuery = query.toLowerCase();
  return DATAFORSEO_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(lowerQuery) ||
      loc.code?.toLowerCase().includes(lowerQuery) ||
      loc.region?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get locations grouped by region
 */
export function getLocationsByRegion(): Map<string, Location[]> {
  const grouped = new Map<string, Location[]>();
  DATAFORSEO_LOCATIONS.forEach((loc) => {
    const region = loc.region || "Other";
    if (!grouped.has(region)) {
      grouped.set(region, []);
    }
    grouped.get(region)!.push(loc);
  });
  return grouped;
}
