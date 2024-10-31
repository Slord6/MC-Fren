# MC-Fren
 A helpful minecraft friend. Built on [Mineflayer](https://github.com/PrismarineJS/mineflayer) and uses [Mineflayer-pathfinder](https://github.com/Karang/mineflayer-pathfinder) for pathing.

## Install

- git clone
- npm i
- npx tsc
- node .\index.js \<server\> \<port\> \<password> \<master\>

`master` is the name of the account you want to control the bots from. `password` is the password used in `/login` and `/register` commands to join most 'cracked' servers (ie. the ones without online mode on)
example:

`node .\index.js localhost 25565 ABdaeufy785 Steve`

Features:

- 1->N bots, just add or remove the names in the `botNames` array in `index.js`
- Control all bots with "`swarm`" or specific bots with their name, for example: "`swarm sethome`", "`Claude goto home`", "`Dennis harvest 3 iron_ore`"
- Bots will defend themselves and other nearby bots and friendly players when they take damage
- For full list of commands see the big `switch` statement in `individual.js`