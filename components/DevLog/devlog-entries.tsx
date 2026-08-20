'use client';

/**
 * devlog-entries.tsx — the dev log's content, kept apart from its presentation.
 *
 * Every claim here was checked against the code rather than written from
 * memory, and a few are deliberately narrower than they could be:
 *
 *  - "all 28 games" is the count of game routes that actually commit a seed.
 *  - The fairness copy never says "on-chain". Game logic runs server-side; the
 *    guarantee is seed commitment, which is a different (and checkable) claim.
 *  - The rakeback copy says losses, because that is when it accrues.
 *  - The fee card is scoped to deposits, withdrawals and the creators' own
 *    cut. It does not say "no fees anywhere" — poker cash pots are raked 5%
 *    and tournaments take 3%, both into platform accounts.
 *
 * The blackjack one-liners are the `blurb` strings from
 * server/src/services/arcade-blackjack-variants.ts, quoted as-is so the felt
 * and the dev log cannot drift apart.
 *
 * THE IMAGES are screenshots of the live site rather than illustrations, so a
 * card cannot promise something the app does not show. Each was taken at
 * 1440x900 (2x), cropped past the nav rail, then composed as promo art: the
 * capture set in a window frame on a lit backdrop in its own accent colour,
 * leaning on one axis, with a zoomed detail of the same capture pulled forward
 * — the detail is a crop of the shot, never a separate render. Output is
 * 1920x1200, the 16/10 both /devlog and the splash lay out. Retake one by
 * visiting the page it came from:
 *
 *  01-multiplayer    /craps — the table, mid come-out roll
 *  02-new-games      / — the floor grid, scrolled to the NEW/MULTIPLAYER rows
 *  03-pulsechain     scan.morbius.io — the token dashboard
 *  04-slot-builder   /slot-builder-lab.html — Create-A-Slot, the slot studio
 *  05-weekly-drop    / — the hero, with the live pot and countdown
 *  06-vip            /vip — the tier ladder
 *  07-provably-fair  /BLACKJACK/verify — the verifier
 *  08-no-fees        the cashier sheet (Deposit / Withdraw on any table)
 */

import type { ReactNode } from 'react';

export interface DevLogEntry {
  src: string;
  title: string;
  category: string;
  /**
   * One line, for the first-visit splash. The splash is a dialog someone did
   * not ask for, so each slide gets a sentence — the full `content` below is
   * for /devlog, where the reader chose to be.
   */
  blurb: string;
  content: ReactNode;
}

/** Body copy — one voice for every card. */
function P({ children }: { children: ReactNode }) {
  return <p className="mb-5 text-base leading-relaxed text-slate-300 md:text-lg">{children}</p>;
}

/** The lead line of a card, a step up in weight from the rest. */
function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 text-lg leading-relaxed font-medium text-slate-100 md:text-xl">{children}</p>
  );
}

