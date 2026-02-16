import type { Metadata } from "next";
import { Pixelify_Sans, Silkscreen } from "next/font/google";
import "./globals.css";

const pixelifySans = Pixelify_Sans({
  variable: "--font-pixelify-sans",
  subsets: ["latin"],
  weight: "variable",
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "MoltScore",
  description: "The Credit Layer for Autonomous Agents. MoltScore ranks onchain AI agents across the Molt ecosystem.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${pixelifySans.variable} ${silkscreen.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('moltscore-theme');if(t==='light')document.documentElement.classList.remove('dark');else if(t==='dark'||!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');})();`,
          }}
        />
      </head>
      <body className={`${pixelifySans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
