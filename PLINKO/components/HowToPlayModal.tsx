'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface HowToPlayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HowToPlayModal({ open, onOpenChange }: HowToPlayModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-white max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-gray-900 text-center">
            How to Play Plinko
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Introduction */}
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-gray-900">Welcome to Plinko!</h3>
            <p className="text-gray-700 leading-relaxed">
              Plinko is an exciting game of chance where you drop balls down a peg-filled board
              and watch them bounce unpredictably to land in prize buckets at the bottom.
            </p>
          </div>

          {/* How to Play Section */}
          <div className="space-y-3 bg-green-50 rounded-lg p-4 border-2 border-green-600">
            <h3 className="text-xl font-bold text-gray-900">Game Rules</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li className="leading-relaxed">
                <strong>Set Your Wager:</strong> Choose how much you want to bet per ball drop (minimum $0.10)
              </li>
              <li className="leading-relaxed">
                <strong>Select Risk Level:</strong> Pick from three risk tiers:
                <ul className="ml-8 mt-1 space-y-1">
                  <li><strong className="text-green-600">Low Risk (Green):</strong> Safer play with more consistent payouts</li>
                  <li><strong className="text-yellow-600">Medium Risk (Yellow):</strong> Balanced risk and reward</li>
                  <li><strong className="text-red-600">High Risk (Red):</strong> Higher volatility with bigger potential wins</li>
                </ul>
              </li>
              <li className="leading-relaxed">
                <strong>Drop the Ball:</strong> Click your chosen risk button to release a ball down the board
              </li>
              <li className="leading-relaxed">
                <strong>Watch It Fall:</strong> The ball bounces off pegs randomly as it descends
              </li>
              <li className="leading-relaxed">
                <strong>Collect Your Prize:</strong> When the ball lands in a bucket, you win the multiplier shown times your wager
              </li>
            </ol>
          </div>

          {/* Features Section */}
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-gray-900">Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-1">Auto-Drop</h4>
                <p className="text-sm text-gray-700">
                  Set up automatic ball drops with customizable settings for extended play
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-1">Quick Wagers</h4>
                <p className="text-sm text-gray-700">
                  Use ½ and 2× buttons to quickly adjust your bet amount
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-1">History Tracking</h4>
                <p className="text-sm text-gray-700">
                  View your recent multipliers in the top bar to track your luck
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-1">Sound Effects</h4>
                <p className="text-sm text-gray-700">
                  Customize peg sounds or turn them off in Settings
                </p>
              </div>
            </div>
          </div>

          {/* Tips Section */}
          <div className="space-y-3 bg-blue-50 rounded-lg p-4 border-2 border-blue-400">
            <h3 className="text-xl font-bold text-gray-900">Pro Tips</h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">•</span>
                <span>Start with lower wagers to get a feel for the game mechanics</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">•</span>
                <span>Edge buckets often have higher multipliers but are harder to hit</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">•</span>
                <span>Use Auto-Drop for a hands-free experience with your preferred risk level</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 font-bold mr-2">•</span>
                <span>Keep an eye on your balance and bet responsibly</span>
              </li>
            </ul>
          </div>

          {/* Ready to Play */}
          <div className="text-center pt-4">
            <p className="text-lg font-semibold text-gray-900">
              Ready to play? Good luck! 🎯
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
