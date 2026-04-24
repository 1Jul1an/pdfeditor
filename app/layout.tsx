import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF ZIP Merger",
  description: "Client-side ZIP to merged PDF tool"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
