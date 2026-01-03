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
 * Get the unified list of ICP targets for an account
 * Combines standard job titles with account-specific custom targets
 */
export function getUnifiedICPTargets(
  customTargets: string[] = []
): string[] {
  // Combine standard titles with custom targets
  const allTargets = [...ALL_JOB_TITLES, ...customTargets]
  
  // Remove duplicates (case-insensitive) and sort
  const uniqueTargets = Array.from(
    new Map(
      allTargets.map(title => [title.toLowerCase(), title])
    ).values()
  ).sort()
  
  return uniqueTargets
}

/**
 * Extract custom ICP targets from a list
 * Returns only targets that are not in the standard list
 */
export function extractCustomTargets(
  targets: string[],
  standardList: string[] = ALL_JOB_TITLES
): string[] {
  const standardLower = new Set(standardList.map(t => t.toLowerCase()))
  return targets.filter(
    target => !standardLower.has(target.toLowerCase())
  )
}

/**
 * Merge custom targets into existing list, avoiding duplicates
 */
export function mergeCustomTargets(
  existingCustom: string[],
  newTargets: string[]
): string[] {
  const existingLower = new Set(existingCustom.map(t => t.toLowerCase()))
  const standardLower = new Set(ALL_JOB_TITLES.map(t => t.toLowerCase()))
  
  // Add new targets that aren't already in custom or standard lists
  const toAdd = newTargets.filter(
    target => 
      !existingLower.has(target.toLowerCase()) &&
      !standardLower.has(target.toLowerCase())
  )
  
  return [...existingCustom, ...toAdd]
}

/**
 * Check if a target is a custom target (not in standard list)
 */
export function isCustomTarget(target: string): boolean {
  return !ALL_JOB_TITLES.some(
    standard => standard.toLowerCase() === target.toLowerCase()
  )
}
