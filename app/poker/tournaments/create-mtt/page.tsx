import { PokerMttCreatorPage } from '@/components/poker/tournament/mtt-creator/PokerMttCreatorPage';

export const metadata = {
  title: 'Create MTT · MORBIUS Poker',
  description: 'Multi-table tournament creator',
};

export default function CreateMttRoute() {
  return <PokerMttCreatorPage />;
}
