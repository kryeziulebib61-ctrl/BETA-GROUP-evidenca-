(() => {
const $=id=>document.getElementById(id), url=window.BETA_SUPABASE_URL, key=window.BETA_SUPABASE_KEY;
const configured=url&&key&&!url.includes("PASTE_")&&!key.includes("PASTE_");
const show=(id,yes)=>$(id).classList.toggle("hidden",!yes);
const msg=(id,t,bad=false)=>{$(id).textContent=t;$(id).classList.toggle("error",bad)};
let db,user,profile,exportRows=[];
if(!configured||!window.supabase){show("setupNotice",true);return}
db=window.supabase.createClient(url,key);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>new Date(v).toLocaleString("sl-SI",{dateStyle:"short",timeStyle:"short"});
const label=v=>v==="arrival"?"Prihod na delo":v==="departure"?"Odhod z dela":v;
const gps=r=>r.latitude!=null&&r.longitude!=null?`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`:"Ni podatka";
async function enter(u){
 user=u; const {data:p,error}=await db.from("workers").select("id,full_name,is_admin,active").eq("id",u.id).maybeSingle();
 if(error||!p||!p.active){await db.auth.signOut();show("loginPanel",true);msg("loginMessage","Uporabnik nima aktivnega profila. Obrnite se na administratorja.",true);return}
 profile=p;show("loginPanel",false);show("appPanel",true);show("adminPanel",!!p.is_admin);show("workerPanel",!p.is_admin);
 $("userEmail").textContent=u.email||p.full_name;$("userRole").textContent=p.is_admin?"Administrator":"Delavec";
 p.is_admin?await loadAdmin():await loadMine();
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();msg("loginMessage","Prijava ...");const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){msg("loginMessage","Prijava ni uspela. Preverite e-pošto in geslo.",true);return}await enter(data.user)});
$("logoutButton").addEventListener("click",async()=>{await db.auth.signOut();user=profile=null;show("appPanel",false);show("loginPanel",true);$("password").value=""});
function locationNow(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error("GPS ni podprt."));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),()=>reject(new Error("Dovolite dostop do lokacije in poskusite znova.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function clock(type){["arrivalButton","departureButton"].forEach(id=>$(id).disabled=true);msg("clockMessage","Pridobivanje lokacije in shranjevanje ...");try{const loc=await locationNow();const {error}=await db.rpc("clock_event",{p_event_type:type,p_latitude:loc.latitude,p_longitude:loc.longitude});if(error)throw error;msg("clockMessage",label(type)+" je zabeležen.");await loadMine()}catch(e){msg("clockMessage",e.message||"Zapisa ni bilo mogoče shraniti.",true)}finally{["arrivalButton","departureButton"].forEach(id=>$(id).disabled=false)}}
$("arrivalButton").addEventListener("click",()=>clock("arrival"));$("departureButton").addEventListener("click",()=>clock("departure"));
async function loadMine(){const {data,error}=await db.from("work_hours").select("id,event_type,event_time,latitude,longitude").eq("worker_id",user.id).order("event_time",{ascending:false}).limit(50);if(error){msg("clockMessage","Evidenca ni na voljo. Preverite povezavo.",true);return}$("myHours").innerHTML=(data||[]).map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td></tr>`).join("")||'<tr><td colspan="3">Še ni zapisov.</td></tr>'}
async function loadAdmin(){msg("adminMessage","Nalaganje podatkov ...");const [wr,hr]=await Promise.all([db.from("workers").select("id,full_name,active,is_admin").order("full_name"),db.from("work_hours").select("id,worker_id,event_type,event_time,latitude,longitude").order("event_time",{ascending:false}).limit(2000)]);if(wr.error||hr.error){msg("adminMessage","Podatkov ni mogoče naložiti. Preverite pravila dostopa.",true);return}const workers=wr.data||[], map=Object.fromEntries(workers.map(w=>[w.id,w]));$("workersTable").innerHTML=workers.map(w=>`<tr><td>${esc(w.full_name)}</td><td>${esc(w.id)}</td><td>${w.active?"Aktiven":"Neaktiven"}${w.is_admin?" · Administrator":""}</td></tr>`).join("")||'<tr><td colspan="3">Ni delavcev.</td></tr>';exportRows=(hr.data||[]).map(r=>({"Datum in ura":date(r.event_time),"Delavec":map[r.worker_id]?.full_name||r.worker_id,"Dogodek":label(r.event_type),"Latitude":r.latitude??"","Longitude":r.longitude??""}));$("allHours").innerHTML=(hr.data||[]).map(r=>`<tr><td>${esc(date(r.event_time))}</td><td>${esc(map[r.worker_id]?.full_name||r.worker_id)}</td><td>${esc(label(r.event_type))}</td><td>${esc(gps(r))}</td></tr>`).join("")||'<tr><td colspan="4">Ni zapisov.</td></tr>';msg("adminMessage",`Delavcev: ${workers.length}. Zapisov: ${exportRows.length}.`)}
$("refreshButton").addEventListener("click",loadAdmin);$("exportButton").addEventListener("click",()=>{if(!exportRows.length){msg("adminMessage","Ni zapisov za izvoz.");return}const cols=Object.keys(exportRows[0]),cell=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv="\uFEFF"+[cols.map(cell).join(";"),...exportRows.map(r=>cols.map(c=>cell(r[c])).join(";"))].join("\r\n"),blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="beta-group-evidenca-delovnih-ur.csv";a.click();URL.revokeObjectURL(a.href)});
db.auth.getSession().then(({data})=>data.session?enter(data.session.user):show("loginPanel",true));
db.auth.onAuthStateChange((_e,s)=>{if(!s){show("appPanel",false);show("loginPanel",true)}});
})();