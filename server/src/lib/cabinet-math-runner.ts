/**
 * Runs the (vendored) slot math core server-side to produce an RTP figure
 * for a community-built machine at save/publish time.
 *
 * These cabinets are play-money only (no wallet/ledger wiring — see
 * public/slots/cabinet-engine.js), so this is a fairness signal shown to
 * the creator, not a financial gate. It's still worth running for real: a
 * broken paytable (0% RTP, or an absurd one) makes a published machine a
 * bad first impression for whoever plays it embedded on someone else's site.
 *
 * vendor/cabinet-math.js is a plain browser IIFE (`window.CabinetMath = {...}`),
 * so it's evaluated inside a throwaway vm context rather than required as a
 * module — that keeps it byte-identical to the client copy with zero
 * translation layer that could drift from what players actually play.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const VENDOR_SRC = fs.readFileSync(path.join(__dirname, 'vendor', 'cabinet-math.js'), 'utf8');

// Sane-band constants for the informational rtp_flagged signal. Generous on
// purpose — this is "does this look broken," not a strict certification.
const MIN_SANE_RTP_PCT = Number(process.env.SLOT_RTP_MIN_PCT ?? 60);
const MAX_SANE_RTP_PCT = Number(process.env.SLOT_RTP_MAX_PCT ?? 150);
const MAX_SANE_WIN_X = Number(process.env.SLOT_RTP_MAX_WIN_X ?? 10000);
const SIM_SPINS = Number(process.env.SLOT_RTP_SIM_SPINS ?? 20000);

export interface SlotMachineRtpResult {
  rtp: number;
  hit: number;
  maxX: number;
  spins: number;
  flagged: boolean;
}

function runInSandbox(def: unknown, spins: number, seedBase: string): { rtp: number; hit: number; maxX: number; spins: number } {
  const sandboxWindow: Record<string, any> = {};
  const context = vm.createContext({ window: sandboxWindow });
  vm.runInContext(VENDOR_SRC, context, { timeout: 10000 });
  const CabinetMath = sandboxWindow.CabinetMath;
  if (!CabinetMath || typeof CabinetMath.simulate !== 'function') {
    throw new Error('vendored cabinet-math.js failed to expose CabinetMath.simulate');
  }
  // simulate() mutates the def it's given (indexSyms stamps def._byId) —
  // pass a structural clone so the caller's object is never touched.
  const clonedDef = JSON.parse(JSON.stringify(def));
  return CabinetMath.simulate(clonedDef, spins, seedBase);
}

/** Simulates a machine definition and flags it if the result looks broken. Throws if `def` isn't shaped like a machine (missing symbols/cols/rows). */
export function simulateDef(def: unknown, seedBase: string, spins: number = SIM_SPINS): SlotMachineRtpResult {
  const result = runInSandbox(def, spins, seedBase);
  const flagged =
    !Number.isFinite(result.rtp) ||
    result.rtp < MIN_SANE_RTP_PCT ||
    result.rtp > MAX_SANE_RTP_PCT ||
    !Number.isFinite(result.maxX) ||
    result.maxX > MAX_SANE_WIN_X;
  return { rtp: result.rtp, hit: result.hit, maxX: result.maxX, spins: result.spins, flagged };
}
