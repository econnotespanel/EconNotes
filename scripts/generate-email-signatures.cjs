const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

async function generate() {
  const eMarkBase64 = fs.readFileSync('public/econnotes-e-mark.png').toString('base64');
  const brandLogoBase64 = fs.readFileSync('src/assets/econnotes-brand-light.png').toString('base64');

  const browser = await chromium.launch({ channel: 'msedge' });

  const artifactDir = 'C:/Users/Kaan Çolakoğlu/.gemini/antigravity/brain/8f0db737-00b8-444c-b568-4d7f2f1ad397';
  const publicDir = 'public';
  const downloadsDir = 'C:/Users/Kaan Çolakoğlu/Downloads';

  // 1. Classical Banner Style (Matches uploaded image, 1200x280 retina for 600x140 display)
  const page1 = await browser.newPage({ viewport: { width: 1200, height: 280 } });
  await page1.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; }
          body, html { width: 1200px; height: 280px; overflow: hidden; background: transparent; }
          .banner {
            width: 1200px;
            height: 280px;
            position: relative;
            background: linear-gradient(135deg, #002d7a 0%, #003791 40%, #005bbd 80%, #0070d1 100%);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 90px;
            overflow: hidden;
            border-radius: 20px;
            box-shadow: 0 12px 35px rgba(0, 30, 80, 0.35);
          }
          .pattern {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            background-image: url('data:image/png;base64,${eMarkBase64}');
            background-repeat: repeat;
            background-size: 42px 42px;
            background-position: center;
            filter: brightness(0) invert(1);
            opacity: 0.07;
          }
          .ambient-glow {
            position: absolute;
            top: -60px;
            right: 80px;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(0,240,255,0.12) 30%, rgba(0,0,0,0) 70%);
            pointer-events: none;
          }
          .brand-box {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 12px;
          }
          .logo-img {
            height: 62px;
            filter: brightness(0) invert(1);
            object-fit: contain;
          }
          .tagline {
            color: rgba(255, 255, 255, 0.95);
            font-size: 21px;
            font-weight: 500;
            letter-spacing: 0.3px;
            text-shadow: 0 2px 6px rgba(0, 20, 60, 0.4);
          }
          .badge {
            background: rgba(255, 255, 255, 0.16);
            backdrop-filter: blur(8px);
            border: 1.5px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            padding: 6px 20px;
            border-radius: 999px;
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.6px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
          <div class="brand-box">
            <img class="logo-img" src="data:image/png;base64,${brandLogoBase64}" alt="EconNotes" />
            <p class="tagline">Yeni nesil not paylaşım ve çalışma platformu.</p>
            <div class="badge">econnotes.online</div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page1.screenshot({ path: path.join(publicDir, 'econnotes-email-signature-banner.png'), type: 'png' });
  await page1.screenshot({ path: path.join(artifactDir, 'econnotes-email-signature-banner.png'), type: 'png' });
  await page1.screenshot({ path: path.join(downloadsDir, 'EconNotes-Mail-Imzasi-Klasik.png'), type: 'png' });

  // 2. Balanced Split Layout (Logo on left, Details on right - Best for professional email signatures)
  const page2 = await browser.newPage({ viewport: { width: 1200, height: 280 } });
  await page2.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; }
          body, html { width: 1200px; height: 280px; overflow: hidden; background: transparent; }
          .banner {
            width: 1200px;
            height: 280px;
            position: relative;
            background: linear-gradient(135deg, #002266 0%, #003791 45%, #005bbd 80%, #0070d1 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 70px;
            overflow: hidden;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 12px 35px rgba(0, 30, 80, 0.35);
          }
          .pattern {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            background-image: url('data:image/png;base64,${eMarkBase64}');
            background-repeat: repeat;
            background-size: 42px 42px;
            background-position: center;
            filter: brightness(0) invert(1);
            opacity: 0.07;
          }
          .ambient-glow {
            position: absolute;
            top: -80px;
            left: 200px;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(0, 240, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 35%, rgba(0,0,0,0) 70%);
            pointer-events: none;
          }
          .left-col {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .logo-img {
            height: 64px;
            filter: brightness(0) invert(1);
            object-fit: contain;
          }
          .subtitle {
            color: rgba(255, 255, 255, 0.8);
            font-size: 15px;
            font-weight: 500;
            letter-spacing: 0.5px;
          }
          .divider {
            width: 1.5px;
            height: 140px;
            background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%);
            position: relative;
            z-index: 10;
          }
          .right-col {
            position: relative;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
            max-width: 580px;
          }
          .tagline {
            color: #ffffff;
            font-size: 22px;
            font-weight: 600;
            letter-spacing: 0.2px;
            line-height: 1.35;
          }
          .pill-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 18px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #00f0ff;
            box-shadow: 0 0 8px #00f0ff;
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
          <div class="left-col">
            <img class="logo-img" src="data:image/png;base64,${brandLogoBase64}" alt="EconNotes" />
            <span class="subtitle">Akademik Not & Paylaşım Platformu</span>
          </div>
          <div class="divider"></div>
          <div class="right-col">
            <p class="tagline">Yeni nesil not paylaşım ve çalışma platformu.</p>
            <div class="pill-row">
              <div class="pill"><span class="dot"></span> econnotes.online</div>
              <div class="pill">destek@econnotes.online</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page2.screenshot({ path: path.join(publicDir, 'econnotes-email-signature-split.png'), type: 'png' });
  await page2.screenshot({ path: path.join(artifactDir, 'econnotes-email-signature-split.png'), type: 'png' });
  await page2.screenshot({ path: path.join(downloadsDir, 'EconNotes-Mail-Imzasi-Detayli.png'), type: 'png' });

  // 3. Ultra-Clean Footer Strip (1200x200 - low height, ideal for tight signatures)
  const page3 = await browser.newPage({ viewport: { width: 1200, height: 200 } });
  await page3.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; }
          body, html { width: 1200px; height: 200px; overflow: hidden; background: transparent; }
          .banner {
            width: 1200px;
            height: 200px;
            position: relative;
            background: linear-gradient(135deg, #001e50 0%, #003791 50%, #0066d6 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 60px;
            overflow: hidden;
            border-radius: 16px;
            box-shadow: 0 8px 25px rgba(0, 20, 60, 0.3);
          }
          .pattern {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            background-image: url('data:image/png;base64,${eMarkBase64}');
            background-repeat: repeat;
            background-size: 38px 38px;
            background-position: center;
            filter: brightness(0) invert(1);
            opacity: 0.07;
          }
          .logo-img {
            height: 52px;
            filter: brightness(0) invert(1);
            object-fit: contain;
            position: relative;
            z-index: 10;
          }
          .right-box {
            position: relative;
            z-index: 10;
            display: flex;
            align-items: center;
            gap: 20px;
          }
          .tagline {
            color: rgba(255, 255, 255, 0.9);
            font-size: 17px;
            font-weight: 500;
          }
          .badge {
            background: rgba(255, 255, 255, 0.18);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            padding: 7px 18px;
            border-radius: 999px;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <img class="logo-img" src="data:image/png;base64,${brandLogoBase64}" alt="EconNotes" />
          <div class="right-box">
            <span class="tagline">Yeni nesil not paylaşım ve çalışma platformu.</span>
            <span class="badge">econnotes.online</span>
          </div>
        </div>
      </body>
    </html>
  `);

  await page3.screenshot({ path: path.join(publicDir, 'econnotes-email-signature-compact.png'), type: 'png' });
  await page3.screenshot({ path: path.join(artifactDir, 'econnotes-email-signature-compact.png'), type: 'png' });
  await page3.screenshot({ path: path.join(downloadsDir, 'EconNotes-Mail-Imzasi-Kompakt.png'), type: 'png' });

  await browser.close();
  console.log('All email signature banners generated successfully!');
}

generate().catch(console.error);
