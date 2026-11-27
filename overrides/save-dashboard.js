const wikiSaveInteger = new Intl.NumberFormat('it-IT',{maximumFractionDigits:0});
const wikiSaveGP = value => wikiSaveInteger.format(value)+' GP';
const wikiSaveNumber = value => new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value);
const wikiSaveDuration = seconds => Number.isFinite(seconds) ? dropEstimateTime(seconds) : '—';

function wikiSaveRef(type,id) {
  if (!id) return '—';
  const node = publicNode(type,id);
  return node ? link(node,true) : escape(human(saveShort(id)));
}

function wikiSaveSection(id,title,body) {
  return '<section id="'+id+'"><h2>'+title+'</h2>'+body+'</section>';
}

function wikiSaveDetails(title,body) {
  return '<details><summary>'+title+'</summary>'+body+'</details>';
}

function wikiSaveItemCounts(items) {
  return [...items].map(([id,qty]) => wikiSaveRef('Item',id)+' ×'+wikiSaveNumber(qty)).join('<br>')||'—';
}

function wikiSaveTraining(save,analysis) {
  const {training,profile}=analysis;
  const rows = [...save.skills].map(([skill,xp]) => {
    const level=profile.levelFor(skill), candidates=training.get(skill)||[], best=candidates[0];
    const guide = payload.guides.skills[skill] ? '<a href="'+escape(route('guide',{id:skill}))+'">Training guide</a>' : '—';
    return [wikiSaveRef('Skill',skill),numericCell(level),numericCell(xp),level===99?'Max level':numericCell(trainingXP(level+1)-xp),
      best?link(best.node,true):guide,best?numericCell(best.activeRate*3600):'—',
      best?.sustain?numericCell(best.sustain*3600):'—',wikiSaveDuration(best?.time)];
  });
  const comparisons = [...training].map(([skill,choices]) => wikiSaveDetails(escape(human(skill)),
    table(['Action','Avg. action time','XP/h in action','XP/h incl. supplies','Actions from bank','Time to next level','Supply route'],choices.slice(0,12).map(choice => [
      link(choice.node,true),wikiSaveDuration(choice.activeTime),numericCell(choice.activeRate*3600),choice.sustain?numericCell(choice.sustain*3600):'—',
      Number.isFinite(choice.stockActions)?numericCell(choice.stockActions):'—',
      wikiSaveDuration(choice.time),[...new Set(moneyRouteSteps(choice.inputs).map(({path})=>link(path.node,true)))].join('<br>')||'—'
    ]),true)));
  return wikiSaveSection('save-training','Skills and training',
    '<p>Each recommendation targets your next level. Recipes use your bank first, then count the time to replace materials. Thieving counts unsuccessful attempts, stuns and replenishing food. The table compares repeatable methods with readable requirements.</p>'+
    table(['Skill','Level','XP','XP to next level','Train on','XP/h in action','XP/h incl. supplies','Time to next level'],rows,true)+
    (comparisons.length?'<h3>Compare unlocked actions</h3>'+comparisons.join(''):'')+
    '<p>Estimates use base rates plus supported Mining and Thieving bonuses. Farming, Ranching, Hunting, Agility and combat depend on additional state. See their skill guides and your recorded combat rates below.</p>');
}

