import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SAVI',
  description: 'Smart Assistant for Valuable Ideas. Ask. Create. Organise.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
