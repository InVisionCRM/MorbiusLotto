import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { Jost, Poppins } from 'next/font/google'
import BrandingPageClient from './BrandingPageClient'

const jost = Jost({ subsets: ['latin'], weight: ['600', '700'] })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'Brand Kit — Morbius',
}

const IMAGE_EXT = /\.(png|jpe?g|webp|svg|gif)$/i

const MORBIUS_BANNER_FILE = '1a32b550-8024-492b-b3d7-c6242202b5a3.png'

function listImageFiles(...segments: string[]): string[] {
  const dir = path.join(process.cwd(), 'public', ...segments)
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (d) =>
          d.isFile() &&
          !d.name.startsWith('._') &&
          IMAGE_EXT.test(d.name),
      )
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

export default function BrandingPage() {
  const bannerDir = path.join(process.cwd(), 'public', 'Morbius Banners')
  const bannerPath = path.join(bannerDir, MORBIUS_BANNER_FILE)
  const bannerAsset = fs.existsSync(bannerPath)
    ? { fileName: MORBIUS_BANNER_FILE, displayName: 'Morbius Banner' }
    : null

  const tableFiles = listImageFiles('BlackJack', 'BrandedTable').filter(
    (f) => !f.toLowerCase().endsWith('.webp'),
  )

  return (
    <BrandingPageClient
      titleFontClassName={jost.className}
      nameFontClassName={poppins.className}
      bannerAsset={bannerAsset}
      tableFiles={tableFiles}
    />
  )
}