function wikiSaveMoney(analysis) {
  const rows=analysis.gold.slice(0,15).map(({entry,cycle,rate,level}) => [
    moneyStrategyLink(entry,level),
    moneyRequiredSkills(entry,cycle.inputs),{sort:rate,numeric:true,html:wikiSaveGP(rate)},wikiSaveDuration(cycle.actionSeconds),
    wikiSaveDuration(cycle.seconds-cycle.actionSeconds)
  ]);
  const breakdown=analysis.gold.slice(0,5).map(({entry,cycle,rate,level,boosters}) => {
    const activeShare=cycle.actionSeconds/cycle.seconds;
    return wikiSaveDetails(escape(moneyStrategyName(entry)), '<p><strong>'+wikiSaveGP(rate)+'/h net</strong> = '+
      wikiSaveGP(cycle.gp*3600/cycle.seconds)+'/h gross − '+wikiSaveGP(cycle.cash*3600/cycle.seconds)+'/h in recurring costs.</p>'+
      '<p>In an average hour, spend '+wikiSaveDuration(3600*activeShare)+' on the main action and '+
      wikiSaveDuration(3600*(1-activeShare))+' replacing supplies.</p>'+
      (cycle.inputs.length?moneyRouteTable(cycle.inputs):'')+
      (boosters.length?table(['Booster used','Effect'],boosters.map(({node,mods})=>[readerBoosterName(node),
        mods.map(mod=>mod.Stat?wikiBonusText(mod,node):wikiAllBonusText({Global:[mod]},node)).join('<br>')
      ]),true):'')+'<p>'+moneyStrategyLink(entry,level)+'</p>');
  }).join('');
  return wikiSaveSection('save-gold','Money making',
    '<p>Best repeatable routes currently available out of the modeled methods. Profit is gold and sale value minus recurring GP costs. The hourly rate includes gathering, crafting and food replacement where applicable. Supported permanent and equipped boosters apply to the main action when the save confirms them.</p>'+
    (rows.length?table(['Strategy','Required skills','Est. net GP/h','Action per cycle','Supply time per cycle'],rows):'<p>No repeatable GP route could be verified for this save.</p>')+
    (breakdown?'<h3>Profit breakdown</h3>'+breakdown:'')+
    '<p>Strategy pages offer separate setup comparisons. Combat history below shows what your own fights earned.</p>');
}

function wikiSaveCombatHistory(save) {
  const records=[...save.combat].filter(([,r])=>r.count>0);
  if (!records.length) return '';
  const totalKills=records.reduce((sum,[,r])=>sum+r.count,0);
  const totalTime=records.reduce((sum,[,r])=>sum+Math.max(0,r.time),0);
  const rows=records.sort(([,a],[,b])=>b.count-a.count).map(([id,r]) => {
    const gp=r.currency.get('GoldPieces')||0n;
    const gross=Number(gp)+[...r.items].reduce((sum,[item,qty])=>sum+qty*moneyQuote(item),0);
    const xp=[...r.xp.values()].reduce((a,b)=>a+b,0);
    const details=wikiSaveDetails('View history','<p>Direct gold '+wikiSaveGP(gp)+'</p>'+
      (r.currency.size>1?'<p>'+[...r.currency].filter(([id])=>id!=='GoldPieces').map(([id,qty])=>wikiSaveRef('Currency',id)+' ×'+wikiSaveInteger.format(qty)).join('<br>')+'</p>':'')+
      '<p>'+wikiSaveItemCounts(r.items)+'</p><p>'+[...r.xp].map(([skill,value])=>wikiSaveRef('Skill',skill)+' '+wikiSaveNumber(value)+' XP').join('<br>')+'</p>');
    return [wikiSaveRef('Enemy',id),numericCell(r.count),wikiSaveDuration(r.time),wikiSaveDuration(r.time>0?r.time/r.count:NaN),
      r.time>0?wikiSaveGP(gross*3600/r.time):'—',r.time>0?numericCell(xp*3600/r.time):'—',details];
  });
  return wikiSaveSection('save-combat','Combat history','<p><strong>'+wikiSaveNumber(totalKills)+' kills</strong> in '+wikiSaveDuration(totalTime)+
    ' of fight time in the game’s retained loot history. GP/h is gross and excludes downtime, ammunition, food and other supplies. XP/h sums all skills that received XP.</p>'+
    table(['Monster','Kills','Fight time','Avg. kill','Gross GP/h','Total XP/h','Loot and XP'],rows,true));
}

