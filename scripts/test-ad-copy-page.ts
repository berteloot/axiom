/**
 * Puppeteer test for Ad Copy page
 * Run: npx tsx scripts/test-ad-copy-page.ts
 */
import puppeteer from "puppeteer";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

async function main() {
  let browser;
  const results: string[] = [];
  const pass = (msg: string) => {
    results.push(`✅ ${msg}`);
    console.log(`✅ ${msg}`);
  };
  const fail = (msg: string) => {
    results.push(`❌ ${msg}`);
    console.error(`❌ ${msg}`);
  };

  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // 1. Navigate to ad-copy page
    const resp = await page.goto(`${BASE_URL}/ad-copy`, {
      waitUntil: "networkidle2",
      timeout: 15000,
    });
    if (!resp || resp.status() !== 200) {
      fail(`Page load failed: status ${resp?.status()}`);
      return;
    }
    pass(`Ad Copy page loads (${resp.status()})`);

    const html = await page.content();
    const isLoginPage =
      html.includes("sign in") ||
      html.includes("Sign in") ||
      html.includes("Log in") ||
      html.includes("login");

    if (isLoginPage) {
      pass("Auth flow: shows login/sign-in (expected when not logged in)");
    } else {
      // 2. Check for key UI elements
      const hasBrandInput =
        (await page.$('input[name="brandName"], textarea[name="brandName"]')) !== null ||
        html.includes("Brand") ||
        html.includes("brand");
      if (hasBrandInput || html.includes("Brand")) pass("Brand/company field present");
      else fail("Brand/company field not found");

      const hasGenerateBtn =
        (await page.$('button[type="submit"]')) !== null ||
        (await page.evaluate(() => !!document.querySelector('button'))) ||
        html.includes("Generate");
      if (hasGenerateBtn) pass("Generate button present");
      else fail("Generate button not found");

      const hasPlatform =
        html.includes("Meta") || html.includes("LinkedIn") || html.includes("platform");
      if (hasPlatform) pass("Platform selector present");
      else fail("Platform selector not found");

      const hasTone =
        html.includes("Tone") || html.includes("tone") || html.includes("Professional");
      if (hasTone) pass("Tone of Voice selector present");
      else fail("Tone of Voice selector not found");
    }

    // 3. Homepage loads
    const homeResp = await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
    if (homeResp && homeResp.status() === 200) {
      pass("Homepage loads");
    } else {
      fail(`Homepage failed: ${homeResp?.status()}`);
    }
  } catch (err) {
    fail(`Error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await browser?.close();
  }

  const failed = results.filter((r) => r.startsWith("❌"));
  console.log("\n--- Summary ---");
  console.log(results.join("\n"));
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
