import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live CCTV Operator • Meta Muse Spark & SAM 3.1",
  description:
    "Real-time motion-triggered CCTV surveillance and spatio-temporal forensic search powered by Meta Muse Spark Open and Meta SAM 3.1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#060911] text-slate-100 antialiased selection:bg-cyan-500 selection:text-black">
        <Script src="/hls.min.js" strategy="beforeInteractive" />
        <Script src="/tesseract.min.js" strategy="lazyOnload" />
        {children}
      </body>
    </html>
  );
}
