import { Bot } from "mineflayer";
import { Behaviours } from "../utils";
import { IndexedData } from "minecraft-data";
import { Block } from 'prismarine-block'
import { RecipeTree, SimpleItem } from "../RecipeTree";
import { BotTask } from "./BotTask";
import { FindBlockTask } from "./FindBlockTask";
import { Vec3 } from "vec3";
import { MineTask } from "./MineTask";
import { MoveTask } from "./MoveTask";
import { DirectCraftTask } from "./DirectCraftTask";

export class CraftTask extends BotTask<null> {
    private itemName: string;
    private amount: number;

    private recipeTree: RecipeTree | null;
    private activeSubTask: BotTask<any> | null;

    private craftingTable: Block | null;

    private initialInventory: SimpleItem[];
    useExistingMaterials: any;
    
    constructor(bot: Bot, utils: Behaviours, itemName: string, amount: number, mcData: IndexedData, useExistingMaterials: boolean) {
        super(bot, mcData, utils);
        this.amount = amount;
        this.itemName = itemName;
        this.useExistingMaterials = useExistingMaterials;
        console.log(`[CraftTask ${this.itemName}] New (${this.amount})`);

        this.activeSubTask = null;
        this.recipeTree = null;

        this.craftingTable = null;
        // Create initial inventory list, but ignore stack limits (if they exist??)
        this.initialInventory = [];
        this.bot.inventory.items().forEach(invItem => {
            const existing = this.initialInventory.filter(i => i.name == invItem.name);
            if (existing.length > 0) {
                existing[0].count += invItem.count;
            } else {
                this.initialInventory.push({name: invItem.name, displayName: invItem.displayName, count: invItem.count});
            }
        });
        console.log(`[CraftTask ${this.itemName}] Initial inv: ${this.initialInventory.map(i => i.displayName + ":" + i.count)}`);
    }

    /**
     * Items new to the inventory since we started
     */
    private inventoryNew(): SimpleItem[] {
        const newItems: SimpleItem[] = [];
        this.bot.inventory.items().forEach(currItem => {
            const matches = this.initialInventory.filter(oldItem => oldItem.name == currItem.name);
            if (matches.length > 0) {
                const amount = currItem.count - matches[0].count;
                if(amount > 0) {
                    newItems.push({name: currItem.name, displayName: currItem.displayName, count: amount});
                }
            } else {
                newItems.push({name: currItem.name, displayName: currItem.displayName, count: currItem.count});
            }
        });

        return newItems;
    }

    private needsMining(itemName: string) {
        const recipes = this.bot.recipesAll(this.mcData.itemsByName[itemName].id, null, this.craftingTable);
        return recipes.length === 0;
    }

    private nextTask(): BotTask<any> {
        if (!this.recipeTree) throw new Error(`[CraftTask ${this.itemName}] Invalid recipe tree when creating subtask`);

        if (!this.craftingTable) {
            throw Error(`[CraftTask ${this.itemName}] Invalid state - no crafting table when creating next task`);
        }

        const newItems = this.useExistingMaterials ? this.bot.inventory.items() : this.inventoryNew();
        console.log(`[CraftTask ${this.itemName}] items since start: ${newItems.map(i => `${i.name}*${i.count}`)}`);
        const incomplete: string[] = this.recipeTree.incomplete(newItems);
        if (incomplete.length === 0) {
            if(this.remaining() > 0){
                console.log(`[CraftTask ${this.itemName}] No remaining requirements, we just craft the target item`);
                return new DirectCraftTask(this.bot, this.mcData, this.utils, this.itemName, this.craftingTable!, this.amount);
            } else {
                console.log(`[CraftTask ${this.itemName}] Should have finished?!`);
                // Why are we here??
                return new MoveTask(this.bot, this.utils, this.mcData, this.bot.entity.position, 2);
                // presumablyshould have finished
            }
        }
        const nextItem = incomplete[0];

        // have ingredients -> just craft
        // is craftable but don't have ingredients -> but craft
        // isn't craftable -> go mining

        if (this.utils.canCraft(this.bot, nextItem, this.mcData, this.craftingTable!)) {
            console.log(`[CraftTask ${this.itemName}] Bot can directly craft a ${nextItem}`);
            // We have the ingredients, so we can just make this
            return new DirectCraftTask(this.bot, this.mcData, this.utils, nextItem, this.craftingTable!, this.amount);
        } else if (!this.needsMining(nextItem)) {
            console.log(`[CraftTask ${this.itemName}] Need to craft ${nextItem}`);
            // It's a craftable item, so we kick off a sub-CraftTask to create that
            return new CraftTask(this.bot, this.utils, nextItem, 1, this.mcData, false);
        } else {
            // Will need to find this in the world (i.e. not possible to craft it at all)
            console.log(`[CraftTask ${this.itemName}] Need to mine for ${nextItem}`);
            return new MineTask(this.bot, this.utils, this.mcData, nextItem);
        }
    }

    private ensureCraftingTable(): boolean {
        if (this.craftingTable == null) {
            if (this.activeSubTask) {
                this.activeSubTask.tick();
                if (this.activeSubTask.isComplete()) {
                    console.log(`[CraftTask ${this.itemName}] Found a crafting table to work with`);
                    const craftingTablePosition = this.activeSubTask.result()[0] as Vec3;
                    this.craftingTable = this.bot.blockAt(craftingTablePosition);

                    this.recipeTree = new RecipeTree(this.bot, this.itemName, this.amount, this.mcData, this.craftingTable);
                    this.recipeTree.print();
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
        if (this.isComplete()) {
            return;
        }

        if (!this.ensureCraftingTable()) {
            return;
        }

        if (this.activeSubTask === null || this.activeSubTask.isComplete()) {
            this.activeSubTask = this.nextTask();
        } else {
            this.activeSubTask.tick();
        }
    }

    private remaining(): number {
        const item = this.inventoryNew().filter(i => i.name === this.itemName)[0];
        const count = item ? item.count : 0;
        // console.log(`[CraftTask ${this.itemName}] Complete check: ${item ? item.displayName : "None"} (${count})`);
        return this.amount - count;
    }
    
    public isComplete(): boolean {
        return this.remaining() <= 0;
    }

}