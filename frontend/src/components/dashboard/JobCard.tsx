import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { DashboardJob } from '@/types/dashboard.types';

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
/** Simple hash to pick a deterministic hue for the initials avatar. */
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return ((h % 360) + 360) % 360;
}

/** Human-friendly relative timestamp. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {return 'just now';}
  if (mins < 60) {return `${mins}m ago`;}
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {return `${hrs}h ago`;}
  return `${Math.floor(hrs / 24)}d ago`;
}

/** ATS score badge colours. */
function scoreColor(score: number) {
  if (score <= 40) {return { ring: 'ring-red-500', text: 'text-red-400', bg: 'bg-red-500/20' };}
  if (score <= 70) {return { ring: 'ring-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/20' };}
  return { ring: 'ring-green-500', text: 'text-green-400', bg: 'bg-green-500/20' };
}

const stageColors: Record<string, string> = {
  discover: 'bg-purple-500/20 text-purple-300',
  analyze: 'bg-blue-500/20 text-blue-300',
  optimize: 'bg-cyan-500/20 text-cyan-300',
  outreach: 'bg-pink-500/20 text-pink-300',
  applied: 'bg-green-500/20 text-green-300',
};

/* ──────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────── */
interface JobCardProps {
  job: DashboardJob;
  onClick?: () => void;
}

export default function JobCard({ job, onClick }: JobCardProps) {
  const [imgError, setImgError] = useState(false);
  const sc = scoreColor(job.atsScore);
  const hue = hashHue(job.company);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.article
      role={onClick ? 'button' : 'article'}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`${job.title} at ${job.company}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      tabIndex={0}
      className={clsx(
        'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500',
      )}
    >
      {/* Header row: logo + title */}
      <div className="flex items-start gap-3">
        {/* Company logo / initials avatar */}
        {imgError ? (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: `hsl(${hue}, 60%, 40%)` }}
          >
            {job.company.charAt(0).toUpperCase()}
          </span>
        ) : (
          <img
            src={`https://logo.clearbit.com/${job.companyDomain}`}
            alt={`${job.company} logo`}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg bg-white/10 object-contain"
            onError={() => setImgError(true)}
          />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-100">
            {job.title}
          </h3>
          <p className="truncate text-xs text-gray-400">
            {job.company} &middot; {job.location}
          </p>
        </div>

        {/* ATS score ring */}
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2',
            sc.ring,
            sc.bg,
          )}
          aria-label={`ATS score ${job.atsScore}`}
        >
          <span className={clsx('text-xs font-bold', sc.text)}>{job.atsScore}</span>
        </div>
      </div>

      {/* Footer row */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 font-medium capitalize',
            stageColors[job.pipelineStage] ?? 'bg-white/10 text-gray-300',
          )}
        >
          {job.pipelineStage}
        </span>
        <span className="text-gray-500">•</span>
        <span className="text-gray-400">
          {job.lastAction}
        </span>
        <span className="ml-auto text-gray-500">
          {relativeTime(job.lastActionAt)}
        </span>
      </div>
    </motion.article>
  );
}
