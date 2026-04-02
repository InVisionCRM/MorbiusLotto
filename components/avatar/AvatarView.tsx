'use client';

import AvatarPreview, { type Emotion } from './AvatarPreview';
import type { AvatarConfig } from '@/lib/websocket-client';
import { parseAvatarPayload } from '@/lib/avatar-payload';

export type { Emotion };

type AvatarViewProps = {
  /** Raw JSON from API/WS or a merged `AvatarConfig`. */
  config: AvatarConfig | Record<string, unknown> | null | undefined;
  emotion?: Emotion;
  glassesAnimationKey?: number;
  compact?: boolean;
  trackMouse?: boolean;
  forceAsleep?: boolean;
  roamEyes?: boolean;
  /** Disables ambient idle/drift animation loops for static previews. */
  disableAmbientMotion?: boolean;
  /** Hide default procedural mouth (for placement/edit previews). */
  hideBaseMouth?: boolean;
  /** Hide default procedural nose (for placement/edit previews). */
  hideBaseNose?: boolean;
  /** Hide default procedural hair (for placement/edit previews). */
  hideBaseHair?: boolean;
  className?: string;
};

/** Renders stored avatar JSON via classic v1 `AvatarPreview`. */
export default function AvatarView({
  config: rawConfig,
  emotion: propEmotion = 'neutral',
  glassesAnimationKey = 0,
  compact = false,
  trackMouse = false,
  forceAsleep = false,
  roamEyes = false,
  disableAmbientMotion = false,
  hideBaseMouth = false,
  hideBaseNose = false,
  hideBaseHair = false,
  className,
}: AvatarViewProps) {
  const parsed = parseAvatarPayload(rawConfig);
  if (!parsed) {
    return <div className={className} aria-hidden />;
  }

  return (
    <AvatarPreview
      config={parsed}
      emotion={propEmotion}
      glassesAnimationKey={glassesAnimationKey}
      compact={compact}
      trackMouse={trackMouse}
      forceAsleep={forceAsleep}
      roamEyes={roamEyes}
      disableAmbientMotion={disableAmbientMotion}
      hideBaseMouth={hideBaseMouth}
      hideBaseNose={hideBaseNose}
      hideBaseHair={hideBaseHair}
      className={className}
    />
  );
}
