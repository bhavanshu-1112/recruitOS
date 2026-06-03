import { useState } from 'react';
import { useStats, usePipeline, useJobs } from '@/hooks/useDashboard';
import { useSSE } from '@/hooks/useSSE';
import StatCards from './StatCards';
import PipelineBar from './PipelineBar';
import JobCard from './JobCard';
import JobCardSkeleton from './JobCardSkeleton';
import EmptyState from './EmptyState';
import ActivityFeed from './ActivityFeed';
import { Search, X, Loader2, Compass, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';
import type { PipelineStage } from '@/types/dashboard.types';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const [selectedStage, setSelectedStage] = useState<PipelineStage | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [discoverForm, setDiscoverForm] = useState({
    role: '',
    location: '',
    skills: '',
    minSalary: '',
    maxSalary: '',
  });
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useStats();
  const { data: pipeline, isLoading: pipelineLoading, refetch: refetchPipeline } = usePipeline();
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useJobs(selectedStage, page);

  // SSE feed hook
  const { events, isConnected, error: sseError } = useSSE('/api/sse/activity');

  const handleStageSelect = (stage: PipelineStage | undefined) => {
    setSelectedStage(stage);
    setPage(1); // reset to page 1 on filter change
  };

  const handleDiscoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discoverForm.role.trim()) {return;}

    setIsDiscovering(true);
    setDiscoverError(null);

    try {
      const payload = {
        role: discoverForm.role.trim(),
        location: discoverForm.location.trim() || undefined,
        skills: discoverForm.skills
          ? discoverForm.skills
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        salaryRange:
          discoverForm.minSalary || discoverForm.maxSalary
            ? {
                min: discoverForm.minSalary ? parseInt(discoverForm.minSalary, 10) : 0,
                max: discoverForm.maxSalary ? parseInt(discoverForm.maxSalary, 10) : 99999999,
              }
            : undefined,
      };

      const res = await fetch('/api/jobs/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Discovery task failed to initialize');
      }

      // Refresh dashboard data queries
      refetchStats();
      refetchPipeline();
      refetchJobs();

      // Clean up & Close Modal
      setIsDiscoverOpen(false);
      setDiscoverForm({ role: '', location: '', skills: '', minSalary: '', maxSalary: '' });
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Failed to launch job discovery');
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">AI Workflow Dashboard</h1>
          <p className="text-surface-400 text-sm mt-1">
            Orchestrate and monitor your automated job application lifecycle in real-time.
          </p>
        </div>
        <button
          onClick={() => setIsDiscoverOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-500 hover:to-accent-500 shadow-lg shadow-primary-500/20 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-surface-950 self-start sm:self-auto"
          aria-label="Launch Job Intelligence Engine"
        >
          <Compass className="w-4 h-4 animate-spin-slow" />
          Discover Jobs
        </button>
      </div>

      {/* Stats Cards Section */}
      <StatCards stats={stats} isLoading={statsLoading} />

      {/* Pipeline Selector Bar */}
      <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] rounded-2xl p-4">
        <PipelineBar
          counts={pipeline}
          activeStage={selectedStage}
          onStageClick={handleStageSelect}
          isLoading={pipelineLoading}
        />
      </div>

      {/* Core Grid: Jobs List & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Jobs List (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-accent-400" />
              {selectedStage ? `${selectedStage.charAt(0).toUpperCase() + selectedStage.slice(1)} Listings` : 'All Discovered Jobs'}
            </h2>
            {selectedStage && (
              <button
                onClick={() => setSelectedStage(undefined)}
                className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobsLoading ? (
              <JobCardSkeleton count={6} />
            ) : !jobs || jobs.length === 0 ? (
              <div className="col-span-full">
                <EmptyState onSearchClick={() => setIsDiscoverOpen(true)} />
              </div>
            ) : (
              jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onClick={() => {
                    // Navigate to appropriate section based on stage
                    if (job.pipelineStage === 'optimize') {
                      window.location.hash = '#/resume';
                    } else if (job.pipelineStage === 'outreach') {
                      window.location.hash = '#/outreach';
                    }
                  }}
                />
              ))
            )}
          </div>

          {/* Simple Pagination */}
          {jobs && jobs.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-white/10 text-surface-300 hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm font-medium text-surface-400">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={jobs.length < 10} // Assumed page size of 10 limit from api
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-white/10 text-surface-300 hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent transition-all"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Activity Feed (1/3 width on desktop) */}
        <div className="lg:sticky lg:top-6">
          <ActivityFeed events={events} isConnected={isConnected} error={sseError} />
        </div>
      </div>

      {/* Discovery Modal */}
      <AnimatePresence>
        {isDiscoverOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDiscovering && setIsDiscoverOpen(false)}
              className="absolute inset-0 bg-surface-950/80 backdrop-blur-md"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.95, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 10, opacity: 0 }}
              className="relative w-full max-w-lg bg-surface-900 border border-white/10 rounded-2xl shadow-2xl p-6 overflow-hidden z-10"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              {/* Background gradient accents */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-primary-500/10 blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 rounded-full bg-accent-500/10 blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/[0.06]">
                <h3 id="modal-title" className="text-xl font-semibold text-white flex items-center gap-2">
                  <Compass className="w-5 h-5 text-primary-400" />
                  Job Intelligence Discovery
                </h3>
                <button
                  onClick={() => setIsDiscoverOpen(false)}
                  disabled={isDiscovering}
                  className="p-1 rounded-lg text-surface-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {discoverError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
                  <X className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{discoverError}</span>
                </div>
              )}

              <form onSubmit={handleDiscoverSubmit} className="space-y-4">
                <div>
                  <label htmlFor="discover-role" className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
                    Target Role / Job Title *
                  </label>
                  <input
                    id="discover-role"
                    type="text"
                    required
                    disabled={isDiscovering}
                    placeholder="e.g. Senior Software Engineer"
                    value={discoverForm.role}
                    onChange={(e) => setDiscoverForm({ ...discoverForm, role: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="discover-location" className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
                    Location
                  </label>
                  <input
                    id="discover-location"
                    type="text"
                    disabled={isDiscovering}
                    placeholder="e.g. Remote, Bangalore"
                    value={discoverForm.location}
                    onChange={(e) => setDiscoverForm({ ...discoverForm, location: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="discover-skills" className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
                    Required Skills (Comma separated)
                  </label>
                  <input
                    id="discover-skills"
                    type="text"
                    disabled={isDiscovering}
                    placeholder="e.g. React, TypeScript, Node.js"
                    value={discoverForm.skills}
                    onChange={(e) => setDiscoverForm({ ...discoverForm, skills: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="discover-min-sal" className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
                      Min Salary (INR / year)
                    </label>
                    <input
                      id="discover-min-sal"
                      type="number"
                      disabled={isDiscovering}
                      placeholder="e.g. 800000"
                      value={discoverForm.minSalary}
                      onChange={(e) => setDiscoverForm({ ...discoverForm, minSalary: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label htmlFor="discover-max-sal" className="block text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">
                      Max Salary (INR / year)
                    </label>
                    <input
                      id="discover-max-sal"
                      type="number"
                      disabled={isDiscovering}
                      placeholder="e.g. 2500000"
                      value={discoverForm.maxSalary}
                      onChange={(e) => setDiscoverForm({ ...discoverForm, maxSalary: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-white placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-white/[0.06] mt-6">
                  <button
                    type="button"
                    disabled={isDiscovering}
                    onClick={() => setIsDiscoverOpen(false)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-white/10 text-surface-300 hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDiscovering}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-500 hover:to-accent-500 shadow-md shadow-primary-500/10 transition-colors disabled:opacity-50"
                  >
                    {isDiscovering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Scraping Listings...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Run Discovery
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
