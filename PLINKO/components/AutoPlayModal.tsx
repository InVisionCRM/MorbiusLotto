'use client'

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RiskLevel } from '@/types';

interface AutoPlaySettings {
  riskLevel: RiskLevel;
  numberOfRounds: number;
  stopOnLossEnabled: boolean;
  stopOnLossAmount: number;
  stopOnBigWinEnabled: boolean;
  stopOnBigWinAmount: number;
  stopOnProfitEnabled: boolean;
  stopOnProfitAmount: number;
  onLossStrategy: 'reset' | 'increase' | 'decrease';
  onLossPercent: number;
  onWinStrategy: 'reset' | 'increase' | 'decrease';
  onWinPercent: number;
}

interface AutoPlayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (settings: AutoPlaySettings) => void;
  currentBalance: number;
}

export default function AutoPlayModal({ open, onOpenChange, onStart, currentBalance }: AutoPlayModalProps) {
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [settings, setSettings] = useState<AutoPlaySettings>({
    riskLevel: 'GREEN',
    numberOfRounds: 10,
    stopOnLossEnabled: false,
    stopOnLossAmount: 0,
    stopOnBigWinEnabled: false,
    stopOnBigWinAmount: 0,
    stopOnProfitEnabled: false,
    stopOnProfitAmount: 0,
    onLossStrategy: 'reset',
    onLossPercent: 0,
    onWinStrategy: 'reset',
    onWinPercent: 0,
  });

  const roundOptions = [3, 10, 25, 100, 200, 500];

  const updateSetting = <K extends keyof AutoPlaySettings>(key: K, value: AutoPlaySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const adjustValue = (key: keyof AutoPlaySettings, delta: number) => {
    setSettings(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] as number) + delta)
    }));
  };

  const handleStart = () => {
    onStart(settings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center justify-between">
            AUTO PLAY
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Bet Color Selection */}
          <div>
            <Label className="text-gray-400 text-sm mb-3 block">Bet color</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateSetting('riskLevel', 'GREEN')}
                className={`p-4 rounded-lg flex items-center gap-3 transition-all ${
                  settings.riskLevel === 'GREEN'
                    ? 'bg-gray-700 ring-2 ring-green-500'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${settings.riskLevel === 'GREEN' ? 'bg-green-500' : 'bg-gray-600'}`} />
                <span className="text-white font-medium flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full" />
                  Green
                </span>
              </button>
              <button
                onClick={() => updateSetting('riskLevel', 'YELLOW')}
                className={`p-4 rounded-lg flex items-center gap-3 transition-all ${
                  settings.riskLevel === 'YELLOW'
                    ? 'bg-gray-700 ring-2 ring-yellow-500'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${settings.riskLevel === 'YELLOW' ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                <span className="text-white font-medium flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded-full" />
                  Yellow
                </span>
              </button>
            </div>
            <button
              onClick={() => updateSetting('riskLevel', 'RED')}
              className={`w-full mt-3 p-4 rounded-lg flex items-center gap-3 transition-all ${
                settings.riskLevel === 'RED'
                  ? 'bg-gray-700 ring-2 ring-red-500'
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${settings.riskLevel === 'RED' ? 'bg-red-500' : 'bg-gray-600'}`} />
              <span className="text-white font-medium flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full" />
                Red
              </span>
            </button>
          </div>

          {/* Number of Rounds */}
          <div>
            <Label className="text-gray-400 text-sm mb-3 block">Number of rounds</Label>
            <div className="grid grid-cols-2 gap-3">
              {roundOptions.map((rounds) => (
                <button
                  key={rounds}
                  onClick={() => updateSetting('numberOfRounds', rounds)}
                  className={`p-4 rounded-lg transition-all ${
                    settings.numberOfRounds === rounds
                      ? 'bg-gray-700 ring-2 ring-green-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${settings.numberOfRounds === rounds ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <span className="text-white font-bold text-lg">{rounds}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stop Conditions */}
          <div className="space-y-3">
            {/* Stop if cash decreases by */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => updateSetting('stopOnLossEnabled', !settings.stopOnLossEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      settings.stopOnLossEnabled ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.stopOnLossEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-white text-sm">Stop if cash decreases by</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustValue('stopOnLossAmount', -10)}
                    className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-white font-mono text-lg min-w-[80px] text-center">
                    {settings.stopOnLossAmount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => adjustValue('stopOnLossAmount', 10)}
                    className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Stop if single win exceeds */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => updateSetting('stopOnBigWinEnabled', !settings.stopOnBigWinEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      settings.stopOnBigWinEnabled ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.stopOnBigWinEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                  <span className="text-white text-sm">Stop if single win exceeds</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustValue('stopOnBigWinAmount', -10)}
                    className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="text-white font-mono text-lg min-w-[80px] text-center">
                    {settings.stopOnBigWinAmount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => adjustValue('stopOnBigWinAmount', 10)}
                    className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* More Options Toggle */}
          <button
            onClick={() => setShowMoreOptions(!showMoreOptions)}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
          >
            More options
            <span className={`transition-transform ${showMoreOptions ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* More Options Section */}
          {showMoreOptions && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              {/* Stop if cash increases by */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => updateSetting('stopOnProfitEnabled', !settings.stopOnProfitEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        settings.stopOnProfitEnabled ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        settings.stopOnProfitEnabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <span className="text-white text-sm">Stop if cash increases by</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustValue('stopOnProfitAmount', -10)}
                      className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="text-white font-mono text-lg min-w-[80px] text-center">
                      {settings.stopOnProfitAmount.toFixed(2)}
                    </span>
                    <button
                      onClick={() => adjustValue('stopOnProfitAmount', 10)}
                      className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* If I lost */}
              <div>
                <Label className="text-gray-400 text-sm mb-3 block text-center">If I lost</Label>

                {/* Return to initial bet */}
                <button
                  onClick={() => updateSetting('onLossStrategy', 'reset')}
                  className={`w-full p-4 rounded-lg mb-3 transition-all ${
                    settings.onLossStrategy === 'reset'
                      ? 'bg-gray-700 ring-2 ring-green-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${settings.onLossStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <span className="text-white font-medium">Return to initial bet</span>
                  </div>
                </button>

                {/* Increase/Decrease bet by */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className={`p-4 rounded-lg ${
                      settings.onLossStrategy === 'increase'
                        ? 'bg-gray-700 ring-2 ring-green-500'
                        : 'bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => updateSetting('onLossStrategy', 'increase')}
                      className="w-full text-left mb-2"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${settings.onLossStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <span className="text-white text-sm font-medium">Increase bet by</span>
                      </div>
                    </button>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => adjustValue('onLossPercent', -5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="text-white font-bold text-xl">{settings.onLossPercent}%</span>
                      <button
                        onClick={() => adjustValue('onLossPercent', 5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${
                      settings.onLossStrategy === 'decrease'
                        ? 'bg-gray-700 ring-2 ring-green-500'
                        : 'bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => updateSetting('onLossStrategy', 'decrease')}
                      className="w-full text-left mb-2"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${settings.onLossStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <span className="text-white text-sm font-medium">Decrease bet by</span>
                      </div>
                    </button>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => adjustValue('onLossPercent', -5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="text-white font-bold text-xl">{settings.onLossPercent}%</span>
                      <button
                        onClick={() => adjustValue('onLossPercent', 5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* If I win */}
              <div>
                <Label className="text-gray-400 text-sm mb-3 block text-center">If I win</Label>

                {/* Return to initial bet */}
                <button
                  onClick={() => updateSetting('onWinStrategy', 'reset')}
                  className={`w-full p-4 rounded-lg mb-3 transition-all ${
                    settings.onWinStrategy === 'reset'
                      ? 'bg-gray-700 ring-2 ring-green-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${settings.onWinStrategy === 'reset' ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <span className="text-white font-medium">Return to initial bet</span>
                  </div>
                </button>

                {/* Increase/Decrease bet by */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className={`p-4 rounded-lg ${
                      settings.onWinStrategy === 'increase'
                        ? 'bg-gray-700 ring-2 ring-green-500'
                        : 'bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => updateSetting('onWinStrategy', 'increase')}
                      className="w-full text-left mb-2"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${settings.onWinStrategy === 'increase' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <span className="text-white text-sm font-medium">Increase bet by</span>
                      </div>
                    </button>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => adjustValue('onWinPercent', -5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="text-white font-bold text-xl">{settings.onWinPercent}%</span>
                      <button
                        onClick={() => adjustValue('onWinPercent', 5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${
                      settings.onWinStrategy === 'decrease'
                        ? 'bg-gray-700 ring-2 ring-green-500'
                        : 'bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => updateSetting('onWinStrategy', 'decrease')}
                      className="w-full text-left mb-2"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${settings.onWinStrategy === 'decrease' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <span className="text-white text-sm font-medium">Decrease bet by</span>
                      </div>
                    </button>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => adjustValue('onWinPercent', -5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        −
                      </button>
                      <span className="text-white font-bold text-xl">{settings.onWinPercent}%</span>
                      <button
                        onClick={() => adjustValue('onWinPercent', 5)}
                        className="w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-800 text-white flex items-center justify-center text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Start Button */}
          <Button
            onClick={handleStart}
            className="w-full py-6 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg transition-colors"
          >
            START AUTO
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
