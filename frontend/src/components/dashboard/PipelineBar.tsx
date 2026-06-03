import { motion } from 'framer-motion';
import {
  Compass,
  ScanSearch,
  Sparkles,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import type { PipelineCounts, PipelineStage } from '@/types/dashboard.types';

/* ──────────────────────────────────────────────────────────────
   Stage metadata
   ────────────────────────────────────────────────────────────── */
interface StageMeta {
  key: PipelineStage;
  label: string;
  icon: React.ElementType;
  color: string; // tailwind ring/badge color
}

const STAGES: StageMeta[] = [
  { key: 'discover', label: 'Discover', icon: Compass, color: 'purple' },
  { key: 'analyze', label: 'Analyze', icon: ScanSearch, color: 'blue' },
  { key: 'optimize', label: 'Optimize', icon: Sparkles, color: 'cyan' },
  { key: 'outreach', label: 'Outreach', icon: Mail, color: 'pink' },
  { key: 'applied', label: 'Applied', icon: CheckCircle2, color: 'green' },
];

/* ──────────────────────────────────────────────────────────────
   Skeleton
   ────────────────────────────────────────────────────────────── */
function PipelineSkeleton() {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto py-3 px-1"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-10 w-28 animate-pulse rounded-full bg-white/10" />
          {i < 4 && <div className="h-0.5 w-8 animate-pulse bg-white/10" />}
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────── */
interface PipelineBarProps {
  counts?: PipelineCounts;
  isLoading: boolean;
  activeStage?: PipelineStage;
  onStageClick: (stage?: PipelineStage) => void;
}

const ringColors: Record<string, string> = {
  purple: 'ring-purple-500 shadow-purple-500/30',
  blue: 'ring-blue-500 shadow-blue-500/30',
  cyan: 'ring-cyan-500 shadow-cyan-500/30',
  pink: 'ring-pink-500 shadow-pink-500/30',
  green: 'ring-green-500 shadow-green-500/30',
};

const badgeBg: Record<string, string> = {
  purple: 'bg-purple-500/20 text-purple-300',
  blue: 'bg-blue-500/20 text-blue-300',
  cyan: 'bg-cyan-500/20 text-cyan-300',
  pink: 'bg-pink-500/20 text-pink-300',
  green: 'bg-green-500/20 text-green-300',
};

export default function PipelineBar({
  counts,
  isLoading,
  activeStage,
  onStageClick,
}: PipelineBarProps) {
  if (isLoading || !counts) {return <PipelineSkeleton />;}

  return (
    <nav
      aria-label="Pipeline stages"
      className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl px-4 py-3"
    >
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {/* "All" reset button */}
        <button
          type="button"
          onClick={() => onStageClick(undefined)}
          aria-label="Show all stages"
          aria-pressed={activeStage === undefined}
          className={clsx(
            'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
            activeStage === undefined
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]',
          )}
        >
          All
        </button>

        {STAGES.map((stage, idx) => {
          const isActive = activeStage === stage.key;
          const Icon = stage.icon;
          const count = counts[stage.key];

          return (
            <div key={stage.key} className="flex items-center shrink-0">
              {/* connector line */}
              {idx > 0 && (
                <div className="mx-1 h-0.5 w-6 bg-gradient-to-r from-purple-500/40 to-pink-500/40 rounded-full hidden sm:block" />
              )}

              <motion.button
                type="button"
                onClick={() => onStageClick(stage.key)}
                aria-label={`${stage.label}: ${count} jobs`}
                aria-pressed={isActive}
                whileTap={{ scale: 0.97 }}
                className={clsx(
                  'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
                  'transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
                  isActive
                    ? `ring-2 ${ringColors[stage.color]} shadow-lg bg-white/[0.06] text-gray-100`
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="pipelineActive"
                    className="absolute inset-0 rounded-full bg-white/[0.06]"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className="h-4 w-4 relative z-10" aria-hidden="true" />
                <span className="relative z-10">{stage.label}</span>
                <span
                  className={clsx(
                    'relative z-10 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
                    badgeBg[stage.color],
                  )}
                >
                  {count}
                </span>
              </motion.button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
