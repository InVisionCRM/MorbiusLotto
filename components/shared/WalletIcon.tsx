import Image from 'next/image'

export interface WalletIconProps {
  /** Rendered box width & height in px (image is letterboxed to fit, aspect preserved). */
  size?: number
  /** Extra classes for layout (margins, flex helpers, etc.). */
  className?: string
  /** Accessible label. Empty string (default) marks the icon decorative. */
  alt?: string
}

/**
 * Branded wallet icon — the custom glossy-wallet artwork (public/wallet-icon.png)
 * used everywhere the app shows a "wallet" glyph (nav, Connect button, deposit
 * buttons, wallet/transactions headers). Drop-in replacement for the generic
 * line icons from lucide (`Wallet`) and tabler (`IconWallet`); it takes a numeric
 * `size` instead of an icon `size`/className width so existing layouts are kept.
 *
 * `object-contain` fits the ~412×382 artwork inside a square box without
 * distortion; the artwork already has transparent margins so no bars show.
 */
export function WalletIcon({ size = 20, className = '', alt = '' }: WalletIconProps) {
  return (
    <Image
      src="/wallet-icon.png"
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      className={`inline-block shrink-0 object-contain ${className}`}
      aria-hidden={alt === '' ? true : undefined}
    />
  )
}
