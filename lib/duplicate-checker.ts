/**
 * PHASE 2: Duplicate Check
 * 
 * Checks which discovered URLs already exist in the database.
 * This happens BEFORE any scraping to avoid wasting credits.
 */

import { prisma } from '@/lib/prisma';
import { DiscoveredUrl } from './blog-discovery';

export interface CheckedUrl extends DiscoveredUrl {
  isDuplicate: boolean;
  existingAssetId: string | null;
}

export interface DuplicateCheckResult {
  all: CheckedUrl[];
  new: CheckedUrl[];
  duplicates: CheckedUrl[];
  stats: {
    total: number;
    new: number;
    duplicates: number;
  };
}

/**
 * Check which URLs already exist in the database
 * 
 * @param urls - Array of discovered URLs
 * @param accountId - User's account ID
 * @returns URLs marked as duplicate or new
 */
export async function checkForDuplicates(
  urls: DiscoveredUrl[],
  accountId: string
): Promise<DuplicateCheckResult> {
  console.log(`[Duplicate Check] Checking ${urls.length} URLs against database...`);

  if (urls.length === 0) {
    return {
      all: [],
      new: [],
      duplicates: [],
      stats: {
        total: 0,
        new: 0,
        duplicates: 0,
      },
    };
  }

  // Get all existing assets with atomicSnippets for this account
  const existingAssets = await prisma.asset.findMany({
    where: {
      accountId,
      atomicSnippets: {
        not: null as any, // Prisma type issue - this works at runtime
      },
    },
    select: {
      id: true,
      title: true,
      atomicSnippets: true,
    },
  });

  // Create a map of existing source URLs
  const existingUrlMap = new Map<string, { id: string; title: string }>();
  
  existingAssets.forEach(asset => {
    const snippets = asset.atomicSnippets as any;
    if (snippets?.sourceUrl && typeof snippets.sourceUrl === 'string') {
      existingUrlMap.set(snippets.sourceUrl, {
        id: asset.id,
        title: asset.title,
      });
    }
  });

  // Mark each URL as duplicate or new
  const results: CheckedUrl[] = urls.map(url => {
    const existing = existingUrlMap.get(url.url);
    return {
      ...url,
      isDuplicate: !!existing,
      existingAssetId: existing?.id || null,
    };
  });

  const newUrls = results.filter(u => !u.isDuplicate);
  const duplicateUrls = results.filter(u => u.isDuplicate);

  console.log(
    `[Duplicate Check] ✅ ${newUrls.length} new, ${duplicateUrls.length} duplicates (${((duplicateUrls.length / results.length) * 100).toFixed(1)}% duplicate rate)`
  );

  return {
    all: results,
    new: newUrls,
    duplicates: duplicateUrls,
    stats: {
      total: results.length,
      new: newUrls.length,
      duplicates: duplicateUrls.length,
    },
  };
}