function wikiSaveThievingHistory(save) {
  const rows=[...save.thieving].filter(([,r])=>r.count>0).sort(([,a],[,b])=>b.count-a.count).map(([id,r])=>{
    const gp = r.currency.get('GoldPieces')||0n;
    const loot = [...r.items].reduce((sum,[id,quantity])=>sum+moneyQuote(id)*quantity,0);
    return [wikiSaveRef('ThievingRecipe',id),numericCell(r.count),wikiSaveDuration(r.active),wikiSaveDuration(r.stunned),
      wikiSaveGP(gp),wikiSaveGP(loot),numericCell(r.xp.get('MelvorBase:Thieving')||0),
      wikiSaveDetails('Items',wikiSaveItemCounts(r.items))];
  });
  return rows.length ? wikiSaveSection('save-thieving','Thieving history',
    '<p>Successful stages, loot and recorded stun time for targets still in the game’s loot history. The clock in this log does not include every failed action.</p>'+
    table(['Target','Successful stages','Time stealing','Time stunned','Direct gold','Loot sale value','XP','Loot'],rows,true)) : '';
}

function wikiSaveLuck(save,analysis) {
  const rows=[], thieving=[];
  for (const [id,record] of save.combat) {
    const stats=payload.monsters.enemies[bare(id)], node=publicNode('Enemy',id);
    if (!node || !stats?.locations?.length || !stats.locations.every(x=>x.type==='CombatArea') || !(record.count>0)) continue;
    const loot = node.data.Drops;
    for (const drop of wikiSaveExpectedLoot(loot?.ItemTables||[],new Set((loot?.FixedItems||[]).map(x=>x.Item)),record)) {
      rows.push([node,drop,record.count]);
    }
  }
  for (const [id,record] of save.thieving) {
    const node = publicNode('ThievingRecipe',id);
    if (!node || record.count<=0) continue;
    const d = node.data;
    const tables = [
      {Chance:d.BaseCommonLootChance,Table:d.CommonDropTable},
      {Chance:d.BaseRareLootChance,Table:d.RareDropTable}
    ];
    const completion = new Set((d.CompletionDropTable||[]).map(x=>x.Item));
    for (const drop of wikiSaveExpectedLoot(tables,completion,record)) thieving.push([node,drop,record.count]);
  }
  const percent=p=>p===0?'≈0%':publicChanceDisplay(p);
  const dropComparison = (entries,source,basis) => {
    entries.sort(([,a],[,b])=>(a.dry??1)-(b.dry??1)||b.expected-a.expected);
    return wikiSaveDetails('Compare '+wikiSaveNumber(entries.length)+' drops',
      table([source,'Item',basis,'Base chance per roll','Recorded qty','Avg. expected qty','Chance of zero'],
        entries.map(([node,d,count])=>[link(node,true),wikiSaveRef('Item',d.id),numericCell(count),percent(d.p),
          numericCell(d.observed),numericCell(d.expected),d.dry==null?'—':percent(d.dry)]),true));
  };
  const pets=[];
  for (const [skill,entries] of save.pets) {
    for (const [id,unlocked] of entries) {
      const pet = publicNode('Pet',id), trigger=pet?.data.Trigger;
      const scale=bare(trigger?.Type)==='ChancePerExperience' ? trigger?.Data?.ScaleFactor : 0;
      const xp=save.skills.get(skill);
      if (!pet) continue;
      const eligibleSkill=saveShort(trigger?.Data?.Component?.Entity||'');
      const chance=scale>0 && Number.isFinite(xp) && eligibleSkill===skill ? -Math.expm1(-xp/scale) : null;
      const rate=analysis.training.get(skill)?.[0]?.sustain;
      const timeAt = p => !unlocked&&chance!=null&&rate>0 ? wikiSaveDuration(-Math.log1p(-p)*scale/rate) : '—';
      pets.push([link(pet,true),wikiSaveRef('Skill',skill),unlocked?'Unlocked':'Locked',
        chance==null?'—':numericCell(xp),chance==null?'—':percent(chance),
        timeAt(.5),timeAt(.99)]);
    }
  }
  if (!rows.length && !thieving.length && !pets.length) return '';
  return wikiSaveSection('save-luck','Drops and luck',
    (rows.length?'<h3>Monster drops</h3><p>Compare recorded quantities with an unboosted average. A dry streak is the chance of zero drops across the recorded kills at base odds. Historical boosters and eligibility can change that comparison.</p>'+
      dropComparison(rows,'Monster','Kills'):'')+
    (thieving.length?'<h3>Thieving drops</h3><p>Base odds already include the chance that the common or rare table rolls. Comparisons use recorded successful stages. Completion rewards and historical loot buffs need separate data.</p>'+
      dropComparison(thieving,'Target','Successful stages'):'')+
    (pets.length?'<h3>Pets</h3><p>Lifetime XP approximates eligible XP. Time from here uses the recommended sustainable XP rate. Each eligible roll is independent, so past misses do not improve future odds. The save does not store individual rolls or the XP at unlock.</p>'+
      table(['Pet','Skill','Status','Skill XP','Approx. chance by now','50% from now','99% from now'],pets,true):''));
}

