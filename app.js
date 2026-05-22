// ═══ CONFIG ═══
const PIN = '1009';
const SHEET_ID = '1zmvSHTIKPIvuTdgyi4UnHDxqyuhBI_7IAyckAkxqXA8';
const API_KEY = 'AIzaSyBUtEVNLyx4LBp4L8mZixN8_3Io71haDlM';
const CLIENT_ID = '616148935874-0b5ssnkeg245jl2phfqovlfg28scbqq3.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const START_DATE = new Date('2021-10-09');
const FOLDERS = {
  matzip: '1X-tsQk9KMmQ1nUb7o8znLxDCOP-FZdpZ',
  date:   '1gdf92XHQkk8UFXuTCJf_yRWtnJTAb288',
  culture:'1awOVwW5FF2JCDSIlk7NwtyD104ObJjlE',
  etc:    '1whLBtJjtE5OQu8ydEGvOwRzbh4NJWN2C',
};
const SHEETS = {
  matzip:'맛집 기본', gourmet:'맛집 상세',
  date:'데이트_기본', dateDetail:'데이트_상세',
  culture:'영화', criteria:'별점가이드',
  favorites:'즐겨찾기', todo:'투두리스트', photo:'사진첩'
};
const STAR_OPTS = ['0','0.5','1','1.5','2','2.5','3','3.5','4','4.5','5'];

// ═══ STATE ═══
let db = {matzip:[],gourmet:[],date:[],dateDetail:[],culture:[],criteria:[],favorites:[],todo:[],photo:[]};
let isLight=false, authed=false, pinVal='';
let tokenClient, gapiLoaded=false, gisLoaded=false;
let curFormType=null, curFormItem=null, heroImgData=null, photosData=[];
let curDetailType=null, curDetailItem=null;
let newRowActive=false;
let todoFilter='전체';

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

// ═══ PIN ═══
function pinKey(k){
  if(pinVal.length>=4)return;
  pinVal+=k;updatePinDots();
  if(pinVal.length===4){
    setTimeout(()=>{
      if(pinVal===PIN){document.getElementById('pin-screen').classList.add('hidden');startApp();}
      else{document.getElementById('pin-err').textContent='비밀번호가 틀렸어요 💔';pinVal='';updatePinDots();setTimeout(()=>document.getElementById('pin-err').textContent='',1500);}
    },100);
  }
}
function pinDel(){pinVal=pinVal.slice(0,-1);updatePinDots();}
function updatePinDots(){for(let i=0;i<4;i++)document.getElementById('d'+i).classList.toggle('filled',i<pinVal.length);}

