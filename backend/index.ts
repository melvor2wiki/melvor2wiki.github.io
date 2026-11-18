// Public write-only intake; no email address, mail endpoint or privileged key is sent to clients.
const SITE = 'https://melvor2wiki.github.io';
const API = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const encoder = new TextEncoder();
const cors = {'Access-Control-Allow-Origin':SITE,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function reply(body:unknown,status=200,extra:Record<string,string>={}) {return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json',...extra}});}
async function rpc(name:string,body:unknown) {
 const r=await fetch(API+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok) throw new Error('Database unavailable');
 const t=await r.text();return t?JSON.parse(t):null;
}
async function hex(data:ArrayBuffer) {return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function tag(ip:string) {
 const k=await crypto.subtle.importKey('raw',encoder.encode(KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',k,encoder.encode('feedback-client:'+ip)));
}
Deno.serve(async (req:Request)=>{
 if(req.headers.get('Origin')!==SITE) return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 if(!(req.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'JSON required'},415);
 try {
  if(Number(req.headers.get('Content-Length')||0)>24000)return reply({error:'Request too large'},413);
  const reader=req.body?.getReader();if(!reader)return reply({error:'Invalid request'},400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return reply({error:'Request too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'Invalid JSON'},400);}
  if(data?.website)return reply({success:true},202);
  if(typeof data?.page!=='string'||typeof data?.suggestion!=='string'||typeof data?.path!=='string')return reply({error:'Invalid fields'},400);
  const page=data.page.trim(),message=data.suggestion.trim(),path=data.path;
  if(!page||page.length>200||message.length<10||message.length>4000||path.length>1800||!path.startsWith('#'))return reply({error:'Invalid fields'},400);
  // Network identifiers are heuristic. Independent global limits remain effective even if a client identifier changes.
  const ip=req.headers.get('cf-connecting-ip')||(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  const client=await tag(ip);
  const dedupe=await hex(await crypto.subtle.digest('SHA-256',encoder.encode(page+'\n'+message)));
  const result=await rpc('feedback_ingest',{p_client:client,p_dedupe:dedupe,p_page:page,p_url:SITE+'/'+path,p_message:message});
  if(!result?.accepted)return reply({error:result?.code||'Unavailable'},result?.code==='rate_limited'?429:400,result?.retry_after?{'Retry-After':String(result.retry_after)}:{});
  // Notifications are scheduled privately by daily-digest.sql; intake only stores feedback.
  return reply({success:true},202);
 }catch{return reply({error:'Temporarily unavailable'},503);}
});
