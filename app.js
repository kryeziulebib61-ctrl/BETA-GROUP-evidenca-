const { createClient } = window.supabase;
const sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $ = id => document.getElementById(id);
let currentUser = null, profile = null, entries = [];

function toast(text){ const t=$("toast"); t.textContent=text; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2800); }
function localDate(){ return new Date().toISOString().slice(0,10); }
function monthNow(){ return new Date().toISOString().slice(0,7); }
function fmtTime(v){ return v ? new Date(v).toLocaleTimeString("sl-SI",{hour:"2-digit",minute:"2-digit"}) : "—"; }
function fmtDate(v){ return new Date(v).toLocaleDateString("sl-SI"); }
function hoursBetween(a,b){ return a&&b ? Math.max(0,(new Date(b)-new Date(a))/3600000) : 0; }
function hoursText(h){ return `${h.toFixed(2)} h`; }
function mapLink(lat,lng){ return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`; }

async function init(){
  if(window.SUPABASE_URL.includes("YOUR-PROJECT")) {
    $("loginMsg").textContent="Najprej v datoteki config.js vnesi URL in anon key svojega Supabase projekta.";
    return;
  }
  const {data:{session}}=await sb.auth.getSession();
  if(session) await loadUser(session.user);
  sb.auth.onAuthStateChange(async (_event,session)=>{
    if(session) await loadUser(session.user); else showLogin();
  });
}
async function loadUser(user){
  currentUser=user;
  const {data:p,error}=await sb.from("profiles").select("*").eq("id",user.id).single();
  if(error){ $("loginMsg").textContent=error.message; return; }
  profile=p;
  $("loginView").classList.add("hidden"); $("mainView").classList.remove("hidden");
  $("welcomeTitle").textContent=profile.full_name ? `Pozdravljen, ${profile.full_name}` : "Moja evidenca delovnega časa";
  $("todayText").textContent=new Date().toLocaleDateString("sl-SI",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  $("monthPicker").value=monthNow(); $("adminMonth").value=monthNow();
  $("workerPanel").classList.toggle("hidden",profile.role!=="worker");
  $("adminPanel").classList.toggle("hidden",profile.role!=="admin");
  await refresh();
}
function showLogin(){ currentUser=null;profile=null;$("mainView").classList.add("hidden");$("loginView").classList.remove("hidden"); }

async function refresh(){
  if(!currentUser)return;
  await loadEntries($("monthPicker").value || monthNow());
  if(profile.role==="worker") await updateTodayState();
  if(profile.role==="admin") await loadAdmin();
}
async function loadEntries(month){
  const start=`${month}-01`;
  const d=new Date(`${month}-01T00:00:00`); d.setMonth(d.getMonth()+1);
  const end=d.toISOString().slice(0,10);
  let q=sb.from("time_entries").select("*,profiles(full_name,email)").gte("work_date",start).lt("work_date",end).order("work_date",{ascending:false});
  if(profile.role==="worker") q=q.eq("user_id",currentUser.id);
  const {data,error}=await q;
  if(error){toast(error.message);return}
  entries=data||[];
  renderEntries(entries);
}
function renderEntries(rows){
  $("entriesBody").innerHTML=rows.length?rows.map(e=>{
    const h=hoursBetween(e.arrival_at,e.departure_at);
    const loc=(e.arrival_lat!=null)?`<a target="_blank" href="${mapLink(e.arrival_lat,e.arrival_lng)}">Prihod</a>${e.departure_lat!=null?` · <a target="_blank" href="${mapLink(e.departure_lat,e.departure_lng)}">Odhod</a>`:""}`:"—";
    return `<tr><td>${fmtDate(e.work_date)}</td><td>${fmtTime(e.arrival_at)}</td><td>${fmtTime(e.departure_at)}</td><td>${hoursText(h)}</td><td>${loc}</td></tr>`;
  }).join(""):`<tr><td colspan="5">Ni vpisov za ta mesec.</td></tr>`;
  const total=rows.reduce((s,e)=>s+hoursBetween(e.arrival_at,e.departure_at),0);
  $("summaryCards").innerHTML=`<div class="summary">Skupaj<b>${hoursText(total)}</b></div><div class="summary">Dni z vpisom<b>${new Set(rows.map(x=>x.work_date)).size}</b></div><div class="summary">Povprečje/dan<b>${rows.length?hoursText(total/new Set(rows.map(x=>x.work_date)).size):"0.00 h"}</b></div>`;
}
async function updateTodayState(){
  const {data}=await sb.from("time_entries").select("*").eq("user_id",currentUser.id).eq("work_date",localDate()).maybeSingle();
  const inNow=data?.arrival_at && !data?.departure_at;
  $("arrivalBtn").disabled=!!data?.arrival_at;
  $("departureBtn").disabled=!inNow;
  $("statusBadge").textContent=inNow?"NA DELU":data?.departure_at?"ZAKLJUČENO":"NI VPISA";
  $("statusBadge").className="badge "+(inNow?"status-in":"status-out");
}
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error("Brskalnik ne podpira lokacije."));
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
}
async function punch(kind){
  $("locationStatus").textContent="Pridobivam trenutno lokacijo …";
  try{
    const pos=await getPosition(), lat=pos.coords.latitude,lng=pos.coords.longitude;
    const now=new Date().toISOString();
    const {data:existing}=await sb.from("time_entries").select("id,arrival_at,departure_at").eq("user_id",currentUser.id).eq("work_date",localDate()).maybeSingle();
    let result;
    if(kind==="arrival"){
      if(existing) throw new Error("Današnji prihod je že zabeležen.");
      result=await sb.from("time_entries").insert({user_id:currentUser.id,work_date:localDate(),arrival_at:now,arrival_lat:lat,arrival_lng:lng});
    }else{
      if(!existing?.arrival_at) throw new Error("Najprej zabeležite prihod.");
      if(existing.departure_at) throw new Error("Današnji odhod je že zabeležen.");
      result=await sb.from("time_entries").update({departure_at:now,departure_lat:lat,departure_lng:lng}).eq("id",existing.id);
    }
    if(result.error)throw result.error;
    $("locationStatus").textContent=`Lokacija shranjena: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    toast(kind==="arrival"?"Prihod je zabeležen.":"Odhod je zabeležen.");
    await refresh();
  }catch(e){ $("locationStatus").textContent=e.message; }
}
async function loadAdmin(){
  const month=$("adminMonth").value||monthNow();
  const {data:workers,error}=await sb.from("profiles").select("id,full_name,email,role").eq("role","worker").order("full_name");
  if(error){toast(error.message);return}
  const start=`${month}-01`;const d=new Date(`${month}-01T00:00:00`);d.setMonth(d.getMonth()+1);const end=d.toISOString().slice(0,10);
  const {data:all,error:e2}=await sb.from("time_entries").select("*,profiles(full_name,email)").gte("work_date",start).lt("work_date",end).order("work_date",{ascending:false});
  if(e2){toast(e2.message);return}
  const byUser={};(all||[]).forEach(e=>{byUser[e.user_id]=(byUser[e.user_id]||0)+hoursBetween(e.arrival_at,e.departure_at)});
  $("workersBody").innerHTML=workers?.length?workers.map(w=>`<tr><td>${w.full_name||"—"}</td><td>${w.email||"—"}</td><td>${hoursText(byUser[w.id]||0)}</td><td>${fmtTime((all||[]).find(x=>x.user_id===w.id)?.arrival_at)}</td></tr>`).join(""):`<tr><td colspan="4">Ni delavcev.</td></tr>`;
  const total=(all||[]).reduce((s,e)=>s+hoursBetween(e.arrival_at,e.departure_at),0);$("adminTotal").textContent=hoursText(total);
  $("locationList").innerHTML=(all||[]).flatMap(e=>{
    const name=e.profiles?.full_name||"Delavec";
    const out=[];
    if(e.arrival_lat!=null)out.push(`<div class="location-item"><b>${name}</b> · ${fmtDate(e.work_date)} · Prihod ${fmtTime(e.arrival_at)} · <a target="_blank" href="${mapLink(e.arrival_lat,e.arrival_lng)}">Odpri lokacijo prihoda</a></div>`);
    if(e.departure_lat!=null)out.push(`<div class="location-item"><b>${name}</b> · ${fmtDate(e.work_date)} · Odhod ${fmtTime(e.departure_at)} · <a target="_blank" href="${mapLink(e.departure_lat,e.departure_lng)}">Odpri lokacijo odhoda</a></div>`);
    return out;
  }).join("")||"<div class='location-item'>Ni lokacij za izbrani mesec.</div>";
}

$("loginForm").addEventListener("submit",async ev=>{
  ev.preventDefault();$("loginMsg").textContent="Prijavljam …";
  const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  $("loginMsg").textContent=error?error.message:"";
});
$("logoutBtn").addEventListener("click",()=>sb.auth.signOut());
$("arrivalBtn").addEventListener("click",()=>punch("arrival"));
$("departureBtn").addEventListener("click",()=>punch("departure"));
$("monthPicker").addEventListener("change",refresh);
$("adminMonth").addEventListener("change",loadAdmin);
$("workerForm").addEventListener("submit",async ev=>{
  ev.preventDefault();$("workerMsg").textContent="Ustvarjam delavca …";
  const {data:{session}}=await sb.auth.getSession();
  const res=await fetch(`${window.SUPABASE_URL}/functions/v1/create-worker`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({full_name:$("workerName").value.trim(),email:$("workerEmail").value.trim(),password:$("workerPassword").value})});
  const json=await res.json().catch(()=>({}));
  $("workerMsg").textContent=res.ok?"Delavec je uspešno dodan.":(json.error||"Napaka pri dodajanju.");
  if(res.ok){$("workerForm").reset();await loadAdmin();}
});
init();
