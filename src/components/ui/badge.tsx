import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  let variantStyles = "bg-blue-100 text-blue-800 hover:bg-blue-200";
  
  if (variant === "secondary") {
    variantStyles = "bg-gray-100 text-gray-800 hover:bg-gray-200";
  } else if (variant === "destructive") {
    variantStyles = "bg-red-100 text-red-800 hover:bg-red-200";
  }

  return (
    <div 
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent ${variantStyles} ${className}`} 
      {...props} 
    />
  )
}

export { Badge }