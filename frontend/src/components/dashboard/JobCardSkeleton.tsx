import clsx from 'clsx';

interface JobCardSkeletonProps {
  count?: number;
}

function SingleSkeleton() {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5',
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-white/10" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
        </div>
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/10" />
      </div>

      {/* Footer row */}
      <div className="mt-4 flex items-center gap-2">
        <div className="h-5 w-20 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        <div className="ml-auto h-3 w-12 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

export default function JobCardSkeleton({ count = 6 }: JobCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SingleSkeleton key={i} />
      ))}
    </>
  );
}
