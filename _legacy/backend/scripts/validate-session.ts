/**
 * Local Session Validation Script
 * 
 * This script allows you to manually log in to X.com on your local machine,
 * validate the session, and save it for use on the Hetzner server.
 * 
 * The saved session file (sessions/auth.json) can be transferred to Hetzner
 * and will be automatically used by the scraper to authenticate.
 * 
 * Usage:
 *   cd backend
 *   npm run validate-session
 *   OR
 *   tsx scripts/validate-session.ts
 * 
 * After running:
 *   1. Log in manually in the browser window
 *   2. Wait for automatic validation (checks for home feed)
 *   3. Session is saved to backend/sessions/auth.json
 *   4. Transfer this file to Hetzner server (scp, rsync, etc.)
 */

import { chromium } from 'playwright-extra';
import type { Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';
import * as path from 'path';

// Apply stealth plugin
chromium.use(StealthPlugin());

// Simple logger for this script
const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[INFO] ${message}${metaStr}`);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`[WARN] ${message}${metaStr}`);
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.error(`[ERROR] ${message}${metaStr}`);
  },
};

const SESSION_DIR = path.join(process.cwd(), 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'auth.json');

/**
 * Validate that the user is logged in by checking URL and page content
 */
async function validateLogin(page: Page): Promise<boolean> {
  const currentUrl = page.url();
  const pageTitle = await page.title().catch(() => '');
  const bodyText = await page.textContent('body').catch(() => '') || '';

  // Check URL patterns for logged-in state
  const isLoggedInUrl = 
    currentUrl.includes('x.com/home') || 
    currentUrl.includes('x.com/i/web') ||
    currentUrl === 'https://x.com/' ||
    currentUrl.includes('x.com/compose');

  // Check for login page indicators (negative check)
  const isLoginPage = 
    currentUrl.includes('x.com/i/flow/login') ||
    currentUrl.includes('x.com/i/flow/signup') ||
    bodyText.toLowerCase().includes('sign in to x') ||
    bodyText.toLowerCase().includes('create account');

  // Check for home feed indicators
  const hasHomeFeed = 
    bodyText.includes('Home') ||
    bodyText.includes('Following') ||
    bodyText.includes('For you');

  logger.info('Login validation check', {
    url: currentUrl,
    title: pageTitle.substring(0, 100),
    isLoggedInUrl,
    isLoginPage,
    hasHomeFeed,
  });

  return isLoggedInUrl && !isLoginPage && hasHomeFeed;
}

/**
 * Wait for user to log in, with periodic validation checks
 */
async function waitForLogin(page: Page, maxWaitMinutes: number = 10): Promise<boolean> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const checkInterval = 3000; // Check every 3 seconds

  logger.info('Waiting for manual login...', { maxWaitMinutes });

  while (Date.now() - startTime < maxWaitMs) {
    const isLoggedIn = await validateLogin(page);
    
    if (isLoggedIn) {
      logger.info('Login detected!');
      return true;
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  logger.warn('Login timeout - user may not have logged in');
  return false;
}

async function validateSession(): Promise<void> {
  console.log('\n🔐 X.com Session Validation Tool\n');
  console.log('This script will:');
  console.log('  1. Open a browser window for manual login');
  console.log('  2. Wait for you to log in to X.com');
  console.log('  3. Validate the session automatically');
  console.log('  4. Save the session to:', SESSION_FILE);
  console.log('\n📋 After saving, transfer the session file to Hetzner server.\n');

  // Ensure sessions directory exists
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    logger.info('Sessions directory ready', { path: SESSION_DIR });
  } catch (error) {
    logger.error('Failed to create sessions directory', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false, // Show browser window for manual interaction
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
    console.log('🌐 Opening X.com login page...');
    logger.info('Navigating to X.com login');
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    console.log('\n✅ Browser window opened!');
    console.log('📝 Please log in manually in the browser window.');
    console.log('⏳ Waiting for login (will auto-detect when complete)...\n');

    // Wait for user to log in (with automatic detection)
    const loginSuccess = await waitForLogin(page, 10);

    if (!loginSuccess) {
      // Final check before giving up
      const finalCheck = await validateLogin(page);
      if (!finalCheck) {
        console.log('\n⚠️  Warning: Could not detect successful login.');
        console.log('Current URL:', page.url());
        console.log('\nDo you want to save the session anyway? (y/n)');

        const answer = await new Promise<string>((resolve) => {
          process.stdin.once('data', (data) => {
            resolve(data.toString().trim().toLowerCase());
          });
        });

        if (answer !== 'y' && answer !== 'yes') {
          console.log('\n❌ Session not saved. Please try again.');
          await browser.close();
          process.exit(0);
        }
      }
    }

    // Final validation
    const isValid = await validateLogin(page);
    if (isValid) {
      console.log('\n✅ Login validated successfully!');
    } else {
      console.log('\n⚠️  Login validation uncertain, but proceeding to save session...');
    }

    // Save session state
    console.log('\n💾 Saving session...');
    logger.info('Saving session state', { path: SESSION_FILE });
    await context.storageState({ path: SESSION_FILE });

    // Verify file was created
    try {
      const stats = await fs.stat(SESSION_FILE);
      console.log(`✅ Session saved successfully!`);
      console.log(`   Location: ${SESSION_FILE}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log('\n📤 Next steps:');
      console.log('   1. Transfer sessions/auth.json to your Hetzner server');
      console.log('   2. Place it in the same location on the server');
      console.log('   3. The scraper will automatically use this session\n');
    } catch (error) {
      logger.error('Failed to verify session file', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.log('\n❌ Warning: Could not verify session file was saved.');
      console.log('Please check the file manually.');
    }

    // Keep browser open briefly so user can see
    await page.waitForTimeout(2000);
  } catch (error) {
    logger.error('Error during session validation', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error('\n❌ Error during session validation:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run if called directly
validateSession().catch((error) => {
  logger.error('Fatal error', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  console.error('Fatal error:', error);
  process.exit(1);
});

export { validateSession };
