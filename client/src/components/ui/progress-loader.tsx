import { cn } from "@/lib/utils";

const ProgressLoader: React.FC<{ className?: string; }> = ({ className }) => {
    return (
        <div className={cn("lds-ring h-20 w-20", className)}>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
        </div>
    );
}
export default ProgressLoader;