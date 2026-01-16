/**
 * Unified ICP Targets System
 * 
 * This module provides a unified list of ICP targets that combines:
 * 1. Standard job titles from the job-titles library
 * 2. Custom ICP targets created by the account
 * 
 * Both Brand Identity and Asset Review forms use this unified list.
 */

import { ALL_JOB_TITLES } from "./job-titles"

// Re-export ALL_JOB_TITLES for convenience (components can import from either location)
export { ALL_JOB_TITLES } from "./job-titles"

/**
 * Words that should remain lowercase unless they're the first word
 */
const LOWERCASE_WORDS = new Set([
  'of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by'
])

/**
 * Standardize job title capitalization
 * Converts titles to proper title case, handling:
 * - Words like "of", "and", "the" remain lowercase unless first word
 * - Acronyms in parentheses (e.g., "(CEO)", "(CTO)")
 * - Special cases like "VP of Technology" -> "VP of Technology"
 */
export function standardizeJobTitle(title: string): string {
  if (!title || title.trim().length === 0) {
    return title
  }

  // Handle parenthetical acronyms (e.g., "Chief Executive Officer (CEO)")
  const parenMatch = title.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
  if (parenMatch) {
    const mainTitle = standardizeJobTitle(parenMatch[1])
    const acronym = parenMatch[2].toUpperCase()
    return `${mainTitle} (${acronym})`
  }

  // Split into words
  const words = title.trim().split(/\s+/)
  
  // Capitalize each word appropriately
  const standardized = words.map((word, index) => {
    // If it's the first word, always capitalize
    if (index === 0) {
      return capitalizeWord(word)
    }
    
    // Check if it's a lowercase word (like "of", "and")
    const lowerWord = word.toLowerCase()
    if (LOWERCASE_WORDS.has(lowerWord)) {
      return lowerWord
    }
    
    // Check if it's already an acronym (all caps, 2-5 chars)
    if (/^[A-Z]{2,5}$/.test(word)) {
      return word
    }
    
    // Otherwise capitalize normally
    return capitalizeWord(word)
  })
  
  return standardized.join(' ')
}

/**
 * Capitalize the first letter of a word, keeping the rest as-is
 */
