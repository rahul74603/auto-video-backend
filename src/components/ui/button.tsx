import * as React from "react"

// 👇 Yahan hum TypeScript ko bata rahe hain ki 'variant' aur 'size' allowed hain
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    
    // 1. Variant (Design) Logic
    let variantStyles = "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"; // Default
    
    if (variant === "outline") {
      variantStyles = "border border-gray-300 bg-transparent hover:bg-gray-100 text-gray-900";
    } else if (variant === "ghost") {
      variantStyles = "hover:bg-gray-100 text-gray-700";
    } else if (variant === "secondary") {
      variantStyles = "bg-gray-100 text-gray-900 hover:bg-gray-200";
    } else if (variant === "destructive") {
      variantStyles = "bg-red-600 text-white hover:bg-red-700";
    } else if (variant === "link") {
      variantStyles = "text-blue-600 underline-offset-4 hover:underline";
    }

    // 2. Size (Height/Width) Logic
    let sizeStyles = "h-10 px-4 py-2"; // Default
    
    if (size === "sm") {
      sizeStyles = "h-9 rounded-md px-3 text-xs";
    } else if (size === "lg") {
      sizeStyles = "h-11 rounded-md px-8 text-md";
    } else if (size === "icon") {
      sizeStyles = "h-10 w-10";
    }

    // 3. Final ClassName
    const finalClass = `inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none ${variantStyles} ${sizeStyles} ${className}`;

    return (
      <button
        ref={ref}
        className={finalClass}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }