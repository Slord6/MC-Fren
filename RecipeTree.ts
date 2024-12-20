import { Bot } from "mineflayer";
import { Behaviours } from "./utils";
import { IndexedData } from "minecraft-data";
import { Item } from "prismarine-item";
import { Block } from "prismarine-block";
import { Recipe, RecipeItem } from "prismarine-recipe";

export type SimpleItem = {name: string, displayName: string, count: number};

export class RecipeTree {
    private bot: Bot;
    private root: RecipeTreeNode;
    private itemName: string;
    private amount: number;
    private mcData: IndexedData;
    private craftingTable: Block | null;

    private allRequiredIds: number[] = [];

    constructor(bot: Bot, itemName: string, amount: number, mcData: IndexedData, craftingTable: Block | null) {
        this.bot = bot;
        this.root = { count: 0, requires: null, recipes: null, id: 0 };
        this.itemName = itemName;
        this.amount = amount;
        this.mcData = mcData;
        this.craftingTable = craftingTable

        this.refresh();
    }

    public refresh() {
        if (this.mcData.itemsByName[this.itemName] === undefined) {
            throw Error(`Invalid item: ${this.itemName}`);
        }
        const utils = new Behaviours();
        this.allRequiredIds = [];
        this.root = {
            count: this.amount,
            requires: null,
            recipes: this.bot.recipesAll(this.mcData.itemsByName[this.itemName].id, null, this.craftingTable),
            id: utils.nameToItem(this.bot, this.itemName, this.mcData).id
        }
        this.build(this.root, utils);
    }

    private simplify(arr: RecipeItem[]): RecipeItemCount[] {
        const dict: { [id: number]: RecipeItemCount } = {};
        arr.forEach(item => {
            if (!dict[item.id]) {
                dict[item.id] = {
                    count: 0,
                    item
                }
            }
            dict[item.id].count += item.count;
        });
        return Object.values(dict);
    }

    /**
     * Check if we can treat this ID as a source block.
     * Eg. for Coal, we don't want a Coal Block, we just want to mine it
     * So we exit early in those cases
     * @param id Id of the item
     */
    private earlyCutoff(id: number): boolean {
        const cutoffs = {
            exact: ["coal"],
            endsWith: ["_ingot"]
        };

        const name = this.mcData.items[id].name;

        if (cutoffs.exact.includes(name) || cutoffs.endsWith.filter(check => name.endsWith(check)).length > 0) {
            console.log("|", "Early exit for", name);
            return true;
        }
        return false;
    }

    /**
     * Given a set of items, return the names of the blocks in
     * the tree that have not yet been collected 
     * @param obtained 
     * @returns
     */
    public incomplete(obtained: {name: string, displayName: string, count: number}[]): string[] {
        console.log("HAVE:", obtained.map(oi => `${oi.displayName}:${oi.count}`));
        // Grab the amount of each item in the array
        const obtainedIds: { [id: number]: number } = {};
        obtained.forEach(i => {
            const id = this.mcData.itemsByName[i.name].id;
            if (obtainedIds[id] === undefined) {
                obtainedIds[id] = i.count;
            } else {
                obtainedIds[id] += i.count;
            }
        });

        const uncollected = (node: RecipeTreeNode) => {
            console.log(`Checking ${node.id} (${this.mcData.items[node.id]?.name})`);
            if (obtainedIds[node.id] !== undefined) {
                obtainedIds[node.id] -= node.count;
                const need = obtainedIds[node.id] < 0;
                if(need) {
                    console.log(`Adding ${this.mcData.items[node.id]?.name} (${obtainedIds[node.id]})`);
                } else {
                    console.log(`Still have excess ${this.mcData.items[node.id]?.name} (${obtainedIds[node.id]})`);
                }
                return need;
            }
            console.log(`Adding ${node.id} (${this.mcData.items[node.id]?.name})`);
            return true;
        };
        
        const required = this.nodesMatching(this.root, uncollected).filter(n => n !== null).map(node => this.mcData.items[node.id]?.name);
        const dbg = Object.entries(obtainedIds).map(entry => {
            return `${this.mcData.items[Number(entry[0])]?.name}*${entry[1]}`;
        });
        console.log(`REQ: ${required}\nDIFF: ${dbg}`);

        return required;
    }

    /**
     * Checks if nodes pass a filter. If a parent node does not pass, then neither do it's children
     * @param node
     * @param filter 
     * @returns 
     */
    private nodesMatching(node: RecipeTreeNode, filter: (node: RecipeTreeNode) => boolean): (RecipeTreeNode | null)[] {
        const passesFilter = filter(node);
        if (node.requires && passesFilter) {
            const childResults = node.requires.map(child => {
                return this.nodesMatching(child, filter);
            }).reduce((prev: (RecipeTreeNode | null)[], curr: (RecipeTreeNode | null)[]) => {
                return [...prev, ...curr];
            }, []);
            childResults.push(passesFilter ? node : null);
            return childResults.filter(c => c !== null);
        } else {
            return passesFilter ? [node] : [null];
        }
    }

    private build(node: RecipeTreeNode, utils: Behaviours) {
        // Skip items that can't be crafted, we already have in the tree and
        // items we can cut off early from
        if (!node.recipes || this.allRequiredIds.includes(node.id) || this.earlyCutoff(node.id)) return;

        this.allRequiredIds.push(node.id);
        const recipe = node.recipes![0];
        let requires: RecipeItem[];
        if (recipe.inShape) {
            requires = recipe.inShape.flat();
        } else {
            requires = recipe.ingredients;
        }

        node.requires = [];
        if (requires) {
            const simplifiedRequires = this.simplify(requires);
            simplifiedRequires.forEach(requirement => {
                // Ignore empty gaps in recipe
                if (requirement.item.id == -1) return;
                const newReq = {
                    count: (requirement.count * requirement.item.count) * this.amount,
                    id: requirement.item.id,
                    recipes: this.bot.recipesAll(requirement.item.id, null, this.craftingTable),
                    requires: null
                }
                node.requires!.push(newReq);
                if (newReq.recipes && newReq.recipes.length > 0) {
                    this.build(newReq, utils);
                }
            });
        }
    }

    public print() {
        this.printNode(this.root);
    }

    private printNode(node: RecipeTreeNode, prefix: string = "") {
        console.log(prefix, `[${node.id}]${this.mcData.items[node.id]?.name} * ${node.count} `);
        if (node.requires) {
            node.requires.forEach(child => {
                this.printNode(child, prefix + ">");
            });
        }
    }
}

export interface RecipeTreeNode {
    recipes: Recipe[] | null;
    requires: RecipeTreeNode[] | null;
    count: number;
    id: number;
}

interface RecipeItemCount {
    item: RecipeItem,
    count: number
}