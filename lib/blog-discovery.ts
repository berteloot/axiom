/**
 * PHASE 1: Content URL Discovery
 * 
 * Discovers content URLs using cheap/free methods in order of cost:
 * 1. Sitemap parsing (FREE)
 * 2. RSS feed parsing (FREE)
 * 3. Firecrawl Map endpoint (CHEAP - ~1 credit, just URLs)
 * 
 * Returns URLs with basic metadata (NO content scraping)
 * 
 * Supports multiple content types:
 * - Blog posts, articles, news
 * - Case studies, customer stories
 * - Testimonials, reviews
 * - Documentation, help center, FAQs
 * - Guides, tutorials, how-tos
 * - Whitepapers, reports, resources
 */

import * as cheerio from 'cheerio';

export interface DiscoveredUrl {
  url: string;
  title: string;
  publishedDate: string | null;
  contentSection?: string; // The detected content section (e.g., "blog", "case-studies", "help-center")
  language?: string; // ISO 639-1 language code (e.g., "en", "de", "es")
}

export interface DiscoveryResult {
  urls: DiscoveredUrl[];
  discoveryMethod: 'sitemap' | 'rss' | 'firecrawl-map' | 'firecrawl-crawl';
  creditsUsed: number;
  fallbackRequired?: boolean;
  contentSections?: string[]; // List of discovered content sections
  detectedLanguages?: string[]; // List of detected language codes
}

/**
 * Language detection configuration
 * Maps various URL patterns to ISO 639-1 language codes
 */
export interface LanguageConfig {
  code: string;       // ISO 639-1 code (e.g., "en", "de", "es")
  name: string;       // Display name (e.g., "English", "German", "Spanish")
  patterns: RegExp[]; // URL patterns that indicate this language
}

/**
 * Comprehensive language detection patterns
 * Supports subdomain, path prefix, query params, and various naming conventions
 */
