import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Archive, Trash2, Undo2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'archive' | 'delete';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  undoAction?: () => void;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

export function ToastComponent({ toast, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const duration = toast.duration || 5000;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(toast.id), 300); // Wait for fade-out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(toast.id), 300);
  };

  const handleUndo = () => {
    if (toast.undoAction) {
      toast.undoAction();
    }
    handleClose();
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'archive':
        return <Archive className="w-5 h-5 text-blue-400" />;
      case 'delete':
        return <Trash2 className="w-5 h-5 text-red-400" />;
      default:
        return null;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-900 border-green-700';
      case 'error':
        return 'bg-red-900 border-red-700';
      case 'archive':
        return 'bg-blue-900 border-blue-700';
      case 'delete':
        return 'bg-red-900 border-red-700';
      default:
        return 'bg-stone-900 border-stone-700';
    }
  };

  return (
    <div
      className={`
        ${getBgColor()}
        border rounded-lg p-4 shadow-lg
        flex items-start gap-3
        min-w-[300px] max-w-[500px]
        transition-all duration-300
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
      
      <div className="flex-1 min-w-0">
        <p className="text-stone-200 text-sm">{toast.message}</p>
        {toast.type === 'archive' && toast.undoAction && (
          <button
            onClick={handleUndo}
            className="mt-2 text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 transition-colors"
          >
            <Undo2 className="w-4 h-4" />
            Undo
          </button>
        )}
      </div>

      <button
        onClick={handleClose}
        className="flex-shrink-0 text-stone-400 hover:text-stone-200 transition-colors"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

