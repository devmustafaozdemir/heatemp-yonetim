import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Heatemp Yönetim", template: "%s · Heatemp Yönetim" },
  description: "Heatemp üretim, stok ve Mekonsis satış yönetimi",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
