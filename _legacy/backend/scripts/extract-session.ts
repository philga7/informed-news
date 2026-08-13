/**
 * Extract X.com Session from Browser
 * 
 * This script helps you extract your X.com session for transfer to Hetzner.
 * 
 * Simplest workflow:
 *   1. Run: cd backend && npm run extract-session
 *   2. Browser will open (or connect to existing)
 *   3. Log in to X.com with phil@informedcrew.com
 *   4. Press Enter in terminal when logged in
 *   5. Session saved to backend/sessions/auth.json
 * 
 * Alternative (if you prefer using your existing browser):
 *   1. Close all Chrome/Edge windows
 *   2. Launch Chrome with: 
 *      macOS: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *      Linux: google-chrome --remote-debugging-port=9222
 *      Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *   3. Log in to X.com in that browser
 *   4. Run: npm run extract-session
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

const SESSION_DIR = path.join(process.cwd(), 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'auth.json');

/**
 * Find Chrome/Edge browser executable and get CDP endpoint
 */
async function findBrowserEndpoint(): Promise<string | null> {
  const os = process.platform;
  
  // Common Chrome/Edge executable paths
  const chromePaths = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  };

  const paths = chromePaths[os as keyof typeof chromePaths] || [];
  
  for (const chromePath of paths) {
    try {
      await fs.access(chromePath);
      return chromePath;
    } catch {
      // Path doesn't exist, try next
    }
  }

  return null;
}

/**
 * Launch Chrome/Edge with remote debugging enabled
 */
async function launchBrowserWithDebugging(): Promise<void> {
  const os = process.platform;
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const chromePaths = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  };

  const paths = chromePaths[os as keyof typeof chromePaths] || [];
  
  for (const chromePath of paths) {
    try {
      await fs.access(chromePath);
      console.log(`🚀 Launching browser with remote debugging: ${chromePath}`);
      
      // Launch browser with remote debugging
      const command = os === 'win32' 
        ? `"${chromePath}" --remote-debugging-port=9222 --user-data-dir="${path.join(process.cwd(), 'chrome-debug-profile')}"`
        : `"${chromePath}" --remote-debugging-port=9222 --user-data-dir="${path.join(process.cwd(), 'chrome-debug-profile')}"`;
      
      execAsync(command, { detached: true }).catch(() => {
        // Ignore errors - browser might already be launching
      });
      
      // Wait a moment for browser to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      return;
    } catch {
      // Path doesn't exist, try next
    }
  }

  throw new Error('Could not find Chrome or Edge browser. Please install Chrome or Edge.');
}

/**
 * Get CDP endpoint from running Chrome/Edge instance
 */
async function getCDPEndpoint(): Promise<string> {
  // Default CDP endpoint (Chrome/Edge default remote debugging port)
  const defaultEndpoint = 'http://localhost:9222';
  
  // Try to connect to default endpoint first
  try {
    const response = await fetch(`${defaultEndpoint}/json/version`);
    if (response.ok) {
      console.log('✅ Found browser with remote debugging enabled');
      return defaultEndpoint;
    }
  } catch {
    // Not available, will try to launch
  }

  // Try to launch browser with remote debugging
  console.log('🔍 No browser found with remote debugging. Launching browser...');
  await launchBrowserWithDebugging();
  
  // Wait a bit more and try again
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const response = await fetch(`${defaultEndpoint}/json/version`);
    if (response.ok) {
      console.log('✅ Browser launched with remote debugging');
      return defaultEndpoint;
    }
  } catch {
    // Still not available
  }

  throw new Error(
    'Could not connect to browser with remote debugging.\n\n' +
    'Please manually launch Chrome/Edge with remote debugging:\n' +
    '  macOS: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
    '  Linux: google-chrome --remote-debugging-port=9222\n' +
    '  Windows: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222\n\n' +
    'Then log in to X.com and run this script again.'
  );
}

