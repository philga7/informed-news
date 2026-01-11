/**
 * Helper script for manual X.com login
 * 
 * This script opens a browser window where you can manually log in to X.com.
 * After successful login, it saves the session so the scraper can reuse it.
 * 
 * Usage:
 *   npm run manual-login
 *   OR
 *   tsx src/manual-login.ts
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';
import * as path from 'path';

// Apply stealth plugin
chromium.use(StealthPlugin());

const SESSION_DIR = path.join(process.cwd(), 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'auth.json');

async function manualLogin(): Promise<void> {
  console.log('Opening browser for manual X.com login...');
  console.log('Please log in manually. After successful login, press Enter in this terminal.');
  console.log(`Session will be saved to: ${SESSION_FILE}\n`);

  // Ensure sessions directory exists
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create sessions directory:', error);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false, // Show browser window
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Navigate to X.com login
    console.log('Navigating to X.com login page...');
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log('\n✅ Browser window opened!');
    console.log('📝 Please log in manually in the browser window.');
    console.log('🔑 After you see the X.com home feed (logged in), come back here and press Enter.\n');

    // Wait for user to press Enter
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    // Check if user is logged in
    const currentUrl = page.url();
    const pageTitle = await page.title().catch(() => '');

    console.log(`\nChecking login status...`);
    console.log(`Current URL: ${currentUrl}`);
    console.log(`Page title: ${pageTitle}`);

    // Check if we're logged in (home feed or web interface)
    const isLoggedIn = currentUrl.includes('x.com/home') || 
                       currentUrl.includes('x.com/i/web') ||
                       currentUrl === 'https://x.com/';

    if (!isLoggedIn) {
      console.log('\n⚠️  Warning: You may not be logged in yet.');
      console.log('Current URL does not match logged-in patterns.');
      console.log('Do you want to save the session anyway? (y/n)');

      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (answer !== 'y' && answer !== 'yes') {
        console.log('Session not saved. Please try again.');
        await browser.close();
        process.exit(0);
      }
    }

    // Save session state
    console.log('\n💾 Saving session...');
    await context.storageState({ path: SESSION_FILE });
    console.log(`✅ Session saved to: ${SESSION_FILE}`);
    console.log('\n🎉 Done! The scraper will now use this session for authentication.\n');

    // Keep browser open for a moment so user can see
    await page.waitForTimeout(2000);
  } catch (error) {
    console.error('\n❌ Error during manual login:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run if called directly
manualLogin().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
