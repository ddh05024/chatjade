// Cloudflare Worker: AI 프록시 + 선톡 스케줄러 + 웹푸시
const PR={openai:['https://api.openai.com/v1/chat/completions','KEY_OPENAI'],deepseek:['https://api.deepseek.com/chat/completions','KEY_DEEPSEEK'],groq:['https://api.groq.com/openai/v1/chat/completions','KEY_GROQ'],gemini:['https://generativelanguage.googleapis.com/v1beta/openai/chat/completions','KEY_GEMINI'],mistral:['https://api.mistral.ai/v1/chat/completions','KEY_MISTRAL'],openrouter:['https://openrouter.ai/api/v1/chat/completions','KEY_OPENROUTER']};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,'Content-Type':'application/json'}});
const WC=c=>c<=0?'맑음':c<=3?'구름 많음':c<=48?'안개':c<=67?'비':c<=77?'눈':c<=82?'소나기':c<=86?'눈보라':'천둥번개';
async function llm(env,provider,model,messages){
  const [u,k]=PR[provider]||[];
  if(!u||!env[k])throw new Error('서버에 '+(k||provider)+' 키가 없어요');
  const r=await fetch(u,{method:'POST',headers:{Authorization:'Bearer '+env[k],'Content-Type':'application/json'},body:JSON.stringify({model,messages,temperature:0.9,max_tokens:300})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error?.message||d[0]?.error?.message||r.status);
  return d.choices[0].message.content;
}
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const enc=s=>new TextEncoder().encode(s);
async function push(env,ep){ // 페이로드 없는 푸시: SW가 /inbox?peek 로 내용을 가져와 표시
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.VAPID_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const h=b64(enc(JSON.stringify({typ:'JWT',alg:'ES256'}))),
  c=b64(enc(JSON.stringify({aud:new URL(ep).origin,exp:Math.floor(Date.now()/1000)+43200,sub:'mailto:'+env.VAPID_EMAIL})));
  const sig=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc(h+'.'+c)));
  await fetch(ep,{method:'POST',headers:{Authorization:`vapid t=${h}.${c}.${sig}, k=${env.VAPID_PUBLIC}`,TTL:'86400'}});
}
export default{
  async fetch(req,env){
    if(req.method==='OPTIONS')return new Response(null,{headers:cors});
    if(req.headers.get('Authorization')!=='Bearer '+env.APP_TOKEN)return J({error:'토큰이 맞지 않아요'},401);
    const u=new URL(req.url),p=u.pathname,kv=env.KV;
    if(p==='/vapid')return J({key:env.VAPID_PUBLIC});
    if(p==='/sync'){await kv.put('state',JSON.stringify(await req.json()));return J({ok:1});}
    if(p==='/inbox'){const q=JSON.parse(await kv.get('inbox')||'[]');if(!u.searchParams.has('peek'))await kv.put('inbox','[]');return J({items:q});}
    if(p==='/chat'){const b=await req.json();try{return J({text:await llm(env,b.provider,b.model,b.messages)});}catch(e){return J({error:e.message},500);}}
    return J({error:'not found'},404);
  },
  async scheduled(e,env){
    const st=JSON.parse(await env.KV.get('state')||'null');
    if(!st?.chars?.length)return;
    const tz=st.tz||'Asia/Seoul',now=new Date();
    const hr=+new Intl.DateTimeFormat('en-GB',{hour:'numeric',hourCycle:'h23',timeZone:tz}).format(now);
    if(hr<8)return; // 심야 제외
    const day=now.toLocaleDateString('sv',{timeZone:tz});
    let m=JSON.parse(await env.KV.get('meta')||'{}');if(m.day!==day)m={day,n:{}};
    const mon=+new Intl.DateTimeFormat('en',{month:'numeric',timeZone:tz}).format(now);
    const season=mon>=3&&mon<=5?'봄':mon<=8&&mon>=6?'여름':mon>=9&&mon<=11?'가을':'겨울';
    let w='알 수 없음';
    if(st.lat!=null){try{const d=await(await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${st.lat}&longitude=${st.lon}&current=temperature_2m,weather_code`)).json();w=`${WC(d.current.weather_code)}, ${Math.round(d.current.temperature_2m)}°C`;}catch{}}
    const when=now.toLocaleString('ko-KR',{timeZone:tz,weekday:'long',hour:'numeric',minute:'numeric'});
    const out=[];
    for(const c of st.chars){
      if(!c.perDay||(m.n[c.id]||0)>=c.perDay||Math.random()>c.perDay/15)continue;
      try{
        const text=await llm(env,c.provider,c.model,[
          {role:'system',content:c.prompt+`\n\n[상황] 지금은 ${when}, 계절은 ${season}, ${st.city||''} 날씨는 ${w}. 이 상황에 어울리게 네가 먼저 상대에게 DM을 보내. 1~2줄, 메신저 말투, 시간·계절·날씨를 자연스럽게 녹여. 최근 대화:\n${(c.recent||[]).join('\n')}`},
          {role:'user',content:'(먼저 말 걸기)'}]);
        out.push({cid:c.id,name:c.name,text:text.trim(),ts:Date.now()});m.n[c.id]=(m.n[c.id]||0)+1;
      }catch{}
    }
    await env.KV.put('meta',JSON.stringify(m));
    if(!out.length)return;
    const q=JSON.parse(await env.KV.get('inbox')||'[]').concat(out).slice(-100);
    await env.KV.put('inbox',JSON.stringify(q));
    if(st.sub?.endpoint)await push(env,st.sub.endpoint).catch(()=>{});
  }
};
