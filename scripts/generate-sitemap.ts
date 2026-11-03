import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'https://econnotes.online';

// Public content only. Auth flows, account tools and admin pages are excluded.
// Omit lastmod until an authoritative page-specific content timestamp exists.
const entries = ['/', '/about', '/install'];

const urls = entries.map((path) =>
  `  <url>\n    <loc>${BASE_URL}${path}</loc>\n  </url>`,
);

writeFileSync(resolve('public/sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls,
  '</urlset>',
  '',
].join('\n'));