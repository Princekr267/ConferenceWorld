/**
 * Yjs WebSocket Server for Collaborative Notepad (Manual Implementation)
 */

import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

const PORT = process.env.YJS_PORT || 1234;
const docs = new Map();
const wss = new WebSocketServer({ port: PORT });

const getYDoc = (roomName) => {
    if (!docs.has(roomName)) {
        const doc = new Y.Doc();
        docs.set(roomName, doc);
    }
    return docs.get(roomName);
};

wss.on('connection', (ws, req) => {
    const roomName = req.url?.slice(1) || 'default';
    const doc = getYDoc(roomName);
    
    console.log(`[Yjs] Client connected to room: ${roomName}`);
    
    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // Message type: sync step 1
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));
    
    const messageHandler = (message) => {
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);
        
        if (messageType === 0) {
            syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
        }
    };
    
    ws.on('message', messageHandler);
    ws.on('close', () => console.log(`[Yjs] Client disconnected from room: ${roomName}`));
    ws.on('error', (error) => console.error(`[Yjs] Error:`, error.message));
});

console.log(`[Yjs] WebSocket server running on port ${PORT}`);
