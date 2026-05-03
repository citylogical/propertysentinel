import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AppSidebar from "@/components/AppSidebar";
import MobileNav from "@/components/MobileNav";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://propertysentinel.io"),
  title: "Property Sentinel",
  description:
    "Know what the city knows about your property. Real-time 311 complaints, building violations, and permit history for every Chicago address.",
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const placesKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

  return (
    <ClerkProvider>
      <html lang="en">
        <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
            href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap"
            rel="stylesheet"
          />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Inter:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="antialiased">
          <AppSidebar />
          <div className="app-layout-main">
            <MobileNav apiKey={placesKey} />
            {children}
          </div>
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
