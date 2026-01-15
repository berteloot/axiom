/**
 * Test script to verify blog extraction for a specific URL
 * Usage: npx tsx scripts/test-blog-extraction.ts [URL]
 * 
 * This script tests:
 * 1. Single URL detection
 * 2. Direct HTML fetch
 * 3. WordPress API fetch (for headless CMS sites)
 * 4. Jina Reader API with browser rendering
 */

import * as cheerio from 'cheerio';

const TEST_URL = process.argv[2] || 'https://www.leangroup.com/resources/why-every-operations-leader-should-run-the-lean-solutions-group-roi-calculator';

// Single post URL detection (same logic as preview route)
function isSinglePostUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    const listingPaths = ['blog', 'blogs', 'resources', 'articles', 'news', 'insights', 'posts', 'library', 'media'];
    
    if (pathParts.length === 1 && listingPaths.includes(pathParts[0].toLowerCase())) {
      return false;
    }
    
    if (pathParts.length >= 2) {
      const basePath = pathParts[0].toLowerCase();
      const lastSegment = pathParts[pathParts.length - 1];
      
      if (listingPaths.includes(basePath)) {
        const isSlug = lastSegment.includes('-') && 
                       !/^page-?\d+$/.test(lastSegment) && 
                       !/^\d{4}-\d{2}-\d{2}$/.test(lastSegment) &&
                       lastSegment.length > 10;
        
        if (isSlug) {
          return true;
        }
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

// Clean up Jina Reader markdown output (mirrors blog-extractor.ts)
function cleanupJinaMarkdown(markdown: string): string {
  if (!markdown || markdown.length < 100) return markdown;

  const lines = markdown.split('\n');
  
  const skipPatterns = [
    /^\[.*\]\(https?:\/\/[^\)]+\)$/,
    /^!\[Image \d+:.*tracker.*\]/i,
    /^\*\s+\[/,
    /^#{1,6}\s+(About Us|Contact|Careers|Solutions|Industries|Products|Resources|News|Events)\s*$/i,
    /^(About Us|Contact Us|Apply Now|Get Started)\s*$/i,
    /©\s*\d{4}/,
    /All rights reserved/i,
    /^Terms and Privacy/i,
    /^\[Contact Us\]/i,
    /^\[Apply Now\]/i,
    /^NEW PRODUCT/i,
  ];

  let articleStartIndex = -1;
  let articleEndIndex = lines.length;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (articleStartIndex === -1) {
      if (i < lines.length - 1 && /^={3,}$/.test(lines[i + 1]?.trim())) {
        if (line.length > 20 && !skipPatterns.some(p => p.test(line))) {
          articleStartIndex = i;
          continue;
        }
      }
      
      const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);
      if (headingMatch && headingMatch[2].length > 20 && !skipPatterns.some(p => p.test(headingMatch[2]))) {
        articleStartIndex = i;
        continue;
      }
    }
    
    if (articleStartIndex !== -1) {
      if (/^#{1,6}\s+(About Us|Contact|Resources)\s*$/i.test(line) && i > articleStartIndex + 10) {
        let navItemCount = 0;
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (/^\*\s+\[/.test(lines[j]) || /^\[.*\]\(/.test(lines[j])) navItemCount++;
        }
        if (navItemCount >= 3) {
          articleEndIndex = i;
          break;
        }
      }
      if (/©\s*\d{4}|All rights reserved/i.test(line)) {
        articleEndIndex = i;
        break;
      }
    }
  }
  
  if (articleStartIndex !== -1) {
    const articleLines = lines.slice(articleStartIndex, articleEndIndex);
    const cleanedLines = articleLines.filter(line => {
      const trimmed = line.trim();
      if (/^!\[Image \d+:.*\]\(/.test(trimmed) && trimmed.includes('small image')) return false;
      if (skipPatterns.some(p => p.test(trimmed))) return false;
      return true;
    });
    
    const result = cleanedLines.join('\n').trim();
    if (result.length > 200) return result;
  }
  
  return lines.filter(line => {
    const trimmed = line.trim();
    if (/^!\[Image \d+:.*tracker/i.test(trimmed)) return false;
    if (/^NEW PRODUCT/i.test(trimmed)) return false;
    return true;
  }).join('\n').trim();
}

// Extract text from HTML with structure preservation
function extractTextFromHtml(html: string): string {
  if (!html) return "";
  
  const $ = cheerio.load(html);
  
  // Remove non-content elements
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    'nav', 'header', 'footer', 'aside',
    '.nav', '.navigation', '.navbar', '.menu', '.header', '.footer', '.sidebar',
    '.social-share', '.share-buttons', '.social-links',
    '.related-posts', '.related-articles', '.recommended',
    '.comments', '.comment-section', '#comments',
    '.newsletter', '.subscribe', '.subscription',
    '.cookie-banner', '.cookie-notice', '.gdpr',
    '.popup', '.modal', '.overlay',
    '.breadcrumb', '.breadcrumbs',
    '.author-bio', '.author-box',
    '.tags', '.tag-list', '.categories',
    '.pagination', '.pager',
    '.advertisement', '.ad', '.ads', '[class*="ad-"]',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.hello-bar', '[class*="hello-bar"]',
  ];
  
  removeSelectors.forEach(selector => {
    try { $(selector).remove(); } catch { /* ignore */ }
  });
  
  // Find main content
  const contentSelectors = [
    'article .content', 'article .post-content', 'article .entry-content',
    'article', 
    'main .content', 'main .post-content', 'main .entry-content',
    'main',
    '.post-content', '.entry-content', '.article-content', 
    '.blog-post', '.post-body', '.content-main',
    '.page-content', '.main-content',
    '[role="main"]',
    '#content', '#main-content', '#article-content',
  ];
  
  let contentNode = null;
  for (const selector of contentSelectors) {
    const node = $(selector).first();
    if (node.length && node.text().trim().length > 200) {
      contentNode = node;
      console.log(`\n✅ Found content using selector: "${selector}"`);
      break;
    }
  }
  
  if (!contentNode || !contentNode.length) {
    console.log('\n⚠️  No content selector matched, using body');
    contentNode = $('body');
  }
  
  // Extract with structure
  let text = '';
  
  contentNode.find('h1, h2, h3, h4, h5, h6, p, li, blockquote').each((_, el) => {
    const $el = $(el);
    const tagName = ('tagName' in el ? el.tagName : '').toLowerCase();
    const elText = $el.text().trim();
    
    if (!elText || elText.length < 3) return;
    
    const lowerText = elText.toLowerCase();
    if (lowerText.includes('read more') || 
        lowerText.includes('learn more') ||
        lowerText.includes('contact us') ||
        lowerText.includes('apply now') ||
        lowerText.includes('get started') ||
        lowerText.includes('sign up') ||
        lowerText.includes('subscribe') ||
        lowerText.includes('© ') ||
        lowerText.includes('all rights reserved')) {
      return;
    }
    
    if (tagName.startsWith('h')) {
      const level = parseInt(tagName[1], 10) || 2;
      text += '\n\n' + '#'.repeat(level) + ' ' + elText + '\n\n';
    } else if (tagName === 'li') {
      text += '- ' + elText + '\n';
    } else if (tagName === 'blockquote') {
      text += '\n> ' + elText + '\n\n';
    } else {
      text += elText + '\n\n';
    }
  });
  
  if (text.trim().length < 200) {
    console.log('\n⚠️  Structured extraction too short, falling back to plain text');
    text = contentNode.text().replace(/\s+/g, ' ').trim();
  }
  
  return text.trim();
}

async function testExtraction() {
  console.log('=' .repeat(80));
  console.log('Blog Extraction Test');
  console.log('=' .repeat(80));
  console.log(`\nURL: ${TEST_URL}`);
  
  // Test 1: Single URL detection
  console.log('\n--- Test 1: Single URL Detection ---');
  const isSingle = isSinglePostUrl(TEST_URL);
  console.log(`Is single post URL: ${isSingle ? '✅ YES' : '❌ NO'}`);
  
  if (isSingle) {
    const urlObj = new URL(TEST_URL);
    const slug = urlObj.pathname.split('/').filter(p => p).pop() || '';
    const derivedTitle = slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
    console.log(`Derived title: "${derivedTitle}"`);
  }
  
  // Test 2: Direct fetch
  console.log('\n--- Test 2: Direct HTML Fetch ---');
  try {
    const response = await fetch(TEST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (response.ok) {
      const html = await response.text();
      console.log(`HTML length: ${html.length} characters`);
      
      // Check for meta tags
      const $ = cheerio.load(html);
      const title = $('title').text().trim();
      const ogTitle = $('meta[property="og:title"]').attr('content');
      const description = $('meta[name="description"]').attr('content');
      const publishedTime = $('meta[property="article:published_time"]').attr('content');
      
      console.log(`\nMeta tags found:`);
      console.log(`  Title: ${title || 'Not found'}`);
      console.log(`  OG Title: ${ogTitle || 'Not found'}`);
      console.log(`  Description: ${description?.substring(0, 100) || 'Not found'}...`);
      console.log(`  Published Time: ${publishedTime || 'Not found'}`);
      
      // Test 3: Content extraction
      console.log('\n--- Test 3: Content Extraction ---');
      const extractedContent = extractTextFromHtml(html);
      
      console.log(`\nExtracted content length: ${extractedContent.length} characters`);
      console.log(`\n--- First 2000 characters of extracted content ---\n`);
      console.log(extractedContent.substring(0, 2000));
      console.log('\n--- End of preview ---');
      
      // Check for navigation pollution
      const navPhrases = ['About Us', 'Contact Us', 'Apply Now', 'Get Started', 'Who We Are', 'Leadership'];
      const foundNavPhrases = navPhrases.filter(phrase => extractedContent.includes(phrase));
      
      if (foundNavPhrases.length > 0) {
        console.log(`\n⚠️  WARNING: Navigation phrases still present: ${foundNavPhrases.join(', ')}`);
      } else {
        console.log(`\n✅ No common navigation phrases found in extracted content`);
      }
      
    } else {
      console.log('❌ Failed to fetch HTML');
    }
  } catch (error) {
    console.log(`❌ Fetch error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 4: WordPress API (for headless CMS sites)
  console.log('\n--- Test 4: WordPress API Detection ---');
  
  // Try to detect if this is a headless WordPress site
  try {
    const response = await fetch(TEST_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await response.text();
    
    // Check for WordPress API hints
    const canonicalMatch = html.match(/href="(https?:\/\/[^"]*webapi[^"]*)/i);
    const wpContentMatch = html.match(/(https?:\/\/[^"]*wp-content[^"]*)/i);
    
    if (canonicalMatch || wpContentMatch) {
      console.log('✅ WordPress headless CMS detected!');
      
      // Extract WordPress API base URL
      let wpApiBase = '';
      if (canonicalMatch) {
        const canonicalUrl = new URL(canonicalMatch[1]);
        wpApiBase = `${canonicalUrl.protocol}//${canonicalUrl.host}`;
      } else if (wpContentMatch) {
        const wpUrl = new URL(wpContentMatch[1]);
        wpApiBase = `${wpUrl.protocol}//${wpUrl.host}`;
      }
      
      console.log(`WordPress API base: ${wpApiBase}`);
      
      // Try WordPress REST API with multiple post types
      const slug = new URL(TEST_URL).pathname.split('/').filter(p => p).pop();
      const postTypes = ['posts', 'resources', 'blog', 'articles', 'pages'];
      
      let wpSuccess = false;
      for (const postType of postTypes) {
        const wpApiUrl = `${wpApiBase}/wp-json/wp/v2/${postType}?slug=${slug}`;
        console.log(`Trying: ${wpApiUrl}`);
        
        try {
          const wpResponse = await fetch(wpApiUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          
          if (wpResponse.ok) {
            const wpData = await wpResponse.json();
            if (wpData && wpData.length > 0) {
              const post = wpData[0];
              console.log(`\n✅ WordPress API SUCCESS! (post type: ${postType})`);
              console.log(`Title: ${post.title?.rendered || 'N/A'}`);
              console.log(`Date: ${post.date || 'N/A'}`);
              console.log(`Excerpt: ${post.excerpt?.rendered?.substring(0, 200) || 'N/A'}...`);
              
              // Extract content
              const content = post.content?.rendered || '';
              const $wp = cheerio.load(content);
              const textContent = $wp('body').text().trim();
              console.log(`\nContent length: ${textContent.length} characters`);
              console.log(`\n--- First 1500 characters from WordPress API ---\n`);
              console.log(textContent.substring(0, 1500));
              console.log('\n--- End of WordPress preview ---');
              wpSuccess = true;
              break;
            }
          }
        } catch (wpError) {
          // Continue to next post type
        }
      }
      
      if (!wpSuccess) {
        console.log('\n❌ WordPress API: No content found in standard post types');
        
        // Try to discover available post types
        console.log('\nDiscovering available post types...');
        try {
          const typesResponse = await fetch(`${wpApiBase}/wp-json/wp/v2/types`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (typesResponse.ok) {
            const types = await typesResponse.json();
            console.log('Available post types:', Object.keys(types).join(', '));
          }
        } catch { /* ignore */ }
      }
    } else {
      console.log('No WordPress headless CMS detected');
    }
  } catch (error) {
    console.log(`Detection error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 5: Jina Reader API (if available)
  console.log('\n--- Test 5: Jina Reader API ---');
  const JINA_API_KEY = process.env.JINA_API_KEY;
  
  if (!JINA_API_KEY) {
    console.log('⚠️  JINA_API_KEY not set, skipping Jina test');
    console.log('   Set JINA_API_KEY environment variable to test Jina Reader');
  } else {
    // Try with browser engine for JavaScript rendering
    try {
      console.log('Trying Jina with browser engine...');
      const jinaResponse = await fetch('https://r.jina.ai/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Return-Format': 'markdown',
          'X-With-Generated-Alt': 'true',
          'X-Engine': 'browser', // Enable JavaScript rendering
          'X-Wait-For-Selector': 'article, main, .post-content', // Wait for content
        },
        body: JSON.stringify({
          url: TEST_URL,
        }),
      });
      
      console.log(`Jina Status: ${jinaResponse.status} ${jinaResponse.statusText}`);
      
      if (jinaResponse.ok) {
        const jinaResult = await jinaResponse.json();
        const jinaContent = jinaResult.data?.content || '';
        console.log(`Jina content length: ${jinaContent.length} characters`);
        
        // Skip tracking pixels and find actual content
        const lines = jinaContent.split('\n');
        let contentStart = 0;
        for (let i = 0; i < lines.length; i++) {
          // Skip lines that are just images or tracking pixels
          if (!lines[i].startsWith('![') && lines[i].trim().length > 50) {
            contentStart = i;
            break;
          }
        }
        
        const meaningfulContent = lines.slice(contentStart).join('\n');
        console.log(`\n--- Meaningful content (skipping ${contentStart} tracking lines) ---\n`);
        console.log(meaningfulContent.substring(0, 3000));
        console.log('\n--- End of Jina preview ---');
        
        // Check for actual blog content indicators
        const hasRealContent = meaningfulContent.toLowerCase().includes('roi') || 
                              meaningfulContent.toLowerCase().includes('operations') ||
                              meaningfulContent.toLowerCase().includes('calculator');
        console.log(`\nActual blog content detected: ${hasRealContent ? '✅ YES' : '❌ NO'}`);
        
        // Test the cleanup function (same logic as in blog-extractor.ts)
        console.log('\n--- Testing cleanupJinaMarkdown logic ---');
        
        const cleanedContent = cleanupJinaMarkdown(jinaContent);
        console.log(`Cleaned content length: ${cleanedContent.length} characters`);
        console.log(`\n--- First 2500 characters of CLEANED content ---\n`);
        console.log(cleanedContent.substring(0, 2500));
        console.log('\n--- End of cleaned preview ---');
        
        // Check if cleanup removed navigation
        const cleanedHasNav = cleanedContent.includes('[About Us]') || cleanedContent.includes('[Contact Us]');
        console.log(`Navigation removed: ${cleanedHasNav ? '❌ NO (still present)' : '✅ YES'}`);
        
        // Check if article content preserved
        const hasArticle = cleanedContent.includes('Why Every Operations') || cleanedContent.includes('ROI Calculator');
        console.log(`Article content preserved: ${hasArticle ? '✅ YES' : '❌ NO'}`);
      } else {
        const errorText = await jinaResponse.text();
        console.log(`Jina error: ${errorText.substring(0, 500)}`);
      }
    } catch (error) {
      console.log(`Jina error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('Test Complete');
  console.log('=' .repeat(80));
}

testExtraction().catch(console.error);
