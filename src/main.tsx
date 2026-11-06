import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./index.css";
import { initOneSignal } from "./lib/onesignal";

createRoot(document.getElementById("root")!).render(<App />);

// Initialize OneSignal Web Push for Mobile & Desktop
initOneSignal();

// Register Service Worker for PWA and Mobile Push Notifications
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register('/OneSignalSDKWorker.js').catch((err) => {
      console.warn('EconNotes Service Worker kaydı yapılamadı:', err);
    });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker);
  }
}

