/* Serenity Beta 4 — consent-aware, manually approved Google Maps trip sharing. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof renderCustomer!=='function')return;
const css=document.createElement('style');
css.textContent='.share-card{border-left:4px solid var(--accent);margin:0}.share-card summary{font-weight:800;font-size:16px;cursor:pointer;padding:5px 0;min-height:36px}.share-card p,.share-card li{font-size:13px;line-height:1.5}.share-card input{display:block;width:100%;margin-top:4px;min-height:44px}.share-card .share-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:10px 0}.share-card .share-warning{padding:8px 9px;border-left:3px solid #d97706;font-size:12px;background:var(--bg)}.share-card .share-message{width:100%;min-height:85px}.share-card .share-status{font-size:12px;color:var(--muted)} .share-card input[type=checkbox]{width:auto;display:inline-block;min-height:0;margin-right:6px}.share-card button:disabled{opacity:.5}.boarding-action{background:#0f766e;color:white;border-color:#0f766e}';
document.head.appendChild(css);
const esc=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const linkValid=value=>{
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password)return false;
  return ['maps.app.goo.gl','www.google.com','maps.google.com','goo.gl'].includes(u.hostname) &&
    (u.hostname==='maps.app.goo.gl'||u.hostname==='maps.google.com'||u.hostname==='goo.gl'&&u.pathname.startsWith('/maps')||u.hostname==='www.google.com'&&u.pathname.startsWith('/maps'));
 }catch{return false;}
};
let draftByRun=null;
const original=renderCustomer;
renderCustomer=function(){
 original();
 const root=document.getElementById('customer-content'),r=db.runs.find(x=>x.id===db.active);
 if(!root||!r)return;
 const person=db.people[norm(r.name)]||{},pref=String(person.preference||'Unknown');
 const pick=root.querySelector('#preference');
 if(pick){
  for(const [value,label] of [['No call','Do not call (no SMS unless separately authorized)'],['No contact','Do not contact by call or text']]){
   if(![...pick.options].some(x=>x.value===value)){
    const op=document.createElement('option');op.value=value;op.textContent=label;pick.append(op);
   }
  }
  pick.value=pref;
 }
 const blocked=['No contact','Do not contact'].includes(pref);
 const textPermitted=['Text','Either'].includes(pref);
 const callOnly=['Call','No call'].includes(pref);
 // Blocking unrelated default macro SMS handoff when customer explicitly declines messages.
 if(blocked||callOnly){
  const copy=root.querySelector('#copy-message');if(copy){copy.disabled=true;copy.title='Passenger contact preference does not authorize texting';}
  root.querySelectorAll('[data-macro]').forEach(b=>{b.disabled=true;b.title='Passenger contact preference does not authorize texting';});
  const voice=root.querySelector('a[href*="voice.google.com"]');
  if(voice){voice.removeAttribute('href');voice.setAttribute('aria-disabled','true');voice.style.opacity='.5';voice.style.pointerEvents='none';}
 }
 const side=root.querySelector('.b3-side')||root;
 const details=document.createElement('details');
 details.className='panel share-card';
 details.id='share-customer';
 const firstName=String(r.name||'').trim().split(/\s+/)[0]||'there';
 const map='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(r.puAddr||'');
 details.innerHTML='<summary>Share live trip location · Google Maps</summary>'+
 '<p>For this passenger only. <strong>Serenity cannot create a Google Maps live-sharing link or send Google Voice messages automatically.</strong></p>'+
 '<div class="share-warning">'+(blocked?'DO NOT CONTACT: This passenger has opted out. Do not send a location link.':callOnly?'This passenger has not authorized SMS. Update their communication preference only if they consent.':!textPermitted?'Text preference is not confirmed. Verify that the passenger wants an SMS location link before sending.':'Text contact is selected. Confirm recipient before sending.')+'</div>'+
 '<ol><li><a href="'+esc(map)+'" target="_blank" rel="noopener">Open navigation in Google Maps</a> and start the trip to this pickup.</li><li>In Google Maps, swipe up and choose <strong>Share trip progress</strong> to share with your intended recipient. This generally ends when navigation ends.</li><li>If Maps gives you a shareable location link, paste it below, prepare the text and send it yourself using LI ResRun Google Voice.</li></ol>'+
 '<label for="share-link">Google Maps location-sharing URL<input id="share-link" type="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Paste Maps sharing link; not saved"></label>'+ '<label style="font-weight:600"><input id="share-verify" type="checkbox">I created and verified a live Google Maps sharing link for this pickup (not an ordinary directions link).</label>'+
 '<div class="share-actions"><button id="share-prepare" type="button" '+(blocked||callOnly?'disabled':'')+'>Prepare link message</button><button id="share-copy" type="button" disabled>Copy approved message</button><a href="https://voice.google.com/messages" target="_blank" rel="noopener noreferrer" id="share-open-voice">Open Google Voice (LI ResRun)</a></div>'+
 '<textarea id="share-message" class="share-message" aria-label="Review location sharing SMS" placeholder="Prepared SMS will appear here" readonly></textarea>'+
 '<p class="share-warning">Never share without customer approval. Google Maps may keep sharing after pickup if using general Location Sharing. Stop sharing manually in Google Maps when done. Confirm LI ResRun account and passenger number before sending.</p>'+
 '<p class="share-status" id="share-status">No location link prepared. No message sent.</p>';
 if(blocked||callOnly){
  const voice=details.querySelector('#share-open-voice');
  voice.removeAttribute('href');voice.setAttribute('aria-disabled','true');voice.style.pointerEvents='none';voice.style.opacity='.5';
 }
 const marker=side.querySelector('.b3-detail');
 if(marker)side.insertBefore(details,marker);else side.append(details);
 if(draftByRun!==r.id)draftByRun=r.id; // Only the run ID, not a sensitive link, is kept in memory.
 const tripControls=root.querySelector('.b3-actions');
 if(tripControls&&!r.events?.boarded && r.status!=='Completed' && r.status!=='Exception'){
  const btn=document.createElement('button');btn.id='mark-boarded';btn.type='button';btn.className='boarding-action';btn.textContent='Passenger boarded';
  tripControls.querySelector('.bar')?.prepend(btn);
 }
 if(r.events?.boarded && tripControls){
  const status=document.createElement('small');status.textContent='Boarded event recorded · '+new Date(r.events.boarded).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  tripControls.append(status);
 }
};
document.addEventListener('click',async event=>{
 const btn=event.target.closest?.('button');
 if(!btn)return;
 if(btn.id==='mark-boarded'){
  event.preventDefault();event.stopImmediatePropagation();
  const run=db.runs.find(x=>x.id===db.active);
  if(!run)return;
  if(!run.events?.arrived)return alert('Mark Arrived first so the recorded pickup timeline is accurate.');
  if(!confirm('Confirm passenger boarded for this assignment?'))return;
  run.events=run.events||{};run.events.boarded=new Date().toISOString();run.status='Onboard';
  save();render();return;
 }
 if(!['share-prepare','share-copy'].includes(btn.id))return;
 event.preventDefault();event.stopImmediatePropagation();
 const run=db.runs.find(x=>x.id===db.active);
 if(!run)return;
 const p=db.people[norm(run.name)]||{},preference=String(p.preference||'Unknown');
 const allowed=['Text','Either'].includes(preference);
 if(['No contact','Do not contact','Call','No call'].includes(preference)){
  alert('This passenger is not opted in to SMS sharing. Do not send a location link.');
  return;
 }
 if(!allowed && !confirm('Passenger texting preference is not confirmed. Have you confirmed they want a location-sharing SMS?'))return;
 const link=document.getElementById('share-link')?.value.trim();
 if(!linkValid(link)){alert('Paste a valid Google Maps HTTPS sharing link.');return;}
 if(!document.getElementById('share-verify')?.checked){alert('Confirm the link is a real Google Maps live-sharing link before preparing a customer message.');return;}
 const rName=String(run.name||'').trim().split(/\s+/)[0]||'there';
 const msg='Hi '+rName+", it's Anthony from Serenity Transportation. You can follow my location as I approach your pickup here: "+link+'. Please use this link only for today’s pickup. Thank you!';
 const message=document.getElementById('share-message');
 message.value=msg;
 document.getElementById('share-copy').disabled=false;
 document.getElementById('share-status').textContent='Message prepared for review. Nothing has been sent.';
 if(btn.id==='share-prepare')return;
 try{await navigator.clipboard.writeText(msg);document.getElementById('share-status').textContent='Copied for manual sending in Google Voice. Confirm LI ResRun and the recipient.';}
 catch{message.removeAttribute('readonly');message.focus();message.select();document.getElementById('share-status').textContent='Clipboard unavailable. Select/copy this message manually. No SMS sent.';}
},true);
})();