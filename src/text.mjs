export function decodeEntities(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>{const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';})
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[name.toLowerCase()]));
}
export function protectedAddress(hex) {
  if(!/^(?:[\da-f]{2}){4,}$/i.test(hex))return '';
  const bytes=Buffer.from(hex,'hex'),key=bytes[0];
  return Buffer.from(bytes.subarray(1).map(n=>n^key)).toString('utf8');
}
export function htmlText(html,{contactRoutes=false}={}) {
  let text=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  if(contactRoutes)text=text.replace(/<[^>]+data-cfemail=["']([\da-f]+)["'][^>]*>/gi,(tag,hex)=>`${tag} ${protectedAddress(hex)} `)
    .replace(/<[^>]+href=["']mailto:([^"'?]+)(?:\?[^"']*)?["'][^>]*>/gi,(tag,route)=>{try{return `${tag} ${decodeURIComponent(route)} `;}catch{return tag;}});
  return decodeEntities(text.replace(/<(?:br|\/p|\/div|\/li|\/tr)[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
}
export function currentReply(text) {
  const lines=text.replace(/\r\n/g,'\n').split('\n'),kept=[];
  for(const line of lines) {
    if(/^On .{4,}wrote:\s*$/i.test(line)||/^-{2,}\s*(original|forwarded) message\s*-{2,}/i.test(line)||/^From:\s*.+@/i.test(line))break;
    if(!/^\s*>/.test(line))kept.push(line);
  }
  return kept.join('\n').trim();
}
export function headersOf(payload){return Object.fromEntries((payload.headers??[]).map(h=>[h.name.toLowerCase(),h.value]));}
export function decodeHeader(value='') {
  return value.replace(/=\?utf-8\?([bq])\?([^?]+)\?=/gi,(_,mode,text)=>mode.toLowerCase()==='b'?Buffer.from(text,'base64').toString('utf8'):Buffer.from(text.replace(/_/g,' ').replace(/=([\da-f]{2})/gi,(_x,code)=>String.fromCharCode(parseInt(code,16))),'binary').toString('utf8'));
}
export function addressFrom(value) {return value?.match(/(?:<)?([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:>)?/)?.[1]?.toLowerCase()??null;}
export function mimePart(payload,type) {
  const own=payload.mimeType===type&&payload.body?.data?Buffer.from(payload.body.data,'base64url').toString('utf8'):'';
  return [own,...(payload.parts??[]).map(p=>mimePart(p,type))].filter(Boolean).join('\n');
}
export function messageText(payload) {
  const plain=mimePart(payload,'text/plain');
  const html=mimePart(payload,'text/html').replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,'').split(/<div\b[^>]*class=["'][^"']*gmail_quote[^"']*["']/i)[0];
  return currentReply(plain||htmlText(html));
}
