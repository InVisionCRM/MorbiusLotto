/**
 * arcade-blackjack-variants.routes.ts — Spanish 21, Double Exposure, Pontoon,
 * Free Bet Blackjack and Blackjack Switch.
 *
 * Endpoints:
 *   GET  /api/arcade/blackjack-variants/info?variant=      — public: rules + limits
 *   GET  /api/arcade/blackjack-variants/active?variant=    — caller's live round
 *   POST /api/arcade/blackjack-variants/deal               — debit the bet, deal
 *   POST /api/arcade/blackjack-variants/action             — hit/stand/double/
 *                                                            split/surrender, plus
 *                                                            switch/keep for the
 *                                                            Switch opening trade
 *   GET  /api/arcade/blackjack-variants/history?variant=   — caller's settled rounds
 *   GET  /api/arcade/blackjack-variants/recent             — public feed
 *   GET  /api/arcade/blackjack-variants/leaderboard        — public: top by net
 *   GET  /api/arcade/blackjack-variants/verify/:id         — public: seeds + recipe
 *
 * One route module for five games. The rules come from the variant record, and
 * at settle time they come from the variant stored ON THE ROW — never from the
 * request — so a round can't be dealt on one paytable and paid on another.
 *
 * The whole deck is committed at /deal behind a server-seed hash, and the
 * round carries its own cursor into it. That is what makes a resumed round
 * deal the same next card it would have dealt before the refresh, and what
 * makes the finished round reproducible by anyone from the published seeds.
 *
 * Every chip move runs inside a transaction with the round row locked FOR
 * UPDATE, so a double-tap can neither double-spend nor double-pay.
 */

import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { betLimits } from '../lib/game-limits';
import { verifyTelegramInitData } from '../services/telegram.service';
import { SESSION_COOKIE_NAME } from '../middleware/require-auth';
import { applyPokerChipDelta } from '../services/poker-chip-wallet';
import { ProvablyFairService } from '../services/provably-fair.service';
import {
  BJ_SUPER_MATCH_PAY,
  BJ_VARIANTS,
  BJ_VARIANT_KEYS,
  bjDeckFor,
  bjDoubleIsFree,
  bjHandTotal,
  bjIsNatural,
  bjLegalActions,
  bjNewHand,
  bjPlayDealer,
  bjRank,
  bjRules,
  bjSettleRound,
  bjSplitIsFree,
  bjStakeUnit,
  bjSuperMatch,
  bjSuperMatchPayout,
  bjSwitchHands,
  bjVariantInfo,
  validateBjBet,
  type BjAction,
  type BjHand,
  type BjRules,
} from '../services/arcade-blackjack-variants';
import type { DatabaseService } from '../services/database.service';
import type { AuthService } from '../services/auth.service';

interface RegisterArcadeBlackjackVariantsRoutesOptions {
  app: Express;
  dbService: DatabaseService;
  authService: AuthService;
}

const pf = new ProvablyFairService();
const ALL_ACTIONS: BjAction[] = [
  'hit',
  'stand',
  'double',
  'split',
  'surrender',
  // Blackjack Switch's opening decision. Legal only while stage === 'switch',
  // which is checked against the ROW, not the request.
  'switch',
  'keep',
];

/** Resolve the wallet linked to a Telegram `initData` payload, or null. */
async function walletFromInitData(
  dbService: DatabaseService,
  initData: unknown,
): Promise<string | null> {
  if (typeof initData !== 'string') return null;
  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser) return null;
  const r = await dbService
    .getPool()
    .query('SELECT wallet_address FROM telegram_links WHERE telegram_chat_id = $1', [tgUser.id]);
  return r.rows.length > 0 ? String(r.rows[0].wallet_address) : null;
}

/**
 * How much of the dealer's hand the client may see mid-round.
 *
 * Pontoon shows nothing, Double Exposure shows everything, and the rest show
 * the up card only. This is applied on the way OUT of the server, so a hidden
 * card is genuinely absent from the response rather than merely un-rendered.
 */
function visibleDealer(rules: BjRules, dealerCards: number[], settled: boolean): number[] {
  if (settled) return dealerCards;
  if (rules.dealerFullyHidden) return [];
  if (rules.dealerExposed) return dealerCards;
  return dealerCards.slice(0, 1);
}

