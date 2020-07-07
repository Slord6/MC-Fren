
const chatStack = [];
const messageWaitTime = 300;

const start = () => {
    if(chatStack.length > 0) {
        let info = chatStack.pop();
        info.bot.chat(info.message);
    }
    setTimeout(start.bind(this), messageWaitTime);
}

const addChat = (bot, message) => {
    chatStack.push({bot, message});
}

module.exports = {
    start,
    addChat
}