'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MEME_TEMPLATES } from './constants';
import { MemeTemplate, TextLayer } from './types';
import { MemeSelector } from '@/components/Morb-It/MemeSelector';
import { LayerEditor } from '@/components/Morb-It/LayerEditor';
import { useAccount } from 'wagmi';
import GlobalMainNav from '@/components/shared/GlobalMainNav';

interface SavedMeme {
  id: number;
  image_data: string;
  template_name: string;
  wallet_address: string;
  approval_status?: string;
  created_at: string;
}

// Helper for text layout (handling wrapping and newlines)
const calculateLayout = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) => {
    const lineHeightRatio = 1.2;
    const lines: string[] = [];
    const paragraphs = text.split('\n');

    let maxLineWidth = 0;

    paragraphs.forEach(paragraph => {
        const words = paragraph.split(' ');
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + " " + word;
            const width = ctx.measureText(testLine).width;

            if (width < maxWidth) {
                currentLine = testLine;
            } else {
                lines.push(currentLine);
                maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
    });

    return {
        lines,
        width: maxLineWidth,
        height: lines.length * fontSize * lineHeightRatio,
        lineHeight: fontSize * lineHeightRatio
    };
};

export default function MorbItPage() {
  const { address } = useAccount();
  const [selectedMeme, setSelectedMeme] = useState<MemeTemplate>(MEME_TEMPLATES[0]);
  const [layers, setLayers] = useState<TextLayer[]>([
    { id: '1', text: 'TOP TEXT', x: 50, y: 10, size: 50, color: '#ffffff', strokeColor: '#000000', backgroundColor: null, rotation: 0, isUppercase: true },
    { id: '2', text: 'BOTTOM TEXT', x: 50, y: 90, size: 50, color: '#ffffff', strokeColor: '#000000', backgroundColor: null, rotation: 0, isUppercase: true },
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('1');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  // Force re-render on resize to fix overlay positioning
  const [, setTick] = useState(0);

  // Gallery and save state
  const [savedMemes, setSavedMemes] = useState<SavedMeme[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [isLoadingGallery, setIsLoadingGallery] = useState(true);

  // Dragging state
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    mode: 'move' | 'resize' | 'rotate' | null;
    startX: number;
    startY: number;
    initialLayerState: TextLayer | null;
  }>({
    isDragging: false,
    mode: null,
    startX: 0,
    startY: 0,
    initialLayerState: null,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Image Loading Effect ---
  useEffect(() => {
    setLoadedImage(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Important: Set onload before src to ensure it fires even if cached
    img.onload = () => {
      setLoadedImage(img);
    };
    img.onerror = () => {
        console.error("Failed to load image:", selectedMeme.url);
    };
    img.src = selectedMeme.url;
  }, [selectedMeme]);

  // Handle Resize for Overlay
  useEffect(() => {
      const handleResize = () => setTick(t => t + 1);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch saved memes on mount
  useEffect(() => {
    const fetchMemes = async () => {
      try {
        setIsLoadingGallery(true);
        const response = await fetch('/api/memes?limit=50');
        const data = await response.json();
        if (data.success) {
          setSavedMemes(data.memes);
        }
      } catch (error) {
        console.error('Error fetching memes:', error);
      } finally {
        setIsLoadingGallery(false);
      }
    };
    fetchMemes();
  }, []);

  // Track unsaved changes
  useEffect(() => {
    if (loadedImage) {
      setHasUnsavedChanges(true);
    }
  }, [layers, selectedMeme]);

  // Beforeunload handler
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // --- Helpers ---

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const isPointInLayer = (ctx: CanvasRenderingContext2D, layer: TextLayer, x: number, y: number): 'body' | 'handle' | 'rotate' | null => {
    const canvas = ctx.canvas;
    const layerX = (canvas.width * layer.x) / 100;
    const layerY = (canvas.height * layer.y) / 100;

    // 1. Translate point to be relative to the center of rotation
    const dx = x - layerX;
    const dy = y - layerY;

    // 2. Rotate point backwards to align with axis-aligned box
    const rad = (-layer.rotation * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    // 3. Get metrics using layout engine
    const fontSize = (layer.size / 600) * canvas.width;
    ctx.font = `900 ${fontSize}px 'Oswald', sans-serif`;
    const textToMeasure = layer.isUppercase ? layer.text.toUpperCase() : layer.text;

    // Use 90% of canvas width as max width logic
    const maxWidth = canvas.width * 0.9;
    const { width: textWidth, height: textHeight } = calculateLayout(ctx, textToMeasure, maxWidth, fontSize);

    const padding = 10;
    const halfW = textWidth / 2 + padding;
    const halfH = textHeight / 2 + padding;
    const handleHitRadius = 30; // Increased hit radius (was 20)

    // Check resize handle (bottom-right corner)
    if (
      rx >= halfW - handleHitRadius && rx <= halfW + handleHitRadius &&
      ry >= halfH - handleHitRadius && ry <= halfH + handleHitRadius
    ) {
      return 'handle';
    }

    // Check rotation handle (top center stick)
    const rotHandleX = 0;
    const rotHandleY = -halfH - 30;
    const distRot = Math.sqrt((rx - rotHandleX) ** 2 + (ry - rotHandleY) ** 2);
    if (distRot <= handleHitRadius) {
        return 'rotate';
    }

    // Check body
    if (rx >= -halfW && rx <= halfW && ry >= -halfH && ry <= halfH) {
      return 'body';
    }

    return null;
  };

  // --- Canvas Rendering ---
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!loadedImage) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Optional: Draw placeholder background
        ctx.fillStyle = '#1e293b'; // slate-800
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // Use natural dimensions of the loaded image to ensure 100% scale
    const imgWidth = loadedImage.naturalWidth;
    const imgHeight = loadedImage.naturalHeight;

    if (canvas.width !== imgWidth || canvas.height !== imgHeight) {
        canvas.width = imgWidth;
        canvas.height = imgHeight;
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(loadedImage, 0, 0, imgWidth, imgHeight);

    layers.forEach(layer => {
      const isEditing = layer.id === editingLayerId;

      ctx.save();

      const xPos = (canvas.width * layer.x) / 100;
      const yPos = (canvas.height * layer.y) / 100;

      ctx.translate(xPos, yPos);
      ctx.rotate((layer.rotation * Math.PI) / 180);

      const fontSize = (layer.size / 600) * canvas.width;
      ctx.font = `900 ${fontSize}px 'Oswald', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      const textToDraw = layer.isUppercase ? layer.text.toUpperCase() : layer.text;
      const maxWidth = canvas.width * 0.9;

      const { lines, width: textWidth, height: textHeight, lineHeight } = calculateLayout(ctx, textToDraw, maxWidth, fontSize);

      if (!isEditing) {
        // Draw background fill if set
        if (layer.backgroundColor) {
          const bgPadding = fontSize * 0.2;
          ctx.fillStyle = layer.backgroundColor;
          ctx.fillRect(
            -textWidth / 2 - bgPadding,
            -textHeight / 2 - bgPadding,
            textWidth + bgPadding * 2,
            textHeight + bgPadding * 2
          );
        }

        // Calculate start Y to center the block of text
        const startY = -textHeight / 2 + lineHeight / 2;

        lines.forEach((line, i) => {
            const lineY = startY + (i * lineHeight);

            // Fill
            ctx.fillStyle = layer.color;
            ctx.fillText(line, 0, lineY);
        });
      }

      // Selection Box (if selected)
      if (layer.id === selectedLayerId) {
        const padding = 10;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = textHeight + padding * 2;
        const halfW = boxWidth / 2;
        const halfH = boxHeight / 2;

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#6366f1';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(-halfW, -halfH, boxWidth, boxHeight);

        // Resize Handle (Bottom Right)
        ctx.setLineDash([]);
        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.arc(halfW, halfH, 8, 0, 2 * Math.PI);
        ctx.fill();

        // Rotation Handle (Top Center)
        ctx.beginPath();
        ctx.moveTo(0, -halfH);
        ctx.lineTo(0, -halfH - 30);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -halfH - 30, 8, 0, 2 * Math.PI);
        ctx.fill();
      }

      ctx.restore();
    });

    // Watermark - bottom left corner
    ctx.save();
    const watermarkSize = Math.max(12, canvas.width * 0.02);
    ctx.font = `600 ${watermarkSize}px 'Oswald', sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Morbius.io', 8, canvas.height - 8);
    ctx.restore();
  }, [selectedMeme, layers, selectedLayerId, loadedImage, editingLayerId]);

  useEffect(() => {
    let animationFrameId: number;
    const render = () => renderCanvas();
    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderCanvas]);

  // --- Interaction Handlers ---

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingLayerId) return; // Don't drag while editing

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    // 1. Priority Check: Controls of the currently selected layer
    // This ensures handles/buttons on the selected layer are always reachable,
    // even if they overlap with another layer's body.
    if (selectedLayerId) {
        const selectedLayer = layers.find(l => l.id === selectedLayerId);
        if (selectedLayer) {
            const result = isPointInLayer(ctx, selectedLayer, x, y);
            if (result === 'handle' || result === 'rotate') {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDragState({
                    isDragging: true,
                    mode: result === 'handle' ? 'resize' : 'rotate',
                    startX: e.clientX,
                    startY: e.clientY,
                    initialLayerState: { ...selectedLayer },
                });
                return;
            }
        }
    }

    // 2. Standard Hit Test: Find top-most layer body
    // We iterate backwards to find the top-most visible layer.
    let hitLayerId: string | null = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      // We only care about body hits here, handles are only valid for selected layer (handled above)
      const result = isPointInLayer(ctx, layers[i], x, y);
      if (result === 'body') {
        hitLayerId = layers[i].id;
        break;
      }
    }

    if (hitLayerId) {
      setSelectedLayerId(hitLayerId);
      const layer = layers.find(l => l.id === hitLayerId) || null;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setDragState({
        isDragging: true,
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        initialLayerState: layer ? { ...layer } : null,
      });
    } else {
      // Only deselect if we didn't hit anything
      setSelectedLayerId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingLayerId) return;

    // Cursor style logic
    if (!dragState.isDragging) {
      const canvas = canvasRef.current;
      if (canvas && loadedImage) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { x, y } = getCanvasCoordinates(e);
          let cursor = 'default';

          // Check selected layer controls first for cursor priority
           if (selectedLayerId) {
                const selectedLayer = layers.find(l => l.id === selectedLayerId);
                if (selectedLayer) {
                     const result = isPointInLayer(ctx, selectedLayer, x, y);
                     if (result === 'handle') cursor = 'nwse-resize';
                     else if (result === 'rotate') cursor = 'grab';
                }
           }

           // If no control cursor, check bodies
           if (cursor === 'default') {
               for (let i = layers.length - 1; i >= 0; i--) {
                  const result = isPointInLayer(ctx, layers[i], x, y);
                  if (result === 'body') {
                    cursor = 'move';
                    break;
                  }
               }
           }
          canvas.style.cursor = cursor;
        }
      }
      return;
    }

    // Drag Logic
    if (dragState.isDragging && dragState.initialLayerState) {
      const layer = dragState.initialLayerState;
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (dragState.mode === 'move') {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;
        const deltaXPercent = (deltaX / canvas.getBoundingClientRect().width) * 100;
        const deltaYPercent = (deltaY / canvas.getBoundingClientRect().height) * 100;

        updateLayer({
          ...layer,
          x: layer.x + deltaXPercent,
          y: layer.y + deltaYPercent,
        });
      } else if (dragState.mode === 'resize') {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;
        const sensitivity = 0.5;
        const sizeDelta = (deltaX + deltaY) * sensitivity;
        const newSize = Math.max(10, Math.min(300, layer.size + sizeDelta));

        updateLayer({ ...layer, size: newSize });
      } else if (dragState.mode === 'rotate') {
        const rect = canvas.getBoundingClientRect();
        // Calculate center of text in screen coordinates
        const centerX = rect.left + (rect.width * layer.x / 100);
        const centerY = rect.top + (rect.height * layer.y / 100);

        // Angle from center to mouse
        const radians = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const degrees = radians * (180 / Math.PI);

        // Offset by 90 degrees because handle is at top (which is -90 deg in cartesian)
        updateLayer({ ...layer, rotation: degrees + 90 });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDragState(prev => ({ ...prev, isDragging: false, mode: null }));
    if (e.target) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleDoubleClick = () => {
      if (selectedLayerId) {
          setEditingLayerId(selectedLayerId);
          setDragState(prev => ({ ...prev, isDragging: false, mode: null }));
      }
  };

  // --- Other Handlers ---

  const handleMemeSelect = (meme: MemeTemplate) => {
    setSelectedMeme(meme);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a temporary object URL (no caching/saving)
    const objectUrl = URL.createObjectURL(file);

    // Create a custom template for the uploaded image
    const customTemplate: MemeTemplate = {
      id: `upload-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      url: objectUrl,
    };

    setSelectedMeme(customTemplate);

    // Reset file input so same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const saveMeme = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isSaving) return;

    setIsSaving(true);
    const prevSelection = selectedLayerId;
    const prevEditing = editingLayerId;

    // Clear selections for clean render
    setSelectedLayerId(null);
    setEditingLayerId(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 50));

      const imageData = canvas.toDataURL('image/png');

      const response = await fetch('/api/memes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          templateName: selectedMeme.name,
          layersJson: JSON.stringify(layers),
          walletAddress: address || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Add the new meme to the gallery
        setSavedMemes(prev => [{
          id: data.meme.id,
          image_data: imageData,
          template_name: selectedMeme.name,
          wallet_address: address || '',
          approval_status: 'pending',
          created_at: data.meme.created_at,
        }, ...prev]);
        setHasUnsavedChanges(false);
        alert('Meme saved! It will appear in the gallery after admin approval.');
      } else {
        alert('Failed to save meme. Please try again.');
      }
    } catch (error) {
      console.error('Error saving meme:', error);
      alert('Failed to save meme. Please try again.');
    } finally {
      setSelectedLayerId(prevSelection);
      setEditingLayerId(prevEditing);
      setIsSaving(false);
    }
  };

  const deleteMeme = async (id: number) => {
    if (!confirm('Are you sure you want to delete this meme?')) return;

    try {
      const response = await fetch(`/api/memes?id=${id}&wallet=${address || ''}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setSavedMemes(prev => prev.filter(m => m.id !== id));
      }
    } catch (error) {
      console.error('Error deleting meme:', error);
    }
  };

  const updateLayer = (updatedLayer: TextLayer) => {
    setLayers(prev => prev.map(l => l.id === updatedLayer.id ? updatedLayer : l));
  };

  const addLayer = () => {
    const newId = Date.now().toString();
    setLayers(prev => [
      ...prev,
      { id: newId, text: 'NEW TEXT', x: 50, y: 50, size: 40, color: '#ffffff', strokeColor: '#000000', backgroundColor: null, rotation: 0, isUppercase: true }
    ]);
    setSelectedLayerId(newId);
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const downloadMeme = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevSelection = selectedLayerId;
    const prevEditing = editingLayerId;

    setSelectedLayerId(null);
    setEditingLayerId(null);

    setTimeout(() => {
        const link = document.createElement('a');
        link.download = `meme-${selectedMeme.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        setSelectedLayerId(prevSelection);
        setEditingLayerId(prevEditing);
    }, 50);
  };

  const copyMeme = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevSelection = selectedLayerId;
    const prevEditing = editingLayerId;

    setSelectedLayerId(null);
    setEditingLayerId(null);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
          canvas.toBlob(async (blob) => {
              if (!blob) {
                resolve();
                return;
              }
              try {
                  await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': blob })
                  ]);
                  alert('Meme copied to clipboard!');
              } catch (err) {
                  console.error('Failed to copy', err);
                  alert('Failed to copy. Try downloading.');
              }
              setSelectedLayerId(prevSelection);
              setEditingLayerId(prevEditing);
              resolve();
          });
      }, 50);
    });
  };

  const shareToTwitter = () => {
    const text = `Check out this meme I made with MORB IT!`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

    copyMeme().then(() => {
        setTimeout(() => window.open(twitterUrl, '_blank'), 1000);
    });
  };

  const renderEditingOverlay = () => {
    if (!editingLayerId || !canvasRef.current || !containerRef.current) return null;
    const layer = layers.find(l => l.id === editingLayerId);
    if (!layer) return null;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate exact pixel position relative to the container
    const relativeLeft = canvasRect.left - containerRect.left;
    const relativeTop = canvasRect.top - containerRect.top;

    const layerXPos = relativeLeft + (canvasRect.width * layer.x / 100);
    const layerYPos = relativeTop + (canvasRect.height * layer.y / 100);

    const displayWidth = canvas.offsetWidth;
    const scaleFactor = displayWidth / canvas.width;
    const visualFontSize = (layer.size / 600) * canvas.width * scaleFactor;

    const bgPadding = visualFontSize * 0.2;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: `${layerYPos}px`,
        left: `${layerXPos}px`,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
        fontSize: `${visualFontSize}px`,
        fontFamily: "'Oswald', sans-serif",
        fontWeight: 900,
        color: layer.color,
        background: layer.backgroundColor || 'transparent',
        padding: layer.backgroundColor ? `${bgPadding}px` : '0',
        border: '1px dashed rgba(6, 182, 212, 0.8)',
        outline: 'none',
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        minWidth: 'min(200px, 85vw)',
        width: 'auto',
        maxWidth: 'min(90%, 100vw)',
        overflow: 'hidden',
        lineHeight: '1.2',
        zIndex: 20,
    };

    return (
        <textarea
            autoFocus
            onFocus={(e) => {
                // Move cursor to end on initial focus
                const val = e.target.value;
                e.target.setSelectionRange(val.length, val.length);
            }}
            value={layer.text}
            onChange={(e) => {
                const textarea = e.target;
                const selStart = textarea.selectionStart;
                const selEnd = textarea.selectionEnd;
                const newText = layer.isUppercase ? e.target.value.toUpperCase() : e.target.value;
                updateLayer({ ...layer, text: newText });
                // Restore cursor position after React re-render
                requestAnimationFrame(() => {
                    textarea.setSelectionRange(selStart, selEnd);
                });
            }}
            onBlur={() => setEditingLayerId(null)}
            style={style}
            className="resize-none shadow-none drop-shadow-md placeholder-transparent"
        />
    );
  };

  const renderFloatingToolbar = () => {
    if (!selectedLayerId || dragState.isDragging) return null;

    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer || !canvasRef.current || !containerRef.current) return null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Measurement
    const fontSize = (layer.size / 600) * canvas.width;
    ctx.font = `900 ${fontSize}px 'Oswald', sans-serif`;
    const textToMeasure = layer.isUppercase ? layer.text.toUpperCase() : layer.text;
    const maxWidth = canvas.width * 0.9;
    const { width: textWidth, height: textHeight } = calculateLayout(ctx, textToMeasure, maxWidth, fontSize);

    // Positioning
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const relativeLeft = canvasRect.left - containerRect.left;
    const relativeTop = canvasRect.top - containerRect.top;

    const layerXPos = relativeLeft + (canvasRect.width * layer.x / 100);
    const layerYPos = relativeTop + (canvasRect.height * layer.y / 100);

    const scale = canvasRect.width / canvas.width;
    const domTextHeight = textHeight * scale;
    const domTextWidth = textWidth * scale;

    // Calculate bounding box for rotated text
    const rad = Math.abs(layer.rotation * Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const bbHeight = domTextWidth * sin + domTextHeight * cos;
    const bbWidth = domTextWidth * cos + domTextHeight * sin;

    // Position at bottom left of text box
    const toolbarStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${layerXPos - bbWidth / 2}px`,
        top: `${layerYPos + bbHeight / 2 + 2}px`,
        zIndex: 30,
    };

    const tagStyle = "h-5 px-1.5 text-[10px] font-bold flex items-center justify-center cursor-pointer hover:opacity-80 active:scale-95 transition-all";

    return (
        <div
            style={toolbarStyle}
            className="flex"
            onPointerDown={(e) => e.stopPropagation()}
        >
             {/* Text Color */}
             <label
                className={tagStyle}
                style={{ background: layer.color, color: layer.color === '#ffffff' || layer.color === '#fff' ? '#000' : '#fff' }}
                title="Text Color"
             >
                <span className="mr-0.5">A</span>
                <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => updateLayer({...layer, color: e.target.value})}
                    className="w-0 h-0 opacity-0 absolute"
                />
             </label>

             {/* Background Color */}
             <label
                className={tagStyle}
                style={{
                  background: layer.backgroundColor || 'transparent',
                  color: layer.backgroundColor ? '#fff' : 'rgba(255,255,255,0.8)',
                  border: layer.backgroundColor ? 'none' : '1px dashed rgba(255,255,255,0.4)',
                }}
                title="Background Fill"
             >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
                <input
                    type="color"
                    value={layer.backgroundColor || '#000000'}
                    onChange={(e) => updateLayer({...layer, backgroundColor: e.target.value})}
                    className="w-0 h-0 opacity-0 absolute"
                />
             </label>

             {/* Clear Background */}
             {layer.backgroundColor && (
               <button
                  onClick={() => updateLayer({...layer, backgroundColor: null})}
                  className={tagStyle}
                  style={{ background: 'rgba(100,100,100,0.8)', color: '#fff' }}
                  title="Clear Background"
               >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
               </button>
             )}

             {/* Delete */}
             <button
                onClick={() => removeLayer(layer.id)}
                className={tagStyle}
                style={{ background: 'rgba(239, 68, 68, 0.9)', color: '#fff' }}
                title="Delete"
             >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
             </button>
        </div>
    );
  };

  return (
    <GlobalMainNav>
      <div
        className="min-h-screen text-white p-3 sm:p-4 md:p-8 font-sans pt-4 md:pt-2"
        style={{
          background: 'linear-gradient(145deg, rgb(10, 15, 20), rgb(16, 26, 35))',
        }}
      >
        <main className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pt-2 sm:pt-4">

        {/* 2-Column Grid: Meme Selector + Canvas (single column on mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

          {/* Meme Selector */}
          <div className="order-1 space-y-3 sm:space-y-4">
            <MemeSelector
                templates={MEME_TEMPLATES}
                selectedId={selectedMeme.id}
                onSelect={handleMemeSelect}
            />

            {/* Upload Image Section */}
            <div
              className="p-3 sm:p-4 rounded-xl"
              style={{
                background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
              }}
            >
              <h2 className="text-lg font-bold mb-3 text-cyan-300">Or Upload Your Own</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="flex items-center justify-center gap-2 w-full text-white font-bold py-3 px-6 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer touch-manipulation min-h-[44px]"
                style={{
                  background: 'linear-gradient(145deg, rgba(139, 92, 246, 0.8), rgba(124, 58, 237, 0.8))',
                  boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Upload Image
              </label>
              <p className="text-xs text-cyan-300/50 mt-2 text-center">Image is not saved or stored</p>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="order-2 space-y-4">
            {/* Canvas Container */}
            <div className="relative">
              {/* Add Text Button - Top Right */}
              <button
                onClick={addLayer}
                className="absolute top-1 right-1 sm:-top-2 sm:-right-2 z-40 text-white text-xs font-bold px-3 py-2 sm:py-1.5 rounded-full transition-all hover:scale-105 active:scale-95 flex items-center gap-1 min-h-[36px] touch-manipulation"
                style={{
                  background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.8), rgba(8, 145, 178, 0.8))',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                  border: '1px solid rgba(6, 182, 212, 0.5)',
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Text
              </button>
              <div
                ref={containerRef}
                className="rounded-xl flex justify-center items-center min-h-[260px] sm:min-h-[360px] md:min-h-[400px] relative group overflow-hidden"
                style={{
                  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                }}
              >
                {!loadedImage ? (
                    <div className="flex flex-col items-center justify-center text-cyan-300/60">
                         <svg className="animate-spin h-8 w-8 text-cyan-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         <span>Loading Template...</span>
                    </div>
                ) : (
                    <>
                        <canvas
                            ref={canvasRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onDoubleClick={handleDoubleClick}
                            className="max-w-full h-auto shadow-2xl rounded-sm object-contain max-h-[55vh] sm:max-h-[70vh] touch-none cursor-default"
                            style={{ maxWidth: '100%' }}
                        />
                        {renderEditingOverlay()}
                        {renderFloatingToolbar()}
                    </>
                )}
              </div>
            </div>

            {/* Action Buttons — 2x2 on mobile for larger touch targets, 4 cols on sm+ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2">
                <button
                    onClick={saveMeme}
                    disabled={isSaving}
                    className="flex items-center justify-center gap-1.5 text-white font-bold py-3 sm:py-2.5 px-3 rounded-xl transition-all hover:scale-105 active:scale-95 text-sm min-h-[44px] sm:min-h-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.8))',
                      boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                    }}
                >
                    {isSaving ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                    )}
                    <span className="hidden sm:inline">{isSaving ? 'Saving' : 'Save'}</span>
                </button>
                <button
                    onClick={shareToTwitter}
                    className="flex items-center justify-center gap-1.5 text-white font-bold py-3 sm:py-2.5 px-3 rounded-xl transition-all hover:scale-105 active:scale-95 text-sm min-h-[44px] sm:min-h-0"
                    style={{
                      background: 'linear-gradient(145deg, rgba(29, 161, 242, 0.8), rgba(29, 161, 242, 0.6))',
                      boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(29, 161, 242, 0.2)',
                      border: '1px solid rgba(29, 161, 242, 0.4)',
                    }}
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                    <span className="hidden sm:inline">Share</span>
                </button>
                <button
                    onClick={copyMeme}
                    className="flex items-center justify-center gap-1.5 text-white font-bold py-3 sm:py-2.5 px-3 rounded-xl transition-all hover:scale-105 active:scale-95 text-sm min-h-[44px] sm:min-h-0"
                    style={{
                      background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.8), rgba(8, 145, 178, 0.8))',
                      boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(6, 182, 212, 0.2)',
                      border: '1px solid rgba(6, 182, 212, 0.4)',
                    }}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                    onClick={downloadMeme}
                    className="flex items-center justify-center gap-1.5 text-white font-bold py-3 sm:py-2.5 px-3 rounded-xl transition-all hover:scale-105 active:scale-95 text-sm min-h-[44px] sm:min-h-0"
                    style={{
                      background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
                      boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                      border: '1px solid rgba(60, 60, 60, 0.5)',
                    }}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    <span className="hidden sm:inline">Download</span>
                </button>
            </div>
          </div>

        </div>

        {/* Community Meme Gallery */}
        <div
          className="mt-6 sm:mt-8 p-4 sm:p-6 rounded-xl"
          style={{
            background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
          }}
        >
          <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-cyan-300 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Community Memes
          </h2>

          {isLoadingGallery ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : savedMemes.length === 0 ? (
            <div className="text-center py-12 text-cyan-300/60">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg">No memes saved yet</p>
              <p className="text-sm mt-1">Create your first meme and click Save!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {savedMemes.map((meme) => (
                <div
                  key={meme.id}
                  className="relative group rounded-lg overflow-hidden"
                  style={{
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                  }}
                >
                  <img
                    src={meme.image_data}
                    alt={meme.template_name || 'Saved meme'}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <span className="text-xs text-cyan-300 truncate">
                        {meme.approval_status === 'pending' ? 'Pending approval' : new Date(meme.created_at).toLocaleDateString()}
                      </span>
                      {(address && meme.wallet_address === address) && (
                        <button
                          onClick={() => deleteMeme(meme.id)}
                          className="p-1.5 rounded bg-red-500/80 hover:bg-red-500 transition-colors"
                          title="Delete"
                        >
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div
            className="w-full max-w-md p-6 rounded-xl mx-4"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
            }}
          >
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Unsaved Changes</h3>
            <p className="text-gray-300 mb-6">
              You have unsaved changes. Would you like to save your meme before leaving?
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={async () => {
                  await saveMeme();
                  setShowExitModal(false);
                  if (pendingNavigation) {
                    window.location.href = pendingNavigation;
                  }
                }}
                className="flex-1 py-3 sm:py-2.5 px-4 rounded-lg font-bold text-white transition-all hover:scale-105 min-h-[44px]"
                style={{
                  background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.8))',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                }}
              >
                Save & Leave
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  setHasUnsavedChanges(false);
                  if (pendingNavigation) {
                    window.location.href = pendingNavigation;
                  }
                }}
                className="flex-1 py-3 sm:py-2.5 px-4 rounded-lg font-bold text-white transition-all hover:scale-105 min-h-[44px]"
                style={{
                  background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.8))',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                Leave
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  setPendingNavigation(null);
                }}
                className="flex-1 py-3 sm:py-2.5 px-4 rounded-lg font-bold text-gray-300 transition-all hover:scale-105 min-h-[44px]"
                style={{
                  background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
                  border: '1px solid rgba(60, 60, 60, 0.5)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </GlobalMainNav>
  );
}
