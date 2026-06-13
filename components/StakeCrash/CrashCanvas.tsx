'use client';

/**
 * CrashCanvas — the space-flight canvas for /crash.
 *
 * Faithful port of the crash prototype's GameCanvas: parallax starfield with
 * streak stretching, atmosphere gradient that fades with altitude, drifting
 * image planets (Jupiter at 5–25×, the red planet at 40–80×), the rotating
 * home planet sinking away, scrolling grid, quadratic-bezier flight curve
 * with neon glow + fill, the rocket sprite with exhaust particles, boost
 * bursts at multiplier thresholds, explosion debris + screen shake + flash,
 * and the launch countdown text/progress bar.
 *
 * Assets live in /public/crash/ (compressed .webp versions of the prototype's
 * originals).
 */

import { useEffect, useRef } from 'react';
import { useCrashStore } from './useCrashStore';

export default function CrashCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { phase, multiplier, countingDown, countdownLeft } = useCrashStore();
  const phaseRef = useRef(phase);
  const multRef = useRef(multiplier);
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    multRef.current = multiplier;
    countdownRef.current = countingDown ? countdownLeft : null;
  }, [phase, multiplier, countingDown, countdownLeft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationId: number;
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      color: string;
      size: number;
      shape: 'circle' | 'square' | 'line';
      rot?: number;
      vRot?: number;
    }
    const particles: Particle[] = [];

    let lastShipX: number | null = null;
    let lastShipY: number | null = null;
    let shipAngle = 0;
    let explosionShake = 0;

    // Boost effect tracking
    const boostThresholds = [2, 5, 15, 35, 50, 100, 250, 500, 1000];
    let nextBoostIndex = 0;
    let activeBoostFrames = 0;

    interface BackgroundStar {
      x: number;
      y: number;
      size: number;
      speed: number;
      alpha: number;
    }
    const bgStars: BackgroundStar[] = Array.from({ length: 150 }).map(() => ({
      x: Math.random() * 3000,
      y: Math.random() * 3000,
      size: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.2, // soft glow
    }));

    interface BackgroundPlanet {
      startM: number;
      endM: number;
      startX: number; // Percentage of canvas width (0 to 1)
      radius: number;
      alpha: number;
      image: HTMLImageElement;
    }

    const jupiterImg = new window.Image();
    jupiterImg.src = '/crash/jupiter.webp';
    const redPlanetImg = new window.Image();
    redPlanetImg.src = '/crash/red-planet.webp';

    const bgPlanets: BackgroundPlanet[] = [
      {
        startM: 5,
        endM: 25,
        startX: 0.8, // 80% to the right
        radius: 400,
        alpha: 0.7,
        image: jupiterImg,
      },
      {
        startM: 40,
        endM: 80,
        startX: 0.2, // 20% from the left
        radius: 600,
        alpha: 0.85,
        image: redPlanetImg,
      },
    ];

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    const shipImage = new window.Image();
    shipImage.src = '/crash/rocket.webp';
    const planetImage = new window.Image();
    planetImage.src = '/crash/planet.webp';

    let explosionCreated = false;
    let currentStarSpeedMult = 0.2;
    let smoothedShipAngle = 0;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const m = multRef.current;
      const p = phaseRef.current;

      ctx.clearRect(0, 0, w, h);

      // --- Atmosphere Gradient (Subtle Lighter Cyan-Purple) ---
      // Fades out as multiplier goes up to simulate leaving the atmosphere
      const atmosphereAlpha =
        p === 'betting' ? 1 : Math.max(0, 1 - Math.log10(Math.max(1, m)) / Math.log10(10));
      if (atmosphereAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = atmosphereAlpha;
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, 'rgba(80, 50, 140, 0.7)'); // Darker purple high in the sky
        skyGrad.addColorStop(1, 'rgba(35, 140, 170, 0.7)'); // Darker cyan near the horizon
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // --- Draw Dynamic Stars Background ---
      ctx.save();
      let targetStarSpeedMult = 0.2; // default slow drift
      let targetStarMoveAngle = Math.PI; // drift slowly left

      if (p === 'flying') {
        targetStarSpeedMult = 2 + Math.min(15, (m - 1) * 2); // speed up with multiplier
        if (lastShipX !== null) targetStarMoveAngle = shipAngle;
      } else if (p === 'crashed') {
        targetStarSpeedMult = 0.5; // decelerate heavily
        if (lastShipX !== null) targetStarMoveAngle = shipAngle;
      }

      // Smooth interpolation for stars
      currentStarSpeedMult += (targetStarSpeedMult - currentStarSpeedMult) * 0.05;

      // Angle smoothing to prevent jerky lines at lower speeds
      const angleDiff = targetStarMoveAngle - smoothedShipAngle;
      smoothedShipAngle += angleDiff * 0.1;

      // Draw distant background planets (using image assets)
      for (const pnt of bgPlanets) {
        if (m >= pnt.startM - 1) {
          // Load slightly before it appears
          const progress = Math.min(1, Math.max(0, (m - pnt.startM) / (pnt.endM - pnt.startM)));

          // Move from -radius (above screen) to h + radius (below screen)
          const currentY = -pnt.radius + progress * (h + pnt.radius * 3);
          const currentX = w * pnt.startX;

          ctx.save();
          ctx.translate(currentX, currentY);
          ctx.globalAlpha = p === 'betting' ? pnt.alpha * 0.5 : pnt.alpha;

          if (pnt.image.complete && pnt.image.naturalWidth > 0) {
            ctx.drawImage(pnt.image, -pnt.radius, -pnt.radius, pnt.radius * 2, pnt.radius * 2);
          }

          ctx.restore();
        }
      }

      for (const s of bgStars) {
        // Star movement is opposite to the ship's angle + tail stretch
        s.x -= Math.cos(smoothedShipAngle) * s.speed * currentStarSpeedMult;
        s.y -= Math.sin(smoothedShipAngle) * s.speed * currentStarSpeedMult;

        // Wrap Boundaries smoothly using modulo
        s.x = ((s.x % w) + w) % w;
        s.y = ((s.y % h) + h) % h;

        ctx.globalAlpha =
          p === 'betting' ? s.alpha * 0.3 : Math.min(1, s.alpha * (currentStarSpeedMult / 2));

        if (currentStarSpeedMult > 2) {
          ctx.beginPath();
          ctx.lineWidth = s.size;
          ctx.strokeStyle = 'white';
          ctx.moveTo(s.x, s.y);
          // Streaking effect backward (capped max length to prevent giant clusters)
          const stretch = Math.min(50, currentStarSpeedMult * s.speed * 1.2);
          ctx.lineTo(
            s.x + Math.cos(smoothedShipAngle) * stretch,
            s.y + Math.sin(smoothedShipAngle) * stretch,
          );
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.fillStyle = 'white';
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // --- Draw Planet Overlay ---
      if (planetImage.complete && planetImage.naturalWidth > 0) {
        ctx.save();
        const planetMaxW = 2500;
        const planetW = Math.min(w * 2.5, planetMaxW);
        const planetH = (planetImage.naturalHeight / planetImage.naturalWidth) * planetW;

        // Planet parallax: Starts lower (moved down ~50%)
        const dropProgress = Math.min(1, Math.log10(Math.max(1, m)) / Math.log10(100));
        const startY = h - planetH * 0.225;
        const currentPlanetY = startY + dropProgress * planetH * 0.8; // Sink down

        const planetCenterX = w / 2;
        const planetCenterY = currentPlanetY + planetH / 2;

        // Calculate very slow clockwise rotation
        const rotationAngle = (Date.now() / 20000) % (Math.PI * 2);

        ctx.globalAlpha = 1.0; // Fully opaque so stars don't shine through it
        ctx.translate(planetCenterX, planetCenterY);
        ctx.rotate(rotationAngle);
        ctx.drawImage(planetImage, -planetW / 2, -planetH / 2, planetW, planetH);
        ctx.restore();
      }

      // Calculate Screen Shake Intensity tied to multiplier & explosion
      let currentShake = 0;
      if (p === 'flying') {
        // Gentle rumble that increases with multiplier
        currentShake = Math.min(6, (m - 1) * 0.2);
        if (m < 1.1) currentShake = 0; // Smooth start
      } else if (p === 'crashed') {
        currentShake = explosionShake;
        explosionShake *= 0.85; // Decay
      }

      ctx.save(); // Save pre-shake transform
      if (currentShake > 0.1) {
        ctx.translate((Math.random() - 0.5) * currentShake, (Math.random() - 0.5) * currentShake);
      }

      // Draw Grid manually since we do a cool scrolling effect
      const gridOffset = p === 'flying' ? (performance.now() / 50) % 40 : 0;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = 0; x < w; x += 40) {
        ctx.moveTo(x - gridOffset, 0);
        ctx.lineTo(x - gridOffset, h);
      }
      for (let y = h; y > 0; y -= 40) {
        ctx.moveTo(0, y + gridOffset);
        ctx.lineTo(w, y + gridOffset);
      }
      ctx.stroke();

      // Coordinate scaling
      // When mult goes up, we compress the Y axis
      const paddingX = Math.min(100, w * 0.1);
      const paddingY = Math.min(50, h * 0.1);

      const startX = paddingX;
      const startY = h - paddingY;

      // X grows logarithmically or linearly with time, capped at 80% width
      const visualProgress = Math.min(1, (Math.log10(m) / Math.log10(100)) * 1.5); // normalized roughly for up to 100x
      const currentX = startX + (w - paddingX * 2) * Math.min(0.8, visualProgress * 1.2);

      // Y grows with multiplier
      const yRange = startY - paddingY;
      const yRatio = (m - 1) / (m * 1.2 - 1 + 0.0001); // avoid / 0
      const currentY = startY - yRange * yRatio;

      // Draw Curve
      if (m > 1 || p === 'flying' || p === 'crashed') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        // Quadratic bezier curve to bend it upwards
        const cp1x = startX + (currentX - startX) * 0.8;
        const cp1y = startY;

        ctx.quadraticCurveTo(cp1x, cp1y, currentX, currentY);

        ctx.lineWidth = 6;
        ctx.strokeStyle = p === 'crashed' ? '#ff3e3e' : '#00ffa3'; // Immersive UI red or green

        // Glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.stroke();

        ctx.shadowBlur = 0; // reset

        // Fill gradient
        const grad = ctx.createLinearGradient(0, currentY, 0, startY);
        grad.addColorStop(0, p === 'crashed' ? 'rgba(255, 62, 62, 0.2)' : 'rgba(0, 255, 163, 0.2)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.lineTo(currentX, startY);
        ctx.lineTo(startX, startY);
        ctx.fillStyle = grad;
        ctx.fill();

        // Compute Ship Rotation Vector
        if (lastShipX !== null && lastShipY !== null && p !== 'betting') {
          const dx = currentX - lastShipX;
          const dy = currentY - lastShipY;
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            shipAngle = Math.atan2(dy, dx);
          }
        }
        lastShipX = currentX;
        lastShipY = currentY;

        // Draw Rocket / Ship
        if (p === 'flying') {
          while (nextBoostIndex < boostThresholds.length && m >= boostThresholds[nextBoostIndex]) {
            activeBoostFrames = 45; // ~0.75 seconds of heavy exhaust at 60fps
            nextBoostIndex++;
          }
          if (activeBoostFrames > 0) activeBoostFrames--;

          // Offset exhaust by 15px backward along the ship's angle
          const exhaustX = currentX - Math.cos(shipAngle) * 15;
          const exhaustY = currentY - Math.sin(shipAngle) * 15;

          // Emit dynamic trail particles (fire/exhaust)
          const particlesToEmit = activeBoostFrames > 0 ? 6 : Math.random() > 0.1 ? 1 : 0;

          for (let i = 0; i < particlesToEmit; i++) {
            const spread = (Math.random() - 0.5) * (activeBoostFrames > 0 ? 0.8 : 0.5);
            const speedMultiplier =
              activeBoostFrames > 0 ? Math.random() * 10 + 6 : Math.random() * 5 + 3;
            const extraLife = activeBoostFrames > 0 ? 0.5 : 0;
            const boostColor = Math.random() > 0.5 ? '#ffffff' : '#00ffff';
            const standardColor = Math.random() > 0.5 ? '#00ffa3' : '#00b372';

            particles.push({
              x: exhaustX,
              y: exhaustY,
              vx: -Math.cos(shipAngle + spread) * speedMultiplier,
              vy: -Math.sin(shipAngle + spread) * speedMultiplier,
              life: 1.0,
              maxLife: 0.8 + Math.random() * 0.5 + extraLife,
              color: activeBoostFrames > 0 ? boostColor : standardColor,
              size: Math.random() * 3 + (activeBoostFrames > 0 ? 3.0 : 1.5),
              shape: Math.random() > 0.6 ? 'circle' : 'line',
              rot: shipAngle + spread,
            });
          }

          // Draw Sleek Cyber-Ship
          ctx.save();
          ctx.translate(currentX, currentY);

          if (shipImage.complete && shipImage.naturalWidth > 0) {
            // The rocket image points UP. We rotate by an extra 90 degrees (PI/2)
            // so that its nose points in the direction of the shipAngle.
            ctx.rotate(shipAngle + Math.PI / 2);

            // Neon Glow effect for the image to match the world
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffa3';

            const targetWidth = 96; // Scale as needed (doubled)
            const targetHeight = (shipImage.naturalHeight / shipImage.naturalWidth) * targetWidth;
            ctx.drawImage(shipImage, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
          }

          ctx.restore();
        } else if (p === 'crashed') {
          if (!explosionCreated) {
            explosionCreated = true;
            explosionShake = 25; // Trigger massive screen shake on impact

            // Screen flash
            ctx.save();
            ctx.fillStyle = 'rgba(255, 62, 62, 0.4)';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();

            // Detailed Explosion Particles (Debris & Fire)
            for (let i = 0; i < 80; i++) {
              const speed = Math.random() * 12 + 2;
              const angle = Math.random() * Math.PI * 2;
              particles.push({
                x: currentX,
                y: currentY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                maxLife: 0.8 + Math.random() * 1.5,
                color: ['#ff3e3e', '#ff9d00', '#ffffff', '#848ca1'][Math.floor(Math.random() * 4)],
                size: Math.random() * 5 + 2,
                shape: Math.random() > 0.7 ? 'square' : 'circle',
                rot: Math.random() * Math.PI,
                vRot: (Math.random() - 0.5) * 0.4,
              });
            }
          }
        }
      } else {
        explosionCreated = false;
        // Draw idle ship waiting to launch
        ctx.save();
        ctx.translate(startX, startY);

        if (shipImage.complete && shipImage.naturalWidth > 0) {
          // Keep the rocket vertically upright during the idle betting phase
          ctx.rotate(0);
          const targetWidth = 96; // Doubled
          const targetHeight = (shipImage.naturalHeight / shipImage.naturalWidth) * targetWidth;
          // Slight idle hover effect
          const hoverOffset = Math.sin(performance.now() / 300) * 2;
          ctx.drawImage(
            shipImage,
            -targetWidth / 2,
            -targetHeight / 2 + hoverOffset,
            targetWidth,
            targetHeight,
          );
        }

        ctx.restore();
      }

      // Render Advanced Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.015;

        if (pt.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(pt.x, pt.y);
        if (pt.rot !== undefined) {
          ctx.rotate(pt.rot);
          if (pt.vRot) pt.rot += pt.vRot;
        }

        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.strokeStyle = pt.color;

        if (pt.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, pt.size * (pt.life / pt.maxLife), 0, Math.PI * 2);
          ctx.fill();
        } else if (pt.shape === 'square') {
          const sq = pt.size * (pt.life / pt.maxLife) * 1.5;
          ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
        } else if (pt.shape === 'line') {
          ctx.lineWidth = Math.max(1, pt.size * (pt.life / pt.maxLife));
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-pt.size * 4, 0); // Tail length
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw launch countdown text while the bet is armed
      if (p === 'betting') {
        const currentC = countdownRef.current;
        if (currentC !== null) {
          const cVal = currentC.toFixed(1);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.font = '20px "Helvetica Neue", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Starting in ${cVal}s`, w / 2, h / 2 + 100);

          // Progress bar for countdown
          const progW = 200;
          const progVal = currentC / 3.0;
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(w / 2 - progW / 2, h / 2 + 120, progW, 4);
          ctx.fillStyle = '#00ffa3'; // Immersive UI green
          ctx.fillRect(w / 2 - progW / 2, h / 2 + 120, progW * progVal, 4);
        }
      }

      // Draw graph borders (L-shape)
      ctx.beginPath();
      ctx.moveTo(paddingX, paddingY);
      ctx.lineTo(paddingX, h - paddingY);
      ctx.lineTo(w - paddingX, h - paddingY);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore(); // Restore pre-shake transform

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [phase]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[300px] overflow-hidden rounded-[16px] bg-transparent"
    >
      <canvas ref={canvasRef} className="block w-full h-full touch-none relative z-20" />
    </div>
  );
}
