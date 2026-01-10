/**
 * X.com Authentication Module
 * 
 * Handles X.com login flow with session persistence using Playwright storageState.
 * Reuses existing sessions when valid to avoid repeated logins.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createLogger } from './utils.js';
import { checkRateLimit, waitForDelay } from './utils.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('auth');

// Apply stealth plugin
chromium.use(StealthPlugin());

const SESSION_FILE = path.join(process.cwd(), 'sessions', 'auth.json');
const SESSION_DIR = path.dirname(SESSION_FILE);

interface AuthResult {
  success: boolean;
  error?: string;
  sessionPath?: string;
}

/**
 * Check if existing session is valid by loading it and verifying
 */
async function isSessionValid(): Promise<boolean> {
  try {
    await fs.access(SESSION_FILE);
    
    // Try to load the session
    const sessionData = await fs.readFile(SESSION_FILE, 'utf-8');
    const session = JSON.parse(sessionData);
    
    // Basic validation: check if cookies exist and have reasonable structure
    if (!session.cookies || !Array.isArray(session.cookies) || session.cookies.length === 0) {
      logger.info('Session file exists but has no cookies');
      return false;
    }

    // Check if cookies are not too old (optional: could add timestamp check)
    // For now, we'll just verify the file exists and has cookies
    logger.info('Session file appears valid', { cookieCount: session.cookies.length });
    return true;
  } catch (error) {
    logger.info('No valid session file found', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Authenticate with X.com and save session
 */
export async function authenticateX(): Promise<AuthResult> {
  const username = process.env.X_USERNAME;
  const password = process.env.X_PASSWORD;

  if (!username || !password) {
    return {
      success: false,
      error: 'X_USERNAME and X_PASSWORD environment variables are required',
    };
  }

  // Check if we have a valid existing session
  if (await isSessionValid()) {
    logger.info('Using existing X.com session');
    return {
      success: true,
      sessionPath: SESSION_FILE,
    };
  }

  logger.info('No valid session found, performing new authentication');

  // Ensure sessions directory exists
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create sessions directory', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check rate limit before authentication
  await checkRateLimit();

  const browser = await chromium.launch({
    headless: true,
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
    logger.info('Navigating to X.com login page');
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for username input
    logger.info('Waiting for login form');
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });

    // Enter username
    logger.info('Entering username');
    await page.fill('input[autocomplete="username"]', username);
    await page.click('button[type="submit"]:has-text("Next")');

    // Wait for password input (may need to handle "unusual activity" prompts)
    await page.waitForSelector('input[name="password"]', { timeout: 10000 }).catch(async () => {
      // Check if we hit a challenge (captcha, phone verification, etc.)
      const challengeText = await page.textContent('body').catch(() => '');
      if (challengeText?.toLowerCase().includes('unusual activity') || 
          challengeText?.toLowerCase().includes('verify') ||
          challengeText?.toLowerCase().includes('captcha')) {
        logger.error('X.com login challenge detected (captcha/verification required)');
        throw new Error('Login challenge detected - manual intervention required');
      }
      throw new Error('Password input not found');
    });

    // Enter password
    logger.info('Entering password');
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]:has-text("Log in")');

    // Wait for successful login (check for home feed or profile)
    logger.info('Waiting for login to complete');
    await page.waitForURL(/x\.com\/(home|i\/web)/, { timeout: 30000 }).catch(async () => {
      // Check for errors or challenges
      const errorText = await page.textContent('body').catch(() => '');
      if (errorText?.toLowerCase().includes('incorrect') || 
          errorText?.toLowerCase().includes('wrong password')) {
        throw new Error('Invalid credentials');
      }
      if (errorText?.toLowerCase().includes('unusual activity') ||
          errorText?.toLowerCase().includes('verify') ||
          errorText?.toLowerCase().includes('captcha')) {
        throw new Error('Login challenge detected - manual intervention required');
      }
      throw new Error('Login timeout - unable to verify successful login');
    });

    logger.info('Login successful, saving session');

    // Save session state
    await context.storageState({ path: SESSION_FILE });
    logger.info('Session saved', { path: SESSION_FILE });

    // Wait before closing (rate limiting)
    await waitForDelay();

    return {
      success: true,
      sessionPath: SESSION_FILE,
    };
  } catch (error) {
    logger.error('Authentication failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Clean up invalid session file if it exists
    try {
      await fs.unlink(SESSION_FILE);
    } catch {
      // Ignore errors deleting session file
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

/**
 * Clear stored session (force re-authentication on next call)
 */
export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(SESSION_FILE);
    logger.info('Session cleared');
  } catch (error) {
    logger.warn('Failed to clear session', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
