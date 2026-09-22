/**
 * Housekeeping: free Gmail reminders + photo cleanup.
 * Paste into a private Google Apps Script project.
 * Script properties: APP_URL (production HTTPS URL), WORKER_SECRET.
 * Run install() once, authorize, then run tick() for a connection check.
 * Does not read the Gmail inbox. Uses MailApp's send-only permission.
 */
function config_() {
 var p=PropertiesService.getScriptProperties();
 var url=(p.getProperty('APP_URL')||'').replace(/\/$/,'');
 var secret=p.getProperty('WORKER_SECRET')||'';
 if(!/^https:\/\//.test(url)||secret.length<32)throw new Error('Set APP_URL and WORKER_SECRET in Project Settings → Script properties.');
 return {url:url,secret:secret,props:p};
}
function call_(payload){
 var c=config_();
 var result=UrlFetchApp.fetch(c.url+'/api/worker',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+c.secret},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:false});
 if(result.getResponseCode()!==200)throw new Error('Housekeeping returned HTTP '+result.getResponseCode()+'. Check the app connection and secret.');
 return JSON.parse(result.getContentText());
}
function install(){
 config_();
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='tick')ScriptApp.deleteTrigger(t);});
 ScriptApp.newTrigger('tick').timeBased().everyMinutes(15).create();
 // Force the send-only permission prompt during setup, without sending mail.
 MailApp.getRemainingDailyQuota();
 console.log('Installed. Reminders and photo cleanup will run every 15 minutes.');
}
function tick(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 try{
  var c=config_(),props=c.props,now=Date.now();
  // Keep a local send receipt BEFORE acknowledging to the app. If the ack fails,
  // the next run acknowledges without sending the same email again.
  var ledger=JSON.parse(props.getProperty('DELIVERY_LEDGER')||'{}');
  Object.keys(ledger).forEach(function(id){
   var item=ledger[id];
   if(item.acked&&now-item.at>7*86400000){delete ledger[id];return;}
   if(!item.acked){try{call_({action:'ack',id:id,leaseToken:item.token});item.acked=true;}catch(e){console.warn('Acknowledgement pending for '+id);}}
  });
  props.setProperty('DELIVERY_LEDGER',JSON.stringify(ledger));
  var quota=MailApp.getRemainingDailyQuota();
  var result=call_({action:'poll',limit:Math.min(10,quota)});
  result.jobs.forEach(function(job){
   if(ledger[job.id]){
    call_({action:'ack',id:job.id,leaseToken:job.leaseToken});
    ledger[job.id].acked=true;
    props.setProperty('DELIVERY_LEDGER',JSON.stringify(ledger));
    return;
   }
   MailApp.sendEmail({to:job.to,subject:job.subject,body:job.body,name:'Housekeeping'});
   ledger[job.id]={at:Date.now(),token:job.leaseToken,acked:false};
   props.setProperty('DELIVERY_LEDGER',JSON.stringify(ledger));
   call_({action:'ack',id:job.id,leaseToken:job.leaseToken});
   ledger[job.id].acked=true;
   props.setProperty('DELIVERY_LEDGER',JSON.stringify(ledger));
  });
  if(quota===0)call_({action:'error',message:'Gmail daily recipient quota reached. Cleanup still ran; reminders will retry.'});
  console.log('Checked reminders. Removed '+result.deleted+' expired photos.');
 }catch(e){try{call_({action:'error',message:String(e)});}catch(ignored){}throw e;}
 finally{lock.releaseLock();}
}
function uninstall(){
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='tick')ScriptApp.deleteTrigger(t);});
 console.log('Reminder and cleanup trigger removed.');
}
