"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * Renders the permit's opaque token as a scannable QR. It is a client component
 * only because qrcode.react ships a browser component; the value it encodes is the
 * token the server handed down, and it carries no visitor identity (PRD §9).
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={2}
      fgColor="#0f172a"
      bgColor="#ffffff"
    />
  );
}
