// ═══ CONFIG ═══
const PIN='1009';
const SHEET_ID='1zmvSHTIKPIvuTdgyi4UnHDxqyuhBI_7IAyckAkxqXA8';
const API_KEY='AIzaSyBUtEVNLyx4LBp4L8mZixN8_3Io71haDlM';
const CLIENT_ID='616148935874-0b5ssnkeg245jl2phfqovlfg28scbqq3.apps.googleusercontent.com';
const SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const FOLDERS={matzip:'1X-tsQk9KMmQ1nUb7o8znLxDCOP-FZdpZ',date:'1gdf92XHQkk8UFXuTCJf_yRWtnJTAb288',culture:'1awOVwW5FF2JCDSIlk7NwtyD104ObJjlE',etc:'1whLBtJjtE5OQu8ydEGvOwRzbh4NJWN2C'};
const SHEETS={matzip:'맛집 기본',gourmet:'맛집 상세',date:'데이트_상세',culture:'영화',criteria:'별점가이드',favorites:'즐겨찾기',todo:'투두리스트',photo:'사진첩',settings:'설정'};
const STAR_OPTS=['0','0.5','1','1.5','2','2.5','3','3.5','4','4.5','5'];
const APP_VERSION='v1.0.0';

// ═══ STATE ═══
let db={matzip:[],gourmet:[],date:[],culture:[],criteria:[],favorites:[],todo:[],photo:[],settings:[]};
let isLight=false,authed=false,pinVal='';
let tokenClient,gapiLoaded=false,gisLoaded=false;
let curFormType=null,curFormItem=null,heroImgData=null,photosData=[];
let curDetailType=null,curDetailItem=null;
let newRowActive=false;
let todoFilter='전체';
let criteriaOpen=false;
let cultureFilter='전체';
let cultureSearch='';
let _pendingDraft=null;
let photoSelectMode=false;
const photoSelected=new Set();
// date form state
let dayEntries=[],hasEndDate=false,tripType='';
// culture form state
let cultureTypes=new Set();

// ═══ LOGIN ═══
function doGoogleLogin(){
  if(!tokenClient){toast('잠시만 기다려주세요...');return;}
  tokenClient.requestAccessToken({prompt:'consent'});
}
function initGapi(){
  const s1=document.createElement('script');s1.src='https://apis.google.com/js/api.js';
  s1.onload=()=>gapi.load('client',async()=>{
    await gapi.client.init({apiKey:API_KEY,discoveryDocs:['https://sheets.googleapis.com/$discovery/rest?version=v4']});
    gapiLoaded=true;checkAuto();
  });document.body.appendChild(s1);
  const s2=document.createElement('script');s2.src='https://accounts.google.com/gsi/client';
  s2.onload=()=>{
    tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,
      callback:r=>{if(!r.error){authed=true;showPinScreen();}}});
    gisLoaded=true;checkAuto();
  };document.body.appendChild(s2);
}
function checkAuto(){
  if(!gapiLoaded||!gisLoaded)return;
  if(gapi.client.getToken()){authed=true;showPinScreen();}
}
function showPinScreen(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('pin-screen').classList.remove('hidden');
  pinVal='';updatePinDots();
}
function doLogout(){
  const token=gapi.client.getToken();
  if(token){try{google.accounts.oauth2.revoke(token.access_token,()=>{});}catch(e){}}
  gapi.client.setToken(null);
  authed=false;
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').classList.remove('hidden');
}

// ═══ PIN ═══
function pinKey(k){
  if(pinVal.length>=4)return;
  pinVal+=k;updatePinDots();
  if(pinVal.length===4){
    const correctPin=localStorage.getItem('gonggong_pin')||PIN;
    setTimeout(()=>{
      if(pinVal===correctPin){document.getElementById('pin-screen').classList.add('hidden');startApp();}
      else{document.getElementById('pin-err').textContent='비밀번호가 틀렸어요 💔';pinVal='';updatePinDots();setTimeout(()=>document.getElementById('pin-err').textContent='',1500);}
    },100);
  }
}
function pinDel(){pinVal=pinVal.slice(0,-1);updatePinDots();}
function updatePinDots(){for(let i=0;i<4;i++)document.getElementById('d'+i).classList.toggle('filled',i<pinVal.length);}

// ═══ APP START ═══
function startApp(){
  const app=document.getElementById('app');app.style.display='flex';app.style.flexDirection='column';
  initDday();loadAll();initPullToRefresh();
  // 폼 입력 자동 임시저장 (이벤트 위임)
  const fo=document.getElementById('form-overlay');
  if(fo){fo.addEventListener('input',saveDraft,{capture:true});fo.addEventListener('change',saveDraft,{capture:true});}
  // 화면 회전/리사이즈 시 사진 그리드 재렌더
  let _photoResizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(_photoResizeTimer);
    _photoResizeTimer=setTimeout(()=>{
      if(document.getElementById('page-photo')?.classList.contains('active'))renderPhoto();
    },200);
  });
}
function initDday(){
  const kstNow=new Date(new Date().getTime()+9*3600000);
  const todayY=kstNow.getUTCFullYear(),todayM=kstNow.getUTCMonth(),todayD=kstNow.getUTCDate();
  const startY=2021,startM=9,startD=9;
  const startUtc=Date.UTC(startY,startM,startD);
  const todayUtc=Date.UTC(todayY,todayM,todayD);
  const totalDays=Math.floor((todayUtc-startUtc)/86400000);
  document.getElementById('dday-num').textContent='D+'+totalDays.toLocaleString();
  let y=todayY-startY;
  if(todayM<startM||(todayM===startM&&todayD<startD))y--;
  let remY=startY+y,remM=startM;
  let m=(todayY-remY)*12+(todayM-remM);
  if(todayD<startD)m--;
  const remDate=new Date(Date.UTC(remY,remM+m,startD));
  const diffDays=Math.floor((todayUtc-remDate.getTime())/86400000);
  const w=Math.floor(diffDays/7),d=diffDays%7;
  const parts=[];
  if(y>0)parts.push(y+'년');
  if(m>0)parts.push(m+'개월');
  if(w>0)parts.push(w+'주');
  if(d>0)parts.push(d+'일');
  document.getElementById('dday-detail').textContent=parts.length?(parts.join(' ')+'째'):'오늘';
}
function toggleTheme(){
  isLight=!isLight;document.body.classList.toggle('light',isLight);
  document.getElementById('theme-btn').textContent=isLight?'☀️':'🌙';
}
function goPage(p){
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(el=>el.classList.remove('active'));
  const pg=document.getElementById('page-'+p);if(pg)pg.classList.add('active');
  const nt=document.getElementById('nt-'+p);if(nt)nt.classList.add('active');
  document.querySelector('.content').scrollTo(0,0);
  if(p==='fav')renderFavorites();
  if(p==='todo')renderTodo();
  if(p==='settings')renderSettings();
  closeSidebar();
}

async function reloadData(){await loadAll();}

// ═══ HAMBURGER SIDEBAR ═══
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  if(!sb)return;
  if(sb.classList.contains('open'))closeSidebar();
  else{sb.classList.add('open');const ov=document.getElementById('sidebar-overlay');if(ov)ov.classList.add('open');}
}
function closeSidebar(){
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ═══ PULL TO REFRESH ═══
function initPullToRefresh(){
  const content=document.querySelector('.content');
  if(!content)return;
  let startY=0,pulling=false;
  const ind=document.getElementById('ptr-indicator');
  content.addEventListener('touchstart',e=>{
    startY=content.scrollTop===0?e.touches[0].clientY:0;
  },{passive:true});
  content.addEventListener('touchmove',e=>{
    if(!startY)return;
    const diff=e.touches[0].clientY-startY;
    if(diff>0&&diff<120){
      pulling=diff>70;
      if(ind){ind.style.transform=`translateY(${Math.min(diff*0.55,44)}px)`;ind.classList.toggle('ptr-ready',pulling);}
    }
  },{passive:true});
  content.addEventListener('touchend',()=>{
    if(pulling){
      if(ind)ind.classList.add('ptr-spin');
      loadAll().then(()=>{if(ind){ind.classList.remove('ptr-spin','ptr-ready');ind.style.transform='';}});
    }else{if(ind){ind.style.transform='';ind.classList.remove('ptr-ready','ptr-spin');}}
    startY=0;pulling=false;
  },{passive:true});
}

// ═══ SHEET OPS ═══
async function loadAll(){
  showLoading(true);
  try{await Promise.all(Object.entries(SHEETS).map(([k,v])=>loadSheet(k,v)));renderAll();}
  catch(e){toast('로드 실패: '+e.message);console.error(e);}
  showLoading(false);
}
async function loadSheet(key,name){
  try{
    const res=await gapi.client.sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:name});
    const rows=res.result.values||[];
    if(!rows.length){db[key]=[];return;}
    const hdrs=rows[0];
    db[key]=rows.slice(1).filter(r=>r.some(c=>c&&c.trim())).map((r,i)=>{const o={_row:i+2};hdrs.forEach((h,j)=>o[h]=r[j]||'');return o;});
  }catch(e){console.log('load err:',name,e);db[key]=[];}
}
async function appendRow(name,vals){
  return gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId:SHEET_ID,range:name,valueInputOption:'USER_ENTERED',resource:{values:[vals]}});
}
async function updateRow(name,row,vals){
  const range=`${name}!A${row}:ZZ${row}`;
  return gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId:SHEET_ID,range,valueInputOption:'USER_ENTERED',resource:{values:[vals]}});
}
async function deleteSheetRow(name,row){
  try{
    const sid=await getSheetId(name);
    await gapi.client.sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,
      resource:{requests:[{deleteDimension:{range:{sheetId:sid,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]}});
  }catch(e){throw new Error('삭제 실패: '+e.message);}
}
async function getSheetId(name){
  const res=await gapi.client.sheets.spreadsheets.get({spreadsheetId:SHEET_ID});
  return res.result.sheets.find(s=>s.properties.title===name)?.properties.sheetId??0;
}

// ═══ DRIVE UPLOAD ═══
async function uploadToDrive(base64,folderKey='etc'){
  if(!base64||!base64.startsWith('data:'))return base64||'';
  try{
    const blob=await fetch(base64).then(r=>r.blob());
    const folderId=FOLDERS[folderKey]||FOLDERS.etc;
    const meta={name:'img_'+Date.now()+'.jpg',mimeType:'image/jpeg',parents:[folderId]};
    const form=new FormData();
    form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
    form.append('file',blob);
    const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {method:'POST',headers:{Authorization:'Bearer '+gapi.client.getToken().access_token},body:form});
    const {id}=await res.json();
    await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`,
      {method:'POST',headers:{Authorization:'Bearer '+gapi.client.getToken().access_token,'Content-Type':'application/json'},
       body:JSON.stringify({role:'reader',type:'anyone'})});
    return `https://lh3.googleusercontent.com/d/${id}=s1000`;
  }catch(e){console.error('upload fail:',e);return '';}
}

