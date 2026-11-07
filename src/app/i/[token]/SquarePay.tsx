"use client";

import { useEffect, useRef, useState } from "react";
import { payInvoice } from "./actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal typing for Square's Web Payments SDK (https://developer.squareup.com/docs/web-payments/overview).
declare global {
  interface Window { Square?: { payments: (appId: string, locationId: string) => any } }
}

type Props = { sdkUrl: string; applicationId: string; locationId: string; token: string; amountCents: number; customerName: string; businessName: string };
type Wallet = "CARD" | "APPLE_PAY" | "GOOGLE_PAY" | "CASH_APP" | "ACH";

function loadSdk(src: string): Promise<void> {
  if (window.Square) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("Couldn't load Square")));
    if (!existing) { s.src = src; s.async = true; document.head.appendChild(s); }
  });
}

export default function SquarePay(p: Props) {
  const amount = (p.amountCents / 100).toFixed(2);
  const card = useRef<any>(null);
  const apple = useRef<any>(null);
  const google = useRef<any>(null);
  const ach = useRef<any>(null);
  const [ready, setReady] = useState({ card: false, apple: false, google: false, cash: false, ach: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "COMPLETED" | "PENDING">(null);
  const [holder, setHolder] = useState(p.customerName);

  const submit = async (sourceId: string, wallet: Wallet, verificationToken?: string) => {
    setBusy(true);
    setError(null);
    const r = await payInvoice({ token: p.token, sourceId, wallet, verificationToken, idempotencyKey: crypto.randomUUID() });
    setBusy(false);
    if (r.ok) {
      setDone(r.status);
      setTimeout(() => window.location.reload(), 2500);
    } else setError(r.error);
  };

  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    (async () => {
      try {
        await loadSdk(p.sdkUrl);
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(p.applicationId, p.locationId);
        const request = () => payments.paymentRequest({ countryCode: "US", currencyCode: "USD", total: { amount, label: p.businessName } });

        card.current = await payments.card();
        await card.current.attach("#sq-card");
        cleanups.push(() => card.current?.destroy?.());
        setReady((r) => ({ ...r, card: true }));

        try {
          apple.current = await payments.applePay(request());
          setReady((r) => ({ ...r, apple: true }));
        } catch { /* not available on this device */ }

        try {
          google.current = await payments.googlePay(request());
          await google.current.attach("#sq-google", { buttonColor: "black", buttonSizeMode: "fill", buttonType: "long" });
          setReady((r) => ({ ...r, google: true }));
        } catch { /* not available */ }

        try {
          const cash = await payments.cashAppPay(request(), { redirectURL: window.location.href, referenceId: p.token.slice(0, 40) });
          cash.addEventListener("ontokenization", (event: any) => {
            const { tokenResult, error: err } = event.detail;
            if (err || tokenResult?.status !== "OK") { setError("Cash App Pay was cancelled or failed."); return; }
            void submit(tokenResult.token, "CASH_APP");
          });
          await cash.attach("#sq-cashapp", { shape: "semiround", width: "full" });
          setReady((r) => ({ ...r, cash: true }));
        } catch { /* not available */ }

        try {
          ach.current = await payments.ach({ redirectURI: window.location.href, transactionId: p.token.slice(0, 40) });
          ach.current.addEventListener("ontokenization", (event: any) => {
            const { tokenResult, error: err } = event.detail;
            if (err || tokenResult?.status !== "OK") { setError("The bank connection was cancelled or failed."); return; }
            void submit(tokenResult.token, "ACH");
          });
          setReady((r) => ({ ...r, ach: true }));
        } catch { /* not available */ }
      } catch {
        if (!cancelled) setError("Online payment couldn't load. Please refresh, or use another way to pay below.");
      }
    })();
    return () => { cancelled = true; cleanups.forEach((f) => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payCard = async () => {
    if (!card.current) return;
    setError(null);
    const r = await card.current.tokenize();
    if (r.status !== "OK") { setError("Please check your card details."); return; }
    let verificationToken: string | undefined;
    try {
      const payments = window.Square!.payments(p.applicationId, p.locationId);
      const v = await payments.verifyBuyer(r.token, { amount, currencyCode: "USD", intent: "CHARGE", billingContact: { givenName: holder } });
      verificationToken = v?.token;
    } catch { /* verification is optional for most US cards */ }
    await submit(r.token, "CARD", verificationToken);
  };

  const payWallet = async (ref: React.RefObject<any>, wallet: Wallet) => {
    if (!ref.current) return;
    setError(null);
    try {
      const r = await ref.current.tokenize();
      if (r.status === "OK") await submit(r.token, wallet);
    } catch { setError("That payment method was cancelled."); }
  };

  if (done) {
    return (
      <div className="card text-center">
        <p className="text-lg font-medium text-green-800">{done === "COMPLETED" ? "Payment received. Thank you!" : "Bank payment started. It usually clears in a few business days."}</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-medium">Pay ${amount}</h2>
      {ready.apple && (
        <button type="button" disabled={busy} onClick={() => payWallet(apple, "APPLE_PAY")} className="btn w-full bg-black py-3 text-white hover:bg-stone-800" aria-label="Pay with Apple Pay">
          Pay with Apple Pay
        </button>
      )}
      <div id="sq-google" className={ready.google ? "h-11 cursor-pointer" : "hidden"} onClick={() => !busy && payWallet(google, "GOOGLE_PAY")} />
      <div id="sq-cashapp" className={ready.cash ? "" : "hidden"} />
      <div className="space-y-2">
        <div className="text-sm text-stone-600">Card</div>
        <input className="input" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Name on card" aria-label="Name on card" />
        <div id="sq-card" className="min-h-[90px]" />
        <button type="button" className="btn-primary w-full" disabled={!ready.card || busy} onClick={payCard}>{busy ? "Processing…" : `Pay $${amount} by card`}</button>
      </div>
      {ready.ach && (
        <button type="button" className="btn-secondary w-full" disabled={busy}
          onClick={() => { setError(null); void ach.current.tokenize({ accountHolderName: holder, intent: "CHARGE", amount, currency: "USD" }); }}>
          Pay from bank account (ACH)
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-stone-500">Payments are processed securely by Square. We never see your card number.</p>
    </div>
  );
}
