import { Bot } from "mineflayer";
import { Task } from "./Task";
import { IndexedData } from "minecraft-data";
import { Behaviours } from "../utils";

export abstract class BotTask<T> implements Task<T> {
    protected bot: Bot;
    protected mcData: IndexedData;
    protected utils: Behaviours;

    constructor(bot: Bot, mcData: IndexedData, utils: Behaviours) {
        this.bot = bot;
        this.mcData = mcData;
        this.utils = utils;
    }
    
    public tick(): void {
        
    }

    public isComplete() {
        return false;
    }

    public result(): T | null {
        return null;
    }
}