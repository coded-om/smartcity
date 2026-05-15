import { Toaster as Sonner } from 'sonner';

export function SonnerToaster() {
  return (
    <Sonner
      position="top-right"
      expand={false}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:       'bg-surface-700 border border-surface-500 text-slate-200 shadow-xl rounded-xl font-sans text-sm',
          title:       'font-semibold text-white',
          description: 'text-slate-400 text-xs',
          actionButton:'bg-primary-500 text-white hover:bg-primary-400 rounded-md px-3 py-1 text-xs font-medium',
          cancelButton:'bg-surface-600 text-slate-300 hover:bg-surface-500 rounded-md px-3 py-1 text-xs',
          closeButton: 'bg-surface-600 border-surface-400 text-slate-400 hover:text-white',
          error:       'border-accent-500/50 bg-surface-700',
          success:     'border-emerald-500/50 bg-surface-700',
          warning:     'border-bronze-500/50 bg-surface-700',
          info:        'border-primary-500/50 bg-surface-700',
        },
      }}
    />
  );
}
