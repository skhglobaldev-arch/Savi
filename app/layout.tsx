import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SAVI by SKH.GLOBAL',
  description: 'Smart Assistant for Valuable Ideas. Ask. Create. Organise.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
