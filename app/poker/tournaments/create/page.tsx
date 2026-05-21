import { PokerTournamentCreatorPage } from '@/components/poker/tournament/PokerTournamentCreatorPage';

export const metadata = {
  title: 'Create Tournament · MORBlotto Poker',
  description: 'Single-table poker tournament creator',
};

export default function CreateTournamentRoute() {
  return <PokerTournamentCreatorPage />;
}
