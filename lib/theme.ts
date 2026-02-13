/**
 * MORBlotto Theme System
 * 
 * Centralized theme definitions extracted from Plinko components.
 * Use these styles consistently across the app for a cohesive design.
 */

export const Theme = {
  /**
   * Grey Gradient Background
   * Used for panels, cards, and embossed surfaces
   * Source: Plinko board panel styling
   */
  greyGradient: {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
    // Alternative variant used in sidebar/panels
    sidebar: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
  },

  /**
   * Inset/Embossed Styling
   * Creates a recessed, neumorphic effect for panels and cards
   * Source: Plinko board panel styling
   */
  inset: {
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
    // Alternative lighter variant
    light: {
      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.5)',
      border: '1px inset rgba(60, 60, 60, 0.5)',
    },
  },

  /**
   * Cyan Color Palette
   * Primary accent color used throughout the app
   */
  cyan: {
    // Text colors
    text: {
      primary: 'text-cyan-400',
      secondary: 'text-cyan-300',
      muted: 'text-cyan-300/60',
      bright: 'text-cyan-200',
    },
    // Background colors
    bg: {
      primary: 'bg-cyan-600',
      secondary: 'bg-cyan-500',
      hover: 'bg-cyan-700',
      light: 'bg-cyan-600/30',
      lighter: 'bg-cyan-700/30',
    },
    // Border colors
    border: {
      primary: 'border-cyan-500/30',
      secondary: 'border-cyan-400/30',
      bright: 'border-cyan-400/50',
    },
    // RGBA values for inline styles
    rgba: {
      glow: 'rgba(34, 211, 238, 0.3)', // Radial glow overlay
      border: 'rgba(34, 211, 238, 0.3)',
      borderBright: 'rgba(34, 211, 238, 0.5)',
    },
    // Gradient combinations
    gradient: {
      // Primary button gradient
      button: 'bg-gradient-to-r from-cyan-600 to-blue-600',
      buttonHover: 'hover:from-cyan-700 hover:to-blue-700',
      // Radial glow overlay (for dashboard backgrounds)
      radialGlow: 'bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]',
    },
  },

  /**
   * Panel/Card Styling
   * Complete styling object for embossed panels
   */
  panel: {
    base: {
      background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
      border: '1px inset rgba(60, 60, 60, 0.5)',
    },
    // Sidebar variant
    sidebar: {
      background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
      boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
      border: '1px inset rgba(60, 60, 60, 0.5)',
    },
  },

  /**
   * Modal/Card Shell Styling
   * For modals and larger card components
   */
  modal: {
    overlay: 'bg-black/80 backdrop-blur-sm',
    container: 'bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl',
    header: 'bg-gradient-to-r from-cyan-600 to-blue-600',
  },

  /**
   * Toast/Small Info Card Styling
   */
  toast: {
    container: 'bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-cyan-500/30 rounded-xl shadow-xl',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },
} as const;

/**
 * Helper function to apply panel styling as inline styles
 */
export function getPanelStyles(variant: 'base' | 'sidebar' = 'base') {
  return Theme.panel[variant];
}

/**
 * Helper function to apply panel styling as Tailwind classes + inline styles
 * Returns an object with className and style props
 */
export function getPanelProps(variant: 'base' | 'sidebar' = 'base') {
  const styles = Theme.panel[variant];
  return {
    style: styles,
    className: 'rounded-lg', // Add any common classes here
  };
}

/**
 * Helper function to get cyan text color class
 */
export function getCyanText(variant: 'primary' | 'secondary' | 'muted' | 'bright' = 'primary') {
  return Theme.cyan.text[variant];
}

/**
 * Helper function to get cyan background color class
 */
export function getCyanBg(variant: 'primary' | 'secondary' | 'hover' | 'light' | 'lighter' = 'primary') {
  return Theme.cyan.bg[variant];
}

/**
 * Helper function to get cyan border color class
 */
export function getCyanBorder(variant: 'primary' | 'secondary' | 'bright' = 'primary') {
  return Theme.cyan.border[variant];
}
