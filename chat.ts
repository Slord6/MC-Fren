import { Bot } from "mineflayer";

interface Message {
    bot: Bot;
    message: string;
} 

export class ChatBuffer {
    private chatStack: Message[] = [];
    private messageWaitTime: number;

    constructor(messageWaitTime: number = 2000) {
        this.messageWaitTime = messageWaitTime;
    }

    public start() {
        if (this.chatStack.length > 0) {
            let info = this.chatStack.shift() as Message;
            console.log(`${info.bot.player.username} sending>>>`, info.message);
            info.bot.chat(info.message);
        }
        setTimeout(this.start.bind(this), this.messageWaitTime);
    }

    public addChat(bot: Bot, message: string, directTo: string | null = null) {
        message.split('\n').forEach(message => {
            if (!directTo) {
                this.chatStack.push({ bot, message });
            } else {
                this.chatStack.push({ bot, message: `/msg ${directTo} ` + message });
            }
        });

    }
}