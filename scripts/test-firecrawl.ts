/**
 * Test script for Firecrawl integration
 * 
 * Run with: npm run test:firecrawl
 * 
 * IMPORTANT: This script uses real API credits!
 * Free tier has 500 credits/month. Each scrape = 1 credit.
 * 
 * Make sure to set FIRECRAWL_API_KEY in your .env.local file before running
 */

import {
  scrapeWithFirecrawl,
  mapWithFirecrawl,
  fetchBlogPostContentWithFirecrawl,
  isFirecrawlAvailable,
  getScrapingProvider,
  getEstimatedCreditsRemaining,
  FirecrawlError,
} from '../lib/services/firecrawl-client';

// Test URLs - these are known to have issues with Jina Reader
const TEST_URLS = [
  'https://www.leangroup.com/resources/why-every-operations-leader-should-run-the-lean-solutions-group-roi-calculator',
  'https://www.leangroup.com/resources/ai-is-redefining-your-next-developer-hire',
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'blue');
  console.log('='.repeat(60));
}

function logResult(success: boolean, message: string) {
  const icon = success ? '✅' : '❌';
  const color = success ? 'green' : 'red';
  log(`${icon} ${message}`, color);
}

function logCredits() {
  const remaining = getEstimatedCreditsRemaining();
  const color = remaining < 100 ? 'red' : remaining < 300 ? 'yellow' : 'green';
  log(`💳 Credits remaining (estimated): ${remaining}/500`, color);
}

async function testConfiguration() {
  logSection('Configuration Check');

  const isConfigured = isFirecrawlAvailable();
  const provider = getScrapingProvider();

  logResult(isConfigured, `Firecrawl API Key: ${isConfigured ? 'Configured' : 'NOT SET'}`);
  log(`Current Provider: ${provider}`, provider === 'firecrawl' ? 'green' : 'yellow');
  logCredits();

  if (!isConfigured) {
    log('\n⚠️  FIRECRAWL_API_KEY is not set!', 'yellow');
    log('Please add it to your .env.local file:', 'dim');
    log('  FIRECRAWL_API_KEY=fc-your_api_key_here', 'dim');
    log('\nGet your API key from: https://www.firecrawl.dev/', 'dim');
    return false;
  }

  return true;
}

async function testSingleScrape(url: string) {
  log(`\nTesting: ${url}`, 'dim');
  log('(Cost: 1 credit)', 'cyan');

  const startTime = Date.now();

  try {
    const result = await scrapeWithFirecrawl(url);
    const elapsed = Date.now() - startTime;

    logResult(true, `Scraped successfully in ${elapsed}ms`);
    log(`  Title: ${result.title?.slice(0, 60) || 'N/A'}${(result.title?.length || 0) > 60 ? '...' : ''}`, 'dim');
    log(`  Content length: ${result.content.length} characters`, 'dim');
    log(`  Published date: ${result.publishedDate || 'Not found'}`, 'dim');
    log(`  Final URL: ${result.url}`, 'dim');

    // Show first 200 chars of content
    const preview = result.content.slice(0, 200).replace(/\n/g, ' ');
    log(`  Preview: ${preview}...`, 'dim');

    logCredits();
    return { success: true, elapsed };
  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error instanceof FirecrawlError) {
      logResult(false, `Failed with Firecrawl error: ${error.code}`);
      log(`  Message: ${error.message}`, 'dim');
      log(`  Status: ${error.statusCode}`, 'dim');
      log(`  Retryable: ${error.retryable}`, 'dim');
    } else {
      logResult(false, `Failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { success: false, elapsed };
  }
}

async function testBlogPostFetch(url: string) {
  log(`\nTesting blog post extraction: ${url}`, 'dim');
  log('(Cost: 1 credit)', 'cyan');

  const startTime = Date.now();

  try {
    const result = await fetchBlogPostContentWithFirecrawl(url);
    const elapsed = Date.now() - startTime;

    logResult(true, `Extracted blog content in ${elapsed}ms`);
    log(`  Content length: ${result.content.length} characters`, 'dim');
    log(`  Published date: ${result.publishedDate || 'Not found'}`, 'dim');

    // Show first 300 chars of content
    const preview = result.content.slice(0, 300).replace(/\n/g, ' ');
    log(`  Preview: ${preview}...`, 'dim');

    logCredits();
    return { success: true, elapsed };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logResult(false, `Failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, elapsed };
  }
}

