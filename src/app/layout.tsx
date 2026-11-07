import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaSetup } from "@/components/pwa/install";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "KindChat — A quieter place for two", template: "%s · KindChat" },
  description: "KindChat is a private messaging space for couples. Just the two of you, in real time, kept safe.",
  applicationName: "KindChat",
  // iPhone/iPad "Add to Home Screen": full-screen app with its own name and icon (app/apple-icon.png).
  appleWebApp: { capable: true, title: "KindChat", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#16151a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaSetup />
        </ThemeProvider>
      </body>
    </html>
  );
}
