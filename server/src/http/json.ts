import type { Response } from 'express';

export const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

export function sendJson(res: Response, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, jsonReplacer));
}
