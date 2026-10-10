(() => {
const $=id=>document.getElementById(id), url=window.BETA_SUPABASE_URL, key=window.BETA_SUPABASE_KEY;
const configured=url&&key&&!url.includes("PASTE_")&&!key.includes("PASTE_");
const show=(id,yes)=>$(id).classList.toggle("hidden",!yes);
const msg=(id,t,bad=false)=>{$(id).textContent=t;$(id).classList.toggle("error",bad)};
let db,user,profile,exportRows=[],liveTimer=null,manualAdjustments=[];
// Keep the login form visible even if the Supabase library/configuration fails to load.
show("loginPanel",true);
if(!configured||!window.supabase){
  show("setupNotice",true);
  const submit=$("loginForm").querySelector('button[type="submit"]');
  submit.disabled=true;
  msg("loginMessage",!configured
    ?"Manjka nastavitev Supabase v config.js."
    :"Supabase knjižnica se ni naložila. Osvežite stran ali preverite internetno povezavo.",true);
  return;
}
db=window.supabase.createClient(url,key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}
});
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>new Date(v).toLocaleString("sl-SI",{dateStyle:"short",timeStyle:"short"});
const toLocalInput=v=>{const d=new Date(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};
const label=v=>v==="arrival"?"Prihod na delo":v==="departure"?"Odhod z dela":v;
const gps=r=>r.latitude!=null&&r.longitude!=null?`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`:"Ni podatka";
async function enter(u){
 user=u; const {data:p,error}=await db.from("workers").select("id,full_name,is_admin,active").eq("id",u.id).maybeSingle();
 if(error||!p||!p.active){await db.auth.signOut();show("loginPanel",true);msg("loginMessage","Uporabnik nima aktivnega profila. Obrnite se na administratorja.",true);return}
 profile=p;show("loginPanel",false);show("appPanel",true);show("adminPanel",!!p.is_admin);show("workerPanel",true);show("workerHomePage",true);show("workerEvidencePage",false);document.querySelector(".welcome").classList.toggle("hidden",!p.is_admin);if(liveTimer)clearInterval(liveTimer);liveTimer=setInterval(()=>{if(user)loadMine()},60000);
 $("userEmail").textContent=u.email||p.full_name;$("userRole").textContent=p.is_admin?"Administrator":"Delavec";
 if(p.is_admin){await Promise.all([loadAdmin(),loadMine()])}else{await loadMine()}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();msg("loginMessage","Prijava ...");const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){msg("loginMessage","Prijava ni uspela. Preverite e-pošto in geslo.",true);return}enteredUserId=data.user.id;await enter(data.user)});
