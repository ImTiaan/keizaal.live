"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

type ConsentState = "granted" | "denied" | null;

const CONSENT_KEY = "keizaal_analytics_consent";

type GtagConsentUpdate = {
  ad_storage: "granted" | "denied";
  analytics_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
};

function updateGtagConsent(update: GtagConsentUpdate) {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== "function") return;
  w.gtag("consent", "update", update);
}

function readConsent(): ConsentState {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === "granted" || v === "denied") return v;
    return null;
  } catch {
    return null;
  }
}

function writeConsent(value: Exclude<ConsentState, null>) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {}
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${CONSENT_KEY}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`;
  } catch {}
}

export default function AnalyticsConsent() {
  const [consent, setConsent] = useState<ConsentState>(() => readConsent());

  const showBanner = consent === null;
  const analyticsEnabled = consent === "granted";

  useEffect(() => {
    if (consent === "granted") {
      updateGtagConsent({
        ad_storage: "denied",
        analytics_storage: "granted",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      return;
    }

    if (consent === "denied") {
      updateGtagConsent({
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
  }, [consent]);

  return (
    <>
      {analyticsEnabled ? (
        <>
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "wa954bktem");`}
          </Script>
        </>
      ) : null}

      {showBanner ? (
        <div className="fixed inset-x-0 bottom-0 z-[100] p-4">
          <div className="mx-auto max-w-3xl rounded-xl border border-zinc-800/70 bg-zinc-950/90 backdrop-blur-md px-4 py-3 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-200">
                We use analytics to understand where traffic comes from and improve the site. You can accept or decline.
              </div>
              <div className="flex items-center gap-2 sm:flex-shrink-0">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-100 transition-colors"
                  onClick={() => {
                    writeConsent("denied");
                    setConsent("denied");
                  }}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-keizaal-accent hover:opacity-90 text-sm font-semibold text-black transition-opacity"
                  onClick={() => {
                    writeConsent("granted");
                    setConsent("granted");
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