// ═══ RENDER ALL ═══
function renderAll(){
  renderMatzipList();renderGourmet();renderDate();renderCulture();renderPhoto();
  loadCriteriaFromSheet();renderTicker();
  if(document.getElementById('page-todo')?.classList.contains('active'))renderTodo();
  if(document.getElementById('page-fav')?.classList.contains('active'))renderFavorites();
}

// ═══ TICKER ═══
function renderTicker(){
  const row=db.settings?.find(r=>r.구분==='ticker');
  const text=row?.내용||'';
  const wrap=document.getElementById('ticker-wrap');
  const el=document.getElementById('ticker-text');
  if(!wrap||!el)return;
  if(text){el.textContent=text+'      ·      '+text;wrap.style.display='';}
  else wrap.style.display='none';
}

// ═══ MATZIP ═══
function getTotal(item){return(parseFloat(item.공슐랭)||0)+(parseFloat(item.하슐랭)||0);}
function numToStars(n){
  if(isNaN(n)||n<=0)return'<span class="star empty">☆</span>'.repeat(5);
  const s=Math.min(5,Math.max(0,n));
  const full=Math.floor(s),half=(s-full)>=0.5?1:0,empty=5-full-half;
  return'<span class="star full">★</span>'.repeat(full)+(half?'<span class="star half">★</span>':'')+'<span class="star empty">☆</span>'.repeat(empty);
}
function starsAndNum(score){
  if(!score)return'-';const n=parseFloat(score);if(isNaN(n)||n<=0)return'-';
  return numToStars(n)+'<small style="color:var(--text2);margin-left:4px">'+n+'</small>';
}
function starsAndNum10(score){
  if(!score)return'-';const n=parseFloat(score);if(isNaN(n)||n<=0)return'-';
  return numToStars(n/2)+'<small style="color:var(--text2);margin-left:4px">'+n+'/10</small>';
}

