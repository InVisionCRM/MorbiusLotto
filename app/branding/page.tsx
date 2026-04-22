import type { Metadata } from 'next'
import { Jost, Poppins } from 'next/font/google'
import BrandingPageClient from './BrandingPageClient'
import { BRANDED_TABLE_IMAGE_FILES } from './branded-table-files'

const jost = Jost({ subsets: ['latin'], weight: ['600', '700'] })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600'] })

export const metadata: Metadata = {
  title: 'Brand Kit — Morbius',
}

const MORBIUS_BANNER_FILE = '1a32b550-8024-492b-b3d7-c6242202b5a3.png'

export default function BrandingPage() {
  const bannerAsset = {
    fileName: MORBIUS_BANNER_FILE,
    displayName: 'Morbius Banner' as const,
  }

  return (
    <BrandingPageClient
      titleFontClassName={jost.className}
      nameFontClassName={poppins.className}
      bannerAsset={bannerAsset}
      tableFiles={BRANDED_TABLE_IMAGE_FILES}
    />
  )
}
