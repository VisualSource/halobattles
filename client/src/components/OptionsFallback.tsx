import { Spinner } from "flowbite-react";

const Fallback: React.FC = () => {
    return (
        <section className="h-full flex items-center justify-center">
            <Spinner />
        </section>
    );
}

export default Fallback;