import { useSearchParams, Link } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { buttonVariants } from '@/components/ui/button';
import { TypographySmall } from '@/components/ui/typograph';

const GameOver: React.FC = () => {
    const [query,] = useSearchParams();

    return (
        <div className="absolute top-0 left-0 flex bg-gray-800 bg-opacity-50 w-full h-screen z-50 flex-col justify-center items-center">
            <Card className="w-[300px]">
                <CardHeader>
                    <CardTitle>Gameover</CardTitle>
                    <CardContent className="text-center">
                        <div className='flex justify-center py-4'>
                            <Info className="h-28 w-28" />
                        </div>
                        <TypographySmall className="text-center">{query.get("name") ?? "Unknown"} has won the game.</TypographySmall>
                    </CardContent>
                </CardHeader>
                <CardFooter>
                    <Link to="/" className={buttonVariants({ variant: "success", className: "w-full" })}>
                        <Check className="mr-2 h-4 w-4" /> Accepct
                    </Link>
                </CardFooter>
            </Card>
        </div>
    );
}

export default GameOver;