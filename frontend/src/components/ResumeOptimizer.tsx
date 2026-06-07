import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Lightbulb,
  Target,
  Loader2,
  X,
} from 'lucide-react';
import '../styles/ResumeOptimizer.css';

// ---------------------------------------------------------------------------
// Types (mirrors backend ATSAnalysisResult)
// ---------------------------------------------------------------------------

interface ScoreBreakdown {
  keywordMatch: number;
  experienceAlignment: number;
  skillRelevance: number;
  formatting: number;
}

interface MissingKeyword {
  keyword: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  suggestion: string;
}

interface BulletRewrite {
  original: string;
  rewritten: string;
  improvement: string;
}

interface RedFlag {
  type: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  suggestion: string;
}

interface ATSAnalysisResult {
  overallScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
  missingKeywords: MissingKeyword[];
  bulletRewrites: BulletRewrite[];
  redFlags: RedFlag[];
}

interface StoredAnalysis {
  id: string;
  result: ATSAnalysisResult;
  resumeFileName: string;
  overallScore: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Score Gauge Component
// ---------------------------------------------------------------------------

function ScoreGauge({ score, animate }: { score: number; animate: boolean }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const colorClass =
    score <= 40 ? 'score-color--red' : score <= 70 ? 'score-color--amber' : 'score-color--green';

  const gradientId = 'scoreGradient';
  const gradientColors =
    score <= 40
      ? { start: '#dc2626', end: '#ef4444' }
      : score <= 70
        ? { start: '#d97706', end: '#f59e0b' }
        : { start: '#16a34a', end: '#22c55e' };

  return (
    <div className={`score-gauge ${colorClass}`}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradientColors.start} />
            <stop offset="100%" stopColor={gradientColors.end} />
          </linearGradient>
        </defs>
        <circle className="score-gauge__track" cx="100" cy="100" r={radius} />
        <motion.circle
          className="score-gauge__fill"
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: animate ? circumference : offset }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </svg>
      <div className="score-gauge__label">
        <motion.span
          className="text-4xl font-bold text-white"
          initial={{ opacity: animate ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-sm text-gray-400 mt-1">ATS Score</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Score Bar
// ---------------------------------------------------------------------------

function SubScoreBar({
  label,
  score,
  maxScore,
  delay,
}: {
  label: string;
  score: number;
  maxScore: number;
  delay: number;
}) {
  const percentage = (score / maxScore) * 100;
  const color =
    percentage <= 40 ? '#ef4444' : percentage <= 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400 font-mono">
          {score}/{maxScore}
        </span>
      </div>
      <div className="score-bar">
        <motion.div
          className="score-bar__fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.2, delay, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ResumeOptimizer() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [jobListingId, setJobListingId] = useState<string | null>(null);
  const [selectedJobTitle, setSelectedJobTitle] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<StoredAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load pre-selected job from dashboard
  useEffect(() => {
    const selectedJobId = sessionStorage.getItem('selected_job_id');
    if (selectedJobId) {
      sessionStorage.removeItem('selected_job_id'); // Clear it immediately
      fetch(`/api/jobs/${selectedJobId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data) {
            setJobDescription(data.data.raw_text || data.data.rawText || '');
            setJobListingId(data.data.id);
            setSelectedJobTitle(`${data.data.title} at ${data.data.company}`);
          }
        })
        .catch((err) => {
          console.error('Failed to load selected job details:', err);
        });
    }
  }, []);

  // -----------------------------------------------------------------------
  // File handling
  // -----------------------------------------------------------------------

  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are accepted.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB.');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const f = e.dataTransfer.files[0];
      if (f) {handleFile(f);}
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragActive(false), []);

  // -----------------------------------------------------------------------
  // Submit analysis
  // -----------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!file || !jobDescription.trim()) {return;}

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('jobDescription', jobDescription);
      if (jobListingId) {
        formData.append('jobListingId', jobListingId);
      }

      const response = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'x-user-id': 'demo-user' },
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setJobDescription('');
    setResult(null);
    setError(null);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-surface-950 text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center justify-center gap-3">
            <Target className="w-8 h-8 text-purple-400" />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Resume ATS Optimizer
            </span>
          </h1>
          <p className="text-gray-400 text-lg">
            Upload your resume and paste a job description to get an AI-powered ATS compatibility score
          </p>
        </motion.div>

        {/* Input Section */}
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-6"
            >
              {/* Upload Zone */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Resume (PDF)
                </label>
                <div
                  id="resume-upload-zone"
                  className={`upload-zone ${isDragActive ? 'upload-zone--active' : ''} ${file ? 'upload-zone--has-file' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {handleFile(f);}
                    }}
                  />

                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-10 h-10 text-green-400" />
                      <p className="text-green-300 font-medium">{file.name}</p>
                      <p className="text-gray-500 text-sm">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="w-10 h-10 text-purple-400 opacity-60" />
                      <div>
                        <p className="text-gray-300">
                          Drop your resume here or{' '}
                          <span className="text-purple-400 underline">browse</span>
                        </p>
                        <p className="text-gray-500 text-sm mt-1">PDF only, max 5 MB</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Job Description Textarea */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="jd-input"
                    className="text-sm font-medium text-gray-300 flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Job Description
                  </label>
                  {selectedJobTitle && (
                    <span className="flex items-center gap-1.5 text-xs bg-purple-500/10 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-full">
                      <span>Optimizing for: <strong>{selectedJobTitle}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setJobListingId(null);
                          setSelectedJobTitle(null);
                          setJobDescription('');
                        }}
                        className="hover:text-white transition-colors"
                        title="Clear preselected job"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
                <textarea
                  id="jd-input"
                  className="w-full h-[calc(100%-2rem)] min-h-[200px] p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition"
                  placeholder="Paste the full job description here..."
                  value={jobDescription}
                  onChange={(e) => {
                    setJobDescription(e.target.value);
                    if (selectedJobTitle) {
                      setJobListingId(null);
                      setSelectedJobTitle(null);
                    }
                  }}
                />
                <p className="text-right text-xs text-gray-500">
                  {jobDescription.length} characters
                  {jobDescription.length > 0 && jobDescription.length < 50 && (
                    <span className="text-amber-500 ml-2">
                      (minimum 50 characters)
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300"
            >
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit / Reset Buttons */}
        {!result && (
          <div className="flex justify-center">
            <button
              id="analyze-button"
              onClick={handleSubmit}
              disabled={!file || jobDescription.length < 50 || isAnalyzing}
              className="px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-800/50 flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 spinner" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Analyze Resume
                </>
              )}
            </button>
          </div>
        )}

        {/* Analyzing state */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-panel p-8 text-center space-y-4 analyzing-pulse"
            >
              <Loader2 className="w-12 h-12 text-purple-400 mx-auto spinner" />
              <p className="text-gray-300 text-lg">
                Analyzing your resume with AI...
              </p>
              <p className="text-gray-500 text-sm">
                This typically takes 10–20 seconds
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              {/* Score + Breakdown */}
              <div className="glass-panel p-8">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  {/* Gauge */}
                  <ScoreGauge score={result.result.overallScore} animate={true} />

                  {/* Breakdown bars */}
                  <div className="flex-1 w-full space-y-4">
                    <h2 className="text-lg font-semibold text-gray-200 mb-4">
                      Score Breakdown
                    </h2>
                    <SubScoreBar
                      label="Keyword Match"
                      score={result.result.scoreBreakdown.keywordMatch}
                      maxScore={25}
                      delay={0.2}
                    />
                    <SubScoreBar
                      label="Experience Alignment"
                      score={result.result.scoreBreakdown.experienceAlignment}
                      maxScore={25}
                      delay={0.4}
                    />
                    <SubScoreBar
                      label="Skill Relevance"
                      score={result.result.scoreBreakdown.skillRelevance}
                      maxScore={25}
                      delay={0.6}
                    />
                    <SubScoreBar
                      label="Formatting"
                      score={result.result.scoreBreakdown.formatting}
                      maxScore={25}
                      delay={0.8}
                    />
                  </div>
                </div>

                {/* Reasoning */}
                <motion.p
                  className="mt-6 text-gray-400 leading-relaxed border-t border-white/[0.06] pt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  {result.result.reasoning}
                </motion.p>
              </div>

              {/* Missing Keywords */}
              {result.result.missingKeywords.length > 0 && (
                <motion.div
                  className="glass-panel p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-amber-400" />
                    Missing Keywords
                    <span className="text-sm text-gray-500 font-normal">
                      ({result.result.missingKeywords.length} found)
                    </span>
                  </h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {result.result.missingKeywords.map((kw, i) => (
                      <span key={i} className={`keyword-chip keyword-chip--${kw.importance}`}>
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2 mt-4">
                    {result.result.missingKeywords.map((kw, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-400"
                      >
                        <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-gray-300">{kw.keyword}</strong>
                          {' — '}
                          {kw.suggestion}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Bullet Rewrites */}
              {result.result.bulletRewrites.length > 0 && (
                <motion.div
                  className="glass-panel p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-green-400" />
                    Suggested Rewrites
                  </h2>
                  <div className="space-y-4">
                    {result.result.bulletRewrites.map((br, i) => (
                      <div key={i} className="bullet-card">
                        <div className="bullet-original">
                          <div className="flex items-center gap-2 text-xs text-red-400/70 mb-1 font-medium uppercase tracking-wider">
                            <XCircle className="w-3.5 h-3.5" />
                            Original
                          </div>
                          <p className="text-gray-300 text-sm">{br.original}</p>
                        </div>
                        <div className="bullet-rewritten">
                          <div className="flex items-center gap-2 text-xs text-green-400/70 mb-1 font-medium uppercase tracking-wider">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Improved
                          </div>
                          <p className="text-gray-200 text-sm">{br.rewritten}</p>
                        </div>
                        <div className="bullet-improvement">
                          <p className="text-gray-500 text-xs italic">
                            💡 {br.improvement}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Red Flags */}
              {result.result.redFlags.length > 0 && (
                <motion.div
                  className="glass-panel p-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Red Flags
                  </h2>
                  <div className="space-y-3">
                    {result.result.redFlags.map((flag, i) => (
                      <div key={i} className={`red-flag-card red-flag-card--${flag.severity}`}>
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                              flag.severity === 'high'
                                ? 'text-red-400'
                                : flag.severity === 'medium'
                                  ? 'text-amber-400'
                                  : 'text-gray-400'
                            }`}
                          />
                          <div className="space-y-1">
                            <p className="text-gray-200 text-sm font-medium">
                              {flag.description}
                            </p>
                            <p className="text-gray-400 text-sm">
                              💡 {flag.suggestion}
                            </p>
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                                flag.severity === 'high'
                                  ? 'bg-red-500/15 text-red-300'
                                  : flag.severity === 'medium'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-gray-500/15 text-gray-400'
                              }`}
                            >
                              {flag.severity} severity
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Start Over */}
              <div className="flex justify-center pt-4">
                <button
                  id="reset-button"
                  onClick={resetForm}
                  className="px-6 py-3 rounded-xl font-medium text-gray-300 border border-white/10 hover:border-purple-500/40 hover:text-white transition-all flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Analyze Another Resume
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