$("logoutButton").addEventListener("click",async()=>{await db.auth.signOut();enteredUserId=null;user=profile=null;if(liveTimer)clearInterval(liveTimer);liveTimer=null;show("appPanel",false);show("loginPanel",true);$("password").value=""});
function locationNow(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error("GPS ni podprt."));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>reject(new Error("Dovolite dostop do lokacije in poskusite znova.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function clock(type){["arrivalButton","departureButton"].forEach(id=>$(id).disabled=true);msg("clockMessage","Pridobivanje lokacije in shranjevanje ...");try{const loc=await locationNow();const {error}=await db.rpc("clock_event",{p_event_type:type,p_latitude:loc.latitude,p_longitude:loc.longitude});if(error)throw error;msg("clockMessage",label(type)+" je zabeležen.");await loadMine()}catch(e){msg("clockMessage",e.message||"Zapisa ni bilo mogoče shraniti.",true)}finally{["arrivalButton","departureButton"].forEach(id=>$(id).disabled=false)}}
$("arrivalButton").addEventListener("click",()=>clock("arrival"));$("departureButton").addEventListener("click",()=>clock("departure"));$("monthPicker").addEventListener("change",()=>loadMine());$("openWorkTimeButton").addEventListener("click",()=>{show("workerHomePage",false);show("workerEvidencePage",true);window.scrollTo({top:0,behavior:"auto"});});$("backToWorkerHome").addEventListener("click",()=>{show("workerEvidencePage",false);show("workerHomePage",true);window.scrollTo({top:0,behavior:"auto"});});
function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function monthBounds(value){const [y,m]=value.split("-").map(Number);return {start:new Date(y,m-1,1).toISOString(),end:new Date(y,m,1).toISOString()}}
function durationLabel(ms){const mins=Math.max(0,Math.floor(ms/60000));return `${Math.floor(mins/60)}:${String(mins%60).padStart(2,"0")}`}
function nightMilliseconds(start,end){let total=0;const first=new Date(start.getFullYear(),start.getMonth(),start.getDate()-1);for(let d=new Date(first);d<=end;d.setDate(d.getDate()+1)){const n1=new Date(d.getFullYear(),d.getMonth(),d.getDate(),22,0,0,0),n2=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,6,0,0,0);total+=Math.max(0,Math.min(end,n2)-Math.max(start,n1));}return total}
const absenceLabels={holiday:"Praznik",vacation:"Dopust",sickness:"Bolniška",Praznik:"Praznik",Dopust:"Dopust","Bolniška":"Bolniška"};
async function loadMine(){
 const picker=$("monthPicker");if(!picker.value)picker.value=currentMonth();
 const bounds=monthBounds(picker.value);
 // Load a little before the selected month so an overnight shift can be paired correctly.
 const from=new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString();
 const {data,error}=await db.from("work_hours").select("id,event_type,event_time,latitude,longitude").eq("worker_id",user.id).gte("event_time",from).lt("event_time",bounds.end).order("event_time",{ascending:true});
 if(error){msg("clockMessage","Evidenca ni na voljo. Preverite povezavo.",true);return}
 const allRows=data||[], monthStart=new Date(bounds.start), monthEnd=new Date(bounds.end), now=new Date();
 const [{data:manualData,error:manualReadError},{data:legacyRows,error:legacyReadError}]=await Promise.all([
  db.from("work_hour_adjustments").select("night_hours,overtime_hours").eq("worker_id",user.id).eq("month",picker.value).maybeSingle(),
  db.from("monthly_manual_hours").select("regular_hours,overtime_hours,night_hours").eq("worker_name",profile.full_name).eq("work_month",picker.value+"-01")
 ]);
 const legacy=(legacyRows||[]).reduce((a,r)=>({regular:a.regular+Number(r.regular_hours||0),overtime:a.overtime+Number(r.overtime_hours||0),night:a.night+Number(r.night_hours||0)}),{regular:0,overtime:0,night:0});
 const manualNight=manualData?Number(manualData.night_hours||0):legacy.night;
 const manualOvertime=manualData?Number(manualData.overtime_hours||0):legacy.overtime;
 $("workerManualNightHours").textContent=manualReadError?"—":`${manualNight.toLocaleString("sl-SI")} h`;
 $("workerManualOvertimeHours").textContent=manualReadError?"—":`${manualOvertime.toLocaleString("sl-SI")} h`;
 msg("workerManualHoursMessage",manualReadError||legacyReadError?"Ročnih ur ni mogoče v celoti naložiti. Preverite pravila dostopa v Supabase.":legacy.regular>0?`Stare ročno vnesene ure: ${legacy.regular.toLocaleString("sl-SI")} h.`:"",!!(manualReadError||legacyReadError));
 const days={};
 // Pair events in time order. An open arrival counts up to the current time automatically.
 let open=null; const intervals=[];
 for(const r of allRows){
   const t=new Date(r.event_time);
   if(r.event_type==="arrival"){
     if(open===null)open=r;
   }else if(r.event_type==="departure"&&open!==null){
     const a=new Date(open.event_time), b=t;
     if(b>a)intervals.push({start:a,end:b,arrival:open.event_time,departure:r.event_time});
     open=null;
   }
 }
 if(open!==null){const a=new Date(open.event_time);if(now>a)intervals.push({start:a,end:now,arrival:open.event_time,departure:null});}
 // Attribute elapsed time to each local calendar day and only to the selected month.
 const dailyMs={}, arrivals={}, departures={}, hasOpen={};
 for(const r of allRows){
   const d=new Date(r.event_time);if(d<monthStart||d>=monthEnd)continue;
   const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   if(r.event_type==="arrival"&&!arrivals[k])arrivals[k]=r.event_time;
   if(r.event_type==="departure")departures[k]=r.event_time;
 }
 let totalMs=0,workedDays=0;
 for(const it of intervals){
   let cursor=new Date(Math.max(it.start.getTime(),monthStart.getTime()));
   const stop=new Date(Math.min(it.end.getTime(),monthEnd.getTime()));
   while(cursor<stop){
     const nextDay=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
     const segmentEnd=new Date(Math.min(stop.getTime(),nextDay.getTime()));
     const k=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
     dailyMs[k]=(dailyMs[k]||0)+(segmentEnd-cursor);if(it.departure===null)hasOpen[k]=true;
     cursor=segmentEnd;
   }
 }
 const keys=new Set([...Object.keys(arrivals),...Object.keys(departures),...Object.keys(dailyMs)]);
 const daily=[...keys].sort((a,b)=>b.localeCompare(a)).map(key=>{
   const ms=dailyMs[key]||0;totalMs+=ms;if(ms>0)workedDays++;
   const last=departures[key]||null;
   return {key,firstArrival:arrivals[key]||null,lastDeparture:last,ms,open:!!hasOpen[key]};
 });
 totalMs+=legacy.regular*3600000;
 $("monthTotal").textContent=durationLabel(totalMs+Number(legacy.regular||0)*3600000);$("monthDays").textContent=String(workedDays);$("monthEvents").textContent=String(allRows.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd).length);
 $("monthlyHours").innerHTML=daily.map(d=>`<tr><td>${esc(new Date(`${d.key}T12:00:00`).toLocaleDateString("sl-SI"))}</td><td>${d.firstArrival?esc(new Date(d.firstArrival).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td>${d.lastDeparture?esc(new Date(d.lastDeparture).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td><strong>${durationLabel(d.ms)}</strong></td><td>${d.open?"Delo še poteka · ure se samodejno štejejo":d.ms>0?"Zaključeno":"Brez para prihod/odhod"}</td></tr>`).join("")||'<tr><td colspan="5">Za ta mesec še ni zapisov.</td></tr>';
 const rows=allRows.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd);
 $("myHours").innerHTML=rows.slice().sort((a,b)=>new Date(b.event_time)-new Date(a.event_time)).map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td></tr>`).join("")||'<tr><td colspan="3">Za ta mesec še ni zapisov.</td></tr>';
}
function adminMonth(){const p=$("adminMonthPicker");if(!p.value){const d=new Date();p.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}return p.value}
function renderAdminWorkerDaily(all,workerId,monthStart,monthEnd,now,selected){
 const body=$("adminWorkerDailyHours");$("adminWorkerMonthLabel").textContent=selected;
 const totalHours=$("adminWorkerTotalHours"),totalDays=$("adminWorkerTotalDays");
 if(!workerId){body.innerHTML='<tr><td colspan="6">Izberite delavca za pregled.</td></tr>';if(totalHours)totalHours.textContent="0:00";if(totalDays)totalDays.textContent="0";return}
 const events=all.filter(r=>r.worker_id===workerId).slice().sort((a,b)=>new Date(a.event_time)-new Date(b.event_time));
 const daily={}, arrivals={}, departures={}, arrivalRows={}, departureRows={};
 let open=null;const intervals=[];
 for(const r of events){
   const t=new Date(r.event_time);
   if(r.event_type==="arrival"){if(open===null)open=r}
   else if(r.event_type==="departure"&&open!==null){const a=new Date(open.event_time);if(t>a)intervals.push({start:a,end:t,open:false});open=null}
 }
 if(open!==null){const a=new Date(open.event_time);if(now>a)intervals.push({start:a,end:now,open:true})}
 for(const r of events){
   const d=new Date(r.event_time);if(d<monthStart||d>=monthEnd)continue;
   const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   if(!daily[k])daily[k]={ms:0,open:false};
   if(r.event_type==="arrival"&&!arrivals[k]){arrivals[k]=r.event_time;arrivalRows[k]=r}
   if(r.event_type==="departure"){departures[k]=r.event_time;departureRows[k]=r}
 }
 for(const it of intervals){
   let cursor=new Date(Math.max(it.start.getTime(),monthStart.getTime()));
   const stop=new Date(Math.min(it.end.getTime(),monthEnd.getTime()));
   while(cursor<stop){
     const next=new Date(cursor.getFullYear(),cursor.getMonth(),cursor.getDate()+1);
     const end=new Date(Math.min(stop.getTime(),next.getTime()));
     const k=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
     if(!daily[k])daily[k]={ms:0,open:false};
     daily[k].ms+=end-cursor;if(it.open)daily[k].open=true;cursor=end;
   }
 }
 const mapLink=(r,caption)=>r&&r.latitude!=null&&r.longitude!=null
   ?`<a href="https://www.google.com/maps?q=${encodeURIComponent(`${r.latitude},${r.longitude}`)}" target="_blank" rel="noopener noreferrer">${caption}</a>`
   :"—";
 const keys=Object.keys(daily).sort((a,b)=>b.localeCompare(a));
 const totalMs=keys.reduce((sum,k)=>sum+(daily[k].ms||0),0);
 const workedDays=keys.filter(k=>(daily[k].ms||0)>0).length;
 if(totalHours)totalHours.textContent=durationLabel(totalMs);
 if(totalDays)totalDays.textContent=String(workedDays);
 body.innerHTML=keys.map(k=>{
   const d=daily[k],a=arrivals[k],b=departures[k],ar=arrivalRows[k],dr=departureRows[k];
   const maps=`<div class="daily-map-links">${mapLink(ar,"Prihod – Zemljevid ↗")}${mapLink(dr,"Odhod – Zemljevid ↗")}</div>`;
   return `<tr><td>${esc(new Date(`${k}T12:00:00`).toLocaleDateString("sl-SI"))}</td><td>${a?esc(new Date(a).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td>${b?esc(new Date(b).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td><strong>${durationLabel(d.ms)}</strong></td><td>${d.open?"Delo še poteka · ure se štejejo":d.ms>0?"Izračunano":"Nepopolna registracija"}</td><td>${maps}</td></tr>`;
 }).join("")||'<tr><td colspan="6">Za izbranega delavca v tem mesecu še ni zapisov.</td></tr>';
}
async function loadAdmin(){
 const selected=adminMonth(),bounds=monthBounds(selected),from=new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString();
 msg("adminMessage","Nalaganje podatkov ...");
 const [wr,hr,ar,adj,hist]=await Promise.all([
  db.from("workers").select("id,full_name,active,is_admin").order("full_name"),
  db.from("work_hours").select("id,worker_id,event_type,event_time,latitude,longitude").gte("event_time",from).lt("event_time",bounds.end).order("event_time",{ascending:true}).limit(10000),
  db.from("work_absences").select("id,worker_id,absence_type,start_date,end_date,note").lt("start_date",selected+"-"+String(new Date(new Date(bounds.end).getTime()-86400000).getDate()+1).padStart(2,"0")).gte("end_date",selected+"-01").order("start_date",{ascending:false}),
  db.from("work_hour_adjustments").select("id,worker_id,month,night_hours,overtime_hours,note").eq("month",selected),
  db.from("monthly_manual_hours").select("worker_name,work_month,regular_hours,overtime_hours,night_hours").eq("work_month",selected+"-01")
 ]);
 if(wr.error||hr.error){msg("adminMessage","Podatkov ni mogoče naložiti. Preverite pravila dostopa.",true);return}
 const workers=wr.data||[],map=Object.fromEntries(workers.map(w=>[w.id,w])),all=hr.data||[],monthStart=new Date(bounds.start),monthEnd=new Date(bounds.end),now=new Date();
 const absences=ar.error?[]:(ar.data||[]);
 manualAdjustments=adj.error?[]:(adj.data||[]);
 const legacyByName={};
 for(const h of (hist.data||[])){const k=String(h.worker_name||"").trim().toLocaleLowerCase();if(!legacyByName[k])legacyByName[k]={regular:0,overtime:0,night:0};legacyByName[k].regular+=Number(h.regular_hours||0);legacyByName[k].overtime+=Number(h.overtime_hours||0);legacyByName[k].night+=Number(h.night_hours||0);}
 if(hist.error){msg("historicalHoursMessage","Zgodovinskih ur ni mogoče naložiti iz monthly_manual_hours.",true)}
 if(adj.error){msg("manualHoursMessage","Za ročni vnos ur najprej zaženite FAZA-3-SUPABASE.sql v Supabase SQL Editor.",true)}
 if(ar.error){msg("absenceMessage","Najprej zaženite SQL datoteko FAZA-2-SUPABASE.sql v Supabase SQL Editor.",true)}else{msg("absenceMessage","")}
 const absenceWorker=$("absenceWorker");const oldAbsenceWorker=absenceWorker.value;absenceWorker.innerHTML='<option value="">Izberite delavca</option>'+workers.filter(w=>!w.is_admin).map(w=>`<option value="${esc(w.id)}">${esc(w.full_name)}</option>`).join("");if(oldAbsenceWorker&&workers.some(w=>w.id===oldAbsenceWorker))absenceWorker.value=oldAbsenceWorker;
 const manualPicker=$("manualHoursWorker"),oldManualWorker=manualPicker.value;manualPicker.innerHTML='<option value="">Izberite delavca</option>'+workers.filter(w=>!w.is_admin).map(w=>`<option value="${esc(w.id)}">${esc(w.full_name)}</option>`).join("");if(oldManualWorker&&workers.some(w=>w.id===oldManualWorker))manualPicker.value=oldManualWorker;else if(workers.some(w=>!w.is_admin))manualPicker.value=workers.find(w=>!w.is_admin).id;
 $("manualHoursMonth").value=selected;
 const monthAbsences=absences.filter(a=>a.start_date<selected+"-"+String(new Date(new Date(bounds.end).getTime()-86400000).getDate()).padStart(2,"0")&&a.end_date>=selected+"-01");
 $("absenceRows").innerHTML=monthAbsences.map(a=>`<tr><td>${esc(map[a.worker_id]?.full_name||a.worker_id)}</td><td>${esc(absenceLabels[a.absence_type]||a.absence_type)}</td><td>${esc(a.start_date)}</td><td>${esc(a.end_date)}</td><td>${esc(a.note||"—")}</td><td><button type="button" class="danger absence-delete" data-absence-id="${esc(a.id)}">Izbriši</button></td></tr>`).join("")||'<tr><td colspan="6">Za izbrani mesec ni odsotnosti.</td></tr>';
 $("workersTable").innerHTML=workers.map(w=>`<tr><td>${esc(w.full_name)}</td><td>${esc(w.id)}</td><td>${w.active?"Aktiven":"Neaktiven"}${w.is_admin?" · Administrator":""}</td></tr>`).join("")||'<tr><td colspan="3">Ni delavcev.</td></tr>';
 const byWorker={};for(const r of all){if(!byWorker[r.worker_id])byWorker[r.worker_id]=[];byWorker[r.worker_id].push(r)}
 const adjustmentMap=Object.fromEntries(manualAdjustments.map(a=>[a.worker_id,a]));
 const summary=workers.map(w=>{const events=(byWorker[w.id]||[]).slice().sort((a,b)=>new Date(a.event_time)-new Date(b.event_time));let open=null,total=0,night=0;const days=new Set();for(const r of events){const t=new Date(r.event_time);if(r.event_type==="arrival"){if(open===null)open=t}else if(r.event_type==="departure"&&open!==null){const rawStart=open,rawEnd=t,s=new Date(Math.max(rawStart.getTime(),monthStart.getTime())),e=new Date(Math.min(rawEnd.getTime(),monthEnd.getTime()));if(e>s){total+=e-s;night+=nightMilliseconds(s,e);let cur=new Date(s);while(cur<e){days.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`);cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1)}}open=null}}
  let ongoing=false;if(open!==null){const s=new Date(Math.max(open.getTime(),monthStart.getTime())),e=new Date(Math.min(now.getTime(),monthEnd.getTime()));if(e>s){total+=e-s;night+=nightMilliseconds(s,e);ongoing=true;let cur=new Date(s);while(cur<e){days.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`);cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1)}}}
  const adjustment=adjustmentMap[w.id]||{},legacy=legacyByName[String(w.full_name||"").trim().toLocaleLowerCase()]||{};return {name:w.full_name,active:w.active,total,night,manualNight:Number(adjustment.night_hours??legacy.night??0),overtime:Number(adjustment.overtime_hours??legacy.overtime??0),historicalRegular:Number(legacy.regular||0),days:days.size,ongoing};});
 const fmt=ms=>{const value=Number(ms);if(!Number.isFinite(value)||value<=0)return "0:00";const n=Math.floor(value/60000);return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`};
 $("adminMonthlyHours").innerHTML=summary.map((s,i)=>{const w=workers[i];return `<tr><td><button type="button" class="worker-open secondary" data-worker-id="${esc(w.id)}">${esc(s.name)} ↗</button></td><td>${s.days}</td><td><strong>${fmt(Number(s.total||0)+Number(s.historicalRegular||0)*3600000)}</strong></td><td>${fmt(s.night)}</td><td>${s.manualNight.toLocaleString("sl-SI")} h</td><td>${s.overtime.toLocaleString("sl-SI")} h</td><td>${s.ongoing?"Delo še poteka":s.active?"Aktiven":"Neaktiven"}</td></tr>`}).join("")||'<tr><td colspan="7">Ni delavcev.</td></tr>';
 const workerPicker=$("adminWorkerPicker");
 const previousWorker=workerPicker.value;
 workerPicker.innerHTML='<option value="">Izberite delavca</option>'+workers.map(w=>`<option value="${esc(w.id)}">${esc(w.full_name)}${w.is_admin?" (Administrator)":""}</option>`).join("");
 if(previousWorker&&workers.some(w=>w.id===previousWorker))workerPicker.value=previousWorker;
 else if(workers.length)workerPicker.value=workers[0].id;
 renderAdminWorkerDaily(all,workerPicker.value,monthStart,monthEnd,now,selected);
 const rows=all.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd).sort((a,b)=>new Date(b.event_time)-new Date(a.event_time));
 exportRows=rows.map(r=>({"Datum in ura":date(r.event_time),"Delavec":map[r.worker_id]?.full_name||r.worker_id,"Dogodek":label(r.event_type),"Latitude":r.latitude??"","Longitude":r.longitude??""}));
 const mapLink=r=>r.latitude!=null&&r.longitude!=null?`<a href="https://www.google.com/maps?q=${encodeURIComponent(`${r.latitude},${r.longitude}`)}" target="_blank" rel="noopener noreferrer">Odpri zemljevid ↗</a>`:"Ni podatka";
 $("allHours").innerHTML=rows.slice().map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(map[r.worker_id]?.full_name||r.worker_id)}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td><td>${mapLink(r)}</td><td><div class="record-actions"><button type="button" class="secondary record-edit" data-edit-id="${esc(r.id)}">Uredi</button><button type="button" class="danger record-delete" data-delete-id="${esc(r.id)}">Izbriši</button></div></td></tr>`).join("")||'<tr><td colspan="6">Za izbrani mesec ni zapisov.</td></tr>';
 msg("adminMessage",`Mesec ${selected}: ${workers.length} delavcev, ${rows.length} registracij.`);loadManualAdjustmentForm()
}
function loadManualAdjustmentForm(){const workerId=$("manualHoursWorker").value,month=$("manualHoursMonth").value||adminMonth(),a=manualAdjustments.find(x=>x.worker_id===workerId&&x.month===month);$("manualNightHours").value=a?Number(a.night_hours||0):0;$("manualOvertimeHours").value=a?Number(a.overtime_hours||0):0;$("manualHoursNote").value=a?.note||"";if(!a && !$("manualHoursMessage").classList.contains("error"))msg("manualHoursMessage","");}
$("manualHoursWorker").addEventListener("change",loadManualAdjustmentForm);$("manualHoursMonth").addEventListener("change",async()=>{const m=$("manualHoursMonth").value;if(m&&m!==adminMonth()){$("adminMonthPicker").value=m;await loadAdmin()}loadManualAdjustmentForm()});
$("manualHoursForm").addEventListener("submit",async e=>{e.preventDefault();if(!profile?.is_admin){msg("manualHoursMessage","Samo administrator lahko shrani ročne ure.",true);return}const workerId=$("manualHoursWorker").value,month=$("manualHoursMonth").value,night=Number($("manualNightHours").value),overtime=Number($("manualOvertimeHours").value),note=$("manualHoursNote").value.trim(),button=$("manualHoursForm").querySelector('button[type="submit"]');if(!workerId||!month||!Number.isFinite(night)||!Number.isFinite(overtime)||night<0||overtime<0){msg("manualHoursMessage","Preverite delavca, mesec in ure.",true);return}const payload={worker_id:workerId,month,night_hours:night,overtime_hours:overtime,note:note||null,created_by:user.id,updated_at:new Date().toISOString()};button.disabled=true;msg("manualHoursMessage","Shranjevanje ur ...");try{const {data,error}=await db.from("work_hour_adjustments").upsert(payload,{onConflict:"worker_id,month"}).select("id,worker_id,month,night_hours,overtime_hours,note").single();if(error)throw error;if(!data)throw new Error("Supabase ni potrdil shranjevanja.");manualAdjustments=manualAdjustments.filter(a=>!(a.worker_id===workerId&&a.month===month)).concat(data);msg("manualHoursMessage","Ročne nočne ure in nadure so shranjene.");await loadAdmin();loadManualAdjustmentForm();msg("manualHoursMessage","Ročne nočne ure in nadure so shranjene.");}catch(err){msg("manualHoursMessage","Shranjevanje ni uspelo: "+(err?.message||"neznana napaka")+". Preverite FAZA-3-SUPABASE.sql.",true)}finally{button.disabled=false}});
$("clearManualHours").addEventListener("click",async()=>{if(!profile?.is_admin)return;const workerId=$("manualHoursWorker").value,month=$("manualHoursMonth").value;if(!workerId||!month){msg("manualHoursMessage","Izberite delavca in mesec.",true);return}if(!confirm("Ali želite izbrisati ročni vnos ur za tega delavca in mesec?"))return;const {error}=await db.from("work_hour_adjustments").delete().eq("worker_id",workerId).eq("month",month);if(error){msg("manualHoursMessage","Brisanje ni uspelo: "+error.message,true);return}msg("manualHoursMessage","Ročni vnos je izbrisan.");await loadAdmin();loadManualAdjustmentForm()});

$("absenceForm").addEventListener("submit",async e=>{e.preventDefault();if(!profile?.is_admin)return;const workerId=$("absenceWorker").value,type=$("absenceType").value,start=$("absenceStart").value,end=$("absenceEnd").value,note=$("absenceNote").value.trim();if(!workerId){msg("absenceMessage","Izberite delavca.",true);return}if(!start||!end||end<start){msg("absenceMessage","Datum konca mora biti enak ali poznejši od začetka.",true);return}const dbAbsenceType=({holiday:"holiday",vacation:"vacation",sickness:"sickness"})[type]||type;const {error}=await db.from("work_absences").insert({worker_id:workerId,absence_type:dbAbsenceType,start_date:start,end_date:end,note:note||null});if(error){msg("absenceMessage","Shranjevanje ni uspelo: "+error.message,true);return}$("absenceNote").value="";msg("absenceMessage","Odsotnost je shranjena.");await loadAdmin()});
$("absenceRows").addEventListener("click",async e=>{const b=e.target.closest("[data-absence-id]");if(!b||!profile?.is_admin)return;if(!confirm("Ali res želite izbrisati to odsotnost?"))return;const {error}=await db.from("work_absences").delete().eq("id",b.dataset.absenceId);if(error){msg("absenceMessage","Brisanje ni uspelo: "+error.message,true);return}msg("absenceMessage","Odsotnost je izbrisana.");await loadAdmin()});
$("addWorkerForm").addEventListener("submit",async e=>{e.preventDefault();const name=$("workerName").value.trim(),id=$("workerUid").value.trim();const btn=$("addWorkerButton");btn.disabled=true;msg("addWorkerMessage","Shranjevanje profila ...");try{const {error}=await db.from("workers").insert({id,full_name:name,is_admin:false,active:true});if(error)throw error;$("workerName").value="";$("workerUid").value="";msg("addWorkerMessage","Profil delavca je dodan. Delavec se lahko prijavi z računom, ki ste ga ustvarili v Supabase Auth.");await loadAdmin()}catch(e){msg("addWorkerMessage",e.message||"Profila ni bilo mogoče dodati. Preverite User UID in pravila dostopa.",true)}finally{btn.disabled=false}});
 $("adminMonthlyHours").addEventListener("click",async e=>{
 const b=e.target.closest("[data-worker-id]");if(!b)return;e.preventDefault();
 const workerId=b.dataset.workerId,picker=$("adminWorkerPicker");
 await loadAdmin();picker.value=workerId;await renderSelectedAdminWorker();
 const name=picker.options[picker.selectedIndex]?.textContent||b.textContent.replace(" ↗","");
 $("adminDetailWorkerName").textContent=name.replace(/\s*\(Administrator\)$/,"" );
 $("adminDetailMonthText").textContent=`Mesec: ${adminMonth()}`;
 show("adminHomePage",false);show("adminWorkerDetailPage",true);show("adminWorkerSummaryPage",true);show("adminWorkerTablePage",false);window.scrollTo({top:0,behavior:"auto"});
});
$("backToAdminHome").addEventListener("click",()=>{show("adminWorkerDetailPage",false);show("adminHomePage",true);window.scrollTo({top:0,behavior:"auto"});});
$("showAdminDailyTable").addEventListener("click",()=>{show("adminWorkerSummaryPage",false);show("adminWorkerTablePage",true);window.scrollTo({top:0,behavior:"auto"});});
$("backToAdminWorkerSummary").addEventListener("click",()=>{show("adminWorkerTablePage",false);show("adminWorkerSummaryPage",true);window.scrollTo({top:0,behavior:"auto"});});
async function renderSelectedAdminWorker(){const selected=adminMonth(),bounds=monthBounds(selected);const {data,error}=await db.from("work_hours").select("id,worker_id,event_type,event_time,latitude,longitude").gte("event_time",new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString()).lt("event_time",bounds.end).order("event_time",{ascending:true}).limit(10000);if(error){msg("adminMessage","Podrobnosti delavca ni mogoče naložiti.",true);return}renderAdminWorkerDaily(data||[],$("adminWorkerPicker").value,new Date(bounds.start),new Date(bounds.end),new Date(),selected);$("adminDetailMonthText").textContent=`Mesec: ${selected}`;}
$("refreshButton").addEventListener("click",loadAdmin);
$("adminMonthPicker").addEventListener("change",loadAdmin);
$("adminWorkerPicker").addEventListener("change",()=>loadAdmin());
$("exportButton").addEventListener("click",()=>{
 if(!exportRows.length){msg("adminMessage","Ni zapisov za izvoz.");return}
 const cols=Object.keys(exportRows[0]),cell=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv="\uFEFF"+[cols.map(cell).join(";"),...exportRows.map(r=>cols.map(c=>cell(r[c])).join(";"))].join("\r\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a");
 a.href=URL.createObjectURL(blob);a.download=`beta-group-evidenca-${adminMonth()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
$("printButton").addEventListener("click",()=>{
 const table=document.querySelector("#adminPanel #adminHomePage .table-panel:last-of-type table");
 const summary=document.querySelector("#adminMonthlyHours")?.closest("table");
 const workerRows=summary?summary.outerHTML:"";
 const logRows=table?table.outerHTML:"";
 const w=window.open("","_blank");
 if(!w){msg("adminMessage","Dovolite odpiranje novega okna, nato poskusite znova.",true);return}
 w.document.write(`<!doctype html><html lang="sl"><head><meta charset="utf-8"><title>BETA GROUP – poročilo ${esc(adminMonth())}</title><style>body{font:12px Arial,sans-serif;color:#18263b;padding:24px}h1,h2{color:#203a63}table{border-collapse:collapse;width:100%;margin:12px 0 28px}th,td{border:1px solid #ccd5e2;padding:7px;text-align:left}th{background:#edf2fa}button{padding:10px 14px;margin-bottom:16px}@media print{button{display:none}body{padding:0}tr{break-inside:avoid}}</style></head><body><button onclick="window.print()">Natisni / Shrani kot PDF</button><h1>BETA GROUP – Evidenca delovnih ur</h1><p>Mesec: ${esc(adminMonth())}</p><h2>Mesečni povzetek ekipe</h2>${workerRows}<h2>Registracije</h2>${logRows}<script>document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>window.print()))<\/script></body></html>`);
 w.document.close();
});
$("allHours").addEventListener("click",async e=>{
 if(!profile?.is_admin)return;
 const edit=e.target.closest("[data-edit-id]"),del=e.target.closest("[data-delete-id]");
 if(edit){
  const id=edit.dataset.editId;
  const {data:row,error:readError}=await db.from("work_hours").select("id,event_type,event_time").eq("id",id).maybeSingle();
  if(readError||!row){msg("adminMessage","Zapisa ni mogoče odpreti za urejanje. Preverite pravice v Supabase.",true);return}
  const type=prompt("Vrsta dogodka: vnesite 1 za Prihod ali 2 za Odhod",row.event_type==="arrival"?"1":"2");if(type===null)return;
  const eventType=type.trim()==="1"?"arrival":type.trim()==="2"?"departure":"";
  if(!eventType){msg("adminMessage","Vnesite 1 za Prihod ali 2 za Odhod.",true);return}
  const time=prompt("Datum in ura (YYYY-MM-DDTHH:mm)",toLocalInput(row.event_time));if(time===null)return;
  const parsed=new Date(time);if(!time.trim()||Number.isNaN(parsed.getTime())){msg("adminMessage","Datum ali ura nista pravilna.",true);return}
  if(!confirm("Shrani spremembe tega zapisa?"))return;
  const {error}=await db.from("work_hours").update({event_type:eventType,event_time:parsed.toISOString()}).eq("id",id);
  if(error){msg("adminMessage","Urejanje ni uspelo. Preverite administratorsko UPDATE politiko v Supabase: "+error.message,true);return}
  msg("adminMessage","Zapis je posodobljen.");await loadAdmin();await renderSelectedAdminWorker();
 }
 if(del){
  const id=del.dataset.deleteId;if(!confirm("Ali res želite trajno izbrisati to registracijo? Tega ni mogoče razveljaviti."))return;
  const {error}=await db.from("work_hours").delete().eq("id",id);
  if(error){msg("adminMessage","Brisanje ni uspelo. Preverite administratorsko DELETE politiko v Supabase: "+error.message,true);return}
  msg("adminMessage","Registracija je izbrisana.");await loadAdmin();await renderSelectedAdminWorker();
 }
});
let enteredUserId=null;
async function restoreSession(){
  const {data,error}=await db.auth.getSession();
  if(error){show("appPanel",false);show("loginPanel",true);return}
  if(data.session){
    if(enteredUserId!==data.session.user.id){enteredUserId=data.session.user.id;await enter(data.session.user)}
  }else{show("appPanel",false);show("loginPanel",true)}
}
db.auth.onAuthStateChange((event,session)=>{
  if(session && (event==="SIGNED_IN" || event==="INITIAL_SESSION" || event==="TOKEN_REFRESHED")){
    if(enteredUserId!==session.user.id){enteredUserId=session.user.id;Promise.resolve().then(()=>enter(session.user))}
  }
  if(event==="SIGNED_OUT"){
    enteredUserId=null;user=profile=null;
    if(liveTimer)clearInterval(liveTimer);liveTimer=null;
    show("appPanel",false);show("loginPanel",true);
  }
});
restoreSession();
})();