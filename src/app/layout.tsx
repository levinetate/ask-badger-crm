import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ask Badger Electric",
  description: "Book electrical service online",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
