/**
 * Test script for trending topics discovery
 * Tests the API endpoint and verifies the response structure
 */

import "dotenv/config";

const API_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

async function testTrendingDiscovery() {
  console.log("🧪 Testing Trending Topics Discovery API\n");
  
  const testGap = {
    icp: "Chief Financial Officer (CFO)",
    stage: "TOFU_AWARENESS",
    painCluster: "Brownfield Migration Challenges",
  };

  console.log("📋 Test Gap:", testGap);
  console.log("📡 Sending request to:", `${API_URL}/api/content/generate-ideas`);
  console.log("⏳ Mode: trendingOnly\n");

  try {
    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/api/content/generate-ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gap: testGap,
        includeTrendingTopics: true,
        mode: "trendingOnly",
      }),
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Response time: ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ Error Response:", errorData);
      return;
    }

    const data = await response.json();
    
    console.log("✅ Response received successfully!\n");
    console.log("📦 Response Structure:");
    console.log(`   - trendingTopics: ${data.trendingTopics?.length || 0} items`);
    console.log(`   - sources: ${data.sources?.length || 0} items`);
    console.log(`   - trendingSources: ${data.trendingSources?.length || 0} items`);
    console.log(`   - trendingContext: ${data.trendingContext ? "✓" : "✗"}`);
    console.log(`   - ideas: ${data.ideas?.length || 0} items (should be 0 for trendingOnly mode)`);
    
    if (data.trendingTopics && data.trendingTopics.length > 0) {
      console.log("\n📌 Trending Topics Found:");
      data.trendingTopics.slice(0, 5).forEach((topic: string, idx: number) => {
        console.log(`   ${idx + 1}. ${topic}`);
      });
    }
    
    if (data.sources && data.sources.length > 0) {
      console.log("\n🔗 Sources Found:");
      data.sources.slice(0, 3).forEach((source: any, idx: number) => {
        console.log(`   ${idx + 1}. ${source.title}`);
        console.log(`      URL: ${source.url}`);
        console.log(`      ID: ${source.id || "N/A"}`);
        console.log(`      Published: ${source.publishedDate || "N/A"}`);
        console.log(`      Reputable: ${source.isReputable ? "✓" : "✗"}`);
        console.log(`      Relevance: ${source.relevance}`);
        console.log();
      });
    }
    
    // Validate response structure
    const issues: string[] = [];
    
    if (data.ideas && data.ideas.length > 0) {
      issues.push("⚠️  Ideas array should be empty for trendingOnly mode");
    }
    
    if (!data.trendingTopics || data.trendingTopics.length === 0) {
      issues.push("⚠️  No trending topics returned");
    }
    
    if (!data.sources || data.sources.length === 0) {
      issues.push("⚠️  No sources returned");
    }
    
    if (data.sources) {
      const sourcesWithoutId = data.sources.filter((s: any) => !s.id);
      if (sourcesWithoutId.length > 0) {
        issues.push(`⚠️  ${sourcesWithoutId.length} source(s) missing ID field`);
      }
    }
    
    if (issues.length > 0) {
      console.log("\n⚠️  Validation Issues:");
      issues.forEach(issue => console.log(`   ${issue}`));
    } else {
      console.log("\n✅ All validations passed!");
    }
    
    if (data._apiWarnings && data._apiWarnings.length > 0) {
      console.log("\n⚠️  API Warnings:");
      data._apiWarnings.forEach((warning: any) => {
        console.log(`   [${warning.api}] ${warning.type}: ${warning.message}`);
      });
    }
    
    console.log(`\n✅ Test completed in ${duration}ms\n`);
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("   Error message:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testTrendingDiscovery().catch(console.error);
