import React, { useEffect, useState, useMemo } from "react";

// ─── In-App Browser Detection & Redirect ────────────────────────────────────
// Prevents the app from opening inside LINE, Facebook, Instagram, or TikTok
// webviews which break the Web Speech API and other features.

const IN_APP_PATTERNS = [
  { name: "Line", pattern: /\bLine\b/i },
  { name: "Facebook", pattern: /FBAN|FBAV/i },
  { name: "Instagram", pattern: /Instagram/i },
  { name: "TikTok", pattern: /TikTok/i },
];

function detectInAppBrowser() {
  const ua = navigator.userAgent || "";
  for (const { name, pattern } of IN_APP_PATTERNS) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent || "");
}

export default function InAppBrowserGuard() {
  const [hasRedirected, setHasRedirected] = useState(false);
  const [copied, setCopied] = useState(false);

  const browser = useMemo(() => detectInAppBrowser(), []);
  const android = useMemo(() => isAndroid(), []);

  // LINE auto-redirect: append ?openExternalBrowser=1
  useEffect(() => {
    if (browser !== "Line") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("openExternalBrowser")) {
      url.searchParams.set("openExternalBrowser", "1");
      window.location.href = url.toString();
    }
  }, [browser]);

  // Not an in-app browser — render nothing
  if (!browser) return null;

  // LINE redirect in progress (param just got appended)
  if (browser === "Line") {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("openExternalBrowser")) return null;
    // If the param IS present we're still inside LINE (redirect didn't escape).
    // Fall through to show the overlay.
  }

  const currentUrl = window.location.href;

  // Build Android intent URL for Chrome
  const intentUrl = (() => {
    try {
      const u = new URL(currentUrl);
      return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;end`;
    } catch {
      return null;
    }
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = currentUrl;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenChrome = () => {
    if (intentUrl) {
      window.location.href = intentUrl;
      setHasRedirected(true);
    }
  };

  // ── "Safe to Close" screen after Chrome intent redirect ──
  if (hasRedirected) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-teal-100 px-6 text-center">
        {/* Green checkmark */}
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-lg">
          <svg
            className="h-14 w-14 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-emerald-800">Opened in Chrome</h1>
        <p className="mt-1 text-lg text-emerald-700">
          เปิดใน Chrome แล้ว
        </p>

        <p className="mt-4 max-w-xs text-sm text-gray-600">
          You can safely close this screen and continue in your main browser.
        </p>
        <p className="max-w-xs text-sm text-gray-500">
          คุณสามารถปิดหน้านี้และใช้งานต่อในเบราว์เซอร์หลักได้เลย
        </p>

        <button
          onClick={() => window.close()}
          className="mt-8 rounded-xl bg-emerald-600 px-8 py-3 text-lg font-semibold text-white shadow-md active:scale-95 transition-transform"
        >
          Close Window / ปิดหน้านี้
        </button>

        <p className="mt-3 max-w-xs text-xs text-gray-400">
          If the button doesn&apos;t work, please press the X or back button to close.
        </p>
        <p className="max-w-xs text-xs text-gray-400">
          หากปุ่มไม่ทำงาน โปรดกดกากบาทหรือปุ่มย้อนกลับเพื่อปิดหน้านี้
        </p>
      </div>
    );
  }

  // ── Blocking overlay — detected in-app browser ──
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white px-6 text-center">
      {/* Warning icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
        <svg
          className="h-10 w-10 text-amber-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3m0 4h.01M4.93 19h14.14c1.34 0 2.17-1.46 1.5-2.63L13.5 4.01c-.67-1.17-2.33-1.17-3 0L3.43 16.37c-.67 1.17.16 2.63 1.5 2.63z"
          />
        </svg>
      </div>

      <h1 className="text-xl font-bold text-gray-900">Open in System Browser</h1>
      <p className="mt-1 text-lg font-semibold text-gray-700">
        โปรดเปิดในเบราว์เซอร์หลัก
      </p>

      <p className="mt-4 max-w-xs text-sm text-gray-600">
        This app requires the full system browser for audio features.
      </p>
      <p className="max-w-xs text-sm text-gray-500">
        แอปนี้ต้องใช้เบราว์เซอร์หลักเพื่อเสียงที่สมบูรณ์
      </p>

      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        {/* Android: Open in Chrome button */}
        {android && intentUrl && (
          <button
            onClick={handleOpenChrome}
            className="w-full rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white shadow-md active:scale-95 transition-transform"
          >
            Open in Chrome / เปิดใน Chrome
          </button>
        )}

        {/* Copy Link button */}
        <button
          onClick={handleCopy}
          className="w-full rounded-xl bg-gray-800 px-6 py-3 text-lg font-semibold text-white shadow-md active:scale-95 transition-transform"
        >
          {copied ? "Copied! / คัดลอกแล้ว!" : "Copy Link / คัดลอกลิงก์"}
        </button>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Detected: {browser} in-app browser
      </p>
    </div>
  );
}
