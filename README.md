# MC-Fren
 A helpful minecraft friend. Built on `Mineflayer` and uses `mineflayer-pathfinder` with some slight modifications.

## Install

- git clone
- npm i
- node .\index.js \<server\> \<port\> \<master\>

eg `node .\index.js localhost 25565 Steve
Master is the name of the account you want to control the bots from

Features:

- 1->N bots, just add or remove the names in the `botNames` array in `index.js`
- Control all bots "`swarm`" or specific bots with their name, for example: `swarm sethome`, `Claude goto home`, `Dennis harvest 3 iron_ore`
- For full list of commands see the big `switch` statement in `individual.js`