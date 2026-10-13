import { hash } from './config.mjs';

export async function watchSources(engine,provider) {
  const now=engine.clock();let changed=0;
  for(const url of engine.config.discovery.sources) {
    const page=await provider.fetch(url,now),id=hash(url),prior=engine.store.get('sourceWatch',id);
    if(!page||page.url!==url||page.digest!==hash(page.text))throw Error('Source capture mismatch');
    const isChanged=prior&&prior.digest!==page.digest;
    engine.store.put('sourceWatch',id,{...page,previousDigest:prior?.digest??null,changed:!!isChanged});
    if(!prior||isChanged) {
      changed++;engine.store.put('researchWork',`${id}:${page.digest}`,{id:`${id}:${page.digest}`,url,sourceHash:page.digest,state:'needs_review',observedAt:now.toISOString(),text:page.text.slice(0,20000),candidateDomains:[...new Set((page.links??[]).map(link=>new URL(link).hostname))]});
      engine.store.audit(isChanged?'source_changed':'source_discovered',id,now,{url,digest:page.digest});
      for(const candidate of sourceCandidates(page)) {
        const priorCandidate=engine.store.get('discoveryCandidate',candidate.id);
        if(!priorCandidate)engine.store.put('discoveryCandidate',candidate.id,{...candidate,observedAt:now.toISOString(),state:'needs_business_review'});
      }
    }
  }
  return {changed,watched:engine.config.discovery.sources.length};
}

export function sourceCandidates(page) {
  const sourceDomain=new URL(page.url).hostname;
  return [...new Map((page.links??[]).flatMap(link=>{
    try{const url=new URL(link);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname===sourceDomain)return [];
      return [[url.hostname,{id:`candidate:${hash(url.hostname)}`,domain:url.hostname,website:url.origin,discoveredFrom:page.url,sourceHash:page.digest,verified:false}]];
    }catch{return [];}
  })).values()];
}

export async function refreshProspectSources(engine,prospectId,provider) {
  const p=engine.store.get('prospect',prospectId);if(!p)throw Error('Unknown prospect');
  const urls=[...new Set([...(p.claims??[]).map(c=>c.sourceUrl),p.contact?.routeSource,p.contact?.personSource].filter(Boolean))];
  const pages=await Promise.all(urls.map(url=>provider.fetch(url,engine.clock())));
  return engine.research(p,pages);
}
