/**
 * Section title / subtitle styles aligned with `components/marketing/AdvertisingSection.tsx`:
 * `font-bold`, white + `from-indigo-400 to-cyan-400` gradient accents, larger than the ad page default.
 * Font: **Poppins** (same as `body` in `app/globals.css` and `font-poppins` in Tailwind).
 */
export const homeSectionTitleClass =
  'font-poppins text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight mb-3'

/** Use on a `<span>` inside the title for gradient text (or wrap full title). */
export const homeSectionTitleGradientClass =
  'bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent'

export const homeSectionSubtitleClass =
  'text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed'

/** Secondary in-section headings (e.g. card headers). */
export const homeSectionHeading2Class =
  'font-poppins text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight'
