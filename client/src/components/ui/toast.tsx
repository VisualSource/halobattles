const Toast: React.FC<{ title: string; text: string }> = ({ title, text }) => {
    return (
        <div className="toaster group">
            <div className="group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg">
                <h5>{title}</h5>
                <p className="group-[.toast]:text-muted-foreground">{text}</p>
            </div>
        </div>
    );
}

export default Toast;