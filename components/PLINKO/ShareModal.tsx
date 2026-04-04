'use client';

import React, { useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageBlob: Blob | null;
  imageUrl: string | null;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  imageBlob,
  imageUrl
}) => {
  const [shareText, setShareText] = useState(
    'Check out my PLINKO session! Play now at Win.Morbius.io/PLINKO #PulseChain #Crypto #CryptoGaming'
  );
  if (!isOpen || !imageUrl) return null;

  const shareToPlatform = async (platform: string) => {
    switch (platform) {
      case 'copy':
        try {
          // Copy the share text to clipboard first (more universally supported)
          await navigator.clipboard.writeText(shareText);

          // Then try to copy the image
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': imageBlob! })
          ]);

          alert('✅ Both text and image copied to clipboard!\n\nText: "' + shareText + '"\nImage: PLINKO session screenshot');
        } catch (error) {
          console.error('Copy operations failed:', error);

          // Fallback: Try to copy at least the text
          try {
            await navigator.clipboard.writeText(shareText);
            alert('✅ Share text copied to clipboard!\n\n"' + shareText + '"\n\n(Image copy failed - try saving the image instead)');
          } catch (textError) {
            console.error('Text copy also failed:', textError);
            alert('❌ Failed to copy. Try saving the image instead.');
          }
        }
        break;

      case 'download':
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `plinko-session-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        break;

      case 'share':
        // Check if Web Share API is available and supported
        if (!navigator.share) {
          // Fallback: Copy image and show instructions
          if (imageBlob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': imageBlob })
              ]);
              alert('Native sharing not supported. Image copied to clipboard - you can now paste it anywhere to share!');
            } catch (error) {
              console.error('Clipboard copy failed:', error);
              alert('Sharing not supported on this device. Try saving the image instead.');
            }
          } else {
            alert('No image available to share. Try generating the share image again.');
          }
          return;
        }

        // Use Web Share API
        let shareData: any = {
          title: 'My PLINKO Session!',
          text: shareText,
          url: 'https://Win.Morbius.io/PLINKO'
        };

        // Try to include file if supported and blob exists
        let canShareWithFiles = false;
        if (imageBlob && navigator.canShare) {
          try {
            const file = new File([imageBlob], 'plinko-session.png', { type: 'image/png' });
            shareData.files = [file];
            canShareWithFiles = navigator.canShare(shareData);
          } catch {
            // Remove files from share data if creating File failed
            delete shareData.files;
          }
        }

        // Try to share (with or without files)
        if (canShareWithFiles || (!shareData.files && navigator.share)) {
          try {
            await navigator.share(shareData);
            return; // Success!
          } catch (error: any) {
            // Handle specific error types
            if (error.name === 'AbortError') {
              // User cancelled the share - do nothing
              return;
            } else if (error.name === 'NotAllowedError') {
              alert('Sharing was blocked by the browser. Try copying the image instead.');
            } else {
              alert('Native sharing failed. Try copying the image instead.');
            }
          }
        }

        // Final fallback: Copy image to clipboard
        if (imageBlob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': imageBlob })
            ]);
            alert('Native sharing not available. Image copied to clipboard - you can now paste it anywhere to share!');
          } catch (error) {
            console.error('Final fallback copy failed:', error);
            alert('Sharing not supported on this device. Try saving the image instead.');
          }
        } else {
          alert('No image available to share. Try generating the share image again.');
        }
        break;
    }
  };

  return (
    <div className="surface-modal-shell">
      <div className="surface-modal-card max-w-sm">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Share Your Session</h3>
            <button
              onClick={onClose}
              className="text-cyan-400 hover:text-cyan-300 text-xl"
            >
              ×
            </button>
          </div>

          {/* Image Preview */}
          <div className="mb-4 bg-black/20 rounded-lg p-2">
            <img
              src={imageUrl}
              alt="PLINKO Session"
              className="w-full h-auto rounded border border-cyan-500/20"
            />
          </div>

          {/* Share Text */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-cyan-300 mb-2">
              Share Message
            </label>
            <textarea
              value={shareText}
              onChange={(e) => setShareText(e.target.value)}
              className="w-full h-20 px-3 py-2 bg-slate-800/50 border border-cyan-500/30 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              placeholder="Enter your share message..."
            />
          </div>

          {/* Share Buttons Grid */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => shareToPlatform('copy')}
              className="flex flex-col items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-3 rounded-lg font-medium transition-colors"
              title="Copy image to clipboard"
            >
              <i className="fas fa-copy text-lg"></i>
              <span className="text-sm">Copy</span>
            </button>

            <button
              onClick={() => shareToPlatform('download')}
              className="flex flex-col items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-3 rounded-lg font-medium transition-colors"
              title="Save image to device"
            >
              <i className="fas fa-download text-lg"></i>
              <span className="text-sm">Save</span>
            </button>

            <button
              onClick={() => shareToPlatform('share')}
              className="flex flex-col items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-3 rounded-lg font-medium transition-colors"
              title="Open native share menu with image"
            >
              <i className="fas fa-share-alt text-lg"></i>
              <span className="text-sm">Share</span>
            </button>
          </div>

          {/* Footer */}
          <div className="mt-3 text-center text-cyan-400/60 text-xs">
            Choose how to share your PLINKO session!
          </div>
        </div>
      </div>
    </div>
  );
};