function capitalizeWord(word: string): string {
  if (!word || word.length === 0) {
    return word
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Build a map of acronyms to their full job titles
 * Extracts acronyms from parentheticals (e.g., "CEO" -> "Chief Executive Officer (CEO)")
 */
function buildAcronymMap(): Map<string, string> {
  const acronymMap = new Map<string, string>()
  
  ALL_JOB_TITLES.forEach(title => {
    const parenMatch = title.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
    if (parenMatch) {
      const acronym = parenMatch[2].toUpperCase()
      const fullTitle = title
      // Map both uppercase and title-case versions of acronym
      acronymMap.set(acronym.toLowerCase(), fullTitle)
      acronymMap.set(acronym.toUpperCase(), fullTitle)
      // Also map title-case version (e.g., "Cio")
      const titleCaseAcronym = acronym.charAt(0).toUpperCase() + acronym.slice(1).toLowerCase()
      acronymMap.set(titleCaseAcronym.toLowerCase(), fullTitle)
    }
  })
  
  return acronymMap
}

/**
 * Normalize equivalent job title variants to standard forms
 * Maps variants like "Chief Operations Officer" -> "Chief Operating Officer (COO)"
 * Maps all C-suite titles without acronyms to their standard form with acronym
 * (e.g., "Chief Technology Officer" -> "Chief Technology Officer (CTO)")
 */
function normalizeJobTitleVariant(title: string): string {
  const normalized = title.trim()
  const lower = normalized.toLowerCase()
  
  // If it already has an acronym, check if it needs normalization first
  // (e.g., "Chief Operations Officer (COO)" -> "Chief Operating Officer (COO)")
  
  // Specific case: "Chief Operations Officer" -> "Chief Operating Officer (COO)"
  if (lower === "chief operations officer" || lower.match(/^chief operations officer\s*\(/i)) {
    return "Chief Operating Officer (COO)"
  }
  
  // Check all standard titles to see if this matches a base title (without acronym)
  // This handles all C-suite titles: CTO, CFO, CEO, CMO, CIO, CPO, CDO, CSO, etc.
  for (const standardTitle of ALL_JOB_TITLES) {
    const standardLower = standardTitle.toLowerCase()
    const baseMatch = standardLower.match(/^(.+?)\s*\(([a-z]+)\)\s*$/)
    if (baseMatch) {
      const baseTitle = baseMatch[1].trim()
      // Normalize spaces and compare case-insensitively
      const normalizedBase = baseTitle.replace(/\s+/g, ' ').toLowerCase()
      const inputBase = lower.replace(/\s+/g, ' ').trim()
      
      // If input matches base title and doesn't already have an acronym, use the standard version
      if (normalizedBase === inputBase && !normalized.match(/\([A-Z]+\)/)) {
        return standardTitle
      }
    }
  }
  
  // Map "Chief Operating Officer" without acronym to "Chief Operating Officer (COO)"
  // (This is a specific case that might not be caught above due to "Operations" vs "Operating")
  if (lower === "chief operating officer" && !normalized.match(/\(COO\)/i)) {
    return "Chief Operating Officer (COO)"
  }
  
  return normalized
}

/**
 * Extract the base title from a title with an acronym
 * "Chief Financial Officer (CFO)" -> "Chief Financial Officer"
 * "Chief Financial Officer" -> "Chief Financial Officer"
 * Also normalizes variants like "Chief Operations Officer" -> "Chief Operating Officer"
 */
function extractBaseTitle(title: string): string {
  const normalized = normalizeJobTitleVariant(title)
  const parenMatch = normalized.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
  if (parenMatch) {
    return parenMatch[1].trim()
  }
  return normalized.trim()
}

/**
 * Get the unified list of ICP targets for an account
 * Combines standard job titles with account-specific custom targets
 * Standardizes capitalization and removes duplicates
 * Handles acronym matching (e.g., "Cio" or "CIO" -> "Chief Information Officer (CIO)")
 * Deduplicates titles with/without acronyms (e.g., "Chief Financial Officer" and "Chief Financial Officer (CFO)" -> only "Chief Financial Officer (CFO)")
 */
export function getUnifiedICPTargets(
  customTargets: string[] = []
): string[] {
  // Build acronym map to detect when custom targets are just acronyms
  const acronymMap = buildAcronymMap()
  
  // Map custom targets: if they're acronyms, use the full title instead
  // Also normalize equivalent variants (e.g., "Chief Operations Officer" -> "Chief Operating Officer (COO)")
  const normalizedCustomTargets = customTargets.map(target => {
    // First normalize variants
    const variantNormalized = normalizeJobTitleVariant(target)
    
    // Then standardize capitalization
    const standardized = standardizeJobTitle(variantNormalized)
    const lowerTarget = standardized.toLowerCase().trim()
    
    // Check if this is just an acronym (2-5 chars, mostly letters)
    if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
      const fullTitle = acronymMap.get(lowerTarget)
      if (fullTitle) {
        return fullTitle
      }
    }
    
    return standardized
  })
  
  // Combine standard titles with normalized custom targets
  const allTargets = [...ALL_JOB_TITLES, ...normalizedCustomTargets]
  
  // Normalize variants and standardize all titles
  const standardized = allTargets.map(title => {
    const variantNormalized = normalizeJobTitleVariant(title)
    return standardizeJobTitle(variantNormalized)
  })
  
  // Build a map to track titles by their base title (without acronym)
  // Prefer titles with acronyms over those without
  const titleMap = new Map<string, string>()
  
  // First pass: collect all titles with acronyms (these take precedence)
  const titlesWithAcronyms = new Set<string>()
  standardized.forEach(title => {
    const lowerTitle = title.toLowerCase()
    const parenMatch = title.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
    if (parenMatch) {
      titlesWithAcronyms.add(lowerTitle)
      const baseTitle = extractBaseTitle(title).toLowerCase()
      // Map base title to the full title with acronym
      const existing = titleMap.get(baseTitle)
      if (!existing || !existing.match(/\([A-Z]+\)/)) {
        titleMap.set(baseTitle, title)
      }
    }
  })
  
  // Second pass: add titles without acronyms only if no version with acronym exists
  standardized.forEach(title => {
    const lowerTitle = title.toLowerCase()
    const baseTitle = extractBaseTitle(title).toLowerCase()
    
    // If this title has an acronym, it's already handled
    if (titlesWithAcronyms.has(lowerTitle)) {
      return
    }
    
    // If there's already a version with an acronym, skip this one
    const existing = titleMap.get(baseTitle)
    if (existing && existing.match(/\([A-Z]+\)/)) {
      return
    }
    
    // If no entry exists or existing entry also doesn't have acronym, add/keep this one
    if (!existing || !existing.match(/\([A-Z]+\)/)) {
      titleMap.set(baseTitle, title)
    }
  })
  
  // Convert map values to array, then sort
  const uniqueTargets = Array.from(titleMap.values()).sort()
  
  return uniqueTargets
}

/**
 * Extract custom ICP targets from a list
 * Returns only targets that are not in the standard list
 * Standardizes targets before checking
 * Excludes acronyms that match standard job titles (e.g., "Cio" -> "Chief Information Officer (CIO)")
 * Excludes titles that match standard titles by base title (e.g., "Chief Financial Officer" when "Chief Financial Officer (CFO)" is standard)
 */
export function extractCustomTargets(
  targets: string[],
  standardList: string[] = ALL_JOB_TITLES
): string[] {
  const acronymMap = buildAcronymMap()
  const standardLower = new Set(standardList.map(t => t.toLowerCase()))
  
  // Build a set of base titles from standard list for base title matching
  const standardBaseTitles = new Set<string>()
  standardList.forEach(title => {
    const baseTitle = extractBaseTitle(title).toLowerCase()
    standardBaseTitles.add(baseTitle)
  })
  
  return targets
    .map(t => {
      // Normalize variants first (e.g., "Chief Operations Officer" -> "Chief Operating Officer (COO)")
      const variantNormalized = normalizeJobTitleVariant(t)
      const standardized = standardizeJobTitle(variantNormalized)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // Check if this is just an acronym that matches a standard title
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle && standardLower.has(fullTitle.toLowerCase())) {
          // This is an acronym for a standard title, exclude it
          return null
        }
      }
      
      // Check if exact match in standard list
      if (standardLower.has(lowerTarget)) {
        return null
      }
      
      // Check if base title matches a standard title
      const baseTitle = extractBaseTitle(standardized).toLowerCase()
      if (standardBaseTitles.has(baseTitle)) {
        // This title's base matches a standard title, exclude it
        return null
      }
      
      return standardized
    })
    .filter((target): target is string => target !== null)
}

