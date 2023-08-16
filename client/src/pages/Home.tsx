
import { TypographyH1 } from "@/components/ui/typograph";
import JoinLobby from "@/components/home/JoinLobby";

const Home: React.FC = () => {
    return (
        <div className="bg-slate-900 h-full text-white flex flex-col justify-center items-center">
            <TypographyH1 className="mb-4">Halo Battles</TypographyH1>
            <JoinLobby />
        </div>
    );
}

export default Home;