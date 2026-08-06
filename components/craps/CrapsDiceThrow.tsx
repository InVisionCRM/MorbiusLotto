'use client';

/**
 * Craps dice thrown with real physics.
 *
 * The dice launch from the shooter's end, cross the felt, hit the back wall and
 * come back — a Matter.js rigid-body simulation, not a scripted arc. Every
 * bounce is a genuine collision, which matters for more than looks: the knock
 * you hear is fired *by* that collision at the energy it carried, so sound and
 * picture cannot drift apart the way a fixed audio timer always eventually does.
 *
 * What the physics does NOT decide is the result. The roll is settled on the
 * server and provably fair, so `val1`/`val2` arrive already determined and the
 * simulation is choreography around a known answer: the cubes tumble freely
 * while they are moving, then rotate to show the server's faces as they come to
 * rest. That last rotation is the one dishonest frame in an otherwise honest
 * simulation, and it is deliberate — the alternative is letting a client-side
 * physics engine pick the numbers, which would throw away the fairness proof
 * for a prettier settle.
 *
 * Rendering is deliberately split from React: the simulation writes transforms
 * straight to the DOM through refs. Sixty state updates a second would re-render
 * the whole felt for no reason.
 */

import { useCallback, useEffect, useRef } from 'react';
import Matter from 'matter-js';

import { tableAudio } from '@/lib/table-audio';

/** Logical arena, in physics units. Scaled to fit whatever width it is given. */
const ARENA_W = 520;
const ARENA_H = 190;
const DIE = 52;

/** Give up and settle by force if the dice somehow keep creeping. */
const MAX_THROW_MS = 4200;

interface CrapsDiceThrowProps {
  val1: number;
  val2: number;
  /**
   * Changes to start a throw. Use the roll's id so the same result thrown twice
   * still animates, and a re-render with unchanged state does not.
   * `null` renders the dice at rest without throwing.
   */
  rollKey: string | number | null;
  /** Fired once the dice have come to rest showing val1/val2. */
  onSettle?: () => void;
  className?: string;
}

