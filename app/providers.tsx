'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi-config'
import { pulsechain } from '@/lib/chains'
import { useState, useEffect } from 'react'

// #region agent log
const logDebug = (message: string, data?: any) => {
  fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'providers.tsx:logDebug',
      message,
      data: data || {},
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'A'
    })
  }).catch(() => {});
};
// #endregion

export function Providers({ children }: { children: React.ReactNode }) {
  // #region agent log
  useEffect(() => {
    const checkBodyTransform = () => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      const transform = computedStyle.transform;
      const transformOrigin = computedStyle.transformOrigin;
      
      logDebug('Body transform check', {
        transform,
        transformOrigin,
        hasTransform: transform !== 'none',
        bodyClasses: body.className,
        bodyStyles: {
          transform: body.style.transform,
          transformOrigin: body.style.transformOrigin
        }
      });
      
      // Check for RainbowKit modal container
      const rainbowKitModal = document.querySelector('[data-rk]') || 
                              document.querySelector('[class*="rk"]') ||
                              document.querySelector('[id*="rk"]');
      if (rainbowKitModal) {
        const modalStyle = window.getComputedStyle(rainbowKitModal);
        logDebug('RainbowKit modal found', {
          tagName: rainbowKitModal.tagName,
          className: rainbowKitModal.className,
          id: rainbowKitModal.id,
          position: modalStyle.position,
          top: modalStyle.top,
          left: modalStyle.left,
          transform: modalStyle.transform,
          width: modalStyle.width,
          height: modalStyle.height,
          margin: modalStyle.margin
        });
      } else {
        logDebug('RainbowKit modal not found yet');
      }
    };
    
    // Check immediately and after a delay to catch modal rendering
    checkBodyTransform();
    const timer1 = setTimeout(checkBodyTransform, 1000);
    const timer2 = setTimeout(checkBodyTransform, 3000);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);
  // #endregion

  // Create QueryClient once per provider instance to prevent cache resets
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        retry: (failureCount, error) => {
          // Don't retry on user rejection errors
          if (error?.message?.includes('user rejected') ||
              error?.message?.includes('User rejected')) {
            return false
          }
          // Retry other errors up to 3 times
          return failureCount < 3
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
    },
  }))

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#8B5CF6', // Purple accent to match your theme
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          modalSize="compact"
          coolMode={true}
          showRecentTransactions={true}
        >
          {/* #region agent log */}
          <RainbowKitModalFix />
          {/* #endregion */}
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

// #region agent log
function RainbowKitModalFix() {
  useEffect(() => {
    const fixModalPosition = () => {
      // Find RainbowKit modal overlay
      const modalOverlay = document.querySelector('[data-rk]') as HTMLElement ||
                          document.querySelector('[class*="rk"]') as HTMLElement ||
                          Array.from(document.querySelectorAll('div')).find(
                            el => el.style.position === 'fixed' && 
                            (el.className.includes('rk') || el.getAttribute('data-rk'))
                          ) as HTMLElement;
      
      if (modalOverlay) {
        const computedStyle = window.getComputedStyle(modalOverlay);
        const bodyStyle = window.getComputedStyle(document.body);
        
        logDebug('RainbowKit modal fix attempt', {
          found: !!modalOverlay,
          modalPosition: computedStyle.position,
          modalTop: computedStyle.top,
          modalLeft: computedStyle.left,
          modalTransform: computedStyle.transform,
          bodyTransform: bodyStyle.transform,
          bodyTransformOrigin: bodyStyle.transformOrigin,
          modalClasses: modalOverlay.className,
          modalId: modalOverlay.id
        });
        
        // Check if modal is centered correctly
        const rect = modalOverlay.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const expectedLeft = (viewportWidth - rect.width) / 2;
        const expectedTop = (viewportHeight - rect.height) / 2;
        const actualLeft = rect.left;
        const actualTop = rect.top;
        const offsetX = actualLeft - expectedLeft;
        const offsetY = actualTop - expectedTop;
        
        logDebug('Modal positioning analysis', {
          viewportWidth,
          viewportHeight,
          modalWidth: rect.width,
          modalHeight: rect.height,
          expectedLeft,
          expectedTop,
          actualLeft,
          actualTop,
          offsetX,
          offsetY,
          isCentered: Math.abs(offsetX) < 10 && Math.abs(offsetY) < 10,
          bodyTransform: bodyStyle.transform,
          wrapperTransform: document.getElementById('app-wrapper') ? window.getComputedStyle(document.getElementById('app-wrapper')!).transform : 'none'
        });
      }
    };
    
    // Check when modal might be rendered
    const observer = new MutationObserver(() => {
      fixModalPosition();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-rk']
    });
    
    // Also check periodically
    const interval = setInterval(fixModalPosition, 500);
    
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);
  
  return null;
}
// #endregion