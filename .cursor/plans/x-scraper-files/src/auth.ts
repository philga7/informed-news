/**
 * X.com Authentication Module
 * 
 * Handles X.com login flow with session persistence using Playwright storageState.
 * Reuses existing sessions when valid to avoid repeated logins.
 */

import { chromium } from 'playwright-extra';
import type { Page } from 'playwright';
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

  let page: Page | null = null;
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    page = await context.newPage();

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
    const usernameInput = await page.locator('input[autocomplete="username"]');
    await usernameInput.fill(username, { timeout: 5000 });
    
    // Wait a moment for the form to validate and enable the button
    await page.waitForTimeout(1000);
    
    // DEBUG: Log all buttons on the page to see what's actually there
    const allButtons = await page.$$eval('button', (buttons) => 
      buttons.map(btn => ({
        text: btn.textContent?.trim(),
        type: btn.getAttribute('type'),
        disabled: btn.hasAttribute('disabled'),
        classes: btn.className,
        dataTestId: btn.getAttribute('data-testid'),
        html: btn.outerHTML.substring(0, 200),
      }))
    ).catch(() => []);
    
    logger.info('DEBUG: All buttons on page after entering username', { 
      buttonCount: allButtons.length,
      buttons: allButtons,
    });
    
    // DEBUG: Try to find any submit button
    const submitButtons = await page.$$eval('button[type="submit"]', (buttons) =>
      buttons.map(btn => ({
        text: btn.textContent?.trim(),
        disabled: btn.hasAttribute('disabled'),
        visible: btn.offsetParent !== null,
      }))
    ).catch(() => []);
    
    logger.info('DEBUG: All submit buttons found', { submitButtons });
    
    // Try multiple strategies to click Next button
    logger.info('Clicking Next button');
    const nextButton = page.locator('button[type="submit"]:has-text("Next")');
    
    // Wait for button to be visible and enabled
    try {
      await nextButton.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      // If Next button not found, try alternative selectors
      logger.warn('Next button not found with primary selector, trying alternatives');
      
      // Try without text match first
      const anySubmitButton = page.locator('button[type="submit"]').first();
      const buttonExists = await anySubmitButton.count() > 0;
      
      if (buttonExists) {
        const buttonText = await anySubmitButton.textContent().catch(() => '');
        logger.info('Found submit button with text', { text: buttonText });
        
        // Try clicking it anyway (might be the Next button with different styling)
        try {
          await anySubmitButton.click({ timeout: 5000 });
          logger.info('Clicked alternative submit button');
        } catch (clickError) {
          // Fallback to Enter key
          logger.warn('Alternative button click failed, using Enter key');
          await usernameInput.press('Enter');
        }
      } else {
        // No submit button found at all
        throw new Error('No submit button found on page');
      }
      
      // Wait for page transition
      await page.waitForTimeout(2000);
    } else {
      // Button found - continue with normal flow
      await nextButton.waitFor({ state: 'attached', timeout: 5000 });
      
      // Check if button is enabled (not disabled)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isEnabled = await nextButton.evaluate((btn: any) => !btn.hasAttribute('disabled'));
      if (!isEnabled) {
        logger.warn('Next button is disabled, waiting for it to become enabled');
        await page.waitForTimeout(2000);
      }
      
      // Try clicking - use force if needed (sometimes buttons are covered)
      try {
        await nextButton.click({ timeout: 10000 });
      } catch (error) {
        // Fallback: try pressing Enter on the input field
        logger.warn('Button click failed, trying Enter key', {
          error: error instanceof Error ? error.message : String(error),
        });
        await usernameInput.press('Enter');
        await page.waitForTimeout(2000);
      }
    }

    // Wait for password input or intermediate verification step
    logger.info('Waiting for password field or verification step');
    
    try {
      // Wait a bit for page transition after clicking Next
      await page.waitForTimeout(2000);
      
      // Check if we're on a verification/challenge page first
      const pageContent = await page.textContent('body').catch(() => '') || '';
      const pageUrl = page.url();
      
      if (pageContent.toLowerCase().includes('unusual activity') || 
          pageContent.toLowerCase().includes('verify your identity') ||
          pageContent.toLowerCase().includes('phone number') ||
          pageContent.toLowerCase().includes('email address') ||
          pageContent.toLowerCase().includes('captcha') ||
          pageUrl.includes('account/access') ||
          pageUrl.includes('challenge')) {
        logger.error('X.com login challenge detected (captcha/verification required)', {
          url: pageUrl,
          hasUnusualActivity: pageContent.toLowerCase().includes('unusual activity'),
        });
        throw new Error('Login challenge detected - manual intervention required');
      }
      
      // Wait for password input with longer timeout and multiple strategies
      try {
        await page.waitForSelector('input[name="password"]', { 
          timeout: 15000,
          state: 'visible',
        });
      } catch {
        // Try alternative selector
        await page.waitForSelector('input[type="password"]', { 
          timeout: 5000,
          state: 'visible',
        });
      }
      
      logger.info('Password field found');
    } catch (waitError) {
      // Final check for what's on the page
      const finalUrl = page.url();
      const finalContent = await page.textContent('body').catch(() => '') || '';
      
      logger.error('Password input not found', {
        url: finalUrl,
        error: waitError instanceof Error ? waitError.message : String(waitError),
        contentSnippet: finalContent.substring(0, 200),
      });
      
      if (finalContent.toLowerCase().includes('unusual activity') || 
          finalContent.toLowerCase().includes('verify') ||
          finalContent.toLowerCase().includes('captcha')) {
        throw new Error('Login challenge detected - manual intervention required');
      }
      
      throw new Error(`Password input not found. Page URL: ${finalUrl}`);
    }

    // Enter password
    logger.info('Entering password');
    const passwordInput = await page.locator('input[name="password"]');
    await passwordInput.fill(password, { timeout: 5000 });
    
    // Wait for form to validate
    await page.waitForTimeout(1000);
    
    // Try clicking login button with fallback to Enter key
    logger.info('Clicking Log in button');
    const loginButton = page.locator('button[type="submit"]:has-text("Log in")');
    
    try {
      await loginButton.waitFor({ state: 'visible', timeout: 10000 });
      await loginButton.click({ timeout: 10000 });
    } catch (error) {
      // Fallback: try pressing Enter
      logger.warn('Login button click failed, trying Enter key', {
        error: error instanceof Error ? error.message : String(error),
      });
      await passwordInput.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Wait for successful login (check for home feed or profile)
    logger.info('Waiting for login to complete');
    await page.waitForURL(/x\.com\/(home|i\/web)/, { timeout: 30000 }).catch(async () => {
      // Check for errors or challenges
      if (!page) {
        throw new Error('Page not initialized - unable to verify successful login');
      }
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

    // Capture screenshot for debugging (if page still exists)
    try {
      if (page) {
        const screenshotsDir = path.join(process.cwd(), 'logs', 'screenshots');
        await fs.mkdir(screenshotsDir, { recursive: true });
        const screenshotPath = path.join(screenshotsDir, `auth-failure-${Date.now()}.png`);
        
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logger.info('Screenshot saved for debugging', { path: screenshotPath });
        } catch (screenshotErr) {
          logger.debug('Could not capture screenshot', {
            error: screenshotErr instanceof Error ? screenshotErr.message : String(screenshotErr),
          });
        }
        
        // Also log current page URL and title
        try {
          const currentUrl = page.url();
          const pageTitle = await page.title().catch(() => 'unknown');
          logger.info('Page state at failure', { url: currentUrl, title: pageTitle });
          
          // Log page content snippet for debugging
          const bodyText = await page.textContent('body').catch(() => '');
          if (bodyText) {
            logger.debug('Page content snippet', {
              snippet: bodyText.substring(0, 500),
            });
          }
        } catch {
          // Page might be closed, ignore
        }
      }
    } catch (screenshotError) {
      logger.warn('Failed to capture debugging info', {
        error: screenshotError instanceof Error ? screenshotError.message : String(screenshotError),
      });
    }

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
