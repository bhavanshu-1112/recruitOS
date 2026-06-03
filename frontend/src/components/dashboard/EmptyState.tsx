import { Search } from 'lucide-react';

interface EmptyStateProps {
  onSearchClick?: () => void;
}

export default function EmptyState({ onSearchClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white/[0.02] backdrop-blur-xl border border-white/[0.04] rounded-2xl">
      <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 mb-4">
        <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-md animate-pulse" />
        <Search className="w-8 h-8 relative z-10" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">No jobs discovered yet</h3>
      <p className="text-surface-400 text-sm max-w-sm mb-6 leading-relaxed">
        Start by searching for roles and skills to scrape job listings and initialize the recruiting pipeline.
      </p>
      {onSearchClick && (
        <button
          onClick={onSearchClick}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-500 hover:to-accent-500 shadow-lg shadow-primary-500/20 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-950"
          aria-label="Discover Jobs Now"
        >
          Discover Jobs Now
        </button>
      )}
    </div>
  );
}
