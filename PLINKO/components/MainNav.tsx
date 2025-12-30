'use client'

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import HowToPlayModal from './HowToPlayModal';

export default function MainNav() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

  return (
    <>
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 backdrop-blur-sm border-b border-green-600 shadow-md">
        <div className="container mx-auto px-2 py-1">
          <div className="flex items-center justify-between">
            {/* Logo/Brand */}
            <div className="text-sm font-bold text-green-600">
              PLINKO
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                className="text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2"
              >
                Home
              </Button>
              <Button
                onClick={() => setHowToPlayOpen(true)}
                variant="ghost"
                className="text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2"
              >
                How to Play
              </Button>
              <Button
                variant="ghost"
                className="text-gray-700 hover:text-green-600 hover:bg-green-50 font-semibold text-xs h-7 px-2"
              >
                Buy
              </Button>
              <Button
                onClick={() => setSettingsOpen(true)}
                variant="outline"
                className="border border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-semibold text-xs h-7 px-2"
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Settings Dialog with Tabs */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[600px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">Settings</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="visual" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-100">
              <TabsTrigger
                value="visual"
                className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold"
              >
                Visual
              </TabsTrigger>
              <TabsTrigger
                value="autodrop"
                className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold"
              >
                Auto-drop
              </TabsTrigger>
              <TabsTrigger
                value="agreement"
                className="data-[state=active]:bg-green-600 data-[state=active]:text-white font-semibold"
              >
                Agreement
              </TabsTrigger>
            </TabsList>


            {/* Visual Settings Tab - Placeholder */}
            <TabsContent value="visual" className="space-y-4 py-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">Visual Settings</h3>
                <p className="text-sm text-gray-600">Visual settings coming soon...</p>
              </div>
            </TabsContent>

            {/* Auto-drop Settings Tab - Placeholder */}
            <TabsContent value="autodrop" className="space-y-4 py-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">Auto-drop Settings</h3>
                <p className="text-sm text-gray-600">Auto-drop settings coming soon...</p>
              </div>
            </TabsContent>

            {/* User Agreement Tab - Placeholder */}
            <TabsContent value="agreement" className="space-y-4 py-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">User Agreement</h3>
                <p className="text-sm text-gray-600">User agreement coming soon...</p>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* How to Play Modal */}
      <HowToPlayModal open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />
    </>
  );
}