/**
 * Merge custom targets into existing list, avoiding duplicates
 * Standardizes all targets before merging
 * Handles acronym matching (e.g., "Cio" -> "Chief Information Officer (CIO)")
 * Deduplicates titles with/without acronyms (e.g., "Chief Financial Officer" and "Chief Financial Officer (CFO)" -> only "Chief Financial Officer (CFO)")
 */
export function mergeCustomTargets(
  existingCustom: string[],
  newTargets: string[]
): string[] {
  const acronymMap = buildAcronymMap()
  
  // Build sets for base title matching
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  const standardBaseTitles = new Set<string>()
  ALL_JOB_TITLES.forEach(title => {
    const baseTitle = extractBaseTitle(title).toLowerCase()
    standardBaseTitles.add(baseTitle)
  })
  
  // Standardize existing custom targets and filter out acronyms and standard titles
  const standardizedExisting = existingCustom
    .map(t => {
      // Normalize variants first
      const variantNormalized = normalizeJobTitleVariant(t)
      const standardized = standardizeJobTitle(variantNormalized)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // If it's an acronym matching a standard title, return null to exclude it
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle) {
          return null // Exclude acronyms that match standard titles
        }
      }
      
      // Exclude if it matches a standard title exactly or by base title
      if (standardLower.has(lowerTarget)) {
        return null
      }
      
      const baseTitle = extractBaseTitle(standardized).toLowerCase()
      if (standardBaseTitles.has(baseTitle)) {
        return null
      }
      
      return standardized
    })
    .filter((t): t is string => t !== null)
  
  // Build base title maps for deduplication
  const existingBaseMap = new Map<string, string>()
  const existingLower = new Set<string>()
  
  // First pass: collect titles with acronyms
  const existingWithAcronyms = new Set<string>()
  standardizedExisting.forEach(title => {
    const lowerTitle = title.toLowerCase()
    existingLower.add(lowerTitle)
    const parenMatch = title.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
    if (parenMatch) {
      existingWithAcronyms.add(lowerTitle)
      const baseTitle = extractBaseTitle(title).toLowerCase()
      const existing = existingBaseMap.get(baseTitle)
      if (!existing || !existing.match(/\([A-Z]+\)/)) {
        existingBaseMap.set(baseTitle, title)
      }
    }
  })
  
  // Second pass: add titles without acronyms only if no version with acronym exists
  standardizedExisting.forEach(title => {
    const lowerTitle = title.toLowerCase()
    if (existingWithAcronyms.has(lowerTitle)) {
      return
    }
    const baseTitle = extractBaseTitle(title).toLowerCase()
    const existing = existingBaseMap.get(baseTitle)
    if (!existing || !existing.match(/\([A-Z]+\)/)) {
      existingBaseMap.set(baseTitle, title)
    }
  })
  
  // Standardize and filter new targets
  const toAdd = newTargets
    .map(t => {
      // Normalize variants first
      const variantNormalized = normalizeJobTitleVariant(t)
      const standardized = standardizeJobTitle(variantNormalized)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // If it's an acronym matching a standard title, return null to exclude it
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle && standardLower.has(fullTitle.toLowerCase())) {
          return null // Exclude acronyms that match standard titles
        }
      }
      
      // Exclude if it matches a standard title exactly or by base title
      if (standardLower.has(lowerTarget)) {
        return null
      }
      
      const baseTitle = extractBaseTitle(standardized).toLowerCase()
      if (standardBaseTitles.has(baseTitle)) {
        return null
      }
      
      // Exclude if it matches an existing custom target exactly
      if (existingLower.has(lowerTarget)) {
        return null
      }
      
      // Check if base title matches an existing custom target
      const existing = existingBaseMap.get(baseTitle)
      if (existing) {
        // If existing has acronym and new one doesn't, skip new one
        if (existing.match(/\([A-Z]+\)/) && !standardized.match(/\([A-Z]+\)/)) {
          return null
        }
        // If new one has acronym and existing doesn't, we'll replace it later
        if (standardized.match(/\([A-Z]+\)/) && !existing.match(/\([A-Z]+\)/)) {
          // We'll handle this in the final merge
          return standardized
        }
        // Both have acronyms or both don't, skip if same
        if (existing.toLowerCase() === lowerTarget) {
          return null
        }
      }
      
      return standardized
    })
    .filter((target): target is string => target !== null)
  
  // Merge: prefer versions with acronyms
  const mergedBaseMap = new Map(existingBaseMap)
  
  // Add new targets, preferring versions with acronyms
  toAdd.forEach(title => {
    const baseTitle = extractBaseTitle(title).toLowerCase()
    const existing = mergedBaseMap.get(baseTitle)
    
    if (!existing) {
      mergedBaseMap.set(baseTitle, title)
    } else {
      // Prefer version with acronym
      const existingHasAcronym = existing.match(/\([A-Z]+\)/)
      const newHasAcronym = title.match(/\([A-Z]+\)/)
      
      if (newHasAcronym && !existingHasAcronym) {
        mergedBaseMap.set(baseTitle, title)
      }
      // If both have acronyms or both don't, keep existing (first one)
    }
  })
  
  return Array.from(mergedBaseMap.values())
}

