'use strict';
(async()=>{
  const english=navigator.language.startsWith('en');
  try {
    const token=location.hash.slice(1);history.replaceState(null,'','/');
    const response=await fetch('/session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});
    const data=await response.json();if(!response.ok)throw Error(data.error);
    for(const key of Object.keys(localStorage))if(key.startsWith('mw-')&&!Object.hasOwn(data.preferences||{},key))localStorage.removeItem(key);
    for(const [key,value] of Object.entries(data.preferences||{}))if(key.startsWith('mw-')&&typeof value==='string')localStorage.setItem(key,value);
    location.replace('/app');
  }catch(error){document.getElementById('web-bootstrap-status').textContent=english?'Open the local web version again using the button in the desktop app.':'Öffne die lokale Web-Version bitte erneut über den Button in der Desktop-App.';}
})();
