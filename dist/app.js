const $=s=>document.querySelector(s), clamp=(n,a,b)=>Math.max(a,Math.min(b,Math.round(n)));
let voice=null;
const words={
  bright:['bright','glassy','shimmer','crystal','bell','metallic','sparkle','luminous'],dark:['dark','dull','deep','mellow','warm','soft'],
  fast:['pluck','plucky','short','percussive','punchy','mallet','sharp'],slow:['slow','pad','evolving','bloom','swell','ambient'],
  harsh:['aggressive','harsh','industrial','distorted','dirty','growl'],airy:['airy','breathy','distant','ethereal','wide'],
  bass:['bass','sub','low','deep'],bell:['bell','chime','metallic','marimba'],ep:['piano','electric piano','ep','keys']
};
function score(text,key){return words[key].reduce((n,w)=>n+(text.includes(w)?1:0),0)}
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function makeVoice(){
  const text=$('#prompt').value.toLowerCase(), variation=+$('#seed').value, r=rng(hash(text)+variation);
  const t={bright:score(text,'bright'),dark:score(text,'dark'),fast:score(text,'fast'),slow:score(text,'slow'),harsh:score(text,'harsh'),airy:score(text,'airy'),bass:score(text,'bass'),bell:score(text,'bell'),ep:score(text,'ep')};
  let algorithm=t.ep?5:t.bell?4:t.bass?15:t.slow?18:t.harsh?7:Math.floor(r()*32);
  const feedback=clamp(1+t.harsh*2+t.bright*.5+r()*2,0,7), transpose=t.bass?12:t.bright>2?27:24;
  const ops=[];
  for(let i=0;i<6;i++){
    const carrier=[0,2,4].includes(i)||algorithm>15&&i===1;
    const attack=clamp(80+t.fast*8-t.slow*13+r()*12,0,99), decay=clamp(38+t.slow*10+t.bell*7+r()*18,0,99);
    const level=clamp((carrier?90:66)+t.bright*(carrier?1:6)-t.dark*4+t.harsh*5+r()*14,0,99);
    let ratios=t.bell?[1,1.41,2,2.82,4.24,7.07]:t.ep?[1,1,2,3,4,6]:t.bass?[.5,1,1,2,3,4]:[1,1.5,2,3,4,5];
    ops.push({rates:[attack,decay,clamp(28+r()*30,0,99),clamp(34+r()*20,0,99)],levels:[99,clamp(35+t.slow*24+r()*25,0,99),clamp(t.slow*48+r()*15,0,99),0],level,ratio:ratios[i],carrier,detune:clamp(7+(r()-.5)*4,0,14),vel:clamp(t.fast*2+t.ep*3+r()*2,0,7)});
  }
  const rawName=(t.bell?'GLASSBLOOM':t.bass?'IRONBASS':t.ep?'VELVET EP':t.slow?'AETHERPAD':'FM VOICE').slice(0,10);
  const current=$('#patchName').value.trim(); if(!voice||current===voice.name) $('#patchName').value=rawName;
  voice={ops,algorithm,feedback,transpose,name:($('#patchName').value||rawName).toUpperCase().slice(0,10),t,
    lfo:{speed:clamp(25+t.airy*13+r()*20,0,99),delay:clamp(t.slow*15+r()*15,0,99),pmd:clamp(t.airy*12+r()*8,0,99),amd:clamp(t.ep*8+r()*5,0,99),sync:0,wave:t.airy?4:0,pms:clamp(t.airy+t.slow,0,7)}};
  render();
}
function render(){
  voice.name=($('#patchName').value||voice.name).toUpperCase().replace(/[^ A-Z0-9!#$%&'()+,-.;=@\[\]^_`{}~]/g,'').slice(0,10);
  $('#patchName').value=voice.name;$('#fileName').textContent=voice.name.trim().replace(/\s+/g,'_')+'.syx';
  $('#algoNum').textContent=String(voice.algorithm+1).padStart(2,'0');$('#feedback').textContent=voice.feedback+' / 7';$('#transpose').textContent=(voice.transpose-24>=0?'+':'')+(voice.transpose-24);
  const traits=[];if(voice.t.bright)traits.push('BRIGHT');if(voice.t.dark)traits.push('DARK');if(voice.t.slow)traits.push('EVOLVING');if(voice.t.fast)traits.push('PERCUSSIVE');if(voice.t.airy)traits.push('AIRY');if(voice.t.harsh)traits.push('EDGY');$('#character').textContent=(traits.slice(0,2).join(' · ')||'BALANCED · DIGITAL');
  $('#operators').innerHTML=voice.ops.map((o,i)=>`<div class="op ${o.carrier?'carrier':''}"><span>OP ${6-i} ${o.carrier?'· C':'· M'}</span><strong>${o.ratio.toFixed(o.ratio%1?2:1)}</strong><small>LVL ${o.level}</small></div>`).join('');drawAlgo();
}
function drawAlgo(){const svg=$('#algoSvg'), colors=['#d6ff4b','#55dce1'];let lines='',nodes='';voice.ops.forEach((o,i)=>{const x=50+i*68,y=o.carrier?112:42;if(!o.carrier){const target=Math.max(0,i-1),tx=50+target*68;lines+=`<path d="M${x} ${y+17} Q${(x+tx)/2} 82 ${tx} 95" fill="none" stroke="#394753" stroke-width="2"/>`}nodes+=`<circle cx="${x}" cy="${y}" r="18" fill="#111821" stroke="${colors[o.carrier?0:1]}"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="${colors[o.carrier?0:1]}" font-family="DM Mono" font-size="11">${6-i}</text>`});svg.innerHTML=lines+nodes}
function syx(){
  voice.name=$('#patchName').value.toUpperCase().padEnd(10).slice(0,10);const d=[];
  voice.ops.forEach(o=>{const coarse=o.ratio<1?0:clamp(Math.floor(o.ratio),1,31),base=coarse||.5,fine=clamp((o.ratio/base-1)*100,0,99);d.push(...o.rates,...o.levels,50,0,0,0,0,0,0,o.vel,o.level,0,coarse,fine,o.detune)});
  d.push(99,70,50,40,99,70,50,0,voice.algorithm,voice.feedback,1,voice.lfo.speed,voice.lfo.delay,voice.lfo.pmd,voice.lfo.amd,voice.lfo.sync,voice.lfo.wave,voice.lfo.pms,voice.transpose,...[...voice.name].map(c=>c.charCodeAt(0)&127));
  const checksum=(128-(d.reduce((a,b)=>a+b,0)&127))&127;return new Uint8Array([0xF0,0x43,0x00,0x01,0x1B,0x00,...d,checksum,0xF7]);
}
$('#generate').onclick=makeVoice;$('#seed').oninput=e=>{$('#seedOut').value=e.target.value};$('#patchName').oninput=()=>voice&&render();
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.prompt;makeVoice()});
$('#download').onclick=()=>{const blob=new Blob([syx()],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=$('#fileName').textContent;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
makeVoice();
