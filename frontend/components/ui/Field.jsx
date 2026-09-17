'use client';

import { forwardRef, useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Form controls.
 *
 * Every control here is wired for accessibility by construction rather than by
 * remembering: a real <label> tied by id, `aria-invalid` when in error, and the
 * error message tied by `aria-describedby`. A component that makes the correct
 * thing the default is worth more than a checklist item nobody rereads.
 */

const CONTROL_BASE =
  'rounded-(--radius-sm) border bg-(--color-surface) text-sm text-(--color-text) ' +
  'placeholder:text-(--color-text-subtle) transition-colors duration-150 ' +
  'hover:border-(--color-text-subtle) ' +
  'disabled:cursor-not-allowed disabled:bg-(--color-surface-sunken) disabled:text-(--color-text-subtle)';

/**
 * Full width unless the caller sizes the control.
 *
 * `cn` is plain clsx, which concatenates rather than resolving conflicts, so
 * `w-full` in the base plus a caller's `w-48` put BOTH in the class list and
 * the winner was decided by stylesheet order — `w-full` won, and every sized
 * control in the application silently stretched. The base now yields when a
 * width is given.
 */
function controlClasses(invalid, extra) {
  const sized = typeof extra === 'string' && /(^|\s)(w-|min-w-|max-w-|flex-)/.test(extra);

  return cn(
    CONTROL_BASE,
    !sized && 'w-full',
    invalid ? 'border-(--color-negative)' : 'border-(--color-line-strong)',
    extra,
  );
}

/**
 * Label + control + error, with the wiring done.
 *
 * `children` is a render function receiving the ids it must use, so a Field can
 * wrap any control without the caller re-deriving them.
 */
export function Field({ label, hint, error, required = false, className, children }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wide text-(--color-text-muted)"
      >
        {label}
        {required && (
          <span className="ms-1 text-(--color-negative)" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        invalid: Boolean(error),
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}

      {hint && !error && (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-(--color-text-subtle)">
          {hint}
        </p>
      )}

      {error && (
        <p id={`${id}-error`} className="text-[0.8125rem] text-(--color-negative)">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('h-8 px-2.5', className))}
      {...props}
    />
  );
});

/**
 * Numeric input.
 *
 * Tabular figures, end-aligned, and `inputMode="decimal"` so a phone shows the
 * right keypad. Numbers in this product are read in columns and must line up.
 */
export const NumberInput = forwardRef(function NumberInput({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('tabular h-8 px-2.5 text-end', className))}
      {...props}
    />
  );
});

/**
 * Date input.
 *
 * Deliberately the native control rather than a bespoke calendar popover: it is
 * keyboard operable, screen-reader correct, localised and typable on day one,
 * and it costs zero kilobytes. A custom picker is a real project — it is worth
 * starting only when a requirement appears that the native control cannot meet,
 * such as range selection with presets inside one popover.
 */
export const DateInput = forwardRef(function DateInput({ invalid, className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="date"
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('tabular h-8 px-2.5', className))}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea(
  { invalid, rows = 3, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('resize-y px-2.5 py-1.5', className))}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select(
  { invalid, options = [], placeholder, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('h-8 px-2 pe-7', className))}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, className, id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="size-3.5 rounded-[2px] border-(--color-line-strong) accent-(--color-accent)"
        {...props}
      />
      {label && (
        <label htmlFor={inputId} className="select-none text-sm text-(--color-text)">
          {label}
        </label>
      )}
    </div>
  );
});

export const Radio = forwardRef(function Radio({ label, className, id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={inputId}
        type="radio"
        className="size-3.5 border-(--color-line-strong) accent-(--color-accent)"
        {...props}
      />
      {label && (
        <label htmlFor={inputId} className="select-none text-sm text-(--color-text)">
          {label}
        </label>
      )}
    </div>
  );
});
