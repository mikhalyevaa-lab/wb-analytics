import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Редизайн Steep (Ф0): шрифты подключены, но пока нигде не применяются —
// заменят Geist постранично на следующих этапах
const sourceSerif4 = Source_Serif_4({
  variable: "--font-source-serif-4",
  subsets: ["latin", "cyrillic-ext"],
  weight: ["400", "500"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin", "cyrillic-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WB Analytics",
  description: "Аналитика для магазинов Wildberries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif4.variable} ${hankenGrotesk.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Применяем тему ДО гидратации — иначе будет вспышка неверной темы (Ф5).
            Обычный inline-script вместо next/script: тут важна гарантированно
            синхронная отработка при парсинге HTML, до бутстрапа React/Next рантайма. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('wb-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
