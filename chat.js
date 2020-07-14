
const chatStack = [];
const messageWaitTime = 2000;

const start = () => {
    if(chatStack.length > 0) {
        let info = chatStack.shift();
        info.bot.chat(info.message);
    }
    setTimeout(start.bind(this), messageWaitTime);
}

const addChat = (bot, message, directTo) => {
    message.split('\n').forEach(message => {
        if(!directTo) {
            chatStack.push({bot, message});
        } else {
            chatStack.push({bot, message: `/msg ${directTo} ` + message});
        }
    });
    
}

module.exports = {
    start,
    addChat
}