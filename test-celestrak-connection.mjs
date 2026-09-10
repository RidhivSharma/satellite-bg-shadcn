#!/usr/bin/env node

/**
 * Diagnostic script to test connection to CelestTrak
 */

const CelesTrakBaseUrl = "https://celestrak.org/NORAD/elements/gp.php";
const CelesTrakUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 SatelliteBackground/1.0";

async function testConnection() {
  console.log("Testing connection to CelestTrak...\n");
  
  const tests = [
    { name: "Visual Satellites", group: "visual" },
    { name: "Space Stations", group: "stations" }
  ];

  for (const test of tests) {
    const url = `${CelesTrakBaseUrl}?GROUP=${test.group}&FORMAT=tle`;
    console.log(`Testing ${test.name}...`);
    console.log(`URL: ${url}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        headers: {
          "User-Agent": CelesTrakUserAgent,
        },
        signal: controller.signal,
      });
      const elapsed = Date.now() - startTime;
      
      if (!response.ok) {
        console.error(`❌ Request failed with status ${response.status}`);
        continue;
      }
      
      const text = await response.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const recordCount = Math.floor(lines.length / 3);
      
      console.log(`✅ Success! (${elapsed}ms)`);
      console.log(`   Retrieved ${recordCount} satellite records`);
      console.log(`   First satellite: ${lines[0] || 'N/A'}`);
      
    } catch (error) {
      console.error(`❌ Error:`, error.message);
      
      if (error.name === 'AbortError') {
        console.error(`   Connection timed out after 30 seconds`);
      } else if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        console.error(`   Connection timeout - cannot reach celestrak.org`);
      } else if (error.cause) {
        console.error(`   Cause:`, error.cause);
      }
    } finally {
      clearTimeout(timeout);
    }
    
    console.log("");
  }
  
  console.log("\nTroubleshooting tips:");
  console.log("1. Check your internet connection");
  console.log("2. Verify celestrak.org is accessible from your network");
  console.log("3. Check if a firewall or proxy is blocking access");
  console.log("4. Try accessing https://celestrak.org in a browser");
  console.log("5. If using a corporate network, you may need to configure a proxy");
}

testConnection().catch(console.error);
