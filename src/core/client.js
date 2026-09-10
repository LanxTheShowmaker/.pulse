import { Client, Collection } from "discord.js";

export class PulseClient extends Client {
    constructor(options) {
        super(options);
        this.services = {};
        this.commands = new Collection();
        this.components = new Collection();
    }
}
//# sourceMappingURL=client.js.map