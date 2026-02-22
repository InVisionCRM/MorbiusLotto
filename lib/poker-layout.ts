/**
 * Poker table layout: positions and sizes as % (0–100) of the table canvas.
 * Sourced from the poker layout designer export; used to position table, seats, pot, actions, chat.
 */
export interface PokerLayoutElement {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PokerLayout {
  version: number;
  background: string;
  elements: PokerLayoutElement[];
}

function byId(layout: PokerLayout, id: string): PokerLayoutElement | undefined {
  return layout.elements.find((e) => e.id === id);
}

export function getTableRect(layout: PokerLayout) {
  return byId(layout, 'table');
}

export function getSeatRect(layout: PokerLayout, seatIndex: number) {
  return byId(layout, `seat${seatIndex}`);
}

export function getCommunityRect(layout: PokerLayout) {
  return byId(layout, 'communityCards');
}

export function getPotRect(layout: PokerLayout) {
  return byId(layout, 'pot');
}

export function getActionBarRect(layout: PokerLayout) {
  return byId(layout, 'actionBar');
}

export function getChatRect(layout: PokerLayout) {
  return byId(layout, 'chat');
}

/** Default layout from designer export (poker-layout (1).json). */
export const defaultPokerLayout: PokerLayout = {
  version: 1,
  background: '/POKER/Pokerbg.jpg',
  elements: [
    { id: 'table', type: 'oval', label: 'Table (oval)', x: 11.596377212389381, y: 14.56691647100447, width: 76.54867256637168, height: 72.7893924286771 },
    { id: 'seat0', type: 'seat', label: 'Seat 0 (you)', x: 44.02447455752212, y: 76.09115178025795, width: 12, height: 14 },
    { id: 'seat1', type: 'seat', label: 'Seat 1', x: 80.460453539823, y: 74.44115660480524, width: 12, height: 14 },
    { id: 'seat2', type: 'seat', label: 'Seat 2', x: 80.51507190265485, y: 8.190473127271558, width: 12, height: 14 },
    { id: 'seat3', type: 'seat', label: 'Seat 3', x: 44.035536504424776, y: 1.3106686822553149, width: 12, height: 14 },
    { id: 'seat4', type: 'seat', label: 'Seat 4', x: 4.802267699115044, y: 18.70155350422952, width: 12, height: 14 },
    { id: 'seat5', type: 'seat', label: 'Seat 5', x: 6.36684181415929, y: 73.61294265221446, width: 12, height: 14 },
    { id: 'communityCards', type: 'community', label: 'Community cards', x: 37.820105088495566, y: 35.60837541410697, width: 24, height: 12 },
    { id: 'pot', type: 'pot', label: 'Pot', x: 43.6850110619469, y: 53.94326332379145, width: 12, height: 5 },
    { id: 'actionBar', type: 'actions', label: 'Action bar', x: 25.69759402654867, y: 90.7649158920588, width: 48.4070796460177, height: 9.235084107941205 },
    { id: 'chat', type: 'chat', label: 'Chat panel', x: 0, y: 0, width: 20.123893805309734, height: 14.621112218970122 },
  ],
};
