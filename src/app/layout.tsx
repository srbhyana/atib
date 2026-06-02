import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atib — PMM Intelligence Platform",
  description:
    "Multi-agent positioning intelligence. Sales calls go in, structured PMM intelligence comes out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
