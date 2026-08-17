import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { fetchQueue } from '../api/queue';
import { getApiBase } from '../api/client';
import { getClientTimezone } from '../utils/timezone';
import type { QueuePayload } from '../types/queue';

export function useQueue() {
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    async function load() {
      try {
        const payload = await fetchQueue();
        if (!cancelled) {
          setQueue(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load queue');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load().catch(() => undefined);

    socket = io(getApiBase(), {
      transports: ['websocket', 'polling'],
      auth: { timezone: getClientTimezone() },
      query: { timezone: getClientTimezone() },
    });

    socket.on('queue:update', (payload: QueuePayload) => {
      setQueue(payload);
      setError(null);
      setLoading(false);
    });

    socket.on('connect_error', () => {
      setError('Live updates disconnected');
    });

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
    };
  }, []);

  return { queue, loading, error, setQueue };
}
