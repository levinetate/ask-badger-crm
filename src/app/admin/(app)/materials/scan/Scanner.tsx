"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { IScannerControls } from "@zxing/browser";
import { lookupBarcode, quickMove, type ScanResult } from "../actions";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [onHand, setOnHand] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [pending, start] = useTransition();
  const lastCode = useRef<{ code: string; at: number } | null>(null);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  const handleCode = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastCode.current && lastCode.current.code === code && now - lastCode.current.at < 3000) return;
      lastCode.current = { code, at: now };
      if (navigator.vibrate) navigator.vibrate(80);
      stopCamera();
      start(async () => {
        const r = await lookupBarcode(code);
        setResult(r);
        setOnHand(r.kind === "known" ? r.material.onHand : null);
        setQty("1");
      });
    },
    [stopCamera],
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setResult(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("The camera needs the site to be opened over https. You can type the number below instead.");
      return;
    }
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setCameraOn(true);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (res) => {
          if (res) handleCode(res.getText());
        },
      );
    } catch (e) {
      setCameraOn(false);
      setCameraError(e instanceof Error && e.name === "NotAllowedError"
        ? "Camera permission was blocked. Allow it in your browser settings, or type the number below."
        : "Couldn't start the camera. You can type the number below instead.");
    }
  }, [handleCode]);

  useEffect(() => stopCamera, [stopCamera]);

  const move = (reason: "PURCHASE" | "USED") => {
    if (result?.kind !== "known") return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    start(async () => setOnHand(await quickMove(result.material.id, reason, n)));
  };

  const prefill = (r: ScanResult) => {
    const p = new URLSearchParams({ barcode: r.barcode });
    if (r.kind === "found") {
      p.set("name", r.product.name);
      if (r.product.category) p.set("category", r.product.category);
      const sp = r.product.storePrices[0];
      if (sp) { p.set("store", sp.store); p.set("cost", (sp.priceCents / 100).toFixed(2)); }
    }
    return `/admin/materials/new?${p}`;
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className={`relative overflow-hidden rounded-md bg-black ${cameraOn ? "" : "hidden"}`}>
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
        {cameraOn ? (
          <button className="btn-secondary w-full" onClick={stopCamera}>Stop camera</button>
        ) : (
          <button className="btn-primary w-full" onClick={startCamera}>{result ? "Scan another" : "Start camera"}</button>
        )}
        {cameraError && <p className="text-sm text-red-700">{cameraError}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { lastCode.current = null; handleCode(manual.trim()); setManual(""); } }}
        >
          <input className="input" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or type / use a handheld scanner" aria-label="Barcode number" />
          <button className="btn-secondary">Look up</button>
        </form>
      </div>

      {pending && !result && <p className="text-sm text-stone-600">Looking up…</p>}

      {result?.kind === "known" && (
        <div className="card space-y-3">
          <div className="text-xs text-stone-500">In your materials · {result.barcode}</div>
          <Link href={`/admin/materials/${result.material.id}`} className="link text-lg font-medium">{result.material.name}</Link>
          <div className="text-sm">On hand: <strong>{onHand}</strong> {result.material.unit}</div>
          <div className="flex items-center gap-2">
            <input className="input w-24" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
            <button className="btn-primary" disabled={pending} onClick={() => move("PURCHASE")}>+ Bought</button>
            <button className="btn-secondary" disabled={pending} onClick={() => move("USED")}>− Used</button>
          </div>
        </div>
      )}

      {result?.kind === "found" && (
        <div className="card space-y-3">
          <div className="text-xs text-stone-500">New item · {result.barcode}</div>
          <div className="text-lg font-medium">{result.product.name}</div>
          {result.product.brand && <div className="text-sm text-stone-600">{result.product.brand}</div>}
          {result.product.storePrices.length > 0 ? (
            <ul className="text-sm">
              {result.product.storePrices.map((p) => (
                <li key={p.store + p.priceCents}>{p.store}: {money(p.priceCents)} <span className="text-xs text-stone-500">(listed price, check your Pro price)</span></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">No Home Depot or Lowe&apos;s price found. Enter your cost when you add it.</p>
          )}
          <Link href={prefill(result)} className="btn-primary">Add to materials</Link>
        </div>
      )}

      {result?.kind === "unknown" && (
        <div className="card space-y-3">
          <div className="text-sm">No product found for <strong>{result.barcode}</strong>.</div>
          <Link href={prefill(result)} className="btn-primary">Add it by hand</Link>
        </div>
      )}
    </div>
  );
}
