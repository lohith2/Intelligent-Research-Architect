import { Plus, MessageSquare, Trash2, Compass, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AttachedFile {
    name: string;
    type: string;
}

interface ChatSession {
    id: string;
    title: string;
    date: Date;
    files?: AttachedFile[];
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    currentChatId: string | null;
    chats: ChatSession[];
    onNewChat: () => void;
    onSelectChat: (id: string) => void;
    onDeleteChat: (id: string, e: React.MouseEvent) => void;
    deletingChatIds?: string[];
}

export const Sidebar = ({
    isOpen,
    onClose,
    currentChatId,
    chats,
    onNewChat,
    onSelectChat,
    onDeleteChat,
    deletingChatIds = [],
}: SidebarProps) => {
    // Group chats by date
    const today = new Date();
    const todayChats = chats.filter(c => {
        const d = new Date(c.date);
        return d.toDateString() === today.toDateString();
    });
    const olderChats = chats.filter(c => {
        const d = new Date(c.date);
        return d.toDateString() !== today.toDateString();
    });

    const renderChat = (chat: ChatSession) => (
        <div key={chat.id} className="relative group">
        <button
            onClick={() => {
                onSelectChat(chat.id);
                if (window.innerWidth < 768) onClose();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-3 pr-11 rounded-xl text-sm transition-all group relative ${
                currentChatId === chat.id
                    ? 'bg-ra-accent/10 text-ra-text border border-ra-accent/30 shadow-[0_10px_30px_rgba(0,0,0,0.14)]'
                    : 'text-ra-muted hover:bg-ra-surface hover:text-ra-text border border-transparent'
            }`}
        >
            <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${
                currentChatId === chat.id ? 'text-ra-accent' : ''
            }`} />
            <div className="flex-1 text-left min-w-0">
                <span className="block truncate text-[13px] font-medium">{chat.title}</span>
                {chat.files && chat.files.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-ra-muted mt-0.5">
                        <FileText className="w-2.5 h-2.5" />
                        {chat.files.length} file{chat.files.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </button>
        <button
            type="button"
            aria-label={`Delete ${chat.title}`}
            onClick={(e) => onDeleteChat(chat.id, e)}
            disabled={deletingChatIds.includes(chat.id)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ra-muted/80 hover:text-ra-error rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
            <Trash2 className="w-3.5 h-3.5" />
        </button>
        </div>
    );

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Container */}
            <motion.div
                className={`fixed md:relative top-0 left-0 h-full w-[82vw] max-w-[300px] md:w-[280px] bg-ra-sidebar research-panel flex flex-col z-50 transform md:transform-none transition-transform duration-300 ease-in-out border-r border-ra-border/50 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
                }`}
            >
                {/* Header */}
                <div className="p-3 border-b border-ra-border/30">
                    <div className="flex items-center gap-2.5 px-2 py-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-ra-accent to-ra-accentLight flex items-center justify-center shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                            <Compass className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <span className="block font-semibold text-sm text-ra-text tracking-tight">Research Architect</span>
                            <span className="block text-[10px] uppercase tracking-[0.24em] text-ra-muted/70">Field Notes</span>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            onNewChat();
                            if (window.innerWidth < 768) onClose();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border border-ra-border hover:border-ra-accent/40 hover:bg-ra-accent/5 text-sm text-ra-muted hover:text-ra-text transition-all text-left group"
                    >
                        <div className="p-0.5 rounded bg-ra-accent/15 text-ra-accent group-hover:bg-ra-accent/25 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-[13px] font-medium">New Research</span>
                    </button>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                    {todayChats.length > 0 && (
                        <>
                        <div className="text-[10px] font-medium text-ra-muted/60 uppercase tracking-[0.24em] px-3 py-1.5">Today</div>
                            {todayChats.map(renderChat)}
                        </>
                    )}
                    {olderChats.length > 0 && (
                        <>
                            <div className="text-[10px] font-medium text-ra-muted/60 uppercase tracking-[0.24em] px-3 py-1.5 mt-3">Previous</div>
                            {olderChats.map(renderChat)}
                        </>
                    )}
                    {chats.length === 0 && (
                        <div className="text-center text-ra-muted/40 text-xs py-8 px-4">
                            No research sessions yet
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-ra-border/30">
                    <div className="px-2 py-1.5 text-[10px] text-ra-muted/40 text-center leading-relaxed">
                        Scholar search, source tracking, and session memory in one workspace.
                    </div>
                </div>
            </motion.div>
        </>
    );
};
