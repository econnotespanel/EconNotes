const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

async function generate() {
  const eMarkBase64 = fs.readFileSync('public/econnotes-e-mark.png').toString('base64');
  const browser = await chromium.launch({ channel: 'msedge' });

  const artifactDir = 'C:/Users/Kaan Çolakoğlu/.gemini/antigravity/brain/8f0db737-00b8-444c-b568-4d7f2f1ad397';
  const publicDir = 'public';
  const downloadsDir = 'C:/Users/Kaan Çolakoğlu/Downloads';

  const baseCss = `
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; }
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
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 900px;
      height: 900px;
      background: radial-gradient(circle, rgba(0, 240, 255, 0.28) 0%, rgba(0, 112, 209, 0.15) 35%, rgba(0, 0, 0, 0) 65%);
      pointer-events: none;
    }
    .center-container {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .badge-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-disc {
      width: 210px;
      height: 210px;
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 100%);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 3px solid rgba(255, 255, 255, 0.4);
      box-shadow: 
        0 24px 60px rgba(0, 20, 70, 0.6),
        0 0 50px rgba(0, 240, 255, 0.4),
        inset 0 2px 4px rgba(255, 255, 255, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .icon-disc::after {
      content: '';
      position: absolute;
      inset: -12px;
      border-radius: 50%;
      border: 2px dashed rgba(255, 255, 255, 0.35);
      pointer-events: none;
    }
    .tools-svg {
      width: 155px;
      height: 155px;
      filter: drop-shadow(0 8px 20px rgba(0, 15, 50, 0.65));
    }
    .check-badge {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border: 4px solid #ffffff;
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.7), 0 0 28px rgba(16, 185, 129, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .check-svg {
      width: 30px;
      height: 30px;
      stroke: #ffffff;
      stroke-width: 4.5;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 10px 30px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1.5px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 10px 30px rgba(0, 20, 70, 0.45);
    }
    .pulse-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 12px #10b981, 0 0 24px #10b981;
    }
    .status-text {
      color: #ffffff;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    .status-sub {
      color: rgba(255, 255, 255, 0.92);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.6px;
      margin-top: -8px;
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
    }
  `;

  // Refined, high-visibility crossed hammer and screwdriver
  const toolsSvg = `
    <svg class="tools-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Chrome/Silver Shaft -->
        <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#E2E8F0" />
          <stop offset="35%" stop-color="#FFFFFF" />
          <stop offset="70%" stop-color="#CBD5E1" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>
        <!-- Blue Screwdriver Handle -->
        <linearGradient id="scGrip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="30%" stop-color="#BAE6FD" />
          <stop offset="70%" stop-color="#0284C7" />
          <stop offset="100%" stop-color="#0369A1" />
        </linearGradient>
        <!-- Steel Hammer Head -->
        <linearGradient id="hmSteel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="35%" stop-color="#F1F5F9" />
          <stop offset="75%" stop-color="#94A3B8" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
        <!-- Hammer Handle Wood/Rubber -->
        <linearGradient id="woodHandle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#FDE68A" />
          <stop offset="40%" stop-color="#FFFBEB" />
          <stop offset="80%" stop-color="#F59E0B" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>
        <linearGradient id="blackGrip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#334155" />
          <stop offset="40%" stop-color="#64748B" />
          <stop offset="100%" stop-color="#0F172A" />
        </linearGradient>
        <filter id="toolShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#00153a" flood-opacity="0.75"/>
        </filter>
      </defs>

      <!-- 1. SCREWDRIVER (Rotated 45deg: lower-left to upper-right) -->
      <g transform="rotate(45 50 50)" filter="url(#toolShadow)">
        <!-- Tip -->
        <path d="M47 8 L53 8 L52 18 L48 18 Z" fill="#FFFFFF" stroke="#64748B" stroke-width="0.5" />
        <!-- Shaft -->
        <rect x="48" y="18" width="4" height="38" rx="2" fill="url(#chrome)" stroke="#FFFFFF" stroke-width="0.5" />
        <!-- Bolster -->
        <rect x="46" y="55" width="8" height="5" rx="1.5" fill="#94A3B8" stroke="#FFFFFF" stroke-width="0.8" />
        <!-- Handle -->
        <path d="M44 60 C42 64, 41 74, 42 84 C43 92, 46.5 98, 50 98 C53.5 98, 57 92, 58 84 C59 74, 58 64, 56 60 Z" fill="url(#scGrip)" stroke="#FFFFFF" stroke-width="1.2" />
        <!-- Ergonomic Grip Grooves -->
        <rect x="46" y="68" width="8" height="2.5" rx="1.2" fill="#FFFFFF" opacity="0.9" />
        <rect x="45.5" y="76" width="9" height="2.5" rx="1.2" fill="#FFFFFF" opacity="0.9" />
        <rect x="46" y="84" width="8" height="2.5" rx="1.2" fill="#FFFFFF" opacity="0.9" />
      </g>

      <!-- 2. HAMMER (Rotated -45deg: lower-right to upper-left) -->
      <g transform="rotate(-45 50 50)" filter="url(#toolShadow)">
        <!-- Handle -->
        <path d="M47 30 L46 95 C46 98, 54 98, 54 95 L53 30 Z" fill="url(#woodHandle)" stroke="#CBD5E1" stroke-width="1" />
        <!-- Ergonomic Handle Grip -->
        <path d="M45.5 68 L45 96 C45 99, 55 99, 55 96 L54.5 68 Z" fill="url(#blackGrip)" stroke="#FFFFFF" stroke-width="0.8" />
        <line x1="46" y1="75" x2="54" y2="75" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
        <line x1="46" y1="83" x2="54" y2="83" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />
        <line x1="46" y1="91" x2="54" y2="91" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.8" />

        <!-- Hammer Head -->
        <!-- Center socket -->
        <rect x="43" y="18" width="14" height="13" rx="2.5" fill="#334155" stroke="#FFFFFF" stroke-width="1" />
        <rect x="47" y="16" width="6" height="3" rx="1" fill="#CBD5E1" />

        <!-- Face / Striking Head (Right side) -->
        <path d="M57 19 L75 17 C77 17, 78 18, 78 20 L78 29 C78 31, 77 32, 75 32 L57 30 Z" fill="url(#hmSteel)" stroke="#FFFFFF" stroke-width="1" />
        <rect x="76.5" y="17" width="3" height="15" rx="1.5" fill="#FFFFFF" opacity="0.9" />

        <!-- Curved Claw (Left side) -->
        <path d="M43 20 C32 19, 21 24, 13 34 C12 35.5, 13 37, 14.5 37 C22 33, 32 30, 43 29 Z" fill="url(#hmSteel)" stroke="#FFFFFF" stroke-width="1" />
      </g>
    </svg>
  `;

  // 1. FULL BANNER (Disc + Tools + Verified Check + Pill + Subtitle)
  const page1 = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await page1.setContent(`
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><style>${baseCss}</style></head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
          <div class="center-container">
            <div class="badge-wrapper">
              <div class="icon-disc">
                ${toolsSvg}
              </div>
              <div class="check-badge">
                <svg class="check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
            <div class="status-pill">
              <span class="pulse-dot"></span>
              <span class="status-text">Sorunlar Giderildi</span>
            </div>
            <p class="status-sub">Sistem Bakımı Tamamlandı • Tüm Özellikler Aktif</p>
          </div>
        </div>
      </body>
    </html>
  `);

  await page1.screenshot({ path: path.join(publicDir, 'econnotes-x-banner-fixed.png'), type: 'png' });
  await page1.screenshot({ path: path.join(artifactDir, 'econnotes-x-banner-fixed.png'), type: 'png' });
  await page1.screenshot({ path: path.join(downloadsDir, 'EconNotes-X-Banner-Sorunlar-Giderildi.png'), type: 'png' });

  // 2. ICON ONLY (Larger disc + Tools + Verified Check, perfectly centered)
  const page2 = await browser.newPage({ viewport: { width: 1500, height: 500 } });
  await page2.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${baseCss}
          .icon-disc {
            width: 240px;
            height: 240px;
          }
          .tools-svg {
            width: 175px;
            height: 175px;
          }
          .check-badge {
            width: 66px;
            height: 66px;
            bottom: 6px;
            right: 6px;
            border-width: 4.5px;
          }
          .check-svg {
            width: 34px;
            height: 34px;
          }
        </style>
      </head>
      <body>
        <div class="banner">
          <div class="pattern"></div>
          <div class="ambient-glow"></div>
          <div class="center-container">
            <div class="badge-wrapper">
              <div class="icon-disc">
                ${toolsSvg}
              </div>
              <div class="check-badge">
                <svg class="check-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page2.screenshot({ path: path.join(publicDir, 'econnotes-x-banner-fixed-icon-only.png'), type: 'png' });
  await page2.screenshot({ path: path.join(artifactDir, 'econnotes-x-banner-fixed-icon-only.png'), type: 'png' });
  await page2.screenshot({ path: path.join(downloadsDir, 'EconNotes-X-Banner-Sorunlar-Giderildi-Sadece-Simge.png'), type: 'png' });

  await browser.close();
  console.log('Updated banners generated successfully!');
}

generate().catch(console.error);
