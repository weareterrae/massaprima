/* Chef Prima — assistente IA da Massa Prima (widget partilhado, vive em todas as páginas)
   IA: Supabase Edge Function CHEFPRIMAIA · cérebro: prima-prompt.txt (git push = atualizado) */
(function(){
const ENDPOINT='https://qciagsktkqljvknmahfu.supabase.co/functions/v1/CHEFPRIMAIA';
const css=`
#cpx-btn{position:fixed;bottom:22px;right:22px;z-index:9990;display:flex;align-items:center;gap:12px;background:#fff;border:2px solid #EC6607;border-radius:50px;padding:8px 20px 8px 8px;cursor:pointer;box-shadow:0 10px 30px rgba(119,49,10,.28);font-family:'Nunito',sans-serif;transition:transform .15s}
#cpx-btn:hover{transform:translateY(-2px)}
#cpx-btn .av{width:46px;height:46px;border-radius:50%;background:#EC6607;display:flex;align-items:center;justify-content:center;font-size:1.5rem;position:relative;flex:none}
#cpx-btn .av::after{content:'';position:absolute;inset:-5px;border-radius:50%;border:2px solid #EC6607;opacity:0;animation:cpxpulse 2.4s ease-out infinite}
@keyframes cpxpulse{0%{transform:scale(.85);opacity:.7}70%{transform:scale(1.18);opacity:0}100%{opacity:0}}
#cpx-btn .tx{text-align:left;line-height:1.15}
#cpx-btn .tx b{display:block;font-family:'Zilla Slab',serif;color:#77310A;font-size:1.02rem}
#cpx-btn .tx small{color:#8a6a4a;font-size:.72rem;font-weight:700}
@media(max-width:560px){#cpx-btn{padding:8px}#cpx-btn .tx{display:none}}
#cpx-teaser{position:fixed;bottom:96px;right:26px;z-index:9990;background:#77310A;color:#FEEAD3;padding:12px 18px;border-radius:16px 16px 4px 16px;font-family:'Nunito',sans-serif;font-size:.9rem;font-weight:700;max-width:250px;box-shadow:0 10px 26px rgba(0,0,0,.3);cursor:pointer;animation:cpxin .4s ease}
@keyframes cpxin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#cpx-panel{position:fixed;bottom:22px;right:22px;z-index:9995;width:min(392px,calc(100vw - 24px));height:min(600px,calc(100vh - 44px));background:#FFF7EC;border-radius:20px;box-shadow:0 18px 60px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;font-family:'Nunito',sans-serif}
#cpx-panel.on{display:flex}
#cpx-head{background:#EC6607;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:12px;position:relative;overflow:hidden}
#cpx-head::before{content:'';position:absolute;inset:0;opacity:.14;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="216" height="180"><g fill="%23FFFFFF"><ellipse cx="36" cy="34" rx="11" ry="22" transform="rotate(-24 36 34)"/><ellipse cx="112" cy="22" rx="11" ry="22" transform="rotate(-24 112 22)"/><ellipse cx="178" cy="52" rx="11" ry="22" transform="rotate(20 178 52)"/><ellipse cx="64" cy="86" rx="11" ry="22" transform="rotate(30 64 86)"/><ellipse cx="146" cy="108" rx="11" ry="22" transform="rotate(-40 146 108)"/><ellipse cx="22" cy="128" rx="11" ry="22" transform="rotate(-38 22 128)"/><ellipse cx="92" cy="152" rx="11" ry="22" transform="rotate(18 92 152)"/></g></svg>') repeat}
#cpx-head>*{position:relative}
#cpx-head .av{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex:none}
#cpx-head .nm b{font-family:'Zilla Slab',serif;font-size:1.15rem;display:block}
#cpx-head .nm small{font-size:.72rem;font-weight:700;opacity:.95}
#cpx-head .nm small::before{content:'●';color:#7dff9b;margin-right:5px}
#cpx-close{margin-left:auto;background:rgba(255,255,255,.22);border:none;color:#fff;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer}
#cpx-close:hover{background:rgba(255,255,255,.4)}
#cpx-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.cpx-m{max-width:86%;padding:10px 14px;border-radius:14px;font-size:.92rem;line-height:1.45;white-space:pre-wrap}
.cpx-m.bot{background:#FEEAD3;border-bottom-left-radius:4px;align-self:flex-start;color:#3D1A05}
.cpx-m.user{background:#EC6607;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}
#cpx-chips{display:flex;gap:8px;padding:0 14px 10px;flex-wrap:wrap}
#cpx-chips button{background:#fff;border:1.5px solid #e6d3b8;color:#77310A;border-radius:20px;padding:7px 13px;font:inherit;font-size:.78rem;font-weight:800;cursor:pointer}
#cpx-chips button:hover{border-color:#EC6607;color:#EC6607}
#cpx-form{display:flex;border-top:1px solid #eadbc4;background:#fff}
#cpx-form input{flex:1;border:none;padding:15px 16px;font:inherit;font-size:.95rem;background:transparent}
#cpx-form input:focus{outline:none}
#cpx-form button{background:#EC6607;color:#fff;border:none;padding:0 22px;font-weight:800;cursor:pointer;font-size:1.05rem}
#cpx-form button:hover{background:#c9550a}
#cpx-foot{font-size:.66rem;color:#8a6a4a;text-align:center;padding:5px 10px;background:#fff}
`;
const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

// chips contextuais por página
const path=location.pathname;
let CHIPS=['Quero abrir uma padaria, por onde começo?','Que produtos têm para bolos?','Ensina-me a calcular o food cost'];
if(/catalogo/.test(path))CHIPS=['Como uso o Cake Chocolate?','Que mix uso para pão de hambúrguer?','Para que serve o Gorpan?'];
else if(/receitas/.test(path))CHIPS=['Qual destas receitas rende mais para um café?','Adapta a torta de laranja para 40 fatias','Dicas para a vitrine'];
else if(/foodcost/.test(path))CHIPS=['O que são custos indiretos?','Que food cost alvo devo escolher?','Como fixo o preço de uma fatia de bolo?'];

const el=document.createElement('div');
el.innerHTML=`
<button id="cpx-btn" aria-label="Falar com o Chef Prima"><span class="av">🌾</span><span class="tx"><b>Chef Prima</b><small>Dúvidas? Pergunte 24/7</small></span></button>
<div id="cpx-panel" role="dialog" aria-label="Chef Prima">
  <div id="cpx-head"><span class="av">🌾</span><span class="nm"><b>Chef Prima</b><small>mestre padeiro digital · Escola Massa Prima</small></span><button id="cpx-close" aria-label="Fechar">✕</button></div>
  <div id="cpx-msgs"></div>
  <div id="cpx-chips"></div>
  <form id="cpx-form"><input id="cpx-in" placeholder="Escreva a sua pergunta…" autocomplete="off"><button type="submit">➤</button></form>
  <div id="cpx-foot">Assistente com IA — confirme dosagens críticas com a equipa técnica · geral@quenteebom.co.ao</div>
</div>`;
document.body.appendChild(el);

const panel=document.getElementById('cpx-panel'),msgs=document.getElementById('cpx-msgs'),chipsEl=document.getElementById('cpx-chips');
let hist=[];try{hist=JSON.parse(sessionStorage.getItem('cpx-hist')||'[]')}catch(_){ }
function save(){try{sessionStorage.setItem('cpx-hist',JSON.stringify(hist.slice(-24)))}catch(_){ }}
function add(t,c){const d=document.createElement('div');d.className='cpx-m '+c;d.textContent=t;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;return d;}
function chips(){chipsEl.innerHTML='';CHIPS.forEach(q=>{const b=document.createElement('button');b.textContent=q;b.onclick=()=>send(q);chipsEl.appendChild(b);});}
function openPanel(){
  panel.classList.add('on');document.getElementById('cpx-btn').style.display='none';teaserOff();
  if(!msgs.children.length){
    hist.forEach(m=>add(m.content,m.role==='assistant'?'bot':'user'));
    if(!hist.length)add('Olá! Sou o Chef Prima 🌾 o mestre padeiro digital da Massa Prima. Posso ensinar-lhe a usar qualquer produto, dar-lhe receitas passo-a-passo ou ajudar a pôr preço no que produz. Em que posso ajudar?','bot');
    chips();
  }
  document.getElementById('cpx-in').focus();
}
function closePanel(){panel.classList.remove('on');document.getElementById('cpx-btn').style.display='flex';}
document.getElementById('cpx-btn').onclick=openPanel;
document.getElementById('cpx-close').onclick=closePanel;

async function send(q){
  if(!q)return;
  chipsEl.innerHTML='';
  add(q,'user');hist.push({role:'user',content:q});save();
  const t=add('🌾 a pensar…','bot');
  let reply=null;
  try{
    const ctl=new AbortController();const tm=setTimeout(()=>ctl.abort(),25000);
    const r=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:hist.slice(-12)}),signal:ctl.signal});
    clearTimeout(tm);
    if(r.ok){const d=await r.json();if(d.reply)reply=d.reply;}
  }catch(_){}
  if(!reply)reply='Estou com dificuldades de ligação neste momento 🌾 Tente outra vez daqui a pouco, ou escreva-nos para geral@quenteebom.co.ao que a equipa responde em horário de expediente.';
  t.textContent=reply;
  hist.push({role:'assistant',content:reply});save();
}
document.getElementById('cpx-form').onsubmit=e=>{e.preventDefault();const i=document.getElementById('cpx-in');const q=i.value.trim();i.value='';send(q);};

// teaser (1x por sessão)
let teaser=null;
function teaserOff(){if(teaser){teaser.remove();teaser=null;}try{sessionStorage.setItem('cpx-teaser','1')}catch(_){}}
if(!sessionStorage.getItem('cpx-teaser')){
  setTimeout(()=>{ if(panel.classList.contains('on'))return;
    teaser=document.createElement('div');teaser.id='cpx-teaser';teaser.textContent='Olá! Sou o Chef Prima 🌾 Posso ensinar-lhe a usar qualquer produto ou a pôr preço no que produz.';
    teaser.onclick=openPanel;document.body.appendChild(teaser);
    setTimeout(teaserOff,12000);
  },4500);
}
window.ChefPrima={open:openPanel,ask:q=>{openPanel();setTimeout(()=>send(q),300);}};
})();