export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    code: 'en',
    name: 'English',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/en\./i,
      /^https?:\/\/eng\./i,
      /^https?:\/\/english\./i,
      /^https?:\/\/www-en\./i,
      // Path prefix patterns (at start of path)
      /^\/en(?:\/|$)/i,
      /^\/en[-_]us(?:\/|$)/i,
      /^\/en[-_]gb(?:\/|$)/i,
      /^\/en[-_]au(?:\/|$)/i,
      /^\/en[-_]ca(?:\/|$)/i,
      /^\/en[-_]uk(?:\/|$)/i,
      /^\/eng(?:\/|$)/i,
      /^\/english(?:\/|$)/i,
      /^\/us(?:\/|$)/i,
      /^\/uk(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=en/i,
      /[?&]locale=en/i,
      /[?&]hl=en/i,
    ],
  },
  {
    code: 'de',
    name: 'German',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/de\./i,
      /^https?:\/\/ger\./i,
      /^https?:\/\/german\./i,
      /^https?:\/\/www-de\./i,
      // Path prefix patterns
      /^\/de(?:\/|$)/i,
      /^\/de[-_]de(?:\/|$)/i,
      /^\/de[-_]at(?:\/|$)/i,
      /^\/de[-_]ch(?:\/|$)/i,
      /^\/ger(?:\/|$)/i,
      /^\/german(?:\/|$)/i,
      /^\/deutsch(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=de/i,
      /[?&]locale=de/i,
      /[?&]hl=de/i,
    ],
  },
  {
    code: 'es',
    name: 'Spanish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/es\./i,
      /^https?:\/\/spa\./i,
      /^https?:\/\/spanish\./i,
      /^https?:\/\/www-es\./i,
      // Path prefix patterns
      /^\/es(?:\/|$)/i,
      /^\/es[-_]es(?:\/|$)/i,
      /^\/es[-_]mx(?:\/|$)/i,
      /^\/es[-_]ar(?:\/|$)/i,
      /^\/es[-_]latam(?:\/|$)/i,
      /^\/spa(?:\/|$)/i,
      /^\/spanish(?:\/|$)/i,
      /^\/espanol(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=es/i,
      /[?&]locale=es/i,
      /[?&]hl=es/i,
    ],
  },
  {
    code: 'fr',
    name: 'French',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/fr\./i,
      /^https?:\/\/fra\./i,
      /^https?:\/\/french\./i,
      /^https?:\/\/www-fr\./i,
      // Path prefix patterns
      /^\/fr(?:\/|$)/i,
      /^\/fr[-_]fr(?:\/|$)/i,
      /^\/fr[-_]ca(?:\/|$)/i,
      /^\/fr[-_]be(?:\/|$)/i,
      /^\/fr[-_]ch(?:\/|$)/i,
      /^\/fra(?:\/|$)/i,
      /^\/french(?:\/|$)/i,
      /^\/francais(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=fr/i,
      /[?&]locale=fr/i,
      /[?&]hl=fr/i,
    ],
  },
  {
    code: 'it',
    name: 'Italian',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/it\./i,
      /^https?:\/\/ita\./i,
      /^https?:\/\/italian\./i,
      // Path prefix patterns
      /^\/it(?:\/|$)/i,
      /^\/it[-_]it(?:\/|$)/i,
      /^\/ita(?:\/|$)/i,
      /^\/italian(?:\/|$)/i,
      /^\/italiano(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=it/i,
      /[?&]locale=it/i,
      /[?&]hl=it/i,
    ],
  },
  {
    code: 'pt',
    name: 'Portuguese',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/pt\./i,
      /^https?:\/\/por\./i,
      /^https?:\/\/portuguese\./i,
      /^https?:\/\/br\./i,
      // Path prefix patterns
      /^\/pt(?:\/|$)/i,
      /^\/pt[-_]pt(?:\/|$)/i,
      /^\/pt[-_]br(?:\/|$)/i,
      /^\/por(?:\/|$)/i,
      /^\/portuguese(?:\/|$)/i,
      /^\/portugues(?:\/|$)/i,
      /^\/br(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=pt/i,
      /[?&]locale=pt/i,
      /[?&]hl=pt/i,
    ],
  },
  {
    code: 'nl',
    name: 'Dutch',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/nl\./i,
      /^https?:\/\/dut\./i,
      /^https?:\/\/dutch\./i,
      // Path prefix patterns
      /^\/nl(?:\/|$)/i,
      /^\/nl[-_]nl(?:\/|$)/i,
      /^\/nl[-_]be(?:\/|$)/i,
      /^\/dut(?:\/|$)/i,
      /^\/dutch(?:\/|$)/i,
      /^\/nederlands(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=nl/i,
      /[?&]locale=nl/i,
      /[?&]hl=nl/i,
    ],
  },
  {
    code: 'ja',
    name: 'Japanese',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/ja\./i,
      /^https?:\/\/jp\./i,
      /^https?:\/\/japanese\./i,
      // Path prefix patterns
      /^\/ja(?:\/|$)/i,
      /^\/ja[-_]jp(?:\/|$)/i,
      /^\/jp(?:\/|$)/i,
      /^\/japanese(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=ja/i,
      /[?&]locale=ja/i,
      /[?&]hl=ja/i,
    ],
  },
  {
    code: 'zh',
    name: 'Chinese',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/zh\./i,
      /^https?:\/\/cn\./i,
      /^https?:\/\/chinese\./i,
      // Path prefix patterns
      /^\/zh(?:\/|$)/i,
      /^\/zh[-_]cn(?:\/|$)/i,
      /^\/zh[-_]tw(?:\/|$)/i,
      /^\/zh[-_]hans(?:\/|$)/i,
      /^\/zh[-_]hant(?:\/|$)/i,
      /^\/cn(?:\/|$)/i,
      /^\/chinese(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=zh/i,
      /[?&]locale=zh/i,
      /[?&]hl=zh/i,
    ],
  },
  {
    code: 'ko',
    name: 'Korean',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/ko\./i,
      /^https?:\/\/kr\./i,
      /^https?:\/\/korean\./i,
      // Path prefix patterns
      /^\/ko(?:\/|$)/i,
      /^\/ko[-_]kr(?:\/|$)/i,
      /^\/kr(?:\/|$)/i,
      /^\/korean(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=ko/i,
      /[?&]locale=ko/i,
      /[?&]hl=ko/i,
    ],
  },
  {
    code: 'ru',
    name: 'Russian',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/ru\./i,
      /^https?:\/\/rus\./i,
      /^https?:\/\/russian\./i,
      // Path prefix patterns
      /^\/ru(?:\/|$)/i,
      /^\/ru[-_]ru(?:\/|$)/i,
      /^\/rus(?:\/|$)/i,
      /^\/russian(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=ru/i,
      /[?&]locale=ru/i,
      /[?&]hl=ru/i,
    ],
  },
  {
    code: 'pl',
    name: 'Polish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/pl\./i,
      /^https?:\/\/pol\./i,
      /^https?:\/\/polish\./i,
      // Path prefix patterns
      /^\/pl(?:\/|$)/i,
      /^\/pl[-_]pl(?:\/|$)/i,
      /^\/pol(?:\/|$)/i,
      /^\/polish(?:\/|$)/i,
      /^\/polski(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=pl/i,
      /[?&]locale=pl/i,
      /[?&]hl=pl/i,
    ],
  },
  {
    code: 'sv',
    name: 'Swedish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/sv\./i,
      /^https?:\/\/se\./i,
      /^https?:\/\/swedish\./i,
      // Path prefix patterns
      /^\/sv(?:\/|$)/i,
      /^\/sv[-_]se(?:\/|$)/i,
      /^\/se(?:\/|$)/i,
      /^\/swedish(?:\/|$)/i,
      /^\/svenska(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=sv/i,
      /[?&]locale=sv/i,
      /[?&]hl=sv/i,
    ],
  },
  {
    code: 'no',
    name: 'Norwegian',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/no\./i,
      /^https?:\/\/nor\./i,
      /^https?:\/\/norwegian\./i,
      // Path prefix patterns
      /^\/no(?:\/|$)/i,
      /^\/no[-_]no(?:\/|$)/i,
      /^\/nb(?:\/|$)/i,
      /^\/nn(?:\/|$)/i,
      /^\/nor(?:\/|$)/i,
      /^\/norwegian(?:\/|$)/i,
      /^\/norsk(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=no/i,
      /[?&]locale=no/i,
      /[?&]hl=no/i,
    ],
  },
  {
    code: 'da',
    name: 'Danish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/da\./i,
      /^https?:\/\/dk\./i,
      /^https?:\/\/danish\./i,
      // Path prefix patterns
      /^\/da(?:\/|$)/i,
      /^\/da[-_]dk(?:\/|$)/i,
      /^\/dk(?:\/|$)/i,
      /^\/danish(?:\/|$)/i,
      /^\/dansk(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=da/i,
      /[?&]locale=da/i,
      /[?&]hl=da/i,
    ],
  },
  {
    code: 'fi',
    name: 'Finnish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/fi\./i,
      /^https?:\/\/fin\./i,
      /^https?:\/\/finnish\./i,
      // Path prefix patterns
      /^\/fi(?:\/|$)/i,
      /^\/fi[-_]fi(?:\/|$)/i,
      /^\/fin(?:\/|$)/i,
      /^\/finnish(?:\/|$)/i,
      /^\/suomi(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=fi/i,
      /[?&]locale=fi/i,
      /[?&]hl=fi/i,
    ],
  },
  {
    code: 'ar',
    name: 'Arabic',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/ar\./i,
      /^https?:\/\/arabic\./i,
      // Path prefix patterns
      /^\/ar(?:\/|$)/i,
      /^\/ar[-_]sa(?:\/|$)/i,
      /^\/ar[-_]ae(?:\/|$)/i,
      /^\/arabic(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=ar/i,
      /[?&]locale=ar/i,
      /[?&]hl=ar/i,
    ],
  },
  {
    code: 'he',
    name: 'Hebrew',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/he\./i,
      /^https?:\/\/il\./i,
      /^https?:\/\/hebrew\./i,
      // Path prefix patterns
      /^\/he(?:\/|$)/i,
      /^\/he[-_]il(?:\/|$)/i,
      /^\/il(?:\/|$)/i,
      /^\/hebrew(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=he/i,
      /[?&]locale=he/i,
      /[?&]hl=he/i,
    ],
  },
  {
    code: 'tr',
    name: 'Turkish',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/tr\./i,
      /^https?:\/\/tur\./i,
      /^https?:\/\/turkish\./i,
      // Path prefix patterns
      /^\/tr(?:\/|$)/i,
      /^\/tr[-_]tr(?:\/|$)/i,
      /^\/tur(?:\/|$)/i,
      /^\/turkish(?:\/|$)/i,
      /^\/turkce(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=tr/i,
      /[?&]locale=tr/i,
      /[?&]hl=tr/i,
    ],
  },
  {
    code: 'cs',
    name: 'Czech',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/cs\./i,
      /^https?:\/\/cz\./i,
      /^https?:\/\/czech\./i,
      // Path prefix patterns
      /^\/cs(?:\/|$)/i,
      /^\/cs[-_]cz(?:\/|$)/i,
      /^\/cz(?:\/|$)/i,
      /^\/czech(?:\/|$)/i,
      /^\/cesky(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=cs/i,
      /[?&]locale=cs/i,
      /[?&]hl=cs/i,
    ],
  },
  {
    code: 'hu',
    name: 'Hungarian',
    patterns: [
      // Subdomain patterns
      /^https?:\/\/hu\./i,
      /^https?:\/\/hun\./i,
      /^https?:\/\/hungarian\./i,
      // Path prefix patterns
      /^\/hu(?:\/|$)/i,
      /^\/hu[-_]hu(?:\/|$)/i,
      /^\/hun(?:\/|$)/i,
      /^\/hungarian(?:\/|$)/i,
      /^\/magyar(?:\/|$)/i,
      // Query parameter patterns
      /[?&]lang(?:uage)?=hu/i,
      /[?&]locale=hu/i,
      /[?&]hl=hu/i,
    ],
  },
];