/**
 * Check if a target is a custom target (not in standard list)
 * Returns false if the target is just an acronym for a standard title
 * Returns false if the target's base title matches a standard title (e.g., "Chief Financial Officer" when "Chief Financial Officer (CFO)" is standard)
 */
export function isCustomTarget(target: string): boolean {
  // Normalize variants first
  const variantNormalized = normalizeJobTitleVariant(target)
  const standardized = standardizeJobTitle(variantNormalized)
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  
  // Build a set of base titles from standard list for base title matching
  const standardBaseTitles = new Set<string>()
  ALL_JOB_TITLES.forEach(title => {
    const baseTitle = extractBaseTitle(title).toLowerCase()
    standardBaseTitles.add(baseTitle)
  })
  
  // Check if it matches a standard title directly
  if (standardLower.has(standardized.toLowerCase())) {
    return false
  }
  
  // Check if base title matches a standard title
  const baseTitle = extractBaseTitle(standardized).toLowerCase()
  if (standardBaseTitles.has(baseTitle)) {
    return false // Base title matches a standard title
  }
  
  // Check if it's just an acronym for a standard title
  const acronymMap = buildAcronymMap()
  const lowerTarget = standardized.toLowerCase().trim()
  if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
    const fullTitle = acronymMap.get(lowerTarget)
    if (fullTitle && standardLower.has(fullTitle.toLowerCase())) {
      return false // It's an acronym for a standard title
    }
  }
  
  return true
}

