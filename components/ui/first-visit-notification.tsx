'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'morblotto_first_visit_notification_seen';

export function FirstVisitNotification({
  className,
  children,
  storageKey = STORAGE_KEY,
}: {
  className?: string;
  children: React.ReactNode;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(storageKey);
    if (!seen) setOpen(true);
  }, [storageKey]);

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, '1');
    }
    setOpen(false);
  };

  const lm = Theme.lightModal;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn('fixed inset-0 z-[100]', lm.overlay)}
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={cn(
                'relative pointer-events-auto max-h-[90vh] overflow-y-auto',
                lm.container,
                className,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleClose}
                className={lm.closeButton}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="pr-10">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