/**
 * Detect language from a URL using comprehensive pattern matching
 * @param url - The URL to analyze
 * @returns ISO 639-1 language code or null if no language detected
 */
export function detectLanguageFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const fullUrl = url.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();
    
    // Check each language's patterns
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const pattern of lang.patterns) {
        // Test against full URL for subdomain/query patterns
        if (pattern.test(fullUrl) || pattern.test(pathname) || pattern.test(search)) {
          return lang.code;
        }
      }
    }
    
    return null; // No language detected - could be default/main language
  } catch {
    return null;
  }
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
  return lang?.name || code.toUpperCase();
}

/**
 * Get all supported language codes
 */
export function getSupportedLanguageCodes(): string[] {
  return SUPPORTED_LANGUAGES.map(l => l.code);
}

/**
 * Get language options for UI
 */
export function getLanguageOptions(): Array<{ code: string; name: string }> {
  return SUPPORTED_LANGUAGES.map(l => ({ code: l.code, name: l.name }));
}

/**
 * Common content section patterns that indicate a page is content (not navigation/utility)
 * These patterns are used to identify valid content URLs from sitemaps
 * 
 * The patterns are organized by content type for clarity, but all are treated equally
 * for discovery purposes. The URL filtering is intentionally permissive to support
 * various website architectures.
 */
