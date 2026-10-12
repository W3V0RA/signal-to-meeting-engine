export class Notion {
  mode='notion';
  constructor({token,dataSourceId,fetcher=fetch}){this.token=token;this.dataSourceId=dataSourceId;this.fetcher=fetcher;}
  async request(path,method,body) {
    if(!this.token||!this.dataSourceId)throw Error('Notion integration configuration missing');
    const response=await this.fetcher(`https://api.notion.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${this.token}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Notion sync failed (${response.status})`);return response.json();
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
