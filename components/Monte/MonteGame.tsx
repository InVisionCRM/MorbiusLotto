'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Diamond, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type GameState = 'idle' | 'showing' | 'shuffling' | 'guessing' | 'result'

interface Card {
  id: number
  isWinner: boolean
}

const SHUFFLE_SPEED = 500
const SHUFFLE_COUNT = 15

export interface MonteGameProps {
  variant?: 'standalone' | 'embedded'
  className?: string
}

export function MonteGame({ variant = 'standalone', className }: MonteGameProps) {
  const [gameState, setGameState] = useState<GameState>('idle')
  const [cards, setCards] = useState<Card[]>([
    { id: 0, isWinner: false },
    { id: 1, isWinner: true },
    { id: 2, isWinner: false },
  ])
  const [positions, setPositions] = useState<number[]>([0, 1, 2])
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [message, setMessage] = useState('FIND THE CYAN DIAMOND')

  const startGame = async () => {
    setGameState('showing')
    setMessage('MEMORIZE THE POSITION')
    setSelectedCard(null)
    setPositions([0, 1, 2])

    const newCards = [
      { id: 0, isWinner: false },
      { id: 1, isWinner: false },
      { id: 2, isWinner: false },
    ]
    const winnerId = Math.floor(Math.random() * 3)
    newCards[winnerId].isWinner = true
    setCards(newCards)

    await new Promise((resolve) => setTimeout(resolve, 2000))

    setGameState('shuffling')
    setMessage('KEEP YOUR EYE ON IT')

    let currentPositions = [0, 1, 2]
    for (let i = 0; i < SHUFFLE_COUNT; i++) {
      await new Promise((resolve) => setTimeout(resolve, SHUFFLE_SPEED))

      const slotA = Math.floor(Math.random() * 3)
      let slotB = Math.floor(Math.random() * 3)
      while (slotB === slotA) {
        slotB = Math.floor(Math.random() * 3)
      }

      const cardA = currentPositions.indexOf(slotA)
      const cardB = currentPositions.indexOf(slotB)

      const newPositions = [...currentPositions]
      newPositions[cardA] = slotB
      newPositions[cardB] = slotA
      currentPositions = newPositions

      setPositions(currentPositions)
    }

    await new Promise((resolve) => setTimeout(resolve, SHUFFLE_SPEED))
    setGameState('guessing')
    setMessage('WHERE IS IT?')
  }

  const handleCardClick = (cardId: number) => {
    if (gameState !== 'guessing') return

    setSelectedCard(cardId)
    setGameState('result')

    const isWin = cards[cardId].isWinner
    if (isWin) {
      setScore((s) => s + 1)
      setMessage('CORRECT')
    } else {
      setScore(0)
      setMessage('WRONG')
    }

    setTimeout(() => {
      setGameState('idle')
      setMessage(isWin ? 'PLAY AGAIN?' : 'TRY AGAIN?')
    }, 2000)
  }

  const getCardX = (slotIndex: number) => {
    const offset = slotIndex - 1
    return offset * 110
  }

  const isStandalone = variant === 'standalone'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center font-mono text-white',
        isStandalone ? 'min-h-screen w-full bg-black overflow-hidden selection:bg-cyan-900' : 'w-full',
        className,
      )}
    >
      {isStandalone && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10">
          <div>
            <h1 className="text-2xl font-bold tracking-[0.2em] text-cyan-400">MONTE</h1>
            <p className="text-xs text-zinc-500 tracking-widest mt-1">CASINO LOBBY</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-500 tracking-widest">STREAK</div>
            <div className="text-3xl font-bold text-cyan-400">{score}</div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center w-full max-w-2xl px-4">
        {!isStandalone && (
          <div className="w-full flex items-center justify-between mb-4 px-2">
            <div>
              <h2 className="text-sm font-bold tracking-[0.3em] text-cyan-400">MONTE</h2>
              <p className="text-[10px] text-zinc-600 tracking-[0.3em] mt-0.5">PLAY WHILE YOU WAIT</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-zinc-600 tracking-widest">STREAK</div>
              <div className="text-2xl font-bold text-cyan-400">{score}</div>
            </div>
          </div>
        )}

        <div className={cn('flex items-center justify-center', isStandalone ? 'h-12 mb-12' : 'h-10 my-4')}>
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'tracking-[0.15em] text-center text-zinc-300',
              isStandalone ? 'text-lg md:text-xl' : 'text-sm md:text-base',
            )}
          >
            {message}
          </motion.p>
        </div>

        <div
          className={cn(
            'relative w-full flex items-center justify-center [perspective:1000px]',
            isStandalone ? 'h-56' : 'h-44',
          )}
        >
          {cards.map((card) => {
            const slotIndex = positions[card.id]
            const isFaceUp =
              gameState === 'showing' || gameState === 'result' || (gameState === 'idle' && score === 0)
            const isSelected = selectedCard === card.id

            return (
              <motion.div
                key={card.id}
                className={cn(
                  'absolute rounded-sm cursor-pointer flex items-center justify-center [transform-style:preserve-3d]',
                  isStandalone ? 'w-24 h-36 md:w-28 md:h-40' : 'w-20 h-32 md:w-24 md:h-36',
                  gameState === 'guessing' && 'hover:scale-105',
                )}
                animate={{
                  x: getCardX(slotIndex),
                  rotateY: isFaceUp ? 0 : 180,
                  scale: isSelected ? 1.1 : 1,
                  y: isSelected ? -10 : 0,
                }}
                transition={{
                  x: { type: 'spring', stiffness: 120, damping: 20 },
                  rotateY: { duration: 0.4, ease: 'easeInOut' },
                  scale: { duration: 0.2 },
                  y: { duration: 0.2 },
                }}
                onClick={() => handleCardClick(card.id)}
              >
                <div
                  className={cn(
                    'absolute inset-0 bg-white rounded-sm border-2 flex items-center justify-center [backface-visibility:hidden]',
                    isSelected && card.isWinner
                      ? 'border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.4)]'
                      : isSelected && !card.isWinner
                      ? 'border-red-500'
                      : 'border-zinc-200',
                  )}
                >
                  {card.isWinner ? (
                    <Diamond
                      className={cn(isStandalone ? 'w-12 h-12 md:w-14 md:h-14' : 'w-10 h-10', 'text-cyan-400')}
                      strokeWidth={1.5}
                      fill="currentColor"
                    />
                  ) : (
                    <X
                      className={cn(isStandalone ? 'w-12 h-12 md:w-14 md:h-14' : 'w-10 h-10', 'text-zinc-200')}
                      strokeWidth={1.5}
                    />
                  )}
                </div>

                <div
                  className={cn(
                    'absolute inset-0 bg-zinc-950 rounded-sm border-2 flex items-center justify-center [backface-visibility:hidden]',
                    gameState === 'guessing'
                      ? 'border-cyan-400/30 hover:border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.1)] hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                      : 'border-zinc-800',
                  )}
                  style={{ transform: 'rotateY(180deg)' }}
                >
                  <div
                    className={cn(
                      'border border-zinc-800 rotate-45 flex items-center justify-center',
                      isStandalone ? 'w-10 h-10 md:w-12 md:h-12' : 'w-8 h-8',
                    )}
                  >
                    <div className={cn('border border-zinc-800', isStandalone ? 'w-4 h-4' : 'w-3 h-3')}></div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className={cn('flex items-center justify-center', isStandalone ? 'mt-16 h-16' : 'mt-8 h-12')}>
          <AnimatePresence>
            {(gameState === 'idle' || gameState === 'result') && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={startGame}
                className={cn(
                  'bg-transparent border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-all duration-300 font-bold tracking-[0.2em] uppercase focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-black',
                  isStandalone ? 'px-8 py-3 text-sm' : 'px-6 py-2 text-xs',
                )}
              >
                {score > 0 ? 'CONTINUE' : 'START GAME'}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {isStandalone && (
        <div className="absolute bottom-6 text-zinc-700 text-xs tracking-widest">
          WAITING FOR TRANSACTION...
        </div>
      )}
    </div>
  )
}
