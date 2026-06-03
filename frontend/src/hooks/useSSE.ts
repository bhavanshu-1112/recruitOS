import { useEffect, useRef, useState, useCallback } from 'react';
import type { ActivityEvent } from '@/types/dashboard.types';

const MAX_EVENTS = 50;
const BASE_DELAY = 1_000; // 1 s
const MAX_DELAY = 30_000; // 30 s

interface UseSSEReturn {
  events: ActivityEvent[];
  isConnected: boolean;
  error: string | null;
}

/**
 * Subscribe to a Server-Sent Events endpoint.
 *
 * Features:
 * - Auto-reconnect with exponential back-off (1 s → 30 s cap).
 * - Ring buffer capped at 50 events.
 * - Full cleanup on unmount.
 */
export function useSSE(url: string): UseSSEReturn {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retriesRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushEvent = useCallback((evt: ActivityEvent) => {
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  }, []);

  const connect = useCallback(() => {
    // Avoid opening duplicate connections
    esRef.current?.close();

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
      retriesRef.current = 0;
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ActivityEvent;
        pushEvent(data);
      } catch {
        // Ignore unparsable frames
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();

      // Exponential back-off
      const delay = Math.min(BASE_DELAY * 2 ** retriesRef.current, MAX_DELAY);
      retriesRef.current += 1;
      setError(`Disconnected – retrying in ${Math.round(delay / 1000)}s`);

      timerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [url, pushEvent]);

  useEffect(() => {
    connect();

    return () => {
      esRef.current?.close();
      if (timerRef.current) {clearTimeout(timerRef.current);}
    };
  }, [connect]);

  return { events, isConnected, error };
}