const CONTENT_SECTION_PATTERNS = [
  // Blog / Articles / News
  'blog', 'blogs', 'article', 'articles', 'post', 'posts', 'news', 'newsroom',
  'press', 'press-releases', 'announcements', 'updates', 'insights',
  
  // Case Studies / Success Stories
  'case-study', 'case-studies', 'casestudy', 'casestudies', 'customer-story',
  'customer-stories', 'success-story', 'success-stories', 'use-case', 'use-cases',
  
  // Testimonials / Reviews
  'testimonial', 'testimonials', 'review', 'reviews', 'feedback',
  'customer-feedback', 'customer-reviews',
  
  // Documentation / Help
  'help', 'help-center', 'helpcenter', 'support', 'docs', 'documentation',
  'guide', 'guides', 'tutorial', 'tutorials', 'how-to', 'howto', 'faq', 'faqs',
  'learn', 'learning', 'knowledge', 'knowledge-base', 'knowledgebase', 'kb',
  
  // Resources / Whitepapers
  'resource', 'resources', 'whitepaper', 'whitepapers', 'white-paper', 'white-papers',
  'ebook', 'ebooks', 'e-book', 'e-books', 'report', 'reports', 'research',
  'download', 'downloads', 'library',
  
  // Events / Webinars
  'event', 'events', 'webinar', 'webinars', 'podcast', 'podcasts', 'video', 'videos',
  
  // Industry-specific
  'solutions', 'products', 'services', 'features', 'industries', 'verticals',
  
  // Localized variants (common in international sites)
  'actualites', 'noticias', 'nachrichten', 'nouvelles', // news in fr/es/de
  'etudes-de-cas', 'estudios-de-caso', 'fallstudien', // case studies
  'temoignages', 'ressources', 'ressourcen', // testimonials/resources
];

/**
 * Patterns that indicate a page is NOT content (navigation, utility, etc.)
 * These are excluded from discovery
 */
const EXCLUDED_PATH_PATTERNS = [
  // Navigation / Structure
  /^\/?(tag|tags|category|categories|author|authors|archive|archives)\/?$/i,
  /^\/?(search|login|logout|signin|signout|register|signup|account|profile)\/?$/i,
  /^\/?(cart|checkout|payment|order|orders)\/?$/i,
  /^\/?(privacy|terms|legal|cookie|cookies|gdpr|imprint|impressum)\/?$/i,
  /^\/?(contact|about|team|careers|jobs|sitemap)\/?$/i,
  
  // Pagination
  /\/page[-_]?\d+\/?$/i,
  /\/p\/\d+\/?$/i,
  /[?&]page=\d+/i,
  
  // Feeds and technical
  /\/(feed|rss|atom|sitemap)(\.xml)?\/?$/i,
  /\.(xml|json|txt|css|js)$/i,
  
  // Media files
  /\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|xls|xlsx|ppt|pptx)$/i,
  
  // API endpoints
  /^\/api\//i,
  /^\/wp-admin\//i,
  /^\/wp-content\//i,
  /^\/wp-includes\//i,
];

/**
 * Derive title from URL slug
 */
export function deriveTitleFromSlug(url: string): string {
  try {
    const urlObj = new URL(url);
    const slug = urlObj.pathname.split('/').filter(p => p).pop() || '';
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim() || 'Blog Post';
  } catch {
    return 'Blog Post';
  }
}

/**
 * Extract date from URL pattern (e.g., /2024/01/15/article-name)
 */
function extractDateFromUrl(url: string): string | null {
  const patterns = [
    /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//,
    /\/(\d{4})-(\d{1,2})-(\d{1,2})\//,
    /\/(\d{4})(\d{2})(\d{2})\//,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10)
      );
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
  }

  return null;
}

/**
 * Detect the content section from a URL path
 * Returns the matched content section or null if not a content URL
 */
