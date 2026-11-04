const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

async function generateBanners() {
  const eMarkBase64 = fs.readFileSync('public/econnotes-e-mark.png').toString('base64');
  const brandLogoBase64 = fs.readFileSync('src/assets/econnotes-brand-light.png').toString('base64');

  const browser = await chromium.launch({ channel: 'msedge' });

  // Destination folder: public/ and artifacts folder
  const artifactDir = 'C:/Users/Kaan Çolakoğlu/.gemini/antigravity/brain/8f0db737-00b8-444c-b568-4d7f2f1ad397';
  const publicDir = 'public';
  const downloadsDir = 'C:/Users/Kaan Çolakoğlu/Downloads';

  // 1. Minimal Pattern Banner (1500x500)
  const page1 = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await page1.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, html { width: 1500px; height: 500px; overflow: hidden; background: #003791; }
          .banner {
            width: 1500px;
            height: 500px;
            position: relative;
            background: linear-gradient(180deg, #003791 0%, #004bb5 55%, #0066d6 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .pattern {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            background-image: url('data:image/png;base64,${eMarkBase64}');
            background-repeat: repeat;
            background-size: 50px 50px;
            background-position: center;
            filter: brightness(0) invert(1);
            opacity: 0.07;
          }
          .ambient-glow {
            position: absolute;
            top: -100px;
            right: 150px;
            width: 700px;
            height: 700px;
            background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%);
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
        </div>
      </body>
    </html>
  `);

  const minPath1 = path.join(publicDir, 'econnotes-x-banner-minimal.png');
  const minPathArt = path.join(artifactDir, 'econnotes-x-banner-minimal.png');
  const minPathDl = path.join(downloadsDir, 'EconNotes-X-Banner-Minimal.png');
  await page1.screenshot({ path: minPath1, type: 'png' });
  await page1.screenshot({ path: minPathArt, type: 'png' });
  await page1.screenshot({ path: minPathDl, type: 'png' });
  console.log('Saved minimal banner');

  // 2. Branded Banner (1500x500) with updated tagline
  const page2 = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await page2.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          body, html { width: 1500px; height: 500px; overflow: hidden; background: #003791; }
          .banner {
            width: 1500px;
            height: 500px;
            position: relative;
            background: linear-gradient(180deg, #003791 0%, #004bb5 55%, #0066d6 100%);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 140px;
            overflow: hidden;
          }
          .pattern {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            background-image: url('data:image/png;base64,${eMarkBase64}');
            background-repeat: repeat;
            background-size: 50px 50px;
            background-position: center;
            filter: brightness(0) invert(1);
            opacity: 0.07;
          }
          .ambient-glow {
            position: absolute;
            top: -100px;
            right: 120px;
            width: 800px;
            height: 800px;
            background: radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%);
            pointer-events: none;
          }
          .brand-box {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 14px;
          }
          .logo-img {
            height: 74px;
            filter: brightness(0) invert(1);
            object-fit: contain;
          }
          .tagline {
            color: rgba(255, 255, 255, 0.92);
            font-size: 21px;
            font-weight: 500;
            letter-spacing: 0.2px;
          }
          .badge {
            background: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: #ffffff;
            padding: 6px 16px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
          <div class="brand-box">
            <img class="logo-img" src="data:image/png;base64,${brandLogoBase64}" alt="EconNotes" />
            <div class="tagline">Yeni nesil not paylaşım ve çalışma platformu.</div>
            <div class="badge">econnotes.online</div>
          </div>
        </div>
      </body>
    </html>
  `);

  const brandPath2 = path.join(publicDir, 'econnotes-x-banner-branded.png');
  const brandPathArt = path.join(artifactDir, 'econnotes-x-banner-branded.png');
  const brandPathDl = path.join(downloadsDir, 'EconNotes-X-Banner-Branded.png');
  await page2.screenshot({ path: brandPath2, type: 'png' });
  await page2.screenshot({ path: brandPathArt, type: 'png' });
  await page2.screenshot({ path: brandPathDl, type: 'png' });
  console.log('Saved branded banner with updated tagline');

  await browser.close();
}

generateBanners().catch(console.error);
