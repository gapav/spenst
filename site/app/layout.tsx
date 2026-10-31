import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProvider } from "@/components/app-provider";
import { ThemeAttribute } from "@/components/theme-switch";
import { themeScript } from "@/lib/theme";
import "./globals.css";

// Grep’s typeface, so the two apps read as one family.
const dmSans = localFont({ src: "../public/fonts/dm-sans-latin-variable.ttf", variable: "--font-grep", display: "swap", weight: "100 1000" });

export const metadata: Metadata = {
  title: { default: "Spenst — Testing, planning and power profiles for your team", template: "%s · Spenst" },
  description: "Test sprints, jumps and bar speed, plan the season, and follow every athlete’s power profile — for youth and senior teams.",
  applicationName: "Spenst",
  appleWebApp: { capable: true, title: "Spenst", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2e1b3d" },
    { media: "(prefers-color-scheme: dark)", color: "#16111b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-theme` is written by the script below before the first paint, so
    // the server’s <html> never matches the browser’s — hence the suppression.
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
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
