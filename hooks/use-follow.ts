'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface FollowEntry {
  address: string;
  displayName: string | null;
  avatarConfig: Record<string, unknown> | null;
}

export interface FollowCounts {
  followerCount: number;
  followingCount: number;
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useFollowCounts(address: string | null) {
  return useQuery<FollowCounts>({
    queryKey: ['followCounts', address],
    queryFn: async () => {
      const res = await fetch(`/api/player/${address}/follow-counts`);
      if (!res.ok) throw new Error('Failed to fetch follow counts');
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useIsFollowing(myAddress: string | null, targetAddress: string | null) {
  return useQuery<boolean>({
    queryKey: ['isFollowing', myAddress, targetAddress],
    queryFn: async () => {
      const res = await fetch(
        `/api/player/${targetAddress}/is-following?follower=${encodeURIComponent(myAddress!)}`,
      );
      if (!res.ok) throw new Error('Failed to check follow status');
      const data = await res.json();
      return data.isFollowing as boolean;
    },
    enabled: !!myAddress && !!targetAddress && myAddress.toLowerCase() !== targetAddress.toLowerCase(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useFollowers(address: string | null, limit = 50) {
  return useQuery<FollowEntry[]>({
    queryKey: ['followers', address, limit],
    queryFn: async () => {
      const res = await fetch(`/api/player/${address}/followers?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useFollowing(address: string | null, limit = 50) {
  return useQuery<FollowEntry[]>({
    queryKey: ['following', address, limit],
    queryFn: async () => {
      const res = await fetch(`/api/player/${address}/following?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useFollowMutation(myAddress: string | null, targetAddress: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['isFollowing', myAddress, targetAddress] });
    qc.invalidateQueries({ queryKey: ['followCounts', targetAddress] });
    qc.invalidateQueries({ queryKey: ['followCounts', myAddress] });
    qc.invalidateQueries({ queryKey: ['following', myAddress] });
    qc.invalidateQueries({ queryKey: ['followers', targetAddress] });
  };

  const follow = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/player/${targetAddress}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower: myAddress }),
      });
      if (!res.ok) throw new Error('Failed to follow');
      return res.json();
    },
    onSuccess: () => {
      // Optimistically update the isFollowing cache
      qc.setQueryData(['isFollowing', myAddress, targetAddress], true);
      invalidate();
    },
  });

  const unfollow = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/player/${targetAddress}/follow`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower: myAddress }),
      });
      if (!res.ok) throw new Error('Failed to unfollow');
      return res.json();
    },
    onSuccess: () => {
      qc.setQueryData(['isFollowing', myAddress, targetAddress], false);
      invalidate();
    },
  });

  return { follow, unfollow };
}
