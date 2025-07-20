import { FileText, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface FilePreviewProps {
    file: File | null;
    onRemove: () => void;
}

export const FilePreview = ({ file, onRemove }: FilePreviewProps) => {
    if (!file) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-full mb-4 left-4 z-10"
        >
            <div className="bg-[#303030] border border-white/10 p-3 rounded-xl shadow-lg flex items-center gap-3 pr-2">
                <div className="bg-red-500/10 p-2 rounded-lg text-red-400">
                    <FileText className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[140px]">
                        {file.name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                        {(file.size / 1024).toFixed(1)} KB
                    </span>
                </div>
                <div className="h-8 w-[1px] bg-white/10 mx-1" />
                <button
                    onClick={onRemove}
                    className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
};
