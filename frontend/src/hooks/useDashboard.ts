import { useQuery } from '@tanstack/react-query';
import type {
  DashboardStats,
  PipelineCounts,
  DashboardJob,
  PipelineStage,
} from '@/types/dashboard.types';

const REFETCH = 30_000; // 30 s

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {throw new Error(`API ${res.status}: ${res.statusText}`);}
  return res.json() as Promise<T>;
}

/** Aggregate dashboard stats (jobs found, analyzed, applied, response rate). */
export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetchJSON<DashboardStats>('/api/dashboard/stats'),
    refetchInterval: REFETCH,
  });
}

/** Per-stage pipeline counts. */
export function usePipeline() {
  return useQuery<PipelineCounts>({
    queryKey: ['dashboard', 'pipeline'],
    queryFn: () => fetchJSON<PipelineCounts>('/api/dashboard/pipeline'),
    refetchInterval: REFETCH,
  });
}

/** Paginated job list, optionally filtered by pipeline stage. */
export function useJobs(stage?: PipelineStage, page = 1) {
  return useQuery<{ data: DashboardJob[]; meta: { page: number; limit: number; total: number } }>({
    queryKey: ['dashboard', 'jobs', stage ?? 'all', page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (stage) {params.set('stage', stage);}
      params.set('page', String(page));
      return fetchJSON<{ data: DashboardJob[]; meta: { page: number; limit: number; total: number } }>(`/api/dashboard/jobs?${params.toString()}`);
    },
    refetchInterval: REFETCH,
  });
}
