import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { TriangleAlertIcon } from "lucide-react"

const sizes = {
  md: "h-10 px-3 text-sm",
  lg: "h-12 px-4 text-base",
}

/**
 * Design system text field (Átomos · Formulario · Campo de texto): surface background, 12 px
 * radius and a strong border for non-text contrast (WCAG 1.4.11). States: default, filled, hover,
 * focus (lavender), error (`aria-invalid`, with an alert icon) and disabled. Optional leading icon.
 */
function Input({
  className,
  size = "md",
  icon,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: keyof typeof sizes; icon?: React.ReactNode }) {
  const invalid = props["aria-invalid"] === true || props["aria-invalid"] === "true"
  return (
    <div
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md border border-default bg-surface text-primary transition-colors",
        "hover:border-strong has-[input:focus]:border-focus has-[input:focus]:ring-1 has-[input:focus]:ring-focus",
        "has-[input:disabled]:pointer-events-none has-[input:disabled]:border-transparent has-[input:disabled]:bg-disabled has-[input:disabled]:text-disabled",
        invalid && "border-error hover:border-error",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        sizes[size],
        className
      )}
    >
      {icon && <span className="flex text-tertiary">{icon}</span>}
      <InputPrimitive
        className="h-full w-full min-w-0 bg-transparent outline-none placeholder:text-tertiary disabled:cursor-not-allowed disabled:placeholder:text-disabled"
        {...props}
      />
      {invalid && <TriangleAlertIcon aria-hidden className="text-error" />}
    </div>
  )
}

export { Input }
