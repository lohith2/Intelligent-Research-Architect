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
    isStreaming?: boolean;
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

const isAbortError = (error: unknown) =>
    error instanceof DOMException && error.name === 'AbortError';

const sanitizeChats = (rawChats: any[]): ChatSession[] => rawChats.map((chat) => {
    const normalizedMessages = Array.isArray(chat.messages) ? chat.messages.filter((message: Message) => {
        if (message.role !== 'assistant') return true;

        const hasContent = Boolean(message.content?.trim());
        const hasSteps = Boolean(message.steps?.length);
        const hasSources = Boolean(message.sources?.length);
        return hasContent || hasSteps || hasSources;
    }).map((message: Message) => ({
        ...message,
        isStreaming: false,
    })) : [];

    return {
        ...chat,
        date: new Date(chat.date),
        files: chat.files || [],
        messages: normalizedMessages,
    };
}).filter((chat) => chat.id);

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
    const [deletingChatIds, setDeletingChatIds] = useState<string[]>([]);
    const [activeResearchChatId, setActiveResearchChatId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const activeResearchAbortRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef(true);

    const currentChat = chats.find(c => c.id === currentChatId);
    const messages = currentChat?.messages || [];
    const allSources = messages.flatMap(message => message.sources || []);
    const lastMessage = messages[messages.length - 1];

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

    const abortActiveResearch = useCallback(() => {
        activeResearchAbortRef.current?.abort();
        activeResearchAbortRef.current = null;
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
        isMountedRef.current = true;
        const saved = localStorage.getItem('research_chats');
        const savedCurrentChatId = localStorage.getItem('research_current_chat_id');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const restored = sanitizeChats(parsed);
                setChats(restored);
                if (restored.length > 0) {
                    const restoredCurrentChat = restored.find((chat) => chat.id === savedCurrentChatId);
                    setCurrentChatId(restoredCurrentChat?.id || restored[0].id);
                }
                else createNewChat();
            } catch { createNewChat(); }
        } else {
            createNewChat();
        }
        return () => {
            isMountedRef.current = false;
            abortActiveResearch();
        };
    }, [abortActiveResearch]);

    useEffect(() => {
        if (chats.length > 0) {
            localStorage.setItem('research_chats', JSON.stringify(chats));
        }
    }, [chats]);

    useEffect(() => {
        if (currentChatId) {
            localStorage.setItem('research_current_chat_id', currentChatId);
        }
    }, [currentChatId]);

    useEffect(() => {
        const handlePageHide = () => {
            abortActiveResearch();
        };

        window.addEventListener('pagehide', handlePageHide);
        return () => window.removeEventListener('pagehide', handlePageHide);
    }, [abortActiveResearch]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length, lastMessage?.content, lastMessage?.steps?.length, lastMessage?.sources?.length]);

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
        abortActiveResearch();
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
        if (deletingChatIds.includes(id)) return;

        const previousChats = chats;
        const remaining = previousChats.filter(c => c.id !== id);
        const wasCurrentChat = currentChatId === id;
        let deleteSucceeded = false;

        if (wasCurrentChat) {
            abortActiveResearch();
        }

        setDeletingChatIds(prev => [...prev, id]);
        setChats(remaining);

        if (wasCurrentChat) {
            if (remaining.length > 0) {
                setCurrentChatId(remaining[0].id);
            } else {
                setCurrentChatId(null);
            }
        }

        try {
            await fetch(`${API_BASE_URL}/chat/${id}`, { method: 'DELETE' });
            deleteSucceeded = true;
            addToast('Research session deleted', 'success');
        } catch (err) {
            console.error("Failed to cleanup backend chat", err);
            setChats(previousChats);
            if (wasCurrentChat) {
                setCurrentChatId(id);
            }
            addToast('Delete failed. Please try again.', 'error');
        } finally {
            setDeletingChatIds(prev => prev.filter(chatId => chatId !== id));
            if (isMountedRef.current && deleteSucceeded && wasCurrentChat && remaining.length === 0) {
                createNewChat();
            }
        }
    };

    const updateChatMessages = (chatId: string, updater: (prev: Message[]) => Message[]) => {
        setChats(prev => prev.map(chat => {
            if (chat.id === chatId) {
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

        const researchChatId = currentChatId;
        abortActiveResearch();
        const abortController = new AbortController();
        activeResearchAbortRef.current = abortController;
        setActiveResearchChatId(researchChatId);
        setIsResearching(true);
        const userMsg: Message = {
            role: 'user',
            content: query,
            attachments: [...pendingAttachments]
        };

        updateChatMessages(researchChatId, prev => [...prev, userMsg]);
        setPendingAttachments([]);

        if (messages.length === 0) {
            updateChatTitle(researchChatId, query.slice(0, 40) + (query.length > 40 ? '...' : ''));
        }

        const currentQuery = query;
        setQuery('');

        // Create initial assistant message
        updateChatMessages(researchChatId, prev => [...prev, { 
            role: 'assistant', 
            content: '', 
            steps: [], 
            sources: [],
            isStreaming: true,
        }]);

        const history = messages.map(m => ({ role: m.role, content: m.content }));

        try {
            const response = await fetch(`${API_BASE_URL}/research`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    query: currentQuery,
                    chat_id: researchChatId,
                    messages: history,
                    filters: researchFilters,
                }),
            });

            if (!response.ok) throw new Error(`Research failed with status ${response.status}`);
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
                    const speed = tokenQueue.length > 240 ? 64 : tokenQueue.length > 120 ? 36 : tokenQueue.length > 40 ? 18 : 8;
                    let chunk = '';
                    for (let i = 0; i < speed && tokenQueue.length > 0; i++) {
                        chunk += tokenQueue.shift();
                    }
                    displayedContent += chunk;

                    updateChatMessages(researchChatId, prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        if (!lastMsg) return prev;
                        lastMsg.content = displayedContent;
                        lastMsg.steps = [...currentSteps];
                        lastMsg.sources = [...currentSources];
                        lastMsg.isStreaming = !isDone;
                        return newMsgs;
                    });
                } else if (isDone) {
                    clearInterval(typingInterval);
                }
            }, 8);

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
                                    updateChatMessages(researchChatId, prev => {
                                        const newMsgs = [...prev];
                                        const lastMsg = newMsgs[newMsgs.length - 1];
                                        if (!lastMsg) return prev;
                                        lastMsg.steps = [...currentSteps];
                                        return newMsgs;
                                    });
                                }
                                else if (data.sources) {
                                    currentSources = data.sources;
                                    updateChatMessages(researchChatId, prev => {
                                        const newMsgs = [...prev];
                                        const lastMsg = newMsgs[newMsgs.length - 1];
                                        if (!lastMsg) return prev;
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
                if (tokenQueue.length > 0) {
                    displayedContent += tokenQueue.join('');
                    tokenQueue.length = 0;
                    updateChatMessages(researchChatId, prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        if (!lastMsg) return prev;
                        lastMsg.content = displayedContent;
                        lastMsg.steps = [...currentSteps];
                        lastMsg.sources = [...currentSources];
                        lastMsg.isStreaming = false;
                        return newMsgs;
                    });
                }
            }
        } catch (error) {
            if (isAbortError(error)) {
                updateChatMessages(researchChatId, prev => prev.filter((message, index) => {
                    if (index !== prev.length - 1) return true;
                    if (message.role !== 'assistant') return true;
                    return Boolean(message.content?.trim() || message.steps?.length || message.sources?.length);
                }).map((message, index, next) => {
                    if (index !== next.length - 1 || message.role !== 'assistant') return message;
                    return { ...message, isStreaming: false };
                }));
                return;
            }
            console.error('Research failed:', error);
            updateChatMessages(researchChatId, prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                if (lastMsg?.role === 'assistant') {
                    lastMsg.content = lastMsg.content?.trim()
                        ? `${lastMsg.content}\n\nResearch was interrupted before completion. Please try again.`
                        : 'Research failed. Please check that the backend is running and try again.';
                    lastMsg.isStreaming = false;
                    return next;
                }

                return [...prev, {
                    role: 'assistant',
                    content: 'Research failed. Please check that the backend is running and try again.',
                    isStreaming: false,
                }];
            });
            addToast('Research request failed', 'error');
        } finally {
            if (activeResearchAbortRef.current === abortController) {
                activeResearchAbortRef.current = null;
            }
            if (isMountedRef.current) {
                setIsResearching(false);
                setActiveResearchChatId(current => current === researchChatId ? null : current);
            }
            updateChatMessages(researchChatId, prev => prev.map((message, index) =>
                index === prev.length - 1 && message.role === 'assistant'
                    ? { ...message, isStreaming: false }
                    : message
            ));
        }
    };

    const isCurrentChatResearching = isResearching && activeResearchChatId === currentChatId;

    // ─── Render ────────────────────────────────────────

    return (
        <div className="research-shell flex min-h-[100dvh] h-[100dvh] w-full bg-ra-bg text-ra-text font-sans overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                chats={chats}
                currentChatId={currentChatId}
                onNewChat={createNewChat}
                onSelectChat={handleChatSwitch}
                onDeleteChat={deleteChat}
                deletingChatIds={deletingChatIds}
            />

            {/* Main Area */}
            <div className="flex-1 flex flex-col relative w-full min-w-0">
                {/* Header */}
                <header className="sticky top-0 w-full z-10 px-3 sm:px-4 lg:px-6 py-3 flex items-start sm:items-center justify-between gap-3 bg-ra-bg/80 backdrop-blur-xl border-b border-ra-border/50">
                    <div className="flex items-center gap-3 min-w-0">
                        <button 
                            onClick={() => setIsSidebarOpen(true)} 
                            className="p-2 text-ra-muted hover:text-ra-text hover:bg-ra-surface rounded-lg transition-all md:hidden"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-ra-accent to-ra-accentLight flex items-center justify-center shadow-[0_14px_30px_rgba(0,0,0,0.16)] shrink-0">
                                <Compass className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-semibold font-serif text-ra-text text-[15px] sm:text-base tracking-tight leading-tight truncate">Research Architect</span>
                                <span className="text-[10px] uppercase tracking-[0.24em] text-ra-muted leading-tight truncate">Analysis Workspace</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                        {messages.length > 0 && (
                            <>
                                {allSources.length > 0 && (
                                    <>
                                        <button 
                                            onClick={exportReadingPath}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                        >
                                            <Compass className="w-3.5 h-3.5" />
                                            Reading Path
                                        </button>
                                        <button 
                                            onClick={exportReadingList}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
                                        >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            Reading List
                                        </button>
                                        <button 
                                            onClick={exportBibtex}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-ra-muted hover:text-ra-text bg-ra-surface border border-ra-border rounded-lg transition-all hover:border-ra-accent/30"
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
                <main className="research-main-scroll flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 lg:px-6 scroll-smooth flex flex-col">
                    <div className={`w-full max-w-5xl mx-auto space-y-5 pt-4 sm:pt-6 pb-4 sm:pb-6 flex-grow flex flex-col ${messages.length === 0 ? 'justify-center' : ''}`}>
                        
                        {/* Empty State */}
                        {messages.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                className="flex flex-col items-center justify-center text-center space-y-6 flex-grow py-6"
                            >
                                <div className="space-y-4 max-w-2xl">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ra-accent/20 to-ra-accentLight/10 border border-ra-accent/20 flex items-center justify-center mx-auto shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
                                        <Compass className="w-8 h-8 text-ra-accent" />
                                    </div>
                                    <div className="inline-flex items-center gap-2 rounded-full border border-ra-border/80 bg-ra-surface/60 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-ra-muted">
                                        <Search className="w-3 h-3 text-ra-accent" />
                                        Research Console
                                    </div>
                                    <h1 className="text-2xl sm:text-4xl font-semibold font-serif text-ra-text leading-tight">
                                        Build a literature brief that feels publication-ready.
                                    </h1>
                                    <p className="text-sm sm:text-base text-ra-muted max-w-2xl px-2 sm:px-0">
                                        Search scholarly sources, analyze PDFs, compare findings, and turn messy evidence into a structured research trail with citations and reading paths.
                                    </p>
                                </div>

                                <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl">
                                    {[
                                        { label: 'Paper Search', value: 'Academic sources first' },
                                        { label: 'Evidence Trail', value: 'Citations stay attached' },
                                        { label: 'Benchmarks', value: 'Datasets and evaluations' },
                                        { label: 'Reading Path', value: 'Export next-step lists' },
                                    ].map((item) => (
                                        <div key={item.label} className="research-panel rounded-2xl border border-ra-border/70 px-4 py-3 text-left">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-ra-muted">{item.label}</p>
                                            <p className="text-sm text-ra-text mt-1">{item.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Suggestion Chips */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-3xl">
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
                                            className="suggestion-chip text-left p-4 rounded-2xl group"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="p-1.5 rounded-lg bg-ra-accent/10 text-ra-accent group-hover:bg-ra-accent/20 transition-colors shrink-0">
                                                    <suggestion.icon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-medium text-ra-accent uppercase tracking-[0.24em] mb-1">{suggestion.category}</p>
                                                    <p className="text-sm text-ra-muted group-hover:text-ra-text transition-colors leading-relaxed">{suggestion.text}</p>
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

                                    <div className={`flex flex-col w-full max-w-[92%] sm:max-w-[88%] lg:max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        {/* Message bubble */}
                                        <div className={`w-full px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-ra-accent/12 text-ra-text border border-ra-accent/20 rounded-br-sm shadow-[0_18px_36px_rgba(0,0,0,0.16)]'
                                                : 'text-ra-text research-panel border border-ra-border/60 rounded-3xl rounded-tl-sm'
                                        }`}>
                                            {/* Research Steps Timeline */}
                                            {msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="mb-4 py-3 px-3 rounded-xl bg-ra-surface/60 border border-ra-border/50"
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
                                                    (msg.isStreaming && idx === messages.length - 1 && msg.role === 'assistant') 
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
                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
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
                <div className="w-full border-t border-ra-border/40 bg-ra-bg/95 backdrop-blur-xl px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
                    <div className="w-full max-w-5xl mx-auto relative">
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
                        <div className="research-panel bg-ra-input border border-ra-border rounded-[22px] p-2 sm:p-3 flex items-end gap-2 shadow-lg shadow-black/20 focus-within:border-ra-accent/40 transition-all">
                            <label className={`p-2 rounded-lg hover:bg-ra-accent/10 text-ra-muted hover:text-ra-accent cursor-pointer transition-all mb-0.5 shrink-0 ${isUploading ? 'animate-pulse pointer-events-none' : ''}`}>
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

                            <div className="flex-1 min-w-0">
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
                                    disabled={isCurrentChatResearching}
                                    className="w-full bg-transparent border-none text-ra-text placeholder-ra-muted focus:ring-0 focus:outline-none text-base sm:text-[14px] py-2 px-2 max-h-32 sm:max-h-48 resize-none overflow-y-auto"
                                    rows={1}
                                />
                                <div className="flex flex-wrap gap-2 px-2 pb-1 pt-1">
                                    {RESEARCH_FILTER_OPTIONS.map((option) => {
                                        const active = researchFilters.includes(option.key);
                                        return (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => toggleResearchFilter(option.key)}
                                                className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                                                    active
                                                        ? 'border-ra-accent/50 bg-ra-accent/15 text-ra-text'
                                                        : 'border-ra-border bg-ra-surface/40 text-ra-muted hover:text-ra-text'
                                                }`}
                                                title={option.description}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <button
                                onClick={handleResearch}
                                disabled={isCurrentChatResearching || !query.trim()}
                                className="p-2.5 rounded-xl bg-ra-accent hover:bg-ra-accentLight text-[#04262a] disabled:text-ra-muted disabled:opacity-40 disabled:bg-ra-surface transition-all mb-0.5 shrink-0"
                            >
                                {isCurrentChatResearching ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                        <div className="hidden sm:flex items-center justify-between px-1 pt-2 text-[11px] text-ra-muted/80">
                            <span>Press Enter to send</span>
                            <span>Upload notes, PDFs, or screenshots to ground the answer</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast Container */}
            <div className="fixed bottom-24 left-3 right-3 sm:left-auto sm:right-4 z-50 flex flex-col gap-2 sm:max-w-sm">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <ToastNotification key={toast.id} toast={toast} onDismiss={dismissToast} />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};
