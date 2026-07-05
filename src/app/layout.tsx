import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '전기 출동 서비스',
  description: '전기 고장 접수 및 출동 업체 매칭 서비스',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-slate-100 text-gray-900">
        <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm">
          {children}
        </div>
      </body>
    </html>
  );
}
