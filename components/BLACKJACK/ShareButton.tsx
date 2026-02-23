'use client';

import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { ShareModal } from './ShareModal';

interface ShareButtonProps {
  chartRef: React.RefObject<HTMLDivElement | null>;
  stats: {
    totalBets: number;
    totalWagered: number;
    totalWon: number;
    netPnL: number;
    roi: string;
  };
  onGeneratingChange?: (generating: boolean) => void;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
  chartRef,
  stats,
  onGeneratingChange
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ blob: Blob; url: string } | null>(null);

  const generateShareImage = async () => {
    const chartElement = chartRef.current;
    if (!chartElement) return;

    setIsGenerating(true);
    onGeneratingChange?.(true);

    try {
      // Create a temporary container with the chart and branding
      const shareContainer = document.createElement('div');
      shareContainer.style.width = '800px';
      shareContainer.style.height = '760px';
      shareContainer.style.background = 'linear-gradient(145deg,rgb(16, 26, 35),rgb(35, 36, 41))';
      shareContainer.style.padding = '10px';
      shareContainer.style.position = 'absolute';
      shareContainer.style.left = '-9999px';
      shareContainer.style.top = '-9999px';
      shareContainer.style.borderRadius = '12px';
      shareContainer.style.boxShadow = 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)';
      shareContainer.style.border = '1px inset rgba(60, 60, 60, 0.5)';

      // Create branding header
      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.justifyContent = 'center';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.marginBottom = '20px';
      headerDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; color: #0891b2; font-size: 28px; font-weight: bold; font-family: Arial, sans-serif;">
          <span>BLACKJACK on PULSECHAIN</span>
          <img src="/Pulse Branding/Logo/ball.png" style="width: 32px; height: 32px; object-fit: contain;" crossorigin="anonymous" />
        </div>
      `;

      // Create stats grid (Games instead of Drops)
      const statsDiv = document.createElement('div');
      statsDiv.style.display = 'grid';
      statsDiv.style.gridTemplateColumns = 'repeat(3, 1fr)';
      statsDiv.style.gap = '10px';
      statsDiv.style.marginBottom = '20px';
      statsDiv.innerHTML = `
        <div style="background: rgba(20,20,20,0.8); padding: 12px; border-radius: 8px; text-align: center; border: 1px inset rgba(60, 60, 60, 0.5);">
          <div style="color: rgba(34,211,238,0.8); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Games</div>
          <div style="color: white; font-weight: bold; font-size: 20px;">${stats.totalBets}</div>
        </div>
        <div style="background: rgba(20,20,20,0.8); padding: 12px; border-radius: 8px; text-align: center; border: 1px inset rgba(60, 60, 60, 0.5);">
          <div style="color: rgba(34,211,238,0.8); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Net P&L</div>
          <div style="font-weight: bold; font-size: 20px; display: flex; align-items: center; justify-content: center; gap: 4px; ${stats.netPnL >= 0 ? 'color: #10B981;' : 'color: #EF4444;'}">
            ${stats.netPnL >= 0 ? '+' : ''}${Math.round(stats.netPnL)}
            <img src="/morbius/MorbiusLogo (3).png" style="width: 16px; height: 16px; object-fit: contain;" crossorigin="anonymous" />
          </div>
        </div>
        <div style="background: rgba(20,20,20,0.8); padding: 12px; border-radius: 8px; text-align: center; border: 1px inset rgba(60, 60, 60, 0.5);">
          <div style="color: rgba(34,211,238,0.8); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">ROI</div>
          <div style="font-weight: bold; font-size: 20px; ${parseFloat(stats.roi) >= 0 ? 'color: #10B981;' : 'color: #EF4444;'}">
            ${parseFloat(stats.roi) >= 0 ? '+' : ''}${stats.roi}%
          </div>
        </div>
      `;

      // Clone and style the chart - target just the visualization area
      const chartClone = chartElement.cloneNode(true) as HTMLElement;
      chartClone.style.width = '760px';
      chartClone.style.height = '460px';
      chartClone.style.marginTop = '5px';
      chartClone.style.marginBottom = '0px';
      chartClone.style.overflow = 'hidden';

      // Find and maximize the actual chart area
      const rechartsWrapper = chartClone.querySelector('.recharts-wrapper');
      if (rechartsWrapper) {
        (rechartsWrapper as HTMLElement).style.height = '400px';
        (rechartsWrapper as HTMLElement).style.width = '760px';
        (rechartsWrapper as HTMLElement).style.margin = '0';
        (rechartsWrapper as HTMLElement).style.padding = '0';
      }

      // Adjust the SVG to fill the space completely
      const svgElement = chartClone.querySelector('svg');
      if (svgElement) {
        svgElement.style.height = '100%';
        svgElement.style.width = '100%';
        svgElement.style.margin = '0';
        svgElement.style.padding = '0';
        svgElement.style.display = 'block';
        svgElement.setAttribute('height', '460');
        svgElement.setAttribute('width', '760');
        svgElement.setAttribute('preserveAspectRatio', 'none');
      }

      // Hide overlay elements in clone (e.g. Share/Clear buttons)
      const overlays = chartClone.querySelectorAll('[class*="absolute"]');
      overlays.forEach(overlay => {
        if (overlay.textContent?.includes('Clear') || overlay.textContent?.includes('Share')) {
          (overlay as HTMLElement).style.display = 'none';
        }
      });

      shareContainer.appendChild(headerDiv);
      shareContainer.appendChild(statsDiv);
      shareContainer.appendChild(chartClone);
      document.body.appendChild(shareContainer);

      const canvas = await html2canvas(shareContainer, {
        width: 800,
        height: 580,
        backgroundColor: 'transparent',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 0,
        onclone: (clonedDoc) => {
          const images = clonedDoc.querySelectorAll('img');
          images.forEach(img => {
            img.crossOrigin = 'anonymous';
          });
        }
      });

      // Draw text overlay on canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 40px Arial Black, Arial, sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const text = 'Play now on MORBIUS.IO';
        const x = canvas.width / 2 / 2;
        const y = 550;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.font = 'bold 38px Arial Black, Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const imageUrl = URL.createObjectURL(blob);
          setGeneratedImage({ blob, url: imageUrl });
          setIsModalOpen(true);
        }
      });

      document.body.removeChild(shareContainer);
    } catch (error) {
      console.error('Failed to generate share image:', error);
      alert('Failed to generate share image. Please try again.');
    }

    setIsGenerating(false);
    onGeneratingChange?.(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    if (generatedImage) {
      URL.revokeObjectURL(generatedImage.url);
      setGeneratedImage(null);
    }
  };

  return (
    <>
      <button
        onClick={generateShareImage}
        disabled={isGenerating}
        className="flex items-center gap-1 px-2 py-1 text-cyan-300 text-xs font-medium transition-all z-10 rounded disabled:opacity-50 hover:bg-cyan-400/10"
        style={{
          boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
          background: isGenerating ? 'rgba(0,0,0,0.5)' : 'transparent'
        }}
        title="Share your session with image"
      >
        <i className={`fas ${isGenerating ? 'fa-spinner fa-spin' : 'fa-share-alt'} text-xs`}></i>
        {isGenerating ? 'Generating...' : 'Share Image'}
      </button>

      <ShareModal
        isOpen={isModalOpen}
        onClose={closeModal}
        imageBlob={generatedImage?.blob || null}
        imageUrl={generatedImage?.url || null}
      />
    </>
  );
};
