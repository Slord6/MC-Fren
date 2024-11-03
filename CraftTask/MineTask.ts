import { IndexedData } from "minecraft-data";
import { Bot } from "mineflayer";
import { Behaviours } from "../utils";
import { BotTask } from "./BotTask";
import { Vec3 } from "vec3";
import { FindBlockTask } from "./FindBlockTask";
import { MoveTask } from "./MoveTask";
import { Movements } from "mineflayer-pathfinder";


export class MineTask extends BotTask<Vec3> {
    private blockName: string;

    private findBlockTask: FindBlockTask;
    private goToBlockTask: MoveTask | null;
    private complete: boolean = false;

    constructor(bot: Bot, utils: Behaviours, mcData: IndexedData, blockName: string) {
        super(bot, mcData, utils);
        this.blockName = blockName;

        this.findBlockTask = new FindBlockTask(this.bot, this.mcData, this.utils, this.blockName, 1);
        this.goToBlockTask = null;

        console.log(`[MineTask ${this.blockName}] New`);
    }

    public tick(): void {
        if (this.isComplete()) return;

        if (this.findBlockTask.isComplete()) {
            if (this.goToBlockTask && this.goToBlockTask.isComplete()) {
                this.utils.digBlockAt(this.bot, (this.findBlockTask.result() as Vec3[])[0], () => {
                    this.utils.collectDrops(this.bot, new Movements(this.bot), 2, () => {
                        this.complete = true;
                    });
                });
            } else {
                if (!this.goToBlockTask) {
                    this.goToBlockTask = new MoveTask(this.bot, this.utils, this.mcData, this.findBlockTask.result()![0], 1);
                }
                this.goToBlockTask.tick();
            }
        } else {
            this.findBlockTask.tick();
        }
    }

    public isComplete(): boolean {
        return this.complete;
    }

    public result(): Vec3 | null {
        return this.isComplete() ? this.bot.entity.position : null;
    }

}