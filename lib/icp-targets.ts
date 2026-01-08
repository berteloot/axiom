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
 * Get the unified list of ICP targets for an account
 * Combines standard job titles with account-specific custom targets
 * Standardizes capitalization and removes duplicates
 * Handles acronym matching (e.g., "Cio" or "CIO" -> "Chief Information Officer (CIO)")
 */
export function getUnifiedICPTargets(
  customTargets: string[] = []
): string[] {
  // Build acronym map to detect when custom targets are just acronyms
  const acronymMap = buildAcronymMap()
  
  // Map custom targets: if they're acronyms, use the full title instead
  const normalizedCustomTargets = customTargets.map(target => {
    const standardized = standardizeJobTitle(target)
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
  
  // Standardize all titles
  const standardized = allTargets.map(title => standardizeJobTitle(title))
  
  // Remove duplicates (case-insensitive) and keep the standardized version
  const uniqueTargets = Array.from(
    new Map(
      standardized.map(title => [title.toLowerCase(), title])
    ).values()
  ).sort()
  
  return uniqueTargets
}

/**
 * Extract custom ICP targets from a list
 * Returns only targets that are not in the standard list
 * Standardizes targets before checking
 * Excludes acronyms that match standard job titles (e.g., "Cio" -> "Chief Information Officer (CIO)")
 */
export function extractCustomTargets(
  targets: string[],
  standardList: string[] = ALL_JOB_TITLES
): string[] {
  const acronymMap = buildAcronymMap()
  const standardLower = new Set(standardList.map(t => t.toLowerCase()))
  
  return targets
    .map(t => {
      const standardized = standardizeJobTitle(t)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // Check if this is just an acronym that matches a standard title
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle && standardLower.has(fullTitle.toLowerCase())) {
          // This is an acronym for a standard title, exclude it
          return null
        }
      }
      
      return standardized
    })
    .filter(
      (target): target is string => 
        target !== null && !standardLower.has(target.toLowerCase())
    )
}

/**
 * Merge custom targets into existing list, avoiding duplicates
 * Standardizes all targets before merging
 * Handles acronym matching (e.g., "Cio" -> "Chief Information Officer (CIO)")
 */
export function mergeCustomTargets(
  existingCustom: string[],
  newTargets: string[]
): string[] {
  const acronymMap = buildAcronymMap()
  
  // Standardize existing custom targets and filter out acronyms
  const standardizedExisting = existingCustom
    .map(t => {
      const standardized = standardizeJobTitle(t)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // If it's an acronym matching a standard title, return null to exclude it
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle) {
          return null // Exclude acronyms that match standard titles
        }
      }
      
      return standardized
    })
    .filter((t): t is string => t !== null)
  
  const existingLower = new Set(standardizedExisting.map(t => t.toLowerCase()))
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  
  // Standardize and filter new targets
  const toAdd = newTargets
    .map(t => {
      const standardized = standardizeJobTitle(t)
      const lowerTarget = standardized.toLowerCase().trim()
      
      // If it's an acronym matching a standard title, return null to exclude it
      if (/^[a-z]{2,5}$/i.test(standardized.trim())) {
        const fullTitle = acronymMap.get(lowerTarget)
        if (fullTitle && standardLower.has(fullTitle.toLowerCase())) {
          return null // Exclude acronyms that match standard titles
        }
      }
      
      return standardized
    })
    .filter(
      (target): target is string => 
        target !== null &&
        !existingLower.has(target.toLowerCase()) &&
        !standardLower.has(target.toLowerCase())
    )
  
  return [...standardizedExisting, ...toAdd]
}

/**
 * Check if a target is a custom target (not in standard list)
 * Returns false if the target is just an acronym for a standard title
 */
export function isCustomTarget(target: string): boolean {
  const standardized = standardizeJobTitle(target)
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  
  // Check if it matches a standard title directly
  if (standardLower.has(standardized.toLowerCase())) {
    return false
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
 */
export function standardizeICPTargets(targets: string[]): string[] {
  const acronymMap = buildAcronymMap()
  
  // Map acronyms to full titles before standardizing
  const normalized = targets.map(target => {
    const standardized = standardizeJobTitle(target)
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
  
  // Remove duplicates (case-insensitive) and keep the standardized version
  return Array.from(
    new Map(
      normalized.map(title => [title.toLowerCase(), title])
    ).values()
  )
}
