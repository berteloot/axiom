import { extractBlogPostUrls } from "../lib/services/blog-extractor";

async function testBlogExtraction() {
  const blogUrl = "https://rfxcel.com/library/#blog";
  
  console.log(`Testing blog extraction from: ${blogUrl}\n`);
  
  try {
    const posts = await extractBlogPostUrls(blogUrl);
    
    console.log(`\n✅ Found ${posts.length} blog posts:\n`);
    
    // Show first 20 posts
    const postsToShow = posts.slice(0, 20);
    postsToShow.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title}`);
      console.log(`   ${post.url}\n`);
    });
    
    if (posts.length > 20) {
      console.log(`... and ${posts.length - 20} more posts\n`);
    }
    
    // Show statistics
    console.log(`\n📊 Statistics:`);
    console.log(`   Total posts found: ${posts.length}`);
    console.log(`   Expected: 216 (according to the page)`);
    console.log(`   Coverage: ${((posts.length / 216) * 100).toFixed(1)}%`);
    
    // Check for common patterns
    const blogUrls = posts.filter(p => p.url.includes('/blog/'));
    const postUrls = posts.filter(p => p.url.includes('/post/'));
    const articleUrls = posts.filter(p => p.url.includes('/article/'));
    
    console.log(`\n📋 URL Patterns:`);
    console.log(`   URLs with /blog/: ${blogUrls.length}`);
    console.log(`   URLs with /post/: ${postUrls.length}`);
    console.log(`   URLs with /article/: ${articleUrls.length}`);
    
    // Show some sample URLs
    if (posts.length > 0) {
      console.log(`\n🔗 Sample URLs (first 5):`);
      posts.slice(0, 5).forEach((post, index) => {
        console.log(`   ${index + 1}. ${post.url}`);
      });
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
  }
}

testBlogExtraction();
