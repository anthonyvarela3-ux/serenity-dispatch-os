(() => {
  'use strict';
  const KEY=STORE+'_pickup_reminders_v1';
  let ledger={};
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&typeof saved==='object'&&!Array.isArray(saved))ledger=saved;}catch{}
  let notice=null,lastAnnouncement='';
  const keyFor=t=>JSON.stringify([state.serviceDate||localServiceDate(),t.id,t.who]);
  const save=()=>{try{
    const entries=Object.entries(ledger).sort((a,b)=>(b[1]?.recordedAt||0)-(a[1]?.recordedAt||0)).slice(0,150);
    ledger=Object.fromEntries(entries);localStorage.setItem(KEY,JSON.stringify(ledger));
  }catch{}};
  function candidate(projected,now){
    if(!usesDeviceTime()||previewingServiceDay()||(state.serviceDate&&state.serviceDate!==localServiceDate())||document.visibilityState==='hidden')return null;
    if(state.trips.some(t=>!t.outcome&&t.status>=3&&t.status<6))return null;
    const driving=state.trips.filter(t=>!t.outcome&&t.status===1);
    if(driving.length!==1)return null;
    const trip=driving[0],p=projected[trip.id];
    if(!p||p.conflict||p.orderPending||!Number.isFinite(p.pickup))return null;
    const remaining=Math.ceil(p.pickup-now);
    if(remaining<0||remaining>10)return null;
    const key=keyFor(trip),record=ledger[key];
    if(record&&record.status!=='due')return null;
    return {trip,p,remaining,key,type:remaining===0?'onway':remaining<5?'nearby':'10'};
  }
  function tick(projected=project(),now=currentTime()){
    const next=candidate(projected,now),panel=$('pickupReminder');
    notice=next;panel.hidden=!next;
    if(!next){lastAnnouncement='';return;}
    if(!ledger[next.key]){
      ledger[next.key]={status:'due',recordedAt:Date.now(),tripId:next.trip.id};save();
    }
    const title=next.trip.who+' · '+(next.remaining===0?'Pickup ETA reached':next.remaining+' min to pickup');
    // Do not repeatedly announce the same minute or steal focus from notes.
    if(title!==lastAnnouncement){$('pickupReminderTitle').textContent=title;lastAnnouncement=title;}
    $('pickupReminderDetail').textContent='Pickup heads-up ready · ETA '+fmt(next.p.pickup)+(next.p.pickupRough?' · Rough estimate':'')+'. Prepare a pickup text?';
  }
  function handle(status){
    if(!notice)return;
    ledger[notice.key]={...ledger[notice.key],status,handledAt:Date.now()};save();
    $('pickupReminder').hidden=true;
  }
  function review(){
    // Recheck the current status/ETA at the click, rather than using an old banner.
    const current=candidate(project(),currentTime());
    if(!current){tick();return;}
    notice=current;
    const trip=current.trip,body=messageFor(trip,current.type),phone=messagePhone(trip.phone);
    const link=smsDraftUrl(phone,body,appleSmsDevice());
    handle('reviewed');
    modal('Pickup message · '+trip.who,
      '<p>Estimated arrival '+fmt(current.p.pickup)+(current.p.pickupRough?' · Rough estimate':'')+'.</p>'+
      '<label for="pickupReminderDraft">Message preview</label><textarea id="pickupReminderDraft" rows="5" readonly>'+esc(body)+'</textarea>'+
      '<p class="small">'+(phone?'Recipient · '+esc(trip.who)+' · '+esc(phone):'Save a verified phone number in Customer to open SMS, or choose the contact in Google Voice.')+'</p>'+
      '<p class="small muted">This prepares a draft. You send it from your messaging app.</p><p id="pickupReminderFeedback" role="status"></p>',
      '<a class="btn primary" id="pickupReminderSms" '+(link?'href="'+esc(link)+'"':'aria-disabled="true"')+'>Open SMS Draft</a>'+
      '<button class="btn" id="pickupReminderVoice">Copy &amp; Open Google Voice</button>'+
      '<button class="btn" id="pickupReminderCopy">Copy Message</button><button class="btn" id="closeModal">Close</button>');
    $('pickupReminderSms').onclick=event=>{
      if(!phone){event.preventDefault();$('pickupReminderFeedback').textContent='Save a verified phone number first.';return;}
      $('pickupReminderFeedback').textContent='Opening a draft. Delivery is not confirmed by Serenity.';
    };
    $('pickupReminderCopy').onclick=async()=>{
      const copied=await copyMessageText(body);
      $('pickupReminderFeedback').textContent=copied?'Message copied.':'Select and copy the message from the preview.';
    };
    $('pickupReminderVoice').onclick=async()=>{
      window.open('https://voice.google.com/messages','_blank','noopener,noreferrer');
      const copied=await copyMessageText(body);
      $('pickupReminderFeedback').textContent=copied?'Message copied. Choose the recipient in Google Voice and paste.':'Choose the recipient in Google Voice, then copy the message from this preview.';
    };
  }
  $('pickupReminderReview').onclick=review;
  $('pickupReminderDismiss').onclick=()=>{handle('dismissed');notice=null;};
  pickupReminderController={tick,prepared(trip,type){
    if(!trip||type!=='10'||trip.status!==1||trip.outcome||previewingServiceDay()||(state.serviceDate&&state.serviceDate!==localServiceDate()))return;
    const key=keyFor(trip);
    ledger[key]={status:'reviewed',tripId:trip.id,recordedAt:Date.now(),handledAt:Date.now()};save();
    if(notice?.key===key){notice=null;$('pickupReminder').hidden=true;}
  }};
  tick();
})();
