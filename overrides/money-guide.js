function moneyNavLink() {
  return '<a class="row-link" href="#/money">'+icon(publicNode('Currency','GoldPieces'))+' Money Making Guide</a>';
}
function moneyUrl(n,level) { return route('money',level?{id:n.key,level}:{id:n.key}); }
function moneyAmount(value) { return numericCell(value,' GP'); }
function moneyAverage(row) {
  const min=row?.MinQuantity??row?.Quantity??1;
  return (min+(row?.MaxQuantity??min))/2;
}
function moneyQuote(id) { return publicPrice(publicNode('Item',id))??0; }
function moneyWeighted(rows,fortune=0) {
  const total=(rows||[]).reduce((sum,row)=>sum+(row.Weight||0),0);
  if(!total)return 0;
  return rows.reduce((sum,row)=>{
    const min=row.MinQuantity??row.Quantity??1,max=row.MaxQuantity??min;
    const factor=1+fortune/100;
    let units=0;
    if(!fortune)units=moneyAverage(row);
    else for(let i=min;i<=max;i++)units+=Math.floor(i*factor)/(max-min+1);
    return sum+units*moneyQuote(row.Item)*(row.Weight||0)/total;
  },0);
}
function moneyThieving(n,level,mods={}) {
  const d=n.data, v=k=>mods[k]||0, clamp=x=>Math.max(0,Math.min(1,x));
  const stealth=Math.max(0,Math.floor((level+v('FlatStealth'))*(1+v('PercentStealth'))));
  const perception=Math.max(0,Math.floor((d.Perception+v('FlatPerception'))*(1+v('PercentPerception'))));
  const chance=Math.min(1,(100+stealth)/(100+perception));
  const interval=Math.floor((d.BaseInterval+v('FlatInterval'))*(1+v('PercentInterval')))/1000;
  const stun=Math.floor((2000+v('FlatStunInterval'))*(1+v('PercentStunInterval')))/1000;
  const stages=Math.max(1,d.Stages+Math.trunc(v('FlatStages'))),skip=clamp(v('SkipStageChance')),progress=[0];
  for(let i=1;i<=stages;i++)progress[i]=1+(1-skip)*progress[i-1]+skip*progress[Math.max(0,i-2)];
  const wins=progress[stages], attempts=wins/chance;
  const seconds=attempts*(interval+(1-chance)*(1-clamp(v('StunAvoidanceChance')))*stun);
  const fortune=v('FlatFortune')+(chance<1?v('FlatFortuneUnderSuccess'):0);
  const twice=1+clamp(v('DoublingChance'));
  const c=d.CurrencyReward;
  const direct=bare(c?.Currency)==='GoldPieces'?((c.MinQuantity+c.MaxQuantity)/2)*clamp(d.BaseCurrencyLootChance*(1+v('PercentCurrencyLootChance'))):0;
  const items=twice*(moneyWeighted(d.CommonDropTable,fortune)*clamp(d.BaseCommonLootChance*(1+v('PercentCommonLootChance')))+moneyWeighted(d.RareDropTable,fortune)*clamp(d.BaseRareLootChance*(1+v('PercentRareLootChance'))));
  const finish=twice*moneyWeighted(d.CompletionDropTable,fortune);
  return {seconds,chance,attempts,direct,items,finish,gp:wins*(direct+items)+finish,rate:3600*(wins*(direct+items)+finish)/seconds};
}
function moneyBoosts(n, level) {
  const skill=publicNode('Skill','Thieving'), base=moneyThieving(n,level).rate;
  const supported=new Set(['FlatStealth','PercentStealth','FlatPerception','PercentPerception','FlatInterval','PercentInterval','FlatStunInterval','PercentStunInterval','FlatStages','SkipStageChance','StunAvoidanceChance','FlatFortune','FlatFortuneUnderSuccess','DoublingChance','PercentCurrencyLootChance','PercentCommonLootChance','PercentRareLootChance']);
  return readerBoosterPool(skill).flatMap(({node,mods})=>{
    if(guideV2Level(node,'Thieving')>level || node.type==='EquipmentSetBonus')return [];
    const values={}, used=[];
    for(const m of mods){
      const name=m.Stat?.Name;
      if(!supported.has(name)||m.Condition||m.Scaling||m.FromContext)continue;
      const context=m.LocalContext||{};
      if(Object.entries(context).some(([k,v])=>k!=='Component'&&v&&({Recipe:n.id,Category:n.data.Category,RecipeType:n.data.RecipeType})[k]!==v))continue;
      values[name]=(values[name]||0)+m.Value;used.push(m);
    }
    const rate=moneyThieving(n,level,values).rate;
    return rate>base ? [{node,rate,used,values}] : [];
  }).sort((a,b)=>b.rate-a.rate);
}
function moneyThievingLoadout(n,level,upgrades) {
  const slots=new Map();
  for(const upgrade of upgrades){
    const slot=upgrade.node.data.Capabilities?.['MelvorBase:Toolbelt']?.FitsInSlot;
    if(!slot)continue;
    if(!slots.has(slot))slots.set(slot,[]);
    slots.get(slot).push(upgrade);
  }
  const chosen=new Map();
  const evaluate=items=>{
    const values={};
    for(const item of items)for(const [key,value] of Object.entries(item.values))values[key]=(values[key]||0)+value;
    return moneyThieving(n,level,values).rate;
  };
  for(let pass=0;pass<3;pass++)for(const [slot,options] of slots){
    const others=[...chosen].filter(([key])=>key!==slot).map(([,value])=>value);
    let best=chosen.get(slot),rate=evaluate(best?[...others,best]:others);
    for(const option of options){
      const candidate=evaluate([...others,option]);
      if(candidate>rate){best=option;rate=candidate;}
    }
    if(best)chosen.set(slot,best);
  }
  const items=[...chosen.values()];
  return {items,rate:evaluate(items)};
}
function moneyCombat(n) {
  const drops=n.data.Drops||{};
  const direct=(drops.FixedCurrencies||[]).filter(x=>bare(x.Currency)==='GoldPieces').reduce((sum,x)=>sum+moneyAverage(x),0);
  const items=(drops.FixedItems||[]).reduce((sum,x)=>sum+moneyAverage(x)*moneyQuote(x.Item),0)+(drops.ItemTables||[]).reduce((sum,x)=>sum+(x.Chance??1)*moneyWeighted(x.Table),0);
  const stats=payload.monsters.enemies[bare(n.id)];
  return {direct,items,gp:direct+items,stats};
}
function moneyRows() {
  if(moneyRows.cached)return moneyRows.cached;
  const entries=[];
  for(const [skill,guide] of Object.entries(payload.guides.skills)){
    if(!['Woodcutting','Mining','Fishing','Crafting','Smithing','Fletching','Runecrafting','Beastcrafting','Herblore','Cooking'].includes(skill))continue;
    for(const row of guide.rankings){
      const n=guideV2Node(row);
      if(!n||!(row.seconds>0)||guideV2ReqList(n).some(r=>/Quest(?:Step|Task|Active)/.test(bare(r.Type))))continue;
      const d=n.data;
      const gathering=['Woodcutting','Mining','Fishing'].includes(skill);
      if(!gathering&&row.ingredients?.Currencies?.some(x=>bare(x.Currency)!=='GoldPieces'))continue;
      const gross=skill==='Fishing'?moneyWeighted(d.RandomProducts)*(d.FishChance??d.BaseFishChance??0):
        (d.Products||(d.Product?[d.Product]:[])).reduce((sum,x)=>sum+moneyQuote(x.Item)*(x.Quantity??1)*(x.Chance??1),0);
      const cost=gathering?0:row.inputSaleOpportunityGP;
      if(gross>0)entries.push({n,skill,level:row.level,gross,cost,seconds:row.seconds,group:gathering?'Gathering':'Crafting'});
    }
  }
  for(const r of readerCandidates('Thieving')){
    const n=guideV2Node(r);
    if(moneyThieving(n,r.level).gp>0)entries.push({n,skill:'Thieving',level:r.level,group:'Thieving'});
  }
  for(const n of byType.get('Enemy')||[]){
    const stats=payload.monsters.enemies[bare(n.id)];
    if(stats?.locations.some(x=>x.type==='CombatArea')&&moneyCombat(n).gp>0)entries.push({n,skill:'Combat',level:null,group:'Combat'});
  }
  return moneyRows.cached=entries;
}
function moneyRate(entry,level,killSeconds=30,cost=0) {
  if(entry.group==='Thieving')return moneyThieving(entry.n,level).rate;
  if(entry.group==='Combat')return (moneyCombat(entry.n).gp-cost)*3600/killSeconds;
  let success=1;
  if(entry.skill==='Cooking')success=Math.min(1,(69+level)/(69+entry.n.data.Difficulty));
  return (entry.gross*success-entry.cost)*3600/entry.seconds;
}
function moneyAccess(entry) {
  if(entry.group==='Combat'){
    const locations=moneyCombat(entry.n).stats.locations.filter(x=>x.type==='CombatArea');
    return locations.map(x=>{
      const area=publicNode(x.type,x.id);
      return area?link(area,true)+(guideV2Html(requirements(area))==='â€”'?'':guideV2Html(requirements(area))):escape(x.name);
    }).join('<br>');
  }
  return guideV2Requirements(entry.n);
}
function moneyStrategyLink(entry,level) {
  return '<a class="row-link" href="'+escape(moneyUrl(entry.n,level))+'">'+icon(entry.n)+escape(entry.n.name)+'</a>';
}
function moneyOption(value,label,active) {
  return '<option value="'+escape(value)+'"'+(String(value)===String(active)?' selected':'')+'>'+escape(label)+'</option>';
}
function moneyIndex(params) {
  const selected=params.get('skill')||'All', level=Math.min(99,Math.max(1,Number(params.get('level'))||99));
  const skills=[...new Set(moneyRows().filter(x=>x.group!=='Combat').map(x=>x.skill))].sort(collator.compare);
  const ranked=lv=>moneyRows().filter(x=>x.group!=='Combat'&&x.level<=lv&&(selected==='All'||x.skill===selected)).map(entry=>({entry,rate:moneyRate(entry,lv)})).filter(x=>x.rate>0).sort((a,b)=>b.rate-a.rate);
  const rows=ranked(level);
  const bands=[[1,'Starter'],[20,'Early game'],[40,'Mid game'],[60,'Mid game'],[80,'Late game'],[99,'Level cap']];
  const checkpoints=bands.map(([lv,stage])=>{
    const best=ranked(lv)[0];
    return [numericCell(lv),escape(stage),best?moneyStrategyLink(best.entry,lv):'â€”',best?moneyAmount(best.rate):'â€”'];
  });
  const combat=moneyRows().filter(x=>x.group==='Combat').sort((a,b)=>moneyRate(b,99)-moneyRate(a,99));
  const vampires=combat.filter(x=>/Vampire/.test(x.n.name));
  const shown=[...new Map([...combat.slice(0,15),...vampires].map(x=>[x.n.key,x])).values()];
  const combatTable=entries=>table(['Method','Enemy combat level','GP/kill','GP/hour at 30 s','Access'],entries.map(e=>[moneyStrategyLink(e),numericCell(moneyCombat(e.n).stats.combatLevel),moneyAmount(moneyCombat(e.n).gp),moneyAmount(moneyRate(e,99)),moneyAccess(e)]),true);
  main.innerHTML='<h1>Money Making Guide</h1><p>Pick a skill and level, then open a method for its requirements, setup and hourly breakdown. Rates use shop sale prices.</p>'+
    wikiSection('money-progression','Early to late game',table(['Level','Stage','Top method','GP/hour'],checkpoints,true)+'<p>Each checkpoint assumes the shown level in the selected skill, or in every skill when comparing all methods. Extra requirements still apply.</p>')+
    wikiSection('money-ranking','Methods by skill and level','<form id="money-filter"><label>Skill <select name="skill">'+moneyOption('All','All skills',selected)+skills.map(s=>moneyOption(s,s,selected)).join('')+'</select></label> <label>Level <select name="level">'+Array.from({length:99},(_,i)=>moneyOption(i+1,i+1,level)).join('')+'</select></label> <button>Compare</button></form><p>Gathering and Thieving are base estimates. Crafting subtracts the sale value of ingredients and assumes they are banked. Rates exclude food and time spent restocking. '+(selected==='Thieving'?'Setup rates assume the listed toolbelt effects are active. Open a target to see gear and unlocks.':'')+'</p>'+
      (rows.length?table(['Method','Skill','Level required','Other requirements','GP/hour'],rows.map(({entry,rate})=>[moneyStrategyLink(entry,level),guideV2Ref('Skill',entry.skill),numericCell(entry.level),readerExtraRequirements(entry.n,entry.skill)||'â€”',moneyAmount(rate)]),true):'<p>No profitable methods at this level.</p>'))+
    wikiSection('money-combat','Combat methods','<p>Compare loot at the same pace: 30 seconds per kill, before food, runes and ammunition. Open a monster to calculate the rate at your own pace.</p>'+combatTable(shown)+'<details><summary>More combat methods</summary>'+combatTable(combat.filter(x=>!shown.includes(x)))+'</details>');
  main.querySelector('#money-filter').addEventListener('submit',event=>{
    event.preventDefault();
    location.hash=route('money',Object.fromEntries(new FormData(event.currentTarget)));
  });
}
function moneyMethod(entry,params) {
  const {n,group,skill}=entry, level=Math.min(99,Math.max(entry.level||1,Number(params.get('level'))||99));
  let details='',setup='';
  if(group==='Combat'){
    const c=moneyCombat(n), seconds=Math.min(3600,Math.max(1,Number(params.get('seconds'))||30)),cost=Math.max(0,Math.min(1e9,Number(params.get('cost'))||0));
    details='<p>Enemy combat level '+number(c.stats.combatLevel)+' Â· '+number(c.stats.hitpoints)+' HP. Use the monster page to check attacks and area effects.</p>'+
      table(['Gold/kill','Sellable loot/kill','Gross GP/kill','Net GP/hour'],[[moneyAmount(c.direct),moneyAmount(c.items),moneyAmount(c.gp),moneyAmount(moneyRate(entry,99,seconds,cost))]])+
      '<form id="money-combat-form"><label>Seconds per kill, including downtime <input name="seconds" type="number" min="1" max="3600" step="0.1" value="'+escape(seconds)+'"></label> <label>Supplies per kill (GP) <input name="cost" type="number" min="0" max="1000000000" step="0.01" value="'+escape(cost)+'"></label> <button>Calculate</button></form>'+
      table(['Pace','Gross GP/hour'],[10,30,60].map(s=>[numericCell(s,' s'),moneyAmount(moneyRate(entry,99,s))]));
    const alternatives=moneyRows().filter(x=>x.group!=='Combat'&&x.level<=level).map(x=>({entry:x,rate:moneyRate(x,level)})).sort((a,b)=>b.rate-a.rate);
    const best=alternatives[0], breakEven=best?.rate>0&&c.gp>cost?(c.gp-cost)*3600/best.rate:0;
    if(breakEven)details+='<p>To beat '+moneyStrategyLink(best.entry,level)+' at level '+number(level)+', average under <strong>'+number(breakEven)+' s per kill</strong> at the supply cost entered above.</p>';
    const drops=n.data.Drops||{},loot=(drops.ItemTables||[]).flatMap(t=>{
      const weight=t.Table.reduce((sum,x)=>sum+x.Weight,0);
      return t.Table.map(x=>{const p=(t.Chance??1)*x.Weight/weight;return [guideV2Ref('Item',x.Item),publicQty(x),numericCell(p*100,'%'),moneyAmount(p*moneyAverage(x)*moneyQuote(x.Item))];});
    });
    if(loot.length)details+='<h3>Random drops</h3>'+table(['Item','Qty','Chance per kill','Average GP/kill'],loot,true);
    setup='<p>Compare your melee, ranged or magic setup on the same target. Use the one with the shortest sustained kill time after respawns and restocking. Deduct food, ammunition, runes and potion charges in the calculator.</p><p>Enemy combat level is a difficulty rating. Check entry requirements and special attacks before attempting to idle.</p>';
  }else if(group==='Thieving'){
    const m=moneyThieving(n,level);
    details='<form id="money-method-level"><label>Thieving level <select name="level">'+Array.from({length:100-entry.level},(_,i)=>moneyOption(i+entry.level,i+entry.level,level)).join('')+'</select></label> <button>Calculate</button></form>'+
      table(['Success per attempt','Seconds per cycle','Direct GP/success','Loot GP/success','Completion loot GP','GP/hour'],[[numericCell(m.chance*100,'%'),numericCell(m.seconds,' s'),moneyAmount(m.direct),moneyAmount(m.items),moneyAmount(m.finish),moneyAmount(m.rate)]])+
      '<p>A successful stage pays its own loot. The last stage also awards completion loot. Failed attempts retain progress and add base stun time.</p>';
    const candidates=moneyBoosts(n,level),upgrades=candidates.slice(0,12);
    const loadout=moneyThievingLoadout(n,level,candidates);
    setup='<p>Get enough stealth for reliable attempts, then compare shorter actions, skipped stages and better loot. At 100% success, more stealth adds no income on this target.</p>'+
      (loadout.items.length?'<h3>Combined toolbelt setup</h3><p>Estimated gross rate: <strong>'+number(loadout.rate)+' GP/hour</strong> while these items are active. Meet the listed unlocks. The comparison searches one item per slot type and checks swaps again after combining bonuses.</p>'+table(['Equip','Effect used','Requirements'],loadout.items.map(x=>[readerBoosterName(x.node),x.used.map(m=>wikiBonusText(m,x.node)).join('<br>'),readerBoosterRequirements(x.node)]),true):'')+
      (upgrades.length?'<h3>Individual upgrades</h3>'+table(['Upgrade','Effect used','Requirements','GP/hour with upgrade'],upgrades.map(x=>[readerBoosterName(x.node),x.used.map(m=>wikiBonusText(m,x.node)).join('<br>'),readerBoosterRequirements(x.node),moneyAmount(x.rate)]),true)+'<p>Each row tests one source. Rates exclude potion replacement, conditional bonuses, same-area bonus rolls and food costs.</p>':'');
  }else{
    const gp=moneyRate(entry,level);
    details=table(['Action time','Gross value on success','Ingredient value per attempt','GP/hour'],[[numericCell(entry.seconds,' s'),moneyAmount(entry.gross),moneyAmount(entry.cost),moneyAmount(gp)]]);
    setup=(group==='Crafting'?'<p>Bank ingredients first. If collecting them takes as long as processing them, the hourly profit is roughly half the listed rate. Failed cooks consume an attempt and reduce gross income.</p>'+wikiCosts(n.data.Ingredients,n):'<p>Sell the main product to realize the listed income. Check drops and side products on the action page. Extra products, doubling and shop purchases can change your return.</p>')+
      '<p>Start with upgrades that shorten the cycle or increase sellable yield.</p>'+readerBoosters(publicNode('Skill',skill));
    if(skill==='Fishing')details+='<p>Uses the average fishing interval and the weighted main catch. Junk and special catches are excluded from sale revenue.</p>';
    if(skill==='Mining')details+='<p>Uses the expected break time including prospecting. Extra finds are excluded.</p>';
  }
  main.innerHTML='<h1>'+escape(n.name)+' / Money Making</h1><p>'+moneyNavLink()+' / '+link(n,true)+'</p>'+
    wikiSection('money-access','Requirements',moneyAccess(entry))+
    wikiSection('money-estimate','Hourly estimate',details)+wikiSection('money-setup','Setup',setup);
  const form=main.querySelector('#money-combat-form,#money-method-level');
  if(form)form.addEventListener('submit',event=>{
    event.preventDefault();
    location.hash=route('money',{id:n.key,...Object.fromEntries(new FormData(event.currentTarget))});
  });
}
function moneyGuide(params) {
  const id=params.get('id');
  const entry=id?moneyRows().find(x=>x.n.key===id):null;
  if(entry)moneyMethod(entry,params);else moneyIndex(params);
}
