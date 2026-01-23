'use client';

import React from 'react';

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
  if (!isOpen || !imageUrl) return null;

  const shareToPlatform = async (platform: string) => {
    switch (platform) {
      case 'copy':
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': imageBlob! })
          ]);
          alert('Image copied to clipboard!');
        } catch (error) {
          console.error('Failed to copy image:', error);
          alert('Failed to copy image. Try saving instead.');
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
        // Use Web Share API with file support (opens native share menu)
        if (navigator.share) {
          let shareData: any = {
            title: 'My PLINKO Session!',
            text: 'Check out my PLINKO session! 🎯',
            url: window.location.origin + '/PLINKO'
          };

          // Try to include file if supported
          if (imageBlob) {
            const file = new File([imageBlob], 'plinko-session.png', { type: 'image/png' });
            shareData.files = [file];
          }

          // Check if sharing is supported
          const canShareWithFiles = navigator.canShare && navigator.canShare(shareData);

          if (canShareWithFiles || (!imageBlob && navigator.share)) {
            try {
              await navigator.share(shareData);
              return; // Success!
            } catch (error) {
              if (error.name !== 'AbortError') {
                console.log('Native share failed:', error);
              }
            }
          }
        }

        // Fallback: Copy image and show instructions
        if (imageBlob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': imageBlob })
            ]);
            alert('Native sharing not available. Image copied to clipboard - you can now paste it anywhere to share!');
          } catch (error) {
            alert('Sharing not supported on this device. Try saving the image instead.');
          }
        } else {
          alert('No image available to share. Try generating the share image again.');
        }
        break;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
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