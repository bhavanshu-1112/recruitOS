import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  MessageSquare,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Loader2,
  FileText,
  Tag,
  XCircle,
  Send,
} from 'lucide-react';
import '../styles/OutreachGenerator.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedDocument {
  subject: string;
  body: string;
  wordCount: number;
  personalizedElements: string[];
}

interface OutreachMetadata {
  targetCompany: string;
  targetRole: string;
  keySkillsHighlighted: string[];
  toneNotes: string;
}

interface StoredDraft {
  id: string;
  coverLetter: GeneratedDocument;
  outreachMessage: GeneratedDocument;
  metadata: OutreachMetadata;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ResumeAnalysisSummary {
  id: string;
  resumeFileName: string;
  overallScore: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), 2000);
    const removeTimer = setTimeout(onDone, 2300);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [onDone]);

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast ${exiting ? 'toast--exiting' : ''}`}>
        <Check className="w-4 h-4" />
        {message}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word Count Badge
// ---------------------------------------------------------------------------

function WordCountBadge({
  count,
  min,
  max,
}: {
  count: number;
  min: number;
  max: number;
}) {
  const status =
    count > max ? 'over' : count < min ? 'warn' : 'ok';

  return (
    <span className={`word-count word-count--${status}`} aria-label={`${count} words`}>
      {count} words
    </span>
  );
}

// ---------------------------------------------------------------------------
// Document Card
// ---------------------------------------------------------------------------

function DocumentCard({
  title,
  icon: Icon,
  subject,
  body,
  wordCount,
  minWords,
  maxWords,
  personalizedElements,
  onSubjectChange,
  onBodyChange,
  onCopy,
  isCopied,
  isRegenerating,
  onRegenerate,
}: {
  title: string;
  icon: typeof Mail;
  subject: string;
  body: string;
  wordCount: number;
  minWords: number;
  maxWords: number;
  personalizedElements: string[];
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onCopy: () => void;
  isCopied: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleBodyInput = useCallback(() => {
    if (bodyRef.current) {
      onBodyChange(bodyRef.current.innerText);
    }
  }, [onBodyChange]);

  return (
    <div className="doc-card">
      {/* Header */}
      <div className="doc-card__header">
        <h3>
          <Icon className="w-4 h-4 text-purple-400" />
          {title}
        </h3>
        <div className="doc-card__actions">
          <WordCountBadge count={wordCount} min={minWords} max={maxWords} />
          <button
            className={`action-btn ${isCopied ? 'action-btn--copied' : ''}`}
            onClick={onCopy}
            aria-label={`Copy ${title.toLowerCase()} to clipboard`}
            title="Copy to clipboard"
            type="button"
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            className="action-btn"
            onClick={onRegenerate}
            disabled={isRegenerating}
            aria-label={`Regenerate ${title.toLowerCase()}`}
            title="Regenerate"
            type="button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'regen-pulse' : ''}`} />
          </button>
        </div>
      </div>

      {/* Subject line */}
      <div className="subject-line">
        <span className="subject-line__label">Subject:</span>
        <input
          className="subject-line__input"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          aria-label={`${title} subject line`}
          placeholder="Enter subject line..."
        />
      </div>

      {/* Editable body */}
      <div
        ref={bodyRef}
        className="editable-area"
        contentEditable
        suppressContentEditableWarning
        onInput={handleBodyInput}
        role="textbox"
        aria-label={`${title} body text, editable`}
        aria-multiline="true"
        tabIndex={0}
        dangerouslySetInnerHTML={{ __html: body.replace(/\n/g, '<br/>') }}
      />

      {/* Personalized elements */}
      {personalizedElements.length > 0 && (
        <div className="metadata-bar">
          {personalizedElements.map((elem, i) => (
            <span key={i} className="metadata-pill">
              <Tag className="w-3 h-3" />
              {elem}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function OutreachGenerator() {
  // Input state
  const [analyses, setAnalyses] = useState<ResumeAnalysisSummary[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [companyNotes, setCompanyNotes] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  // Output state
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy state
  const [copiedCL, setCopiedCL] = useState(false);
  const [copiedOM, setCopiedOM] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edited text (tracked locally to compute word counts)
  const [clBody, setClBody] = useState('');
  const [clSubject, setClSubject] = useState('');
  const [omBody, setOmBody] = useState('');
  const [omSubject, setOmSubject] = useState('');

  // Load analyses on mount
  useEffect(() => {
    fetch('/api/resume/analyses', {
      headers: { 'x-user-id': 'demo-user' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setAnalyses(
            data.data.map((a: Record<string, unknown>) => ({
              id: a.id as string,
              resumeFileName: (a.resumeFileName ?? a.resume_file_name ?? 'resume.pdf') as string,
              overallScore: Number(a.overallScore ?? a.overall_score ?? 0),
              createdAt: a.createdAt as string,
            })),
          );
        }
      })
      .catch(() => {
        // Silently fail — user can still paste an ID
      });
  }, []);

  // Sync draft to editable state
  useEffect(() => {
    if (draft) {
      setClBody(draft.coverLetter.body);
      setClSubject(draft.coverLetter.subject);
      setOmBody(draft.outreachMessage.body);
      setOmSubject(draft.outreachMessage.subject);
    }
  }, [draft]);

  // Word counts
  const clWordCount = clBody.split(/\s+/).filter(Boolean).length;
  const omWordCount = omBody.split(/\s+/).filter(Boolean).length;

  // -----------------------------------------------------------------------
  // Generate
  // -----------------------------------------------------------------------

  const handleGenerate = async () => {
    if (!selectedAnalysisId) {return;}

    setIsGenerating(true);
    setError(null);
    setDraft(null);

    try {
      const response = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'demo-user',
        },
        body: JSON.stringify({
          resumeAnalysisId: selectedAnalysisId,
          recipientName: recipientName || undefined,
          companyNotes: companyNotes || undefined,
          additionalContext: additionalContext || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      setDraft(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Regenerate
  // -----------------------------------------------------------------------

  const handleRegenerate = async () => {
    if (!draft) {return;}

    setIsRegenerating(true);

    try {
      const response = await fetch(`/api/outreach/${draft.id}/regenerate`, {
        method: 'POST',
        headers: { 'x-user-id': 'demo-user' },
      });

      const data = await response.json();

      if (!data.success) {throw new Error(data.error || 'Regeneration failed');}

      setDraft(data.data);
      showToast('Regenerated! Version ' + data.data.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Copy to clipboard
  // -----------------------------------------------------------------------

  const copyToClipboard = async (text: string, type: 'cl' | 'om') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'cl') {
        setCopiedCL(true);
        setTimeout(() => setCopiedCL(false), 2000);
      } else {
        setCopiedOM(true);
        setTimeout(() => setCopiedOM(false), 2000);
      }
      showToast(
        type === 'cl' ? 'Cover letter copied!' : 'Outreach message copied!',
      );
    } catch {
      showToast('Failed to copy — try selecting and copying manually');
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-surface-950 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center justify-center gap-3">
            <Send className="w-8 h-8 text-purple-400" />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI Outreach Generator
            </span>
          </h1>
          <p className="text-gray-400 text-lg">
            Generate personalized cover letters and outreach messages from your ATS analysis
          </p>
        </motion.div>

        {/* Input Form */}
        <AnimatePresence mode="wait">
          {!draft && !isGenerating && (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="input-card"
            >
              {/* Analysis selector */}
              <div className="input-card__field">
                <label htmlFor="analysis-select" className="input-card__label">
                  <FileText className="w-3.5 h-3.5 inline mr-1" />
                  Resume Analysis
                </label>
                {analyses.length > 0 ? (
                  <select
                    id="analysis-select"
                    className="input-card__select"
                    value={selectedAnalysisId}
                    onChange={(e) => setSelectedAnalysisId(e.target.value)}
                    aria-label="Select a resume analysis"
                  >
                    <option value="">Select an analysis...</option>
                    {analyses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.resumeFileName} — Score: {a.overallScore}/100
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="analysis-select"
                    className="input-card__select"
                    placeholder="Enter resume analysis UUID..."
                    value={selectedAnalysisId}
                    onChange={(e) => setSelectedAnalysisId(e.target.value)}
                    aria-label="Resume analysis ID"
                  />
                )}
              </div>

              {/* Optional fields */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="input-card__field">
                  <label htmlFor="recipient-name" className="input-card__label">
                    Recipient Name (optional)
                  </label>
                  <input
                    id="recipient-name"
                    className="input-card__select"
                    placeholder="e.g. Jane Smith"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    aria-label="Recipient name"
                  />
                </div>
                <div className="input-card__field">
                  <label htmlFor="company-notes" className="input-card__label">
                    Company Notes (optional)
                  </label>
                  <input
                    id="company-notes"
                    className="input-card__select"
                    placeholder="e.g. Recently launched AI features"
                    value={companyNotes}
                    onChange={(e) => setCompanyNotes(e.target.value)}
                    aria-label="Company notes"
                  />
                </div>
              </div>

              <div className="input-card__field">
                <label htmlFor="additional-context" className="input-card__label">
                  Additional Context (optional)
                </label>
                <textarea
                  id="additional-context"
                  className="input-card__textarea"
                  placeholder="Any extra details you want the AI to include..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  aria-label="Additional context for generation"
                />
              </div>

              <div className="flex justify-center pt-2">
                <button
                  id="generate-button"
                  onClick={handleGenerate}
                  disabled={!selectedAnalysisId}
                  className="px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-800/50 flex items-center gap-2"
                  aria-label="Generate cover letter and outreach message"
                >
                  <Sparkles className="w-5 h-5" />
                  Generate Outreach
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="input-card text-center space-y-4 analyzing-pulse"
            >
              <Loader2 className="w-12 h-12 text-purple-400 mx-auto spinner" />
              <p className="text-gray-300 text-lg">Crafting personalized outreach...</p>
              <p className="text-gray-500 text-sm">
                Generating cover letter and LinkedIn message
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300"
              role="alert"
            >
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results — Side-by-Side Documents */}
        <AnimatePresence>
          {draft && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              {/* Metadata bar */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <span className="text-gray-500">For:</span>
                <span className="font-medium text-gray-200">
                  {draft.metadata.targetRole} at {draft.metadata.targetCompany}
                </span>
                <span className="text-gray-600">|</span>
                <span>Version {draft.version}</span>
                {draft.metadata.keySkillsHighlighted.length > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span>
                      Skills: {draft.metadata.keySkillsHighlighted.join(', ')}
                    </span>
                  </>
                )}
              </div>

              {/* Side-by-side document cards */}
              <div className="outreach-grid">
                <DocumentCard
                  title="Cover Letter"
                  icon={Mail}
                  subject={clSubject}
                  body={clBody}
                  wordCount={clWordCount}
                  minWords={200}
                  maxWords={260}
                  personalizedElements={draft.coverLetter.personalizedElements}
                  onSubjectChange={setClSubject}
                  onBodyChange={setClBody}
                  onCopy={() => copyToClipboard(`Subject: ${clSubject}\n\n${clBody}`, 'cl')}
                  isCopied={copiedCL}
                  isRegenerating={isRegenerating}
                  onRegenerate={handleRegenerate}
                />

                <DocumentCard
                  title="Outreach Message"
                  icon={MessageSquare}
                  subject={omSubject}
                  body={omBody}
                  wordCount={omWordCount}
                  minWords={60}
                  maxWords={90}
                  personalizedElements={draft.outreachMessage.personalizedElements}
                  onSubjectChange={setOmSubject}
                  onBodyChange={setOmBody}
                  onCopy={() => copyToClipboard(omBody, 'om')}
                  isCopied={copiedOM}
                  isRegenerating={isRegenerating}
                  onRegenerate={handleRegenerate}
                />
              </div>

              {/* Tone notes */}
              {draft.metadata.toneNotes && (
                <motion.div
                  className="text-sm text-gray-500 italic text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  💡 {draft.metadata.toneNotes}
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="flex justify-center gap-4 pt-4">
                <button
                  id="regenerate-all-button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  aria-label="Regenerate both documents"
                >
                  <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'regen-pulse' : ''}`} />
                  {isRegenerating ? 'Regenerating...' : 'Regenerate Both'}
                </button>
                <button
                  id="new-generation-button"
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                  className="px-6 py-3 rounded-xl font-medium text-gray-300 border border-white/10 hover:border-purple-500/40 hover:text-white transition-all flex items-center gap-2"
                  aria-label="Start a new generation"
                >
                  <Sparkles className="w-4 h-4" />
                  New Generation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
