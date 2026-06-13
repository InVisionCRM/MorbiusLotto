/**
 * /lottery — retired. The 6-of-55 lottery has been disabled and this route now
 * renders only a notice. (The read-only fairness verifier at /lottery/verify is
 * left intact for historical tickets.)
 */

import { RetiredGameNotice } from '@/components/shared/RetiredGameNotice';

export default function LotteryRetiredPage() {
  return (
    <RetiredGameNotice
      title="Lottery has been retired"
      message="The 6-of-55 lottery is no longer available. There's plenty more to play back in the lobby."
    />
  );
}
