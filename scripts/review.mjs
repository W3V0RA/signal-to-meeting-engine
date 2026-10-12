import { readFileSync } from 'node:fs';
import { openEngine } from '../src/bootstrap.mjs';
import { writingGaps } from '../src/writing.mjs';
const path=process.argv.find(x=>x.startsWith('--input='))?.slice(8);
if(!path)throw Error('Usage: npm run review -- --input=runtime/review.json; see docs/SETUP.md');
const input=JSON.parse(readFileSync(path,'utf8')),engine=openEngine();
try {
  const result=engine.research(input.prospect,input.pages);
  const m=engine.draft(input.draft),copyGaps=writingGaps(m,input.prospect,engine.config,engine.store.list('message'));
  console.log(JSON.stringify({status:'review_only',notice:'Stored locally, unapproved, unreleased. No provider call or message sent.',researchGaps:result.gaps,copyGaps,priority:result.priority,subject:m.subject,body:m.body},null,2));
}finally{engine.store.close();}
