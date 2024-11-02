import { Bot, createBot } from "mineflayer";

export interface SwarmConfig {
    host: string,
    port: number,
    version: string,
    initCallback: (bot: Bot) => void
}

export class Swarm {
    public static Create(names: string[], config: SwarmConfig) {
        const bots: Bot[] = [];
        names.forEach(name => bots.push(Swarm.InitBot(name, config)));

        return bots;
    }

    private static InitBot(name: string, config: SwarmConfig): Bot {
        const bot = createBot({ ...config, username: name });
        console.log(`Bot ${name} created`);

        bot.once('spawn', config.initCallback.bind(this, bot));
        return bot;
    }
}