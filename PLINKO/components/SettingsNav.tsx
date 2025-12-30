'use client'

import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function SettingsNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="bg-white hover:bg-white/90 border-2 border-green-600 text-green-600 hover:text-green-700"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">Settings</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-1">
            <div className="py-8 text-center">
              <p className="text-gray-600">No settings available</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
