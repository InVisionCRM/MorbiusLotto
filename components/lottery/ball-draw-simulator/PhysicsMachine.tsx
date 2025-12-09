'use client'

/* eslint-disable react/forbid-dom-props */
import React, { useRef, useEffect, useCallback } from 'react'
import { BallData } from './types'

interface PhysicsMachineProps {
  width: number
  height: number
  ballCount: number // 30 balls
  isMixing: boolean
  drawnBallIds: number[] // List of ball IDs already drawn (1-30)
  onBallSelected: (ballId: number, winningNumber: number) => void // ballId and the winning number
  targetWinningNumber?: number | null // The winning number (1-55) to assign to the selected ball
  triggerDraw: boolean // Toggle this to trigger a draw sequence
}

const BALL_RADIUS = 15
const DAMPING = 0.99
const WALL_BOUNCE = 0.6
const BALL_BOUNCE = 0.8
const GRAVITY = 0.25
const MIX_FORCE = 0.8

const PhysicsMachine: React.FC<PhysicsMachineProps> = ({
  width,
  height,
  ballCount,
  isMixing,
  drawnBallIds,
  onBallSelected,
  targetWinningNumber,
  triggerDraw,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestRef = useRef<number | null>(null)
  const ballsRef = useRef<BallData[]>([])

  // Use Refs for animation state to avoid re-renders breaking the physics loop
  const drawingStateRef = useRef<'idle' | 'selecting' | 'sucking'>('idle')
  const selectedBallRef = useRef<BallData | null>(null)
  const suctionFramesRef = useRef<number>(0)

  // Keep latest props in refs for the loop
  const propsRef = useRef({ isMixing, drawnBallIds, targetWinningNumber, onBallSelected })

  useEffect(() => {
    propsRef.current = { isMixing, drawnBallIds, targetWinningNumber, onBallSelected }
  }, [isMixing, drawnBallIds, targetWinningNumber, onBallSelected])

  useEffect(() => {
    if (triggerDraw && drawingStateRef.current === 'idle') {
      drawingStateRef.current = 'selecting'
      suctionFramesRef.current = 0
    }
  }, [triggerDraw])

  // Initialize balls - 30 balls with random numbers 1-55
  useEffect(() => {
    if (ballsRef.current.length === 0 || ballsRef.current.length !== ballCount) {
      const initialBalls: BallData[] = []
      const centerX = width / 2
      const centerY = height / 2

      for (let i = 1; i <= ballCount; i++) {
        const angle = i * 0.5
        const radius = 30 + i * 2
        // Random number between 1-55 for each ball
        const randomNumber = Math.floor(Math.random() * 55) + 1
        initialBalls.push({
          id: i, // Ball ID (1-30)
          label: randomNumber.toString(), // Display number (1-55, random initially)
          colorType: 'white',
          x: centerX + Math.cos(angle) * Math.min(radius, width / 2 - 60),
          y: centerY + Math.sin(angle) * Math.min(radius, height / 2 - 60),
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          angle: Math.random() * Math.PI * 2,
          vAngle: 0,
          state: 'idle',
        })
      }
      ballsRef.current = initialBalls
    }
  }, [ballCount, width, height])

  const updatePhysics = useCallback(() => {
    const balls = ballsRef.current
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    const { isMixing, drawnBallIds, targetWinningNumber, onBallSelected } = propsRef.current
    const currentState = drawingStateRef.current

    const centerX = width / 2
    const centerY = height / 2
    const containerRadius = Math.min(width, height) / 2 - 12

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw Container Back
    ctx.beginPath()
    ctx.arc(centerX, centerY, containerRadius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 6
    ctx.stroke()

    // Draw Tube (lifted up 5px)
    const tubeWidth = BALL_RADIUS * 2 + 10
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.fillRect(centerX - tubeWidth / 2, -5, tubeWidth, centerY - containerRadius + 45)

    const SUB_STEPS = 5

    for (let step = 0; step < SUB_STEPS; step++) {
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i]

        if (drawnBallIds.includes(b.id) && b.state === 'drawn') continue

        // --- Sucking Animation ---
        if (currentState === 'sucking' && selectedBallRef.current?.id === b.id) {
          if (step === 0) {
            const targetX = centerX
            const targetY = -40
            const dx = targetX - b.x
            const dy = targetY - b.y

            b.x += dx * 0.15
            b.y += dy * 0.15
            b.vAngle *= 0.8
            suctionFramesRef.current += 1

            if (b.y < 60 || suctionFramesRef.current > 240) {
              b.state = 'drawn'
              drawingStateRef.current = 'idle'
              // Pass both ball ID and the winning number (from label)
              const winningNumber = parseInt(b.label, 10)
              onBallSelected(b.id, winningNumber)
              selectedBallRef.current = null
              suctionFramesRef.current = 0
            }
          }
        } else if (currentState === 'selecting' && !selectedBallRef.current && step === 0) {
          // Select a random available ball
          const available = balls.filter(
            (ball) => !drawnBallIds.includes(ball.id) && ball.state !== 'drawn'
          )

          if (available.length > 0) {
            const candidate = available[Math.floor(Math.random() * available.length)]

            // If targetWinningNumber is provided, update the ball's label to show that number
            if (targetWinningNumber !== null && targetWinningNumber !== undefined) {
              candidate.label = targetWinningNumber.toString()
            }

            selectedBallRef.current = candidate
            drawingStateRef.current = 'sucking'
          } else {
            drawingStateRef.current = 'idle'
          }
        } else {
          // --- Standard Physics ---

          if (isMixing) {
            // 1. Random Chaos
            b.vx += (Math.random() - 0.5) * MIX_FORCE / SUB_STEPS
            b.vy += (Math.random() - 0.5) * MIX_FORCE / SUB_STEPS

            // 2. Swirling Vortex Wind (Rotational force)
            const dx = b.x - centerX
            const dy = b.y - centerY
            const angle = Math.atan2(dy, dx)

            // Force perpendicular to radius (tangential)
            const swirlStrength = 0.18
            b.vx += -Math.sin(angle) * swirlStrength / SUB_STEPS
            b.vy += Math.cos(angle) * swirlStrength / SUB_STEPS

            // 3. Central Updraft (Push up from bottom middle)
            if (Math.abs(dx) < 40 && dy > 0) {
              b.vy -= MIX_FORCE * 1.8 / SUB_STEPS
              // Push out slightly to cycle them
              b.vx += (dx > 0 ? 1 : -1) * 0.8 / SUB_STEPS
            }
          } else {
            // Air resistance when not mixing
            b.vx *= 0.99
            b.vy *= 0.99
          }

          b.vy += GRAVITY / SUB_STEPS

          b.x += b.vx
          b.y += b.vy
          b.angle += b.vAngle / SUB_STEPS

          // Wall Collision
          const dx = b.x - centerX
          const dy = b.y - centerY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist + BALL_RADIUS > containerRadius) {
            const nx = dx / dist
            const ny = dy / dist
            const dot = b.vx * nx + b.vy * ny

            // Bounce
            b.vx = (b.vx - 2 * dot * nx) * WALL_BOUNCE
            b.vy = (b.vy - 2 * dot * ny) * WALL_BOUNCE

            // Push out
            const overlap = dist + BALL_RADIUS - containerRadius
            b.x -= nx * (overlap + 0.1)
            b.y -= ny * (overlap + 0.1)

            // Spin on bounce - ONLY if hitting hard enough
            const impactSpeed = Math.abs(dot)
            if (impactSpeed > 1.0) {
              b.vAngle += (Math.random() - 0.5) * 0.1 * impactSpeed
            }
          }

          // Damping
          b.vx *= Math.pow(DAMPING, 1 / SUB_STEPS)
          b.vy *= Math.pow(DAMPING, 1 / SUB_STEPS)

          // Angular damping
          b.vAngle *= 0.95
        }
      }

      // Ball-to-Ball Collision
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i]
        if (
          (drawnBallIds.includes(b.id) && b.state === 'drawn') ||
          (currentState === 'sucking' && selectedBallRef.current?.id === b.id)
        )
          continue

        for (let j = i + 1; j < balls.length; j++) {
          const b2 = balls[j]
          if (
            (drawnBallIds.includes(b2.id) && b2.state === 'drawn') ||
            (currentState === 'sucking' && selectedBallRef.current?.id === b2.id)
          )
            continue

          const dx2 = b2.x - b.x
          const dy2 = b2.y - b.y
          const dist2Sq = dx2 * dx2 + dy2 * dy2
          const minDist = BALL_RADIUS * 2

          if (dist2Sq < minDist * minDist) {
            const dist2 = Math.sqrt(dist2Sq)
            const nx = dx2 / dist2
            const ny = dy2 / dist2

            const rvx = b2.vx - b.vx
            const rvy = b2.vy - b.vy
            const velAlongNormal = rvx * nx + rvy * ny

            if (velAlongNormal < 0) {
              const jImpulse = -(1 + BALL_BOUNCE) * velAlongNormal
              const impulseX = nx * jImpulse * 0.5
              const impulseY = ny * jImpulse * 0.5

              b.vx -= impulseX
              b.vy -= impulseY
              b2.vx += impulseX
              b2.vy += impulseY
            }

            const overlap = minDist - dist2
            if (overlap > 0) {
              const correction = overlap / 2
              b.x -= nx * correction
              b.y -= ny * correction
              b2.x += nx * correction
              b2.y += ny * correction
            }
          }
        }
      }
    }

    // --- Rendering ---
    balls.forEach((b) => {
      if (drawnBallIds.includes(b.id) && b.state === 'drawn') return

      // Shadow
      ctx.beginPath()
      ctx.arc(b.x + 2, b.y + 2, BALL_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fill()

      // Ball Body
      ctx.beginPath()
      ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2)
      const grad = ctx.createRadialGradient(b.x - 5, b.y - 5, 2, b.x, b.y, BALL_RADIUS)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(1, '#cbd5e1')
      ctx.fillStyle = grad
      ctx.fill()

      // Label
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.angle)
      ctx.fillStyle = '#1e293b'
      ctx.font = 'bold 14px Roboto, Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(b.label, 0, 1)

      // Underscore for 6/9 ambiguity
      if (['6', '9', '66', '99', '69', '96', '19', '61'].includes(b.label)) {
        ctx.fillRect(-5, 8, 10, 1.5)
      }
      ctx.restore()
    })

    // Glass Reflection
    const shine = ctx.createRadialGradient(
      centerX - containerRadius / 3,
      centerY - containerRadius / 3,
      10,
      centerX,
      centerY,
      containerRadius
    )
    shine.addColorStop(0, 'rgba(255,255,255,0.1)')
    shine.addColorStop(0.5, 'rgba(255,255,255,0.02)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.beginPath()
    ctx.arc(centerX, centerY, containerRadius, 0, Math.PI * 2)
    ctx.fill()

    requestRef.current = requestAnimationFrame(updatePhysics)
  }, [width, height])

  // Start Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePhysics)
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
    }
  }, [updatePhysics])

  return (
    <div className="relative mx-auto">
      <canvas ref={canvasRef} width={width} height={height} className="block" />
    </div>
  )
}

export default PhysicsMachine