function renderMatzipList(){
  const sorted=[...db.matzip].filter(i=>getTotal(i)>0).sort((a,b)=>getTotal(b)-getTotal(a));
  const groups=[];let rank=1,i=0;
  while(i<sorted.length&&groups.length<10){
    const score=getTotal(sorted[i]);
    const grp=sorted.filter(x=>getTotal(x)===score);
    if(groups.length+grp.length<=10||groups.length<10)groups.push({rank,items:grp,score});
    i+=grp.length;rank+=grp.length;
  }
  const medals=['🥇','🥈','🥉'];
  const rl=document.getElementById('rank-list');
  if(!groups.length){rl.innerHTML='<div style="font-size:13px;color:var(--text3);padding:8px 0">별점을 등록하면 랭킹이 표시돼요</div>';}
  else{rl.innerHTML=groups.flatMap(g=>g.items.map(item=>`
    <div class="rank-row">
      <div class="rank-badge">${g.rank<=3?medals[g.rank-1]:g.rank}</div>
      <div style="flex:1;min-width:0"><div class="rank-name" onclick="openMatzipDetail('${esc(item.가게명)}')">${esc(item.가게명)}</div><div class="rank-loc">${esc(item.장소)}</div></div>
      <div class="rank-score">${numToStars(g.score/2)} <small style="color:var(--text2);margin-left:4px">${g.score.toFixed(1)} / 10</small></div>
    </div>`)).join('');}
  const tbody=document.getElementById('matzip-tbody');
  if(!db.matzip.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text3)"><div style="font-size:34px;margin-bottom:8px">🍜</div>아래 버튼을 눌러 첫 맛집을 추가해보세요!</td></tr>`;return;}
  tbody.innerHTML=db.matzip.map((item,idx)=>{
    const total=getTotal(item);
    let hl='';
    if(total>=10)hl='hl-20';else if(total>=9.5)hl='hl-19';else if(total>=9)hl='hl-18';else if(total>=8.5)hl='hl-17';else if(total>=8)hl='hl-16';
    return`<tr class="list-row ${hl}" id="mrow-${item._row}">
      <td style="color:var(--text3);font-size:13px">${idx+1}</td>
      <td><button class="list-name-btn" onclick="openMatzipDetail('${esc(item.가게명)}')">${esc(item.가게명)}</button></td>
      <td style="color:var(--text2);white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis">${esc(item.장소)}</td>
      <td class="stars-cell">${starsAndNum(item.공슐랭)}</td>
      <td class="stars-cell">${starsAndNum(item.하슐랭)}</td>
      <td class="total-cell" style="color:${total>=8?'var(--accent)':'var(--text2)'}">${total>0?total.toFixed(1):'-'}</td>
      <td style="color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.메뉴)}</td>
      <td style="color:var(--text2);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.비고)}</td>
      <td><div class="action-cell">
        <button class="row-edit-btn" onclick="inlineEdit(${item._row})">수정</button>
        <button class="row-del-btn" onclick="confirmDelete('matzip',${item._row})" title="삭제">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

// 맛집 새 행 키보드 네비게이션
function nrKey(e,nextId,isLast){
  if(e.key!=='Enter')return;
  e.preventDefault();
  if(isLast){registerNewRow();return;}
  const nxt=document.getElementById(nextId);
  if(nxt){nxt.focus();if(nxt.select)nxt.select();}
}
// 인라인 편집 키보드 네비게이션
function ieKey(e,nextId,rowIdx,isLast){
  if(e.key!=='Enter')return;
  e.preventDefault();
  if(isLast){saveInlineEdit(rowIdx);return;}
  const nxt=document.getElementById(nextId);
  if(nxt){nxt.focus();if(nxt.select)nxt.select();}
}

function addNewRow(){
  if(window.innerWidth<=768){openForm('matzip');return;}
  if(newRowActive)return;
  newRowActive=true;
  document.getElementById('add-row-btn').style.display='none';
  const tbody=document.getElementById('matzip-tbody');
  const tr=document.createElement('tr');tr.className='new-row';tr.id='new-row';
  const starOpts=STAR_OPTS.map(v=>`<option value="${v}">${v}</option>`).join('');
  tr.innerHTML=`
    <td style="color:var(--text3)">*</td>
    <td><input id="nr-가게명" placeholder="가게명" autocomplete="off" onkeydown="nrKey(event,'nr-장소',false)" style="min-width:80px"></td>
    <td><input id="nr-장소" placeholder="장소" autocomplete="off" onkeydown="nrKey(event,'nr-메뉴',false)" style="min-width:60px"></td>
    <td><select id="nr-공슐랭" class="star-select"><option value="">-</option>${starOpts}</select></td>
    <td><select id="nr-하슐랭" class="star-select"><option value="">-</option>${starOpts}</select></td>
    <td>-</td>
    <td><input id="nr-메뉴" placeholder="메뉴" autocomplete="off" onkeydown="nrKey(event,'nr-비고',false)" style="min-width:80px"></td>
    <td><input id="nr-비고" placeholder="비고" autocomplete="off" onkeydown="nrKey(event,'',true)" style="min-width:60px"></td>
    <td><div class="action-cell">
      <button class="row-reg-btn" onclick="registerNewRow()">등록</button>
      <button class="row-cancel-btn" onclick="cancelNewRow()">취소</button>
    </div></td>`;
  tbody.appendChild(tr);
  requestAnimationFrame(()=>{
    const inp=document.getElementById('nr-가게명');
    if(inp){
      inp.focus();
      // restore scroll position after focus
      const wrap=document.querySelector('.list-table-wrap');
      if(wrap)setTimeout(()=>tr.scrollIntoView({block:'nearest',behavior:'smooth'}),80);
    }
  });
}

function cancelNewRow(){
  newRowActive=false;
  const tr=document.getElementById('new-row');if(tr)tr.remove();
  document.getElementById('add-row-btn').style.display='flex';
}

async function registerNewRow(){
  const name=document.getElementById('nr-가게명').value.trim();
  if(!name){toast('가게명을 입력해주세요');return;}
  showLoading(true);
  try{
    await appendRow(SHEETS.matzip,[name,
      document.getElementById('nr-장소').value.trim(),
      document.getElementById('nr-공슐랭').value,
      document.getElementById('nr-하슐랭').value,
      document.getElementById('nr-메뉴').value.trim(),
      document.getElementById('nr-비고').value.trim()]);
    toast('등록됐어요 ✓');newRowActive=false;await loadAll();
    document.getElementById('add-row-btn').style.display='flex';
  }catch(e){toast('등록 실패: '+e.message);}
  showLoading(false);
}

function inlineEdit(rowIdx){
  if(window.innerWidth<=768){const item=db.matzip.find(i=>i._row===rowIdx);if(item)openForm('matzip',item);return;}
  const item=db.matzip.find(i=>i._row===rowIdx);if(!item)return;
  const tr=document.getElementById('mrow-'+rowIdx);if(!tr)return;
  const idx=Array.from(tr.parentNode.children).indexOf(tr)+1;
  const starOpts=STAR_OPTS.map(v=>`<option value="${v}"${item.공슐랭===v?' selected':''}>${v}</option>`).join('');
  const starOpts2=STAR_OPTS.map(v=>`<option value="${v}"${item.하슐랭===v?' selected':''}>${v}</option>`).join('');
  const iStyle='background:var(--bg2);border:0.5px solid var(--border2);border-radius:7px;padding:5px 7px;font-size:13px;color:var(--text);font-family:var(--font-body);outline:none;width:100%';
  tr.innerHTML=`
    <td style="color:var(--text3)">${idx}</td>
    <td><input style="${iStyle};min-width:80px" id="ie-가게명-${rowIdx}" value="${esc(item.가게명)}" autocomplete="off" onkeydown="ieKey(event,'ie-장소-${rowIdx}',${rowIdx},false)"></td>
    <td><input style="${iStyle};min-width:60px" id="ie-장소-${rowIdx}" value="${esc(item.장소)}" autocomplete="off" onkeydown="ieKey(event,'ie-메뉴-${rowIdx}',${rowIdx},false)"></td>
    <td><select style="${iStyle};width:80px" id="ie-공슐랭-${rowIdx}"><option value="">-</option>${starOpts}</select></td>
    <td><select style="${iStyle};width:80px" id="ie-하슐랭-${rowIdx}"><option value="">-</option>${starOpts2}</select></td>
    <td>-</td>
    <td><input style="${iStyle};min-width:80px" id="ie-메뉴-${rowIdx}" value="${esc(item.메뉴)}" autocomplete="off" onkeydown="ieKey(event,'ie-비고-${rowIdx}',${rowIdx},false)"></td>
    <td><input style="${iStyle};min-width:60px" id="ie-비고-${rowIdx}" value="${esc(item.비고)}" autocomplete="off" onkeydown="ieKey(event,'',${rowIdx},true)"></td>
    <td><div class="action-cell">
      <button class="row-reg-btn" onclick="saveInlineEdit(${rowIdx})">저장</button>
      <button class="row-cancel-btn" onclick="renderMatzipList()">취소</button>
    </div></td>`;
}

async function saveInlineEdit(rowIdx){
  showLoading(true);
  try{
    await updateRow(SHEETS.matzip,rowIdx,[
      document.getElementById(`ie-가게명-${rowIdx}`).value.trim(),
      document.getElementById(`ie-장소-${rowIdx}`).value.trim(),
      document.getElementById(`ie-공슐랭-${rowIdx}`).value,
      document.getElementById(`ie-하슐랭-${rowIdx}`).value,
      document.getElementById(`ie-메뉴-${rowIdx}`).value.trim(),
      document.getElementById(`ie-비고-${rowIdx}`).value.trim()]);
    toast('수정됐어요 ✓');await loadAll();
  }catch(e){toast('수정 실패: '+e.message);}
  showLoading(false);
}

// ═══ CRITERIA (토글 방식) ═══
function toggleCriteria(){
  criteriaOpen=!criteriaOpen;
  const body=document.getElementById('criteria-body');
  const arrow=document.getElementById('criteria-arrow');
  const saveBtn=document.getElementById('criteria-save-btn');
  if(body)body.style.display=criteriaOpen?'block':'none';
  if(arrow)arrow.style.transform=criteriaOpen?'rotate(90deg)':'';
  if(saveBtn)saveBtn.style.display=criteriaOpen?'':'none';
  if(criteriaOpen){
    setTimeout(()=>{
      autoResize(document.getElementById('criteria-gong'));
      autoResize(document.getElementById('criteria-ha'));
    },0);
  }
}
function autoResize(el){
  if(!el)return;
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}
function loadCriteriaFromSheet(){
  if(!db.criteria||!db.criteria.length)return;
  const g=db.criteria.find(r=>r.구분==='공슐랭');
  const h=db.criteria.find(r=>r.구분==='하슐랭');
  const ga=document.getElementById('criteria-gong');
  const ha=document.getElementById('criteria-ha');
  if(g&&ga){ga.value=g.내용||'';autoResize(ga);}
  if(h&&ha){ha.value=h.내용||'';autoResize(ha);}
}
async function saveCriteriaToSheet(){
  showLoading(true);
  try{
    const gVal=document.getElementById('criteria-gong').value;
    const hVal=document.getElementById('criteria-ha').value;
    await gapi.client.sheets.spreadsheets.values.clear({spreadsheetId:SHEET_ID,range:SHEETS.criteria+'!A2:B100'});
    await appendRow(SHEETS.criteria,['공슐랭',gVal]);
    await appendRow(SHEETS.criteria,['하슐랭',hVal]);
    toast('가이드 저장됐어요 ✓');await loadSheet('criteria',SHEETS.criteria);
  }catch(e){toast('저장 실패: '+e.message);}
  showLoading(false);
}

// ═══ GOURMET ═══
function renderGourmet(){
  const grid=document.getElementById('gourmet-grid');
  const sorted=[...db.gourmet].sort((a,b)=>sortByDate(b.날짜,a.날짜));
  if(!sorted.length){grid.innerHTML=emptyState('🍽️','고오급 식당을 추가해보세요!');return;}
  grid.innerHTML=sorted.map(item=>{
    const faved=isFaved('gourmet',item._row);
    return`<div class="gcard">
      <button class="fav-btn" onclick="event.stopPropagation();toggleFav('gourmet',${item._row},'${esc(item.가게명)}','${esc(item.대표이미지)}')">${faved?'❤️':'🤍'}</button>
      <div onclick="showDetailPopup(db.gourmet.find(i=>i._row===${item._row}),'gourmet')">${imgOrPh(item.대표이미지,'4/3','🍽️')}</div>
      <div class="gcard-body" onclick="showDetailPopup(db.gourmet.find(i=>i._row===${item._row}),'gourmet')">
        <div class="gcard-name">${esc(item.가게명)}</div>
        ${item.가격?`<div class="gcard-sub">${esc(item.가격)}</div>`:''}
        ${item.날짜?`<div class="gcard-sub">${esc(item.날짜)}</div>`:''}
        ${item.해시태그?`<div class="gcard-tags">${item.해시태그.split(',').slice(0,3).map(t=>'#'+t.trim()).join(' ')}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ═══ DATE / TRAVEL ═══
function renderDate(){
  const grid=document.getElementById('date-grid');
  const sorted=[...db.date].sort((a,b)=>{
    const da=a.시작날짜||a.날짜||'',db2=b.시작날짜||b.날짜||'';
    return sortByDate(db2,da);
  });
  if(!sorted.length){grid.innerHTML=emptyState('📍','여행 기록을 추가해보세요!');return;}
  grid.innerHTML=sorted.map(item=>{
    const faved=isFaved('date',item._row);
    const dateStr=item.시작날짜||item.날짜||'';
    const guibn=item.구분||'';
    return`<div class="gcard">
      <button class="fav-btn" onclick="event.stopPropagation();toggleFav('date',${item._row},'${esc(item.장소)}','${esc(item.대표이미지)}')">${faved?'❤️':'🤍'}</button>
      <div onclick="showDetailPopup(db.date.find(i=>i._row===${item._row}),'date')">${imgOrPh(item.대표이미지,'4/3','📸')}</div>
      <div class="gcard-body" onclick="showDetailPopup(db.date.find(i=>i._row===${item._row}),'date')">
        <div class="gcard-name">${esc(item.장소)}</div>
        <div class="gcard-sub">${esc(dateStr)}${guibn?' · '+esc(guibn):''}</div>
        ${item.한줄평?`<div class="gcard-tags">${esc(item.한줄평)}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ═══ CULTURE ═══
function setCultureFilter(f){cultureFilter=f;renderCulture();}
function setCultureSearch(val){cultureSearch=val;renderCulture();}
function renderCulture(){
  // filter bar
  const fb=document.getElementById('culture-filter-bar');
  if(fb){
    const types=['전체',...new Set(db.culture.flatMap(i=>(i['해시태그_종류']||'').split(',').map(t=>t.trim())).filter(Boolean))];
    fb.innerHTML=types.map(t=>`<button class="filter-chip${cultureFilter===t?' active':''}" onclick="setCultureFilter('${t}')">${t}</button>`).join('')
      +`<input class="filter-search" type="text" placeholder="검색..." value="${esc(cultureSearch)}" oninput="setCultureSearch(this.value)">`;
  }
  const grid=document.getElementById('culture-grid');
  let list=cultureFilter==='전체'?[...db.culture]:[...db.culture].filter(i=>(i['해시태그_종류']||'').split(',').map(t=>t.trim()).includes(cultureFilter));
  if(cultureSearch){
    const q=cultureSearch.toLowerCase();
    list=list.filter(i=>(i.영화명||'').toLowerCase().includes(q)||(i.한줄평||'').toLowerCase().includes(q)||(i['해시태그_종류']||'').toLowerCase().includes(q)||(i['해시태그_장르']||'').toLowerCase().includes(q));
  }
  const sorted=list.sort((a,b)=>sortByDate(b.날짜,a.날짜));
  if(!sorted.length){grid.innerHTML=emptyState('🎬','문화생활을 기록해보세요!');return;}
  grid.innerHTML=sorted.map(item=>{
    const faved=isFaved('culture',item._row);
    const imgEl=item.대표이미지?`<img src="${item.대표이미지}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.parentNode.innerHTML='<div class=movie-poster-ph>🎬</div>'">`:`<div class="movie-poster-ph">🎬</div>`;
    const tags=[item['해시태그_종류'],item['해시태그_장르']].filter(Boolean).join(' · ');
    return`<div class="movie-card" onclick="showDetailPopup(db.culture.find(i=>i._row===${item._row}),'culture')">
      <button class="fav-btn" style="top:6px;right:6px;z-index:3" onclick="event.stopPropagation();toggleFav('culture',${item._row},'${esc(item.영화명)}','${esc(item.대표이미지)}')">${faved?'❤️':'🤍'}</button>
      <div class="movie-poster-wrap">${imgEl}</div>
      <div class="movie-info">
        <div>
          <div class="movie-title">${esc(item.영화명)}</div>
          <div class="movie-date">${esc(item.날짜)}${tags?' · '+esc(tags):''}</div>
          <div class="movie-stars">${starsAndNum10(item.별점)}</div>
        </div>
        <div class="movie-review">${esc(item.한줄평)}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══ PHOTO (그리드 직접 표시, + 카드) ═══
function renderPhoto(){
  const grid=document.getElementById('photo-grid');
  const sorted=[...db.photo].sort((a,b)=>sortByDate(b.날짜,a.날짜));
  const items=sorted.map(item=>({item,url:getPhotoUrl(item)})).filter(({url})=>url);
  const n=window.innerWidth>=900?5:window.innerWidth>=600?3:2;
  if(photoSelectMode){
    if(!items.length){grid.innerHTML=`<div class="photo-col" style="flex:unset;width:100%"><div style="padding:40px;text-align:center;color:var(--text3)">사진이 없어요</div></div>`;return;}
    const cols=Array.from({length:n},()=>[]);
    items.forEach(({item,url},i)=>{
      const sel=photoSelected.has(item._row);
      cols[i%n].push(`<div class="photo-item${sel?' selected':''}" data-row="${item._row}" onclick="togglePhotoSelectItem(${item._row})">
        <img src="${url}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="photo-check"></div>
      </div>`);
    });
    grid.innerHTML=cols.map(c=>`<div class="photo-col">${c.join('')}</div>`).join('');
    return;
  }
  const addCard=`<div class="photo-item photo-add-card" onclick="document.getElementById('photo-tab-file').click()"><div class="photo-add-icon">＋</div></div>`;
  if(!items.length){grid.innerHTML=`<div class="photo-col" style="flex:unset;width:100%">${addCard}</div>`;return;}
  const cols=Array.from({length:n},()=>[]);
  cols[0].push(addCard);
  items.forEach(({item,url},i)=>{
    cols[(i+1)%n].push(`<div class="photo-item" onclick="openLbox('${url}')">
      <img src="${url}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
      <button class="photo-item-del" onclick="event.stopPropagation();confirmDelete('photo',${item._row})">✕</button>
    </div>`);
  });
  grid.innerHTML=cols.map(c=>`<div class="photo-col">${c.join('')}</div>`).join('');
}
function togglePhotoSelectMode(){
  photoSelectMode=!photoSelectMode;
  photoSelected.clear();
  document.getElementById('photo-select-toggle').textContent=photoSelectMode?'✕ 취소':'☑ 선택';
  document.getElementById('photo-select-bar').classList.toggle('active',photoSelectMode);
  document.getElementById('photo-sel-count').textContent='0장 선택';
  renderPhoto();
}
function togglePhotoSelectItem(row){
  if(photoSelected.has(row))photoSelected.delete(row);
  else photoSelected.add(row);
  document.getElementById('photo-sel-count').textContent=`${photoSelected.size}장 선택`;
  const el=document.querySelector(`.photo-item[data-row="${row}"]`);
  if(el)el.classList.toggle('selected',photoSelected.has(row));
}
function selectAllPhotos(){
  const all=document.querySelectorAll('.photo-item[data-row]');
  const allSelected=photoSelected.size===all.length&&all.length>0;
  if(allSelected){
    photoSelected.clear();
    all.forEach(el=>el.classList.remove('selected'));
  } else {
    all.forEach(el=>{photoSelected.add(Number(el.dataset.row));el.classList.add('selected');});
  }
  document.getElementById('photo-sel-count').textContent=`${photoSelected.size}장 선택`;
}
async function bulkDeletePhotos(){
  if(!photoSelected.size){toast('선택된 사진이 없어요');return;}
  const n=photoSelected.size;
  if(!confirm(`선택한 ${n}장을 삭제할까요?`))return;
  showLoading(true);
  const rows=[...photoSelected].sort((a,b)=>b-a);
  for(const row of rows){
    try{await deleteSheetRow(SHEETS.photo,row);}
    catch(e){console.error('삭제 실패:',e);}
  }
  photoSelectMode=false;
  photoSelected.clear();
  document.getElementById('photo-select-toggle').textContent='☑ 선택';
  document.getElementById('photo-select-bar').classList.remove('active');
  toast(`${n}장 삭제 완료`);
  await loadAll();
  showLoading(false);
}
async function onPhotoTabFile(e){
  const files=Array.from(e.target.files).slice(0,15);
  if(!files.length)return;
  e.target.value='';
  const today=new Date().toISOString().slice(0,10);
  const total=files.length;
  let uploaded=0;
  showLoading(true);
  toast(`업로드 중... 0/${total}`);

  // 1단계: Drive 업로드 병렬 처리 (개별 실패는 건너뜀)
  const results=await Promise.allSettled(files.map(async f=>{
    const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(f);});
    const url=await uploadToDrive(dataUrl,'etc');
    if(!url)throw new Error('drive upload failed');
    toast(`업로드 중... ${++uploaded}/${total}`);
    return url;
  }));

  // 2단계: 성공한 URL만 Sheets에 순차 저장 (동시 저장 시 충돌 방지)
  const urls=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const failCount=total-urls.length;
  for(const url of urls){
    try{await appendRow(SHEETS.photo,[url,'',today,'']);}
    catch(err){console.error('시트 저장 실패:',err);}
  }

  // 3단계: 결과 안내
  if(failCount===0)toast(`${total}장 모두 업로드 완료 ✓`);
  else toast(`${total}장 중 ${urls.length}장 업로드 완료 (${failCount}장 실패)`);

  await loadAll();
  showLoading(false);
}

// ═══ FAVORITES ═══
function isFaved(type,rowIdx){
  if(!db[type]?.find(i=>i._row===rowIdx))return false;
  return db.favorites.some(f=>f.타입===type&&f.ID===String(rowIdx));
}
async function deleteFavsFor(type,rowIdx){
  const fav=db.favorites.find(f=>f.타입===type&&f.ID===String(rowIdx));
  if(fav)try{await deleteSheetRow(SHEETS.favorites,fav._row);}catch(e){console.warn('즐겨찾기 삭제 실패:',e);}
}
async function toggleFav(type,rowIdx,name,img){
  const existing=db.favorites.find(f=>f.타입===type&&f.ID===String(rowIdx));
  showLoading(true);
  try{
    if(existing){await deleteSheetRow(SHEETS.favorites,existing._row);toast('즐겨찾기 해제');}
    else{await appendRow(SHEETS.favorites,[type,String(rowIdx),name,img,new Date().toISOString().slice(0,10)]);toast('즐겨찾기 추가 ❤️');}
    await loadSheet('favorites',SHEETS.favorites);renderAll();
    if(document.getElementById('page-fav').classList.contains('active'))renderFavorites();
  }catch(e){toast('오류: '+e.message);}
  showLoading(false);
}
function renderFavorites(){
  const wrap=document.getElementById('fav-wrap');
  if(!db.favorites.length){wrap.innerHTML='<div style="text-align:center;padding:48px;color:var(--text3)"><div style="font-size:44px;margin-bottom:12px">❤️</div>즐겨찾기한 항목이 없어요</div>';return;}
  const groups={gourmet:[],date:[],culture:[]};
  db.favorites.forEach(f=>{if(groups[f.타입])groups[f.타입].push(f);});
  const labels={gourmet:'고오급',date:'여행',culture:'문화생활'};
  let html='';
  Object.entries(groups).forEach(([type,items])=>{
    if(!items.length)return;
    html+=`<div class="fav-section-title">${labels[type]||type}</div><div class="gallery-grid-4">`;
    html+=items.map(f=>`
      <div class="gcard" onclick="openFavDetail('${f.타입}',${f.ID})">
        <button class="fav-btn" onclick="event.stopPropagation();toggleFav('${f.타입}',${f.ID},'${esc(f['가게명또는제목'])}','${esc(f.대표이미지)}')">❤️</button>
        ${imgOrPh(f.대표이미지,'4/3','⭐')}
        <div class="gcard-body"><div class="gcard-name">${esc(f['가게명또는제목'])}</div><div class="gcard-sub">${esc(f.날짜)}</div></div>
      </div>`).join('');
    html+='</div>';
  });
  wrap.innerHTML=html;
}
function openFavDetail(type,rowIdx){
  const item=db[type]?.find(i=>i._row===parseInt(rowIdx));
  if(!item){toast('항목을 찾을 수 없어요');return;}
  curDetailType=type;curDetailItem=item;showDetailPopup(item,type);
}

// ═══ TODO ═══
function renderTodo(){
  const filters=['전체','맛집','여행','데이트','문화생활','기타'];
  document.getElementById('todo-filters').innerHTML=filters.map(f=>
    `<button class="todo-filter ${todoFilter===f?'active':''}" onclick="setTodoFilter('${f}')">${f}</button>`).join('');
  const items=todoFilter==='전체'?db.todo:db.todo.filter(i=>i.해시태그===todoFilter);
  const list=document.getElementById('todo-list');
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:36px;color:var(--text3)"><div style="font-size:36px;margin-bottom:8px">📝</div>할 일을 추가해보세요!</div>';return;}
  list.innerHTML=items.map(item=>`
    <div class="todo-card" onclick="showTodoDetail(${item._row})" style="cursor:pointer">
      <div class="todo-card-img">${item.대표이미지?`<img src="${item.대표이미지}" alt="">`:`<div class="todo-card-img-ph">📝</div>`}</div>
      <div class="todo-card-body">
        <div class="todo-card-title">
          <div class="todo-check ${item.완료여부==='완료'?'done':''}" onclick="event.stopPropagation();toggleTodoDone(${item._row},this)">${item.완료여부==='완료'?'✓':''}</div>
          <span style="${item.완료여부==='완료'?'text-decoration:line-through;color:var(--text3)':''}">${esc(item.제목)}</span>
        </div>
        <div class="todo-memo">${esc(item.메모)}</div>
        ${item.해시태그?`<div class="todo-tag">#${esc(item.해시태그)}</div>`:''}
      </div>
    </div>`).join('');
}
function setTodoFilter(f){todoFilter=f;renderTodo();}
function showTodoDetail(rowIdx){
  const item=db.todo.find(i=>i._row===rowIdx);if(!item)return;
  curDetailType='todo';curDetailItem=item;
  document.getElementById('detail-popup-title').textContent=item.제목||'';
  document.getElementById('detail-write-btn').style.display='none';
  document.getElementById('detail-edit-btn').style.display='flex';
  let body='';
  if(item.대표이미지)body+=`<img class="detail-hero" src="${item.대표이미지}" alt="" onerror="this.style.display='none'">`;
  else body+=`<div class="detail-hero-ph">📝</div>`;
  body+=`<div class="detail-title">${esc(item.제목)}</div><div class="detail-props">`;
  if(item.날짜)body+=dProp('날짜',item.날짜);
  if(item.해시태그)body+=dProp('태그','#'+item.해시태그);
  body+=dProp('상태',item.완료여부==='완료'?'✅ 완료':'⬜ 미완료');
  body+='</div>';
  if(item.메모)body+=`<div class="detail-sec"><div class="detail-sec-title">메모</div><div class="detail-text">${esc(item.메모)}</div></div>`;
  body+=`<div class="detail-del-footer"><button class="detail-del-btn-bottom" onclick="deleteFromDetail()">삭제하기</button></div>`;
  document.getElementById('detail-popup-body').innerHTML=body;
  document.getElementById('detail-overlay').classList.add('open');
}
async function toggleTodoDone(rowIdx,el){
  const item=db.todo.find(i=>i._row===rowIdx);if(!item)return;
  const newVal=item.완료여부==='완료'?'':'완료';
  showLoading(true);
  try{
    await updateRow(SHEETS.todo,rowIdx,[item.제목,item.메모,item.해시태그,item.대표이미지,newVal,item.날짜]);
    await loadSheet('todo',SHEETS.todo);renderTodo();
  }catch(e){toast('오류: '+e.message);}
  showLoading(false);
}
function openFormEdit(type,rowIdx){
  const item=db[type]?.find(i=>i._row===rowIdx);
  if(item)openForm(type,item);
}

// ═══ SETTINGS ═══
function renderSettings(){
  const tickerRow=db.settings?.find(r=>r.구분==='ticker');
  const el=document.getElementById('settings-ticker');
  if(el)el.value=tickerRow?.내용||'';
}
function savePin(){
  const np=(document.getElementById('settings-new-pin')?.value||'').trim();
  const cp=(document.getElementById('settings-confirm-pin')?.value||'').trim();
  if(!np||np.length!==4||!/^\d{4}$/.test(np)){toast('4자리 숫자를 입력해주세요');return;}
  if(np!==cp){toast('PIN이 일치하지 않아요 💔');return;}
  localStorage.setItem('gonggong_pin',np);
  toast('PIN이 변경됐어요 ✓');
  document.getElementById('settings-new-pin').value='';
  document.getElementById('settings-confirm-pin').value='';
}
async function saveTicker(){
  const text=document.getElementById('settings-ticker')?.value||'';
  showLoading(true);
  try{
    await gapi.client.sheets.spreadsheets.values.clear({spreadsheetId:SHEET_ID,range:SHEETS.settings+'!A2:B100'});
    await appendRow(SHEETS.settings,['ticker',text]);
    toast('저장됐어요 ✓');
    await loadSheet('settings',SHEETS.settings);
    renderTicker();
  }catch(e){toast('저장 실패: '+e.message);}
  showLoading(false);
}

// ═══ DRAFT (임시저장) ═══
const DRAFT_TYPES=['gourmet','date','culture','todo'];
function saveDraft(){
  if(!curFormType||curFormItem)return;
  if(!DRAFT_TYPES.includes(curFormType))return;
  try{
    const data={};
    document.querySelectorAll('#form-body input[id],#form-body textarea[id],#form-body select[id]').forEach(el=>{if(el.id)data[el.id]=el.value;});
    if(curFormType==='date'){
      data._tripType=tripType;
      data._hasEndDate=hasEndDate;
      data._dayEntries=dayEntries.map((_,i)=>document.getElementById('day-text-'+i)?.value||'');
    }
    if(curFormType==='culture')data._cultureTypes=[...cultureTypes];
    localStorage.setItem('draft_'+curFormType,JSON.stringify(data));
  }catch(e){}
}
function clearDraft(type){try{localStorage.removeItem('draft_'+type);}catch(e){}}
function restoreDraft(draft,type){
  if(!draft)return;
  Object.entries(draft).forEach(([id,val])=>{
    if(id.startsWith('_'))return;
    const el=document.getElementById(id);if(el)el.value=val;
  });
  if(type==='date'){
    if(draft._tripType){
      tripType=draft._tripType;
      document.querySelectorAll('.trip-type-btn').forEach(b=>{if(b.dataset.type===tripType)b.classList.add('active');});
    }
    if(draft._hasEndDate&&!hasEndDate){
      hasEndDate=true;
      renderEndDateField('');
      setTimeout(()=>{
        ['f-종료날짜-y','f-종료날짜-m','f-종료날짜-d'].forEach(id=>{const el=document.getElementById(id);if(el&&draft[id])el.value=draft[id];});
        updateTripDuration();
      },50);
    }
    if(draft._dayEntries?.length){dayEntries=draft._dayEntries;renderDayEntries();}
  }
  if(type==='culture'&&draft._cultureTypes){
    cultureTypes=new Set(draft._cultureTypes);
    document.querySelectorAll('.culture-type-btn').forEach(b=>{if(cultureTypes.has(b.dataset.type))b.classList.add('active');});
    renderCultureExtraFields();
    setTimeout(()=>{Object.entries(draft).forEach(([id,val])=>{if(id.startsWith('cf-')){const el=document.getElementById(id);if(el)el.value=val;}});},0);
  }
  if(type==='culture'){const s=document.getElementById('f-별점')?.value;if(s)updateStarDisplay10('f-별점',s);}
  setTimeout(()=>document.querySelectorAll('#form-body .ftarea').forEach(autoResize),0);
}
function showDraftRestorePrompt(onRestore,onDiscard){
  const ov=document.getElementById('draft-restore-overlay');
  ov.classList.add('open');
  document.getElementById('draft-restore-btn').onclick=()=>{ov.classList.remove('open');onRestore();};
  document.getElementById('draft-discard-btn').onclick=()=>{ov.classList.remove('open');onDiscard();};
}

// ═══ DETAIL POPUP ═══
function showDetailPopup(item,type){
  if(!item)return;
  curDetailType=type;curDetailItem=item;
  const name=type==='culture'?item.영화명:type==='date'?item.장소:item.가게명;
  document.getElementById('detail-popup-title').textContent=name||'';
  document.getElementById('detail-write-btn').style.display='none';
  document.getElementById('detail-edit-btn').style.display='flex';
  let body='';
  if(type==='culture'){
    body+=item.대표이미지?`<img class="detail-poster" src="${item.대표이미지}" alt="" onerror="this.style.display='none'">`:`<div class="detail-hero-ph">🎬</div>`;
  }else{
    body+=item.대표이미지?`<img class="detail-hero" src="${item.대표이미지}" alt="" onclick="openLbox('${item.대표이미지}')" onerror="this.style.display='none'">`:`<div class="detail-hero-ph">${type==='date'?'📸':'🍽️'}</div>`;
  }
  body+=`<div class="detail-title">${esc(name)}</div><div class="detail-props">`;
  if(type==='gourmet'){
    if(item.날짜)body+=dProp('날짜',item.날짜);
    if(item.가격)body+=dProp('가격',item.가격);
    if(item.해시태그)body+=dProp('태그',item.해시태그);
    const basic=db.matzip.find(m=>m.가게명===item.가게명);
    if(basic?.공슐랭)body+=dPropHtml('공슐랭',starsAndNum(basic.공슐랭));
    if(basic?.하슐랭)body+=dPropHtml('하슐랭',starsAndNum(basic.하슐랭));
  }
  if(type==='date'){
    const dateStr=item.시작날짜||item.날짜||'';
    const endStr=item.종료날짜||'';
    if(dateStr)body+=dProp('날짜',dateStr+(endStr?' ~ '+endStr:''));
    if(item.구분)body+=dProp('구분',item.구분);
    if(item['해시태그_여행종류'])body+=dProp('여행',item['해시태그_여행종류']);
    if(item['해시태그_위치'])body+=dProp('위치',item['해시태그_위치']);
    if(item['해시태그_장소'])body+=dProp('장소상세',item['해시태그_장소']);
    if(item['해시태그_기념일'])body+=dProp('기념일',item['해시태그_기념일']);
    if(item.한줄평)body+=dProp('한줄평',item.한줄평);
    if(item.일차)body+=dProp('일차',item.일차);
  }
  if(type==='culture'){
    if(item.날짜){
      const datePart=item.날짜.slice(0,10);
      const timePart=item.날짜.slice(11,16);
      body+=dProp('날짜',datePart+(timePart?` ${timePart}`:''));
    }
    if(item.별점)body+=dPropHtml('별점',starsAndNum10(item.별점));
    if(item['해시태그_종류'])body+=dProp('종류',item['해시태그_종류']);
    if(item['해시태그_장르'])body+=dProp('장르',item['해시태그_장르']);
    if(item['해시태그_위치'])body+=dProp('위치/국가',item['해시태그_위치']);
    if(item['해시태그_기타'])body+=dProp('감독/기타',item['해시태그_기타']);
    if(item.한줄평)body+=dProp('한줄평',item.한줄평);
  }
  body+='</div>';
  if(type==='gourmet'){
    if(item.메뉴상세)body+=`<div class="detail-sec"><div class="detail-sec-title">메뉴 상세</div><div class="detail-text">${esc(item.메뉴상세)}</div></div>`;
    if(item.메모)body+=`<div class="detail-sec"><div class="detail-sec-title">메모</div><div class="detail-text">${esc(item.메모)}</div></div>`;
  }
  if(type==='date'){
    const travelText=item.여행기록||item.데이트기록||'';
    if(travelText)body+=`<div class="detail-sec"><div class="detail-sec-title">여행 기록</div><div class="detail-text">${esc(travelText)}</div></div>`;
  }
  const photos=[];
  for(let i=1;i<=15;i++){const u=normalizeImgUrl(item['사진'+i]);if(u)photos.push(u);}
  if(photos.length)body+=`<div class="detail-sec"><div class="detail-sec-title">사진 (${photos.length}장)</div><div class="photo-scroll-wrap"><button class="scroll-btn left" onclick="scrollPhotos(this,-1)">&#8249;</button><div class="photo-scroll">${photos.map(p=>`<img src="${p}" onclick="openLbox('${p}')" onerror="this.style.display='none'">`).join('')}</div><button class="scroll-btn right" onclick="scrollPhotos(this,1)">&#8250;</button></div></div>`;
  body+=`<div class="detail-del-footer"><button class="detail-del-btn-bottom" onclick="deleteFromDetail()">삭제하기</button></div>`;
  document.getElementById('detail-popup-body').innerHTML=body;
  document.getElementById('detail-overlay').classList.add('open');
}
function dProp(k,v){return`<div class="detail-prop"><span class="detail-prop-k">${k}</span><span class="detail-prop-v">${esc(String(v))}</span></div>`;}
function dPropHtml(k,v){return`<div class="detail-prop"><span class="detail-prop-k">${k}</span><span class="detail-prop-v">${v}</span></div>`;}
function scrollPhotos(btn,dir){const sc=btn.closest('.photo-scroll-wrap').querySelector('.photo-scroll');sc.scrollBy({left:dir*220,behavior:'smooth'});}
function closeDetailDirect(){document.getElementById('detail-overlay').classList.remove('open');}
function openFormFromDetail(){closeDetailDirect();openForm('gourmet',null,curDetailItem?.가게명||'');}
function editFromDetail(){closeDetailDirect();openForm(curDetailType,curDetailItem);}
function deleteFromDetail(){
  const type=curDetailType,item=curDetailItem;
  showConfirm(async()=>{
    showLoading(true);
    const imgUrls=getItemImageUrls(type,item._row);
    try{await deleteSheetRow(SHEETS[type],item._row);await deleteFavsFor(type,item._row);closeDetailDirect();toast('삭제됐어요');await loadAll();}
    catch(e){toast('삭제 실패: '+e.message);showLoading(false);return;}
    showLoading(false);
    if(imgUrls.length)deleteDriveFiles(imgUrls);
  });
}
function openMatzipDetail(name){
  const gourmet=db.gourmet.find(i=>i.가게명===name);
  const basic=db.matzip.find(i=>i.가게명===name);
  if(gourmet){curDetailType='gourmet';curDetailItem=gourmet;showDetailPopup(gourmet,'gourmet');}
  else if(basic){
    curDetailType='gourmet';curDetailItem=basic;
    document.getElementById('detail-popup-title').textContent=basic.가게명||'';
    document.getElementById('detail-write-btn').style.display='flex';
    document.getElementById('detail-edit-btn').style.display='none';
    let body=`<div class="detail-hero-ph">🍽️</div><div class="detail-title">${esc(basic.가게명)}</div><div class="detail-props">`;
    if(basic.장소)body+=dProp('장소',basic.장소);
    if(basic.공슐랭)body+=dPropHtml('공슐랭',starsAndNum(basic.공슐랭));
    if(basic.하슐랭)body+=dPropHtml('하슐랭',starsAndNum(basic.하슐랭));
    if(basic.메뉴)body+=dProp('메뉴',basic.메뉴);
    body+=`</div><div style="margin:16px 20px;font-size:13px;color:var(--text3)">상세 기록이 없어요. 글을 남겨보세요!</div>`;
    document.getElementById('detail-popup-body').innerHTML=body;
    document.getElementById('detail-overlay').classList.add('open');
  }
}

// ═══ CONFIRM ═══
let _confirmCb=null;
function showConfirm(cb,msg=''){
  _confirmCb=cb;
  const msgEl=document.getElementById('confirm-msg');
  if(msgEl)msgEl.innerHTML=`정말로 삭제하시겠어요?${msg?'<br><span style="font-size:12px;color:var(--accent)">'+msg+'</span>':''}<br><span style="font-size:13px;color:var(--text3)">이 작업은 되돌릴 수 없어요.</span>`;
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-ok-btn').onclick=()=>{closeConfirm();_confirmCb&&_confirmCb();};
}
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('open');}
function confirmDelete(type,rowIdx){
  const matzipName=type==='matzip'?(db.matzip.find(m=>m._row===rowIdx)?.가게명||''):'';
  const linkedGourmet=matzipName?db.gourmet.filter(g=>g.가게명===matzipName):[];
  const extraMsg=linkedGourmet.length?`고오급 탭 기록 ${linkedGourmet.length}개도 함께 삭제됩니다.`:'';
  showConfirm(async()=>{
    showLoading(true);
    const imgUrls=getItemImageUrls(type,rowIdx);
    try{
      await deleteSheetRow(SHEETS[type],rowIdx);await deleteFavsFor(type,rowIdx);
      for(const g of [...linkedGourmet].sort((a,b)=>b._row-a._row)){
        const gImgs=getItemImageUrls('gourmet',g._row);
        try{await deleteSheetRow(SHEETS.gourmet,g._row);await deleteFavsFor('gourmet',g._row);if(gImgs.length)deleteDriveFiles(gImgs);}
        catch(e){console.warn('고오급 삭제 실패:',e);}
      }
      toast('삭제됐어요');await loadAll();
    }catch(e){toast('삭제 실패: '+e.message);showLoading(false);return;}
    showLoading(false);
    if(imgUrls.length)deleteDriveFiles(imgUrls);
  },extraMsg);
}

// ═══ FORM ═══
// 날짜 선택 (3 셀렉트: 년/월/일)
function fgdate(key,label,val=''){
  if(!val){const t=new Date();val=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;}
  const parts=(val||'').split('-');
  const y=parts[0]||'',m=parts[1]||'',d=parts[2]||'';
  const ys=Array.from({length:13},(_,i)=>2018+i);
  const yOpts=`<option value="">년</option>`+ys.map(yr=>`<option value="${yr}"${String(yr)===y?' selected':''}>${yr}</option>`).join('');
  const mOpts=`<option value="">월</option>`+Array.from({length:12},(_,i)=>i+1).map(mo=>{
    const mv=String(mo).padStart(2,'0');return`<option value="${mv}"${mv===m?' selected':''}>${mo}월</option>`;
  }).join('');
  const dOpts=`<option value="">일</option>`+Array.from({length:31},(_,i)=>i+1).map(dy=>{
    const dv=String(dy).padStart(2,'0');return`<option value="${dv}"${dv===d?' selected':''}>${dy}일</option>`;
  }).join('');
  return`<div class="fg"><label class="flabel">${label||key}</label><div class="date-select-wrap"><select class="finput date-sel" id="f-${key}-y">${yOpts}</select><select class="finput date-sel" id="f-${key}-m">${mOpts}</select><select class="finput date-sel" id="f-${key}-d">${dOpts}</select></div></div>`;
}
function getDateVal(key){
  const y=document.getElementById(`f-${key}-y`)?.value;
  const m=document.getElementById(`f-${key}-m`)?.value;
  const d=document.getElementById(`f-${key}-d`)?.value;
  if(!y||!m||!d)return'';
  return`${y}-${m}-${d}`;
}

// 여행 일차 기록
function parseDayEntries(text){
  if(!text)return[];
  const lines=text.split('\n');
  const entries=[];let cur=null;
  for(const l of lines){
    if(/^\[\d+일차\]$/.test(l.trim())){if(cur!==null)entries.push(cur);cur='';}
    else if(cur!==null){cur+=(cur?'\n':'')+l;}
  }
  if(cur!==null)entries.push(cur);
  if(!entries.length&&text.trim())return[text.trim()];
  return entries;
}
function getDayEntriesText(){
  if(!dayEntries.length)return'';
  return dayEntries.map((t,i)=>`[${i+1}일차]\n${document.getElementById('day-text-'+i)?.value||t}`).join('\n\n');
}
function renderDayEntries(){
  const c=document.getElementById('day-entries-container');if(!c)return;
  c.innerHTML=dayEntries.map((_,i)=>`
    <div class="day-entry">
      <div class="day-entry-hdr">
        <span class="day-entry-num">${i+1}일차</span>
        <div class="day-entry-line"></div>
        <button class="day-entry-del" onclick="removeDayEntry(${i})">✕</button>
      </div>
      <textarea class="finput ftarea" id="day-text-${i}" placeholder="${i+1}일차 여행 내용을 입력해주세요" oninput="autoResize(this)">${dayEntries[i]}</textarea>
    </div>`).join('');
  setTimeout(()=>document.querySelectorAll('.day-entry .ftarea').forEach(autoResize),0);
}
function addDayEntry(){
  // save current values first
  dayEntries=dayEntries.map((_,i)=>document.getElementById('day-text-'+i)?.value||'');
  dayEntries.push('');renderDayEntries();
}
function removeDayEntry(i){
  dayEntries=dayEntries.map((_,j)=>document.getElementById('day-text-'+j)?.value||'');
  dayEntries.splice(i,1);renderDayEntries();
}

// 여행 종료일 토글
function toggleEndDate(){
  hasEndDate=!hasEndDate;renderEndDateField('');
}
function renderEndDateField(val){
  const c=document.getElementById('end-date-container');if(!c)return;
  const btn=document.getElementById('end-date-toggle-btn');
  if(hasEndDate){
    c.innerHTML=fgdate('종료날짜','종료날짜',val)+`<div id="trip-duration" style="font-size:12px;color:var(--accent);margin:-8px 0 12px;padding:0 2px"></div>`;
    if(btn)btn.textContent='종료일 제거';
    // attach change listeners for duration calc
    setTimeout(()=>{
      ['f-시작날짜-y','f-시작날짜-m','f-시작날짜-d','f-종료날짜-y','f-종료날짜-m','f-종료날짜-d'].forEach(id=>{
        document.getElementById(id)?.addEventListener('change',updateTripDuration);
      });
    },0);
  }else{
    c.innerHTML='';
    if(btn)btn.textContent='+ 종료일 추가';
    const dur=document.getElementById('trip-duration');if(dur)dur.remove();
  }
}
function updateTripDuration(){
  const s=getDateVal('시작날짜'),e=getDateVal('종료날짜');
  const el=document.getElementById('trip-duration');if(!el)return;
  if(!s||!e){el.textContent='';return;}
  const diff=Math.floor((new Date(e)-new Date(s))/86400000);
  el.textContent=diff<=0?'당일치기':`${diff}박 ${diff+1}일`;
}
function calcGuibn(start,end){
  if(!end)return'당일치기';
  const diff=Math.floor((new Date(end)-new Date(start))/86400000);
  return diff<=0?'당일치기':`${diff}박${diff+1}일`;
}

// 문화생활 해시태그
function toggleCultureType(type,el){
  if(cultureTypes.has(type)){cultureTypes.delete(type);el.classList.remove('active');}
  else{cultureTypes.add(type);el.classList.add('active');}
  // save current extra field values before re-rendering
  const curGenre=document.getElementById('cf-장르')?.value||'';
  const curNation=document.getElementById('cf-국가')?.value||'';
  const curDirector=document.getElementById('cf-감독')?.value||'';
  const curTimeH=document.getElementById('cf-시-h')?.value||'';
  const curTimeM=document.getElementById('cf-시-m')?.value||'';
  const curLoc=document.getElementById('cf-위치')?.value||'';
  const curEtc=document.getElementById('cf-기타')?.value||'';
  renderCultureExtraFields();
  setTimeout(()=>{
    const isMovie=cultureTypes.has('영화');
    if(document.getElementById('cf-장르'))document.getElementById('cf-장르').value=curGenre;
    if(isMovie){
      if(document.getElementById('cf-국가'))document.getElementById('cf-국가').value=curNation;
      if(document.getElementById('cf-감독'))document.getElementById('cf-감독').value=curDirector;
      if(document.getElementById('cf-시-h'))document.getElementById('cf-시-h').value=curTimeH;
      if(document.getElementById('cf-시-m'))document.getElementById('cf-시-m').value=curTimeM;
    }else{
      if(document.getElementById('cf-위치'))document.getElementById('cf-위치').value=curLoc;
      if(document.getElementById('cf-기타'))document.getElementById('cf-기타').value=curEtc;
    }
  },0);
}
function renderCultureExtraFields(){
  const c=document.getElementById('culture-extra-fields');if(!c)return;
  const isMovie=cultureTypes.has('영화');
  const hasNonMovie=[...cultureTypes].some(t=>t!=='영화');
  if(isMovie){
    const hOpts='<option value="">시</option>'+Array.from({length:24},(_,i)=>`<option value="${String(i).padStart(2,'0')}">${i}시</option>`).join('');
    const mOpts='<option value="">분</option>'+Array.from({length:12},(_,i)=>`<option value="${String(i*5).padStart(2,'0')}">${String(i*5).padStart(2,'0')}분</option>`).join('');
    c.innerHTML=
      `<div class="fg"><label class="flabel">장르</label><input class="finput" id="cf-장르" type="text" placeholder="장르 (예: 드라마, 액션)" autocomplete="off"></div>`+
      `<div class="fg"><label class="flabel">국가</label><input class="finput" id="cf-국가" type="text" placeholder="국가 (예: 한국, 미국)" autocomplete="off"></div>`+
      `<div class="fg"><label class="flabel">감독</label><input class="finput" id="cf-감독" type="text" placeholder="감독" autocomplete="off"></div>`+
      `<div class="fg"><label class="flabel">관람 시간</label><div class="date-select-wrap"><select class="finput date-sel" id="cf-시-h">${hOpts}</select><select class="finput date-sel" id="cf-시-m">${mOpts}</select></div></div>`;
  }else if(hasNonMovie){
    c.innerHTML=
      `<div class="fg"><label class="flabel">장르</label><input class="finput" id="cf-장르" type="text" placeholder="장르 (예: 뮤지컬, 현대미술)" autocomplete="off"></div>`+
      `<div class="fg"><label class="flabel">위치</label><input class="finput" id="cf-위치" type="text" placeholder="위치 (예: 서울, 홍대)" autocomplete="off"></div>`+
      `<div class="fg"><label class="flabel">기타</label><input class="finput" id="cf-기타" type="text" placeholder="기타 메모" autocomplete="off"></div>`;
  }else c.innerHTML='';
}

function openForm(type,item=null,prefillName=''){
  // 임시저장 체크 (새 기록 작성 시에만)
  if(!item&&!_pendingDraft&&DRAFT_TYPES.includes(type)){
    const saved=localStorage.getItem('draft_'+type);
    if(saved){
      try{
        const parsed=JSON.parse(saved);
        showDraftRestorePrompt(
          ()=>{_pendingDraft=parsed;openForm(type,null,prefillName);},
          ()=>{clearDraft(type);openForm(type,null,prefillName);}
        );
        return;
      }catch(e){clearDraft(type);}
    }
  }
  const draft=_pendingDraft;_pendingDraft=null;

  curFormType=type;curFormItem=item;
  heroImgData=normalizeImgUrl(item?.대표이미지)||null;photosData=[];
  if(item){for(let i=1;i<=15;i++){const u=normalizeImgUrl(item['사진'+i]);if(u)photosData.push(u);}}
  // reset form-specific state
  dayEntries=[];hasEndDate=false;tripType='';cultureTypes=new Set();
  const titles={matzip:item?'맛집 수정':'맛집 추가',gourmet:item?'고오급 수정':'고오급 글쓰기',date:item?'여행 수정':'여행 글쓰기',culture:item?'문화생활 수정':'문화생활 글쓰기',photo:'사진 추가',todo:item?'투두 수정':'투두 추가'};
  document.getElementById('form-title').textContent=titles[type]||'새 기록';
  let html='';

  if(type==='gourmet'){
    html+=fg('가게명','text','가게명',item?.가게명||prefillName);
    html+=fgdate('날짜','날짜',item?.날짜);
    html+=fg('가격','text','가격 (예: ₩80,000)',item?.가격);
    html+=fg('해시태그','text','해시태그 (예: 한식, 코스)',item?.해시태그);
    html+=fga('메뉴상세','코스 메뉴 상세',item?.메뉴상세);
    html+=fga('메모','메모',item?.메모);
    html+=fhero()+fphotos();
  }else if(type==='date'){
    html+=fhero();
    html+=fg('장소','text','장소명 또는 여행지 제목',item?.장소);
    html+=fgdate('시작날짜','날짜',item?.시작날짜||item?.날짜||'');
    html+=`<div class="fg"><button type="button" id="end-date-toggle-btn" class="end-date-btn" onclick="toggleEndDate()">+ 종료일 추가</button></div>`;
    html+=`<div id="end-date-container"></div>`;
    html+=`<div class="fg"><label class="flabel">해시태그</label>
      <div class="trip-type-wrap">
        <button type="button" class="trip-type-btn" data-type="국내여행" onclick="selectTripType('국내여행',this)">🇰🇷 국내여행</button>
        <button type="button" class="trip-type-btn" data-type="해외여행" onclick="selectTripType('해외여행',this)">✈️ 해외여행</button>
      </div></div>`;
    html+=fg('해시태그_위치','위치','지역 (예: 제주, 부산)',item?.['해시태그_위치']||'');
    html+=fg('해시태그_장소','장소 상세','장소 상세 (예: 성산일출봉)',item?.['해시태그_장소']||'');
    html+=fg('해시태그_기념일','기념일','기념일 (예: 생일, 크리스마스)',item?.['해시태그_기념일']||'');
    html+=`<div class="fg">
      <label class="flabel">여행 기록</label>
      <div id="day-entries-container"></div>
      <button type="button" class="add-day-btn" onclick="addDayEntry()">＋ 일차 추가</button>
    </div>`;
    html+=fg('한줄평','text','한줄평',item?.한줄평);
    html+=fphotos();
  }else if(type==='culture'){
    html+=fg('영화명','text','영화/공연 제목',item?.영화명);
    html+=`<div class="fg"><label class="flabel">해시태그 (중복 선택 가능)</label>
      <div class="culture-type-wrap">
        <button type="button" class="culture-type-btn" data-type="영화" onclick="toggleCultureType('영화',this)">🎬 영화</button>
        <button type="button" class="culture-type-btn" data-type="공연" onclick="toggleCultureType('공연',this)">🎭 공연</button>
        <button type="button" class="culture-type-btn" data-type="전시" onclick="toggleCultureType('전시',this)">🎨 전시</button>
        <button type="button" class="culture-type-btn" data-type="문화생활" onclick="toggleCultureType('문화생활',this)">✨ 문화생활</button>
      </div>
      <div id="culture-extra-fields"></div>
    </div>`;
    html+=fgdate('날짜','날짜',(item?.날짜||'').slice(0,10)||undefined);
    html+=fgstar('별점','별점 (0~10)',item?.별점);
    html+=fg('한줄평','text','한줄평',item?.한줄평);
    html+=fhero();
  }else if(type==='photo'){
    html+=fgdate('날짜','날짜',item?.날짜);
    html+=fg('메모','text','메모',item?.메모);
    html+=fphotos();
  }else if(type==='todo'){
    html+=fg('제목','text','제목',item?.제목);
    html+=fga('메모','메모',item?.메모);
    html+=fgsel('해시태그',['맛집','여행','데이트','문화생활','기타'],item?.해시태그);
    html+=fgdate('날짜','날짜',item?.날짜);
    html+=fhero();
  }else if(type==='matzip'){
    const sopts=(v='')=>'<option value="">-</option>'+STAR_OPTS.map(o=>`<option value="${o}"${o===v?' selected':''}>${o}</option>`).join('');
    html+=fg('가게명','text','가게명',item?.가게명);
    html+=fg('장소','text','장소',item?.장소);
    html+=`<div class="fg"><label class="flabel">공슐랭</label><select class="finput" id="f-공슐랭">${sopts(item?.공슐랭||'')}</select></div>`;
    html+=`<div class="fg"><label class="flabel">하슐랭</label><select class="finput" id="f-하슐랭">${sopts(item?.하슐랭||'')}</select></div>`;
    html+=fg('메뉴','text','메뉴',item?.메뉴);
    html+=fg('비고','text','비고',item?.비고);
  }
  html+=`<div class="form-footer"><button class="form-cancel-btn" onclick="closeFormDirect()">취소</button><button class="form-submit-btn" onclick="saveRecord()">저장</button></div>`;
  document.getElementById('form-body').innerHTML=html;

  // post-init for complex forms
  if(type==='date'){
    hasEndDate=!!(item?.종료날짜);
    tripType=item?.['해시태그_여행종류']||'';
    dayEntries=parseDayEntries(item?.여행기록||item?.데이트기록||'');
    if(hasEndDate)renderEndDateField(item?.종료날짜||'');
    if(tripType){
      document.querySelectorAll('.trip-type-btn').forEach(b=>{if(b.dataset.type===tripType)b.classList.add('active');});
    }
    renderDayEntries();
  }else if(type==='culture'){
    const types=(item?.['해시태그_종류']||'').split(',').map(t=>t.trim()).filter(Boolean);
    types.forEach(t=>cultureTypes.add(t));
    document.querySelectorAll('.culture-type-btn').forEach(b=>{if(cultureTypes.has(b.dataset.type))b.classList.add('active');});
    renderCultureExtraFields();
    setTimeout(()=>{
      if(cultureTypes.has('영화')){
        const eg=document.getElementById('cf-장르');const en=document.getElementById('cf-국가');const ed=document.getElementById('cf-감독');
        if(eg)eg.value=item?.['해시태그_장르']||'';
        if(en)en.value=item?.['해시태그_위치']||'';
        if(ed)ed.value=item?.['해시태그_기타']||'';
        const timePart=(item?.날짜||'').slice(11,16);
        if(timePart){const[hh,mm]=timePart.split(':');
          const eh=document.getElementById('cf-시-h');const em=document.getElementById('cf-시-m');
          if(eh)eh.value=hh||'';if(em)em.value=mm||'';
        }
      }else if(cultureTypes.size>0){
        const eg=document.getElementById('cf-장르');const el=document.getElementById('cf-위치');const ee=document.getElementById('cf-기타');
        if(eg)eg.value=item?.['해시태그_장르']||'';
        if(el)el.value=item?.['해시태그_위치']||'';
        if(ee)ee.value=item?.['해시태그_기타']||'';
      }
    },0);
  }

  if(item?.별점)updateStarDisplay10('f-별점',item.별점);
  renderHeroPreview();renderPhotoPreviews();
  setTimeout(()=>document.querySelectorAll('.ftarea').forEach(autoResize),0);
  if(draft)restoreDraft(draft,type);
  document.getElementById('form-overlay').classList.add('open');
}

function selectTripType(type,el){
  tripType=tripType===type?'':type;
  document.querySelectorAll('.trip-type-btn').forEach(b=>b.classList.remove('active'));
  if(tripType)el.classList.add('active');
}

function closeFormDirect(){document.getElementById('form-overlay').classList.remove('open');heroImgData=null;photosData=[];}
function fg(key,type,ph,val=''){return`<div class="fg"><label class="flabel">${ph||key}</label><input class="finput" id="f-${key}" type="${type}" placeholder="${ph||''}" value="${esc(val||'')}" autocomplete="off"></div>`;}
function fga(key,ph,val=''){return`<div class="fg"><label class="flabel">${ph}</label><textarea class="finput ftarea" id="f-${key}" placeholder="${ph}" oninput="autoResize(this)">${val||''}</textarea></div>`;}
function fgsel(key,opts,val=''){return`<div class="fg"><label class="flabel">${key}</label><select class="finput" id="f-${key}">${opts.map(o=>`<option value="${o}"${o===val?' selected':''}>${o}</option>`).join('')}</select></div>`;}
function fgstar(key,label,val=''){return`<div class="fg"><label class="flabel">${label}</label><div style="display:flex;align-items:center;gap:12px"><input class="finput" id="f-${key}" type="number" min="0" max="10" step="0.5" value="${val||''}" placeholder="0~10" style="width:80px" oninput="updateStarDisplay10('f-${key}',this.value)"><div class="star-visual" id="sd-f-${key}">${val?numToStars(parseFloat(val)/2):'<span class="star empty">☆☆☆☆☆</span>'}</div></div><div style="font-size:11px;color:var(--text3);margin-top:4px">0.5 단위 (최대 10점)</div></div>`;}
function fhero(){return`<div class="fg"><label class="flabel">대표 사진</label><div id="hero-preview-wrap" onclick="document.getElementById('hero-file').click()" style="cursor:pointer">${heroImgData?`<img class="hero-preview-img" src="${heroImgData}" alt="">`:`<div class="hero-ph">📷<span>대표 사진 선택</span></div>`}</div></div>`;}
function fphotos(){return`<div class="fg"><label class="flabel">사진 (최대 15장)</label><div class="img-drop" onclick="document.getElementById('photos-file').click()"><div class="img-drop-icon">📷</div><div class="img-drop-label">탭해서 사진 선택</div></div><div class="img-preview-grid" id="photos-preview"></div></div>`;}
function updateStarDisplay(id,val){const el=document.getElementById('sd-'+id);if(el)el.innerHTML=numToStars(parseFloat(val));}
function updateStarDisplay10(id,val){const el=document.getElementById('sd-'+id);if(el)el.innerHTML=numToStars(parseFloat(val)/2);}
function renderHeroPreview(){
  const wrap=document.getElementById('hero-preview-wrap');if(!wrap)return;
  wrap.innerHTML=heroImgData?`<img class="hero-preview-img" src="${heroImgData}" alt="">`:`<div class="hero-ph">📷<span>대표 사진 선택</span></div>`;
}
function renderPhotoPreviews(){
  const wrap=document.getElementById('photos-preview');if(!wrap)return;
  wrap.innerHTML=photosData.map((src,i)=>`<div class="ipreview"><img src="${src}" alt=""><button class="ipreview-del" onclick="removePhoto(${i})">✕</button></div>`).join('');
}
function removePhoto(i){photosData.splice(i,1);renderPhotoPreviews();}
function onHeroFile(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=ev=>{heroImgData=ev.target.result;renderHeroPreview();};r.readAsDataURL(f);
  e.target.value='';
}
function onPhotosFile(e){
  Array.from(e.target.files).slice(0,15-photosData.length).forEach(f=>{
    const r=new FileReader();r.onload=ev=>{photosData.push(ev.target.result);renderPhotoPreviews();};r.readAsDataURL(f);
  });
  e.target.value='';
}

// ═══ SAVE ═══
async function saveRecord(){
  if(!authed){toast('로그인 필요');return;}
  showLoading(true);
  const fv=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
  try{
    const type=curFormType;
    if(type==='matzip'){
      const name=fv('f-가게명');
      if(!name){toast('가게명을 입력해주세요');showLoading(false);return;}
      const row=[name,fv('f-장소'),fv('f-공슐랭'),fv('f-하슐랭'),fv('f-메뉴'),fv('f-비고')];
      curFormItem?._row?await updateRow(SHEETS.matzip,curFormItem._row,row):await appendRow(SHEETS.matzip,row);
      toast(curFormItem?'수정됐어요 ✓':'등록됐어요 ✓');closeFormDirect();await loadAll();
      showLoading(false);return;
    }
    const fk=type==='gourmet'?'matzip':type==='date'?'date':type==='culture'?'culture':'etc';
    let heroUrl=heroImgData?.startsWith('data:')?await uploadToDrive(heroImgData,fk):(heroImgData||'');
    const photoUrls=[];
    for(const p of photosData){
      if(p.startsWith('data:')){const u=await uploadToDrive(p,fk);if(u)photoUrls.push(u);}
      else if(p)photoUrls.push(p);
    }
    while(photoUrls.length<15)photoUrls.push('');
    if(type==='gourmet'){
      const row=[fv('f-가게명'),heroUrl,fv('f-가격'),getDateVal('날짜'),fv('f-해시태그'),fv('f-메뉴상세'),...photoUrls.slice(0,15),fv('f-메모')];
      curFormItem?._row?await updateRow(SHEETS.gourmet,curFormItem._row,row):await appendRow(SHEETS.gourmet,row);
    }else if(type==='date'){
      const startDate=getDateVal('시작날짜');
      const endDate=hasEndDate?getDateVal('종료날짜'):'';
      const guibn=calcGuibn(startDate,endDate);
      const travelText=getDayEntriesText();
      const row=[fv('f-장소'),startDate,endDate,guibn,tripType,fv('f-해시태그_위치'),fv('f-해시태그_장소'),fv('f-해시태그_기념일'),travelText,fv('f-한줄평'),heroUrl,...photoUrls.slice(0,15)];
      curFormItem?._row?await updateRow(SHEETS.date,curFormItem._row,row):await appendRow(SHEETS.date,row);
    }else if(type==='culture'){
      const hashType=[...cultureTypes].join(',');
      const isMovie=cultureTypes.has('영화');
      const hashGenre=document.getElementById('cf-장르')?.value?.trim()||'';
      const hashLoc=isMovie?(document.getElementById('cf-국가')?.value?.trim()||''):(document.getElementById('cf-위치')?.value?.trim()||'');
      const hashOther=isMovie?(document.getElementById('cf-감독')?.value?.trim()||''):(document.getElementById('cf-기타')?.value?.trim()||'');
      const dateBase=getDateVal('날짜');
      const timeH=document.getElementById('cf-시-h')?.value||'';
      const timeM=document.getElementById('cf-시-m')?.value||'';
      const dateVal=(isMovie&&timeH&&timeM)?`${dateBase} ${timeH}:${timeM}`:dateBase;
      const row=[fv('f-영화명'),hashType,hashGenre,hashLoc,hashOther,dateVal,fv('f-별점'),fv('f-한줄평'),heroUrl];
      curFormItem?._row?await updateRow(SHEETS.culture,curFormItem._row,row):await appendRow(SHEETS.culture,row);
    }else if(type==='photo'){
      const all=[heroUrl,...photosData].filter(Boolean);
      for(const p of all){const u=p.startsWith('data:')?await uploadToDrive(p,'etc'):p;if(u)await appendRow(SHEETS.photo,[u,fv('f-메모'),getDateVal('날짜'),'']);}
    }else if(type==='todo'){
      const row=[fv('f-제목'),fv('f-메모'),fv('f-해시태그'),heroUrl,'',getDateVal('날짜')];
      curFormItem?._row?await updateRow(SHEETS.todo,curFormItem._row,row):await appendRow(SHEETS.todo,row);
    }
    clearDraft(type);toast('저장됐어요 ✓');closeFormDirect();await loadAll();
  }catch(e){toast('저장 실패: '+e.message);console.error(e);}
  showLoading(false);
}

// ═══ DRIVE DELETE ═══
function extractDriveId(url){
  if(!url)return null;
  const m=url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  return m?m[1]:null;
}
async function deleteDriveFiles(urls){
  const token=gapi.client.getToken()?.access_token;
  if(!token)return;
  const ids=[...new Set(urls.map(extractDriveId).filter(Boolean))];
  await Promise.allSettled(ids.map(id=>
    fetch(`https://www.googleapis.com/drive/v3/files/${id}`,
      {method:'DELETE',headers:{Authorization:'Bearer '+token}})
    .catch(e=>console.warn('Drive delete fail:',id,e))
  ));
}
function getItemImageUrls(type,rowIdx){
  const item=(db[type]||[]).find(i=>i._row===rowIdx);
  if(!item)return[];
  const urls=[];
  if(type==='photo'){
    const url=getPhotoUrl(item);
    if(url)urls.push(url);
    return urls;
  }
  if(item.대표이미지)urls.push(item.대표이미지);
  for(let i=1;i<=15;i++){if(item['사진'+i])urls.push(item['사진'+i]);}
  return urls;
}

// ═══ UTILS ═══
function getPhotoUrl(item){
  // 신규 데이터: A열(대표이미지)에 URL이 저장됨
  const a=normalizeImgUrl(item.대표이미지||'');
  if(a.startsWith('https://'))return a;
  // 구 데이터: URL이 B열(제목)에 잘못 저장된 경우 fallback
  const b=normalizeImgUrl(item.제목||'');
  return b.startsWith('https://')?b:'';
}
function normalizeImgUrl(url){
  if(!url)return'';
  if(url.includes('lh3.googleusercontent.com'))return url;
  let m=url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(!m)m=url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m)return'https://lh3.googleusercontent.com/d/'+m[1];
  return url;
}
function imgOrPh(src,ratio,icon){
  const s=normalizeImgUrl(src);
  if(s)return`<img class="gcard-img" src="${s}" style="aspect-ratio:${ratio}" alt="" loading="lazy" onerror="this.outerHTML='<div class=gcard-ph style=aspect-ratio:${ratio}>${icon}</div>'">`;
  return`<div class="gcard-ph" style="aspect-ratio:${ratio}">${icon}</div>`;
}
function emptyState(icon,txt){return`<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">${icon}</div><div>${txt}</div></div>`;}
function sortByDate(d1,d2){return(new Date(d1)||0)-(new Date(d2)||0);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function openLbox(src){if(!src)return;document.getElementById('lbox-img').src=src;document.getElementById('lbox').classList.add('open');}
function showLoading(show){document.getElementById('loading-overlay').classList.toggle('show',show);}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2500);}

// START
initGapi();