function detectContentSection(path: string): string | null {
  const pathLower = path.toLowerCase();
  const pathSegments = pathLower.split('/').filter(p => p);
  
  // Check each segment for content section patterns
  for (const segment of pathSegments) {
    // Normalize segment (remove trailing numbers, common suffixes)
    const normalizedSegment = segment.replace(/[-_]?\d+$/, '');
    
    if (CONTENT_SECTION_PATTERNS.includes(normalizedSegment)) {
      return normalizedSegment;
    }
    
    // Also check if segment starts with a content pattern (e.g., "blog-post-title" shouldn't match)
    // but "blog-category" as a path segment should
    for (const pattern of CONTENT_SECTION_PATTERNS) {
      if (segment === pattern || segment.startsWith(`${pattern}-`) || segment.startsWith(`${pattern}_`)) {
        // Only match if it's the section, not part of a slug
        if (pathSegments.indexOf(segment) < pathSegments.length - 1) {
          return pattern;
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if a URL should be excluded (navigation, utility pages, etc.)
 */
function isExcludedUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const fullUrl = url.toLowerCase();
    
    // Check against excluded patterns
    for (const pattern of EXCLUDED_PATH_PATTERNS) {
      if (pattern.test(path) || pattern.test(fullUrl)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return true; // Invalid URL, exclude it
  }
}

/**
 * Check if a URL looks like a content item (article, case study, etc.) vs a listing page
 * This is a heuristic based on URL structure
 */
function looksLikeContentItem(url: string, contentSection: string | null): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    const pathSegments = path.split('/').filter(p => p);
    
    if (pathSegments.length === 0) {
      return false; // Root URL, not a content item
    }
    
    const lastSegment = pathSegments[pathSegments.length - 1];
    
    // If we detected a content section, the URL should have at least one more segment after it
    if (contentSection) {
      const sectionIndex = pathSegments.findIndex(s => 
        s === contentSection || 
        s.startsWith(`${contentSection}-`) ||
        s.startsWith(`${contentSection}_`)
      );
      
      // If the content section is the last segment, it's likely a listing page
      if (sectionIndex >= 0 && sectionIndex === pathSegments.length - 1) {
        return false;
      }
      
      // If there's at least one segment after the content section, it's likely a content item
      if (sectionIndex >= 0 && sectionIndex < pathSegments.length - 1) {
        return true;
      }
    }
    
    // Heuristics for content items:
    // 1. Has a slug-like last segment (contains hyphens, reasonable length)
    const hasSlug = lastSegment.includes('-') && lastSegment.length > 10;
    
    // 2. Has multiple path segments (not just /section/)
    const hasDepth = pathSegments.length >= 2;
    
    // 3. Last segment is not a known section name (would be a listing page)
    const lastIsNotSection = !CONTENT_SECTION_PATTERNS.includes(lastSegment);
    
    // 4. URL has a date pattern (common in blogs)
    const hasDatePattern = /\/\d{4}\/\d{1,2}\//.test(path) || /\/\d{4}-\d{2}-\d{2}\//.test(path);
    
    // Content item if: has slug OR (has depth AND last is not a section) OR has date pattern
    return hasSlug || (hasDepth && lastIsNotSection && lastSegment.length > 5) || hasDatePattern;
  } catch {
    return false;
  }
}

/**
 * Process a single sitemap URL entry - filters out navigation/utility pages
 * More flexible than before to support various content types
 */
function processSitemapUrl(loc: string, el: cheerio.Cheerio<cheerio.Element>): DiscoveredUrl | null {
  try {
    const urlObj = new URL(loc);
    const path = urlObj.pathname.toLowerCase();
    const pathSegments = path.split('/').filter(p => p);
    
    // Skip URLs that are clearly not content
    if (isExcludedUrl(loc)) {
      return null;
    }
    
    // Skip root URLs and single-segment URLs that are just section names
    if (pathSegments.length === 0) {
      return null;
    }
    
    if (pathSegments.length === 1) {
      // Single segment - only accept if it looks like a slug (content item at root)
      const segment = pathSegments[0];
      if (segment.length < 15 || !segment.includes('-')) {
        // Likely a section page like /blog/ or /articles/
        return null;
      }
    }
    
    // Detect the content section this URL belongs to
    const contentSection = detectContentSection(path);
    
    // Check if this looks like a content item vs a listing page
    if (!looksLikeContentItem(loc, contentSection)) {
      // Additional check: if no content section detected but URL has good slug, accept it
      const lastSegment = pathSegments[pathSegments.length - 1];
      const hasGoodSlug = lastSegment.includes('-') && lastSegment.length > 15;
      
      if (!hasGoodSlug) {
        return null;
      }
    }
    
    const lastmod = el.find('lastmod').text().trim();
    const publishedDate = lastmod
      ? new Date(lastmod).toISOString().split('T')[0]
      : extractDateFromUrl(loc);
    
    // Detect language from URL
    const language = detectLanguageFromUrl(loc);

    return {
      url: loc,
      title: deriveTitleFromSlug(loc),
      publishedDate,
      contentSection: contentSection || undefined,
      language: language || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Prioritize sitemaps that are more likely to contain content
 * based on the URL the user provided
 */
function prioritizeSitemaps(baseUrl: string, providedUrl: string): string[] {
  const sitemaps: string[] = [];
  
  try {
    const urlObj = new URL(providedUrl);
    const pathSegments = urlObj.pathname.split('/').filter(p => p);
    
    // If user provided a specific section URL, try section-specific sitemaps first
    if (pathSegments.length > 0) {
      const section = pathSegments[0].toLowerCase();
      
      // Common section-specific sitemap patterns
      sitemaps.push(
        `${baseUrl}/sitemap-${section}.xml`,
        `${baseUrl}/${section}/sitemap.xml`,
        `${baseUrl}/sitemap_${section}.xml`,
        `${baseUrl}/wp-sitemap-posts-${section}-1.xml`, // WordPress specific sections
      );
    }
  } catch {
    // Ignore URL parsing errors
  }
  
  // Add general sitemap locations
  sitemaps.push(
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap-index.xml`,
    `${baseUrl}/wp-sitemap.xml`, // WordPress
    `${baseUrl}/wp-sitemap-posts-post-1.xml`, // WordPress posts
    `${baseUrl}/wp-sitemap-posts-page-1.xml`, // WordPress pages
    `${baseUrl}/post-sitemap.xml`,
    `${baseUrl}/page-sitemap.xml`,
    `${baseUrl}/sitemap-blog.xml`,
    `${baseUrl}/sitemap-posts.xml`,
    `${baseUrl}/sitemap-pages.xml`,
    `${baseUrl}/news-sitemap.xml`,
    `${baseUrl}/articles-sitemap.xml`,
  );
  
  // Remove duplicates while preserving order
  return [...new Set(sitemaps)];
}

/**
 * Fetch URLs from sitemap.xml
 * Supports both regular sitemaps and sitemap indexes
 * Discovers content from multiple sections
 */
async function fetchUrlsFromSitemap(blogUrl: string): Promise<DiscoveredUrl[]> {
  try {
    const urlObj = new URL(blogUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    // Get prioritized list of sitemaps to try
    const sitemapUrls = prioritizeSitemaps(baseUrl, blogUrl);
    const allUrls: DiscoveredUrl[] = [];
    const processedSitemaps = new Set<string>();
    const discoveredUrlSet = new Set<string>(); // Deduplicate URLs

    for (const sitemapUrl of sitemapUrls) {
      if (processedSitemaps.has(sitemapUrl)) continue;
      processedSitemaps.add(sitemapUrl);
      
      try {
        const response = await fetch(sitemapUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ContentDiscoveryBot/1.0)',
          },
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        // Check if this is a sitemap index (points to other sitemaps)
        const isSitemapIndex = $('sitemapindex').length > 0;
        
        if (isSitemapIndex) {
          // Follow sitemap index entries to get actual sitemaps
          const sitemapRefs: string[] = [];
          $('sitemapindex > sitemap').each((_, el) => {
            const sitemapLoc = $(el).find('loc').text().trim();
            if (sitemapLoc && !processedSitemaps.has(sitemapLoc)) {
              sitemapRefs.push(sitemapLoc);
            }
          });
          
          console.log(`[Discovery] Found sitemap index with ${sitemapRefs.length} referenced sitemaps`);
          
          // Fetch each referenced sitemap (limit to 15 to avoid too many requests)
          for (const sitemapRef of sitemapRefs.slice(0, 15)) {
            if (processedSitemaps.has(sitemapRef)) continue;
            processedSitemaps.add(sitemapRef);
            
            try {
              const refResponse = await fetch(sitemapRef, {
                signal: AbortSignal.timeout(10000),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; ContentDiscoveryBot/1.0)',
                },
              });
              
              if (refResponse.ok) {
                const refXml = await refResponse.text();
                const $ref = cheerio.load(refXml, { xmlMode: true });
                
                $ref('urlset > url').each((_, el) => {
                  const loc = $ref(el).find('loc').text().trim();
                  if (!loc || discoveredUrlSet.has(loc)) return;
                  
                  const discovered = processSitemapUrl(loc, $ref(el));
                  if (discovered) {
                    discoveredUrlSet.add(loc);
                    allUrls.push(discovered);
                  }
                });
              }
            } catch (e) {
              console.log(`[Discovery] Failed to fetch sitemap reference ${sitemapRef}:`, e);
            }
          }
        } else {
          // Regular sitemap - parse URLs directly
          $('urlset > url').each((_, el) => {
            const loc = $(el).find('loc').text().trim();
            if (!loc || discoveredUrlSet.has(loc)) return;
            
            const discovered = processSitemapUrl(loc, $(el));
            if (discovered) {
              discoveredUrlSet.add(loc);
              allUrls.push(discovered);
            }
          });
        }

        if (allUrls.length > 0) {
          console.log(`[Discovery] Found ${allUrls.length} URLs from sitemap: ${sitemapUrl}`);
        }
        
        // If we have a good number of URLs, we can stop
        if (allUrls.length >= 100) {
          break;
        }
      } catch (e) {
        // Try next sitemap location
        continue;
      }
    }

    if (allUrls.length > 0) {
      // Log content sections found
      const sections = [...new Set(allUrls.map(u => u.contentSection).filter(Boolean))];
      console.log(`[Discovery] Content sections found: ${sections.join(', ') || 'general'}`);
    }

    return allUrls;
  } catch (error) {
    console.log('[Discovery] Sitemap fetch failed:', error);
    return [];
  }
}

/**
 * Fetch URLs from RSS feed
 * Supports various RSS and Atom feed formats
 */
async function fetchUrlsFromRSS(blogUrl: string): Promise<DiscoveredUrl[]> {
  try {
    const urlObj = new URL(blogUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const pathSegments = urlObj.pathname.split('/').filter(p => p);
    
    // Build list of RSS feed URLs to try
    const rssUrls: string[] = [];
    
    // If user provided a specific section URL, try section-specific feeds first
    if (pathSegments.length > 0) {
      const section = pathSegments[0];
      rssUrls.push(
        `${baseUrl}/${section}/feed`,
        `${baseUrl}/${section}/rss`,
        `${baseUrl}/${section}/feed.xml`,
        `${baseUrl}/${section}/rss.xml`,
        `${baseUrl}/feed/${section}`,
        `${baseUrl}/rss/${section}`,
      );
    }
    
    // Common RSS feed locations
    rssUrls.push(
      `${baseUrl}/feed`,
      `${baseUrl}/rss`,
      `${baseUrl}/rss.xml`,
      `${baseUrl}/feed.xml`,
      `${baseUrl}/atom.xml`,
      `${baseUrl}/index.xml`, // Hugo/Jekyll
      `${baseUrl}/blog/feed`,
      `${baseUrl}/blog/rss`,
      `${baseUrl}/blog/feed.xml`,
      `${baseUrl}/news/feed`,
      `${baseUrl}/articles/feed`,
      `${blogUrl}/feed`,
      `${blogUrl}/rss`,
    );
    
    // Remove duplicates
    const uniqueRssUrls = [...new Set(rssUrls)];
    const allUrls: DiscoveredUrl[] = [];
    const discoveredUrlSet = new Set<string>();

    for (const rssUrl of uniqueRssUrls) {
      try {
        const response = await fetch(rssUrl, {
          signal: AbortSignal.timeout(10000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ContentDiscoveryBot/1.0)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          },
        });

        if (!response.ok) continue;

        const xml = await response.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        // Parse RSS/Atom entries
        $('item, entry').each((_, el) => {
          // Handle different feed formats
          let link = $(el).find('link').text().trim();
          
          // Atom feeds use href attribute
          if (!link) {
            const linkEl = $(el).find('link[rel="alternate"], link[type="text/html"], link').first();
            link = linkEl.attr('href') || '';
          }
          
          // Some feeds use <id> as the URL
          if (!link) {
            const id = $(el).find('id').text().trim();
            if (id && id.startsWith('http')) {
              link = id;
            }
          }
          
          if (!link || discoveredUrlSet.has(link)) return;
          
          // Skip excluded URLs
          if (isExcludedUrl(link)) return;
          
          discoveredUrlSet.add(link);

          const title = $(el).find('title').text().trim() || deriveTitleFromSlug(link);
          const pubDate = $(el).find('pubDate, published, updated, dc\\:date').text().trim();
          let publishedDate: string | null = null;
          
          if (pubDate) {
            try {
              publishedDate = new Date(pubDate).toISOString().split('T')[0];
            } catch {
              publishedDate = extractDateFromUrl(link);
            }
          } else {
            publishedDate = extractDateFromUrl(link);
          }

          // Detect content section and language
          const contentSection = detectContentSection(new URL(link).pathname);
          const language = detectLanguageFromUrl(link);

          allUrls.push({
            url: link,
            title,
            publishedDate,
            contentSection: contentSection || undefined,
            language: language || undefined,
          });
        });

        if (allUrls.length > 0) {
          console.log(`[Discovery] Found ${allUrls.length} URLs from RSS: ${rssUrl}`);
        }
        
        // If we found enough URLs from RSS, we can stop
        if (allUrls.length >= 50) {
          break;
        }
      } catch (e) {
        // Try next RSS location
        continue;
      }
    }

    return allUrls;
  } catch (error) {
    console.log('[Discovery] RSS fetch failed:', error);
    return [];
  }
}

/**
 * Filter and validate discovered URLs
 * Ensures we only return actual content items, not listing pages
 */
function validateDiscoveredUrls(urls: DiscoveredUrl[], providedUrl: string): DiscoveredUrl[] {
  // If user provided a specific section URL, prioritize URLs from that section
  let targetSection: string | null = null;
  try {
    const urlObj = new URL(providedUrl);
    targetSection = detectContentSection(urlObj.pathname);
  } catch {
    // Ignore URL parsing errors
  }
  
  // Filter to valid content URLs
  const validUrls = urls.filter(u => {
    try {
      const urlObj = new URL(u.url);
      const pathSegments = urlObj.pathname.split('/').filter(p => p);
      
      if (pathSegments.length === 0) return false;
      
      const lastSegment = pathSegments[pathSegments.length - 1] || '';
      
      // A real content item should have:
      // 1. A slug (hyphens, reasonable length) OR
      // 2. Be at a deeper path (2+ segments) with non-trivial last segment OR
      // 3. Have a detected content section with content after it
      const hasSlug = lastSegment.includes('-') && lastSegment.length > 10;
      const hasDepth = pathSegments.length >= 2 && lastSegment.length > 5;
      const hasContentSection = u.contentSection && pathSegments.length >= 2;
      
      return hasSlug || hasDepth || hasContentSection;
    } catch {
      return false;
    }
  });
  
  // If we have a target section, sort to prioritize those URLs
  if (targetSection) {
    validUrls.sort((a, b) => {
      const aMatch = a.contentSection === targetSection ? 1 : 0;
      const bMatch = b.contentSection === targetSection ? 1 : 0;
      return bMatch - aMatch;
    });
  }
  
  return validUrls;
}

/**
 * Filter URLs by language
 * @param urls - URLs to filter
 * @param languageFilter - Array of language codes to include, or null/empty to include all
 * @param includeUndetected - Whether to include URLs with no detected language (default: true)
 */
function filterByLanguage(
  urls: DiscoveredUrl[],
  languageFilter?: string[] | null,
  includeUndetected: boolean = true
): DiscoveredUrl[] {
  // If no filter specified, return all
  if (!languageFilter || languageFilter.length === 0) {
    return urls;
  }
  
  return urls.filter(u => {
    // If language detected, check if it's in the filter
    if (u.language) {
      return languageFilter.includes(u.language);
    }
    // If no language detected, include based on setting
    return includeUndetected;
  });
}

/**
 * Discover content URLs using cheap/free methods
 * 
 * Tries methods in order of cost:
 * 1. Sitemap (FREE)
 * 2. RSS Feed (FREE)
 * 3. Firecrawl Map (CHEAP - ~1 credit)
 * 
 * Supports various content types including blog posts, case studies,
 * testimonials, help center articles, and more.
 * 
 * @param blogUrl - Base content URL (can be any content section like /blog/, /case-studies/, etc.)
 * @param options - Discovery options
 * @returns Discovery result with URLs and method used
 */
export async function discoverBlogUrls(
  blogUrl: string,
  options?: {
    maxUrls?: number;
    languageFilter?: string[] | null; // ISO 639-1 codes to filter by (e.g., ["en", "de"])
    includeUndetectedLanguage?: boolean; // Include URLs where language couldn't be detected
  }
): Promise<DiscoveryResult> {
  const maxUrls = options?.maxUrls || 100;
  const languageFilter = options?.languageFilter;
  const includeUndetected = options?.includeUndetectedLanguage !== false; // Default true
  
  let discoveryMethod: 'sitemap' | 'rss' | 'firecrawl-map' | 'firecrawl-crawl' = 'sitemap';
  let urls: DiscoveredUrl[] = [];

  console.log(`[Discovery] Starting URL discovery for: ${blogUrl}`);
  if (languageFilter && languageFilter.length > 0) {
    console.log(`[Discovery] Language filter: ${languageFilter.join(', ')} (include undetected: ${includeUndetected})`);
  }
  
  // Detect if user is targeting a specific content section
  let targetSection: string | null = null;
  try {
    const urlObj = new URL(blogUrl);
    targetSection = detectContentSection(urlObj.pathname);
    if (targetSection) {
      console.log(`[Discovery] Detected target content section: ${targetSection}`);
    }
  } catch {
    // Ignore URL parsing errors
  }

  // Helper to build result with all metadata
  const buildResult = (urls: DiscoveredUrl[], method: typeof discoveryMethod, credits: number): DiscoveryResult => {
    const sections = [...new Set(urls.map(u => u.contentSection).filter(Boolean))] as string[];
    const languages = [...new Set(urls.map(u => u.language).filter(Boolean))] as string[];
    return { 
      urls, 
      discoveryMethod: method, 
      creditsUsed: credits, 
      contentSections: sections,
      detectedLanguages: languages,
    };
  };

  // Method 1: Try sitemap (FREE)
  console.log('[Discovery] Trying sitemap...');
  try {
    const sitemapUrls = await fetchUrlsFromSitemap(blogUrl);
    if (sitemapUrls.length > 0) {
      // Validate and filter URLs
      let validUrls = validateDiscoveredUrls(sitemapUrls, blogUrl);
      
      // Apply language filter
      validUrls = filterByLanguage(validUrls, languageFilter, includeUndetected);
      
      if (validUrls.length === 0 && sitemapUrls.length > 0) {
        console.log(`[Discovery] Sitemap returned ${sitemapUrls.length} URLs but none passed filters, trying RSS...`);
        // Don't return yet - try RSS instead
      } else if (validUrls.length > 0) {
        // If we got very few URLs, try RSS as well to see if we can get more
        if (validUrls.length < 5) {
          console.log(`[Discovery] Only ${validUrls.length} URLs from sitemap, trying RSS for more...`);
          try {
            const rssUrls = await fetchUrlsFromRSS(blogUrl);
            let validRssUrls = validateDiscoveredUrls(rssUrls, blogUrl);
            validRssUrls = filterByLanguage(validRssUrls, languageFilter, includeUndetected);
            
            if (validRssUrls.length > validUrls.length) {
              console.log(`[Discovery] ✅ Found ${validRssUrls.length} URLs from RSS (better than sitemap)`);
              urls = validRssUrls.slice(0, maxUrls);
              return buildResult(urls, 'rss', 0);
            }
          } catch (e) {
            // RSS failed, use sitemap results
          }
        }
        
        console.log(`[Discovery] ✅ Found ${validUrls.length} valid content URLs from sitemap (FREE)`);
        urls = validUrls.slice(0, maxUrls);
        return buildResult(urls, 'sitemap', 0);
      }
    }
  } catch (e) {
    console.log('[Discovery] Sitemap failed:', e instanceof Error ? e.message : e);
  }

  // Method 2: Try RSS feed (FREE)
  console.log('[Discovery] Trying RSS feed...');
  try {
    const rssUrls = await fetchUrlsFromRSS(blogUrl);
    if (rssUrls.length > 0) {
      let validUrls = validateDiscoveredUrls(rssUrls, blogUrl);
      validUrls = filterByLanguage(validUrls, languageFilter, includeUndetected);
      
      if (validUrls.length > 0) {
        console.log(`[Discovery] ✅ Found ${validUrls.length} URLs from RSS (FREE)`);
        urls = validUrls.slice(0, maxUrls);
        return buildResult(urls, 'rss', 0);
      }
    }
  } catch (e) {
    console.log('[Discovery] RSS failed:', e instanceof Error ? e.message : e);
  }

  // Method 3: Firecrawl Map (CHEAP - ~1 credit)
  console.log('[Discovery] Trying Firecrawl Map...');
  try {
    const { mapWithFirecrawl } = await import('./services/firecrawl-client');
    const mappedUrls = await mapWithFirecrawl(blogUrl, { limit: maxUrls * 2 }); // Get more to filter
    
    if (mappedUrls.length > 0) {
      // Filter to only content URLs and add metadata
      const contentUrls = mappedUrls
        .filter(url => !isExcludedUrl(url))
        .map(url => {
          const contentSection = detectContentSection(new URL(url).pathname);
          const language = detectLanguageFromUrl(url);
          return {
            url,
            title: deriveTitleFromSlug(url),
            publishedDate: extractDateFromUrl(url),
            contentSection: contentSection || undefined,
            language: language || undefined,
          };
        });
      
      let validUrls = validateDiscoveredUrls(contentUrls, blogUrl);
      validUrls = filterByLanguage(validUrls, languageFilter, includeUndetected);
      
      if (validUrls.length > 0) {
        console.log(`[Discovery] ✅ Found ${validUrls.length} URLs from Firecrawl Map (1 credit)`);
        urls = validUrls.slice(0, maxUrls);
        return buildResult(urls, 'firecrawl-map', 1);
      }
    }
  } catch (e) {
    console.log('[Discovery] Firecrawl Map failed:', e instanceof Error ? e.message : e);
  }

  // If all methods fail, return empty and signal that crawl will be needed
  console.log('[Discovery] ❌ All discovery methods failed');
  return {
    urls: [],
    discoveryMethod: 'firecrawl-crawl',
    creditsUsed: 0,
    fallbackRequired: true,
  };
}
