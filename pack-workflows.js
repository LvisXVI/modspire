(function(root){
  let bridge,checked=null,checkedKey='',generation=0,busy=false,exporting=false,message='',selection=new Set(),lastKey='';
  const fingerprint=project=>JSON.stringify([project.id,project.minecraftVersion,project.loader,project.loaderVersion||'',(project.mods||[]).map(mod=>[mod.provider,mod.id,mod.versionId||'',mod.versionNumber||'',!!mod.dependency])]);
  const english=()=>String(bridge?.getLocale?.()||'de').startsWith('en');
  const text=(de,en)=>english()?en:de;
  const node=(tag,content,className)=>{const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el};
  function button(label,handler,disabled=false){const el=node('button',label,'button button-quiet');el.type='button';el.disabled=disabled;el.onclick=handler;return el}
  function render(){
    const host=document.getElementById('pack-workflows-panel');if(!host||!bridge)return;
    const project=bridge.getProject(),key=fingerprint(project);
    const providers=new Set((project.mods||[]).map(mod=>mod.provider||'modrinth'));
    const exportLabel=providers.size===1&&providers.has('curseforge')?text('CurseForge-ZIP exportieren','Export CurseForge ZIP'):providers.size===1&&providers.has('modrinth')?text('.mrpack exportieren','Export .mrpack'):text('Launcher-Pack exportieren','Export launcher pack');
    if(lastKey&&lastKey!==key){checked=null;selection.clear();message=text('Die Auswahl wurde geändert. Bitte erneut prüfen.','The selection changed. Please check again.');if(busy){generation++;busy=false}}
    lastKey=key;
    // Preserve the loader input while updating the preview for the same setup.
    const loaderSetup=JSON.stringify([project.id,project.minecraftVersion,project.loader,project.loaderVersion||'']);
    const loaderField=host.querySelector('#export-loader-version'),loaderValue=loaderField?.dataset.setup===loaderSetup?loaderField.value:project.loaderVersion||'';
    host.replaceChildren();
    host.append(node('h3',text('Mod-Updates & Launcher-Export','Mod updates & launcher export')));
    host.append(node('p',text('Passende Dateiversionen prüfen und dein Pack für einen Launcher exportieren.','Review matching file versions and export your pack for a launcher.')));
    const actions=node('div',undefined,'pack-workflow-actions');
    actions.append(button(busy?text('Prüfe …','Checking …'):text('Mod-Updates prüfen','Check mod updates'),check,busy||!project.mods.length));
    actions.append(button(text('Ausgewählte Versionen anwenden','Apply selected versions'),apply,busy||!selection.size||!checked||checkedKey!==key));
    host.append(actions);
    const status=node('p',message,'pack-workflow-status');status.setAttribute('role','status');host.append(status);
    const results=node('div',undefined,'pack-update-results');
    for(const entry of checked?.entries||[]){
      const row=node('div',undefined,'pack-update-row');
      const canApply=['update','unpinned'].includes(entry.status)&&entry.candidate;
      const label=node('label');
      if(canApply){const input=node('input');input.type='checkbox';input.checked=selection.has(entry.key);input.setAttribute('aria-label',text('Version für ','Select version for ')+(entry.mod?.title||entry.key));input.onchange=()=>{input.checked?selection.add(entry.key):selection.delete(entry.key);render()};label.append(input)}
      const copy=node('span');copy.append(node('strong',entry.mod?.title||entry.key));
      const current=entry.mod?.versionNumber||entry.mod?.versionId||text('nicht festgelegt','not pinned');
      const candidate=entry.candidate?.versionNumber||entry.candidate?.versionId;
      const detail=canApply?`${current} → ${candidate}`:{current:text('Aktuell','Current'),unavailable:text('Nicht verfügbar','Unavailable'),unsupported:text('Anbieter nicht unterstützt','Provider not supported')}[entry.status]||entry.status;
      copy.append(node('span',detail));
      const explanation=english()?entry.message:({current:'Keine neuere kompatible Version gefunden.',update:'Eine neuere kompatible Version ist verfügbar.',unpinned:entry.candidate?'Keine aktuelle Version festgelegt. Diese passende Version kann übernommen werden.':'Keine aktuelle Version festgelegt und keine passende Veröffentlichung verfügbar.'}[entry.status]||entry.message);
      if(explanation)copy.append(node('small',explanation));
      label.append(copy);row.append(label);results.append(row);
    }
    host.append(results);
    const exportArea=node('div',undefined,'pack-export-actions');
    const versionLabel=node('label',text('Loader-Version (optional, sonst automatisch)','Loader version (optional, otherwise automatic)'));
    const input=node('input');input.id='export-loader-version';input.type='text';input.maxLength=80;input.value=loaderValue;input.dataset.setup=loaderSetup;input.placeholder=text('Automatisch ermitteln','Resolve automatically');versionLabel.append(input);
    exportArea.append(versionLabel,button(exporting?text('Exportiere …','Exporting …'):exportLabel,exportPack,exporting||busy||!project.mods.length));
    host.append(exportArea,node('small',text('Vor dem Anwenden wird ein Pack-Stand gesichert. Nicht exportierbare Mods werden gemeldet.','A snapshot is saved before applying changes. Mods that cannot be exported are reported.')));
  }
  async function check(){
    if(busy)return;const project=JSON.parse(JSON.stringify(bridge.getProject())),key=fingerprint(project),request=++generation;
    busy=true;checked=null;selection.clear();message='';render();
    try{
      const result=await bridge.checkUpdates(project);
      if(request!==generation)return;
      if(fingerprint(bridge.getProject())!==key){message=text('Das Pack wurde geändert. Bitte erneut prüfen.','The pack changed. Please check again.');return}
      checked=result;checkedKey=key;
      message=(result.entries||[]).length?text('Prüfung abgeschlossen. Wähle die gewünschten Versionen aus.','Check complete. Select the versions you want.'):text('Keine Mods zum Prüfen vorhanden.','No mods to check.');
    }catch(error){if(request===generation)message=String(error.message||error)}
    finally{if(request===generation){busy=false;render()}}
  }
  async function apply(){
    if(!checked||!selection.size)return;
    if(checkedKey!==fingerprint(bridge.getProject())){checked=null;selection.clear();message=text('Das Pack wurde geändert. Bitte erneut prüfen.','The pack changed. Please check again.');render();return}
    const entries=checked.entries.filter(entry=>selection.has(entry.key)&&['update','unpinned'].includes(entry.status)&&entry.candidate);
    try{await bridge.applyUpdates(entries,checkedKey);checked=null;selection.clear();message=text('Versionen übernommen. Der vorherige Stand wurde gesichert.','Versions applied. The previous state was backed up.');bridge.status(message)}catch(error){message=String(error.message||error)}
    render();
  }
  async function exportPack(){
    if(exporting)return;const current=bridge.getProject(),project=JSON.parse(JSON.stringify(current));
    const providers=new Set((project.mods||[]).map(mod=>mod.provider||'modrinth'));
    if(providers.size!==1||![...providers].every(provider=>['modrinth','curseforge'].includes(provider))){message=text('Gemischte oder unbekannte Anbieter können nicht als gemeinsames Launcher-Pack exportiert werden. Nutze den JSON-Projektexport oder getrennte Packs.','Mixed or unknown providers cannot be exported as one launcher pack. Use JSON project export or separate packs.');render();return}
    const value=document.getElementById('export-loader-version')?.value.trim();if(value)project.loaderVersion=value;else delete project.loaderVersion;
    exporting=true;message=text('Dateiversionen und Abhängigkeiten werden aufgelöst …','Resolving file versions and dependencies …');render();
    try{const curseforge=providers.has('curseforge'),result=await (curseforge?bridge.exportCurseForge(project):bridge.exportMrpack(project));if(!result?.canceled){message=curseforge?text('CurseForge-Pack exportiert.','CurseForge pack exported.'):text('Modrinth-Pack exportiert.','Modrinth pack exported.');bridge.status(message)}else message=text('Export abgebrochen.','Export canceled.')}
    catch(error){message=String(error.message||error)}finally{exporting=false;render()}
  }
  root.WorkshopPackWorkflows={init(value){bridge=value;render()},render,fingerprint};
})(globalThis);
