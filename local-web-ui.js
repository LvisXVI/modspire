'use strict';
(()=>{
  const english=()=>document.documentElement.lang.startsWith('en');
  const copy=(de,en)=>english()?en:de;
  const preferences=()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('mw-')).map(key=>[key,localStorage.getItem(key)]));
  function init(){
    const button=document.getElementById('launch-web');if(!button)return;
    function label(){const text=window.workshop.isWebVersion?copy('Zur Desktop-App','Back to desktop'):copy('Web-Version','Web version');button.querySelector('.web-launch-label').textContent=text;button.title=window.workshop.isWebVersion?copy('Lokal gespeicherte Arbeit in der Desktop-App fortsetzen','Continue your locally saved work in the desktop app'):copy('Diese App als lokale Website im Browser öffnen','Open this app as a local website in your browser');}
    label();new MutationObserver(label).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    button.onclick=async()=>{
      button.disabled=true;document.body.dataset.webReturning=window.workshop.isWebVersion?'true':'false';
      try{if(window.workshop.isWebVersion)await window.WorkshopReturnLocalWeb();
      else await window.WorkshopOpenLocalWeb();}
      catch(error){document.body.dataset.webReturning='false';alert(error.message)}finally{button.disabled=false;}
    };
    if(window.workshop.isWebVersion){
      const notice=document.createElement('div');notice.className='local-web-connection';notice.setAttribute('role','status');notice.hidden=true;document.body.append(notice);
      window.addEventListener('workshop-web-disconnected',()=>{notice.textContent=copy('Die Verbindung zur Desktop-App wurde beendet. Du kannst dieses Browserfenster schließen.','The connection to the desktop app has ended. You can close this browser window.');notice.hidden=false;document.querySelector('.app-shell').inert=true;});
      window.addEventListener('workshop-web-connected',()=>{notice.hidden=true;document.querySelector('.app-shell').inert=false;});
      let timer;const syncPreferences=()=>{clearTimeout(timer);if(document.body.dataset.webReturning==='true')return;timer=setTimeout(()=>window.workshop.saveWebPreferences(preferences()).catch(()=>{}),180);};
      document.addEventListener('click',syncPreferences);document.addEventListener('change',syncPreferences);
      window.workshop.onPrepareWebReturn(async()=>{
        clearTimeout(timer);document.body.dataset.webReturning='true';
        try{await window.WorkshopReturnLocalWeb();}catch(error){document.body.dataset.webReturning='false';await window.workshop.reportWebReturnError(error.message);}
      });
    }else{
      const overlay=document.createElement('section');overlay.className='design-overlay local-web-overlay';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
      const card=document.createElement('div');card.className='design-card local-web-card';const title=document.createElement('h2'),note=document.createElement('p'),back=document.createElement('button');back.className='button button-primary';card.append(title,note,back);overlay.append(card);document.body.append(overlay);
      back.onclick=()=>window.workshop.returnToDesktop();
      window.workshop.onWebVersionChanged(detail=>{
        if(detail.active){title.textContent=copy('Web-Version ist geöffnet','Web version is open');note.textContent=detail.error||copy('Deine Werkstatt läuft lokal im Browser. Lass diese App geöffnet. Zum Weiterarbeiten hier wechselst du zurück.','Your workshop is running locally in your browser. Keep this app open. Switch back to continue here.');back.textContent=copy('Zur Desktop-App wechseln','Switch back to desktop');overlay.hidden=false;document.querySelector('.app-shell').inert=true;back.focus();}
        else{for(const key of Object.keys(localStorage))if(key.startsWith('mw-')&&!Object.hasOwn(detail.preferences||{},key))localStorage.removeItem(key);for(const [key,value]of Object.entries(detail.preferences||{}))if(key.startsWith('mw-'))localStorage.setItem(key,value);location.reload();}
      });
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
