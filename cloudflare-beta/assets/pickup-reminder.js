(() => {
  'use strict';
  const KEY=STORE+'_pickup_reminders_v1';
  let ledger={};
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved&&typeof saved==='object'&&!Array.isArray(saved))ledger=saved;}catch{}
  let notice=null,lastAnnouncement='',draftView=null;
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
    $('pickupReminderDetail').textContent='Pickup text ready to review · ETA '+fmt(next.p.pickup)+(next.p.pickupRough?' · Rough estimate':'')+'.';
    if(canShowDraft()&&!ledger[next.key].prompted)showDraft(next);
  }
  function canShowDraft(){
    return appleSmsDevice()&&$('modalRoot').hidden&&!activePointers.size&&
      !document.querySelector('dialog[open]')&&
      !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
  }
  function handle(current,status){
    if(!current)return;
    ledger[current.key]={...ledger[current.key],status,handledAt:Date.now()};save();
    if(notice?.key===current.key){notice=null;$('pickupReminder').hidden=true;}
  }
  function showingDraft(){
    return draftView&&!$('modalRoot').hidden&&$('pickupReminderDraft')===draftView.text;
  }
  function updateDraft(){
    const view=draftView;
    const latest=candidate(project(),currentTime());
    const valid=latest?.key===view.key;
    const body=valid?messageFor(latest.trip,latest.type,undefined,true):'';
    const phone=valid?messagePhone(latest.trip.phone):null;
    const changed=view.text.value!==body||view.phone!==phone;
    view.text.value=body;
    view.phone=phone;
    view.eta.textContent=valid?'Estimated arrival '+fmt(latest.p.pickup)+(latest.p.pickupRough?' · Rough estimate':'')+'.':
      'This pickup text is no longer due.';
    view.recipient.textContent=valid?'To '+(latest.trip.riderName?.trim()||latest.trip.who)+(phone?' · '+phone:' · Select the contact in Google Messages'):'';
    const link=smsDraftUrl(phone,body,view.useMessagesWeb);
    view.sms.setAttribute('aria-disabled',String(!link));
    if(link)view.sms.setAttribute('href',link);else view.sms.removeAttribute('href');
    view.web.setAttribute('aria-disabled',String(!valid));
    view.voice.disabled=!valid;view.copy.disabled=!valid;
    return {latest:valid?latest:null,changed};
  }
  function showDraft(current){
    ledger[current.key]={...ledger[current.key],prompted:true};save();
    const useMessagesWeb=appleSmsDevice();
    modal('Ready to send a pickup text?',
      '<p class="small" id="pickupReminderRecipient"></p><p id="pickupReminderEta"></p>'+
      '<label for="pickupReminderDraft">Message preview</label><textarea id="pickupReminderDraft" rows="5" readonly></textarea>'+
      '<p class="small muted">'+(useMessagesWeb?'In Google Messages, select the recipient, paste the draft and tap Send.':'Review and send the draft from your messaging app.')+'</p><p id="pickupReminderFeedback" role="status"></p>',
      '<a class="btn'+(useMessagesWeb?' primary':'')+'" id="pickupReminderMessagesWeb" href="https://messages.google.com/web/" target="_blank" rel="noopener noreferrer">Copy &amp; Open Google Messages</a>'+
      '<a class="btn'+(useMessagesWeb?'':' primary')+'" id="pickupReminderSms">Open SMS Draft</a>'+
      '<button class="btn" id="pickupReminderVoice">Copy &amp; Open Google Voice</button>'+
      '<button class="btn" id="pickupReminderCopy">Copy Message</button><button class="btn" id="closeModal">Later</button>'+
      '<button class="btn" id="pickupReminderSkip">Skip This Pickup</button>');
    const view=draftView={key:current.key,useMessagesWeb,text:$('pickupReminderDraft'),eta:$('pickupReminderEta'),
      recipient:$('pickupReminderRecipient'),sms:$('pickupReminderSms'),web:$('pickupReminderMessagesWeb'),
      voice:$('pickupReminderVoice'),copy:$('pickupReminderCopy'),feedback:$('pickupReminderFeedback'),phone:null,handled:false};
    updateDraft();
    function ready(event){
      if(view.handled){event?.preventDefault();return null;}
      const {latest,changed}=updateDraft();
      if(!latest||changed){
        event?.preventDefault();
        view.feedback.textContent=latest?'The draft just updated. Review it before continuing.':view.eta.textContent;
        return null;
      }
      return latest;
    }
    function finish(latest){
      view.handled=true;handle(latest,'reviewed');
    }
    view.web.onclick=async event=>{
      const latest=ready(event);
      if(!latest)return;
      if(await copyForGoogleMessages(view.text.value,view.feedback))finish(latest);
    };
    view.sms.onclick=event=>{
      const latest=ready(event);
      if(!latest)return;
      if(!view.phone){event.preventDefault();return;}
      view.feedback.textContent='Opening SMS draft.';finish(latest);
    };
    view.copy.onclick=async()=>{
      const latest=ready();if(!latest)return;
      const copied=await copyMessageText(view.text.value);
      view.feedback.textContent=copied?'Message copied.':'Select and copy the message from the preview.';
      if(copied)finish(latest);
    };
    view.voice.onclick=async()=>{
      const latest=ready();if(!latest)return;
      const copying=copyMessageText(view.text.value);
      window.open('https://voice.google.com/messages','_blank','noopener,noreferrer');
      const copied=await copying;
      view.feedback.textContent=copied?'Message copied. Choose the recipient in Google Voice and paste.':'Return to this tab and copy from the preview.';
      if(copied)finish(latest);
    };
    $('pickupReminderSkip').onclick=()=>{
      handle(current,'dismissed');closeModal();
    };
  }
  $('pickupReminderReview').onclick=()=>{
    const current=candidate(project(),currentTime());
    if(current)showDraft(current);else tick();
  };
  $('pickupReminderDismiss').onclick=()=>handle(notice,'dismissed');
  pickupReminderController={tick,refreshOpenDraft(){if(showingDraft()&&!draftView.handled)updateDraft();},
    offerDraft(){if(canShowDraft()&&state.trips.some(t=>!t.outcome&&t.status===1))tick();},prepared(trip,type){
    if(!trip||type!=='10'||trip.status!==1||trip.outcome||previewingServiceDay()||(state.serviceDate&&state.serviceDate!==localServiceDate()))return;
    const key=keyFor(trip);
    ledger[key]={status:'reviewed',tripId:trip.id,recordedAt:Date.now(),handledAt:Date.now()};save();
    if(notice?.key===key){notice=null;$('pickupReminder').hidden=true;}
  }};
  function checkVisibleReminder(){
    if(document.visibilityState!=='hidden')tick();
  }
  document.addEventListener('visibilitychange',checkVisibleReminder);
  window.addEventListener('pageshow',checkVisibleReminder);
  tick();
})();
