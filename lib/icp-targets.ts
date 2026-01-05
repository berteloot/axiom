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
 * Get the unified list of ICP targets for an account
 * Combines standard job titles with account-specific custom targets
 * Standardizes capitalization and removes duplicates
 */
export function getUnifiedICPTargets(
  customTargets: string[] = []
): string[] {
  // Combine standard titles with custom targets
  const allTargets = [...ALL_JOB_TITLES, ...customTargets]
  
  // Standardize all titles first
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
 */
export function extractCustomTargets(
  targets: string[],
  standardList: string[] = ALL_JOB_TITLES
): string[] {
  const standardLower = new Set(standardList.map(t => t.toLowerCase()))
  return targets
    .map(t => standardizeJobTitle(t))
    .filter(
      target => !standardLower.has(target.toLowerCase())
    )
}

/**
 * Merge custom targets into existing list, avoiding duplicates
 * Standardizes all targets before merging
 */
export function mergeCustomTargets(
  existingCustom: string[],
  newTargets: string[]
): string[] {
  // Standardize existing custom targets
  const standardizedExisting = existingCustom.map(t => standardizeJobTitle(t))
  const existingLower = new Set(standardizedExisting.map(t => t.toLowerCase()))
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  
  // Standardize and filter new targets
  const toAdd = newTargets
    .map(t => standardizeJobTitle(t))
    .filter(
      target => 
        !existingLower.has(target.toLowerCase()) &&
        !standardLower.has(target.toLowerCase())
    )
  
  return [...standardizedExisting, ...toAdd]
}

/**
 * Check if a target is a custom target (not in standard list)
 */
export function isCustomTarget(target: string): boolean {
  const standardized = standardizeJobTitle(target)
  return !ALL_JOB_TITLES.some(
    standard => standard.toLowerCase() === standardized.toLowerCase()
  )
}

/**
 * Standardize an array of ICP targets
 * Useful for normalizing data before saving to database
 */
export function standardizeICPTargets(targets: string[]): string[] {
  const standardized = targets.map(t => standardizeJobTitle(t))
  // Remove duplicates (case-insensitive)
  return Array.from(
    new Map(
      standardized.map(title => [title.toLowerCase(), title])
    ).values()
  )
}
