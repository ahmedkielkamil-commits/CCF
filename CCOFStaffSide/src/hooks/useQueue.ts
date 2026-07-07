import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiBase } from '../api/client';
import { fetchQueue } from '../api/queue';
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

  const counts = useMemo(() => {
    const entries = queue?.entries ?? [];
    return {
      total: entries.length,
      waitingOutside: entries.filter((entry) => entry.status === 'waiting').length,
      beingSeen: entries.filter((entry) => entry.status === 'roomed').length,
    };
  }, [queue]);

  return { queue, setQueue, loading, error, counts };
}
