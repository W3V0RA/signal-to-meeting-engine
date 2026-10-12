import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
const forbidden=()=>{throw Error('Real network access forbidden during isolated tests');};
globalThis.fetch=forbidden;
https.get=forbidden;https.request=forbidden;http.get=forbidden;http.request=forbidden;
dns.lookup=forbidden;dns.promises.lookup=forbidden;
syncBuiltinESMExports();
