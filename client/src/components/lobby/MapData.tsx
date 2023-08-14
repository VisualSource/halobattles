import { Save } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TypographyH3 } from "@/components/ui/typograph";
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const MapData: React.FC<{ isHost: boolean }> = ({ isHost }) => {
    return (
        <form data-name="map-data" className="flex flex-col col-span-1 col-start-2 row-start-2" onSubmit={(ev) => {
            ev.preventDefault();
        }}>
            <TypographyH3>Game Settings</TypographyH3>
            <Separator className="my-4" />
            <Label htmlFor="map-select" className="mb-2">Map</Label>
            <Select required disabled={!isHost}>
                <SelectTrigger id="map-select">
                    <SelectValue placeholder="Select Map" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="test_map">test_map</SelectItem>
                </SelectContent>
            </Select>

            <div className='mt-auto flex justify-end'>
                <Button type="submit" disabled={!isHost}>
                    <Save className='mr-2 h-4 w-4' />
                    Save
                </Button>
            </div>

        </form>
    );
}

export default MapData;