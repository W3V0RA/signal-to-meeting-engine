import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
const {directory}=JSON.parse(readFileSync('runtime/latest-demo.json','utf8'));
const report=JSON.parse(readFileSync(join(directory,'report.json'),'utf8'));
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={prospects:'Prospects',drafts:'Drafts Awaiting Review',acceptedByProvider:'Simulated Messages',uncertain:'Uncertain Attempts',replies:'Replies',interests:'Interested Replies',bookings:'Simulated Bookings',cost:'Recorded Cost',deliveryVerified:'Actual Delivery Verified',revenueVerified:'Revenue Verified'};
const server=createServer((req,res)=>{
  if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Signal to Meeting Demo</title><style>body{font:17px system-ui;max-width:1050px;margin:45px auto;padding:20px;background:#f3f5f6;color:#16343b}h1{font-size:38px}small{color:#4f646a}.metrics{display:flex;gap:15px;flex-wrap:wrap}.metric{background:white;padding:24px;border:1px solid #d0dddf;border-radius:8px;min-width:150px}.metric strong{display:block;font-size:36px}pre{white-space:pre-wrap;background:white;padding:28px;border-radius:8px;line-height:1.65}li{margin:10px 0}</style><h1>Signal to Meeting</h1><p>${esc(report.notice)}</p><div class="metrics">${Object.entries(report.metrics).map(([k,v])=>`<div class="metric"><small>${esc(labels[k]??k)}</small><strong>${esc(typeof v==='boolean'?(v?'Yes':'No'):k==='cost'?`$${v}`:v)}</strong></div>`).join('')}</div><h2>Exact message reviewed in simulation</h2><h3>${esc(report.subject)}</h3><pre>${esc(report.body)}</pre><h2>Sequence after reply</h2><ul>${report.followups.map(f=>`<li>Follow-up ${f.ordinal}: ${esc(f.state)} — ${esc(f.dueAt)}</li>`).join('')}</ul><p>${esc(report.learning.caveat)}</p></html>`);
});
server.listen(3400,'127.0.0.1',()=>console.log('Read-only demo dashboard: http://127.0.0.1:3400'));
