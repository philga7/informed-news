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
  const email = process.env.X_EMAIL || 'phil@informedcrew.com'; // Default email for verification

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allButtons = await page.$$eval('button', (buttons: any) => 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buttons.map((btn: any) => ({
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submitButtons = await page.$$eval('button[type="submit"]', (buttons: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buttons.map((btn: any) => ({
        text: btn.textContent?.trim(),
        disabled: btn.hasAttribute('disabled'),
        visible: btn.offsetParent !== null,
      }))
    ).catch(() => []);
    
    logger.info('DEBUG: All submit buttons found', { submitButtons });
    
    // Try multiple strategies to click Next button
    // Note: X.com uses type="button" not type="submit" for the Next button
    logger.info('Clicking Next button');
    const nextButton = page.locator('button:has-text("Next")');
    
    // Wait for button to be visible and enabled
    let buttonClicked = false;
    try {
      await nextButton.waitFor({ state: 'visible', timeout: 10000 });
      
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
        buttonClicked = true;
      } catch (error) {
        // Fallback: try pressing Enter on the input field
        logger.warn('Button click failed, trying Enter key', {
          error: error instanceof Error ? error.message : String(error),
        });
        await usernameInput.press('Enter');
        buttonClicked = true;
      }
    } catch (error) {
      // If Next button not found, try alternative selectors
      logger.warn('Next button not found with primary selector, trying alternatives', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Try finding Next button without type constraint (X.com uses type="button")
      const nextButtonAlt = page.locator('button:has-text("Next")').first();
      const buttonExists = await nextButtonAlt.count() > 0;
      
      if (buttonExists) {
        const buttonText = await nextButtonAlt.textContent().catch(() => '');
        logger.info('Found Next button with alternative selector', { text: buttonText });
        
        // Try clicking it
        try {
          await nextButtonAlt.click({ timeout: 5000 });
          logger.info('Clicked Next button with alternative selector');
          buttonClicked = true;
        } catch (clickError) {
          // Fallback to Enter key
          logger.warn('Alternative button click failed, using Enter key', {
            error: clickError instanceof Error ? clickError.message : String(clickError),
          });
          await usernameInput.press('Enter');
          buttonClicked = true;
        }
      } else {
        // No Next button found - try Enter key as final fallback
        logger.warn('No Next button found, using Enter key');
        await usernameInput.press('Enter');
        buttonClicked = true;
      }
    }
    
    // Wait for page transition after clicking
    if (buttonClicked) {
      await page.waitForTimeout(2000);
    }

    // Wait for password input or intermediate verification step
    logger.info('Waiting for password field or verification step');
    
    try {
      // Wait a bit for page transition after clicking Next
      await page.waitForTimeout(2000);
      
      // Check if we're on a verification/challenge page first
      const pageContent = await page.textContent('body').catch(() => '') || '';
      const pageUrl = page.url();
      
      // Detect specific types of challenges
      const hasUnusualActivity = pageContent.toLowerCase().includes('unusual activity');
      const hasVerifyIdentity = pageContent.toLowerCase().includes('verify your identity');
      const hasPhoneNumber = pageContent.toLowerCase().includes('phone number');
      const hasEmailAddress = pageContent.toLowerCase().includes('email address') || 
                             pageContent.toLowerCase().includes('enter your email') ||
                             pageContent.toLowerCase().includes('email');
      const hasCaptcha = pageContent.toLowerCase().includes('captcha') || pageContent.toLowerCase().includes('verify you\'re not a bot');
      const hasChallengeUrl = pageUrl.includes('account/access') || pageUrl.includes('challenge');
      
      // Handle email verification programmatically
      // X.com often shows phone/email options together, so try email if either is detected
      if ((hasEmailAddress || hasPhoneNumber) && !hasCaptcha && !hasUnusualActivity) {
        logger.info('X.com email verification detected - attempting to enter email');
        
        try {
          // Look for email input field
          const emailInput = page.locator('input[type="email"], input[name="text"], input[autocomplete="email"], input[autocomplete="username"]').first();
          const emailInputExists = await emailInput.count() > 0;
          
          if (emailInputExists) {
            logger.info('Email input field found, entering email address');
            await emailInput.waitFor({ state: 'visible', timeout: 10000 });
            await emailInput.fill(email, { timeout: 5000 });
            await page.waitForTimeout(1000);
            
            // Look for Next/Continue button after email entry
            const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
            const nextButtonExists = await nextButton.count() > 0;
            
            if (nextButtonExists) {
              logger.info('Clicking Next/Continue after entering email');
              await nextButton.click({ timeout: 5000 });
              await page.waitForTimeout(3000); // Increased wait time
              
              // Check what's on the page after email verification
              const afterEmailUrl = page.url();
              const afterEmailContent = await page.textContent('body').catch(() => '') || '';
              const hasCodePrompt = afterEmailContent.toLowerCase().includes('code') || afterEmailContent.toLowerCase().includes('verification code');
              const isErrorPage = afterEmailContent.toLowerCase().includes('errorcontainer') || afterEmailUrl.includes('error');
              
              logger.info('Page state after email verification', {
                url: afterEmailUrl,
                contentSnippet: afterEmailContent.substring(0, 300),
                hasPasswordField: afterEmailContent.toLowerCase().includes('password'),
                hasCodeField: hasCodePrompt,
                isErrorPage,
              });
              
              // If X.com is asking for verification code, we can't proceed
              if (hasCodePrompt && !afterEmailContent.toLowerCase().includes('password')) {
                logger.warn('X.com requesting email verification code - cannot proceed programmatically');
                throw new Error(`X.com requires email verification code sent to ${email} - This cannot be automated. Please manually log in once to establish trust.`);
              }
              
              // Continue to password field check (fall through)
              logger.info('Email verification submitted, waiting for password field');
            } else {
              // Try pressing Enter
              logger.info('No Next button found, pressing Enter');
              await emailInput.press('Enter');
              await page.waitForTimeout(3000); // Increased wait time
              
              // Check what's on the page after email verification
              const afterEmailUrl = page.url();
              const afterEmailContent = await page.textContent('body').catch(() => '') || '';
              const hasCodePrompt = afterEmailContent.toLowerCase().includes('code') || afterEmailContent.toLowerCase().includes('verification code');
              const isErrorPage = afterEmailContent.toLowerCase().includes('errorcontainer') || afterEmailUrl.includes('error');
              
              logger.info('Page state after email verification (Enter key)', {
                url: afterEmailUrl,
                contentSnippet: afterEmailContent.substring(0, 300),
                hasPasswordField: afterEmailContent.toLowerCase().includes('password'),
                hasCodeField: hasCodePrompt,
                isErrorPage,
              });
              
              // If X.com is asking for verification code, we can't proceed
              if (hasCodePrompt && !afterEmailContent.toLowerCase().includes('password')) {
                logger.warn('X.com requesting email verification code - cannot proceed programmatically');
                throw new Error(`X.com requires email verification code sent to ${email} - This cannot be automated. Please manually log in once to establish trust.`);
              }
            }
          } else {
            logger.warn('Email input field not found, cannot handle email verification');
            throw new Error('Email verification required but email input field not found');
          }
        } catch (emailError) {
          logger.error('Failed to handle email verification', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          });
          throw new Error(`Email verification required but failed: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
        }
      } else if (hasUnusualActivity || hasVerifyIdentity || hasPhoneNumber || hasCaptcha || hasChallengeUrl) {
        // These challenges cannot be handled programmatically
        const challengeType = hasCaptcha ? 'captcha' :
                             hasPhoneNumber ? 'phone verification' :
                             hasUnusualActivity ? 'unusual activity check' :
                             hasVerifyIdentity ? 'identity verification' :
                             'unknown challenge';
        
        logger.error('X.com login challenge detected (cannot be handled automatically)', {
          url: pageUrl,
          challengeType,
          hasUnusualActivity,
          hasCaptcha,
          hasPhoneNumber,
          pageTitle: await page.title().catch(() => 'unknown'),
        });
        throw new Error(`X.com login challenge detected (${challengeType}) - X.com requires manual verification. This is common with automated logins. Consider: 1) Using a residential proxy, 2) Manually logging in once to establish trust, or 3) Using a different account.`);
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
        contentSnippet: finalContent.substring(0, 500),
        hasPasswordField: finalContent.toLowerCase().includes('password'),
        hasCodeField: finalContent.toLowerCase().includes('code') || finalContent.toLowerCase().includes('verification code'),
        hasEmailPrompt: finalContent.toLowerCase().includes('email'),
        hasPhonePrompt: finalContent.toLowerCase().includes('phone'),
      });
      
      // Check for challenge indicators in error case
      // Try email verification if we haven't already (X.com might show email/phone option)
      const hasEmailPrompt = finalContent.toLowerCase().includes('email') || 
                            finalContent.toLowerCase().includes('enter your email');
      const hasPhonePrompt = finalContent.toLowerCase().includes('phone');
      const hasCaptchaChallenge = finalContent.toLowerCase().includes('captcha') || 
                                 finalContent.toLowerCase().includes('verify you\'re not a bot');
      const hasUnusualActivityChallenge = finalContent.toLowerCase().includes('unusual activity');
      
      // Try email verification if email/phone prompt detected (before giving up)
      let emailVerificationHandled = false;
      if ((hasEmailPrompt || hasPhonePrompt) && !hasCaptchaChallenge && !hasUnusualActivityChallenge) {
        logger.info('Email/phone verification prompt detected in error path - attempting email verification');
        try {
          const emailInput = page.locator('input[type="email"], input[name="text"], input[autocomplete="email"], input[autocomplete="username"]').first();
          const emailInputExists = await emailInput.count() > 0;
          
          if (emailInputExists) {
            logger.info('Email input field found, entering email address');
            await emailInput.waitFor({ state: 'visible', timeout: 10000 });
            await emailInput.fill(email, { timeout: 5000 });
            await page.waitForTimeout(1000);
            
            const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
            const nextButtonExists = await nextButton.count() > 0;
            
            if (nextButtonExists) {
              await nextButton.click({ timeout: 5000 });
              await page.waitForTimeout(3000);
              logger.info('Email verification submitted, retrying password field detection');
            } else {
              await emailInput.press('Enter');
              await page.waitForTimeout(3000);
              logger.info('Email verification submitted (Enter key), retrying password field detection');
            }
            
            // Check what's on the page after email verification
            const retryUrl = page.url();
            const retryContent = await page.textContent('body').catch(() => '') || '';
            logger.info('Page state after email verification retry', {
              url: retryUrl,
              contentSnippet: retryContent.substring(0, 300),
              hasPasswordField: retryContent.toLowerCase().includes('password'),
              hasCodeField: retryContent.toLowerCase().includes('code') || retryContent.toLowerCase().includes('verification code'),
            });
            
            // Retry password field detection after email verification
            try {
              await page.waitForSelector('input[name="password"]', { timeout: 15000, state: 'visible' });
              logger.info('Password field found after email verification');
              emailVerificationHandled = true;
            } catch {
              try {
                await page.waitForSelector('input[type="password"]', { timeout: 5000, state: 'visible' });
                logger.info('Password field found after email verification (alternative selector)');
                emailVerificationHandled = true;
              } catch {
                logger.warn('Password field still not found after email verification', {
                  pageUrl: retryUrl,
                  hasCodePrompt: retryContent.toLowerCase().includes('code') || retryContent.toLowerCase().includes('verification code'),
                });
              }
            }
          }
        } catch (emailError) {
          logger.error('Failed to handle email verification in error path', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
      
      // Only throw error if email verification didn't succeed
      if (!emailVerificationHandled) {
        const hasChallenge = hasUnusualActivityChallenge || hasCaptchaChallenge;
        const hasCodePrompt = finalContent.toLowerCase().includes('code') || finalContent.toLowerCase().includes('verification code');
        const isErrorPage = finalContent.toLowerCase().includes('errorcontainer') || finalUrl.includes('error');
        
        // Check if X.com is asking for email verification code
        if (hasCodePrompt && !hasChallenge) {
          logger.error('X.com email verification code required', {
            url: finalUrl,
            contentSnippet: finalContent.substring(0, 500),
          });
          throw new Error(`X.com requires email verification code - After entering email, X.com sent a verification code to ${email} which cannot be retrieved programmatically. Please: 1) Manually log in once to establish trust, 2) Use a different account that doesn't require email verification, or 3) Check if X.com account settings allow disabling email verification.`);
        }
        
        if (hasChallenge) {
          const challengeType = hasCaptchaChallenge ? 'captcha' :
                               hasUnusualActivityChallenge ? 'unusual activity check' :
                               'verification challenge';
          
          logger.error('X.com login challenge detected (password field not found)', {
            url: finalUrl,
            challengeType,
            contentSnippet: finalContent.substring(0, 500),
          });
          throw new Error(`X.com login challenge detected (${challengeType}) - X.com requires manual verification. This is common with automated logins. Consider: 1) Using a residential proxy, 2) Manually logging in once to establish trust, or 3) Using a different account.`);
        }
        
        if (isErrorPage) {
          logger.error('X.com error page detected', {
            url: finalUrl,
            contentSnippet: finalContent.substring(0, 500),
          });
          throw new Error(`X.com showed an error page after email verification - This may indicate the email address is incorrect, X.com detected automated behavior, or additional verification is required. Please verify: 1) The email address (${email}) is correct, 2) Try manually logging in to see what X.com requires, 3) Consider using a different account.`);
        }
        
        throw new Error(`Password input not found. Page URL: ${finalUrl} - X.com may be requiring additional verification steps that cannot be automated.`);
      }
      // If emailVerificationHandled is true, execution continues to password entry code below
    }

    // Enter password
    logger.info('Entering password');
    const passwordInput = await page.locator('input[name="password"]');
    await passwordInput.fill(password, { timeout: 5000 });
    
    // Wait for form to validate
    await page.waitForTimeout(1000);
    
    // Try clicking login button with fallback to Enter key
    // Note: X.com uses type="button" not type="submit" for login button
    logger.info('Clicking Log in button');
    const loginButton = page.locator('button:has-text("Log in")');
    
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
      const hasChallenge = errorText?.toLowerCase().includes('unusual activity') ||
                          errorText?.toLowerCase().includes('verify') ||
                          errorText?.toLowerCase().includes('captcha') ||
                          errorText?.toLowerCase().includes('verify you\'re not a bot');
      
      if (hasChallenge) {
        const challengeType = errorText?.toLowerCase().includes('captcha') || errorText?.toLowerCase().includes('verify you\'re not a bot') ? 'captcha' :
                             errorText?.toLowerCase().includes('unusual activity') ? 'unusual activity check' :
                             'verification challenge';
        throw new Error(`X.com login challenge detected (${challengeType}) - X.com requires manual verification. This is common with automated logins. Consider: 1) Using a residential proxy, 2) Manually logging in once to establish trust, or 3) Using a different account.`);
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
