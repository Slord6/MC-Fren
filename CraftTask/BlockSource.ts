import { IndexedData } from "minecraft-data";
import { Bot } from "mineflayer";
import { Block } from 'prismarine-block'

export enum SourceType {
    Mined,
    Crafted,
    Smelted
}

// This is very simplistic and doesn't cover all cases
// See also https://github.com/PrismarineJS/minecraft-data/issues/290
// for smelting data not being available yet
export class BlockSource {
    public static GetSource(mcData: IndexedData, itemName: string): string {
        if(itemName.toLowerCase() === "cobblestone") return "stone";

        const asOre = `${itemName}_ore`;
        if (mcData.itemsByName[asOre]) {
            return mcData.itemsByName[asOre].name;
        }

        return itemName;
    }

    public static SourceType(bot: Bot, mcData: IndexedData, craftingTable: Block, itemName: string): SourceType {
        if (itemName.toLowerCase() === "glass"
            || itemName.endsWith("_ingot")
            || itemName.endsWith("brick")) {
            return SourceType.Smelted;
        }

        if(BlockSource.GetSource(mcData, itemName) !== itemName) return SourceType.Mined;

        if (bot.recipesAll(mcData.itemsByName[itemName].id, null, craftingTable).length > 0) return SourceType.Crafted;
        
        return SourceType.Mined;
    }
}