import { snapshot } from '../src/evidence.mjs';
export function scenario(now=new Date('2026-10-12T15:00:00Z')) {
  const fact='Example Schedule Co publishes live schedule updates for its customer service team.';
  const prospect={id:'fictional-prospect',companyName:'Example Schedule Co',domain:'example.com',businessVerified:true,headcount:null,score:0,market:'Example Region',offerId:'workflow-review',
    claims:[{id:'schedule',type:'fact',text:fact,sourceUrl:'https://example.com/news'}],
    contact:{name:'Morgan Lee',role:'Operations Director',email:'office@example.com',routeType:'shared',routeSource:'https://example.com/contact',personSource:'https://example.com/team',personQuote:'Morgan Lee is the Operations Director'}};
  const pages=[snapshot('https://example.com/news',fact,now),snapshot('https://example.com/contact','Business inquiries: office@example.com',now),snapshot('https://example.com/team',prospect.contact.personQuote,now)];
  const draft={id:'fictional-initial',kind:'initial',prospectId:prospect.id,subject:'Reviewing Job Status For Customer Updates',sections:[
    {type:'possibility',text:'A checked job status could become a customer-ready update for your team to review before sharing it.'},
    {type:'fact',claimId:'schedule',text:fact},
    {type:'possibility',text:'I could explore one small handoff using the information already published, with your team approving every date and commitment before anything goes out.'},
    {type:'question',text:'Would a proposed update based on one job be useful?'}]};
  return {prospect,pages,draft};
}
