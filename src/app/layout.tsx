import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.ordstats.net"),

  title: {
    default: "ORDstats",
    template: "%s — ORDstats",
  },

  description:
    "Daily ownership analytics for the Top 100 Ordinals collections.",

  openGraph: {
    type: "website",
    url: "https://www.ordstats.net",
    siteName: "ORDstats",
    title: "ORDstats — Ordinals ownership analytics",
    description:
      "Daily ownership analytics for the Top 100 Ordinals collections.",
    images: [
      {
        url: "/ordstats-social-card.png?v=2",
        width: 1200,
        height: 630,
        alt: "ORDstats — Ordinals ownership analytics",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "ORDstats — Ordinals ownership analytics",
    description:
      "Daily ownership analytics for the Top 100 Ordinals collections.",
    images: ["/ordstats-social-card.png?v=2"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