/** A named thing with a line about it — games, tiers, tools. */
function Item({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="mb-3.5 border-l-2 border-cyan-500/40 pl-4">
      <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
        {name}
      </div>
      <div className="mt-1 text-[15px] leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

export const DEVLOG_ENTRIES: DevLogEntry[] = [
  {
    src: '/devlog/01-multiplayer.png',
    category: 'Multiplayer',
    title: 'Sit at a table with everyone else',
    blurb: 'Craps, Ultimate Hold\u2019em and Roulette now seat a whole room on one table \u2014 same dice, same board, same wheel.',
    content: (
      <>
        <Lead>
          Craps, Ultimate Hold&apos;em and Roulette now seat a whole room on one table — everyone on
          the same dice, the same board, the same wheel.
        </Lead>
        <P>
          The craps dice are thrown with real physics and tumble where they land, rather than
          spinning on the spot and stopping on a number decided elsewhere. Once the roulette ball is
          in the air, the wheel takes the room.
        </P>
        <Group label="Live now">
          <Item name="Multiplayer Craps">
            A full table — pass line, come, odds and props — with a live shooter and a roll history
            everyone can see.
          </Item>
          <Item name="Multiplayer Ultimate Hold'em">
            One board, one dealer, every seat playing its own hand. Nobody waits for a turn.
          </Item>
          <Item name="Multiplayer Roulette">
            One wheel, a whole table betting on it.
          </Item>
        </Group>
      </>
    ),
  },
  {
    src: '/devlog/02-new-games.png',
    category: 'New games',
    title: 'Eight new tables',
    blurb: 'Craps, Ultimate Hold\u2019em, Caribbean Stud and five blackjack variants you have probably never played.',
    content: (
      <>
        <Lead>
          Eight new tables landed at once — and five of them are blackjack you have probably never
          played.
        </Lead>
        <Group label="The tables">
          <Item name="Craps">
            The full table, pass line through props, with a live shooter.
          </Item>
          <Item name="Ultimate Texas Hold'em">
            One escalating decision: bet 4× before the board, 2× after the flop, 1× at the river.
            Checking costs nothing but shrinks what you are allowed to bet.
          </Item>
          <Item name="Caribbean Stud">
            One decision, no draw. The dealer needs Ace-King to qualify — and when they miss, your
            call only comes back.
          </Item>
        </Group>
        <Group label="Five blackjack variants">
          <Item name="Spanish 21">
            Every 10 is gone — and the house hands the advantage back in bonuses.
          </Item>
          <Item name="Double Exposure">You see both dealer cards. You pay for it on every tie.</Item>
          <Item name="Pontoon">
            Both dealer cards face down. Five cards under 22 beats almost anything.
          </Item>
          <Item name="Free Bet Blackjack">
            The house pays your doubles and splits. The house also pushes on 22.
          </Item>
          <Item name="Blackjack Switch">Two hands, and one chance to trade their second cards.</Item>
        </Group>
        <P>Plus six video poker paytables.</P>
      </>
    ),
  },
  {
    src: '/devlog/03-pulsechain.png',
    category: 'PulseChain',
    title: 'More PulseChain support',
    blurb: 'Scan.Morbius.io keeps shipping free token analysis tools for PulseChain.',
    content: (
      <>
        <Lead>Scan.Morbius.io keeps shipping.</Lead>
        <P>
          Token analysis tools for PulseChain, updated constantly — and free to use. No gate, no
          tier, no wallet required.
        </P>
      </>
    ),
  },
  {
    src: '/devlog/04-slot-builder.png',
    category: 'Coming soon',
    title: 'Make your own slot machine',
    blurb: 'Build a slot by clicking the machine \u2014 reels, art, paylines, bonuses and sounds. Coming soon.',
    content: (
      <>
        <Lead>Click the machine to build it.</Lead>
        <P>
          Pick the reels, drop in your own art, set the symbols and paylines, then wire up the bonus
          rounds. Design the sounds too — record them, trim them, or pull from a procedural library.
        </P>
        <P>
          An honest RTP simulator tells you what you have actually made, rather than what you hoped
          you made.
        </P>
        <p className="mt-8 inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-amber-300">
          In the workshop — not yet on the floor
        </p>
      </>
    ),
  },
  {
    src: '/devlog/05-weekly-drop.png',
    category: 'Rewards',
    title: 'The Weekly Drop',
    blurb: 'A prize pot that grows while you play, with the guarantee as the floor rather than the ceiling.',
    content: (
      <>
        <Lead>A prize pot that grows while you play.</Lead>
        <P>
          Every wager feeds it. The guarantee is the floor rather than the ceiling, so the pot only
          ever climbs from there — and you can watch it climb live.
        </P>
        <P>Draws close at 8 PM ET.</P>
      </>
    ),
  },
  {
    src: '/devlog/06-vip.png',
    category: 'Rewards',
    title: 'VIP tiers',
    blurb: 'Six tiers, Bronze to Obsidian. Each one raises your rakeback \u2014 paid back on losses.',
    content: (
      <>
        <Lead>Six tiers, Bronze through Obsidian, earned on what you wager.</Lead>
        <P>
          Each tier raises your rakeback — 5% at Bronze up to 25% at Obsidian. It pays back on
          losses, so a losing session still returns something.
        </P>
        <Group label="The ladder">
          <Item name="Bronze">5% rakeback</Item>
          <Item name="Silver">8%</Item>
          <Item name="Gold">12%</Item>
          <Item name="Platinum">16%</Item>
          <Item name="Diamond">20%</Item>
          <Item name="Obsidian">25%</Item>
        </Group>
      </>
    ),
  },
  {
    src: '/devlog/07-provably-fair.png',
    category: 'Fairness',
    title: 'Provably fair, in all 28 games',
    blurb: 'Every game seals its outcome before you act, and publishes the proof afterwards so you can check it.',
    content: (
      <>
        <Lead>
          Every game is provably fair — through three different mechanisms, each shaped to how its
          game is actually played.
        </Lead>
        <Group label="How it works">
          <Item name="Instant games">
            Dice, Limbo, Roulette, Keno, Plinko and the rest. Your wallet holds one sealed server
            seed, and its hash is published <em>before</em> you bet. Each bet consumes it at the next
            nonce. The seed itself is revealed when you rotate it — which is what proves it could not
            have been chosen after seeing your bet.
          </Item>
          <Item name="Card games">
            Blackjack, Caribbean Stud, Hold&apos;em, Pai Gow, Three Card, Video Poker. The whole deck
            is derived from a sealed seed before a card is dealt. It stays hidden while you decide,
            and is published at showdown so you can re-derive the exact order.
          </Item>
          <Item name="Step-by-step games">
            Mines, Towers, Chicken, Hi-Lo, Crash, Craps. The round commits its hash at the start and
            reveals at settle.
          </Item>
        </Group>
        <P>
          You choose the client seed. Everything runs on HMAC-SHA256, and every game ships its own
          verifier so you can check a round yourself rather than take our word for it.
        </P>
      </>
    ),
  },
  {
    src: '/devlog/08-no-fees.png',
    category: 'The deal',
    title: 'The creators take nothing',
    blurb: 'No deposit fee, no withdrawal fee, and no cut for the people who built it.',
    content: (
      <>
        <Lead>No deposit fee. No withdrawal fee. The full amount lands in your wallet.</Lead>
        <P>
          And the creators take no cut — nothing is skimmed off the top for the people who built it.
        </P>
      </>
    ),
  },
];
