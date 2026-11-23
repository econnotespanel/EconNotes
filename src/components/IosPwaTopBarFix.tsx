import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function isIosStandalonePwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  if (!isIos) return false;

  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return navStandalone || mediaStandalone;
}

/**
 * iOS 26+ Standalone PWA Top-Edge Compositor Fix.
 *
 * In iOS 26 standalone web apps, WebKit applies a native Liquid Glass progressive blur
 * (`UIScrollEdgeEffect`) across the top edge of the viewport whenever the top boundary is
 * translucent or lacks a fixed opaque anchor, blurring navigation logos and titles sitting
 * near `env(safe-area-inset-top)`.
 *
 * 1. Marks `<html data-ios-standalone="true">` so standalone safe-area clearance & fixed anchor
 *    CSS activate deterministically on iOS Home Screen web apps (without affecting Android/desktop).
 * 2. Renders a real `position: fixed; top: 0` opaque anchor confined to `env(safe-area-inset-top)`
 *    so WebKit samples a solid hard boundary instead of extending progressive blur over headers.
 * 3. Runs a lightweight 80ms compositor sync on mount & route transitions to release trapped
 *    iOS 26 WebKit scroll-edge blur layers.
 */
export default function IosPwaTopBarFix() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof document === 'undefined' || !isIosStandalonePwa()) return;

    document.documentElement.dataset.iosStandalone = 'true';

    let timer: number | undefined;
    let syncLayer: HTMLDivElement | null = null;

    const raf = window.requestAnimationFrame(() => {
      syncLayer = document.createElement('div');
      syncLayer.setAttribute('aria-hidden', 'true');
      syncLayer.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.004);pointer-events:none;transform:translateZ(0);-webkit-transform:translateZ(0);';
      document.body.appendChild(syncLayer);
      void syncLayer.offsetHeight;

      timer = window.setTimeout(() => {
        syncLayer?.remove();
        syncLayer = null;
      }, 80);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      if (timer !== undefined) window.clearTimeout(timer);
      syncLayer?.remove();
    };
  }, [pathname]);

  return <div aria-hidden="true" className="ios-pwa-top-anchor" />;
}
