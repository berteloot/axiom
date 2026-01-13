/**
 * B2B Marketing Asset Type Taxonomy
 * 
 * This file defines the standard taxonomy for marketing asset types.
 * Used for AI classification, UI selection, and reporting.
 */

export interface AssetTypeGroup {
  label: string;
  options: string[];
}

/**
 * Grouped asset types by category for UI display
 */
export const ASSET_TYPES_GROUPED: AssetTypeGroup[] = [
  {
    label: "Proof & Validation",
    options: [
      "Case Study",
      "Customer Testimonial",
      "ROI Calculator",
      "Use Case",
      "Customer Story",
    ],
  },
  {
    label: "Thought Leadership",
    options: [
      "Whitepaper",
      "eBook",
      "Research Report",
      "Trend Analysis",
      "Guide",
    ],
  },
  {
    label: "Sales Enablement",
    options: [
      "Sales Deck",
      "One-Pager",
      "Solution Brief",
      "Battlecard",
      "Pricing Sheet",
      "Proposal",
    ],
  },
  {
    label: "Awareness",
    options: [
      "Blog Post",
      "Article",
      "Infographic",
      "Press Release",
      "Newsletter",
    ],
  },
  {
    label: "Video & Audio",
    options: [
      "Webinar Recording",
      "Product Demo",
      "Explainer Video",
      "Podcast Episode",
      "Event Recording",
    ],
  },
  {
    label: "Technical",
    options: [
      "Technical Documentation",
      "User Guide",
      "API Reference",
      "Release Notes",
      "Data Sheet",
    ],
  },
];

/**
 * Flat array of all asset type values for validation
 * Sorted alphabetically for consistent UI display
 */
export const ASSET_TYPE_VALUES: string[] = ASSET_TYPES_GROUPED.flatMap(
  (group) => group.options
).sort((a, b) => a.localeCompare(b));

/**
 * Map legacy AI enum values to new taxonomy
 * This helps migrate from old AI classifications to new ones
 */
export const LEGACY_TO_NEW_ASSET_TYPE: Record<string, string> = {
  Whitepaper: "Whitepaper",
  Case_Study: "Case Study",
  Blog_Post: "Blog Post",
  Infographic: "Infographic",
  Webinar_Recording: "Webinar Recording",
  Sales_Deck: "Sales Deck",
  Technical_Doc: "Technical Documentation",
};

/**
 * Convert legacy asset type format (with underscores) to new format (with spaces)
 */
