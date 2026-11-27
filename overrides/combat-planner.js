function combatOption(value,label) {
  return '<option value="'+escape(value)+'">'+escape(label)+'</option>';
}

function combatGearPicker(select, imageFor) {
  const wrapper=select.parentElement, name=select.dataset.picker, key=select.name;
  const holder=document.createElement('div');
  holder.className='combat-picker';
  holder.innerHTML='<button type="button" class="combat-picker-trigger" aria-haspopup="listbox" aria-expanded="false">'+
    '<span data-gear-icon="'+key+'" aria-hidden="true"></span><span class="combat-picker-selected"></span></button>'+
    '<div class="combat-picker-popup" hidden><input type="search" autocomplete="off" placeholder="Search '+escape(name.toLowerCase())+
    '" aria-label="Search '+escape(name.toLowerCase())+'"><div role="listbox" aria-label="'+escape(name)+' options"></div>'+
    '<p class="combat-picker-empty" hidden>No matching options.</p></div>';
  select.after(holder);
  select.hidden=true;
  const trigger=holder.querySelector('button'), popup=holder.querySelector('.combat-picker-popup');
  const icon=trigger.firstElementChild, label=trigger.lastElementChild;
  const search=popup.querySelector('input'), list=popup.querySelector('[role=listbox]'), empty=popup.querySelector('p');

  function thumbnail(place,value) {
    const src=imageFor(key,value);
    if (!src) { place.replaceChildren(); return; }
    if (place.firstChild?.getAttribute('src')===src) return;
    const image=document.createElement('img');
    image.className='icon';
    image.alt='';
    image.src=src;
    place.replaceChildren(image);
  }
  function close(returnFocus=false) {
    popup.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    if (returnFocus) trigger.focus();
  }
  function options() {
    const query=search.value.trim().toLowerCase();
    const matches=[...select.options].filter(o=>o.textContent.toLowerCase().includes(query));
    const rows=matches.map(o=>{
      const button=document.createElement('button'), art=document.createElement('span');
      button.type='button';
      button.tabIndex=-1;
      button.className='combat-picker-option';
      button.dataset.value=o.value;
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(o.selected));
      thumbnail(art,o.value);
      button.append(art,o.textContent);
      return button;
    });
    list.replaceChildren(...rows);
    empty.hidden=rows.length>0;
  }
  function selectRow(row) {
    select.value=row.dataset.value;
    close(true);
    select.dispatchEvent(new Event('input',{bubbles:true}));
  }
  trigger.addEventListener('click',()=>{
    if (!popup.hidden) { close(); return; }
    search.value='';
    options();
    popup.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    search.focus({preventScroll:true});
    const selected=list.querySelector('[aria-selected=true]');
    if (selected) list.scrollTop=selected.offsetTop-list.offsetTop;
  });
  search.addEventListener('input',options);
  list.addEventListener('click',event=>{
    const row=event.target.closest('[role=option]');
    if (row) selectRow(row);
  });
  holder.addEventListener('focusout',event=>{
    if (!holder.contains(event.relatedTarget)) close();
  });
  holder.addEventListener('keydown',event=>{
    if (popup.hidden && event.target===trigger && event.key==='ArrowDown') {
      event.preventDefault();
      trigger.click();
      return;
    }
    if (popup.hidden) return;
    const rows=[...list.children], index=rows.indexOf(event.target);
    if (event.key==='Escape') { event.preventDefault(); close(true); }
    if (event.key==='Enter'&&event.target===search) {
      event.preventDefault();
      if (rows.length) selectRow(rows[0]);
    }
    if (!rows.length || !['ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const step=event.key==='ArrowDown'?1:-1;
    rows[(index<0&&step<0?rows.length-1:(index+step+rows.length)%rows.length)].focus();
  });
  return () => {
    const selected=select.selectedOptions[0];
    label.textContent=selected?.textContent||'None';
    trigger.setAttribute('aria-label',name+': '+label.textContent);
    trigger.disabled=!select.options.length;
    thumbnail(icon,select.value);
    if (!popup.hidden) {
      for(const row of list.children) thumbnail(row.firstElementChild,row.dataset.value);
    }
  };
}

function combatPlannerSetup(label) {
  const slots=byType.get('EquipmentSlot')||[];
  const list=(byType.get('Item')||[]).slice().sort((a,b)=>collator.compare(a.name,b.name));
  const select=(key,name,options)=>{
    const fixed={Weapon:'Attack',food:'Cooking'}[key];
    const caption='<span class="combat-field-label">'+(fixed?icon(publicNode('Skill',fixed)):'')+escape(name)+'</span>';
    return key==='tier'?'<label>'+caption+'<select name="'+key+'">'+options+'</select></label>':
      '<div class="combat-choice">'+caption+'<select aria-label="'+escape(name)+'" data-picker="'+escape(name)+'" name="'+key+'">'+options+'</select></div>';
  };
  const none=combatOption('','None');
  const items=type=>list.filter(x=>x.data.Capabilities?.['MelvorBase:Equipment']?.Type===type&&
    (bare(type)!=='Weapon'||x.data.Capabilities['MelvorBase:Weapon'])).map(x=>combatOption(x.id,x.name)).join('');
  const nodes=type=>none+(byType.get(type)||[]).map(x=>combatOption(x.id,x.name)).join('');
  const food=list.filter(x=>x.data.Capabilities?.['MelvorBase:Food']?.BaseHealing>0).map(x=>combatOption(x.id,x.name)).join('');
  return '<fieldset class="combat-setup"><legend>Setup '+label+'</legend><div class="combat-fields">'+
    select('Weapon','Weapon',items('MelvorBase:Weapon'))+select('stance','Stance','')+
    select('food','Food',none+food)+select('tier','Auto Eat',[0,1,2,3].map(x=>combatOption(String(x),x?'Tier '+x:'Off')).join(''))+
    '</div><details open><summary>Combat levels</summary><div class="combat-fields">'+
    ['Attack','Strength','Defence','Hitpoints','Ranged','Magic','Prayer','Slayer'].map(skill=>'<label><span class="combat-field-label">'+
      icon(publicNode('Skill',skill))+skill+'</span>'+
      '<input name="'+skill+'" type="number" min="1" max="99" step="1" value="20" required></label>').join('')+
    '</div></details><details><summary>Armour, ammunition, spell and prayer</summary><div class="combat-fields">'+
    slots.filter(x=>bare(x.id)!=='Weapon').map(x=>select(bare(x.id),x.name,none+items(x.data.FitsType))).join('')+
    select('spell','Spell',nodes('MagicSpell'))+select('imbuement','Imbuement',nodes('Imbuement'))+
    select('prayer','Prayer',nodes('Prayer'))+
    '</div></details><div class="combat-key-stats"></div></fieldset>';
}

function combatPlannerTargets() {
  const {areas}=idleData(), targets=[], seen=new Set();
  for (const area of areas.filter(x=>x.node.type==='CombatArea')) {
    for (const id of area.enemies) {
      const node=publicNode('Enemy',id);
      if (!node) continue;
      seen.add(id);
      targets.push({node,area:area.node,category:area.category});
    }
  }
  for (const node of byType.get('Enemy')||[]) if (!seen.has(node.id)) targets.push({node,category:'All Monsters'});
  for (const {node,category} of areas.filter(x=>x.node.type==='Dungeon')) targets.push({node,category,kind:'dungeon'});
  for (const master of idleSlayerPools(areas)) targets.push({node:master.node,category:'Slayer Masters',kind:'slayer',master});
  return targets;
}

function combatPlannerGroups() {
  return ['Combat Areas','Slayer Zones','Slayer Masters','Dark Areas','Standard Dungeons','All Monsters','Quest Encounters'];
}

function combatPlannerEncounterList(targets,allMonsters) {
  const indices=new Map(targets.map((target,i)=>[target,i]));
  const button=target=>'<button type="button" class="combat-target" data-encounter="'+indices.get(target)+'">'+
    icon(target.node)+escape(target.node.name)+'</button>';
  return '<section class="combat-encounters"><h3>Encounter list</h3>'+
    combatPlannerGroups().map((group,i)=>{
      const list=group==='All Monsters'?allMonsters:targets.filter(x=>x.category===group);
      if (!list.length) return '';
      const byLocation=Map.groupBy(list,target=>group==='All Monsters'?null:target.area||null);
      return '<details'+(i===0?' open':'')+'><summary>'+escape(group)+' <span class="subtle">('+list.length+')</span></summary>'+
        [...byLocation].map(([area,entries])=>(area?'<h4>'+link(area,true)+'</h4>':'')+
          '<ul>'+entries.map(target=>'<li>'+button(target)+'</li>').join('')+'</ul>').join('')+'</details>';
    }).join('')+'</section>';
}

function combatSlayerRewards(enemy) {
  const hp=payload.monsters.enemies[bare(enemy.id)].hitpoints;
  return {xp:hp/8+4,coins:Math.max(1,Math.floor(.1*hp**1.15))};
}

function combatPlannerRun(target,player,cache) {
  function fight(node,area) {
    if (!node) return null;
    const key=node.id+'/'+(area?.id||'');
    if (!cache.has(key)) {
      const seed=[...key].reduce((v,c)=>(Math.imul(v,31)+c.charCodeAt(0))>>>0,26886380);
      cache.set(key,combatPlannerFight(node,area,player,96,seed));
    }
    return cache.get(key);
  }
  if (!target.kind) return fight(target.node,target.area);
  const reward=target.kind==='dungeon'?combatPlannerLoot({data:{Drops:target.node.data.Rewards}}):{gp:0,loot:0,drops:new Map()};
  let time=0,xpDamage=0,slayerXP=0,slayerCoins=0;
  const parts=[];
  const waves=target.kind==='dungeon'
    ? (target.node.data.Enemies||[]).map(w=>({count:w.Count,options:w.Enemies.map(x=>({
      node:publicNode('Enemy',x.Enemy),area:target.node,weight:x.Weight
    }))}))
    : [{count:1,options:target.master.targets}];
  if (!waves.length || target.master?.missing) return null;
  for (const {options,count} of waves) {
    const total=options.reduce((sum,x)=>sum+x.weight,0);
    if (!(total>0)) return null;
    for (const x of options.filter(row=>row.weight>0)) {
      const row=fight(x.node,x.area);
      if (!row || row.kills===0) return null;
      const weight=x.weight/total*count;
      parts.push({row,weight});
      if (target.kind==='slayer') {
        reward.gp+=row.reward.gp*weight;
        reward.loot+=row.reward.loot*weight;
        const slayer=combatSlayerRewards(row.node);
        slayerXP+=slayer.xp*weight;
        if (bare(target.node.data.RewardCurrency)==='SlayerCoins') slayerCoins+=slayer.coins*weight;
      }
      const attempts=1/(row.kills??1);
      time+=row.time*weight*attempts;
      xpDamage+=row.xpDamage*weight*attempts;
    }
  }
  return {node:target.node,time,xpDamage,reward,parts,benchmark:true,aggregate:true,
    ...(target.kind==='slayer'?{slayerXP,slayerCoins}:{})};
}

function combatPlannerRate(result,player,xpSkill) {
  if (!result?.time || !Number.isFinite(result.time)) return null;
  const scale=3600/result.time,kills=(result.kills??1)*scale;
  const xpPerDamage=xpSkill ? (player.xp[xpSkill]||0) : Object.values(player.xp).reduce((a,b)=>a+b,0);
  const value=(result.reward.gp+result.reward.loot)*kills;
  const food=result.food==null?null:result.food*scale;
  const attacks=result.swings==null?null:result.swings*scale;
  const runeCost=player.runes.reduce((sum,x)=>sum+x.Quantity*moneyQuote(x.Item),0);
  const unitCost=runeCost+(player.ammo?moneyQuote(player.ammo.id):0);
  const net=result.benchmark||attacks===null||food===null?null:value-attacks*unitCost-food*moneyQuote(player.input.food?.id);
  const xp=(xpPerDamage*result.xpDamage+((!xpSkill||xpSkill==='Slayer')?(result.slayerXP||0):0))*scale;
  return {kills,xp,value,net,food,attacks,slayerCoins:result.slayerCoins==null?null:result.slayerCoins*scale,
    deaths:result.deaths==null?null:result.deaths*scale};
}

function combatPlannerChart(rows,metric,compare,xpSkill) {
  if (metric==='deaths' || metric==='net') return '';
  const chart=rows.map((row,index)=>({row,index})).filter(({row})=>row.rateA?.[metric]>0).slice(0,10);
  if (!chart.length) return '';
  const heading={
    xp:(xpSkill?xpSkill+' XP':'Total XP')+' per hour',
    kills:'Kills or dungeon clears per hour',
    value:'Gold and loot value per hour',
    slayerCoins:'Slayer Coins per hour'
  }[metric];
  const max=Math.max(...chart.flatMap(({row})=>[row.rateA[metric],row.rateB?.[metric]||0]));
  const multiple=chart.length>1;
  const bar=(setup,value,target)=>{
    if (value==null) return '';
    const unit={xp:'XP/h',kills:target.kind==='dungeon'?'clears/h':'kills/h',value:'GP/h',slayerCoins:'Slayer Coins/h'}[metric];
    return '<div class="combat-chart-rate"><span>Setup '+setup+'</span>'+
      (multiple?'<meter min="0" max="'+max+'" value="'+value+'" aria-label="Setup '+setup+' '+escape(heading)+'"></meter>':'')+
      '<strong>'+wikiSaveNumber(value)+' '+unit+'</strong></div>';
  };
  return '<section class="combat-chart" aria-label="'+escape(heading)+'"><h2>'+escape(heading)+'</h2>'+
    (multiple?'<p>Estimated rates for up to 10 targets ranked by Setup A. The bars use the same scale.</p>':
      '<p>Estimated rate for this target.</p>')+chart.map(({row,index})=>
    '<div><button type="button" class="combat-target" data-result="'+index+'">'+icon(row.target.node)+escape(row.target.node.name)+'</button>'+
    bar('A',row.rateA[metric],row.target)+(compare?bar('B',row.rateB?.[metric],row.target):'')+'</div>').join('')+'</section>';
}

function combatWeaponUpgrades(target,build,owned) {
  const current=build.input, style=current.stance.data.CombatStyle, allowed=owned ? new Set(owned) : null;
  const compare=[];
  for (const item of byType.get('Item')||[]) {
    if (allowed && !allowed.has(item.id)) continue;
    const weapon=item.data.Capabilities?.['MelvorBase:Weapon'];
    if (!weapon || item.id===current.weapon.id || guideV2ReqList(item).some(req=>
      bare(req.Type)!=='Level'||req.Data.IsOr||(current.levels[bare(req.Data.Component?.Entity)]||0)<req.Data.Level)) continue;
    const stance=(publicNode('WeaponType',weapon.Type)?.data.Stances||[]).map(id=>publicNode('AttackStance',id))
      .find(stance=>stance?.id===current.stance.id) || (publicNode('WeaponType',weapon.Type)?.data.Stances||[])
      .map(id=>publicNode('AttackStance',id)).find(stance=>stance?.data.CombatStyle===style);
    if (!stance) continue;
    const slots=new Map(current.slots);
    slots.set(namespaced('Weapon'),item);
    const setup=combatPlannerBuild({...current,slots,equipment:[...slots.values()],weapon:item,stance});
    if (setup.invalid.length) continue;
    const result=combatPlannerFight(target.node,target.area,setup,32,26886380);
    const rate=combatPlannerRate(result,setup);
    if (rate) compare.push({item,stance,rate,result});
  }
  return compare;
}

function combatWeaponRecommendations(target,build,owned) {
  const rows=combatWeaponUpgrades(target,build,owned);
  if (!rows.length) return '<p>No compatible alternatives met the modeled requirements.</p>';
  const strongest=rows.slice().sort((a,b)=>b.rate.xp-a.rate.xp).slice(0,6);
  const cheapest=rows.filter(x=>x.rate.net!=null).sort((a,b)=>b.rate.net-a.rate.net)[0];
  const safer=rows.filter(x=>x.rate.deaths!=null&&x.result.kills>0).sort((a,b)=>
    a.rate.deaths-b.rate.deaths||b.result.lowest-a.result.lowest||b.rate.xp-a.rate.xp)[0];
  const render=(x,label)=>[label,link(x.item),escape(x.stance.name),numericCell(x.rate.xp),x.rate.net==null?'—':moneyAmount(x.rate.net),
    x.rate.deaths==null?'—':numericCell(x.rate.deaths),x.result.benchmark?'Benchmark':'32 trials'];
  return '<p>Changes the weapon in Setup A while keeping the other slots. Active style and modeled level requirements stay in force. Special effects and prerequisites can change the result.</p>'+
    table(['Ranking','Weapon','Stance','Total XP/h','Value after supplies/h','Sampled deaths/h','Coverage'],
      [...strongest.map((x,i)=>render(x,String(i+1))),...(cheapest?[render(cheapest,'Best net value')]:[]),
        ...(safer?[render(safer,'Lowest sampled risk')]:[])],true);
}

function combatPlannerDetails(target,A,B,buildA,buildB,metric,xpSkill) {
  const detail=(data,build,name)=>{
    const rate=combatPlannerRate(data,build,xpSkill);
    if (!rate) return '<h3>Setup '+name+'</h3><p>No estimate for this matchup.</p>';
    const value=(n,unit='')=>n==null?'—':numericCell(n,unit);
    const loot=[...data.reward.drops].sort(([,a],[,b])=>b.miss-a.miss);
    const metrics=[
      ['Hit chance',value(data.probability==null?null:data.probability*100,'%')],
      ['Enemy hit chance',value(data.incoming==null?null:data.incoming*100,'%')],
      ['Cycle time incl. spawn',wikiSaveDuration(data.time)],['Highest hit sampled',value(data.maxTaken)],
      ['Lowest HP sampled',value(data.lowest)],['Deaths per 96 trials',value(data.deaths==null?null:Math.round(data.deaths*96))],
      ['Gold + loot value/h',moneyAmount(rate.value)],['Value after modeled supplies/h',rate.net==null?'—':moneyAmount(rate.net)],
      ['Food/h',value(rate.food)],['Attack attempts/h',value(rate.attacks)]
    ];
    if (rate.attacks!=null&&build.runes.length) metrics.push(['Runes/h',build.runes.map(x=>wikiSaveRef('Item',x.Item)+' ×'+wikiSaveNumber(x.Quantity*rate.attacks)).join('<br>')]);
    if (data.slayerXP!=null) metrics.push(['Slayer XP/h',value(data.slayerXP*3600/data.time)],['Slayer Coins/h',value(rate.slayerCoins)]);
    return '<h3>Setup '+name+'</h3>'+table(['Metric','Estimate'],metrics)+
      (data.advanced?.length?'<p>'+escape(data.advanced.join(' · '))+'</p>':'')+
      table(['Skill','XP per damage','XP/h'],Object.entries(build.xp).map(([skill,ratio])=>[
        wikiSaveRef('Skill',skill),value(ratio),value(ratio*data.xpDamage*3600/data.time)]))+
      (loot.length?'<h4>Loot</h4>'+table(['Item','Base chance','Units/h','50% time','99% time'],loot.map(([id,x])=>[
        wikiSaveRef('Item',id),publicChanceDisplay(1-x.miss),value(x.units*rate.kills),
        ...[.5,.99].map(p=>rate.kills>0?wikiSaveDuration((dropEstimateAttempts(1-x.miss,p)??Infinity)*3600/rate.kills):'—')
      ]),true):'');
  };
  const base=combatPlannerRate(A,buildA,xpSkill)?.[metric];
  const pool=A?.parts||[];
  const blocks=target.kind==='slayer'&&['xp','kills','value','slayerCoins'].includes(metric)&&pool.length>1?pool.map(({row})=>{
    const filtered=pool.filter(x=>x.row!==row);
    const total=filtered.reduce((a,x)=>a+x.weight,0);
    const average=fn=>filtered.reduce((a,x)=>a+x.weight*fn(x.row),0)/total;
    const after=combatPlannerRate({time:average(r=>r.time/(r.kills??1)),xpDamage:average(r=>r.xpDamage/(r.kills??1)),
      reward:{gp:average(r=>r.reward.gp+r.reward.loot),loot:0},slayerXP:average(r=>combatSlayerRewards(r.node).xp),
      slayerCoins:bare(target.node.data.RewardCurrency)==='SlayerCoins'?average(r=>combatSlayerRewards(r.node).coins):0},buildA,xpSkill)?.[metric];
    return {row,after};
  }).sort((a,b)=>b.after-a.after):[];
  const blockTable=blocks.length?'<h3>Slayer target pool and blocks</h3><p>Effect of blocking one target on Setup A. Assumes all other targets are eligible. Slayer rewards are base per kill on task. Reroll costs and task bonuses are excluded.</p>'+
    table(['Block target','Rate after block','Change'],blocks.map(x=>[link(x.row.node),numericCell(x.after),numericCell(base>0?100*(x.after/base-1):0,'%')]),true):'';
  return '<h2>'+escape(target.node.name)+'</h2>'+(target.area?'<p>'+link(target.area)+'</p>':'')+
    '<div class="combat-detail"><div>'+detail(A,buildA,'A')+'</div>'+
    (buildB?'<div>'+detail(B,buildB,'B')+'</div>':'')+'</div>'+blockTable+
    (target.kind?'':'<h3>Weapon alternatives</h3><div class="combat-fields"><button type="button" data-upgrades="all">Compare compatible weapons</button>'+
      '<button type="button" data-upgrades="owned">Compare owned weapons</button></div><div id="combat-upgrade-results" aria-live="polite"></div>');
}

function combatPlannerPage(container,params,save) {
  const targets=combatPlannerTargets(), categories=combatPlannerGroups();
  const byMonster=targets.filter(x=>x.node.type==='Enemy');
  const allMonsters=[...new Map(byMonster.slice().reverse().map(x=>[x.node.id,x])).values()]
    .sort((a,b)=>collator.compare(a.node.name,b.node.name));
  container.innerHTML='<p>Compare setups and rank encounters by XP, kills, loot or sampled deaths. Use <a href="#/idle">Can I Idle?</a> for the worst-case damage check.</p>'+
    '<p role="status" id="combat-import-status"></p><form id="combat-planner"><div class="combat-fields">'+
    '<label class="combat-toggle"><input type="checkbox" name="compare"> Compare setup B</label>'+
    '<button type="button" id="combat-copy">Copy A to B</button></div>'+
    '<div class="combat-setups">'+combatPlannerSetup('A')+combatPlannerSetup('B')+'</div>'+
    '<fieldset><legend>Targets and ranking</legend><div class="combat-fields">'+
    '<label>Category<select name="category">'+combatOption('','All targets')+categories.map(x=>combatOption(x,x)).join('')+'</select></label>'+
    '<label>Location or master<select name="encounter-location"></select></label>'+
    '<label>Search<input type="search" name="query" placeholder="Monster, dungeon or master"></label>'+
    '<label>Rank by<select name="metric">'+[['xp','XP/h'],['kills','Kills or clears/h'],['value','Gold + loot value/h'],['net','Value after supplies/h'],['slayerCoins','Slayer Coins/h'],['deaths','Fewest sampled deaths/h']].map(x=>combatOption(...x)).join('')+'</select></label>'+
    '<label>XP skill<select name="xpSkill">'+combatOption('','All earned XP')+['Attack','Strength','Defence','Hitpoints','Ranged','Magic','Slayer'].map(x=>combatOption(x,x)).join('')+'</select></label>'+
    '<button type="submit">Compare targets</button></div></fieldset></form>'+
    combatPlannerEncounterList(targets,allMonsters)+
    '<p id="combat-run-status" role="status"></p><div id="combat-results"></div><div id="combat-target-detail"></div>'+
    '<section><h3>Simulation coverage</h3><p>Normal-attack trials start at full HP and use unlimited selected food. Accuracy, protection, armour, combat triangle, Auto Eat and respawn time are modeled. Zero deaths in the sample does not establish idle safety. Equipment choices include gear you may need to unlock.</p>'+
    '<p>Special attacks, ward, effects and unsupported bonuses use a normal-attack benchmark. Dungeon and Slayer results combine individual fight rates; they do not give a death rate for a complete run. Costs use base sale prices and exclude prayer points and charge savings.</p></section>';
  const form=container.querySelector('#combat-planner'), configs=[...form.querySelectorAll('.combat-setup')];
  const feedback=container.querySelector('#combat-run-status'), results=container.querySelector('#combat-results'), detail=container.querySelector('#combat-target-detail');
  const importStatus=container.querySelector('#combat-import-status');
  const field=(root,name)=>root.querySelector('[name="'+name+'"]');
  field(form,'query').value=params.get('q')||'';
  const locationFilter=field(form,'encounter-location'), categoryFilter=field(form,'category');
  const locationFor=row=>row.area||(row.kind?row.node:null);
  function pool(allLocations=false) {
    const name=categoryFilter.value;
    return name==='All Monsters'?(allLocations?byMonster:allMonsters):name?targets.filter(x=>x.category===name):targets;
  }
  function locations(picked='') {
    const nodes=[...new Map(pool(true).map(locationFor).filter(Boolean).map(node=>[node.id,node])).values()]
      .sort((a,b)=>collator.compare(a.name,b.name));
    locationFilter.innerHTML=combatOption('','All locations')+nodes.map(node=>combatOption(node.id,node.name)).join('');
    if (nodes.some(node=>node.id===picked)) locationFilter.value=picked;
  }
  locations();
  let images={};
  const pickerTypes={stance:'AttackStance',spell:'MagicSpell',prayer:'Prayer',imbuement:'Imbuement'};
  const pickers=new Map(configs.map(root=>[root,[...root.querySelectorAll('select[data-picker]')]
    .map(select=>combatGearPicker(select,(key,value)=>images[publicNode(pickerTypes[key]||'Item',value)?.image]))]));
  function updateStances(root) {
    const weapon=publicNode('Item',field(root,'Weapon').value)?.data.Capabilities?.['MelvorBase:Weapon'];
    const ids=publicNode('WeaponType',weapon?.Type)?.data.Stances||[];
    const select=field(root,'stance'), old=select.value;
    select.innerHTML=ids.map(id=>{
      const node=publicNode('AttackStance',id);
      return node?combatOption(node.id,node.name):'';
    }).join('');
    if (ids.includes(old)) select.value=old;
  }
  function update(root) {
    const levels=Object.fromEntries([...root.querySelectorAll('input[type=number]')].map(el=>[el.name,+el.value]));
    const slots=new Map((byType.get('EquipmentSlot')||[]).flatMap(slot=>{
      const item=publicNode('Item',field(root,bare(slot.id))?.value);
      return item?[[slot.id,item]]:[];
    }));
    const select=(type,name)=>publicNode(type,field(root,name).value);
    pickers.get(root).forEach(refresh=>refresh());
    const build=combatPlannerBuild({levels,slots,equipment:[...slots.values()],weapon:select('Item','Weapon'),stance:select('AttackStance','stance'),
      food:select('Item','food'),tier:+field(root,'tier').value,spell:select('MagicSpell','spell'),
      prayer:select('Prayer','prayer'),imbuement:select('Imbuement','imbuement')});
    root.querySelector('.combat-key-stats').textContent=build.invalid.length?build.invalid.join(' '):
      [build.style,build.hp+' HP',build.max+' max hit',build.accuracy+' accuracy',build.interval+' s interval',
        build.unsupported.size?'Partial model':''].filter(Boolean).join(' · ');
    return build;
  }
  function defaultSetup(root,i) {
    for (const el of root.querySelectorAll('input, select')) el.value=el.defaultValue??el.options?.[0]?.value??'';
    field(root,'Weapon').value=namespaced(i?'CopperSword':'StoneSword');
    field(root,'food').value=namespaced('Lobster');
    field(root,'tier').value='1';
    updateStances(root);
    update(root);
  }
  configs.forEach(defaultSetup);
  if(location.protocol!=='file:') import('./combat-icons.js').then(module=>{
    if (form.isConnected) {
      images=module.default;
      configs.forEach(update);
    }
  }).catch(()=>{});
  const compare=field(form,'compare');
  configs[1].hidden=true;
  form.querySelector('#combat-copy').addEventListener('click',()=>{
    const [A,B]=configs;
    for (const input of A.querySelectorAll('[name]')) {
      if (input.name==='stance') continue;
      field(B,input.name).value=input.value;
    }
    updateStances(B);
    field(B,'stance').value=field(A,'stance').value;
    compare.checked=true;
    B.hidden=false;
    update(B);
  });
  form.addEventListener('input',event=>{
    const root=event.target.closest('.combat-setup');
    if (event.target===compare) configs[1].hidden=!compare.checked;
    if (event.target===categoryFilter) locations();
    if (root && !event.target.closest('.combat-picker-popup')) {
      if (event.target.name==='Weapon') updateStances(root);
      update(root);
    }
  });
  let run=0, owned=null, selectedTarget, selectedBuild, jumpToResults=false;
  detail.addEventListener('click',event=>{
    const filter=event.target.closest('[data-upgrades]')?.dataset.upgrades;
    if (!filter || !selectedTarget || !selectedBuild) return;
    const output=detail.querySelector('#combat-upgrade-results');
    if (filter==='owned'&&!owned) { output.textContent='Import a save to compare owned weapons.'; return; }
    output.innerHTML=combatWeaponRecommendations(selectedTarget,selectedBuild,filter==='owned'?owned:null);
  });
  function loadSave(save) {
      ++run;
      results.replaceChildren();
      detail.replaceChildren();
      feedback.textContent='';
      selectedTarget=selectedBuild=null;
      if (!save) {
        owned=null;
        configs.forEach(defaultSetup);
        compare.checked=false;
        configs[1].hidden=true;
        importStatus.textContent='';
        return;
      }
      owned=new Set([...save.bank.flatMap(tab=>tab.items.filter(x=>!x.placeholder&&x.quantity>0).map(x=>x.id)),
        ...[...save.equipment.slots.values()].map(x=>x.id)]);
      const root=configs[0];
      for (const [id,xp] of save.skills) {
        const el=[...root.querySelectorAll('input[type=number]')].find(input=>input.name===id);
        if (el) el.value=wikiSaveLevel(xp);
      }
      for (const slot of byType.get('EquipmentSlot')||[]) {
        const el=field(root,bare(slot.id)), item=save.equipment.slots.get(slot.id)||save.equipment.slots.get(bare(slot.id));
        el.value=item?.id||'';
      }
      field(root,'food').value=save.combatFood;
      field(root,'spell').value=save.magic[0]||'';
      field(root,'imbuement').value=save.magic[1]||'';
      field(root,'tier').value=String([3,2,1].find(t=>save.shop.get(namespaced('AutoEat'+t))>0)||0);
      updateStances(root);
      update(root);
      importStatus.textContent='Setup A loaded from your save. Check your stance and select a prayer if needed.';
  }
  if (save) loadSave(save);
  container.querySelector('.combat-encounters').addEventListener('click',event=>{
    const button=event.target.closest('[data-encounter]');
    if (!button) return;
    const target=targets[Number(button.dataset.encounter)];
    categoryFilter.value=target.category;
    locations(locationFor(target)?.id);
    field(form,'query').value=target.node.name;
    jumpToResults=true;
    form.requestSubmit();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const jump=jumpToResults;
    jumpToResults=false;
    const A=update(configs[0]), B=compare.checked?update(configs[1]):null;
    results.replaceChildren(); detail.replaceChildren();
    if(A.invalid.length||B?.invalid.length){feedback.textContent='Check the setup fields marked above.';return;}
    feedback.textContent='Comparing targets…';
    const current=++run, area=locationFilter.value, targetPool=pool(Boolean(area)), query=field(form,'query').value.trim().toLowerCase();
    const xpSkill=field(form,'xpSkill').value, metric=field(form,'metric').value, label=field(form,'metric').selectedOptions[0].textContent;
    requestAnimationFrame(()=>{
      if (!form.isConnected || current!==run) return;
      const cacheA=new Map(),cacheB=new Map();
      const rows=targetPool.filter(target=>(!area||locationFor(target)?.id===area)&&
        (target.node.name+' '+(target.area?.name||'')).toLowerCase().includes(query)).map(target=>{
        const a=combatPlannerRun(target,A,cacheA),b=B?combatPlannerRun(target,B,cacheB):null;
        return {target,a,b,rateA:combatPlannerRate(a,A,xpSkill),rateB:B?combatPlannerRate(b,B,xpSkill):null};
      });
      const scoreOf=row=>row.rateA?.[metric]??(metric==='deaths'?Infinity:-Infinity);
      rows.sort((a,b)=>(metric==='deaths'?1:-1)*(scoreOf(a)-scoreOf(b)));
      feedback.textContent=rows.length+' targets · sorted by Setup A.';
      if (!rows.length) return;
      const score=value=>value==null?'—':(['value','net'].includes(metric)?moneyAmount(value):numericCell(value));
      results.innerHTML=combatPlannerChart(rows,metric,Boolean(B),xpSkill)+
        table(['Target','Area or category','Coverage','A · '+label,...(B?['B · '+label,'B − A']:[])],
        rows.map(({target,a,b,rateA,rateB},i)=>{
          const av=rateA?.[metric],bv=rateB?.[metric];
          const coverage=data=>!data?'Unavailable':data.benchmark?'Benchmark':'96 trials';
          return ['<button type="button" class="combat-target" data-result="'+i+'">'+icon(target.node)+escape(target.node.name)+'</button>',
            target.area?link(target.area,true):escape(target.category),coverage(a)+(B?' / '+coverage(b):''),score(av),
            ...(B?[score(bv),av==null||bv==null?'—':score(bv-av)]:[])];
        }),true);
      results.onclick=event=>{
        const button=event.target.closest('[data-result]');
        if (!button) return;
        const {target,a,b}=rows[+button.dataset.result];
        selectedTarget=target;
        selectedBuild=A;
        detail.innerHTML=combatPlannerDetails(target,a,b,A,B,metric,xpSkill);
        detail.scrollIntoView({block:'start'});
      };
      if (jump) results.scrollIntoView({block:'start'});
    });
  });
  return {loadSave};
}
