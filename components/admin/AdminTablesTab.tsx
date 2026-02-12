'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { getApiUrlOptional } from '@/lib/api-urls';
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
import { Plus, Pencil, Trash2, ExternalLink, ImageIcon } from 'lucide-react';
import Image from 'next/image';

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
  return <Image src={url} alt="Preview" fill className="object-cover" sizes="140px" unoptimized />;
}

export interface BlackjackTableRow {
  id: string;
  kind: 'image' | 'video';
  name: string;
  src: string;
  description: string | null;
  token_contract_address: string | null;
  sort_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function AdminTablesTab() {
  const { address } = useAccount();
  const apiBase = getApiUrlOptional();
  const [tables, setTables] = useState<BlackjackTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<BlackjackTableRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchTables = useCallback(async () => {
    if (!apiBase || !address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/tables`, {
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTables(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables');
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, address]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  if (!apiBase) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="py-4 px-3 text-xs text-slate-500">
          Backend not configured (NEXT_PUBLIC_API_URL). Tables are stored on the game server.
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
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-slate-600 text-slate-300"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
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
                        <a
                          href={`https://dexscreener.com/pulsechain/${row.token_contract_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-cyan-400 hover:underline flex items-center gap-0.5"
                        >
                          {row.token_contract_address.slice(0, 6)}… <ExternalLink className="w-2.5 h-2.5" />
                        </a>
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
          apiBase={apiBase}
          submitting={submitting}
          setSubmitting={setSubmitting}
        />
      )}

      <DeleteConfirmDialog
        id={deleteId}
        onClose={() => setDeleteId(null)}
        onSuccess={() => { setDeleteId(null); fetchTables(); }}
        address={address ?? ''}
        apiBase={apiBase}
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
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || files.length === 0) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('file', files[0]);
      form.set('kind', kind);
      const uploadRes = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'x-admin-wallet': address },
        body: form,
      });
      if (!uploadRes.ok) {
        const d = await uploadRes.json().catch(() => ({}));
        throw new Error(d.error || 'Upload failed');
      }
      const { path } = await uploadRes.json();
      const apiBase = getApiUrlOptional();
      if (!apiBase) throw new Error('Backend not configured');
      const createRes = await fetch(`${apiBase}/api/admin/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({ kind, name: name.trim(), src: path, enabled: true }),
      });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        throw new Error(d.error || 'Create failed');
      }
      onSuccess();
      setName('');
      setFiles([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Add table</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Upload an image or video and set name. Optional: description and token contract (DexScreener).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
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
          <div>
            <Label className="text-[11px] text-slate-400">File</Label>
            <div className="mt-0.5">
              <FileUpload onChange={(f) => setFiles(f)} />
            </div>
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
          <DialogFooter className="gap-2 pt-2">
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
  apiBase,
  submitting,
  setSubmitting,
}: {
  row: BlackjackTableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  address: string;
  apiBase: string;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description ?? '');
  const [tokenContract, setTokenContract] = useState(row.token_contract_address ?? '');
  const [enabled, setEnabled] = useState(row.enabled);

  useEffect(() => {
    setName(row.name);
    setDescription(row.description ?? '');
    setTokenContract(row.token_contract_address ?? '');
    setEnabled(row.enabled);
  }, [row]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/tables/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-wallet': address },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          token_contract_address: tokenContract.trim() || null,
          enabled,
        }),
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
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Edit table</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Update description and token contract (DexScreener link).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-[11px] text-slate-400">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600"
              required
            />
          </div>
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
            <Label className="text-[11px] text-slate-400">Token contract (DexScreener)</Label>
            <Input
              value={tokenContract}
              onChange={(e) => setTokenContract(e.target.value)}
              className="mt-0.5 h-8 text-xs bg-slate-800 border-slate-600 font-mono"
              placeholder="0x…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label className="text-[11px] text-slate-400">Enabled</Label>
          </div>
          <DialogFooter className="gap-2 pt-2">
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
  apiBase,
}: {
  id: string | null;
  onClose: () => void;
  onSuccess: () => void;
  address: string;
  apiBase: string;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/tables/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-wallet': address },
      });
      if (!res.ok) throw new Error('Delete failed');
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
