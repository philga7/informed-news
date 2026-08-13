import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastComponent } from '../components/UI/Toast';
import type { Toast } from '../components/UI/Toast';

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showArchive: (message: string, undoAction: () => void) => void;
  showDelete: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback(
    (message: string) => {
      showToast({ type: 'success', message, duration: 5000 });
    },
    [showToast]
  );

  const showError = useCallback(
    (message: string) => {
      showToast({ type: 'error', message, duration: 5000 });
    },
    [showToast]
  );

  const showArchive = useCallback(
    (message: string, undoAction: () => void) => {
      showToast({ type: 'archive', message, undoAction, duration: 5000 });
    },
    [showToast]
  );

  const showDelete = useCallback(
    (message: string) => {
      showToast({ type: 'delete', message, duration: 5000 });
    },
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showSuccess,
        showError,
        showArchive,
        showDelete,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastComponent toast={toast} onClose={onRemove} />
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

