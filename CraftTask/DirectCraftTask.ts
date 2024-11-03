import { Bot } from "mineflayer";
import { Block } from 'prismarine-block'
import { IndexedData } from "minecraft-data";
import { Behaviours } from "../utils";
import { BotTask } from "./BotTask";
import { MoveTask } from "./MoveTask";

export class DirectCraftTask extends BotTask<null> {
    private craftingTable: Block;
    private amount: number;
    private itemName: string;
    private goToTableTask: MoveTask;

    private initialCount: number;

    constructor(bot: Bot, mcData: IndexedData, utils: Behaviours, itemName: string, craftingTable: Block, amount: number) {
        super(bot, mcData, utils);
        this.craftingTable = craftingTable;
        this.amount = amount;
        this.itemName = itemName;
        this.goToTableTask = new MoveTask(bot, utils, mcData, craftingTable.position, 2);

        console.log(`[DirectCraftTask ${this.itemName}] New`);
        
        this.initialCount = this.itemCount();
    }
    
    private itemCount(): number {
        const items = this.bot.inventory.items().filter(item => item.name === this.itemName);
        if(items.length > 0) {
            return items.map(i => i.count).reduce((prev, next) => prev+next);
        } else {
            return 0;
        }
    }
    
    public tick(): void {
        if(this.isComplete()) {
            return;
        }
        
        if(!this.goToTableTask.isComplete()) {
            this.goToTableTask.tick();
        } else {
            console.log(`[DirectCraftTask Crafting ${this.itemName}]`);
            this.utils.craft(this.bot, this.itemName, this.mcData, this.amount, this.craftingTable, console.log);
        }
    }

    public isComplete() {
        return this.itemCount() >= this.initialCount + this.amount;
    }

    public result(): null {
        return null;
    }
}