import { cn } from "@/lib/utils";

export const TypographyH3: React.FC<React.HtmlHTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
    return (
        <h3 className={cn("scroll-m-20 text-2xl font-semibold tracking-tight", className)} {...props}>
            {children}
        </h3>
    )
}

export const TypographyH2: React.FC<React.HtmlHTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
    return (
        <h2 className={cn("scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0", className)} {...props}>
            {children}
        </h2>
    );
}

export const TypographyH1: React.FC<React.HtmlHTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
    return (
        <h1 className={cn("scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl", className)} {...props}>
            {children}
        </h1>
    );
}

export const TypographyH4: React.FC<React.HtmlHTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => {
    return (
        <h4 className={cn("scroll-m-20 text-xl font-semibold tracking-tight", className)} {...props}>
            {children}
        </h4>
    );
}

export const TypographyP: React.FC<React.HtmlHTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => {
    return (
        <p className={cn("leading-7 [&:not(:first-child)]:mt-6", className)} {...props}>
            {children}
        </p>
    );
}

export const TypographySmall: React.FC<React.HtmlHTMLAttributes<HTMLElement>> = ({ children, className, ...props }) => {
    return (
        <small className={cn("text-sm font-medium leading-none", className)} {...props}>{children}</small>
    );
}

export const TypographyMuted: React.FC<React.HtmlHTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => {
    return (
        <p className={cn("text-sm text-muted-foreground", className)} {...props}>{children}</p>
    )
}