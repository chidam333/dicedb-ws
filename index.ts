import { Server } from "socket.io";
import { NewClient, wire, cmd, type Client } from "dicedb-sdk";

//Creating a socket server
const io = new Server(3002, { cors: { origin: "*" } });


// Creating two dicedb client (so that we can watch 2 different keys0)
const { response: client, error } = await NewClient("localhost", 7379);
const { response: client2, error: error2 } = await NewClient("localhost", 7379);
if (!client || error) {
    console.error("Client couldn't be created", { error });
    throw new Error("Client couldn't be created");
}
if (!client2 || error2) {
    console.error("Client2 couldn't be created", { error2 });
    throw new Error("Client2 couldn't be created");
}









// Serving static files client1 and client2
const server = Bun.serve({
    port: 3333,
    fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/client1") {
            return new Response(Bun.file("client1.html"), {
                headers: {
                    "Content-Type": "text/html",
                },
            });
        }
        if (url.pathname === "/client2") {
            return new Response(Bun.file("client2.html"), {
                headers: {
                    "Content-Type": "text/html",
                },
            });
        }
        return new Response("Not Found", { status: 404 });
    },
});

console.log(`Listening on http://localhost:${server.port}`);









async function processIterator(iterator: AsyncIterable<any>) {
    console.log("\x1b[32mIterator processing started\x1b[0m");
    try {
        for await (const item of iterator) {
            console.log("\x1b[32mitem", item, "\x1b[0m");
            io.emit("message", item.value.value);
            // console.log("emitting", item.value);
        }
        console.log("\x1b[32mdone with iterator\x1b[0m");
    } catch (err) {
        console.error("Error processing iterator", err);
    }
}






// socket logic
let serialCounter = 1;
const socketSerialMap = new Map<string, string>();
const socketClientMap = new Map<string, Client>();
io.on("connection", async (socket) => {
    const serialNumber = String(serialCounter++);
    socketSerialMap.set(socket.id, serialNumber);
    socketClientMap.set(socket.id, client);
    if(!client.watchIterator){
        const { response:getWatch, error:getWatchError } = await client.FireString(`GET.WATCH ${serialNumber}`);
        if (getWatchError) {
            return console.error("Error getting watch:", { getWatchError });
        }if (getWatch) {
            console.log("Watch set successfully", serialNumber, getWatch.value);
        }
        const { response: iterator, error: itrError } = await client.WatchChGetter(client);
        if (itrError) {
            return console.error("Error processing commands:", { itrError });
        }
        console.log("Iterator fetched successfully");
        processIterator(iterator);
    }
    else if (!client2.watchIterator){
        const { response:getWatch, error:getWatchError } = await client2.FireString(`GET.WATCH ${serialNumber}`);
        if (getWatchError) {
            return console.error("Error getting watch:", { getWatchError });
        }if (getWatch) {
            console.log("Watch set successfully", serialNumber, getWatch.value);
        }
        const { response: iterator, error: itrError } = await client2.WatchChGetter(client2);
        if (itrError) {
            return console.error("Error processing commands:", { itrError });
        }
        console.log("Iterator fetched successfully");
        processIterator(iterator);

    }
    console.log("Active Users :", socketSerialMap);

    socket.on("disconnect", () => {
        socketSerialMap.delete(socket.id);
        const clientForSocket = socketClientMap.get(socket.id);
        if(clientForSocket){
            clientForSocket.Fire(wire.command({ cmd: cmd.UNWATCH, args: [socketSerialMap.get(socket.id)] }));
            clientForSocket.watchIterator = null
        }
        console.log("A user disconnected, serial", serialNumber);
    });
    socket.on("message", async (msg) => {
        // get the assigned serial number for logging
        const serial = socketSerialMap.get(socket.id) ?? "unknown";
        const { response, error } = await client.Fire(wire.command({ cmd: cmd.SET, args: [serial, `${serial}:${msg}`] }));
        if (error) {
            console.error("Error sending message:", error);
        }
        if (response) {
            console.log(`Message sent by ${serial}:`, response.value);
        }
    });
});