function wikiSaveTimeHistory(save) {
  const get = (id,key) => save.stats.get(id)?.values.get('MelvorBase:'+key)||0;
  const rows = [...save.stats.keys()].filter(id=>get(id,id+'TotalTimeSpent')>0).map(id=>[
    publicNode('Skill',id)?wikiSaveRef('Skill',id):escape(human(id)),
    wikiSaveDuration(get(id,id+'TotalTimeSpent')/1000),
    wikiSaveDuration(get(id,id+'OnlineTimeSpent')/1000),
    wikiSaveDuration(get(id,id+'OfflineTimeSpent')/1000)
  ]);
  const total = get('CharacterStatistics','TotalTrainingTime');
  if (!total && !rows.length) return '';
  return wikiSaveSection('save-time','Time spent',
    (total?'<p>Recorded training time <strong>'+wikiSaveDuration(total/1000)+'</strong>. Idling without an action <strong>'+
      wikiSaveDuration(get('CharacterStatistics','TotalNothingTime')/1000)+'</strong>.</p>':'')+
    (rows.length?table(['Activity','Total','Online','Offline'],rows,true):''));
}

function wikiSaveInventory(save,profile) {
  const price=([...profile.stock].reduce((sum,[id,qty])=>sum+moneyQuote(id)*qty,0));
  const tabDetails=save.bank.map(({name,items},i) => {
    const stacks=items.filter(item=>!item.placeholder&&item.quantity>0);
    return wikiSaveDetails(escape(name||'Bank tab '+(i+1))+' ('+stacks.length+')',
      table(['Item','In bank','Sell value','Locked'],stacks.map(item=>[
        wikiSaveRef('Item',item.id),numericCell(item.quantity),wikiSaveGP(moneyQuote(item.id)*item.quantity),item.locked?'Yes':'—'
      ]),true));
  }).join('');
  const slots=(title,entries)=>entries.size?wikiSaveDetails(title,table(['Slot','Item','Quantity'],[...entries].map(([slot,item])=>[
    escape(human(saveShort(slot))),wikiSaveRef('Item',item.id),item.quantity>1?numericCell(item.quantity):'—'
  ]),true)):'';
  const gear=slots('Equipped for combat',save.equipment.slots)+[...save.equipment.loadouts].map(([id,v])=>slots(escape(human(saveShort(id))),v)).join('')+
    [...save.toolbelts].map(([id,v])=>slots(escape(human(id))+' toolbelt',v)).join('');
  const selections=[['Combat food','Item',save.combatFood],['Thieving food','Item',save.thievingFood],['Agility food','Item',save.agilityFood],
    ['Fishing bait','Item',save.fishingBait],['Spell','MagicSpell',save.magic[0]],['Imbuement','Imbuement',save.magic[1]]].filter(row=>row[2]);
  return (tabDetails||gear||selections.length) ? wikiSaveSection('save-inventory','Bank and equipment',
    (tabDetails?'<p>'+wikiSaveNumber(profile.stock.size)+' distinct items with '+wikiSaveGP(price)+' total base sell value.</p>'+tabDetails:'')+
    (gear?'<h3>Equipment, toolbelts and loadouts</h3>'+gear:'')+
    (selections.length?table(['Selection','Equipped'],selections.map(([label,type,id])=>[label,wikiSaveRef(type,id)])):'')+
    (save.shop.size?wikiSaveDetails('Shop purchases',table(['Purchase','Quantity'],[...save.shop].filter(([,qty])=>qty>0)
      .map(([id,qty])=>[wikiSaveRef('ShopPurchase',id),numericCell(qty)]),true)):'')
  ):'';
}

