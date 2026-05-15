import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'border-primary-500/40 bg-primary-500/20 text-primary-300',
        secondary:   'border-secondary-500/40 bg-secondary-500/20 text-secondary-300',
        destructive: 'border-accent-500/40 bg-accent-500/20 text-accent-300',
        coral:       'border-coral-500/40 bg-coral-500/20 text-coral-300',
        bronze:      'border-bronze-500/40 bg-bronze-500/20 text-bronze-300',
        success:     'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
        outline:     'border-surface-400 bg-transparent text-slate-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
