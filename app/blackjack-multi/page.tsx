import type { BJMultiTableSummary } from '@/lib/websocket-client';
import { getBackendUrl } from '@/app/api/_utils/backend';
import BlackjackMultiLobbyClient from './BlackjackMultiLobbyClient';

async function getInitialTables(): Promise<{
  tables: BJMultiTableSummary[];
  error: string | null;
}> {
  try {
    const res = await fetch(`${getBackendUrl()}/api/bj-multi/admin/tables`, {
      method: 'GET',
      next: { revalidate: 10 },
    });

    if (!res.ok) {
      return { tables: [], error: 'Failed to load tables' };
    }

    const data = await res.json();
    return { tables: data?.tables ?? [], error: null };
  } catch {
    return { tables: [], error: 'Failed to load tables' };
  }
}

export default async function BlackjackMultiLobbyPage() {
  const { tables, error } = await getInitialTables();
  return <BlackjackMultiLobbyClient initialTables={tables} initialError={error} />;
}
