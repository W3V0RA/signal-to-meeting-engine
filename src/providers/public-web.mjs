import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { snapshot } from '../evidence.mjs';
import { htmlText } from '../text.mjs';
import { hash } from '../config.mjs';
export function publicIPv4(address) {
  if(isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0);
}
export function allowedUrl(url,allowedHosts) {
  const u=new URL(url);
  if(u.protocol!=='https:'||u.port||u.username||u.password||!allowedHosts.includes(u.hostname)||isIP(u.hostname))throw Error('Source URL outside public allowlist');
  return u;
}
export class PublicWeb {
  constructor({allowedHosts,resolve=lookup,request=https.get,maxBytes=1000000}){this.allowedHosts=allowedHosts;this.resolve=resolve;this.request=request;this.maxBytes=maxBytes;}
  async fetch(url,now=new Date()) {
    const u=allowedUrl(url,this.allowedHosts),records=await this.resolve(u.hostname,{all:true,family:4});
    if(!records.length||records.some(r=>!publicIPv4(r.address)))throw Error('Private or reserved source address');
    const pinned=records[0].address;
    const text=await new Promise((resolve,reject)=>{
      const req=this.request(u,{lookup:(hostname,options,cb)=>cb(null,options?.all?[{address:pinned,family:4}]:pinned,4),headers:{'User-Agent':'SignalResearch/0.1'}},res=>{
        if(res.statusCode!==200){res.resume();reject(Error('Source HTTP failure or redirect; review final URL explicitly'));return;}
        let total=0;const chunks=[];
        res.on('data',c=>{total+=c.length;if(total>this.maxBytes){req.destroy(Error('Source too large'));return;}chunks.push(c);});
        res.on('error',reject);res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
      });req.setTimeout(10000,()=>req.destroy(Error('Source timeout')));req.on('error',reject);
    });
    // Preserve a digest of captured text. This bounded extractor does not infer claims from HTML.
    const normalized=htmlText(text,{contactRoutes:true}).replace(/\s+/g,' ').trim();
    const links=[...text.matchAll(/href=["']([^"'#]+)["']/gi)].flatMap(match=>{try{const u=new URL(match[1],url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?[u.origin+u.pathname]:[];}catch{return [];}});
    return {...snapshot(url,normalized,now,'public-web'),rawDigest:hash(text),links:[...new Set(links)]};
  }
  async discover(sources,now){return Promise.all(sources.map(url=>this.fetch(url,now)));}
}
