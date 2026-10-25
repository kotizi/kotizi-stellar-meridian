"use client";

import { useId, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Labelled text field with its error below (linked through `aria-describedby`). */
export function Field({
  label,
  error,
  input,
}: {
  label: string;
  error: string | undefined;
  input: ComponentProps<typeof Input>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="type-label-md text-secondary">
        {label}
      </Label>
      <Input
        id={id}
        size="lg"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="type-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
