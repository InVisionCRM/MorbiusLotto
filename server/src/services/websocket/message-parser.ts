export interface IncomingWebSocketMessage {
  type: string;
  payload: unknown;
  requestId?: string;
}

export function parseIncomingWebSocketMessage(data: Buffer): IncomingWebSocketMessage {
  const parsed = JSON.parse(data.toString()) as IncomingWebSocketMessage;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    throw new Error('Invalid message format');
  }
  return parsed;
}

export function extractRequestIdFromRawMessage(data: Buffer): string | undefined {
  try {
    const parsed = JSON.parse(data.toString()) as { requestId?: unknown };
    return typeof parsed?.requestId === 'string' ? parsed.requestId : undefined;
  } catch {
    return undefined;
  }
}
