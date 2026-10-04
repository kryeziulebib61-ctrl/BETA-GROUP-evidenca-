(() => {
const $=id=>document.getElementById(id), url=window.BETA_SUPABASE_URL, key=window.BETA_SUPABASE_KEY;
const configured=url&&key&&!url.includes("PASTE_")&&!key.includes("PASTE_");
const show=(id,yes)=>$(id).classList.toggle("hidden",!yes);
const msg=(id,t,bad=false)=>{$(id).textContent=t;$(id).classList.toggle("error",bad)};
let db,user,profile,exportRows=[],liveTimer=null;
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
db=window.supabase.createClient(url,key);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>new Date(v).toLocaleString("sl-SI",{dateStyle:"short",timeStyle:"short"});
const label=v=>v==="arrival"?"Prihod na delo":v==="departure"?"Odhod z dela":v;
const gps=r=>r.latitude!=null&&r.longitude!=null?`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`:"Ni podatka";
async function enter(u){
 user=u; const {data:p,error}=await db.from("workers").select("id,full_name,is_admin,active").eq("id",u.id).maybeSingle();
 if(error||!p||!p.active){await db.auth.signOut();show("loginPanel",true);msg("loginMessage","Uporabnik nima aktivnega profila. Obrnite se na administratorja.",true);return}
 profile=p;show("loginPanel",false);show("appPanel",true);show("adminPanel",!!p.is_admin);show("workerPanel",true);show("workerHomePage",true);show("workerEvidencePage",false);document.querySelector(".welcome").classList.toggle("hidden",!p.is_admin);if(liveTimer)clearInterval(liveTimer);liveTimer=setInterval(()=>{if(user)loadMine()},60000);
 $("userEmail").textContent=u.email||p.full_name;$("userRole").textContent=p.is_admin?"Administrator":"Delavec";
 if(p.is_admin){await Promise.all([loadAdmin(),loadMine()])}else{await loadMine()}
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();msg("loginMessage","Prijava ...");const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){msg("loginMessage","Prijava ni uspela. Preverite e-pošto in geslo.",true);return}await enter(data.user)});
$("logoutButton").addEventListener("click",async()=>{await db.auth.signOut();user=profile=null;if(liveTimer)clearInterval(liveTimer);liveTimer=null;show("appPanel",false);show("loginPanel",true);$("password").value=""});
function locationNow(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error("GPS ni podprt."));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>reject(new Error("Dovolite dostop do lokacije in poskusite znova.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function clock(type){["arrivalButton","departureButton"].forEach(id=>$(id).disabled=true);msg("clockMessage","Pridobivanje lokacije in shranjevanje ...");try{const loc=await locationNow();const {error}=await db.rpc("clock_event",{p_event_type:type,p_latitude:loc.latitude,p_longitude:loc.longitude});if(error)throw error;msg("clockMessage",label(type)+" je zabeležen.");await loadMine()}catch(e){msg("clockMessage",e.message||"Zapisa ni bilo mogoče shraniti.",true)}finally{["arrivalButton","departureButton"].forEach(id=>$(id).disabled=false)}}
$("arrivalButton").addEventListener("click",()=>clock("arrival"));$("departureButton").addEventListener("click",()=>clock("departure"));$("monthPicker").addEventListener("change",()=>loadMine());$("openWorkTimeButton").addEventListener("click",()=>{show("workerHomePage",false);show("workerEvidencePage",true);window.scrollTo({top:0,behavior:"auto"});});$("backToWorkerHome").addEventListener("click",()=>{show("workerEvidencePage",false);show("workerHomePage",true);window.scrollTo({top:0,behavior:"auto"});});
function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function monthBounds(value){const [y,m]=value.split("-").map(Number);return {start:new Date(y,m-1,1).toISOString(),end:new Date(y,m,1).toISOString()}}
function durationLabel(ms){const mins=Math.max(0,Math.floor(ms/60000));return `${Math.floor(mins/60)}:${String(mins%60).padStart(2,"0")}`}
async function loadMine(){
 const picker=$("monthPicker");if(!picker.value)picker.value=currentMonth();
 const bounds=monthBounds(picker.value);
 // Load a little before the selected month so an overnight shift can be paired correctly.
 const from=new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString();
 const {data,error}=await db.from("work_hours").select("id,event_type,event_time,latitude,longitude").eq("worker_id",user.id).gte("event_time",from).lt("event_time",bounds.end).order("event_time",{ascending:true});
 if(error){msg("clockMessage","Evidenca ni na voljo. Preverite povezavo.",true);return}
 const allRows=data||[], monthStart=new Date(bounds.start), monthEnd=new Date(bounds.end), now=new Date();
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
 $("monthTotal").textContent=durationLabel(totalMs);$("monthDays").textContent=String(workedDays);$("monthEvents").textContent=String(allRows.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd).length);
 $("monthlyHours").innerHTML=daily.map(d=>`<tr><td>${esc(new Date(`${d.key}T12:00:00`).toLocaleDateString("sl-SI"))}</td><td>${d.firstArrival?esc(new Date(d.firstArrival).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td>${d.lastDeparture?esc(new Date(d.lastDeparture).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td><strong>${durationLabel(d.ms)}</strong></td><td>${d.open?"Delo še poteka · ure se samodejno štejejo":d.ms>0?"Zaključeno":"Brez para prihod/odhod"}</td></tr>`).join("")||'<tr><td colspan="5">Za ta mesec še ni zapisov.</td></tr>';
 const rows=allRows.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd);
 $("myHours").innerHTML=rows.slice().sort((a,b)=>new Date(b.event_time)-new Date(a.event_time)).map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td></tr>`).join("")||'<tr><td colspan="3">Za ta mesec še ni zapisov.</td></tr>';
}
function adminMonth(){const p=$("adminMonthPicker");if(!p.value){const d=new Date();p.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}return p.value}
function renderAdminWorkerDaily(all,workerId,monthStart,monthEnd,now,selected){
 const body=$("adminWorkerDailyHours");$("adminWorkerMonthLabel").textContent=selected;
 if(!workerId){body.innerHTML='<tr><td colspan="6">Izberite delavca za pregled.</td></tr>';return}
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
 body.innerHTML=keys.map(k=>{
   const d=daily[k],a=arrivals[k],b=departures[k],ar=arrivalRows[k],dr=departureRows[k];
   const maps=`<div class="daily-map-links">${mapLink(ar,"Prihod ↗")}<span> · </span>${mapLink(dr,"Odhod ↗")}</div>`;
   return `<tr><td>${esc(new Date(`${k}T12:00:00`).toLocaleDateString("sl-SI"))}</td><td>${a?esc(new Date(a).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td>${b?esc(new Date(b).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"})):"—"}</td><td><strong>${durationLabel(d.ms)}</strong></td><td>${d.open?"Delo še poteka · ure se štejejo":d.ms>0?"Izračunano":"Nepopolna registracija"}</td><td>${maps}</td></tr>`;
 }).join("")||'<tr><td colspan="6">Za izbranega delavca v tem mesecu še ni zapisov.</td></tr>';
}
async function loadAdmin(){
 const selected=adminMonth(),bounds=monthBounds(selected),from=new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString();
 msg("adminMessage","Nalaganje podatkov ...");
 const [wr,hr]=await Promise.all([
  db.from("workers").select("id,full_name,active,is_admin").order("full_name"),
  db.from("work_hours").select("id,worker_id,event_type,event_time,latitude,longitude").gte("event_time",from).lt("event_time",bounds.end).order("event_time",{ascending:true}).limit(10000)
 ]);
 if(wr.error||hr.error){msg("adminMessage","Podatkov ni mogoče naložiti. Preverite pravila dostopa.",true);return}
 const workers=wr.data||[],map=Object.fromEntries(workers.map(w=>[w.id,w])),all=hr.data||[],monthStart=new Date(bounds.start),monthEnd=new Date(bounds.end),now=new Date();
 $("workersTable").innerHTML=workers.map(w=>`<tr><td>${esc(w.full_name)}</td><td>${esc(w.id)}</td><td>${w.active?"Aktiven":"Neaktiven"}${w.is_admin?" · Administrator":""}</td></tr>`).join("")||'<tr><td colspan="3">Ni delavcev.</td></tr>';
 const byWorker={};for(const r of all){if(!byWorker[r.worker_id])byWorker[r.worker_id]=[];byWorker[r.worker_id].push(r)}
 const summary=workers.map(w=>{const events=(byWorker[w.id]||[]).slice().sort((a,b)=>new Date(a.event_time)-new Date(b.event_time));let open=null,total=0;const days=new Set();for(const r of events){const t=new Date(r.event_time);if(r.event_type==="arrival"){if(open===null)open=t}else if(r.event_type==="departure"&&open!==null){const s=new Date(Math.max(open.getTime(),monthStart.getTime())),e=new Date(Math.min(t.getTime(),monthEnd.getTime()));if(e>s){total+=e-s;let cur=new Date(s);while(cur<e){days.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`);cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1)}}open=null}}
  let ongoing=false;if(open!==null){const s=new Date(Math.max(open.getTime(),monthStart.getTime())),e=new Date(Math.min(now.getTime(),monthEnd.getTime()));if(e>s){total+=e-s;ongoing=true;let cur=new Date(s);while(cur<e){days.add(`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`);cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1)}}}
  return {name:w.full_name,active:w.active,total,days:days.size,ongoing};});
 const fmt=ms=>{const n=Math.max(0,Math.floor(ms/60000));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`};
 $("adminMonthlyHours").innerHTML=summary.map((s,i)=>{const w=workers[i];return `<tr><td><button type="button" class="worker-open secondary" data-worker-id="${esc(w.id)}">${esc(s.name)} ↗</button></td><td>${s.days}</td><td><strong>${fmt(s.total)}</strong></td><td>${s.ongoing?"Delo še poteka":s.active?"Aktiven":"Neaktiven"}</td></tr>`}).join("")||'<tr><td colspan="4">Ni delavcev.</td></tr>';
 const workerPicker=$("adminWorkerPicker");
 const previousWorker=workerPicker.value;
 workerPicker.innerHTML='<option value="">Izberite delavca</option>'+workers.map(w=>`<option value="${esc(w.id)}">${esc(w.full_name)}${w.is_admin?" (Administrator)":""}</option>`).join("");
 if(previousWorker&&workers.some(w=>w.id===previousWorker))workerPicker.value=previousWorker;
 else if(workers.length)workerPicker.value=workers[0].id;
 renderAdminWorkerDaily(all,workerPicker.value,monthStart,monthEnd,now,selected);
 const rows=all.filter(r=>new Date(r.event_time)>=monthStart&&new Date(r.event_time)<monthEnd).sort((a,b)=>new Date(b.event_time)-new Date(a.event_time));
 exportRows=rows.map(r=>({"Datum in ura":date(r.event_time),"Delavec":map[r.worker_id]?.full_name||r.worker_id,"Dogodek":label(r.event_type),"Latitude":r.latitude??"","Longitude":r.longitude??""}));
 const mapLink=r=>r.latitude!=null&&r.longitude!=null?`<a href="https://www.google.com/maps?q=${encodeURIComponent(`${r.latitude},${r.longitude}`)}" target="_blank" rel="noopener noreferrer">Odpri zemljevid ↗</a>`:"Ni podatka";
 $("allHours").innerHTML=rows.slice().map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(map[r.worker_id]?.full_name||r.worker_id)}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td><td>${mapLink(r)}</td></tr>`).join("")||'<tr><td colspan="5">Za izbrani mesec ni zapisov.</td></tr>';
 msg("adminMessage",`Mesec ${selected}: ${workers.length} delavcev, ${rows.length} registracij.`)
}
$("addWorkerForm").addEventListener("submit",async e=>{e.preventDefault();const name=$("workerName").value.trim(),id=$("workerUid").value.trim();const btn=$("addWorkerButton");btn.disabled=true;msg("addWorkerMessage","Shranjevanje profila ...");try{const {error}=await db.from("workers").insert({id,full_name:name,is_admin:false,active:true});if(error)throw error;$("workerName").value="";$("workerUid").value="";msg("addWorkerMessage","Profil delavca je dodan. Delavec se lahko prijavi z računom, ki ste ga ustvarili v Supabase Auth.");await loadAdmin()}catch(e){msg("addWorkerMessage",e.message||"Profila ni bilo mogoče dodati. Preverite User UID in pravila dostopa.",true)}finally{btn.disabled=false}});
 $("adminMonthlyHours").addEventListener("click",async e=>{const b=e.target.closest("[data-worker-id]");if(!b)return;e.preventDefault();const workerId=b.dataset.workerId;const picker=$("adminWorkerPicker");picker.value=workerId;await loadAdmin();picker.value=workerId;renderSelectedAdminWorker();const panel=$("adminWorkerDailyHours").closest(".table-panel");if(panel)panel.scrollIntoView({behavior:"auto",block:"start"});});
function renderSelectedAdminWorker(){const selected=adminMonth(),bounds=monthBounds(selected);db.from("work_hours").select("id,worker_id,event_type,event_time,latitude,longitude").gte("event_time",new Date(new Date(bounds.start).getTime()-36*60*60*1000).toISOString()).lt("event_time",bounds.end).order("event_time",{ascending:true}).limit(10000).then(({data,error})=>{if(error){msg("adminMessage","Podrobnosti delavca ni mogoče naložiti.",true);return}renderAdminWorkerDaily(data||[],$("adminWorkerPicker").value,new Date(bounds.start),new Date(bounds.end),new Date(),selected)})}
$("refreshButton").addEventListener("click",loadAdmin);$("adminMonthPicker").addEventListener("change",loadAdmin);$("adminWorkerPicker").addEventListener("change",()=>loadAdmin());$("exportButton").addEventListener("click",()=>{if(!exportRows.length){msg("adminMessage","Ni zapisov za izvoz.");return}const cols=Object.keys(exportRows[0]),cell=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv="\uFEFF"+[cols.map(cell).join(";"),...exportRows.map(r=>cols.map(c=>cell(r[c])).join(";"))].join("\r\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="beta-group-evidenca-delovnih-ur.csv";a.click();URL.revokeObjectURL(a.href)});
db.auth.getSession().then(({data})=>data.session?enter(data.session.user):show("loginPanel",true));
db.auth.onAuthStateChange((_e,s)=>{if(!s){show("appPanel",false);show("loginPanel",true)}});
})();