import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Brain, CheckCircle2, AlertTriangle, Sparkles, Terminal } from 'lucide-react';
import type { ActivityEvent } from '@/types/dashboard.types';
import clsx from 'clsx';

interface ActivityFeedProps {
  events: ActivityEvent[];
  isConnected: boolean;
  error: string | null;
}

const TYPE_CONFIG = {
  analyzing: {
    icon: Search,
    color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  },
  scoring: {
    icon: Brain,
    color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
  generating: {
    icon: Sparkles,
    color: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-green-400 border-green-500/30 bg-green-500/10',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-400 border-red-500/30 bg-red-500/10',
  },
};

export default function ActivityFeed({ events, isConnected, error }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="flex flex-col h-full max-h-[600px] bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary-400" />
          <h2 className="font-semibold text-white">AI Reasoning Feed</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-400">
            {isConnected ? 'Live feed connected' : 'Connecting...'}
          </span>
          <span
            className={clsx(
              'w-2 h-2 rounded-full relative',
              isConnected ? 'bg-green-500' : 'bg-amber-500'
            )}
          >
            {isConnected && (
              <span className="absolute inset-0 rounded-full bg-green-500/40 blur-sm scale-150 animate-ping" />
            )}
          </span>
        </div>
      </div>

      {/* Connection error banner */}
      {error && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
          <span>{error}</span>
        </div>
      )}

      {/* Events List */}
      <div
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10"
        aria-live="polite"
        role="log"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 text-surface-500">
            <Brain className="w-8 h-8 mb-2 opacity-30 animate-pulse text-primary-400" />
            <p className="text-sm">No activity recorded yet</p>
            <p className="text-xs mt-1 text-surface-600">Events will appear as the AI performs actions</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event) => {
              const config = TYPE_CONFIG[event.type] || TYPE_CONFIG.analyzing;
              const Icon = config.icon;
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="flex gap-3 text-sm"
                >
                  <div className={clsx('w-8 h-8 rounded-lg border shrink-0 flex items-center justify-center', config.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.03] rounded-xl px-4 py-3 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-medium text-white leading-relaxed">{event.message}</p>
                      <span className="text-[10px] text-surface-500 whitespace-nowrap pt-0.5">
                        {new Date(event.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    {event.details && (
                      <p className="text-xs text-surface-400 mt-1 font-mono break-all">{event.details}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
