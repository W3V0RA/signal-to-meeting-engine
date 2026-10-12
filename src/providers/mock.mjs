import { randomUUID } from 'node:crypto';
export class MockMail {
  mode='mock';sent=[];priorThreads=[];events=[];fail=false;
  constructor(business){this.business=business;}
  async identity(){return {sender:this.business.sender,replyTo:this.business.replyTo};}
  async inspect(recipient,threadId){return {priorThreads:this.priorThreads,inbound:this.events.filter(e=>e.recipient===recipient&&e.threadId===threadId)};}
  async send(message){if(this.fail)throw Error('Simulated timeout');const result={id:randomUUID(),threadId:message.threadId??randomUUID(),rfcId:`<${randomUUID()}@example.org>`};this.sent.push({...message,...result});return result;}
}
export class MockDiscovery {
  constructor(candidates,pages){this.candidates=candidates;this.pages=pages;}
  async discover(){return structuredClone(this.candidates);}
  async fetch(url){const page=this.pages.find(p=>p.url===url);if(!page)throw Error('Offline source missing');return structuredClone(page);}
}
export class MockNotion {
  mode='mock';pages=new Map();
  async upsert(id,data){this.pages.set(id,structuredClone(data));return {id:`mock:${id}`};}
}