async function testUrlMapping() {
  logSection('URL Mapping Test');
  log('(Cost: 1 credit)', 'cyan');

  const baseUrl = 'https://www.leangroup.com/resources';
  log(`Mapping: ${baseUrl}`, 'dim');

  const startTime = Date.now();

  try {
    const urls = await mapWithFirecrawl(baseUrl, { limit: 10 });
    const elapsed = Date.now() - startTime;

    logResult(true, `Found ${urls.length} URLs in ${elapsed}ms`);
    
    // Show first 5 URLs
    urls.slice(0, 5).forEach((url, i) => {
      log(`  ${i + 1}. ${url}`, 'dim');
    });
    if (urls.length > 5) {
      log(`  ... and ${urls.length - 5} more`, 'dim');
    }

    logCredits();
    return { success: true, elapsed };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logResult(false, `Map failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, elapsed };
  }
}

async function runAllTests() {
  console.log('\n');
  log('🔥 Firecrawl Integration Test Suite', 'blue');
  log('=====================================', 'blue');
  log('⚠️  WARNING: This test uses real API credits!', 'yellow');
  log('   Free tier: 500 credits/month', 'yellow');
  log('   Estimated cost of full test: ~5 credits', 'yellow');

  // Check configuration first
  const isConfigured = await testConfiguration();

  if (!isConfigured) {
    log('\n❌ Tests aborted: Firecrawl is not configured', 'red');
    process.exit(1);
  }

  // Prompt to continue
  log('\nStarting tests in 3 seconds... (Ctrl+C to cancel)', 'cyan');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const results: { success: boolean; elapsed: number }[] = [];

  // Test 1: URL Mapping (1 credit)
  const mapResult = await testUrlMapping();
  results.push(mapResult);

  // Add delay between requests
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Test 2: Single URL scrapes (1 credit each)
  logSection('Single URL Scrape Tests');

  // Only test first URL to save credits
  const scrapeResult = await testSingleScrape(TEST_URLS[0]);
  results.push(scrapeResult);

  await new Promise(resolve => setTimeout(resolve, 1500));

  // Test 3: Blog post extraction (1 credit)
  logSection('Blog Post Content Extraction Test');

  // Test second URL
  const blogResult = await testBlogPostFetch(TEST_URLS[1]);
  results.push(blogResult);

  // Summary
  logSection('Test Summary');

  const successCount = results.filter(r => r.success).length;
  const totalTests = results.length;
  const averageTime = Math.round(results.reduce((sum, r) => sum + r.elapsed, 0) / results.length);

  log(`Total Tests: ${totalTests}`, 'dim');
  logResult(successCount === totalTests, `Passed: ${successCount}/${totalTests}`);
  log(`Average Time: ${averageTime}ms`, 'dim');
  logCredits();

  if (successCount < totalTests) {
    log('\n⚠️  Some tests failed. Check the output above for details.', 'yellow');
    log('Common issues:', 'dim');
    log('  - API key invalid or expired', 'dim');
    log('  - Credit limit reached (free tier: 500/month)', 'dim');
    log('  - Target site blocking scraping', 'dim');
    process.exit(1);
  } else {
    log('\n🎉 All tests passed! Firecrawl integration is working correctly.', 'green');
    log('\nNext steps:', 'dim');
    log('  1. Set SCRAPING_PROVIDER=firecrawl in your environment', 'dim');
    log('  2. Add FIRECRAWL_API_KEY to Render environment variables', 'dim');
    log('  3. Deploy and monitor credit usage at https://www.firecrawl.dev/app', 'dim');
    process.exit(0);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Unexpected error running tests:', error);
  process.exit(1);
});
