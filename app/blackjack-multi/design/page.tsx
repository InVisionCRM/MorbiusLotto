import type { Metadata } from 'next';
import TableDesigner from '@/components/BLACKJACK/design/TableDesigner';

export const metadata: Metadata = {
  title: 'Blackjack table designer',
  robots: { index: false, follow: false },
};

/**
 * Internal tool. Renders the real multiplayer table components against fixture
 * state so the layout can be inspected and tuned without a wallet, a socket, or
 * a round in progress.
 */
export default function BlackjackTableDesignerPage() {
  return <TableDesigner />;
}