/** The client-facing shape of a live hand. */
function handView(h: BjHand) {
  const t = bjHandTotal(h.cards);
  return {
    cards: h.cards,
    bet: h.bet,
    freeBet: h.freeBet,
    total: t.total,
    soft: t.soft,
    doubled: h.doubled,
    fromSplit: h.fromSplit,
    switched: h.switched,
    done: h.done,
    surrendered: h.surrendered,
    busted: h.busted,
    // A switched two-card 21 is a 21, not a natural — the rule that stops
    // the swap from manufacturing blackjacks.
    isNatural: bjIsNatural(h.cards) && !h.fromSplit && !h.switched,
  };
}

/** SELECT … FOR UPDATE the round row inside an open transaction. */
async function lockRound(client: PoolClient, roundId: string) {
  const r = await client.query(
    `SELECT id, wallet_address, variant, bet, committed, hands, active_hand,
            split_count, dealer_cards, deck, deck_cursor, status, stage,
            side_bet, side_payout,
            server_seed, server_seed_hash, client_seed, nonce
       FROM arcade_blackjack_variant_rounds WHERE id = $1 FOR UPDATE`,
    [roundId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

/**
 * The four cards Super Match is scored on: the two hands as they were DEALT.
 * Taken from the front of each hand so a later hit or a swap can't change what
 * the side bet was already decided on.
 */
function openingFour(hands: BjHand[]): number[] {
  if (hands.length < 2) return [];
  return [...hands[0].cards.slice(0, 2), ...hands[1].cards.slice(0, 2)];
}

/** Index of the next hand still awaiting a decision, or null when all are done. */
function nextActiveHand(hands: BjHand[]): number | null {
  const i = hands.findIndex((h) => !h.done && !h.busted && !h.surrendered);
  return i === -1 ? null : i;
}

/**
 * Mark a hand finished when it can't act again — busted, on 21, or holding a
 * one-card split ace. Doing it in one place stops "the felt let me hit a 21"
 * bugs from creeping in per action.
 */
function closeHandIfFinished(rules: BjRules, h: BjHand): void {
  const t = bjHandTotal(h.cards);
  if (t.total > 21) {
    h.busted = true;
    h.done = true;
    return;
  }
  if (t.total === 21) {
    h.done = true;
    return;
  }
  if (bjLegalActions(rules, h, rules.maxSplits).length === 0) h.done = true;
}

export function registerArcadeBlackjackVariantsRoutes({
  app,
  dbService,
  authService,
}: RegisterArcadeBlackjackVariantsRoutesOptions): void {
  const pool = dbService.getPool();

  const AUTH_ERROR = 'No session — sign in on the web, or open from Telegram with a linked wallet.';

  async function resolveWallet(req: Request): Promise<string | null> {
    const tgWallet = await walletFromInitData(dbService, req.body?.initData);
    if (tgWallet) return tgWallet;
    const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[
      SESSION_COOKIE_NAME
    ];
    if (!token) return null;
    const session = await authService.lookupSession(token);
    return session ? session.walletAddress : null;
  }

  // -------------------------------------------------------------------------
  // GET /info — the variant's full rule set, so the felt renders exactly what
  // the server will enforce, plus the menu of variants for a lobby.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/info', (req: Request, res: Response) => {
    const rules = bjRules(req.query.variant);
    if (!rules) {
      return res.status(400).json({ ok: false, error: 'Unknown blackjack variant.' });
    }
    const l = betLimits('blackjack_variants');
    return res.json({
      ok: true,
      minBet: l.min,
      maxBet: l.max,
      rules: bjVariantInfo(rules),
      // Only Blackjack Switch offers it, but sending it unconditionally keeps
      // the client from having to special-case a variant it may not know yet.
      superMatchPay: rules.switchHands ? BJ_SUPER_MATCH_PAY : null,
      // Single deck, and the client says so rather than quoting a multi-deck
      // return this game does not have. See the service file header.
      singleDeck: true,
      variants: BJ_VARIANT_KEYS.map((k) => ({
        key: k,
        name: BJ_VARIANTS[k].name,
        blurb: BJ_VARIANTS[k].blurb,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // GET /active — the caller's live round for a variant, so a refresh mid-hand
  // resumes rather than stranding an already-debited bet.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/active', async (req: Request, res: Response) => {
    try {
      const rules = bjRules(req.query.variant);
      if (!rules) return res.status(400).json({ ok: false, error: 'Unknown blackjack variant.' });
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const r = await pool.query(
        `SELECT id, bet, committed, hands, active_hand, split_count, dealer_cards,
                stage, side_bet, server_seed_hash, client_seed, nonce
           FROM arcade_blackjack_variant_rounds
          WHERE wallet_address = $1 AND variant = $2 AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
        [wallet.toLowerCase(), rules.key],
      );
      if (r.rows.length === 0) return res.json({ ok: true, active: null });

      const row = r.rows[0];
      const hands = row.hands as BjHand[];
      const active = row.active_hand === null ? null : Number(row.active_hand);
      const stage = (row.stage as 'switch' | 'play') ?? 'play';
      return res.json({
        ok: true,
        active: {
          roundId: row.id,
          variant: rules.key,
          bet: Number(row.bet),
          committed: Number(row.committed),
          sideBet: Number(row.side_bet ?? 0),
          stage,
          hands: hands.map(handView),
          activeHand: active,
          splitCount: Number(row.split_count),
          dealerCards: visibleDealer(rules, row.dealer_cards as number[], false),
          legalActions:
            stage === 'switch'
              ? (['switch', 'keep'] as BjAction[])
              : active === null
                ? []
                : bjLegalActions(rules, hands[active], Number(row.split_count)),
          freeDouble:
            stage === 'play' && active !== null && bjDoubleIsFree(rules, hands[active]),
          freeSplit:
            stage === 'play' && active !== null && bjSplitIsFree(rules, hands[active]),
          serverSeedHash: row.server_seed_hash,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
        },
      });
    } catch (err) {
      logger.error('[arcade-bj-variants] active failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load round state.' });
    }
  });

  /**
   * Play the dealer out and settle every hand. Shared by /deal (when the round
   * needs no decisions) and /action (when the last hand finishes).
   *
   * Runs inside the caller's transaction and credits the payout, so the debit
   * and the credit can never be observed apart.
   */
  async function finishRound(
    client: PoolClient,
    rules: BjRules,
    roundId: string,
    wallet: string,
    hands: BjHand[],
    dealerStart: number[],
    deck: number[],
    cursor: number,
    committed: number,
    sideBet = 0,
    sideResult: string | null = null,
    sidePayout = 0,
  ) {
    // The dealer only draws when at least one hand can still be beaten. With
    // every hand busted or surrendered there is nothing to resolve, and
    // drawing anyway would burn cards a verifier would then have to account
    // for — so the hand stops where it is.
    const anyLive = hands.some((h) => !h.busted && !h.surrendered);
    const played = anyLive
      ? bjPlayDealer(rules, dealerStart, deck, cursor)
      : { cards: dealerStart, cursor };

    // The Super Match side bet settles alongside the hands but on its own
    // terms — it was scored on the opening four cards and doesn't care how the
    // round was played.
    const settlement = bjSettleRound(rules, hands, played.cards, sideBet, sidePayout);
    const totalPayout = settlement.totalPayout;

    await client.query(
      `UPDATE arcade_blackjack_variant_rounds
          SET hands = $1::jsonb, active_hand = NULL, dealer_cards = $2::jsonb,
              deck_cursor = $3, results = $4::jsonb, total_payout = $5,
              dealer_total = $6, won = $7, committed = $8,
              side_result = $10, side_payout = $11,
              status = 'settled', settled_at = NOW()
        WHERE id = $9`,
      [
        JSON.stringify(hands),
        JSON.stringify(played.cards),
        played.cursor,
        JSON.stringify(settlement.hands),
        totalPayout,
        settlement.dealerTotal,
        totalPayout > committed,
        committed,
        roundId,
        sideResult,
        sidePayout,
      ],
    );

    let chipBalance: bigint | null = null;
    if (totalPayout > 0) {
      chipBalance = await applyPokerChipDelta(
        client,
        wallet,
        BigInt(totalPayout),
        'arcade_blackjack_variants_payout',
        { type: 'arcade_blackjack_variants', id: roundId },
      );
    }

    return {
      settlement,
      dealerCards: played.cards,
      totalPayout,
      chipBalance,
      sideResult,
      sidePayout,
    };
  }

  // -------------------------------------------------------------------------
  // POST /deal — debit the bet, commit the deck, deal two cards each.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/blackjack-variants/deal', async (req: Request, res: Response) => {
    try {
      const rules = bjRules(req.body?.variant);
      if (!rules) return res.status(400).json({ ok: false, error: 'Unknown blackjack variant.' });
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const v = validateBjBet(req.body?.bet);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      const bet = v.bet;

      const serverSeed = pf.generateServerSeed();
      const serverSeedHash = pf.createServerSeedHash(serverSeed);
      const clientSeed =
        typeof req.body?.clientSeed === 'string' && req.body.clientSeed.trim()
          ? req.body.clientSeed.trim().slice(0, 128)
          : crypto.randomBytes(16).toString('hex');
      const nonce = 0;

      // Shuffle the standard 52 and then remove the variant's dead ranks. Doing
      // it in that order keeps the commitment verifiable against the ordinary
      // recipe — a verifier reproduces the 52-card shuffle and filters it.
      const shuffled = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce);
      const deck = bjDeckFor(rules, shuffled);

      const roundId = crypto.randomUUID();
      let hands: BjHand[];
      let dealerCards: number[];
      let cursor: number;
      let stage: 'switch' | 'play' = 'play';
      let sideBet = 0;
      let playerStake = bet;

      if (rules.switchHands) {
        // Blackjack Switch: two boxes, dealt across then the dealer, and the
        // bet is posted on BOTH — so a deal costs twice what the player typed.
        hands = [
          bjNewHand([deck[0], deck[2]], bet),
          bjNewHand([deck[1], deck[3]], bet),
        ];
        dealerCards = [deck[4], deck[5]];
        cursor = 6;
        stage = 'switch';
        playerStake = bet * 2;

        // Super Match is optional and rides on the four opening cards. `true`
        // sizes it to the bet, matching how the other side bets on the site
        // work; a number sizes it explicitly, inside the table limits.
        const rawSide = req.body?.superMatch;
        if (rawSide === true) sideBet = bet;
        else if (rawSide != null && rawSide !== '') {
          const sv = validateBjBet(rawSide);
          if (!sv.ok) return res.status(400).json({ ok: false, error: sv.error });
          sideBet = sv.bet;
        }
        playerStake += sideBet;
      } else {
        // Real dealing order: player, dealer, player, dealer.
        hands = [bjNewHand([deck[0], deck[2]], bet)];
        dealerCards = [deck[1], deck[3]];
        cursor = 4;
      }

      // A 21 needs no decisions — that hand goes straight to the showdown.
      // Switch still owes the player their trade-or-keep, so it never skips;
      // its flags are recomputed once the swap decision is made, because a swap
      // can take a hand out of 21 again.
      for (const h of hands) {
        h.done = bjHandTotal(h.cards).total === 21;
      }
      const noDecisions = stage === 'play' && hands.every((h) => h.done);

      let response: Record<string, unknown> = {};
      try {
        await dbService.withTransaction(async (client) => {
          const chipBalance = await applyPokerChipDelta(
            client,
            wallet,
            BigInt(-playerStake),
            'arcade_blackjack_variants_bet',
            { type: 'arcade_blackjack_variants', id: roundId },
          );

          await client.query(
            `INSERT INTO arcade_blackjack_variant_rounds
               (id, wallet_address, variant, bet, committed, hands, active_hand,
                split_count, dealer_cards, deck, deck_cursor, status, stage,
                side_bet,
                server_seed, server_seed_hash, client_seed, nonce)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 0, $8::jsonb, $9::jsonb,
                     $10, 'active', $15, $16, $11, $12, $13, $14)`,
            [
              roundId,
              wallet.toLowerCase(),
              rules.key,
              bet,
              playerStake,
              JSON.stringify(hands),
              noDecisions || stage === 'switch' ? null : 0,
              JSON.stringify(dealerCards),
              JSON.stringify(deck),
              cursor,
              serverSeed,
              serverSeedHash,
              clientSeed,
              nonce,
              stage,
              sideBet,
            ],
          );

          if (noDecisions) {
            const done = await finishRound(
              client,
              rules,
              roundId,
              wallet,
              hands,
              dealerCards,
              deck,
              cursor,
              playerStake,
            );
            response = {
              settled: true,
              hands: hands.map(handView),
              activeHand: null,
              legalActions: [],
              dealerCards: done.dealerCards,
              results: done.settlement.hands,
              dealerTotal: done.settlement.dealerTotal,
              dealerBusted: done.settlement.dealerBusted,
              totalPayout: done.totalPayout,
              committed: playerStake,
              won: done.totalPayout > playerStake,
              stage: 'play',
              serverSeed,
              chipBalance: (done.chipBalance ?? chipBalance).toString(),
            };
          } else {
            const swapping = stage === 'switch';
            response = {
              settled: false,
              stage,
              hands: hands.map(handView),
              activeHand: swapping ? null : 0,
              legalActions: swapping ? ['switch', 'keep'] : bjLegalActions(rules, hands[0], 0),
              freeDouble: !swapping && bjDoubleIsFree(rules, hands[0]),
              freeSplit: !swapping && bjSplitIsFree(rules, hands[0]),
              dealerCards: visibleDealer(rules, dealerCards, false),
              committed: playerStake,
              sideBet,
              chipBalance: chipBalance.toString(),
            };
          }
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (/uniq_arcade_bj_variant_active_per_wallet|duplicate key/i.test(msg)) {
          return res
            .status(409)
            .json({ ok: false, error: 'You already have a round in play — finish it first.' });
        }
        throw err;
      }

      return res.json({
        ok: true,
        roundId,
        variant: rules.key,
        bet,
        serverSeedHash,
        clientSeed,
        nonce,
        ...response,
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res.status(400).json({ ok: false, error: 'Not enough chips for that bet.' });
      }
      logger.error('[arcade-bj-variants] deal failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not deal the round.' });
    }
  });

  // -------------------------------------------------------------------------
  // POST /action — {roundId, action}. Applies one decision to the active hand
  // and, when every hand is finished, plays the dealer and settles.
  // -------------------------------------------------------------------------
  app.post('/api/arcade/blackjack-variants/action', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const roundId = String(req.body?.roundId ?? '');
      const action = req.body?.action as BjAction;
      if (!roundId) return res.status(400).json({ ok: false, error: 'Invalid round.' });
      if (!ALL_ACTIONS.includes(action)) {
        return res.status(400).json({ ok: false, error: 'Unknown action.' });
      }

      let response: { status: number; body: Record<string, unknown> } | null = null;
      await dbService.withTransaction(async (client) => {
        const row = await lockRound(client, roundId);
        if (!row) {
          response = { status: 404, body: { ok: false, error: 'Round not found.' } };
          return;
        }
        if (row.wallet_address.toLowerCase() !== wallet.toLowerCase()) {
          response = { status: 403, body: { ok: false, error: 'Not your round.' } };
          return;
        }
        if (row.status !== 'active') {
          response = { status: 409, body: { ok: false, error: 'Round already settled.' } };
          return;
        }

        // The rules come from the ROW, never the request.
        const rules = bjRules(row.variant);
        if (!rules) {
          response = { status: 500, body: { ok: false, error: 'Round has an unknown variant.' } };
          return;
        }

        const hands = row.hands as BjHand[];
        const deck = row.deck as number[];
        const dealerCards = row.dealer_cards as number[];
        let cursor = Number(row.deck_cursor);
        let splitCount = Number(row.split_count);
        let committed = Number(row.committed);
        const stage = (row.stage as 'switch' | 'play') ?? 'play';
        const sideBet = Number(row.side_bet ?? 0);
        const idx = row.active_hand === null ? null : Number(row.active_hand);

        // ── Blackjack Switch's opening decision ──────────────────────────
        // Trade the second cards, or keep them. Either way no chips move and
        // the round drops into ordinary play on the first hand.
        if (stage === 'switch') {
          if (action !== 'switch' && action !== 'keep') {
            response = {
              status: 400,
              body: {
                ok: false,
                error: 'Trade the second cards or keep them first.',
                legalActions: ['switch', 'keep'],
              },
            };
            return;
          }
          if (action === 'switch') bjSwitchHands(hands);

          // Recompute `done` from scratch rather than only setting it. A swap
          // can turn a hand that was 21 at the deal into a non-21 that DOES owe
          // the player a decision, and a stale flag would freeze that hand and
          // send a live 16 straight to the dealer. Both hands still hold
          // exactly two cards here, so neither can be busted or surrendered and
          // "is it 21" is the whole question.
          for (const h of hands) {
            h.done = bjHandTotal(h.cards).total === 21;
          }
          const first = nextActiveHand(hands);

          if (first === null) {
            const sideResult = sideBet > 0 ? bjSuperMatch(openingFour(hands)) : null;
            const sidePayout = sideResult ? bjSuperMatchPayout(sideBet, sideResult) : 0;
            const done = await finishRound(
              client, rules, roundId, wallet, hands, dealerCards, deck, cursor,
              committed, sideBet, sideResult, sidePayout,
            );
            response = {
              status: 200,
              body: {
                ok: true, roundId, action, settled: true, stage: 'play',
                variant: rules.key,
                hands: hands.map(handView), activeHand: null, legalActions: [],
                dealerCards: done.dealerCards, results: done.settlement.hands,
                dealerTotal: done.settlement.dealerTotal,
                dealerBusted: done.settlement.dealerBusted,
                totalPayout: done.totalPayout, committed,
                won: done.totalPayout > committed,
                sideResult, sidePayout,
                serverSeed: row.server_seed,
                ...(done.chipBalance !== null
                  ? { chipBalance: done.chipBalance.toString() }
                  : {}),
              },
            };
            return;
          }

          await client.query(
            `UPDATE arcade_blackjack_variant_rounds
                SET hands = $1::jsonb, active_hand = $2, stage = 'play'
              WHERE id = $3`,
            [JSON.stringify(hands), first, roundId],
          );
          response = {
            status: 200,
            body: {
              ok: true, roundId, action, settled: false, stage: 'play',
              variant: rules.key,
              hands: hands.map(handView), activeHand: first,
              legalActions: bjLegalActions(rules, hands[first], splitCount),
              freeDouble: bjDoubleIsFree(rules, hands[first]),
              freeSplit: bjSplitIsFree(rules, hands[first]),
              dealerCards: visibleDealer(rules, dealerCards, false),
              committed,
            },
          };
          return;
        }

        if (action === 'switch' || action === 'keep') {
          response = {
            status: 400,
            body: { ok: false, error: 'The cards are already in play.' },
          };
          return;
        }

        if (idx === null || !hands[idx]) {
          response = { status: 409, body: { ok: false, error: 'No hand is waiting on you.' } };
          return;
        }

        const hand = hands[idx];
        const legal = bjLegalActions(rules, hand, splitCount);
        if (!legal.includes(action)) {
          response = {
            status: 400,
            body: { ok: false, error: "You can't do that right now.", legalActions: legal },
          };
          return;
        }

        let chipBalance: bigint | null = null;

        if (action === 'hit') {
          hand.cards.push(deck[cursor++]);
          closeHandIfFinished(rules, hand);
        } else if (action === 'stand') {
          hand.done = true;
        } else if (action === 'surrender') {
          hand.surrendered = true;
          hand.done = true;
        } else if (action === 'double') {
          // Size off the stake UNIT, not hand.bet: a free-split hand carries no
          // player stake at all, and doubling it must still cost a real unit.
          const unit = bjStakeUnit(hand);
          if (bjDoubleIsFree(rules, hand)) {
            // The house puts the chips up. Nothing leaves the player's wallet,
            // and `committed` deliberately does not move.
            hand.freeBet += unit;
          } else {
            chipBalance = await applyPokerChipDelta(
              client,
              wallet,
              BigInt(-unit),
              'arcade_blackjack_variants_bet',
              { type: 'arcade_blackjack_variants', id: roundId },
            );
            committed += unit;
            hand.bet += unit;
          }
          hand.doubled = true;
          hand.cards.push(deck[cursor++]);
          // A double is one card and then you're done, whoever paid for it.
          const t = bjHandTotal(hand.cards);
          if (t.total > 21) hand.busted = true;
          hand.done = true;
        } else if (action === 'split') {
          const free = bjSplitIsFree(rules, hand);
          const stake = bjStakeUnit(hand);
          if (!free) {
            chipBalance = await applyPokerChipDelta(
              client,
              wallet,
              BigInt(-stake),
              'arcade_blackjack_variants_bet',
              { type: 'arcade_blackjack_variants', id: roundId },
            );
            committed += stake;
          }

          const wasAces = bjRank(hand.cards[0]) === 1;
          const second = hand.cards.pop() as number;
          hand.fromSplit = true;
          hand.cards.push(deck[cursor++]);

          // A FREE split hand is entirely the house's money: the player's own
          // stake on it is ZERO. Giving it a player stake as well would have
          // settlement return chips that were never put up — paying the house's
          // side of the bet to the player on every win and push.
          const newHand = bjNewHand([second, deck[cursor++]], free ? 0 : stake, true);
          if (free) newHand.freeBet = stake;

          splitCount += 1;
          hands.splice(idx + 1, 0, newHand);

          // Split aces get exactly one card each and are then done — the rule
          // that stops a pair of aces from being farmed into four 21s.
          if (wasAces) {
            hand.done = true;
            newHand.done = true;
          } else {
            closeHandIfFinished(rules, hand);
            closeHandIfFinished(rules, newHand);
          }
        }

        const next = nextActiveHand(hands);

        if (next === null) {
          const sideResult = sideBet > 0 ? bjSuperMatch(openingFour(hands)) : null;
          const sidePayout = sideResult ? bjSuperMatchPayout(sideBet, sideResult) : 0;
          const done = await finishRound(
            client,
            rules,
            roundId,
            wallet,
            hands,
            dealerCards,
            deck,
            cursor,
            committed,
            sideBet,
            sideResult,
            sidePayout,
          );
          response = {
            status: 200,
            body: {
              ok: true,
              roundId,
              action,
              settled: true,
              variant: rules.key,
              hands: hands.map(handView),
              activeHand: null,
              legalActions: [],
              dealerCards: done.dealerCards,
              results: done.settlement.hands,
              dealerTotal: done.settlement.dealerTotal,
              dealerBusted: done.settlement.dealerBusted,
              totalPayout: done.totalPayout,
              committed,
              won: done.totalPayout > committed,
              sideResult,
              sidePayout,
              serverSeed: row.server_seed,
              ...(done.chipBalance !== null || chipBalance !== null
                ? { chipBalance: (done.chipBalance ?? chipBalance)!.toString() }
                : {}),
            },
          };
          return;
        }

        await client.query(
          `UPDATE arcade_blackjack_variant_rounds
              SET hands = $1::jsonb, active_hand = $2, split_count = $3,
                  deck_cursor = $4, committed = $5
            WHERE id = $6`,
          [JSON.stringify(hands), next, splitCount, cursor, committed, roundId],
        );

        response = {
          status: 200,
          body: {
            ok: true,
            roundId,
            action,
            settled: false,
            variant: rules.key,
            hands: hands.map(handView),
            activeHand: next,
            splitCount,
            legalActions: bjLegalActions(rules, hands[next], splitCount),
            freeDouble: bjDoubleIsFree(rules, hands[next]),
            freeSplit: bjSplitIsFree(rules, hands[next]),
            dealerCards: visibleDealer(rules, dealerCards, false),
            committed,
            ...(chipBalance !== null ? { chipBalance: chipBalance.toString() } : {}),
          },
        };
      });

      if (!response) {
        return res.status(500).json({ ok: false, error: 'Could not apply that action.' });
      }
      const r = response as { status: number; body: Record<string, unknown> };
      return res.status(r.status).json(r.body);
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/insufficient/i.test(msg)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Not enough chips to cover that — the hand is unchanged.' });
      }
      logger.error('[arcade-bj-variants] action failed', { error: msg });
      return res.status(500).json({ ok: false, error: 'Could not apply that action.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /history — the caller's settled rounds, newest first.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/history', async (req: Request, res: Response) => {
    try {
      const wallet = await resolveWallet(req);
      if (!wallet) return res.status(401).json({ ok: false, error: AUTH_ERROR });

      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '25'), 10) || 25));
      const variant = typeof req.query.variant === 'string' ? req.query.variant : null;
      const params: unknown[] = [wallet.toLowerCase()];
      let where = `wallet_address = $1 AND status = 'settled'`;
      if (variant && bjRules(variant)) {
        params.push(variant);
        where += ` AND variant = $${params.length}`;
      }
      params.push(limit);

      const r = await pool.query(
        `SELECT id, variant, bet, committed, hands, dealer_cards, results,
                total_payout, dealer_total, won, side_bet, side_payout,
                side_result, created_at
           FROM arcade_blackjack_variant_rounds
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length}`,
        params,
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          variant: row.variant as string,
          bet: Number(row.bet),
          committed: Number(row.committed),
          hands: (row.hands as BjHand[]).map(handView),
          dealerCards: row.dealer_cards as number[],
          results: row.results,
          totalPayout: Number(row.total_payout),
          dealerTotal: row.dealer_total === null ? null : Number(row.dealer_total),
          sideBet: Number(row.side_bet ?? 0),
          sidePayout: Number(row.side_payout ?? 0),
          sideResult: (row.side_result as string | null) ?? null,
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-bj-variants] history failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load history.' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /recent — public feed of settled rounds.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/recent', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '25'), 10) || 25));
    try {
      const r = await pool.query(
        `SELECT id, wallet_address, variant, committed, total_payout, won, created_at
           FROM arcade_blackjack_variant_rounds
          WHERE status = 'settled'
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return res.json({
        ok: true,
        rounds: r.rows.map((row) => ({
          roundId: row.id,
          wallet: row.wallet_address,
          variant: row.variant as string,
          committed: Number(row.committed),
          totalPayout: Number(row.total_payout),
          won: !!row.won,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('[arcade-bj-variants] recent failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /leaderboard — public. Net = returned − committed.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/leaderboard', async (req: Request, res: Response) => {
    const limit = Math.max(1, Math.min(25, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const variant = typeof req.query.variant === 'string' ? req.query.variant : null;
    try {
      const params: unknown[] = [];
      let where = `status = 'settled'`;
      if (variant && bjRules(variant)) {
        params.push(variant);
        where += ` AND variant = $${params.length}`;
      }
      params.push(limit);
      const r = await pool.query(
        `SELECT wallet_address,
                COUNT(*)::int AS rounds,
                SUM(committed)::text AS wagered,
                SUM(total_payout)::text AS won,
                (SUM(total_payout) - SUM(committed))::text AS net
           FROM arcade_blackjack_variant_rounds
          WHERE ${where}
          GROUP BY wallet_address
          ORDER BY SUM(total_payout) - SUM(committed) DESC
          LIMIT $${params.length}`,
        params,
      );
      return res.json({
        ok: true,
        players: r.rows.map((row) => ({
          wallet: row.wallet_address,
          rounds: Number(row.rounds),
          wagered: String(row.wagered ?? '0'),
          won: String(row.won ?? '0'),
          net: String(row.net ?? '0'),
        })),
      });
    } catch (err) {
      logger.error('[arcade-bj-variants] leaderboard failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'internal error' });
    }
  });

  // -------------------------------------------------------------------------
  // GET /verify/:id — public, settled rounds ONLY. Publishes the seeds and the
  // recipe, including which ranks the variant removed, so anyone can rebuild
  // the deck and confirm every card was fixed before the first decision.
  // -------------------------------------------------------------------------
  app.get('/api/arcade/blackjack-variants/verify/:id', async (req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT id, variant, bet, committed, hands, dealer_cards, deck, deck_cursor,
                results, total_payout, dealer_total, won, status,
                side_bet, side_payout, side_result,
                server_seed, server_seed_hash, client_seed, nonce,
                created_at, settled_at
           FROM arcade_blackjack_variant_rounds WHERE id = $1`,
        [req.params.id],
      );
      if (r.rows.length === 0) return res.status(404).json({ ok: false, error: 'Round not found.' });
      const row = r.rows[0];
      if (row.status === 'active') {
        return res.status(404).json({ ok: false, error: 'Round still in progress.' });
      }
      const rules = bjRules(row.variant);
      const removed = rules ? rules.removedRanks : [];
      return res.json({
        ok: true,
        roundId: row.id,
        variant: row.variant as string,
        variantName: rules?.name ?? row.variant,
        bet: Number(row.bet),
        committed: Number(row.committed),
        hands: (row.hands as BjHand[]).map(handView),
        dealerCards: row.dealer_cards as number[],
        deck: row.deck as number[],
        deckCursor: Number(row.deck_cursor),
        results: row.results,
        totalPayout: Number(row.total_payout),
        dealerTotal: row.dealer_total === null ? null : Number(row.dealer_total),
        sideBet: Number(row.side_bet ?? 0),
        sidePayout: Number(row.side_payout ?? 0),
        sideResult: (row.side_result as string | null) ?? null,
        won: !!row.won,
        status: row.status,
        serverSeedHash: row.server_seed_hash,
        serverSeed: row.server_seed,
        clientSeed: row.client_seed,
        nonce: Number(row.nonce),
        removedRanks: removed,
        createdAt: row.created_at,
        settledAt: row.settled_at,
        recipe:
          'deck = pf.fisherYatesShuffle(serverSeed, clientSeed, nonce) → 52 indices 0..51' +
          (removed.length
            ? `, then every card of rank ${removed.join(', ')} is removed (${52 - removed.length * 4} left).`
            : '.') +
          ' rank = (idx % 13) + 1 (1 = Ace, 11/12/13 = J/Q/K); suit = floor(idx / 13). ' +
          (rules?.switchHands
            ? 'Two boxes: hand 1 = deck[0,2], hand 2 = deck[1,3], dealer = deck[4,5]. ' +
              'A switch trades the SECOND card of each hand before either draws.'
            : 'Dealing order is player, dealer, player, dealer — deck[0,2] to the player and ' +
              'deck[1,3] to the dealer.') +
          ' Every further card comes off the front of the deck in order.',
      });
    } catch (err) {
      logger.error('[arcade-bj-variants] verify failed', { error: (err as Error)?.message });
      return res.status(500).json({ ok: false, error: 'Could not load the round.' });
    }
  });

  logger.info('[arcade-bj-variants] routes registered');
}
