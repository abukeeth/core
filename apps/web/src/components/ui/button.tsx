import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-[#171512] text-white shadow-lg shadow-black/10",
  secondary: "border border-[#E7DDCF] bg-white text-[#171512]",
  danger: "bg-red-600 text-white",
  ghost: "text-[#756B5D]",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "min-h-12 rounded-2xl px-5 text-sm",
  sm: "min-h-9 rounded-full px-3 text-xs",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      {...props}
      className={`font-bold transition active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100 ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
    />
  );
}