function wikiSaveProgress(save,profile) {
  const questStatus = status => ({0:'Not started',1:'In progress',2:'In progress',3:'Complete'})[status]||'—';
  const quests=[...save.quests].filter(([,q])=>q.status>0);
  const questRows=quests.map(([id,q])=>[wikiSaveRef('Quest',id),questStatus(q.status),
    [...q.steps.values()].filter(s=>s.status===2).length+' / '+q.steps.size,
    wikiSaveDetails('Steps and tasks',[...q.steps].map(([id,s])=>'<p><strong>'+escape(human(saveShort(id)))+'</strong></p>'+
      table(['Task','Status','Tracked goals'],[...s.tasks].map(([id,t])=>[escape(human(saveShort(id))),(['Not reached','Active','Complete'])[t.status]||'—',
        [...t.goals.values()].map(g=>g.complete?'Complete':wikiSaveNumber(g.progress)).join('<br>')||'—']))).join(''))
  ]);
  const astro=[...save.astrology].map(([id,c])=>[
    wikiSaveRef('AstrologyConstellation',id),numericCell(c.knowledge),
    c.minor.map(id=>wikiSaveRef('AstrologyNode',id)).join('<br>')||'—',c.major.map(id=>wikiSaveRef('AstrologyNode',id)).join('<br>')||'—'
  ]);
  const mastery=[...save.mastery].map(([skill,tasks])=>{
    const guild=profile.mastery.get(skill), rank=guild?.ranks.at(-1);
    const estimate=guild?'<p>Verified from this save: '+wikiSaveNumber(guild.points)+' / '+wikiSaveNumber(guild.total)+' points'+
      (rank?' · '+escape(rank.name):'')+'.</p>':'';
    return wikiSaveDetails(escape(human(skill))+' ('+tasks.size+' tasks)',estimate+
      table(['Task','Recorded progress','Status'],[...tasks].map(([id,t])=>[
      wikiSaveRef('MasteryGuildTask',id),t.progress==null?'—':numericCell(t.progress),
      t.complete?'Goal complete':t.progress==null?'Check task conditions':'In progress'
    ]),true));
  }).join('');
  const slayer=[...save.slayer].filter(([,m])=>m.target||m.blocked.size).map(([id,m])=>[
    wikiSaveRef('SlayerMaster',id),wikiSaveRef('Enemy',m.target),m.target?wikiSaveNumber(m.progress)+' / '+wikiSaveNumber(m.length):'—',
    m.auto?'On':'Off',[...m.blocked.values()].filter(b=>b.target).map(b=>wikiSaveRef('Enemy',b.target)).join('<br>')||'—'
  ]);
  const hunting=[...save.hunting].filter(([,a])=>a.discovered).map(([id,a])=>[wikiSaveRef('HuntingAnimal',id),numericCell(a.level),numericCell(a.xp)]);
  const body=(questRows.length?'<h3>Quests</h3>'+table(['Quest','Status','Steps complete','Progress'],questRows,true):'')+
    (astro.length?'<h3>Astrology</h3>'+table(['Constellation','Knowledge','Minor nodes unlocked','Major nodes unlocked'],astro,true):'')+
    (mastery?'<h3>Mastery Guild</h3>'+mastery:'')+
    (slayer.length?'<h3>Slayer</h3>'+table(['Master','Current task','Progress','Auto Slayer','Blocked enemies'],slayer,true):'')+
    (hunting.length?wikiSaveDetails('Hunting journal',table(['Animal','Level','XP'],hunting,true)):'')+
    (save.techniques.size?wikiSaveDetails('Agility techniques',table(['Technique','XP'],[...save.techniques].map(([id,xp])=>[
      wikiSaveRef('AgilityTechnique',id),numericCell(xp)
    ]),true)):'');
  return body?wikiSaveSection('save-progress','Unlocks and progress',body):'';
}

