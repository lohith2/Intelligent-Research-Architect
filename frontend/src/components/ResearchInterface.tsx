import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
    Send, FileUp, User, Loader2, Menu, FileText, 
    Search, CheckCircle2, AlertTriangle, Brain, 
    ExternalLink, Download, BookOpen, Compass,
    Microscope, Scale, TrendingUp, X, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';
import { Sidebar } from './Sidebar';

// ─── Types ────────────────────────────────────────────────────────

interface ResearchStep {
    name: string;
    status: 'running' | 'done' | 'error';
    label: string;
}

interface Source {
    title: string;
    url: string;
    snippet: string;
    provider?: string;
    authors?: string;
    year?: string;
    venue?: string;
    doi?: string;
    citation_count?: number;
    pdf_url?: string;
    source_type?: string;
    paper_role?: string;
    provenance?: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    steps?: ResearchStep[];
    sources?: Source[];
    attachments?: AttachedFile[];
}

interface AttachedFile {
    name: string;
    type: string;
}

interface ChatSession {
    id: string;
    title: string;
    date: Date;
    messages: Message[];
    files: AttachedFile[];
}

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

type ResearchFilter = 'recent' | 'survey' | 'benchmark' | 'seminal';

// ─── Suggestion Chips ─────────────────────────────────────────────

const SUGGESTIONS = [
    { icon: Microscope, text: "Find recent papers on retrieval-augmented generation evaluation methods", category: "Literature" },
    { icon: Scale, text: "Compare key papers on transformer interpretability and mechanistic understanding", category: "Compare" },
    { icon: TrendingUp, text: "What do recent papers say about multimodal reasoning benchmarks?", category: "Analyze" },
    { icon: BookOpen, text: "Summarize the main findings and limitations in recent diffusion model papers", category: "Summarize" },
];

const RESEARCH_FILTER_OPTIONS: Array<{
    key: ResearchFilter;
    label: string;
    description: string;
}> = [
    { key: 'recent', label: 'Recent', description: 'Prefer newer papers and frontier work' },
    { key: 'survey', label: 'Survey', description: 'Force review and survey papers higher' },
    { key: 'benchmark', label: 'Benchmark', description: 'Prioritize evaluations, datasets, and leaderboards' },
    { key: 'seminal', label: 'Seminal', description: 'Pull in highly cited anchor papers' },
];

// ─── Step Icon Helper ─────────────────────────────────────────────

const StepIcon = ({ status }: { status: string }) => {
    if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-ra-accent" />;
    if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-ra-success" />;
    return <AlertTriangle className="w-4 h-4 text-ra-warning" />;
};

// ─── Source Card ──────────────────────────────────────────────────

const SourceCard = ({ source, index }: { source: Source; index: number }) => {
    const domain = (() => {
        try { return new URL(source.url).hostname.replace('www.', ''); } 
        catch { return source.url; }
    })();

    return (
        <motion.a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="source-card block p-3 rounded-lg border border-ra-border bg-ra-surface/80 cursor-pointer group"
        >
            <div className="flex items-start gap-2">
                <span className="text-[10px] font-mono text-ra-muted bg-ra-border/50 rounded px-1.5 py-0.5 shrink-0 mt-0.5">
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ra-text truncate group-hover:text-ra-accentLight transition-colors">
                        {source.title}
                    </p>
                    {(source.provider || source.year || source.venue) && (
                        <p className="text-[11px] text-ra-accent/80 mt-1 truncate">
                            {[source.provider, source.year, source.venue].filter(Boolean).join(' • ')}
                        </p>
                    )}
                    {source.authors && (
                        <p className="text-[11px] text-ra-muted/80 mt-1 line-clamp-1">
                            {source.authors}
                        </p>
                    )}
                    {(source.citation_count || source.source_type) && (
                        <p className="text-[11px] text-ra-muted/70 mt-1 line-clamp-1">
                            {[
                                source.source_type === 'preprint' ? 'Preprint' : source.source_type === 'paper' ? 'Paper' : '',
                                typeof source.citation_count === 'number' ? `${source.citation_count} citations` : ''
                            ].filter(Boolean).join(' • ')}
                        </p>
                    )}
                    {(source.paper_role || source.provenance) && (
                        <p className="text-[11px] text-ra-muted/60 mt-1 line-clamp-1">
                            {[
                                source.paper_role ? `Role: ${source.paper_role}` : '',
                                source.provenance ? `Source: ${source.provenance}` : ''
                            ].filter(Boolean).join(' • ')}
                        </p>
                    )}
                    <p className="text-xs text-ra-muted mt-0.5 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {domain}
                    </p>
                    <p className="text-xs text-ra-muted/70 mt-1 line-clamp-2 leading-relaxed">
                        {source.snippet}
                    </p>
                </div>
            </div>
        </motion.a>
    );
};

