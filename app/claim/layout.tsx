import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Claim rewards',
  description: 'Claim MORBIUS holder rewards, LP rewards, and view protocol analytics.',
}

export default function ClaimLayout({ children }: { children: ReactNode }) {
  return children
}
