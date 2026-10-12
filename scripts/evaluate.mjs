import assert from 'node:assert/strict';
import { fixture } from '../tests/helpers.mjs';
const cases=[
  {name:'verified company and shared route',expected:true,mutate:()=>{}},
  {name:'missing headcount with zero score',expected:true,mutate:s=>{s.prospect.headcount=null;s.prospect.score=0;}},
  {name:'hypothesis disguised as fact',expected:false,mutate:s=>{s.prospect.claims[0].type='hypothesis';}},
  {name:'guessed contact route',expected:false,mutate:s=>{s.prospect.contact.email='guessed@example.com';}},
  {name:'wrong company source',expected:false,mutate:s=>{s.prospect.claims[0].sourceUrl='https://example.org/news';}},
  {name:'altered evidence',expected:false,mutate:s=>{s.pages[0].text='altered';}}
];
const results=cases.map(c=>{const f=fixture();c.mutate(f.s);const passed=f.engine.research(f.s.prospect,f.s.pages).gaps.length===0;assert.equal(passed,c.expected,c.name);f.store.close();return {case:c.name,expected:c.expected,actual:passed};});
console.log(JSON.stringify({notice:'Synthetic regression evaluation; no performance or training claim',cases:results.length,correct:results.length,results},null,2));
