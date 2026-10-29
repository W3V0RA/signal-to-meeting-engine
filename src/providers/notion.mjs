export class Notion {
  mode='notion';
  constructor({token,dataSourceId,fetcher=fetch}){this.token=token;this.dataSourceId=dataSourceId;this.fetcher=fetcher;}
  async request(path,method,body,version='2025-09-03') {
    if(!this.token||!this.dataSourceId)throw Error('Notion integration configuration missing');
    const response=await this.fetcher(`https://api.notion.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${this.token}`,'Notion-Version':version,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Notion sync failed (${response.status})`);return response.json();
  }
  async check(){
    const source=await this.request(`data_sources/${this.dataSourceId}`,'GET');
    for(const [name,type]of Object.entries({Name:'title','Engine ID':'rich_text','Engine State':'rich_text','Next Action':'rich_text'}))if(source.properties?.[name]?.type!==type)throw Error(`Notion property mapping invalid: ${name}`);
    return source;
  }
  async savedView(viewId,now=new Date()) {
    if(typeof viewId!=='string'||!viewId.trim()||!Number.isFinite(now.getTime()))throw Error('Saved Notion view configuration invalid');
    const view=encodeURIComponent(viewId),version='2026-03-11',started=Date.now();
    let page=await this.request(`views/${view}/queries`,'POST',{page_size:100},version);
    const query=page.id,total=page.total_count,expires=Date.parse(page.expires_at??'');
    if(!query||page.view_id!==viewId||!Number.isInteger(total)||total<0||total>2000||!Number.isFinite(expires)||expires<=now.getTime())throw Error('Saved Notion view query invalid or expired');
    const ids=new Set(),cursors=new Set();
    while(true){
      if(now.getTime()+Date.now()-started>=expires)throw Error('Saved Notion view query expired during pagination');
      if(!Array.isArray(page.results)||typeof page.has_more!=='boolean'||page.request_status?.type==='incomplete')throw Error('Saved Notion view query incomplete');
      for(const row of page.results){if(!row.id||ids.has(row.id))throw Error('Saved Notion view has duplicate or missing page');ids.add(row.id);if(ids.size>total)throw Error('Saved Notion view count mismatch');}
      if(!page.has_more)break;
      if(!page.next_cursor||cursors.has(page.next_cursor))throw Error('Saved Notion view pagination incomplete');
      cursors.add(page.next_cursor);
      if(cursors.size>2000)throw Error('Saved Notion view pagination limit exceeded');
      page=await this.request(`views/${view}/queries/${encodeURIComponent(query)}?page_size=100&start_cursor=${encodeURIComponent(page.next_cursor)}`,'GET',undefined,version);
    }
    if(ids.size!==total)throw Error('Saved Notion view count mismatch');
    return {ids:[...ids],total};
  }
  async upsert(id,data,existingId) {
    // Only system-owned projection properties are updated. Human copy/approval stays canonical locally.
    const properties={Name:{title:[{text:{content:data.company}}]},'Engine ID':{rich_text:[{text:{content:id}}]},'Engine State':{rich_text:[{text:{content:data.state}}]},'Next Action':{rich_text:[{text:{content:data.nextAction}}]}};
    if(existingId)return this.request(`pages/${existingId}`,'PATCH',{properties});
    const found=await this.request(`data_sources/${this.dataSourceId}/query`,'POST',{filter:{property:'Engine ID',rich_text:{equals:id}},page_size:2});
    if(found.results?.length>1)throw Error('Duplicate projection requires reconciliation');
    if(found.results?.[0])return this.request(`pages/${found.results[0].id}`,'PATCH',{properties});
    return this.request('pages','POST',{parent:{type:'data_source_id',data_source_id:this.dataSourceId},properties});
  }
}
