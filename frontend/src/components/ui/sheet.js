import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetVariants = {
  left:   'inset-y-0 left-0 h-full w-72 border-r border-surface-500 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  right:  'inset-y-0 right-0 h-full w-72 border-l border-surface-500 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
  top:    'inset-x-0 top-0 border-b border-surface-500 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom: 'inset-x-0 bottom-0 border-t border-surface-500 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
};

const SheetContent = React.forwardRef(({ side = 'left', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 gap-4 bg-surface-900 p-0 shadow-xl',
        'transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out duration-300',
        sheetVariants[side],
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:text-white hover:bg-surface-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-1 p-5 border-b border-surface-700', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-5 border-t border-surface-700', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold text-white', className)} {...props} />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-slate-400', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription };
