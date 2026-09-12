import { Client } from "discord.js";

export class PulseClient extends Client {
    commands = new Map();
    components = new Map();
    services = {};
}
