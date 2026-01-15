/**
 * Test script to extract a single blog URL using the actual blog extractor
 * Usage: npx tsx scripts/test-single-url.ts [URL]
 */

import * as dotenv from 'dotenv';
dotenv.config(); // Load .env file

import { extractBlogPostUrls, fetchBlogPostContentWithDate } from '../lib/services/blog-extractor';

const TEST_URL = process.argv[2] || 'https://www.leangroup.com/resources/why-every-operations-leader-should-run-the-lean-solutions-group-roi-calculator';

async function testSingleUrl() {
  console.log('='.repeat(80));
  console.log('Single URL Extraction Test');
  console.log('='.repeat(80));
  console.log(`\nURL: ${TEST_URL}`);
  console.log(`JINA_API_KEY set: ${process.env.JINA_API_KEY ? 'YES' : 'NO'}`);
  
  // Test 1: extractBlogPostUrls - should detect single URL and return just that
  console.log('\n--- Test 1: extractBlogPostUrls ---');
  try {
    const posts = await extractBlogPostUrls(TEST_URL, 10);
    console.log(`\nReturned ${posts.length} post(s):`);
    for (const post of posts) {
      console.log(`  - Title: ${post.title}`);
      console.log(`    URL: ${post.url}`);
      console.log(`    Date: ${post.publishedDate || 'Not found'}`);
    }
    
    if (posts.length === 1 && posts[0].url === TEST_URL) {
      console.log('\n✅ SUCCESS: Single URL correctly detected and returned');
    } else if (posts.length > 1) {
      console.log('\n❌ FAIL: Multiple posts returned instead of single URL');
    } else if (posts.length === 0) {
      console.log('\n⚠️  WARNING: No posts returned');
    }
  } catch (error) {
    console.log(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 2: fetchBlogPostContentWithDate - extract actual content
  console.log('\n--- Test 2: fetchBlogPostContentWithDate ---');
  try {
    console.log('Fetching content (this may take a moment)...\n');
    const result = await fetchBlogPostContentWithDate(TEST_URL);
    
    console.log(`Content length: ${result.content.length} characters`);
    console.log(`Published date: ${result.publishedDate || 'Not found'}`);
    
    // Show first 2000 chars of content
    console.log('\n--- First 2000 characters of extracted content ---\n');
    console.log(result.content.substring(0, 2000));
    console.log('\n--- End of preview ---');
    
    // Check content quality
    const hasNavigation = result.content.includes('[About Us]') || 
                          result.content.includes('[Contact Us]') ||
                          result.content.includes('NEW PRODUCT');
    const hasArticleContent = result.content.toLowerCase().includes('roi') ||
                              result.content.toLowerCase().includes('operations leader');
    
    console.log('\n--- Content Quality Check ---');
    console.log(`Navigation removed: ${hasNavigation ? '❌ NO (still present)' : '✅ YES'}`);
    console.log(`Article content found: ${hasArticleContent ? '✅ YES' : '❌ NO'}`);
    
  } catch (error) {
    console.log(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('Test Complete');
  console.log('='.repeat(80));
}

testSingleUrl().catch(console.error);
