/**
 * /wheel — retired. The daily wish wheel has been disabled (its floating
 * launcher is already removed in app/layout.tsx). This route now renders only a
 * notice.
 */

import { RetiredGameNotice } from '@/components/shared/RetiredGameNotice';

export default function WheelRetiredPage() {
  return (
    <RetiredGameNotice
      title="The Wheel has been retired"
      message="The daily wish wheel is no longer available. There's plenty more to play back in the lobby."
    />
  );
}