async function extractSession(): Promise<void> {
  console.log('\n🔐 X.com Session Extraction Tool\n');
  console.log('This script will extract your X.com session from your browser.\n');
  console.log('Steps:');
  console.log('  1. The script will open/connect to Chrome/Edge');
  console.log('  2. Log in to X.com with phil@informedcrew.com');
  console.log('  3. The script will extract and save your session\n');

  // Ensure sessions directory exists
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });
  } catch (error) {
    console.error('❌ Failed to create sessions directory:', error);
    process.exit(1);
  }

  let browser;
  let context;

  try {
    // Try to connect to existing browser via CDP
    console.log('🔍 Looking for browser with remote debugging...');
    const endpoint = await getCDPEndpoint();
    
    console.log(`📡 Connecting to browser at ${endpoint}...`);
    browser = await chromium.connectOverCDP(endpoint);
    
    // Get the default context (first available)
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new Error('No browser contexts found. Please open a browser window.');
    }

    context = contexts[0];
    console.log(`✅ Connected to browser context (${contexts.length} context(s) available)`);

    // Get all pages in the context
    const pages = context.pages();
    console.log(`📄 Found ${pages.length} open tab(s)`);

    // Try to find X.com tab, or use the first tab
    let xcomPage = pages.find(page => {
      try {
        return page.url().includes('x.com') || page.url().includes('twitter.com');
      } catch {
        return false;
      }
    });

    if (!xcomPage && pages.length > 0) {
      xcomPage = pages[0];
      console.log(`⚠️  No X.com tab found, using first tab: ${xcomPage.url()}`);
    }

    if (!xcomPage) {
      throw new Error('No browser tabs found. Please open X.com in your browser.');
    }

    // Navigate to X.com if not already there
    const currentUrl = xcomPage.url();
    if (!currentUrl.includes('x.com') && !currentUrl.includes('twitter.com')) {
      console.log('🌐 Navigating to X.com...');
      await xcomPage.goto('https://x.com', { waitUntil: 'networkidle', timeout: 30000 });
      console.log('✅ Please log in to X.com in the browser window that opened');
      console.log('⏳ Waiting for you to log in... (press Enter when done)');
      
      // Wait for user to press Enter
      await new Promise<void>((resolve) => {
        process.stdin.once('data', () => {
          resolve();
        });
      });
    } else {
      console.log(`✅ Found X.com tab: ${currentUrl}`);
    }

    // Check if logged in
    const pageContent = await xcomPage.textContent('body').catch(() => '') || '';
    const isLoggedIn = 
      currentUrl.includes('x.com/home') ||
      currentUrl.includes('x.com/i/web') ||
      pageContent.includes('Home') ||
      pageContent.includes('Following');

    if (!isLoggedIn) {
      console.log('\n⚠️  Warning: Does not appear to be logged in to X.com');
      console.log(`Current URL: ${xcomPage.url()}`);
      console.log('\nPlease:');
      console.log('  1. Make sure you are logged in to X.com');
      console.log('  2. Navigate to https://x.com in your browser');
      console.log('  3. Run this script again\n');
      
      const answer = await new Promise<string>((resolve) => {
        console.log('Do you want to save the session anyway? (y/n)');
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (answer !== 'y' && answer !== 'yes') {
        console.log('❌ Session not saved.');
        process.exit(0);
      }
    } else {
      console.log('✅ Detected logged-in session');
    }

    // Extract and save session
    console.log('\n💾 Extracting session data...');
    await context.storageState({ path: SESSION_FILE });

    // Verify file was created
    try {
      const stats = await fs.stat(SESSION_FILE);
      console.log(`✅ Session extracted successfully!`);
      console.log(`   Location: ${SESSION_FILE}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      // Read and show cookie count
      const sessionData = JSON.parse(await fs.readFile(SESSION_FILE, 'utf-8'));
      const cookieCount = sessionData.cookies?.length || 0;
      console.log(`   Cookies: ${cookieCount}`);
      
      console.log('\n📤 Next steps:');
      console.log('   1. Transfer backend/sessions/auth.json to your Hetzner server');
      console.log('   2. Place it in ~/x-scraper/sessions/auth.json on the server');
      console.log('   3. The scraper will automatically use this session\n');
    } catch (error) {
      console.error('❌ Failed to verify session file:', error);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error extracting session:', error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && error.message.includes('remote debugging')) {
      console.log('\n💡 Alternative: Use the validate-session script instead:');
      console.log('   npm run validate-session');
      console.log('   (This opens a browser window for you to log in)\n');
    }
    
    process.exit(1);
  } finally {
    // Don't close the browser - user is still using it
    if (browser) {
      await browser.close();
    }
  }
}

// Run if called directly
extractSession().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { extractSession };