// ═══ APP START ═══
function startApp(){
  const app=document.getElementById('app');app.style.display='flex';app.style.flexDirection='column';
  initDday();loadAll();
}
function initDday(){
  // KST 기준 오늘 날짜
  const kstNow=new Date(new Date().getTime()+9*3600000);
  const todayY=kstNow.getUTCFullYear(),todayM=kstNow.getUTCMonth(),todayD=kstNow.getUTCDate();
  const startY=2021,startM=9,startD=9; // Oct=9 (0-indexed)
  const startUtc=Date.UTC(startY,startM,startD);
  const todayUtc=Date.UTC(todayY,todayM,todayD);
  const totalDays=Math.floor((todayUtc-startUtc)/86400000);
  document.getElementById('dday-num').textContent='D+'+totalDays.toLocaleString();
  // 상세: n년 n개월 n주 n일째
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
  document.getElementById('page-'+p).classList.add('active');
  const nt=document.getElementById('nt-'+p);if(nt)nt.classList.add('active');
  document.querySelector('.content').scrollTo(0,0);
  if(p==='fav')renderFavorites();
  if(p==='todo')renderTodo();
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

// ═══ RENDER ═══
function renderAll(){
  renderMatzipList();renderGourmet();renderDate();renderCulture();renderPhoto();
  loadCriteriaFromSheet();
}

// MATZIP
function getTotal(item){return (parseFloat(item.공슐랭)||0)+(parseFloat(item.하슐랭)||0);}
function numToStars(n){
  if(isNaN(n)||n<=0)return'<span class="star empty">☆</span>'.repeat(5);
  const s=Math.min(5,Math.max(0,n));
  const full=Math.floor(s),half=(s-full)>=0.5?1:0,empty=5-full-half;
  return'<span class="star full">★</span>'.repeat(full)+(half?'<span class="star half">★</span>':'')+'<span class="star empty">☆</span>'.repeat(empty);
}
function starsAndNum(score){
  if(!score)return'-';
  const n=parseFloat(score);if(isNaN(n)||n<=0)return'-';
  return numToStars(n)+'<small style="color:var(--text2);margin-left:4px">'+n+'</small>';
}
function starsAndNum10(score){
  if(!score)return'-';
  const n=parseFloat(score);if(isNaN(n)||n<=0)return'-';
  return numToStars(n/2)+'<small style="color:var(--text2);margin-left:4px">'+n+'/10</small>';
}

function renderMatzipList(){
  // Ranking
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
  if(!groups.length){rl.innerHTML='<div style="font-size:13px;color:var(--text3);padding:8px 0">별점을 등록하면 랭킹이 표시돼요</div>';
  }else{
    rl.innerHTML=groups.flatMap(g=>g.items.map(item=>`
      <div class="rank-row">
        <div class="rank-badge">${g.rank<=3?medals[g.rank-1]:g.rank}</div>
        <div style="flex:1;min-width:0"><div class="rank-name" onclick="openMatzipDetail('${esc(item.가게명)}')">${esc(item.가게명)}</div><div class="rank-loc">${esc(item.장소)}</div></div>
        <div class="rank-score">${numToStars(g.score/2)} <small style="color:var(--text2);margin-left:4px">${g.score.toFixed(1)} / 10</small></div>
      </div>`)).join('');
  }
  // Table
  const tbody=document.getElementById('matzip-tbody');
  if(!db.matzip.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text3)"><div style="font-size:34px;margin-bottom:8px">🍜</div>아래 버튼을 눌러 첫 맛집을 추가해보세요!</td></tr>`;return;}
  const maxT=Math.max(...db.matzip.map(i=>getTotal(i)));
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
    <td><input id="nr-가게명" placeholder="가게명" style="min-width:80px"></td>
    <td><input id="nr-장소" placeholder="장소" style="min-width:60px"></td>
    <td><select id="nr-공슐랭" class="star-select"><option value="">-</option>${starOpts}</select></td>
    <td><select id="nr-하슐랭" class="star-select"><option value="">-</option>${starOpts}</select></td>
    <td>-</td>
    <td><input id="nr-메뉴" placeholder="메뉴" style="min-width:80px"></td>
    <td><input id="nr-비고" placeholder="비고" style="min-width:60px"></td>
    <td><div class="action-cell">
      <button class="row-reg-btn" onclick="registerNewRow()">등록</button>
      <button class="row-cancel-btn" onclick="cancelNewRow()">취소</button>
    </div></td>`;
  tbody.appendChild(tr);
  document.getElementById('nr-가게명').focus();
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
    <td><input style="${iStyle};min-width:80px" id="ie-가게명-${rowIdx}" value="${esc(item.가게명)}"></td>
    <td><input style="${iStyle};min-width:60px" id="ie-장소-${rowIdx}" value="${esc(item.장소)}"></td>
    <td><select style="${iStyle};width:80px" id="ie-공슐랭-${rowIdx}"><option value="">-</option>${starOpts}</select></td>
    <td><select style="${iStyle};width:80px" id="ie-하슐랭-${rowIdx}"><option value="">-</option>${starOpts2}</select></td>
    <td>-</td>
    <td><input style="${iStyle};min-width:80px" id="ie-메뉴-${rowIdx}" value="${esc(item.메뉴)}"></td>
    <td><input style="${iStyle};min-width:60px" id="ie-비고-${rowIdx}" value="${esc(item.비고)}"></td>
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

// CRITERIA
function setCriteriaViewMode(){
  ['gong','ha'].forEach(k=>{
    const ta=document.getElementById('criteria-'+k);
    const saveBtn=document.getElementById('criteria-'+k+'-save');
    const editBtn=document.getElementById('criteria-'+k+'-edit');
    if(ta)ta.readOnly=true;
    if(saveBtn)saveBtn.style.display='none';
    if(editBtn)editBtn.style.display='';
  });
}
function editCriteria(k){
  const ta=document.getElementById('criteria-'+k);
  const saveBtn=document.getElementById('criteria-'+k+'-save');
  const editBtn=document.getElementById('criteria-'+k+'-edit');
  if(ta){ta.readOnly=false;ta.focus();}
  if(saveBtn)saveBtn.style.display='';
  if(editBtn)editBtn.style.display='none';
}
async function loadCriteriaFromSheet(){
  if(!db.criteria||!db.criteria.length)return;
  const g=db.criteria.find(r=>r.구분==='공슐랭');
  const h=db.criteria.find(r=>r.구분==='하슐랭');
  if(g)document.getElementById('criteria-gong').value=g.내용||'';
  if(h)document.getElementById('criteria-ha').value=h.내용||'';
  if((g?.내용||'').trim()||(h?.내용||'').trim())setCriteriaViewMode();
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
    setCriteriaViewMode();
  }catch(e){toast('저장 실패: '+e.message);}
  showLoading(false);
}

// GOURMET
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

// DATE
function renderDate(){
  const grid=document.getElementById('date-grid');
  const sorted=[...db.date].sort((a,b)=>sortByDate(b.날짜,a.날짜));
  if(!sorted.length){grid.innerHTML=emptyState('📍','여행 기록을 추가해보세요!');return;}
  grid.innerHTML=sorted.map(item=>{
    const faved=isFaved('date',item._row);
    return`<div class="gcard">
      <button class="fav-btn" onclick="event.stopPropagation();toggleFav('date',${item._row},'${esc(item.장소)}','${esc(item.대표이미지)}')">${faved?'❤️':'🤍'}</button>
      <div onclick="showDateDetail(${item._row})">${imgOrPh(item.대표이미지,'4/3','📸')}</div>
      <div class="gcard-body" onclick="showDateDetail(${item._row})">
        <div class="gcard-name">${esc(item.장소)}</div>
        <div class="gcard-sub">${esc(item.날짜)}${item.구분?' · '+esc(item.구분):''}</div>
        ${item.한줄평?`<div class="gcard-tags">${esc(item.한줄평)}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function showDateDetail(rowIdx){
  const basic=db.date.find(i=>i._row===rowIdx);if(!basic)return;
  const detail=db.dateDetail.find(d=>d.장소===basic.장소&&d.날짜===basic.날짜)||db.dateDetail.find(d=>d.장소===basic.장소);
  const merged={...basic};
  if(detail){
    merged._detailRow=detail._row;
    if(detail.대표이미지&&!merged.대표이미지)merged.대표이미지=detail.대표이미지;
    merged.일차=detail.일차||'';merged.데이트기록=detail.데이트기록||'';
    for(let i=1;i<=15;i++)if(detail['사진'+i])merged['사진'+i]=detail['사진'+i];
  }
  curDetailType='date';curDetailItem=merged;showDetailPopup(merged,'date');
}

// CULTURE
function renderCulture(){
  const grid=document.getElementById('culture-grid');
  const sorted=[...db.culture].sort((a,b)=>sortByDate(b.날짜,a.날짜));
  if(!sorted.length){grid.innerHTML=emptyState('🎬','문화생활을 기록해보세요!');return;}
  grid.innerHTML=sorted.map(item=>{
    const faved=isFaved('culture',item._row);
    const imgEl=item.대표이미지?`<img src="${item.대표이미지}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.parentNode.innerHTML='<div class=movie-poster-ph>🎬</div>'">`:`<div class="movie-poster-ph">🎬</div>`;
    return`<div class="movie-card" onclick="showDetailPopup(db.culture.find(i=>i._row===${item._row}),'culture')">
      <button class="fav-btn" style="top:6px;right:6px;z-index:3" onclick="event.stopPropagation();toggleFav('culture',${item._row},'${esc(item.영화명)}','${esc(item.대표이미지)}')">${faved?'❤️':'🤍'}</button>
      <div class="movie-poster-wrap">${imgEl}</div>
      <div class="movie-info">
        <div><div class="movie-title">${esc(item.영화명)}</div><div class="movie-date">${esc(item.날짜)}</div><div class="movie-stars">${starsAndNum10(item.별점)}</div></div>
        <div class="movie-review">${esc(item.한줄평)}</div>
      </div>
    </div>`;
  }).join('');
}

// PHOTO
function renderPhoto(){
  const grid=document.getElementById('photo-grid');
  const sorted=[...db.photo].sort((a,b)=>sortByDate(b.날짜,a.날짜));
  if(!sorted.length){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)"><div style="font-size:40px;margin-bottom:10px">🖼️</div>사진을 추가해보세요!</div>';return;}
  grid.innerHTML=sorted.map(item=>`
    <div class="photo-item" onclick="openLbox('${item.대표이미지}')">
      <img src="${item.대표이미지}" alt="" loading="lazy" onerror="this.style.display='none'">
      <button class="photo-item-del" onclick="event.stopPropagation();confirmDelete('photo',${item._row})">✕</button>
    </div>`).join('');
}

// FAVORITES
function isFaved(type,rowIdx){return db.favorites.some(f=>f.타입===type&&f.ID===String(rowIdx));}
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
  if(!db.favorites.length){wrap.innerHTML='<div class="empty-state" style="text-align:center;padding:48px;color:var(--text3)"><div style="font-size:44px;margin-bottom:12px">❤️</div><div>즐겨찾기한 항목이 없어요</div></div>';return;}
  const groups={gourmet:[],date:[],culture:[],photo:[]};
  db.favorites.forEach(f=>{if(groups[f.타입])groups[f.타입].push(f);});
  const labels={gourmet:'고오급',date:'여행',culture:'문화생활',photo:'사진'};
  let html='';
  Object.entries(groups).forEach(([type,items])=>{
    if(!items.length)return;
    html+=`<div class="fav-section-title">${labels[type]||type}</div><div class="gallery-grid-4">`;
    html+=items.map(f=>`
      <div class="gcard" onclick="openFavDetail('${f.타입}',${f.ID})">
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
  if(type==='date')showDateDetail(parseInt(rowIdx));
  else{curDetailType=type;curDetailItem=item;showDetailPopup(item,type);}
}

// TODO
function renderTodo(){
  const filters=['전체','맛집','여행','데이트','문화생활','기타'];
  document.getElementById('todo-filters').innerHTML=filters.map(f=>
    `<button class="todo-filter ${todoFilter===f?'active':''}" onclick="setTodoFilter('${f}')">${f}</button>`).join('');
  const items=todoFilter==='전체'?db.todo:db.todo.filter(i=>i.해시태그===todoFilter);
  const list=document.getElementById('todo-list');
  if(!items.length){list.innerHTML='<div style="text-align:center;padding:36px;color:var(--text3)"><div style="font-size:36px;margin-bottom:8px">📝</div>할 일을 추가해보세요!</div>';return;}
  list.innerHTML=items.map(item=>`
    <div class="todo-card">
      <div class="todo-card-img">${item.대표이미지?`<img src="${item.대표이미지}" alt="">`:`<div class="todo-card-img-ph">📝</div>`}</div>
      <div class="todo-card-body">
        <div class="todo-card-title">
          <div class="todo-check ${item.완료여부==='완료'?'done':''}" onclick="toggleTodoDone(${item._row},this)">
            ${item.완료여부==='완료'?'✓':''}
          </div>
          <span style="${item.완료여부==='완료'?'text-decoration:line-through;color:var(--text3)':''}">${esc(item.제목)}</span>
        </div>
        <div class="todo-memo">${esc(item.메모)}</div>
        ${item.해시태그?`<div class="todo-tag">#${esc(item.해시태그)}</div>`:''}
      </div>
      <div class="todo-card-actions">
        <button class="todo-action-btn" onclick="openFormEdit('todo',${item._row})" title="수정">✏️</button>
        <button class="todo-action-btn" onclick="confirmDelete('todo',${item._row})" title="삭제">🗑</button>
      </div>
    </div>`).join('');
}
function setTodoFilter(f){todoFilter=f;renderTodo();}
async function toggleTodoDone(rowIdx,el){
  const item=db.todo.find(i=>i._row===rowIdx);if(!item)return;
  const newVal=item.완료여부==='완료'?'':' 완료';
  showLoading(true);
  try{
    const vals=[item.제목,item.메모,item.해시태그,item.대표이미지,newVal.trim(),item.날짜];
    await updateRow(SHEETS.todo,rowIdx,vals);
    await loadSheet('todo',SHEETS.todo);renderTodo();
  }catch(e){toast('오류: '+e.message);}
  showLoading(false);
}
function openFormEdit(type,rowIdx){
  const item=db[type]?.find(i=>i._row===rowIdx);
  if(item)openForm(type,item);
}

// DETAIL POPUP
function showDetailPopup(item,type){
  if(!item)return;
  curDetailType=type;curDetailItem=item;
  const name=type==='culture'?item.영화명:type==='date'?item.장소:item.가게명;
  document.getElementById('detail-popup-title').textContent=name||'';
  document.getElementById('detail-write-btn').style.display='none';
  document.getElementById('detail-edit-btn').style.display='flex';
  document.getElementById('detail-del-btn').style.display='flex';

  let body='';
  // Hero
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
    if(item.날짜)body+=dProp('날짜',item.날짜);
    if(item.구분)body+=dProp('구분',item.구분);
    if(item.일차)body+=dProp('일차',item.일차);
    if(item.한줄평)body+=dProp('한줄평',item.한줄평);
  }
  if(type==='culture'){
    if(item.날짜)body+=dProp('날짜',item.날짜);
    if(item.별점)body+=dPropHtml('별점',starsAndNum10(item.별점));
    if(item.한줄평)body+=dProp('한줄평',item.한줄평);
  }
  body+='</div>';
  if(type==='gourmet'){
    if(item.메뉴상세)body+=`<div class="detail-sec"><div class="detail-sec-title">메뉴 상세</div><div class="detail-text">${esc(item.메뉴상세)}</div></div>`;
    if(item.메모)body+=`<div class="detail-sec"><div class="detail-sec-title">메모</div><div class="detail-text">${esc(item.메모)}</div></div>`;
  }
  if(type==='date'&&item.데이트기록)body+=`<div class="detail-sec"><div class="detail-sec-title">여행 기록</div><div class="detail-text">${esc(item.데이트기록)}</div></div>`;
  // Photos
  const photos=[];
  for(let i=1;i<=15;i++){const u=normalizeImgUrl(item['사진'+i]);if(u)photos.push(u);}
  if(photos.length)body+=`<div class="detail-sec"><div class="detail-sec-title">사진 (${photos.length}장)</div><div class="photo-scroll-wrap"><button class="scroll-btn left" onclick="scrollPhotos(this,-1)">&#8249;</button><div class="photo-scroll">${photos.map(p=>`<img src="${p}" onclick="openLbox('${p}')" onerror="this.style.display='none'">`).join('')}</div><button class="scroll-btn right" onclick="scrollPhotos(this,1)">&#8250;</button></div></div>`;
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
    try{await deleteSheetRow(SHEETS[type]||SHEETS.matzip,item._row);closeDetailDirect();toast('삭제됐어요');await loadAll();}
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
    document.getElementById('detail-del-btn').style.display='none';
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

// CONFIRM
let _confirmCb=null;
function showConfirm(cb){
  _confirmCb=cb;
  document.getElementById('confirm-overlay').classList.add('open');
  document.getElementById('confirm-ok-btn').onclick=()=>{closeConfirm();_confirmCb&&_confirmCb();};
}
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('open');}
function confirmDelete(type,rowIdx){
  showConfirm(async()=>{
    showLoading(true);
    const imgUrls=getItemImageUrls(type,rowIdx);
    try{await deleteSheetRow(SHEETS[type],rowIdx);toast('삭제됐어요');await loadAll();}
    catch(e){toast('삭제 실패: '+e.message);showLoading(false);return;}
    showLoading(false);
    if(imgUrls.length)deleteDriveFiles(imgUrls);
  });
}

// FORM
function openForm(type,item=null,prefillName=''){
  curFormType=type;curFormItem=item;
  heroImgData=normalizeImgUrl(item?.대표이미지)||null;photosData=[];
  if(item){for(let i=1;i<=15;i++){const u=normalizeImgUrl(item['사진'+i]);if(u)photosData.push(u);}}
  const titles={matzip:item?'맛집 수정':'맛집 추가',gourmet:item?'고오급 수정':'고오급 글쓰기',date:item?'여행 수정':'여행 글쓰기',culture:item?'문화생활 수정':'문화생활 글쓰기',photo:'사진 추가',todo:item?'투두 수정':'투두 추가'};
  document.getElementById('form-title').textContent=titles[type]||'새 기록';
  let html='';
  if(type==='gourmet'){
    html+=fg('가게명','text','가게명',item?.가게명||prefillName);
    html+=fg('날짜','date','날짜',item?.날짜);
    html+=fg('가격','text','가격 (예: ₩80,000)',item?.가격);
    html+=fg('해시태그','text','해시태그 (예: 한식, 코스)',item?.해시태그);
    html+=fga('메뉴상세','코스 메뉴 상세',item?.메뉴상세);
    html+=fga('메모','메모',item?.메모);
    html+=fhero()+fphotos();
  }else if(type==='date'){
    html+=fg('장소','text','장소명',item?.장소);
    html+=fg('날짜','date','날짜',item?.날짜);
    html+=fgsel('구분',['당일','여행','기념일'],item?.구분);
    html+=fg('일차','text','일차 (예: 1일차)',item?.일차);
    html+=fg('한줄평','text','한줄평',item?.한줄평);
    html+=fga('데이트기록','여행 기록',item?.데이트기록);
    html+=fhero()+fphotos();
  }else if(type==='culture'){
    html+=fg('영화명','text','영화/공연 제목',item?.영화명);
    html+=fg('날짜','date','날짜',item?.날짜);
    html+=fgstar('별점','별점 (0~10)',item?.별점);
    html+=fg('한줄평','text','한줄평',item?.한줄평);
    html+=fhero();
  }else if(type==='photo'){
    html+=fg('날짜','date','날짜',item?.날짜);
    html+=fg('메모','text','메모',item?.메모);
    html+=fphotos();
  }else if(type==='todo'){
    html+=fg('제목','text','제목',item?.제목);
    html+=fga('메모','메모',item?.메모);
    html+=fgsel('해시태그',['맛집','여행','데이트','문화생활','기타'],item?.해시태그);
    html+=fg('날짜','date','날짜',item?.날짜);
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
  if(item?.별점)updateStarDisplay10('f-별점',item.별점);
  renderHeroPreview();renderPhotoPreviews();
  document.getElementById('form-overlay').classList.add('open');
}
function closeFormDirect(){document.getElementById('form-overlay').classList.remove('open');heroImgData=null;photosData=[];}
function fg(key,type,ph,val=''){return`<div class="fg"><label class="flabel">${ph||key}</label><input class="finput" id="f-${key}" type="${type}" placeholder="${ph||''}" value="${esc(val||'')}"></div>`;}
function fga(key,ph,val=''){return`<div class="fg"><label class="flabel">${ph}</label><textarea class="finput ftarea" id="f-${key}" placeholder="${ph}">${val||''}</textarea></div>`;}
function fgsel(key,opts,val=''){return`<div class="fg"><label class="flabel">${key}</label><select class="finput" id="f-${key}">${opts.map(o=>`<option value="${o}"${o===val?' selected':''}>${o}</option>`).join('')}</select></div>`;}
function fgstar(key,label,val=''){return`<div class="fg"><label class="flabel">${label}</label><div style="display:flex;align-items:center;gap:12px"><input class="finput" id="f-${key}" type="number" min="0" max="10" step="0.5" value="${val||''}" placeholder="0~10" style="width:80px" oninput="updateStarDisplay10('f-${key}',this.value)"><div class="star-visual" id="sd-f-${key}">${val?numToStars(parseFloat(val)/2):'<span class=\\"star-empty\\">☆☆☆☆☆</span>'}</div></div><div style="font-size:11px;color:var(--text3);margin-top:4px">0.5 단위 (최대 10점)</div></div>`;}
function fhero(){return`<div class="fg"><label class="flabel">대표 사진</label><div id="hero-preview-wrap" onclick="document.getElementById('hero-file').click()" style="cursor:pointer">${heroImgData?`<img class="hero-preview-img" src="${heroImgData}" alt="">`:`<div class="hero-ph">📷<div style="font-size:12px;margin-top:6px">대표 사진 선택</div></div>`}</div></div>`;}
function fphotos(){return`<div class="fg"><label class="flabel">사진 (최대 15장)</label><div class="img-drop" onclick="document.getElementById('photos-file').click()"><div class="img-drop-icon">📷</div><div class="img-drop-label">탭해서 사진 선택</div></div><div class="img-preview-grid" id="photos-preview"></div></div>`;}
function updateStarDisplay(id,val){const el=document.getElementById('sd-'+id);if(el)el.innerHTML=numToStars(parseFloat(val));}
function updateStarDisplay10(id,val){const el=document.getElementById('sd-'+id);if(el)el.innerHTML=numToStars(parseFloat(val)/2);}
function renderHeroPreview(){
  const wrap=document.getElementById('hero-preview-wrap');if(!wrap)return;
  wrap.innerHTML=heroImgData?`<img class="hero-preview-img" src="${heroImgData}" alt="">`:`<div class="hero-ph">📷<div style="font-size:12px;margin-top:6px">대표 사진 선택</div></div>`;
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

// SAVE
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
      if(curFormItem?._row){await updateRow(SHEETS.matzip,curFormItem._row,row);}
      else{await appendRow(SHEETS.matzip,row);}
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
      const row=[fv('f-가게명'),heroUrl,fv('f-가격'),fv('f-날짜'),fv('f-해시태그'),fv('f-메뉴상세'),...photoUrls.slice(0,15),fv('f-메모')];
      curFormItem?._row?await updateRow(SHEETS.gourmet,curFormItem._row,row):await appendRow(SHEETS.gourmet,row);
    }else if(type==='date'){
      const row=[fv('f-장소'),fv('f-날짜'),heroUrl,fv('f-한줄평'),'',fv('f-구분'),fv('f-일차'),fv('f-데이트기록'),...photoUrls.slice(0,15)];
      curFormItem?._row?await updateRow(SHEETS.date,curFormItem._row,row):await appendRow(SHEETS.date,row);
    }else if(type==='culture'){
      const row=[fv('f-영화명'),fv('f-날짜'),heroUrl,fv('f-별점'),fv('f-한줄평')];
      curFormItem?._row?await updateRow(SHEETS.culture,curFormItem._row,row):await appendRow(SHEETS.culture,row);
    }else if(type==='photo'){
      const all=[heroUrl,...photosData].filter(Boolean);
      for(const p of all){const u=p.startsWith('data:')?await uploadToDrive(p,'etc'):p;if(u)await appendRow(SHEETS.photo,[fv('f-날짜'),u,fv('f-메모')]);}
    }else if(type==='todo'){
      const row=[fv('f-제목'),fv('f-메모'),fv('f-해시태그'),heroUrl,'',fv('f-날짜')];
      curFormItem?._row?await updateRow(SHEETS.todo,curFormItem._row,row):await appendRow(SHEETS.todo,row);
    }
    toast('저장됐어요 ✓');closeFormDirect();await loadAll();
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
  if(item.대표이미지)urls.push(item.대표이미지);
  for(let i=1;i<=15;i++){if(item['사진'+i])urls.push(item['사진'+i]);}
  return urls;
}

// UTILS
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
function emptyState(icon,txt){return`<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)"><div class="empty-icon">${icon}</div><div class="empty-txt">${txt}</div></div>`;}
function sortByDate(d1,d2){return(new Date(d1)||0)-(new Date(d2)||0);}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function openLbox(src){document.getElementById('lbox-img').src=src;document.getElementById('lbox').classList.add('open');}
function showLoading(show){document.getElementById('loading-overlay').classList.toggle('show',show);}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2500);}

// START
initGapi();
