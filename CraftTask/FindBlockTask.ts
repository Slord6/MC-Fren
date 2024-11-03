import { Bot } from "mineflayer";
import { BotTask } from "./BotTask";
import { IndexedData } from "minecraft-data";
import { Behaviours } from "../utils";
import { Vec3 } from "vec3";
import { Block } from 'prismarine-block'
import { MoveTask } from "./MoveTask";

export class FindBlockTask extends BotTask<Vec3[]> {
    private blockName: string;
    private amount: number;

    private foundBlocks: Vec3[];
    private moveTask: MoveTask | null;

    private range: number = 30;

    constructor(bot: Bot, mcData: IndexedData, utils: Behaviours, blockName: string, amount: number) {
        super(bot, mcData, utils);
        this.blockName = blockName;
        this.amount = amount;

        this.foundBlocks = [];
        this.moveTask = null;

        console.log(`[FindBlock ${this.blockName}] New`);
    }

    public tick(): void {
        if(this.isComplete()) return;
        
        if (this.moveTask) {
            this.moveTask.tick();
            if (this.moveTask.isComplete()) {
                this.moveTask = null;
            } else {
                return;
            }
        }

        const found = this.utils.nearbyBlocksRawMatching(this.bot, this.range, (block: Block) => {
            return block.name === this.blockName;
        });
        const newFound: Vec3[] = [];
        found.forEach(b => {
            let prevSeen = false
            for (let I = 0; I < this.foundBlocks.length; I++) {
                const fB = this.foundBlocks[I];
                if (fB.equals(b.position)) {
                    prevSeen = true;
                    break;
                }
            }
            if (!prevSeen) {
                newFound.push(b.position);
            }
        });

        if (newFound.length > 0) {
            console.log(`[FindBlock ${this.blockName}] Found ${newFound.length} more ${this.blockName}`);
            this.foundBlocks?.push(...newFound);
        } else {
            const offsetX = (Math.random() - 0.5) * this.range * 2;
            const offsetZ = (Math.random() - 0.5) * this.range * 2;
            const pos = this.bot.entity.position;
            console.log(`[FindBlock ${this.blockName}] No ${this.blockName} nearby, moving ${offsetX}, ${offsetZ}`);
            this.moveTask = new MoveTask(this.bot, this.utils, this.mcData, { x: pos.x + offsetX, y: null, z: pos.z + offsetZ });
            this.moveTask.tick();
        }
    }

    public isComplete(): boolean {
        return this.foundBlocks.length >= this.amount;
    }

    public result(): Vec3[] | null {
        if (!this.isComplete()) return null;
        return this.foundBlocks.sort((a, b) => this.bot.entity.position.distanceTo(a) - this.bot.entity.position.distanceTo(b));
    }
}