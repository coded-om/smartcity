import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-900 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-primary-500 text-white shadow hover:bg-primary-400 active:bg-primary-600',
        secondary:   'bg-secondary-500 text-white shadow hover:bg-secondary-400 active:bg-secondary-600',
        destructive: 'bg-accent-500 text-white shadow hover:bg-accent-400 active:bg-accent-600',
        coral:       'bg-coral-500 text-white shadow hover:bg-coral-400',
        bronze:      'bg-bronze-500 text-surface-900 shadow hover:bg-bronze-400',
        outline:     'border border-surface-400 bg-transparent text-slate-300 hover:bg-surface-600 hover:text-white',
        ghost:       'bg-transparent text-slate-400 hover:bg-surface-600 hover:text-white',
        link:        'text-primary-400 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3 text-xs',
        lg:      'h-11 px-6 text-base',
        icon:    'h-9 w-9 p-0',
        'icon-sm':'h-7 w-7 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
