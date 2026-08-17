'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileUpload } from '@/components/ui/file-upload';
import { Plus, Pencil, Trash2, ExternalLink, ImageIcon, Database } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { CARD_ANGLE_PRESETS } from '@/lib/blackjack-card-presets';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
} from '@/app/BLACKJACK/constants';
import Image from 'next/image';
import { Theme } from '@/lib/theme';
import { TableProfile } from '@/components/BLACKJACK/TableProfile';
import { adminUploadTableFile } from '@/lib/admin-table-upload';

/** In-game token profile card styling (matches TableTokenProfileCard) */
const TOKEN_CARD_PANEL_STYLE = {
  background: Theme.panel.sidebar.background,
  boxShadow: Theme.panel.sidebar.boxShadow,
  border: Theme.panel.sidebar.border,
} as const;

/** Live preview of the token profile card as it appears in-game. Updates as form fields change. */
function TokenProfilePreviewCard({
  tableName,
  description,
  tokenContract,
  logoUrl,
  ticker,
  websiteUrl,
  iframeUrl,
  showIframe = false,
}: {
  tableName: string;
  description: string;
  tokenContract: string;
  logoUrl: string;
  ticker: string;
  websiteUrl: string;
  iframeUrl?: string;
  /** Omit iframe in admin preview (avoids blocked embeds / geicko console noise). */
  showIframe?: boolean;
}) {
  const tokenAddress =
    tokenContract.trim().startsWith('0x') && tokenContract.trim().length >= 42
      ? tokenContract.trim()
      : undefined;
  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col min-w-0 border border-slate-600"
      style={TOKEN_CARD_PANEL_STYLE}
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className={`${Theme.cyan.text.primary} font-semibold text-sm`}>Table token</h3>
        <span className="text-slate-400 text-xs truncate max-w-[140px]" title={tableName || 'Table name'}>
          {tableName || '—'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 min-h-[200px]">
        <TableProfile
          tokenAddress={tokenAddress}
          description={description.trim() || undefined}
          logoUrl={logoUrl.trim() || undefined}
          ticker={ticker.trim() || undefined}
          websiteUrl={websiteUrl.trim() || undefined}
          iframeUrl={iframeUrl?.trim() || undefined}
          showIframe={showIframe}
        />
      </div>
    </div>
  );
}

/** Canonical reference image for table viewpoint. New table images should match this perspective so chips and cards align. */
const REFERENCE_VIEWPOINT_SRC = '/BlackJack/BrandedTable/High-Roller.png';

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">Loading…</div>;
  // Native img avoids next/image blob URL edge cases (ERR_FILE_NOT_FOUND) after revoke/HMR.
  return <img src={url} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />;
}

/** Preview for a replacement file (image or video). */
function ReplacementPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">Loading…</div>;
  const isVideo = file.type.startsWith('video/');
  if (isVideo) {
    return <video src={url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />;
  }
  return <img src={url} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />;
}

