import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, FileText, Send, Sparkles, Cpu, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const Dashboard = React.lazy(() => import('./components/dashboard/Dashboard'));
const ResumeOptimizer = React.lazy(() => import('./components/ResumeOptimizer'));
const OutreachGenerator = React.lazy(() => import('./components/OutreachGenerator'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div className="flex min-h-screen bg-surface-950 text-white font-sans antialiased overflow-hidden">
          {/* Sidebar Nav */}
          <aside className="w-64 border-r border-white/[0.06] bg-surface-900/50 backdrop-blur-xl shrink-0 flex flex-col hidden md:flex">
            {/* Logo Section */}
            <div className="h-16 flex items-center gap-2.5 px-6 border-b border-white/[0.06]">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 to-accent-500 shadow-md shadow-primary-500/20">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white to-surface-300 bg-clip-text text-transparent">
                  RecruiterOS
                </span>
                <span className="block text-[10px] text-accent-400 font-semibold uppercase tracking-wider -mt-0.5">
                  AI Recruit Suite
                </span>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-4 py-6 space-y-1.5" aria-label="Main Navigation">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus:ring-2 focus:ring-primary-500',
                    isActive
                      ? 'bg-gradient-to-r from-primary-600/20 to-accent-600/10 text-white border border-primary-500/20 shadow-inner'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.03] border border-transparent'
                  )
                }
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                Dashboard
              </NavLink>
              <NavLink
                to="/resume"
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus:ring-2 focus:ring-primary-500',
                    isActive
                      ? 'bg-gradient-to-r from-primary-600/20 to-accent-600/10 text-white border border-primary-500/20 shadow-inner'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.03] border border-transparent'
                  )
                }
              >
                <FileText className="w-4 h-4 shrink-0" />
                Resume Optimizer
              </NavLink>
              <NavLink
                to="/outreach"
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 outline-none focus:ring-2 focus:ring-primary-500',
                    isActive
                      ? 'bg-gradient-to-r from-primary-600/20 to-accent-600/10 text-white border border-primary-500/20 shadow-inner'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.03] border border-transparent'
                  )
                }
              >
                <Send className="w-4 h-4 shrink-0" />
                Outreach Builder
              </NavLink>
            </nav>

            {/* Footer branding */}
            <div className="p-6 border-t border-white/[0.06] bg-white/[0.01] text-xs text-surface-500 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-medium text-surface-400">
                <Sparkles className="w-3.5 h-3.5 text-accent-400" />
                <span>Microsoft Build AI</span>
              </div>
              <span>v0.1.0 (Hackathon Build)</span>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">
            {/* Mobile top-bar */}
            <header className="h-16 flex items-center justify-between px-6 border-b border-white/[0.06] bg-surface-900/40 backdrop-blur-xl md:hidden shrink-0">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-primary-400" />
                <span className="font-bold text-sm text-white tracking-tight">RecruiterOS</span>
              </div>
              <nav className="flex gap-4" aria-label="Mobile Navigation">
                <NavLink to="/" className={({ isActive }) => clsx('text-xs font-semibold uppercase tracking-wider transition-colors', isActive ? 'text-primary-400' : 'text-surface-400 hover:text-white')}>
                  Dash
                </NavLink>
                <NavLink to="/resume" className={({ isActive }) => clsx('text-xs font-semibold uppercase tracking-wider transition-colors', isActive ? 'text-primary-400' : 'text-surface-400 hover:text-white')}>
                  Resume
                </NavLink>
                <NavLink to="/outreach" className={({ isActive }) => clsx('text-xs font-semibold uppercase tracking-wider transition-colors', isActive ? 'text-primary-400' : 'text-surface-400 hover:text-white')}>
                  Outreach
                </NavLink>
              </nav>
            </header>

            {/* Route Content container */}
            <main className="flex-grow p-6 md:p-8 max-w-7xl w-full mx-auto animate-fade-in" id="main-content">
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center" aria-live="polite" role="status">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                    <span className="sr-only">Loading section...</span>
                  </div>
                }
              >
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/resume" element={<ResumeOptimizer />} />
                  <Route path="/outreach" element={<OutreachGenerator />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
}
