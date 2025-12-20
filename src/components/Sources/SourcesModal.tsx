import { X } from 'lucide-react';
import { AddSourceForm } from './AddSourceForm';
import { SourceManager } from './SourceManager';

interface SourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SourcesModal({ isOpen, onClose }: SourcesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-stone-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-stone-950 rounded-xl border border-stone-800 w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <h2 className="text-2xl font-semibold text-stone-200">Manage News Sources</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)] space-y-6">
          <AddSourceForm />
          <SourceManager />
        </div>
      </div>
    </div>
  );
}
