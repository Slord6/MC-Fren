import { IndexedData } from "minecraft-data";
import { Bot } from "mineflayer";
import { Behaviours } from "../utils";
import { BotTask } from "./BotTask";
import { Vec3 } from "vec3";
import { Movements } from "mineflayer-pathfinder";

export type PositionOptionalY = {x: number, y: number | null, z: number};

export class MoveTask extends BotTask<Vec3> {
    private position: PositionOptionalY;
    private within: number;

    constructor(bot: Bot, utils: Behaviours, mcData: IndexedData, position: PositionOptionalY, within: number = 3) {
        super(bot, mcData, utils);
        this.position = position;
        this.within = within;

        console.log(`New move task for (${this.position.x},${this.position.y},${this.position.z}) (within ${this.within})`);
    }

    public tick(): void {
        if(this.isComplete()) {
            this.utils.stop(this.bot);
            return;
        }
        this.utils.goToTarget(this.bot, { position: this.position }, new Movements(this.bot), this.within - 1, () => { });
    }

    public isComplete(): boolean {
        if(this.position.y !== null) {
            return this.bot.entity.position.distanceTo(new Vec3(this.position.x, this.position.y, this.position.z)) <= this.within;
        }
        return this.bot.entity.position.xzDistanceTo(new Vec3(this.position.x, 0, this.position.z)) <= this.within;
    }

    public result(): Vec3 | null {
        return this.isComplete() ? this.bot.entity.position : null;
    }

}