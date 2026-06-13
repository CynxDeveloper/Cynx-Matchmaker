import { createHash } from "crypto";
import { WebSocketServer } from "ws";
import express from "express";
import axios from "axios";

const port = 1111;
const wss = new WebSocketServer({ noServer: true });
const app = express();
app.use(express.json());

let matchmakerState = {
    connectedClients: 0, 
    matchId: "",
    sessionId: "",
    postRequestReceived: false,
    queueOpen: true,
    gameOpen: false,
    players: 0,
};

wss.on('listening', () => {
    console.log(`Matchmaker started listening on port ${port}!`);
});

wss.on('connection', async (ws, req) => {
    if (ws.protocol.toLowerCase().includes("xmpp")) {
        return ws.close();
    }

    const clientIp = req.socket.remoteAddress;
    matchmakerState.connectedClients++;

    const ticketId = createHash('md5').update(`1${Date.now()}`).digest('hex');
    const matchId = createHash('md5').update(`2${Date.now()}`).digest('hex');
    const sessionId = createHash('md5').update(`3${Date.now()}`).digest('hex');

    setTimeout(() => logAndExecute(Connecting), 20);
    setTimeout(() => logAndExecute(Waiting), 40);
    setTimeout(() => logAndExecute(Queued), 60);
    setTimeout(() => logAndExecute(SessionAssignment), 80);

    async function Connecting() {
        ws.send(JSON.stringify({
            "payload": {
                "state": "Connecting"
            },
            "name": "StatusUpdate"
        }));
        console.log(`[${clientIp}] Sent StatusUpdate: Connecting`);
    }

    async function Waiting() {
        ws.send(JSON.stringify({
            "payload": {
                "totalPlayers": 1,
                "connectedPlayers": matchmakerState.connectedClients,
                "state": "Waiting"
            },
            "name": "StatusUpdate"
        }));
        console.log(`[${clientIp}] Sent StatusUpdate: Waiting`);
    }

    async function Queued() {
        if (matchmakerState.queueOpen) {
            const queuedPlayers = matchmakerState.connectedClients;
            const estimatedWaitSec = queuedPlayers * 5;
            const status = queuedPlayers === 0 ? 5 : 6;
            const refresh = queuedPlayers > 0;

            ws.send(JSON.stringify({
                "payload": {
                    "ticketId": ticketId,
                    "queuedPlayers": queuedPlayers,
                    "estimatedWaitSec": estimatedWaitSec,
                    "status": status,
                    "state": "Queued"
                },
                "name": "StatusUpdate"
            }));
            if (refresh) {
                setTimeout(() => logAndExecute(Queued), 1800);
            }
        } else {
            console.log(`[${clientIp}] Queue closed. Ignoring StatusUpdate: Queued`);
        }
    }

    async function SessionAssignment() {
        while (!matchmakerState.gameOpen) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        ws.send(JSON.stringify({
            "payload": {
                "matchId": matchId,
                "state": "SessionAssignment"
            },
            "name": "StatusUpdate"
        }));

        setTimeout(() => logAndExecute(Join), 20);
    }

    async function Join() {
        if (matchmakerState.gameOpen) {
            ws.send(JSON.stringify({
                "payload": {
                    "matchId": matchId,
                    "sessionId": sessionId,
                    "joinDelaySec": 3
                },
                "name": "Play"
            }));
            console.log(`[${clientIp}] Sent Play message`);
        } else {
            console.log(`[${clientIp}] Queue closed. Ignoring Join message`);
        }
    }

    async function logAndExecute(callback) {
        callback();
    }

    ws.on('close', () => {
        matchmakerState.connectedClients--;
    });
});

const server = app.listen(port, () => {
    console.log(`Matchmaker listening on port ${port}, made by Cynx.`);
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});

app.post('/started', (req, res) => {
    if (!matchmakerState.gameOpen) {
        console.log(`[POST /started] Game server ready. Closing queue and putting use in game.`);
        matchmakerState.queueOpen = false;
        matchmakerState.gameOpen = true;

        setTimeout(() => {
            matchmakerState.queueOpen = true;
            matchmakerState.gameOpen = false;
            console.log("Restarted successfully. Queue reopened.");
        }, 400);

        res.json({ success: true });
    } else {
        res.json({ error: 'Game already started', success: false });
    }
});

