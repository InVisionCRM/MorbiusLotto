/**
 * /PLINKO — retired. The legacy Plinko board has been disabled; the modern
 * arcade2 version lives at /plinko2. This route now renders only a notice.
 */

import { RetiredGameNotice } from '@/components/shared/RetiredGameNotice';

export default function PlinkoLegacyPage() {
  return (
    <RetiredGameNotice
      title="Plinko has a new home"
      message="The classic Plinko board has been retired. The upgraded version lives on — same drop, smoother ride, played in chips."
      primary={{ href: '/plinko2', label: 'Play Plinko' }}
    />
  );
}
