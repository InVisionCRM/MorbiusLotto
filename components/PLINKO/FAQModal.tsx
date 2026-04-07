'use client'

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FAQModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FAQModal({ open, onOpenChange }: FAQModalProps) {
  const faqs = [
    {
      question: "What is Plinko?",
      answer: "Plinko is a classic game of chance where you drop balls down a peg-filled board. The ball bounces randomly and lands in a bucket with a multiplier that determines your winnings."
    },
    {
      question: "How do I play?",
      answer: "Set your wager, choose a risk level (Low, Medium, or High), and click to drop a ball. Watch it bounce down the pegs and land in a bucket to win the displayed multiplier times your wager."
    },
    {
      question: "What are the risk levels?",
      answer: "Low Risk (Green) offers safer, more consistent payouts. Medium Risk (Yellow) provides balanced risk and reward. High Risk (Red) has higher volatility with bigger potential wins."
    },
    {
      question: "What is Auto-Drop?",
      answer: "Auto-Drop lets you automatically drop multiple balls with your chosen settings. Set the number of balls and risk level, then sit back and watch the action."
    },
    {
      question: "How do I change sound settings?",
      answer: "Click Settings in the top menu, go to the Sound tab, and choose between Default sound, Alternative sound, or turn sounds off completely."
    },
    {
      question: "What is Morbius.io?",
      answer: "Morbius.io is a gaming platform offering various games including Lottery, KENO, Baccarat, BlackJack, Poker, and Plinko, all built on PulseChain."
    },
    {
      question: "What is PulseChain?",
      answer: "PulseChain is a blockchain network designed for fast, low-cost transactions. Visit PulseChain.com to learn more."
    },
    {
      question: "Is this game fair?",
      answer: "Yes. Drops are settled on-chain: the contract builds a verifiable seed from block data and your play, maps it to a bucket, and emits it in the BallDropped event. The full FAQ on the Plinko page explains fees, RNG, and how to verify results."
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] bg-black/10 backdrop-blur-lg border-purple-600 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-white text-center">
            Frequently Asked Questions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {faqs.map((faq, index) => (
          <div key={index} className="bg-black/10 rounded-lg p-4 border border-purple-600">
              <h3 className="text-lg font-bold text-white mb-2">
                {faq.question}
              </h3>
              <p className="text-white/80 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center pt-4 border-t border-gray-200">
          <p className="text-sm text-purple-600">
            Still have questions? Contact us on Telegram or Twitter.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
