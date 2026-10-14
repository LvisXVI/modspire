'use strict';
(()=>{
  const config=window.workshopWebConfig;
  const client=crypto.randomUUID();
  let events;
  const ready=(async()=>{
    let result;
    do{
      const response=await fetch('/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client})});
      result=await response.json();if(!response.ok)throw Error(result.error);
      if(!result.granted&&result.retryAfterMs)await new Promise(resolve=>setTimeout(resolve,Math.min(5000,result.retryAfterMs+20)));
    }while(!result.granted&&result.retryAfterMs);
    if(!result.granted){location.replace('/in-use');return new Promise(()=>{});}
    events=new EventSource(`/events?client=${client}`);
    events.onmessage=event=>{const {channel,detail}=JSON.parse(event.data);const callbacks=listeners.get(channel);if(channel==='web:prepare-return'&&!callbacks?.size)pendingReturnEvent=detail;else for(const callback of callbacks||[])callback(detail);};
    events.onerror=()=>window.dispatchEvent(new CustomEvent('workshop-web-disconnected'));
    events.onopen=()=>window.dispatchEvent(new CustomEvent('workshop-web-connected'));
  })();
  const rpc=async(method,args)=>{
    await ready;
    let response;
    try{response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Workshop-Client':client},body:JSON.stringify({method,args})});}
    catch{throw Error(document.documentElement.lang==='en'?'The desktop app is no longer available.':'Die Desktop-App ist nicht mehr erreichbar.');}
    const result=await response.json();if(!response.ok)throw Error(result.error);return result.value;
  };
  const listeners=new Map();let pendingReturnEvent;
  const api={isWebVersion:true};
  for(const name of Object.keys(config.methods))api[name]=(...args)=>rpc(name,args);
  api.returnToDesktop=async()=>{const value=await rpc('returnToDesktop',[]);events?.close();window.dispatchEvent(new CustomEvent('workshop-web-disconnected'));return value;};
  api.saveWebPreferences=async preferences=>{await ready;const response=await fetch('/preferences',{method:'POST',headers:{'Content-Type':'application/json','X-Workshop-Client':client},body:JSON.stringify(preferences)});if(!response.ok)throw Error('Preferences could not be saved');};
  for(const [name,channel] of Object.entries(config.events))api[name]=callback=>{if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(callback);if(channel==='web:prepare-return'&&pendingReturnEvent!==undefined){const detail=pendingReturnEvent;pendingReturnEvent=undefined;queueMicrotask(()=>callback(detail));}return()=>listeners.get(channel)?.delete(callback);};
  api.saveProjectOnUnload=project=>navigator.sendBeacon(`/save-unload?client=${client}`,new Blob([JSON.stringify(project)],{type:'application/json'}));
  api.toggleFullscreen=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return !!document.fullscreenElement;};
  api.isFullscreen=async()=>!!document.fullscreenElement;
  api.onFullscreenChanged=callback=>document.addEventListener('fullscreenchange',()=>callback(!!document.fullscreenElement));
  api.isWindowMaximized=async()=>false;api.onMaximizedChanged=()=>{};
  api.toggleMaximized=async()=>false;api.minimizeWindow=async()=>false;api.closeWindow=async()=>false;
  window.workshop=api;
  document.addEventListener('DOMContentLoaded',()=>document.body.classList.add('browser-mode'));
})();
