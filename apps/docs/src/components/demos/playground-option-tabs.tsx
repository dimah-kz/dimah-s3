"use client";

import { Tabs, TabsList, TabsTrigger } from "fumadocs-ui/components/ui/tabs";

const triggerClassName =
  "inline-flex items-center gap-2 border-b border-transparent py-2 text-sm font-medium whitespace-nowrap text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-active:border-fd-primary data-active:text-fd-primary";

/** Labeled tab row for docs playgrounds (size / orientation / state, …). */
export function PlaygroundOptionTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="w-full"
    >
      <TabsList className="flex gap-3.5 overflow-x-auto px-1 text-fd-secondary-foreground not-prose">
        <span className="my-auto me-auto text-sm font-medium text-fd-foreground">
          {label}
        </span>
        {options.map((option) => (
          <TabsTrigger key={option} value={option} className={triggerClassName}>
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