export interface BlackjackTableRow {
  id: string;
  kind: 'image' | 'video';
  name: string;
  src: string;
  description: string | null;
  token_contract_address: string | null;
  logo_url: string | null;
  ticker: string | null;
  iframe_url: string | null;
  website_url: string | null;
  card_pitch: { dealer: number; player: number } | null;
  sort_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Object URL for a pending upload, revoked on change/unmount. */
function useFileObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/**
 * The angle preview stage: the table's own art with real cards floating over
 * it at the chosen leans — dealer hand upper, player hand lower, exactly the
 * production transform (perspective(700px) rotateX(deg), origin bottom). This
 * is judged against the ART, which is the whole point: a lean only looks right
 * or wrong relative to the perspective the table was drawn in.
 */
function AngleStage({
  artUrl,
  artIsVideo,
  dealer,
  player,
}: {
  artUrl: string;
  artIsVideo: boolean;
  dealer: number;
  player: number;
}) {
  const card = (face: string, w: string) => (
    // Native img: art and faces may be blob: or cross-host uploads.
     
    <img
      key={face}
      src={`/BlackJack/Cards/PNG/${face}.png`}
      alt=""
      style={{ width: w, borderRadius: '6%', boxShadow: '0 4px 10px rgba(0,0,0,0.55)' }}
    />
  );
  const hand = (faces: string[], deg: number, label: string, top: string, cardW: string) => (
    <div
      className="absolute left-1/2 flex flex-col items-center"
      style={{ top, transform: 'translateX(-50%)' }}
    >
      <div
        className="flex gap-[2%]"
        style={{ transform: `perspective(700px) rotateX(${deg}deg)`, transformOrigin: 'center bottom' }}
      >
        {faces.map((f) => card(f, cardW))}
      </div>
      <span className="mt-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-semibold tracking-wide text-cyan-200">
        {label} {deg}&deg;
      </span>
    </div>
  );
  return (
    <div className="absolute inset-0">
      {artIsVideo ? (
        <video src={artUrl} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay loop />
      ) : (
         
        <img src={artUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {/* The hands read better against a slightly settled image. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.22))' }} />
      {hand(['KS', 'AD'], dealer, 'DEALER', '16%', 'clamp(28px, 9%, 64px)')}
      {hand(['AS', 'KH', 'QD'], player, 'PLAYER', '55%', 'clamp(34px, 11%, 80px)')}
    </div>
  );
}

/**
 * Card lean editor — the same presets Table Forge uses, plus fine-tune inputs
 * and a live preview of both hands OVER the table's own art (the uploaded file
 * before save, the stored art when editing). Expands to near-fullscreen,
 * because a lean can only be judged against the drawn perspective and a
 * thumbnail hides exactly that. null = flat (the default for top-down art).
 * The live felt applies this as perspective(700px) rotateX(deg) per hand.
 */
function CardAngleField({
  value,
  onChange,
  artFile = null,
  artSrc = null,
  artIsVideo = false,
}: {
  value: { dealer: number; player: number } | null;
  onChange: (v: { dealer: number; player: number } | null) => void;
  /** Pending upload — wins over artSrc so the preview matches what will save. */
  artFile?: File | null;
  /** Already-saved art (edit dialog). */
  artSrc?: string | null;
  artIsVideo?: boolean;
}) {
  const clampDeg = (n: number) => Math.min(75, Math.max(0, Math.round(n)));
  const fileUrl = useFileObjectUrl(artFile);
  const artUrl = fileUrl ?? (artSrc || null);
  const artFromFile = fileUrl != null;
  const isVideo = artFromFile ? (artFile?.type.startsWith('video/') ?? false) : artIsVideo;
  const [expanded, setExpanded] = useState(false);
  const dealer = value?.dealer ?? 0;
  const player = value?.player ?? 0;
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-slate-400">
        Card angle <span className="text-slate-500">(match cards to table art drawn in perspective)</span>
      </Label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-2 py-1 rounded text-[11px] border ${value == null ? 'border-cyan-500 bg-cyan-900/40 text-white' : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'}`}
        >
          Flat (stock)
        </button>
        {CARD_ANGLE_PRESETS.filter((p) => p.pitch.dealer !== 0 || p.pitch.player !== 0).map((p) => {
          const active = value != null && value.dealer === p.pitch.dealer && value.player === p.pitch.player;
          return (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => onChange({ ...p.pitch })}
              className={`px-2 py-1 rounded text-[11px] border ${active ? 'border-cyan-500 bg-cyan-900/40 text-white' : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {value != null && (
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            Dealer
            <input
              type="number"
              min={0}
              max={75}
              value={value.dealer}
              onChange={(e) => onChange({ ...value, dealer: clampDeg(Number(e.target.value)) })}
              className="w-16 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 text-[11px]"
            />
            &deg;
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            Players
            <input
              type="number"
              min={0}
              max={75}
              value={value.player}
              onChange={(e) => onChange({ ...value, player: clampDeg(Number(e.target.value)) })}
              className="w-16 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 text-[11px]"
            />
            &deg;
          </label>
        </div>
      )}
      {artUrl ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Click to expand"
          className="relative block w-full aspect-video overflow-hidden rounded-lg border border-slate-600 hover:border-cyan-500/60 transition-colors cursor-zoom-in"
        >
          <AngleStage artUrl={artUrl} artIsVideo={isVideo} dealer={dealer} player={player} />
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-slate-200">
            Click to expand
          </span>
        </button>
      ) : (
        <p className="text-[10px] text-slate-500">
          Pick a table image or video above to preview the card angle over your art.
        </p>
      )}
      {expanded && artUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-6 cursor-zoom-out"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-label="Card angle preview"
        >
          <div className="relative w-[min(94vw,1200px)] aspect-video overflow-hidden rounded-xl border border-slate-500 shadow-2xl">
            <AngleStage artUrl={artUrl} artIsVideo={isVideo} dealer={dealer} player={player} />
          </div>
          <span className="absolute top-4 right-6 text-slate-300 text-sm">Click anywhere to close</span>
        </div>
      )}
    </div>
  );
}

export default function AdminTablesTab() {
  const { address } = useAccount();
  const [tables, setTables] = useState<BlackjackTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<BlackjackTableRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchTables = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tables', {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTables(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables');
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleSeedFromDefaults = useCallback(async () => {
    if (!address) return;
    setSeeding(true);
    try {
      const tables = [
        ...BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ kind: 'image' as const, name: x.label, src: x.src })),
        ...BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ kind: 'video' as const, name: x.label, src: x.src })),
      ];
      const res = await fetch('/api/admin/tables/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({ tables }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      await fetchTables();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }, [address, fetchTables]);

  if (!address) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Connect wallet to load tables.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Viewpoint reference: compare new table images to this so chips/cards line up */}
      <Card className="bg-slate-900/60 border-slate-700/50 mb-3">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
            Viewpoint reference
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <p className="text-[11px] text-slate-500 mb-2">
            New table images should match this perspective so chips and cards line up in-game. Use the same aspect ratio and keep the card/dealer area in the same position.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative w-40 aspect-[4/3] rounded border border-slate-600 overflow-hidden bg-slate-800 shrink-0">
              <Image src={REFERENCE_VIEWPOINT_SRC} alt="Reference viewpoint" fill className="object-cover" sizes="160px" />
            </div>
            <div className="text-[10px] text-slate-500 max-w-xs">
              Reference: High Roller. When adding a new table, compare your image side-by-side with this; align the table edge and betting circle so the game overlay matches.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="py-2 px-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium text-slate-200">Blackjack tables</CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-slate-600 text-slate-300"
              onClick={handleSeedFromDefaults}
              disabled={seeding || loading}
            >
              <Database className="w-3 h-3 mr-1" /> Seed from defaults
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-slate-600 text-slate-300"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-3">
          {loading && <p className="text-[11px] text-slate-500">Loading…</p>}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {!loading && !error && tables.length === 0 && (
            <p className="text-[11px] text-slate-500">No tables. Add one to get started.</p>
          )}
          {!loading && !error && tables.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50 hover:bg-transparent">
                  <TableHead className="text-[10px] text-slate-500 h-8">Name</TableHead>
                  <TableHead className="text-[10px] text-slate-500 h-8">Kind</TableHead>
                  <TableHead className="text-[10px] text-slate-500 h-8">Description</TableHead>
                  <TableHead className="text-[10px] text-slate-500 h-8">Token</TableHead>
                  <TableHead className="text-[10px] text-slate-500 h-8 w-[60px]">On</TableHead>
                  <TableHead className="text-[10px] text-slate-500 h-8 w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((row) => (
                  <TableRow key={row.id} className="border-slate-700/50">
                    <TableCell className="text-[11px] py-1.5 font-medium text-slate-200">{row.name}</TableCell>
                    <TableCell className="text-[11px] py-1.5 text-slate-400">{row.kind}</TableCell>
                    <TableCell className="text-[11px] py-1.5 text-slate-500 max-w-[120px] truncate">
                      {row.description || '—'}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {row.token_contract_address ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-mono text-[10px] text-slate-400" title={row.token_contract_address}>
                            {row.token_contract_address}
                          </span>
                          <CopyButton
                            content={row.token_contract_address!}
                            copyToast="Address copied"
                            variant="ghost"
                            size="xs"
                            className="p-0.5 h-7 w-7 text-slate-500 hover:text-cyan-400 hover:bg-slate-700/50"
                            title="Copy address"
                            aria-label="Copy address"
                          />
                          <a
                            href={`https://dexscreener.com/pulsechain/${row.token_contract_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:"
                            title="DexScreener"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Switch checked={row.enabled} disabled className="scale-75" />
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-400"
                          onClick={() => setEditRow(row)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-red-400"
                          onClick={() => setDeleteId(row.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddTableDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => { setAddOpen(false); fetchTables(); }}
        address={address ?? ''}
        submitting={submitting}
        setSubmitting={setSubmitting}
      />

      {editRow && (
        <EditTableDialog
          row={editRow}
          open={!!editRow}
          onOpenChange={(open) => !open && setEditRow(null)}
          onSuccess={() => { setEditRow(null); fetchTables(); }}
          address={address ?? ''}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
      )}

      <DeleteConfirmDialog
        id={deleteId}
        onClose={() => setDeleteId(null)}
        onSuccess={() => { setDeleteId(null); fetchTables(); }}
        address={address ?? ''}
      />
    </>
  );
}

function AddTableDialog({
  open,
  onOpenChange,
  onSuccess,
  address,
  submitting,
  setSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  address: string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [cardPitch, setCardPitch] = useState<{ dealer: number; player: number } | null>(null);
  const [description, setDescription] = useState('');
  const [tokenContract, setTokenContract] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File[]>([]);
  const [ticker, setTicker] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (logoFile.length === 0) {
      setLogoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(logoFile[0]);
    setLogoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logoFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || files.length === 0) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('file', files[0]);
      form.set('kind', kind);
      const { path } = await adminUploadTableFile(form, address);
      let resolvedLogoUrl: string | null = logoUrl.trim() || null;
      if (logoFile.length > 0) {
        const logoForm = new FormData();
        logoForm.set('file', logoFile[0]);
        logoForm.set('kind', 'image');
        logoForm.set('purpose', 'logo');
        const logoData = await adminUploadTableFile(logoForm, address);
        resolvedLogoUrl = logoData.path ?? null;
      }
      const createRes = await fetch('/api/admin/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          src: path,
          description: description.trim() || null,
          token_contract_address: tokenContract.trim() || null,
          logo_url: resolvedLogoUrl,
          ticker: ticker.trim() || null,
          iframe_url: iframeUrl.trim() || null,
          website_url: websiteUrl.trim() || null,
          card_pitch: cardPitch,
          enabled: true,
        }),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        throw new Error(d.error || 'Create failed');
      }
      onSuccess();
      setName('');
      setDescription('');
      setTokenContract('');
      setLogoUrl('');
      setLogoFile([]);
      setTicker('');
      setIframeUrl('');
      setWebsiteUrl('');
      setFiles([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveLogoUrl = (logoPreviewUrl ?? logoUrl.trim()) || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm">Add table</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Upload an image or video and set name. Optional: description and token contract (DexScreener). Large files upload directly to the game API when configured. Iframe URL must allow embedding (many homepages block iframes); leave blank to use the default Morbius chart when a token is set.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 gap-3">
          <div className="overflow-y-auto min-h-0 space-y-3 pr-1 -mr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="e.g. High Roller"
                  required
                />
              </div>
              <div>
                <Label htmlFor="add-table-kind" className="text-[11px] text-slate-400">Kind</Label>
                <select
                  id="add-table-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'image' | 'video')}
                  className="mt-0.5 h-8 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                  aria-label="Table kind: image or video"
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">File</Label>
              <div className="mt-0.5">
                <FileUpload onChange={(f) => setFiles(f)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Ticker</Label>
                <Input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="e.g. MORBIUS (optional)"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Token contract (DexScreener)</Label>
              <Input
                value={tokenContract}
                onChange={(e) => setTokenContract(e.target.value)}
                className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600 font-mono"
                placeholder="0x… (optional)"
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Logo (URL or upload)</Label>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="h-8 flex-1 min-w-[140px] text-xs bg-slate-800 border-slate-600"
                  placeholder="https://… or upload below"
                />
                <div className="w-full sm:w-auto min-w-[120px]">
                  <FileUpload onChange={(f) => setLogoFile(f)} />
                </div>
              </div>
              {logoFile.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-0.5">Uploaded file will be used (overrides URL on save).</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Iframe URL</Label>
                <Input
                  value={iframeUrl}
                  onChange={(e) => setIframeUrl(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="scan.morbius.io/geicko?… (optional)"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Website URL</Label>
                <Input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="https://… (optional)"
                />
              </div>
            </div>
            <CardAngleField value={cardPitch} onChange={setCardPitch} artFile={files[0] ?? null} />
            <div className="rounded border border-slate-600 bg-slate-800/50 p-2">
              <p className="text-[10px] text-slate-500 mb-1.5">In-game preview — updates as you type</p>
              <TokenProfilePreviewCard
                tableName={name}
                description={description}
                tokenContract={tokenContract}
                logoUrl={effectiveLogoUrl}
                ticker={ticker}
                websiteUrl={websiteUrl}
                iframeUrl={iframeUrl}
              />
            </div>
            {kind === 'image' && files.length > 0 && (
              <div className="rounded border border-slate-600 bg-slate-800/50 p-2">
                <p className="text-[10px] text-slate-500 mb-1.5">Compare with reference (align table/card area)</p>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-500 mb-0.5">Reference</p>
                    <div className="relative w-full aspect-[4/3] rounded overflow-hidden border border-slate-600">
                      <Image src={REFERENCE_VIEWPOINT_SRC} alt="Reference" fill className="object-cover" sizes="140px" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-500 mb-0.5">Your image</p>
                    <div className="relative w-full aspect-[4/3] rounded overflow-hidden border border-cyan-500/40 bg-slate-800">
                      <ImagePreview file={files[0]} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 pt-2 shrink-0 border-t border-slate-700/50">
            <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-7" disabled={submitting || !name.trim() || files.length === 0}>
              {submitting ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditTableDialog({
  row,
  open,
  onOpenChange,
  onSuccess,
  address,
  submitting,
  setSubmitting,
}: {
  row: BlackjackTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  address: string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? '');
  const [tokenContract, setTokenContract] = useState(row.token_contract_address ?? '');
  const [logoUrl, setLogoUrl] = useState(row.logo_url ?? '');
  const [logoFile, setLogoFile] = useState<File[]>([]);
  const [ticker, setTicker] = useState(row.ticker ?? '');
  const [iframeUrl, setIframeUrl] = useState(row.iframe_url ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(row.website_url ?? '');
  const [cardPitch, setCardPitch] = useState<{ dealer: number; player: number } | null>(row.card_pitch ?? null);
  const [enabled, setEnabled] = useState(row.enabled);
  const [replacementFile, setReplacementFile] = useState<File[]>([]);

  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (logoFile.length === 0) {
      setLogoPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(logoFile[0]);
    setLogoPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logoFile]);

  useEffect(() => {
    setName(row.name);
    setDescription(row.description ?? '');
    setTokenContract(row.token_contract_address ?? '');
    setLogoUrl(row.logo_url ?? '');
    setTicker(row.ticker ?? '');
    setIframeUrl(row.iframe_url ?? '');
    setWebsiteUrl(row.website_url ?? '');
    setCardPitch(row.card_pitch ?? null);
    setEnabled(row.enabled);
    setReplacementFile([]);
    setLogoFile([]);
  }, [row]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let newSrc: string | undefined;
      if (replacementFile.length > 0) {
        const form = new FormData();
        form.set('file', replacementFile[0]);
        form.set('kind', row.kind);
        const { path } = await adminUploadTableFile(form, address);
        newSrc = path;
      }
      let resolvedLogoUrl: string | null = logoUrl.trim() || null;
      if (logoFile.length > 0) {
        const logoForm = new FormData();
        logoForm.set('file', logoFile[0]);
        logoForm.set('kind', 'image');
        logoForm.set('purpose', 'logo');
        const logoData = await adminUploadTableFile(logoForm, address);
        resolvedLogoUrl = logoData.path ?? null;
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        token_contract_address: tokenContract.trim() || null,
        logo_url: resolvedLogoUrl,
        ticker: ticker.trim() || null,
        iframe_url: iframeUrl.trim() || null,
        website_url: websiteUrl.trim() || null,
        card_pitch: cardPitch,
        enabled,
      };
      if (newSrc !== undefined) body.src = newSrc;
      const res = await fetch(`/api/admin/tables/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Update failed');
      }
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm">Edit table</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Update name, image/video, description and token contract (DexScreener link).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 gap-3">
          <div className="overflow-y-auto min-h-0 space-y-3 pr-1 -mr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <Label className="text-[11px] text-slate-400">Enabled</Label>
              </div>
            </div>
            <div className="rounded border border-slate-600 bg-slate-800/50 p-2">
              <Label className="text-[11px] text-slate-400">Table {row.kind}</Label>
              <div className="mt-1 flex flex-wrap items-start gap-3">
                <div className="relative w-40 aspect-[4/3] rounded border border-slate-600 overflow-hidden bg-slate-800 shrink-0">
                  {replacementFile.length > 0 ? (
                    <ReplacementPreview file={replacementFile[0]} />
                  ) : row.kind === 'video' ? (
                    <video src={row.src} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                  ) : (
                    <Image src={row.src} alt={row.name} fill className="object-cover" sizes="160px" unoptimized={row.src.startsWith('http')} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className="text-[10px] text-slate-500">
                    {replacementFile.length > 0 ? 'New file selected — save to replace.' : 'Current ' + row.kind + '.'}
                  </p>
                  <FileUpload onChange={(f) => setReplacementFile(f)} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Ticker</Label>
                <Input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="e.g. MORBIUS (optional)"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Token contract (DexScreener)</Label>
              <Input
                value={tokenContract}
                onChange={(e) => setTokenContract(e.target.value)}
                className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600 font-mono"
                placeholder="0x…"
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-400">Logo (URL or upload)</Label>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="h-8 flex-1 min-w-[140px] text-xs bg-slate-800 border-slate-600"
                  placeholder="https://… or upload below"
                />
                <div className="w-full sm:w-auto min-w-[120px]">
                  <FileUpload onChange={(f) => setLogoFile(f)} />
                </div>
              </div>
              {logoFile.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-0.5">Uploaded file will be used (overrides URL on save).</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-slate-400">Iframe URL</Label>
                <Input
                  value={iframeUrl}
                  onChange={(e) => setIframeUrl(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="scan.morbius.io/geicko?… (optional)"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-400">Website URL</Label>
                <Input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
                  placeholder="https://… (optional)"
                />
              </div>
            </div>
            <CardAngleField value={cardPitch} onChange={setCardPitch} artFile={replacementFile[0] ?? null} artSrc={row.src} artIsVideo={row.kind === 'video'} />
            <div className="rounded border border-slate-600 bg-slate-800/50 p-2">
              <p className="text-[10px] text-slate-500 mb-1.5">In-game preview — updates as you type</p>
              <TokenProfilePreviewCard
                tableName={name}
                description={description}
                tokenContract={tokenContract}
                logoUrl={(logoPreviewUrl ?? logoUrl.trim()) || ''}
                ticker={ticker}
                websiteUrl={websiteUrl}
                iframeUrl={iframeUrl}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 shrink-0 border-t border-slate-700/50">
            <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-7" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  id,
  onClose,
  onSuccess,
  address,
}: {
  id: string | null;
  onClose: () => void;
  onSuccess: () => void;
  address: string;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/tables/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
          ? (data as { error: string }).error
          : `Delete failed (${res.status})`;
        throw new Error(msg);
      }
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Remove table</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            This table will be removed from the list. The file in public folder is not deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" className="text-xs h-7" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
