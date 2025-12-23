import type { Metadata } from "next";
import { IBM_Plex_Sans, Sora } from "next/font/google";
import "./globals.css";
import { MeProvider } from "@/lib/me";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Zerizeha",
  description: "Приватные пространства для общения и голоса.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${plexSans.variable} ${sora.variable} antialiased`}>
        <MeProvider>{children}</MeProvider>
      </body>
    </html>
  );
}
