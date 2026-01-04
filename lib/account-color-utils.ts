/**
 * Generate a consistent color from an account ID or name
 * Returns a color palette that's visually distinct and accessible
 */

// Predefined color palette - accessible, distinct colors
const COLOR_PALETTE = [
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", accent: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", accent: "bg-purple-500", badge: "bg-purple-100 text-purple-800" },
  { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", accent: "bg-green-500", badge: "bg-green-100 text-green-800" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", accent: "bg-orange-500", badge: "bg-orange-100 text-orange-800" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", accent: "bg-pink-500", badge: "bg-pink-100 text-pink-800" },
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", accent: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", accent: "bg-teal-500", badge: "bg-teal-100 text-teal-800" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", accent: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", accent: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", accent: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-800" },
] as const;

/**
 * Simple hash function to convert string to number
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a consistent color scheme for an account based on its ID or name
 */
export function getAccountColorScheme(accountId: string, accountName?: string): typeof COLOR_PALETTE[number] {
  // Use account name if available for more intuitive color assignment
  const key = accountName || accountId;
  const hash = hashString(key);
  const index = hash % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

/**
 * Get a subtle accent color for borders and highlights
 */
export function getAccountAccentColor(accountId: string, accountName?: string): string {
  return getAccountColorScheme(accountId, accountName).accent;
}
