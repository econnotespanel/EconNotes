const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static server for ./dist
const distDir = path.join(__dirname, '..', 'dist');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }
  const filePath = path.join(distDir, reqPath);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
  }
});

server.listen(4173, async () => {
  console.log('Preview server running on http://localhost:4173');
  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
    
    // Screenshot full page
    const screenshotPath = 'C:\\Users\\Kaan Çolakoğlu\\.gemini\\antigravity\\brain\\8f0db737-00b8-444c-b568-4d7f2f1ad397\\maintenance_with_emergency_notes.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log('Desktop screenshot saved to:', screenshotPath);

    // Mobile screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileScreenshotPath = 'C:\\Users\\Kaan Çolakoğlu\\.gemini\\antigravity\\brain\\8f0db737-00b8-444c-b568-4d7f2f1ad397\\maintenance_mobile_with_notes.png';
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log('Mobile screenshot saved to:', mobileScreenshotPath);

    await browser.close();
  } catch(err) {
    console.error('Playwright error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