// ─── Toast Component ──────────────────────────────────────────────

const ToastNotification = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) => {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 3500);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    const colors = {
        success: 'border-ra-success/30 bg-ra-success/10 text-ra-success',
        error: 'border-ra-error/30 bg-ra-error/10 text-ra-error',
        info: 'border-ra-info/30 bg-ra-info/10 text-ra-info',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm ${colors[toast.type]}`}
        >
            {toast.type === 'success' && <Check className="w-4 h-4" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4" />}
            <span>{toast.message}</span>
            <button onClick={() => onDismiss(toast.id)} className="ml-2 opacity-60 hover:opacity-100">
                <X className="w-3 h-3" />
            </button>
        </motion.div>
    );
};

// ─── Main Component ───────────────────────────────────────────────

export const ResearchInterface = () => {
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [currentChatId, setCurrentChatId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [isResearching, setIsResearching] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<AttachedFile[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [researchFilters, setResearchFilters] = useState<ResearchFilter[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const currentChat = chats.find(c => c.id === currentChatId);
    const messages = currentChat?.messages || [];
    const allSources = messages.flatMap(message => message.sources || []);

    const toggleResearchFilter = (filter: ResearchFilter) => {
        setResearchFilters(prev =>
            prev.includes(filter) ? prev.filter(item => item !== filter) : [...prev, filter]
        );
    };

    // ─── Toast Helper ──────────────────────────────────

    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const sourceToBibtex = useCallback((source: Source, index: number) => {
        const safe = (value?: string) => (value || '').replace(/[{}]/g, '');
        const firstAuthor = safe(source.authors)
            .split(/,| et al\./)[0]
            .trim()
            .split(/\s+/)
            .slice(-1)[0]
            ?.toLowerCase() || 'source';
        const year = safe(source.year) || 'nodate';
        const titleToken = safe(source.title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .split(' ')
            .slice(0, 3)
            .join('');
        const key = `${firstAuthor}${year}${titleToken || index + 1}`;
        return `@article{${key},
  title = {${safe(source.title)}},
  author = {${safe(source.authors) || 'Unknown'}},
  journal = {${safe(source.venue) || safe(source.provider) || 'Unknown'}},
  year = {${year}},
  url = {${safe(source.url)}}
}`;
    }, []);

    const exportReadingList = () => {
        if (allSources.length === 0 || !currentChat) return;
        const uniqueSources = allSources.filter((source, index, arr) =>
            arr.findIndex(other => other.url === source.url && other.title === source.title) === index
        );
        let md = `# Reading List: ${currentChat.title}\n\n`;
        md += `_Generated on ${new Date().toLocaleDateString()}_\n\n`;
        uniqueSources.forEach((source, index) => {
            md += `## ${index + 1}. ${source.title}\n\n`;
            md += `- Authors: ${source.authors || 'Unknown'}\n`;
            md += `- Year: ${source.year || 'Unknown'}\n`;
            md += `- Venue: ${source.venue || source.provider || 'Unknown'}\n`;
            if (typeof source.citation_count === 'number') {
                md += `- Citations: ${source.citation_count}\n`;
            }
            if (source.doi) {
                md += `- DOI: ${source.doi}\n`;
            }
            md += `- URL: ${source.url}\n`;
            if (source.pdf_url) {
                md += `- PDF: ${source.pdf_url}\n`;
            }
            md += `- Notes: \n`;
            md += `- Why it matters: \n\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reading-list-${currentChat.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('Reading list exported', 'success');
    };

    const exportReadingPath = () => {
        if (allSources.length === 0 || !currentChat) return;
        const uniqueSources = allSources.filter((source, index, arr) =>
            arr.findIndex(other => other.url === source.url && other.title === source.title) === index
        );
        const sortedByCitations = [...uniqueSources].sort(
            (a, b) => (b.citation_count || 0) - (a.citation_count || 0)
        );
        const sortedByYear = [...uniqueSources].sort(
            (a, b) => Number(b.year || 0) - Number(a.year || 0)
        );
        const benchmarkLike = uniqueSources.filter(source =>
            `${source.title} ${source.snippet}`.toLowerCase().match(/benchmark|survey|review|dataset|evaluation/)
        );

        let md = `# Reading Path: ${currentChat.title}\n\n`;
        md += `_Generated on ${new Date().toLocaleDateString()}_\n\n`;

        if (sortedByCitations[0]) {
            md += `## Foundational Anchor\n\n`;
            md += `- ${sortedByCitations[0].title} (${sortedByCitations[0].year || 'n.d.'})\n`;
            md += `  ${sortedByCitations[0].url}\n\n`;
        }

        if (benchmarkLike.length > 0) {
            md += `## Benchmarks and Surveys\n\n`;
            benchmarkLike.slice(0, 3).forEach(source => {
                md += `- ${source.title} (${source.year || 'n.d.'})\n`;
                md += `  ${source.url}\n`;
            });
            md += `\n`;
        }

        if (sortedByYear.length > 0) {
            md += `## Current Frontier\n\n`;
            sortedByYear.slice(0, 3).forEach(source => {
                md += `- ${source.title} (${source.year || 'n.d.'})\n`;
                md += `  ${source.url}\n`;
            });
            md += `\n`;
        }

        md += `## Notes\n\n`;
        md += `- Key research gap:\n`;
        md += `- Most important benchmark:\n`;
        md += `- Most important method paper:\n`;
        md += `- Next paper to read:\n`;

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reading-path-${currentChat.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('Reading path exported', 'success');
    };

    // ─── Persistence ───────────────────────────────────

    useEffect(() => {
        const saved = localStorage.getItem('research_chats');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const restored = parsed.map((c: any) => ({
                    ...c,
                    date: new Date(c.date),
                    files: c.files || []
                }));
                setChats(restored);
                if (restored.length > 0) setCurrentChatId(restored[0].id);
                else createNewChat();
            } catch { createNewChat(); }
        } else {
            createNewChat();
        }
    }, []);

    useEffect(() => {
        if (chats.length > 0) {
            localStorage.setItem('research_chats', JSON.stringify(chats));
        }
    }, [chats]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [query]);

    // ─── Chat CRUD ─────────────────────────────────────

    const handleChatSwitch = (id: string) => {
        setCurrentChatId(id);
        setPendingAttachments([]);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    const createNewChat = () => {
        const newChat: ChatSession = {
            id: crypto.randomUUID(),
            title: 'New Research',
            date: new Date(),
            messages: [],
            files: []
        };
        setChats(prev => [newChat, ...prev]);
        handleChatSwitch(newChat.id);
    };

    const deleteChat = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await fetch(`${API_BASE_URL}/chat/${id}`, { method: 'DELETE' });
        } catch (err) {
            console.error("Failed to cleanup backend chat", err);
        }
        setChats(prev => prev.filter(c => c.id !== id));
        if (currentChatId === id) {
            const remaining = chats.filter(c => c.id !== id);
            if (remaining.length > 0) handleChatSwitch(remaining[0].id);
            else createNewChat();
        }
    };

    const updateCurrentChatMessages = (updater: (prev: Message[]) => Message[]) => {
        if (!currentChatId) return;
        setChats(prev => prev.map(chat => {
            if (chat.id === currentChatId) {
                return { ...chat, messages: updater(chat.messages) };
            }
            return chat;
        }));
    };

    const updateChatTitle = (id: string, title: string) => {
        setChats(prev => prev.map(chat =>
            chat.id === id ? { ...chat, title } : chat
        ));
    };

    // ─── File Upload ───────────────────────────────────

    const handleFileUpload = async (file: File) => {
        if (!currentChatId) return;
        setIsUploading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('chat_id', currentChatId);

        try {
            const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            setPendingAttachments(prev => [...prev, { name: file.name, type: file.type }]);
            addToast(`${file.name} uploaded successfully`, 'success');
        } catch (err) {
            console.error(err);
            addToast(`Failed to upload ${file.name}`, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    // ─── Export ────────────────────────────────────────

    const exportChat = () => {
        if (!currentChat || messages.length === 0) return;
        
        let md = `# Research Session: ${currentChat.title}\n`;
        md += `_Exported on ${new Date().toLocaleDateString()}_\n\n---\n\n`;
        
        for (const msg of messages) {
            if (msg.role === 'user') {
                md += `## 🔍 Query\n\n${msg.content}\n\n`;
                if (msg.attachments?.length) {
                    md += `📎 Files: ${msg.attachments.map(a => a.name).join(', ')}\n\n`;
                }
            } else {
                md += `## 📋 Research Findings\n\n${msg.content}\n\n`;
                if (msg.sources?.length) {
                    md += `### Sources\n\n`;
                    msg.sources.forEach((s, i) => {
                        md += `${i + 1}. [${s.title}](${s.url})\n`;
                    });
                    md += '\n';
                }
            }
            md += '---\n\n';
        }
        
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research-${currentChat.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('Research exported as Markdown', 'success');
    };

    const exportBibtex = () => {
        if (allSources.length === 0 || !currentChat) return;
        const uniqueSources = allSources.filter((source, index, arr) =>
            arr.findIndex(other => other.url === source.url && other.title === source.title) === index
        );
        const bibtex = uniqueSources.map(sourceToBibtex).join('\n\n');
        const blob = new Blob([bibtex], { type: 'application/x-bibtex' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `research-${currentChat.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.bib`;
        a.click();
        URL.revokeObjectURL(url);
        addToast('Sources exported as BibTeX', 'success');
    };

    // ─── Research (Main handler) ───────────────────────

    const handleResearch = async () => {
        if (!query.trim() || !currentChatId) return;

        setIsResearching(true);
        const userMsg: Message = {
            role: 'user',
            content: query,
            attachments: [...pendingAttachments]
        };

        updateCurrentChatMessages(prev => [...prev, userMsg]);
        setPendingAttachments([]);

        if (messages.length === 0) {
            updateChatTitle(currentChatId, query.slice(0, 40) + (query.length > 40 ? '...' : ''));
        }

        const currentQuery = query;
        setQuery('');

        // Create initial assistant message
        updateCurrentChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: '', 
            steps: [], 
            sources: [] 
        }]);

        const history = messages.map(m => ({ role: m.role, content: m.content }));

        try {
            const response = await fetch(`${API_BASE_URL}/research`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: currentQuery,
                    chat_id: currentChatId,
                    messages: history,
                    filters: researchFilters,
                }),
            });

            if (!response.body) throw new Error('No response body');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let displayedContent = '';
            let currentSteps: ResearchStep[] = [];
            let currentSources: Source[] = [];
            const tokenQueue: string[] = [];
            let isDone = false;

            // Smooth typing interval
            const typingInterval = setInterval(() => {
                if (tokenQueue.length > 0) {
                    const speed = tokenQueue.length > 50 ? 8 : (tokenQueue.length > 20 ? 4 : 1);
                    let chunk = '';
                    for (let i = 0; i < speed && tokenQueue.length > 0; i++) {
                        chunk += tokenQueue.shift();
                    }
                    displayedContent += chunk;

                    updateCurrentChatMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        lastMsg.content = displayedContent;
                        lastMsg.steps = [...currentSteps];
                        lastMsg.sources = [...currentSources];
                        return newMsgs;
                    });
                } else if (isDone) {
                    clearInterval(typingInterval);
                }
            }, 12);

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value);
                    const lines = text.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.token) {
                                    for (const char of data.token) {
                                        tokenQueue.push(char);
                                    }
                                }
                                else if (data.step) {
                                    const stepData = data.step as ResearchStep;
                                    const existingIdx = currentSteps.findIndex(s => s.name === stepData.name);
                                    if (existingIdx >= 0) {
                                        currentSteps[existingIdx] = stepData;
                                    } else {
                                        currentSteps.push(stepData);
                                    }
                                    // Force immediate step update
                                    updateCurrentChatMessages(prev => {
                                        const newMsgs = [...prev];
                                        const lastMsg = newMsgs[newMsgs.length - 1];
                                        lastMsg.steps = [...currentSteps];
                                        return newMsgs;
                                    });
                                }
                                else if (data.sources) {
                                    currentSources = data.sources;
                                    updateCurrentChatMessages(prev => {
                                        const newMsgs = [...prev];
                                        const lastMsg = newMsgs[newMsgs.length - 1];
                                        lastMsg.sources = [...currentSources];
                                        return newMsgs;
                                    });
                                }
                                else if (data.done) {
                                    // final
                                }
                            } catch (e) { /* ignore parse errors for partial chunks */ }
                        }
                    }
                }
            } finally {
                isDone = true;
            }
        } catch (error) {
            console.error('Research failed:', error);
            updateCurrentChatMessages(prev => [...prev, { 
                role: 'assistant', 
                content: 'Research failed. Please check that the backend is running and try again.' 
            }]);
            addToast('Research request failed', 'error');
        } finally {
            setIsResearching(false);
        }
    };

    // ─── Render ────────────────────────────────────────

    return (
        <div className="flex h-screen w-full bg-ra-bg text-ra-text font-sans overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                chats={chats}
                currentChatId={currentChatId}
                onNewChat={createNewChat}
                onSelectChat={handleChatSwitch}
                onDeleteChat={deleteChat}
            />

            {/* Main Area */}
            <div className="flex-1 flex flex-col relative w-full">
                {/* Header */}
                <header className="sticky top-0 w-full z-10 px-4 py-3 flex items-center justify-between bg-ra-bg/80 backdrop-blur-xl border-b border-ra-border/50">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="p-2 text-ra-muted hover:text-ra-text hover:bg-ra-surface rounded-lg transition-all md:hidden"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ra-accent to-ra-accentLight flex items-center justify-center">
                                <Compass className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-ra-text text-[15px] tracking-tight leading-tight">Research Architect</span>
                                <span className="text-[10px] text-ra-muted leading-tight">AI Research Assistant</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {messages.length > 0 && (
                            <>
                                {allSources.length > 0 && (
                                    <>
                                        <button 
                                            onClick={exportReadingPath}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                        >
                                            <Compass className="w-3.5 h-3.5" />
                                            Reading Path
                                        </button>
                                        <button 
                                            onClick={exportReadingList}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            Reading List
                                        </button>
                                        <button 
                                            onClick={exportBibtex}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            BibTeX
                                        </button>
                                    </>
                                )}
                                <button 
                                    onClick={exportChat}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Export
                                </button>
                            </>
                        )}
                    </div>
                </header>

                {/* Messages Area */}
                <main className="flex-1 overflow-y-auto pb-44 px-4 scroll-smooth flex flex-col">
                    <div className={`w-full max-w-3xl mx-auto space-y-6 pt-4 flex-grow flex flex-col ${messages.length === 0 ? 'justify-center' : ''}`}>
                        
                        {/* Empty State */}
                        {messages.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className="flex flex-col items-center justify-center text-center space-y-8 flex-grow"
                            >
                                <div className="space-y-4">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ra-accent/20 to-ra-accentLight/10 border border-ra-accent/20 flex items-center justify-center mx-auto">
                                        <Compass className="w-8 h-8 text-ra-accent" />
                                    </div>
                                    <h1 className="text-2xl font-semibold text-ra-text">
                                        What would you like to research?
                                    </h1>
                                    <p className="text-sm text-ra-muted max-w-md">
                                        I search scholarly sources, analyze papers and PDFs, and synthesize literature with citations, gaps, and reading paths.
                                    </p>
                                </div>

                                {/* Suggestion Chips */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                                    {SUGGESTIONS.map((suggestion, idx) => (
                                        <motion.button
                                            key={idx}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 + idx * 0.08 }}
                                            onClick={() => {
                                                setQuery(suggestion.text);
                                                textareaRef.current?.focus();
                                            }}
                                            className="suggestion-chip text-left p-3.5 rounded-xl group"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 rounded-lg bg-ra-accent/10 text-ra-accent group-hover:bg-ra-accent/20 transition-colors shrink-0">
                                                    <suggestion.icon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-medium text-ra-accent uppercase tracking-wider mb-1">{suggestion.category}</p>
                                                    <p className="text-xs text-ra-muted group-hover:text-ra-text transition-colors leading-relaxed">{suggestion.text}</p>
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Messages */}
                        <AnimatePresence mode="popLayout">
                            {messages.map((msg, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {/* Assistant avatar */}
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ra-accent to-ra-accentLight flex items-center justify-center shrink-0 mt-1">
                                            <Brain className="w-4 h-4 text-white" />
                                        </div>
                                    )}

                                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        {/* Message bubble */}
                                        <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-ra-accent/15 text-ra-text border border-ra-accent/20 rounded-br-sm'
                                                : 'text-ra-text pl-0'
                                        }`}>
                                            {/* Research Steps Timeline */}
                                            {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="mb-4 py-3 px-3 rounded-lg bg-ra-surface/60 border border-ra-border/50"
                                                >
                                                    <p className="text-[10px] font-medium text-ra-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                                        <Search className="w-3 h-3" />
                                                        Research Pipeline
                                                    </p>
                                                    <div className="space-y-2">
                                                        {msg.steps.map((step, sIdx) => (
                                                            <div key={sIdx} className={`flex items-center gap-2.5 ${sIdx < msg.steps!.length - 1 ? 'step-connector' : ''}`}>
                                                                <StepIcon status={step.status} />
                                                                <span className={`text-xs ${
                                                                    step.status === 'done' ? 'text-ra-muted' : 'text-ra-text'
                                                                }`}>
                                                                    {step.label}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Message content */}
                                            {msg.content ? (
                                                <div className={`research-markdown w-full ${
                                                    (isResearching && idx === messages.length - 1 && msg.role === 'assistant') 
                                                        ? 'animate-pulse-cursor' : ''
                                                }`}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            ) : (
                                                msg.role === 'assistant' && (!msg.steps || msg.steps.length === 0) && (
                                                    <div className="flex items-center gap-2 text-ra-muted py-1">
                                                        <span className="w-2 h-2 bg-ra-accent animate-pulse rounded-full" />
                                                        <span className="text-xs">Preparing research...</span>
                                                    </div>
                                                )
                                            )}

                                            {/* Attachments */}
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {msg.attachments.map((file, i) => (
                                                        <div key={i} className="px-2.5 py-1.5 bg-ra-surface rounded-lg text-xs flex items-center gap-2 text-ra-text border border-ra-border">
                                                            <div className="p-1 bg-ra-accent/15 rounded">
                                                                <FileText className="w-3 h-3 text-ra-accent" />
                                                            </div>
                                                            <span className="truncate max-w-[200px]">{file.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Source Cards */}
                                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-3 w-full"
                                            >
                                                <p className="text-[10px] font-medium text-ra-muted uppercase tracking-wider mb-2 flex items-center gap-1.5 pl-1">
                                                    <BookOpen className="w-3 h-3" />
                                                    Sources ({msg.sources.length})
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {msg.sources.map((source, sIdx) => (
                                                        <SourceCard key={sIdx} source={source} index={sIdx} />
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* User avatar */}
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-lg bg-ra-surface border border-ra-border flex items-center justify-center shrink-0 mt-1">
                                            <User className="w-4 h-4 text-ra-muted" />
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>
                </main>

                {/* Input Area */}
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-ra-bg via-ra-bg to-transparent pt-8 pb-6 px-4 z-40">
                    <div className="w-full max-w-3xl mx-auto relative">
                        {/* Pending Attachments */}
                        <AnimatePresence>
                            {pendingAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2 px-1">
                                    {pendingAttachments.map((file, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            className="flex items-center gap-2 bg-ra-surface text-ra-text text-xs px-3 py-2 rounded-lg border border-ra-border"
                                        >
                                            <FileText className="w-3 h-3 text-ra-accent" />
                                            <span className="max-w-[150px] truncate">{file.name}</span>
                                            <button
                                                onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                                className="ml-1 text-ra-muted hover:text-ra-error transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Input Box */}
                        <div className="bg-ra-input border border-ra-border rounded-xl p-2 flex items-end gap-2 shadow-lg shadow-black/20 focus-within:border-ra-accent/40 transition-all">
                            <label className={`p-2 rounded-lg hover:bg-ra-accent/10 text-ra-muted hover:text-ra-accent cursor-pointer transition-all mb-0.5 ${isUploading ? 'animate-pulse pointer-events-none' : ''}`}>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.txt,.md,.png,.jpg,.jpeg"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            await handleFileUpload(file);
                                            e.target.value = '';
                                        }
                                    }}
                                    disabled={isUploading}
                                />
                                {isUploading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <FileUp className="w-5 h-5" />
                                )}
                            </label>

                            <textarea
                                ref={textareaRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleResearch();
                                    }
                                }}
                                placeholder="Ask for papers, literature reviews, benchmarks, or document analysis..."
                                disabled={isResearching}
                                className="flex-1 bg-transparent border-none text-ra-text placeholder-ra-muted focus:ring-0 focus:outline-none text-[14px] py-2.5 px-2 max-h-48 resize-none overflow-y-auto"
                                rows={1}
                            />

                            <button
                                onClick={handleResearch}
                                disabled={isResearching || !query.trim()}
                                className="p-2.5 rounded-lg bg-ra-accent hover:bg-ra-accentLight text-white disabled:opacity-30 disabled:bg-ra-surface transition-all mb-0.5"
                            >
                                {isResearching ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-3 px-1">
                            {RESEARCH_FILTER_OPTIONS.map((filter) => {
                                const isActive = researchFilters.includes(filter.key);
                                return (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        onClick={() => toggleResearchFilter(filter.key)}
                                        className={`px-3 py-1.5 rounded-full border text-xs transition-all ${
                                            isActive
                                                ? 'bg-ra-accent/15 text-ra-text border-ra-accent/40'
                                                : 'bg-ra-surface/70 text-ra-muted border-ra-border hover:text-ra-text hover:border-ra-accent/25'
                                        }`}
                                        title={filter.description}
                                    >
                                        {filter.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="text-center mt-2">
                                <span className="text-[10px] text-ra-muted/50">
                                Research Architect searches scholarly sources and your documents to support literature review work
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast Container */}
            <div className="fixed bottom-24 right-4 z-50 flex flex-col gap-2">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <ToastNotification key={toast.id} toast={toast} onDismiss={dismissToast} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};