/**
 * Standardize an array of ICP targets
 * Useful for normalizing data before saving to database
 * Handles acronym mapping (e.g., "Cio" -> "Chief Information Officer (CIO)")
 * Deduplicates titles with/without acronyms (e.g., "Chief Financial Officer" and "Chief Financial Officer (CFO)" -> only "Chief Financial Officer (CFO)")
 */
export function standardizeICPTargets(targets: string[]): string[] {
  const acronymMap = buildAcronymMap()
  
  // Map acronyms to full titles before standardizing
  // Also normalize variants (e.g., "Chief Operations Officer" -> "Chief Operating Officer (COO)")
  const normalized = targets.map(target => {
    // Normalize variants first
    const variantNormalized = normalizeJobTitleVariant(target)
    const standardized = standardizeJobTitle(variantNormalized)
    const lowerTarget = standardized.toLowerCase().trim()
    
    // Check if this is just an acronym that matches a standard title
    if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
      const fullTitle = acronymMap.get(lowerTarget)
      if (fullTitle) {
        return fullTitle
      }
    }
    
    return standardized
  })
  
  // Build a map to track titles by their base title (without acronym)
  // Prefer titles with acronyms over those without
  const titleMap = new Map<string, string>()
  
  // First pass: collect all titles with acronyms (these take precedence)
  const titlesWithAcronyms = new Set<string>()
  normalized.forEach(title => {
    const lowerTitle = title.toLowerCase()
    const parenMatch = title.match(/^(.+?)\s*\(([A-Z]+)\)\s*$/)
    if (parenMatch) {
      titlesWithAcronyms.add(lowerTitle)
      const baseTitle = extractBaseTitle(title).toLowerCase()
      // Map base title to the full title with acronym
      const existing = titleMap.get(baseTitle)
      if (!existing || !existing.match(/\([A-Z]+\)/)) {
        titleMap.set(baseTitle, title)
      }
    }
  })
  
  // Second pass: add titles without acronyms only if no version with acronym exists
  normalized.forEach(title => {
    const lowerTitle = title.toLowerCase()
    const baseTitle = extractBaseTitle(title).toLowerCase()
    
    // If this title has an acronym, it's already handled
    if (titlesWithAcronyms.has(lowerTitle)) {
      return
    }
    
    // If there's already a version with an acronym, skip this one
    const existing = titleMap.get(baseTitle)
    if (existing && existing.match(/\([A-Z]+\)/)) {
      return
    }
    
    // If no entry exists or existing entry also doesn't have acronym, add/keep this one
    if (!existing || !existing.match(/\([A-Z]+\)/)) {
      titleMap.set(baseTitle, title)
    }
  })
  
  // Convert map values to array
  return Array.from(titleMap.values())
}
