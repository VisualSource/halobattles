import { ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenu, ContextMenuShortcut } from "../ui/context-menu";
import Engine from "@/lib/engine";

export type ContextProps = { x: number; y: number; worldX: number; worldY: number; };

const ContextContainer: React.FC<ContextProps> = (props) => {
    return (

        <ContextMenu>
            <ContextMenuTrigger></ContextMenuTrigger>

            <ContextMenuContent className="absolute w-64" style={{ top: `${props.y}px`, left: `${props.x}px` }}>
                <ContextMenuItem inset onClick={(ev) => {
                    ev.preventDefault();
                    const engine = Engine.Get();

                    const pos = engine.unproject(props.worldX, props.worldY);

                    engine.addNode({ x: pos.x, y: pos.y, name: "New World", color: 0x00ffed });

                }}>
                    Create Node
                    <ContextMenuShortcut>Ctrl + n</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>

        </ContextMenu>

    );
}

export default ContextContainer;

