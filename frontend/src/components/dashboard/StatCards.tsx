import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Search, BarChart3, Send, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import type { DashboardStats } from '@/types/dashboard.types';

/* ──────────────────────────────────────────────────────────────
   Animated counter – respects prefers-reduced-motion
   ────────────────────────────────────────────────────────────── */
function AnimatedNumber({
  value,
  suffix = '',
}: {
  value: number;
  suffix?: string;
}) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => Math.round(v));
  const display = useTransform(rounded, (v) => `${v.toLocaleString()}${suffix}`);

  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReduced) {
      motionVal.set(value);
      return;
    }
    const ctrl = animate(motionVal, value, { duration: 1.2, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [value, motionVal, prefersReduced]);

  return <motion.span>{display}</motion.span>;
}

/* ──────────────────────────────────────────────────────────────
   Single stat card
   ────────────────────────────────────────────────────────────── */
interface CardDef {
  label: string;
  key: keyof DashboardStats;
  icon: React.ElementType;
  suffix?: string;
}

const CARDS: CardDef[] = [
  { label: 'Jobs Found', key: 'jobsFound', icon: Search },
  { label: 'Analyzed', key: 'analyzed', icon: BarChart3 },
  { label: 'Applied', key: 'applied', icon: Send },
  { label: 'Response Rate', key: 'responseRate', icon: TrendingUp, suffix: '%' },
];

/* ──────────────────────────────────────────────────────────────
   Skeleton card
   ────────────────────────────────────────────────────────────── */
function StatCardSkeleton() {
  return (
    <div
      className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/10" />
      </div>
      <div className="mt-4 h-8 w-20 animate-pulse rounded bg-white/10" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   StatCards
   ────────────────────────────────────────────────────────────── */
interface StatCardsProps {
  stats?: DashboardStats;
  isLoading: boolean;
}

export default function StatCards({ stats, isLoading }: StatCardsProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {CARDS.map(({ label, key, icon: Icon, suffix }) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          role="status"
          aria-label={`${label}: ${stats[key]}${suffix ?? ''}`}
          className={clsx(
            'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6',
            'transition-colors hover:border-purple-500/30',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">{label}</span>
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-100 tracking-tight">
            <AnimatedNumber value={stats[key]} suffix={suffix} />
          </p>
        </motion.div>
      ))}
    </div>
  );
}
