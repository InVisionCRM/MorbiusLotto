import type { Metadata } from 'next';
import { Cinzel } from 'next/font/google';
import './craps.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
  weight: ['400', '500', '600', '700', '900'],
});

export const metadata: Metadata = {
  title: 'Craps — Morbius',
  description: 'High-roller craps on MORBIUS.IO',
};

export default function CrapsLayout({ children }: { children: React.ReactNode }) {
  return <div className={cinzel.variable}>{children}</div>;
}