export function normalizeAssetType(assetType: string | null | undefined): string | null {
  if (!assetType) return null;
  
  // Check if it's a legacy format
  if (LEGACY_TO_NEW_ASSET_TYPE[assetType]) {
    return LEGACY_TO_NEW_ASSET_TYPE[assetType];
  }
  
  // If it already matches a valid type, return as-is
  if (ASSET_TYPE_VALUES.includes(assetType)) {
    return assetType;
  }
  
  // Try to convert underscores to spaces and title case
  const normalized = assetType
    .replace(/_/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  
  // Check if normalized version exists
  if (ASSET_TYPE_VALUES.includes(normalized)) {
    return normalized;
  }
  
  // Return original if no match found
  return assetType;
}

/**
 * Map common content type identifiers to our asset type taxonomy
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  // HubSpot and common CMS identifiers
  "blog-post": "Blog Post",
  "blog_post": "Blog Post",
  "blogpost": "Blog Post",
  "article": "Article",
  "post": "Blog Post",
  "news": "Press Release",
  "press-release": "Press Release",
  "pressrelease": "Press Release",
  "case-study": "Case Study",
  "casestudy": "Case Study",
  "case_study": "Case Study",
  "whitepaper": "Whitepaper",
  "white-paper": "Whitepaper",
  "ebook": "eBook",
  "e-book": "eBook",
  "webinar": "Webinar Recording",
  "webinar-recording": "Webinar Recording",
  "podcast": "Podcast Episode",
  "podcast-episode": "Podcast Episode",
  "video": "Explainer Video",
  "demo": "Product Demo",
  "product-demo": "Product Demo",
  "guide": "Guide",
  "how-to": "Guide",
  "testimonial": "Customer Testimonial",
  "use-case": "Use Case",
  "usecase": "Use Case",
  "infographic": "Infographic",
  "newsletter": "Newsletter",
  "documentation": "Technical Documentation",
  "docs": "Technical Documentation",
  "user-guide": "User Guide",
  "datasheet": "Data Sheet",
  "data-sheet": "Data Sheet",
  "sales-deck": "Sales Deck",
  "salesdeck": "Sales Deck",
  "one-pager": "One-Pager",
  "onepager": "One-Pager",
  "solution-brief": "Solution Brief",
  "solutionbrief": "Solution Brief",
};

/**
 * Extract asset type from HTML content
 * Looks for HubSpot script tags, meta tags, JSON-LD, and other indicators
 */
export async function detectAssetTypeFromHtml(url: string, html?: string): Promise<string | null> {
  if (!html) {
    try {
      // Fetch HTML if not provided
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BlogExtractor/1.0)",
        },
        signal: AbortSignal.timeout(10000), // 10 seconds timeout
      });
      
      if (!response.ok) {
        return null;
      }
      
      html = await response.text();
    } catch {
      return null;
    }
  }

  try {
    // Use cheerio to parse HTML
    const cheerio = await import("cheerio");
    const $ = cheerio.default.load(html);

    // 1. Check HubSpot script tags FIRST (most explicit signal)
    // These are the most reliable indicators when present
    const hubspotScripts = $('script[data-content-id], script.hsq-set-content-id');
    for (let i = 0; i < hubspotScripts.length; i++) {
      const script = $(hubspotScripts[i]);
      const contentId = script.attr('data-content-id');
      if (contentId) {
        const normalized = contentId.toLowerCase().trim();
        if (CONTENT_TYPE_MAP[normalized]) {
          return CONTENT_TYPE_MAP[normalized];
        }
        // Even if not in map, "blog-post" is a clear signal
        if (normalized === 'blog-post' || normalized === 'blogpost') {
          return "Blog Post";
        }
      }
      
      // Check for setContentType in script content
      const scriptContent = script.html() || '';
      const contentTypeMatch = scriptContent.match(/setContentType["\s]*\(["\s]*["']([^"']+)["']/i);
      if (contentTypeMatch) {
        const contentType = contentTypeMatch[1].toLowerCase().trim();
        if (CONTENT_TYPE_MAP[contentType]) {
          return CONTENT_TYPE_MAP[contentType];
        }
        // Even if not in map, "blog-post" is a clear signal
        if (contentType === 'blog-post' || contentType === 'blogpost') {
          return "Blog Post";
        }
      }
    }

    // 2. Check og:type meta tag (strong signal for article/blog)
    const ogType = $('meta[property="og:type"]').first().attr('content')?.toLowerCase().trim();
    if (ogType) {
      if (ogType === 'article') {
        return "Blog Post";
      }
      if (ogType.includes('article') || ogType.includes('blog')) {
        return "Blog Post";
      }
      if (CONTENT_TYPE_MAP[ogType]) {
        return CONTENT_TYPE_MAP[ogType];
      }
    }
    
    // 3. Check for article:published_time (strong blog indicator when combined with og:type)
    const publishedTime = $('meta[property="article:published_time"], meta[property="article:published"], meta[name="article:published_time"]').first().attr('content');
    if (publishedTime) {
      // If we have a published time AND og:type is article, it's definitely a blog post
      if (ogType === 'article') {
        return "Blog Post";
      }
      // If we have published time, it's likely a blog post or article
      // Check other signals to confirm
      if (ogType && (ogType.includes('article') || ogType.includes('blog'))) {
        return "Blog Post";
      }
      // If no conflicting type, assume blog post (published_time is a strong signal)
      return "Blog Post";
    }
    
    // 4. Check other meta tags
    const metaSelectors = [
      'meta[name="og:type"]',
      'meta[property="article:type"]',
      'meta[name="content-type"]',
      'meta[property="content-type"]',
    ];
    
    for (const selector of metaSelectors) {
      const meta = $(selector).first();
      const content = meta.attr('content') || meta.attr('value');
      if (content) {
        const normalized = content.toLowerCase().trim();
        if (CONTENT_TYPE_MAP[normalized]) {
          return CONTENT_TYPE_MAP[normalized];
        }
        // Check for common patterns
        if (normalized.includes('article') || normalized.includes('blog')) {
          return "Blog Post";
        }
        if (normalized.includes('video')) {
          return "Explainer Video";
        }
      }
    }

    // 3. Check JSON-LD structured data
    const jsonLdScripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const jsonText = $(jsonLdScripts[i]).html();
        if (!jsonText) continue;
        
        const data = JSON.parse(jsonText);
        const checkType = (obj: any): string | null => {
          if (!obj || typeof obj !== 'object') return null;
          
          // Handle arrays (like @graph arrays)
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const result = checkType(item);
              if (result) return result;
            }
            return null;
          }
          
          // Check @type field (prioritize BlogPosting schema)
          if (obj['@type']) {
            const type = String(obj['@type']).toLowerCase();
            // BlogPosting is the explicit schema.org type for blog posts
            if (type === 'blogposting' || type === 'https://schema.org/blogposting' || type === 'http://schema.org/blogposting') {
              return "Blog Post";
            }
            // Article type is also a strong blog indicator
            if (type === 'article' || type === 'https://schema.org/article' || type === 'http://schema.org/article') {
              return "Blog Post";
            }
            if (type.includes('blog') || type.includes('article') || type.includes('blogposting')) {
              return "Blog Post";
            }
            if (type.includes('video')) {
              return "Explainer Video";
            }
            if (type.includes('podcast')) {
              return "Podcast Episode";
            }
          }
          
          // Check for datePublished as blog indicator (BlogPosting schema)
          if (obj.datePublished || obj.datepublished || obj.publishedTime) {
            // If it has a published date and looks like content, likely a blog post
            const type = String(obj['@type'] || '').toLowerCase();
            if (!type || type.includes('article') || type.includes('blog') || type.includes('post')) {
              return "Blog Post";
            }
          }
          
          // Check contentType field
          if (obj.contentType) {
            const normalized = String(obj.contentType).toLowerCase().trim();
            if (CONTENT_TYPE_MAP[normalized]) {
              return CONTENT_TYPE_MAP[normalized];
            }
          }
          
          // Recursively check nested objects and arrays
          for (const key in obj) {
            if (key === '@context') continue; // Skip context, it's not content type info
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const result = checkType(obj[key]);
              if (result) return result;
            }
          }
          
          return null;
        };
        
        // Handle @graph arrays (common in Yoast SEO and other plugins)
        if (data['@graph'] && Array.isArray(data['@graph'])) {
          for (const item of data['@graph']) {
            const type = checkType(item);
            if (type) return type;
          }
        }
        
        const type = checkType(data);
        if (type) return type;
      } catch {
        // Invalid JSON, continue
      }
    }

    // 4. Check body/article classes and IDs
    const bodyClasses = $('body').attr('class') || '';
    const articleClasses = $('article, .post, .blog-post, .entry').first().attr('class') || '';
    const allClasses = (bodyClasses + ' ' + articleClasses).toLowerCase();
    
    for (const [key, value] of Object.entries(CONTENT_TYPE_MAP)) {
      if (allClasses.includes(key.replace(/-/g, ' ')) || allClasses.includes(key)) {
        return value;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Strip locale prefix from path for pattern matching
 * Examples: /de/..., /fr/..., /en-us/... -> /...
 */
function stripLocalePrefix(path: string): string {
  // /de/... or /de-DE/... or /en-us/...
  return path.replace(/^\/(?:[a-z]{2})(?:-[a-z]{2})?\//i, "/");
}

/**
 * Detect asset type from URL patterns
 * Returns detected type or null if unknown
 */
export function detectAssetTypeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    // Strip locale prefix for pattern matching (e.g., /de/blog/... -> /blog/...)
    const pathForMatching = stripLocalePrefix(path);
    const pathSegments = pathForMatching.split('/').filter(s => s.length > 0);
    
    // URL pattern mappings (order matters - more specific first)
    const patterns: Array<{ pattern: RegExp | string; type: string }> = [
      // Case Studies
      { pattern: /case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)/i, type: "Case Study" },
      { pattern: /testimonial/i, type: "Customer Testimonial" },
      { pattern: /use-case/i, type: "Use Case" },
      
      // Whitepapers & eBooks
      { pattern: /whitepaper|white-paper/i, type: "Whitepaper" },
      { pattern: /ebook|e-book/i, type: "eBook" },
      { pattern: /research-report/i, type: "Research Report" },
      { pattern: /guide|how-to/i, type: "Guide" },
      
      // Webinars & Videos
      { pattern: /webinar/i, type: "Webinar Recording" },
      { pattern: /demo|product-demo/i, type: "Product Demo" },
      { pattern: /video|explainer/i, type: "Explainer Video" },
      { pattern: /podcast/i, type: "Podcast Episode" },
      { pattern: /event|recording/i, type: "Event Recording" },
      
      // Sales Enablement
      { pattern: /sales-deck|pitch-deck/i, type: "Sales Deck" },
      { pattern: /one-pager|one-pager|datasheet/i, type: "One-Pager" },
      { pattern: /solution-brief|solution-overview/i, type: "Solution Brief" },
      { pattern: /battlecard/i, type: "Battlecard" },
      { pattern: /pricing/i, type: "Pricing Sheet" },
      { pattern: /proposal/i, type: "Proposal" },
      
      // Blog & Articles
      { pattern: /blog|post|article/i, type: "Blog Post" },
      { pattern: /news|press-release|announcement/i, type: "Press Release" },
      { pattern: /newsletter/i, type: "Newsletter" },
      
      // Technical
      { pattern: /documentation|docs|api-reference/i, type: "Technical Documentation" },
      { pattern: /user-guide|getting-started/i, type: "User Guide" },
      { pattern: /release-notes|changelog/i, type: "Release Notes" },
      { pattern: /data-sheet|datasheet/i, type: "Data Sheet" },
      
      // Other
      { pattern: /infographic/i, type: "Infographic" },
    ];
    
    // Check full path first (using locale-stripped path)
    for (const { pattern, type } of patterns) {
      if (typeof pattern === 'string') {
        if (pathForMatching.includes(pattern)) return type;
      } else {
        if (pattern.test(pathForMatching)) return type;
      }
    }
    
    // Check individual path segments
    for (const segment of pathSegments) {
      for (const { pattern, type } of patterns) {
        if (typeof pattern === 'string') {
          if (segment.includes(pattern)) return type;
        } else {
          if (pattern.test(segment)) return type;
        }
      }
    }
    
    // Default to Blog Post if URL contains common blog indicators (using locale-stripped path)
    if (pathForMatching.includes('blog') || pathForMatching.includes('post') || pathForMatching.includes('article')) {
      return "Blog Post";
    }
    
    return null; // Unknown type
  } catch {
    return null;
  }
}
