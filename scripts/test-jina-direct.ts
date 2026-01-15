/**
 * Test Jina Reader API directly
 */

import * as dotenv from 'dotenv';
dotenv.config();

const TEST_URL = 'https://www.leangroup.com/resources/why-every-operations-leader-should-run-the-lean-solutions-group-roi-calculator';

async function testJinaDirect() {
  const JINA_API_KEY = process.env.JINA_API_KEY;
  
  console.log('='.repeat(80));
  console.log('Direct Jina API Test');
  console.log('='.repeat(80));
  console.log(`\nJINA_API_KEY: ${JINA_API_KEY ? JINA_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
  console.log(`URL: ${TEST_URL}\n`);
  
  if (!JINA_API_KEY) {
    console.log('❌ JINA_API_KEY not found in .env');
    return;
  }
  
  // Test 1: Simple GET request to r.jina.ai
  console.log('--- Test 1: Simple GET request ---');
  try {
    const response = await fetch(`https://r.jina.ai/${TEST_URL}`, {
      headers: {
        'Authorization': `Bearer ${JINA_API_KEY}`,
        'Accept': 'text/plain',
      },
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Content length: ${text.length} chars`);
      console.log('\n--- First 1500 chars ---\n');
      console.log(text.substring(0, 1500));
    } else {
      const error = await response.text();
      console.log(`Error: ${error.substring(0, 500)}`);
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Test 2: POST request with browser engine
  console.log('\n--- Test 2: POST with browser engine ---');
  try {
    const response = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
      },
      body: JSON.stringify({
        url: TEST_URL,
        options: {
          engine: 'browser',
          waitForSelector: 'main, article',
        }
      }),
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const json = await response.json();
      const content = json.data?.content || '';
      console.log(`Content length: ${content.length} chars`);
      console.log(`Title: ${json.data?.title || 'N/A'}`);
      
      // Find article content
      const articleStart = content.indexOf('Why Every Operations');
      if (articleStart > 0) {
        console.log('\n--- Article content found at position', articleStart, '---\n');
        console.log(content.substring(articleStart, articleStart + 2000));
      } else {
        console.log('\n--- First 1500 chars ---\n');
        console.log(content.substring(0, 1500));
      }
    } else {
      const error = await response.text();
      console.log(`Error: ${error.substring(0, 500)}`);
    }
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  console.log('\n' + '='.repeat(80));
}

testJinaDirect().catch(console.error);
