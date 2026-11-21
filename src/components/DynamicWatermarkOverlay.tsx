import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { WatermarkIdentity } from '@/lib/watermarkIdentity';

interface DynamicWatermarkOverlayProps {
  identity: WatermarkIdentity | null | undefined;
  /** Light surface (white PDF pages / slides) vs dark surface (slate backdrop) */
  tone?: 'on-light' | 'on-dark';
  /** Optional page/slide tag for additional traceability */
  className?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates an inline SVG data-URI representing a crisp, low-opacity repeating diagonal
 * user-specific forensic watermark tile. Uses pointer-events-none so text reading, scrolling,
 * zooming, and normal UI interactions are never obstructed.
 */
export function buildDiagonalWatermarkSvgDataUri(
  identity: WatermarkIdentity,
  tone: 'on-light' | 'on-dark' = 'on-light',
): string {
  const line1 = escapeXml(`EconNotes • ${identity.displayLabel}`);
  const line2 = escapeXml(`${identity.timestampLabel} • ${identity.accountCode}`);

  const fillPrimary = tone === 'on-light' ? '#0f172a' : '#e2e8f0';
  const fillSecondary = tone === 'on-light' ? '#1e3a8a' : '#7dd3fc';
  const opacityPrimary = tone === 'on-light' ? '0.13' : '0.12';
  const opacitySecondary = tone === 'on-light' ? '0.11' : '0.10';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="210" viewBox="0 0 320 210">
  <g transform="translate(160 105) rotate(-28)">
    <text x="0" y="-8" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="0.4" fill="${fillPrimary}" fill-opacity="${opacityPrimary}">${line1}</text>
    <text x="0" y="11" text-anchor="middle" font-family="Inter, Arial, monospace" font-size="10.5" font-weight="600" letter-spacing="0.3" fill="${fillSecondary}" fill-opacity="${opacitySecondary}">${line2}</text>
  </g>
</svg>`;

  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/**
 * Visual repeating diagonal watermark overlay layer applied across every preview page,
 * image, PowerPoint slide, and PDF viewport. Never mutates original files and never blocks
 * scrolling, zooming, or normal interaction.
 */
export const DynamicWatermarkOverlay: React.FC<DynamicWatermarkOverlayProps> = ({
  identity,
  tone = 'on-light',
  className,
}) => {
  const backgroundImage = useMemo(() => {
    if (!identity) return '';
    return buildDiagonalWatermarkSvgDataUri(identity, tone);
  }, [identity, tone]);

  if (!identity || !backgroundImage) return null;

  return (
    <div
      aria-hidden="true"
      data-econnotes-dynamic-watermark="true"
      style={{
        backgroundImage,
        backgroundRepeat: 'repeat',
        backgroundPosition: 'center',
        backgroundSize: '320px 210px',
      }}
      className={cn(
        'pointer-events-none absolute inset-0 z-20 select-none overflow-hidden',
        className,
      )}
    />
  );
};

export default DynamicWatermarkOverlay;
