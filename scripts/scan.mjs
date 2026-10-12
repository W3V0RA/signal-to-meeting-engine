import { execFileSync } from 'node:child_process';
import { readFileSync,readdirSync } from 'node:fs';
import { join,relative } from 'node:path';
const root=process.cwd(),staged=process.argv.includes('--staged');
function fallback(dir){return readdirSync(dir,{withFileTypes:true}).filter(e=>!['.git','node_modules','runtime','work'].includes(e.name)).flatMap(e=>e.isDirectory()?fallback(join(dir,e.name)):[relative(root,join(dir,e.name)).replaceAll('\\','/')]);}
let paths;
try{paths=execFileSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR']:['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/).filter(Boolean);}catch{if(staged)throw Error('Staged scan requires Git');paths=fallback(root);}
const checks=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|sk-[A-Za-z0-9]{24,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
  ['OAuth artifact',/"(?:refresh_token|access_token|client_secret)"\s*:\s*"(?!mock)[^"\s]{20,}"/],
  ['cloud JWT',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/]
];
const failures=[];
for(const path of [...new Set(paths)]) {
  if(/(?:^|\/)(?:\.env(?:\..*)?|credentials.*|token.*\.json|.*\.(?:sqlite|db|pem)|runtime|node_modules)(?:\/|$)/.test(path)&&!path.endsWith('.env.example')){failures.push(`${path}: prohibited artifact`);continue;}
  const content=staged?execFileSync('git',['show',`:${path}`],{encoding:'utf8'}):readFileSync(path,'utf8');
  if(content.includes('\0')){failures.push(`${path}: unexpected binary`);continue;}
  for(const [name,re]of checks)if(re.test(content))failures.push(`${path}: ${name}`);
  for(const address of content.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)??[])if(!/@example\.(com|org)$/.test(address))failures.push(`${path}: non-fictional email`);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`PASS: reviewed ${paths.length} ${staged?'staged':'project'} text files; no prohibited artifacts, secret patterns or non-fictional email addresses. This heuristic is not a guarantee; manual review remains required.`);
