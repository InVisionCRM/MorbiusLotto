/**
 * /roulette — retired. The legacy Roulette table has been disabled; European
 * Roulette continues at /roulette2. This route now renders only a notice.
 */

import { RetiredGameNotice } from '@/components/shared/RetiredGameNotice';

export default function RouletteLegacyPage() {
  return (
    <RetiredGameNotice
      title="Roulette has a new home"
      message="This table has closed. European single-zero Roulette continues in our upgraded room, played in chips."
      primary={{ href: '/roulette2', label: 'Play Roulette' }}
    />
  );
}
