'use client';

/**
 * CardBackSwatch — a face-down card at an arbitrary size.
 *
 * The designer needs to preview a back without dragging in PlayingCard's
 * layout context, deal animations and sizing table, so the back's structure
 * (patterned field → inset rule → centred mark) lives here and PlayingCard's
 * `hidden` branch renders the same three parts with the same class names.
 * Both read the field from `table-card-backs`, so a pattern added there shows
 * up in the picker and on the felt without a second edit.
 */

import type { BlackjackTableLayout } from '@/lib/blackjack-table-layout';
import { cardBackById } from '@/lib/table-card-backs';
import './blackjack-cards.css';

export function CardBackSwatch({
  layout,
  w,
  h,
}: {
  layout: BlackjackTableLayout;
  w: number;
  h: number;
}) {
  const back = cardBackById(layout.cards.backDesign);
  return (
    <span
      className="blackjack-card-back"
      style={{
        display: 'grid',
        width: w,
        height: h,
        borderRadius: 6,
        background: back.background,
        boxShadow: back.boxShadow,
        fontSize: h,
      }}
    >
      <span className="blackjack-card-back-rule" />
      {layout.cards.backImage ? (
        <img src={layout.cards.backImage} alt="" className="blackjack-card-back-mark" />
      ) : (
        back.glyph && (
          <span className="blackjack-card-back-glyph" style={{ color: back.glyphColor }}>
            {back.glyph}
          </span>
        )
      )}
    </span>
  );
}