function wikiSaveStats(save) {
  const title=id=>escape(human(saveShort(id)));
  const values=[...save.stats].map(([entity,stats])=>{
    const rows=[...stats.values].filter(([,value])=>value!==0).map(([id,value])=>[title(id),numericCell(value)]);
    const details=[...stats.groups].filter(([,entries])=>entries.size).map(([id,entries])=>
      wikiSaveDetails(title(id),table(['Entry','Recorded value'],[...entries].map(([key,value])=>{
        const node=publicNode('Item',key)||publicNode('Enemy',key)||publicNode('Currency',key);
        return [node?link(node,true):title(key),numericCell(value)];
      }),true))).join('');
    return rows.length||details?wikiSaveDetails(title(entity),(rows.length?table(['Statistic','Recorded value'],rows,true):'')+details):'';
  }).join('');
  return values?wikiSaveSection('save-stats','Recorded statistics','<p>Lifetime counters read from the save. Units follow the game counter.</p>'+values):'';
}

function wikiSaveReport(save) {
  const analysis=wikiSaveAdvice(save), date = new Date(Number((save.ticks-621355968000000000n)/10000n));
  const activeSkill=publicNode('Skill',save.activeSkill);
  const active = [activeSkill?link(activeSkill,true):'',save.activeAction?escape(human(saveShort(save.activeAction))):''].filter(Boolean).join(' · ');
  const balances=[...save.wallet].filter(([id,qty])=>qty!==0n&&id!=='GoldPieces'&&id!=='SlayerCoins');
  const sections=[
    wikiSaveTraining(save,analysis),wikiSaveMoney(analysis),wikiSaveCombatHistory(save),wikiSaveThievingHistory(save),wikiSaveLuck(save,analysis),
    wikiSaveTimeHistory(save),wikiSaveInventory(save,analysis.profile),wikiSaveProgress(save,analysis.profile),wikiSaveStats(save)
  ].filter(Boolean);
  const contents=sections.map(section=>{
    const match=section.match(/^<section id="([^"]+)"><h2>([^<]+)<\/h2>/);
    return '<a href="#/save?section='+match[1]+'">'+match[2]+'</a>';
  }).join('');
  return '<h2>'+escape(save.character||'Character')+'</h2>'+
    '<p>'+escape([human(saveShort(save.mode)),save.demo?'Demo':'',Number.isNaN(date.getTime())?'':'Saved '+date.toLocaleString()].filter(Boolean).join(' · '))+'</p>'+
    '<dl class="save-summary"><div><dt>Total level</dt><dd>'+wikiSaveNumber(save.totalLevel)+'</dd></div>'+
    '<div><dt>Gold</dt><dd>'+wikiSaveGP(save.gold)+'</dd></div>'+
    '<div><dt>Slayer coins</dt><dd>'+wikiSaveInteger.format(save.slayerCoins)+'</dd></div>'+
    (active?'<div><dt>Last action</dt><dd>'+active+'</dd></div>':'')+'</dl>'+
    (balances.length?'<p>'+balances.map(([id,qty])=>wikiSaveRef('Currency',id)+' ×'+wikiSaveInteger.format(qty)).join(' · ')+'</p>':'')+
    (save.warnings.length?'<p>Some save sections could not be read. Advice excludes requirements that could not be verified.</p>':'')+
    '<nav class="save-contents" aria-label="Report sections">'+contents+'</nav>'+sections.join('');
}

