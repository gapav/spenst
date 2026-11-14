import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProvider } from "@/components/app-provider";
import { ThemeAttribute } from "@/components/theme-switch";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Inter for everything, with tabular figures so columns of results line up;
// Inter Tight for the wordmark and page titles (decision 26).
const inter = localFont({ src: "../public/fonts/inter-latin-variable.woff2", variable: "--font-ui", display: "swap", weight: "100 900" });
const interTight = localFont({ src: "../public/fonts/inter-tight-latin-variable.woff2", variable: "--font-display", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: { default: "Röskr — Testing, planning and power profiles for your team", template: "%s · Röskr" },
  description: "Test sprints, jumps and bar speed, plan the season, and follow every athlete’s power profile — for youth and senior teams.",
  applicationName: "Röskr",
  appleWebApp: { capable: true, title: "Röskr", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e2433" },
    { media: "(prefers-color-scheme: dark)", color: "#08141c" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-theme` is written by the script below before the first paint, so
    // the server’s <html> never matches the browser’s — hence the suppression.
    <html lang="en" className={`${inter.variable} ${interTight.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeAttribute />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
