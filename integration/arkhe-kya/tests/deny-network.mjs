// Offline test boundary: no sockets, HTTP requests or fetch.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const denied = () => { throw new Error('network access forbidden in offline verification test'); };
http.request = http.get = https.request = https.get = denied;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = denied;
globalThis.fetch = denied;
syncBuiltinESMExports();
