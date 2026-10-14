const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'modern-ui.js'),'utf8');
  const start=source.indexOf('const PALETTES = ')+17,end=source.indexOf('\n  };',start)+4;
  const palettes=new Function(`return (${source.slice(start,end)});`)();
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.setContent('<body data-theme="clear"><section class="design-overlay local-web-overlay"><div class="design-card local-web-card"><h2>Web-Version ist geöffnet</h2><p>Deine Werkstatt läuft lokal im Browser.</p><button class="button button-primary">Zur Desktop-App wechseln</button></div></section></body>');
    await page.addStyleTag({content:['styles.css','visual-fixes.css','modern-ui.css','v3-ui.css','v4-ui.css','local-web.css'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n')+'\n*{transition:none!important}'});
    const failures=[];
    for(const mode of ['classic','modern','v3','v4'])for(const [theme,palette]of Object.entries(palettes)){
      const values=await page.evaluate(({mode,theme,palette})=>{
        document.body.className=mode==='classic'?'':`ui-${mode}`;document.body.dataset.theme=theme;
        for(const [key,value]of Object.entries(palette))document.documentElement.style.setProperty(`--modern-${key}`,value);
        for(const [key,value]of Object.entries({ink:palette.ink,muted:palette.muted,canvas:palette.canvas,surface:palette.card,'surface-raised':palette.inset,line:palette.line,accent:palette.accent}))document.documentElement.style.setProperty(`--v4-${key}`,value);
        const rgba=value=>{const numbers=value.match(/[\d.]+/g)?.map(Number)||[];return numbers.length>=3?[...numbers.slice(0,3),numbers[3]??1]:[0,0,0,0]};
        const blend=(top,bottom)=>top.slice(0,3).map((value,i)=>value*top[3]+bottom[i]*(1-top[3]));
        const luma=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const ratio=(fg,bg)=>{const a=luma(fg),b=luma(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        const card=document.querySelector('.local-web-card'),style=getComputedStyle(card),probe=document.createElement('i');probe.style.backgroundColor=style.getPropertyValue('--dialog-surface');card.append(probe);
        const background=blend(rgba(getComputedStyle(probe).backgroundColor),rgba(style.backgroundColor));probe.remove();
        return [...card.querySelectorAll('h2,p,button')].map(node=>{const s=getComputedStyle(node),bg=node.tagName==='BUTTON'?blend(rgba(s.backgroundColor),background):background;return {element:node.tagName,contrast:ratio(rgba(s.color),bg),color:s.color,background:bg}});
      },{mode,theme,palette});
      for(const value of values)if(value.contrast<4.5)failures.push({mode,theme,...value});
    }
    assert.deepEqual(failures,[],'web handoff text and button meet 4.5:1 contrast across all 36 UI/theme combinations');
    fs.mkdirSync(path.join(root,'work'),{recursive:true});await page.screenshot({path:path.join(root,'work','local-web-contrast.png')});
    console.log('Web handoff title, copy and return button: 4.5:1 contrast in 36 UI/theme combinations.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
