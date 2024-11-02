import { Bot } from "mineflayer";
import { Behaviours } from "../utils";
import { IndexedData } from "minecraft-data";
import { Block } from 'prismarine-block'
import { RecipeTree } from "../RecipeTree";
import { BotTask } from "./BotTask";
import { FindBlockTask } from "./FindBlockTask";
import { Vec3 } from "vec3";
import { MineTask } from "./MineTask";
import { MoveTask } from "./MoveTask";
import { Movements } from "mineflayer-pathfinder";

export class CraftTask extends BotTask<null> {
    private itemName: string;
    private amount: number;

    private recipeTree: RecipeTree | null;
    private activeSubTask: BotTask<any> | null;

    private craftingTable: Block | null;

    constructor(bot: Bot, utils: Behaviours, itemName: string, amount: number, mcData: IndexedData) {
        super(bot, mcData, utils);
        this.amount = amount;
        this.itemName = itemName;

        this.activeSubTask = null;
        this.recipeTree = null;

        this.craftingTable = null;

        console.log(`New craft task for ${this.itemName}`);
    }
    
    private nextTask(): BotTask<any> {
        if(!this.recipeTree) throw new Error("Invalid recipe tree when creating subtask");

        const incomplete: string[] = this.recipeTree.incomplete(this.bot.inventory.items());
        if(incomplete.length === 0) {
            // presumably have finished
            // TODO: Make WaitTask or NoOp task
            return new MoveTask(this.bot, this.utils, this.mcData, this.bot.entity.position);
        }
        
        if(!this.craftingTable) {
            throw Error("Invalid state - no crafting table when checking craftability");
        }
        if(this.utils.canCraft(this.bot, incomplete[0], this.mcData, this.craftingTable!)) {
            console.log(`CraftTask - Bot can directly craft a ${incomplete[0]}`);
            if(this.bot.entity.position.distanceTo(this.craftingTable!.position) > 2) {
                console.log(`CraftTask - Moving to table for ${incomplete[0]}`);
                return new MoveTask(this.bot, this.utils, this.mcData, this.craftingTable!.position, 2);
            } else {
                console.log(`CraftTask - Crafting ${incomplete[0]}`);
                return new CraftTask(this.bot, this.utils, incomplete[0], 1, this.mcData);
            }
        }
        return new MineTask(this.bot, this.utils, this.mcData, incomplete[0]);
    }

    private ensureCraftingTable(): boolean {
        if(this.craftingTable == null) {
            if(this.activeSubTask) {
                this.activeSubTask.tick();
                if(this.activeSubTask.isComplete()) {
                    const craftingTablePosition = this.activeSubTask.result()[0] as Vec3;
                    this.craftingTable = this.bot.blockAt(craftingTablePosition);

                    this.recipeTree = new RecipeTree(this.bot, this.itemName, this.amount, this.mcData, this.craftingTable);
                    this.activeSubTask = null;
                    return true;
                } else {
                    return false;
                }
            } else {
                this.activeSubTask = new FindBlockTask(this.bot, this.mcData, this.utils, "crafting_table", 1);
                this.activeSubTask.tick();
                return false;
            }
        } else {
            return true;
        }
    }

    public tick(): void {
        if(this.isComplete()) {
            return;
        }
        
        if(!this.ensureCraftingTable()) {
            return;
        }

        const incomplete = this.recipeTree!.incomplete(this.bot.inventory.items());
        if(incomplete.length === 1) {
            console.log(`Final craft in CraftTask for ${this.itemName} (${incomplete[0]})`);
            // Final craft
            // TODO: handle amount > 0
            this.utils.goToTarget(this.bot, this.craftingTable!, new Movements(this.bot), 2, () => {
                this.utils.craft(this.bot, this.itemName, this.mcData, this.amount, this.craftingTable, console.log);
            });
            return;
        }

        if(this.activeSubTask === null || this.activeSubTask.isComplete()) {
            this.activeSubTask = this.nextTask();
        } else {
            this.activeSubTask.tick();
        }

    }

    public isComplete(): boolean {
        return this.bot.inventory.items().map(i => i.name).includes(this.itemName);
    }

}