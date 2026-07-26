import { Client } from "@colyseus/sdk";

const client = new Client(process.env.NEXT_PUBLIC_COLYSEUS_URL || "http://localhost:2567");

export default client;