import { PokerMttCreatorPage } from '@/components/poker/tournament/mtt-creator/PokerMttCreatorPage';

export const metadata = {
  title: 'Create MTT · MORBlotto Poker',
  description: 'Multi-table tournament creator',
};

export default function CreateMttRoute() {
  return <PokerMttCreatorPage />;
}