/** Standard die face → the cube rotation that turns that face to the camera. */
function faceRotation(val: number): { x: number; y: number } {
  switch (val) {
    case 1: return { x: 0, y: 0 };
    case 2: return { x: 0, y: -90 };
    case 3: return { x: -90, y: 0 };
    case 4: return { x: 90, y: 0 };
    case 5: return { x: 0, y: 90 };
    case 6: return { x: 180, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

/**
 * The rotation equivalent to `target` that is nearest to where the die already
 * is. A cube at 1440° and a cube at 0° look identical, so settling should take
 * the short way round rather than visibly unwinding several turns.
 */
function nearestEquivalent(current: number, target: number): number {
  return target + Math.round((current - target) / 360) * 360;
}

function Pips({ num }: { num: number }) {
  const active: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const on = active[num] ?? [];
  return (
    <div className={`cdt-face cdt-face-${num}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className={on.includes(i) ? 'cdt-pip' : ''} />
      ))}
    </div>
  );
}

export function CrapsDiceThrow({
  val1,
  val2,
  rollKey,
  onSettle,
  className,
}: CrapsDiceThrowProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dieRefs = useRef<Array<HTMLDivElement | null>>([null, null]);

  const frameRef = useRef<number | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const settleCbRef = useRef<typeof onSettle>(onSettle);
  settleCbRef.current = onSettle;

  // Latest values, read by the running simulation without restarting it.
  const valsRef = useRef<[number, number]>([val1, val2]);
  valsRef.current = [val1, val2];

  /** Scale the logical arena down to whatever width the parent gives us. */
  const fit = useCallback(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return;
    const scale = Math.min(1, host.clientWidth / ARENA_W);
    stage.style.transform = `scale(${scale})`;
    host.style.height = `${ARENA_H * scale}px`;
  }, []);

  useEffect(() => {
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    if (hostRef.current) ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, [fit]);

  /** Paint a die without any simulation running. */
  const placeAtRest = useCallback(() => {
    const spots: Array<[number, number]> = [
      [ARENA_W * 0.42, ARENA_H - DIE / 2 - 6],
      [ARENA_W * 0.58, ARENA_H - DIE / 2 - 6],
    ];
    valsRef.current.forEach((v, i) => {
      const el = dieRefs.current[i];
      if (!el) return;
      const r = faceRotation(v);
      const [x, y] = spots[i];
      el.style.transform =
        `translate3d(${x - DIE / 2}px, ${y - DIE / 2}px, 0) ` +
        `rotateZ(0deg) rotateX(${r.x}deg) rotateY(${r.y}deg)`;
    });
  }, []);

  useEffect(() => {
    // No throw requested — just show the faces sitting on the felt.
    if (rollKey === null) {
      placeAtRest();
      return;
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      placeAtRest();
      settleCbRef.current?.();
      return;
    }

    const { Engine, Bodies, Composite, Body, Events } = Matter;

    const engine = Engine.create({ gravity: { x: 0, y: 1.35, scale: 0.001 } });
    engineRef.current = engine;

    // The far rail is springier than the floor on purpose: dice that hit it and
    // die there pile into the corner and end up stacked, which hides a face and
    // looks nothing like a real throw. Bouncing them back brings them to rest
    // out on the felt where both are readable.
    const wallOpts = { isStatic: true, restitution: 0.5, friction: 0.4 };
    const railOpts = { isStatic: true, restitution: 0.72, friction: 0.25 };
    const floor = Bodies.rectangle(ARENA_W / 2, ARENA_H + 30, ARENA_W + 200, 60, wallOpts);
    const ceiling = Bodies.rectangle(ARENA_W / 2, -60, ARENA_W + 200, 60, wallOpts);
    const leftWall = Bodies.rectangle(-30, ARENA_H / 2, 60, ARENA_H * 3, railOpts);
    const rightWall = Bodies.rectangle(ARENA_W + 30, ARENA_H / 2, 60, ARENA_H * 3, wallOpts);

    // Chamfered so they tumble on their corners rather than skating flat.
    const dieOpts = {
      restitution: 0.42,
      friction: 0.34,
      frictionAir: 0.012,
      density: 0.005,
      chamfer: { radius: 9 },
    };
    // Spawned apart rather than on top of each other, so they arrive at the
    // rail as two dice rather than a column.
    const d1 = Bodies.rectangle(ARENA_W - 40, 26, DIE, DIE, dieOpts);
    const d2 = Bodies.rectangle(ARENA_W - 96, 62, DIE, DIE, dieOpts);
    const dice = [d1, d2];

    Composite.add(engine.world, [floor, ceiling, leftWall, rightWall, d1, d2]);

    // Thrown down the felt toward the far rail, with real spin on them. The
    // two speeds are deliberately unequal: identical throws arrive together,
    // collide head-on and stack.
    dice.forEach((d, i) => {
      Body.setVelocity(d, {
        x: -(9 + i * 1.8) - Math.random() * 2.5,
        y: 1 + Math.random() * 2.5,
      });
      Body.setAngularVelocity(d, (Math.random() - 0.5) * 0.9 + (i === 0 ? 0.25 : -0.25));
    });

    // Resting contact re-fires collisionStart constantly; without a floor on
    // how often a surface may speak, a die nestling into a corner machine-guns.
    const lastHitAt = new Map<string, number>();
    const onCollide = (ev: Matter.IEventCollision<Matter.Engine>) => {
      const now = performance.now();
      for (const pair of ev.pairs) {
        const aIsDie = dice.includes(pair.bodyA as Matter.Body);
        const bIsDie = dice.includes(pair.bodyB as Matter.Body);
        if (!aIsDie && !bIsDie) continue;

        const key = `${pair.bodyA.id}-${pair.bodyB.id}`;
        if (now - (lastHitAt.get(key) ?? -Infinity) < 55) continue;
        lastHitAt.set(key, now);

        const speed = Math.max(
          aIsDie ? (pair.bodyA as Matter.Body).speed : 0,
          bIsDie ? (pair.bodyB as Matter.Body).speed : 0,
        );
        // 18 is about the launch speed, so a fresh throw hits near full volume.
        const strength = Math.min(1, speed / 18);

        let kind: 'wall' | 'die' | 'felt';
        if (aIsDie && bIsDie) kind = 'die';
        else if (pair.bodyA === floor || pair.bodyB === floor) kind = 'felt';
        else kind = 'wall';

        tableAudio.playDiceImpact(kind, strength);
      }
    };
    Events.on(engine, 'collisionStart', onCollide);

    // Free tumble while moving; on settle these tween to the server's faces.
    const spin = dice.map(() => ({
      x: Math.random() * 360,
      y: Math.random() * 360,
      vx: (Math.random() - 0.5) * 26,
      vy: (Math.random() - 0.5) * 26,
    }));

    const startedAt = performance.now();
    let calmFrames = 0;
    let settling: null | {
      at: number;
      from: Array<{ x: number; y: number; z: number }>;
      to: Array<{ x: number; y: number; z: number }>;
    } = null;
    let done = false;

    const paint = (
      i: number,
      body: Matter.Body,
      rx: number,
      ry: number,
      rz: number,
    ) => {
      const el = dieRefs.current[i];
      if (!el) return;
      // Order matters and is not the obvious one. CSS composes a transform
      // list in each step's local frame, so an rX/rY that turns a face to the
      // camera leaves local Z pointing sideways — a trailing rotateZ would
      // then tumble the die about a horizontal axis and show a different face
      // entirely. Spinning first, in the element's own frame, keeps rotateZ
      // the flat in-plane spin it is meant to be, and lets rX/rY decide the
      // face on their own.
      el.style.transform =
        `translate3d(${body.position.x - DIE / 2}px, ${body.position.y - DIE / 2}px, 0) ` +
        `rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
    };

    const SETTLE_MS = 380;

    const step = () => {
      const now = performance.now();
      Engine.update(engine, 1000 / 60);

      if (settling) {
        // Ease the cubes round to the faces the server rolled.
        const t = Math.min(1, (now - settling.at) / SETTLE_MS);
        const e = 1 - Math.pow(1 - t, 3);
        dice.forEach((body, i) => {
          const f = settling!.from[i];
          const to = settling!.to[i];
          paint(
            i,
            body,
            f.x + (to.x - f.x) * e,
            f.y + (to.y - f.y) * e,
            f.z + (to.z - f.z) * e,
          );
        });
        if (t >= 1) {
          if (!done) {
            done = true;
            tableAudio.playDiceSettle();
            settleCbRef.current?.();
          }
          return; // Frozen on the result; stop burning frames.
        }
        frameRef.current = requestAnimationFrame(step);
        return;
      }

      // Still in flight: tumble freely.
      dice.forEach((body, i) => {
        const s = spin[i];
        const energy = Math.min(1, body.speed / 10);
        s.x += s.vx * energy;
        s.y += s.vy * energy;
        paint(i, body, s.x, s.y, (body.angle * 180) / Math.PI);
      });

      const calm = dice.every(
        (d) => d.speed < 0.45 && Math.abs(d.angularSpeed) < 0.035,
      );
      calmFrames = calm ? calmFrames + 1 : 0;

      if (calmFrames > 10 || now - startedAt > MAX_THROW_MS) {
        settling = {
          at: now,
          from: dice.map((body, i) => ({
            x: spin[i].x,
            y: spin[i].y,
            z: (body.angle * 180) / Math.PI,
          })),
          to: dice.map((body, i) => {
            const r = faceRotation(valsRef.current[i]);
            return {
              x: nearestEquivalent(spin[i].x, r.x),
              y: nearestEquivalent(spin[i].y, r.y),
              z: (body.angle * 180) / Math.PI,
            };
          }),
        };
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      Events.off(engine, 'collisionStart', onCollide);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      engineRef.current = null;
    };
  }, [rollKey, placeAtRest]);

  // Result changed without a new throw (e.g. a reconnect) — show it as-is.
  useEffect(() => {
    if (rollKey === null) placeAtRest();
  }, [val1, val2, rollKey, placeAtRest]);

  return (
    <div ref={hostRef} className={`cdt-host ${className ?? ''}`}>
      <div ref={stageRef} className="cdt-stage">
        {[0, 1].map((i) => (
          <div
            key={i}
            ref={(el) => { dieRefs.current[i] = el; }}
            className="cdt-die"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => <Pips key={n} num={n} />)}
          </div>
        ))}
      </div>
      <CrapsDiceThrowStyles />
    </div>
  );
}

/**
 * Scoped to this component rather than reusing the `.craps-root` dice rules,
 * so the multiplayer felt gets identical dice without having to inherit that
 * page's wrapper class.
 */
function CrapsDiceThrowStyles() {
  return (
    <style jsx global>{`
      .cdt-host {
        position: relative;
        width: 100%;
        overflow: hidden;
      }
      .cdt-stage {
        position: absolute;
        top: 0;
        left: 0;
        width: ${ARENA_W}px;
        height: ${ARENA_H}px;
        transform-origin: top left;
        perspective: 900px;
      }
      .cdt-die {
        position: absolute;
        top: 0;
        left: 0;
        width: ${DIE}px;
        height: ${DIE}px;
        transform-style: preserve-3d;
        will-change: transform;
      }
      .cdt-face {
        position: absolute;
        width: ${DIE}px;
        height: ${DIE}px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        padding: 7px;
        box-sizing: border-box;
        background: radial-gradient(
          circle at 30% 28%,
          #fffaf0 0%,
          #f7ecc8 60%,
          #d9c79a 100%
        );
        border-radius: 9px;
        box-shadow:
          inset 0 0 0 1px rgba(34, 211, 238, 0.35),
          inset 0 -3px 6px rgba(0, 0, 0, 0.12),
          0 2px 6px rgba(0, 0, 0, 0.4);
      }
      .cdt-face > div {
        width: 10px;
        height: 10px;
        margin: auto;
        border-radius: 50%;
      }
      .cdt-face > div.cdt-pip {
        background: radial-gradient(circle at 30% 30%, #4a352a 0%, #1a0c08 100%);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.15);
      }
      .cdt-face-1 { transform: rotateY(0deg) translateZ(${DIE / 2}px); }
      .cdt-face-2 { transform: rotateY(90deg) translateZ(${DIE / 2}px); }
      .cdt-face-3 { transform: rotateX(90deg) translateZ(${DIE / 2}px); }
      .cdt-face-4 { transform: rotateX(-90deg) translateZ(${DIE / 2}px); }
      .cdt-face-5 { transform: rotateY(-90deg) translateZ(${DIE / 2}px); }
      .cdt-face-6 { transform: rotateY(180deg) translateZ(${DIE / 2}px); }
    `}</style>
  );
}
