import { Save } from "lucide-react";
import { useForm } from 'react-hook-form';
import { Form, FormField, FormControl, FormMessage, FormLabel, FormItem } from '@/components/ui/form';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TypographyH3 } from "@/components/ui/typograph";
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { trpc } from "@/lib/network";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const Fallback: React.FC = () => {
    return (
        <div className="flex flex-col">
            <Skeleton className="h-10 w-full" />
            <div className='mt-auto flex justify-end'>
                <Skeleton className="h-10 px-4 py-2" />
            </div>
        </div>
    );
}

const MapData: React.FC<{ isHost: boolean }> = ({ isHost }) => {
    return (
        <div className="flex flex-col col-span-1 col-start-2 row-start-2">
            <TypographyH3>Game Settings</TypographyH3>
            <Separator className="my-4" />
            <Suspense fallback={<Fallback />}>
                <Settings isHost={isHost} />
            </Suspense>
        </div>
    );
}

const Settings: React.FC<{ isHost: boolean }> = ({ isHost }) => {
    const [maps] = trpc.getMaps.useSuspenseQuery();
    const setSettings = trpc.setGameSettings.useMutation();

    const form = useForm<{ map: string; }>({
        defaultValues: {
            map: ""
        }
    });

    const onSubmit = async (state: { map: string; }) => {
        try {
            await setSettings.mutateAsync({
                map: state.map
            });
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <Form {...form}>
            <form className="h-full flex flex-col" data-name="map-data" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField rules={{ required: "A map is required." }} control={form.control} name="map" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Map</FormLabel>
                        <FormControl>
                            <Select onValueChange={(value) => field.onChange(value)} value={field.value} required disabled={!isHost}>
                                <SelectTrigger id="map-select">
                                    <SelectValue placeholder="Select Map" />
                                </SelectTrigger>
                                <SelectContent>
                                    {maps.map(value => (
                                        <SelectItem value={value}>{value}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )} />
                <div className='mt-auto flex justify-end'>
                    <Button type="submit" disabled={!isHost || form.formState.isLoading || form.formState.isSubmitting}>
                        <Save className='mr-2 h-4 w-4' />
                        Save
                    </Button>
                </div>
            </form>
        </Form>
    );
}

export default MapData;