function wikiSaveFolderHelp() {
  const path = String.raw`%APPDATA%\Games By Malcs\Melvor Idle 2\steam`;
  return '<div class="save-folder"><strong>Find your Steam save on Windows</strong>'+
    '<div class="save-folder-path"><input type="text" aria-label="Windows save folder" value="'+escape(path)+'" readonly spellcheck="false">'+
    '<button type="button" data-copy-save-folder>Copy folder path</button></div>'+
    '<ol><li>Copy the folder path, then click <strong>Choose File</strong>.</li>'+
    '<li>In the file window, press <kbd>Alt</kbd> + <kbd>D</kbd>, paste the path and press <kbd>Enter</kbd>.</li>'+
    '<li>Open the numbered Steam folder and select your <code>.sav</code>. Use <code>.bak</code> to read a backup.</li></ol>'+
    '<p class="save-folder-status" role="status"></p></div>';
}

function wikiBindSaveFolderHelp(container) {
  const help=container.querySelector('.save-folder');
  const path=help.querySelector('input');
  const status=help.querySelector('[role="status"]');
  help.querySelector('[data-copy-save-folder]').addEventListener('click',async () => {
    try {
      await navigator.clipboard.writeText(path.value);
      status.textContent='Folder path copied.';
    } catch {
      path.focus();
      path.select();
      status.textContent='Path selected. Press Ctrl + C to copy.';
    }
  });
}

function wikiSavePage() {
  main.innerHTML='<h1>Save Analyzer</h1><p>Choose your Melvor Idle 2 <code>.sav</code> or <code>.bak</code> to see your progress and compare what you can train or farm now.</p>'+
    '<p>Your save is processed in this tab. The wiki does not upload the file or keep a copy.</p>'+
    '<div class="save-controls"><label for="wiki-save-file">Save file</label><input type="file" id="wiki-save-file" accept=".sav,.bak,application/octet-stream">'+
    '<button type="button" id="wiki-save-clear" hidden>Clear save</button></div>'+wikiSaveFolderHelp()+
    '<p role="status" aria-live="polite" id="wiki-save-status"></p><div id="wiki-save-report"></div>';
  const input=main.querySelector('#wiki-save-file'), clear=main.querySelector('#wiki-save-clear');
  const status=main.querySelector('#wiki-save-status'), report=main.querySelector('#wiki-save-report');
  wikiBindSaveFolderHelp(main);
  let attempt=0;
  clear.addEventListener('click',()=>{
    ++attempt;
    input.value='';
    clear.hidden=true;
    status.textContent='';
    report.replaceChildren();
  });
  report.addEventListener('click',event=>{
    const href=event.target.closest('.save-contents a')?.getAttribute('href');
    if (!href) return;
    event.preventDefault();
    report.querySelector('#'+href.split('=').at(-1))?.scrollIntoView({block:'start'});
  });
  input.addEventListener('change',async () => {
    const file=input.files[0], current=++attempt;
    report.replaceChildren();
    if(!file) { clear.hidden=true; status.textContent=''; return; }
    clear.hidden=false;
    if(file.size<16||file.size>8*1024*1024) { status.textContent='Choose a Melvor Idle 2 .sav or .bak file under 8 MB.'; return; }
    if(location.protocol==='file:') { status.textContent='Open the online wiki or serve this copy over HTTP to use the save decoder.'; return; }
    status.textContent='Reading save and comparing routes…';
    try {
      const bytes=await wikiSaveInflate(file);
      if(current!==attempt||!report.isConnected) return;
      const save=wikiSaveParse(bytes);
      const template = document.createElement('template');
      template.innerHTML=wikiSaveReport(save);
      // Even a request for item art would reveal which records the save contains.
      for (const image of template.content.querySelectorAll('img')) image.remove();
      report.replaceChildren(template.content);
      status.textContent='Save analyzed.';
    } catch(error) {
      if(current!==attempt||!report.isConnected) return;
      status.textContent=error?.message==='Unsupported save version'
        ? 'This analyzer supports Melvor Idle 2 save versions 31 and 32. This file uses a different version.'
        : 'Could not analyze this save. Try a complete Melvor Idle 2 .sav or .bak file.';
    }
  });
}
