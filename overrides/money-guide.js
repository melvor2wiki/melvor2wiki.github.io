function moneyNavLink() {
  return '<a class="row-link" href="#/money">'+icon(publicNode('Currency','GoldPieces'))+' Money Making Guide</a>';
}
function moneyUrl(n,level) { return route('money',level?{id:n.key,level}:{id:n.key}); }
function moneyAmount(value) { return numericCell(value,' GP'); }
function moneyAverage(row) {
  const min=row?.MinQuantity??row?.Quantity??1;
  return (min+(row?.MaxQuantity??min))/2;
}
function moneyQuote(id) {
  const price=publicNode('Item',id)?.data.SellsFor;
  return bare(price?.Currency)==='GoldPieces'?price.Quantity:0;
}
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
  const reward=q=>Math.max(0,Math.floor((q+v('FlatCurrencyReward'))*(1+v('PercentCurrencyReward'))));
  const direct=bare(c?.Currency)==='GoldPieces'?((reward(c.MinQuantity)+reward(c.MaxQuantity))/2)*clamp(d.BaseCurrencyLootChance*(1+v('PercentCurrencyLootChance'))):0;
  const items=twice*(moneyWeighted(d.CommonDropTable,fortune)*clamp(d.BaseCommonLootChance*(1+v('PercentCommonLootChance')))+moneyWeighted(d.RareDropTable,fortune)*clamp(d.BaseRareLootChance*(1+v('PercentRareLootChance'))));
  const finish=twice*moneyWeighted(d.CompletionDropTable,fortune);
  return {seconds,chance,attempts,direct,items,finish,gp:wins*(direct+items)+finish,rate:3600*(wins*(direct+items)+finish)/seconds};
}
function moneyBoosts(n, level) {
  const skill=publicNode('Skill','Thieving'), base=moneyCycleHourly(moneyThievingCycle(n,level));
  const supported=new Set(['FlatStealth','PercentStealth','FlatPerception','PercentPerception','FlatInterval','PercentInterval','FlatStunInterval','PercentStunInterval','FlatStages','SkipStageChance','StunAvoidanceChance','FlatFortune','FlatFortuneUnderSuccess','DoublingChance','PercentCurrencyLootChance','FlatCurrencyReward','PercentCurrencyReward','DamageAvoidanceChance','PercentCommonLootChance','PercentRareLootChance']);
  return readerBoosterPool(skill).flatMap(({node,mods})=>{
    if(!moneyEligible(node,level)||node.type==='EquipmentSetBonus'||/Potion/.test(node.name)||
      Object.values(node.data.Capabilities||{}).some(c=>c?.ConsumesOn?.length))return [];
    const values={}, used=[];
    for(const m of mods){
      const name=m.Stat?.Name;
      if(!supported.has(name)||m.Condition||m.Scaling||m.FromContext)continue;
      const context=m.LocalContext||{};
      if(Object.entries(context).some(([k,v])=>k!=='Component'&&v&&({Recipe:n.id,Category:n.data.Category,RecipeType:n.data.RecipeType})[k]!==v))continue;
      values[name]=(values[name]||0)+m.Value;used.push(m);
    }
    const rate=moneyCycleHourly(moneyThievingCycle(n,level,values));
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
    return moneyCycleHourly(moneyThievingCycle(n,level,values));
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
      if(gross>0||d.Product||d.Products?.length||d.RandomProducts?.length)entries.push({n,skill,level:row.level,gross,cost,seconds:row.seconds,group:gathering?'Gathering':'Crafting'});
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
function moneyRate(entry,level,killSeconds,cost=0) {
  if(entry.group==='Combat')return killSeconds?(moneyCombat(entry.n).gp-cost)*3600/killSeconds:moneyCombatEstimate(entry,level).best?.rate??0;
  return moneyCycleHourly(moneySupply(entry,level));
}
function moneyAccess(entry) {
  if(entry.group==='Combat'){
    const locations=moneyCombat(entry.n).stats.locations.filter(x=>x.type==='CombatArea');
    return locations.map(x=>{
      const area=publicNode(x.type,x.id);
      return area?link(area,true)+(guideV2Html(requirements(area))==='—'?'':guideV2Html(requirements(area))):escape(x.name);
    }).join('<br>');
  }
  return guideV2Requirements(entry.n);
}
function moneyStrategyLink(entry,level) {
  return '<a class="row-link" href="'+escape(moneyUrl(entry.n,level))+'">'+icon(entry.n)+escape(moneyStrategyName(entry))+'</a>';
}
function moneyStrategyName(entry) {
  const prefix={Mining:'Mining',Woodcutting:'Cutting',Fishing:'Fishing at',Smithing:'Smithing',Cooking:'Cooking',Herblore:'Brewing',Crafting:'Crafting',Fletching:'Fletching',Runecrafting:'Crafting',Beastcrafting:'Making',Thieving:'Pickpocketing',Combat:'Farming'};
  return (prefix[entry.skill]||'Making')+' '+entry.n.name;
}
function moneyOption(value,label,active) {
  return '<option value="'+escape(value)+'"'+(String(value)===String(active)?' selected':'')+'>'+escape(label)+'</option>';
}
function moneyRequirementCell(entry, level, combatSetup, combo) {
  const inputs=combatSetup?(combatSetup.qty?[{qty:combatSetup.qty,path:combatSetup.food.path}]:[]):(combo?.cycle||moneySupply(entry,level))?.inputs||[];
  return moneyRequiredSkills(entry,inputs,combatSetup,level,combo?.gear);
}
function moneyInputSaleRate(cycle) {
  const supplySeconds=cycle.seconds-cycle.actionSeconds;
  if(supplySeconds<=0)return null;
  return cycle.inputs.reduce((sum,x)=>sum+x.qty*(moneyQuote(x.path.id)-x.path.cash),0)*3600/supplySeconds;
}
function moneyIndex(params) {
  const selected=params.get('skill')||'All', level=moneyRepairNumbers(params.get('level'));
  const search=(params.get('method')||'').trim().slice(0,80);
  const skills=[...new Set(moneyRows().filter(x=>x.group!=='Combat').map(x=>x.skill))].sort(collator.compare);
  const ranked=lv=>moneyRows().filter(x=>x.group!=='Combat'&&x.level<=lv&&(selected==='All'||x.skill===selected)).flatMap(entry=>{
    const cycle=moneySupply(entry,lv);
    if(!cycle||cycle.seconds<=0)return [];
    const rate=(cycle.gp-cycle.cash)*3600/cycle.seconds;
    const sellInputs=entry.group==='Crafting'?moneyInputSaleRate(cycle):null;
    return rate>0&&(sellInputs===null||rate>=sellInputs)?[{entry,rate}]:[];
  }).sort((a,b)=>b.rate-a.rate);
  const rows=moneyRows().filter(entry=>entry.group!=='Combat'&&entry.level<=level&&
    (selected==='All'||entry.skill===selected)&&(!search||moneyStrategyName(entry).toLowerCase().includes(search.toLowerCase()))).flatMap(entry=>{
    const cycle=moneySupply(entry,level);
    if(!cycle||!(cycle.gp>0))return [];
    const rate=moneyCycleHourly(cycle);
    if(entry.group==='Thieving'){
      const loadout=moneyThievingLoadout(entry.n,level,moneyBoosts(entry.n,level));
      return [{entry,rate:Math.max(rate,loadout.rate),combo:loadout.rate>rate?{gear:loadout.items}:null}];
    }
    const combo=moneyCombination(entry,level);
    const best=combo?.rate>rate?combo:null;
    const hourly=best?.rate??rate,sellInputs=entry.group==='Crafting'?moneyInputSaleRate(cycle):null;
    return hourly>0&&(sellInputs===null||hourly>=sellInputs)?[{entry,rate:hourly,combo:best}]:[];
  }).sort((a,b)=>b.rate-a.rate);
  const seen=new Map();
  const shortlist=rows.filter(({entry})=>{
    if(search)return moneyStrategyName(entry).toLowerCase().includes(search.toLowerCase());
    const count=seen.get(entry.skill)||0;
    seen.set(entry.skill,count+1);
    return count<3;
  }).slice(0,12);
  const bands=[[1,'Starter'],[20,'Early game'],[40,'Mid game'],[60,'Mid game'],[80,'Late game'],[99,'Level cap']];
  const checkpoints=bands.map(([lv,stage])=>{
    const best=ranked(lv)[0];
    return [numericCell(lv),escape(stage),best?moneyStrategyLink(best.entry,lv):'—',best?moneyAmount(best.rate):'—'];
  });
  const combat=moneyRows().filter(x=>x.group==='Combat').map(entry=>({entry,setup:moneyCombatEstimate(entry,level).best})).filter(x=>x.setup?.rate>0).sort((a,b)=>b.setup.rate-a.setup.rate);
  const vampires=combat.filter(x=>/Vampire/.test(x.entry.n.name));
  const shown=[...new Map([...combat.slice(0,10),...vampires].map(x=>[x.entry.n.key,x])).values()];
  const headers=['Strategy','Required skills','Estimated profit/hour'];
  main.innerHTML='<h1>Money Making Guide</h1><p>Best repeatable routes at the selected level. Estimates include gathering, intermediate recipes and purchases used by the route. Shop sale prices are used throughout.</p>'+
    wikiSection('money-progression','Early to late game',table(['Level','Stage','Top base method','Base profit/hour'],checkpoints,true)+'<p>Checkpoints use unboosted rates at the displayed level in all skills.</p>')+
    wikiSection('money-ranking','Best methods by skill and level','<form id="money-filter"><label>Skill <select name="skill">'+moneyOption('All','All skills',selected)+skills.map(s=>moneyOption(s,s,selected)).join('')+'</select></label> <label>Level <select name="level">'+Array.from({length:99},(_,i)=>moneyOption(i+1,i+1,level)).join('')+'</select></label> <label>Find a strategy <input name="method" type="search" maxlength="80" value="'+escape(search)+'"></label> <button>Compare</button></form><p>Required skills cover the whole route. Open a strategy for quest, equipment and other unlocks. Routes with an unpriced recurring input are omitted.</p>'+
      '<p>The table compares modeled combined setups for gathering, Thieving and leading crafting routes. Open a method for gear and rate assumptions.</p>'+
      (shortlist.length?table(headers,shortlist.map(({entry,rate,combo})=>[moneyStrategyLink(entry,level),moneyRequirementCell(entry,level,null,combo),moneyAmount(rate)]),true):'<p>No profitable repeatable routes match these filters.</p>'))+
    wikiSection('money-combat','Combat methods','<p>Best modeled melee setup per enemy at level '+number(level)+' Attack, Strength and Defence. Includes base respawn and time to replace food. Special effects, area modifiers and survivability need checking in the method guide.</p>'+
      (shown.length?table(['Strategy','Required skills','Max estimated profit/hour'],shown.map(({entry,setup})=>[moneyStrategyLink(entry,level),moneyRequirementCell(entry,level,setup),moneyAmount(setup.rate)]),true):'<p>No combat method could be priced at this level.</p>'));
  main.querySelector('#money-filter').addEventListener('submit',event=>{
    event.preventDefault();
    location.hash=route('money',Object.fromEntries(new FormData(event.currentTarget)));
  });
}
function moneyMethod(entry,params) {
  const {n,group,skill}=entry, level=Math.max(entry.level||1,moneyRepairNumbers(params.get('level')));
  let details='',setup='', combatSetup;
  if(group==='Combat'){
    const c=moneyCombat(n), model=moneyCombatEstimate(entry,level);
    const baseline=model.best;
    combatSetup=baseline;
    const seconds=Math.min(3600,Math.max(.1,Number(params.get('seconds'))||baseline?.seconds||1));
    const cost=Math.max(0,Math.min(1e9,params.has('cost')?Number(params.get('cost'))||0:baseline?.cost||0));
    const ready=baseline||params.has('seconds');
    const form=(seconds,cost)=>'<form id="money-combat-form"><label>Seconds per kill including respawn and restocking <input name="seconds" type="number" min="0.1" max="3600" step="0.01" value="'+escape(seconds.toFixed(2))+'"></label> <label>Supplies per kill (GP) <input name="cost" type="number" min="0" max="1000000000" step="0.01" value="'+escape(cost.toFixed(2))+'"></label> <button>Calculate</button></form>';
    details='<p>Enemy combat level '+number(c.stats.combatLevel)+' · '+number(c.stats.hitpoints)+' HP.</p>'+
      table(['Gold/kill','Sellable loot/kill','Gross GP/kill','Net GP/hour'],[[moneyAmount(c.direct),moneyAmount(c.items),moneyAmount(c.gp),ready?moneyAmount(moneyRate(entry,level,seconds,cost)):'—']])+
      (ready?form(seconds,cost):'<p>No sustainable reference route could be calculated for this level.</p>'+form(0,cost));
    if(baseline?.qty)details+='<h3>Food supply per expected kill</h3>'+moneyRouteTable([{qty:baseline.qty,path:baseline.food.path}]);
    const alternatives=moneyRows().filter(x=>x.group!=='Combat'&&x.level<=level).map(x=>({entry:x,rate:moneyRate(x,level)})).sort((a,b)=>b.rate-a.rate);
    const best=alternatives[0], breakEven=best?.rate>0&&c.gp>cost?(c.gp-cost)*3600/best.rate:0;
    if(breakEven&&ready)details+='<p>To beat '+moneyStrategyLink(best.entry,level)+' at level '+number(level)+', average under <strong>'+number(breakEven)+' s per kill</strong> at the supply cost entered above.</p>';
    const drops=n.data.Drops||{},loot=(drops.ItemTables||[]).flatMap(t=>{
      const weight=t.Table.reduce((sum,x)=>sum+x.Weight,0);
      return t.Table.map(x=>{const p=(t.Chance??1)*x.Weight/weight;return [guideV2Ref('Item',x.Item),publicQty(x),numericCell(p*100,'%'),moneyAmount(p*moneyAverage(x)*moneyQuote(x.Item))];});
    });
    if(loot.length)details+='<h3>Random drops</h3>'+table(['Item','Qty','Chance per kill','Average GP/kill'],loot,true);
    setup='<p>Reference stats use level '+number(level)+' Attack, Strength and Defence, a normal melee attack, enemy evasion and resistance, a 3-second respawn and food replacement. Optimized across the listed melee weapons with no ammo. Armour gear, special attacks, healing, combat triangle and area effects are outside the estimate. Use measured times for bosses or for any setup with active effects.</p>'+
      (baseline?table(['Weapon','Stance','Weapon requirements','Hit chance','Cycle incl. supplies','Profit/hour'],model.alternatives.map(x=>[link(x.w.n,true),escape(x.w.stance.name),requirements(x.w.n),numericCell(x.p*100,'%'),numericCell(x.seconds,' s'),moneyAmount(x.rate)]),true):'')+
      '<p>Check special attacks and whether you can survive before attempting to idle. Enemy combat level is a difficulty rating.</p>';
  }else if(group==='Thieving'){
    const m=moneyThieving(n,level),cycle=moneySupply(entry,level);
    details='<form id="money-method-level"><label>Thieving level <select name="level">'+Array.from({length:100-entry.level},(_,i)=>moneyOption(i+entry.level,i+entry.level,level)).join('')+'</select></label> <button>Calculate</button></form>'+
      table(['Success per attempt','Seconds per cycle','Direct GP/success','Loot GP/success','Completion loot GP','GP/hour'],[[numericCell(m.chance*100,'%'),numericCell(m.seconds,' s'),moneyAmount(m.direct),moneyAmount(m.items),moneyAmount(m.finish),moneyAmount(m.rate)]])+
      '<p>A successful stage pays its own loot. The last stage also awards completion loot. Failed attempts retain progress and add base stun time.</p>'+(cycle?'<p>After replacing food: <strong class="currency-value">'+goldNumber(moneyRate(entry,level))+' GP/hour</strong>.</p>'+moneyRouteTable(cycle.inputs):'<p>No repeatable food source is modeled at this level.</p>');
    const candidates=moneyBoosts(n,level),upgrades=candidates.slice(0,12);
    const loadout=moneyThievingLoadout(n,level,candidates);
    setup='<p>Get enough stealth for reliable attempts, then compare shorter actions, skipped stages and better loot. At 100% success, more stealth adds no income on this target.</p>'+
      (loadout.items.length?'<h3>Combined toolbelt setup</h3><p>Estimated profit after replacing food: <strong class="currency-value">'+goldNumber(loadout.rate)+' GP/hour</strong>. Meet the listed unlocks. The comparison searches one item per slot type and checks swaps again after combining bonuses.</p>'+table(['Equip','Effect used','Requirements'],loadout.items.map(x=>[readerBoosterName(x.node),x.used.map(m=>wikiBonusText(m,x.node)).join('<br>'),readerBoosterRequirements(x.node)]),true):'')+
      (upgrades.length?'<h3>Individual upgrades</h3>'+table(['Upgrade','Effect used','Requirements','Profit/hour with upgrade'],upgrades.map(x=>[readerBoosterName(x.node),x.used.map(m=>wikiBonusText(m,x.node)).join('<br>'),readerBoosterRequirements(x.node),moneyAmount(x.rate)]),true)+'<p>Each row tests one permanent source and includes food replacement. Potions, charged items, conditional bonuses and same-area bonus rolls are excluded from this comparison.</p>':'');
  }else{
    const cycle=moneySupply(entry,level);
    details=cycle?table(['Processing time','Supply time','Full cycle','Expected sale value','Recurring cash cost','Profit/hour'],[[numericCell(cycle.actionSeconds,' s'),numericCell(cycle.seconds-cycle.actionSeconds,' s'),numericCell(cycle.seconds,' s'),moneyAmount(cycle.gp),moneyAmount(cycle.cash),moneyAmount(moneyRate(entry,level))]])+
      '<h3>Full production route</h3>'+moneyRouteTable(cycle.inputs,{entry,cycle,level})+'<p>Sell the output at its shop price. Times are expected work per batch, including all repeatable material steps listed above.</p>':
      (moneyRecurringInputs(n)?'<p>One or more inputs has no modeled repeatable source at this level. This method is excluded from the rankings.</p>':'<p>This action consumes required equipment charges. The model cannot price their replacement, so the method is excluded from the rankings.</p>');
    const liquidation=cycle&&group==='Crafting'?moneyInputSaleRate(cycle):null;
    if(liquidation!==null){
      details+='<p>Selling these inputs at the same supply pace yields <span class="currency-value">'+goldNumber(liquidation)+' GP/hour</span>. '+(liquidation>moneyRate(entry,level)?'That beats processing them in this recipe.':'Processing them in this recipe earns at least as much per hour.')+'</p>';
    }
    const combo=cycle?moneyCombination(entry,level):null;
    setup=(combo?moneyCombinedDetails(combo):'')+(group==='Crafting'?wikiCosts(n.data.Ingredients,n):'')+
      (cycle?moneyRouteBoosters(entry,cycle,level):'');
    if(skill==='Fishing')details+='<p>Uses the average fishing interval and the weighted main catch. Junk and special catches are excluded from sale revenue.</p>';
    if(skill==='Mining')details+='<p>Uses the expected break time including prospecting. Extra finds are excluded.</p>';
  }
  main.innerHTML='<h1>'+escape(moneyStrategyName(entry))+'</h1><p>'+moneyNavLink()+' / '+link(n,true)+'</p>'+
    wikiSection('money-access','Requirements','<h3>Required skills for the whole route</h3>'+ (entry.group==='Combat'&&!combatSetup?'':moneyRequirementCell(entry,level,combatSetup))+'<h3>Action and access</h3>'+moneyAccess(entry))+
    wikiSection('money-estimate','Hourly estimate',details)+wikiSection('money-setup','Setup',setup);
  const form=main.querySelector('#money-combat-form,#money-method-level');
  if(form)form.addEventListener('submit',event=>{
    event.preventDefault();
    location.hash=route('money',{id:n.key,level,...Object.fromEntries(new FormData(event.currentTarget))});
  });
}
function moneyGuide(params) {
  const id=params.get('id');
  const entry=id?moneyRows().find(x=>x.n.key===id):null;
  if(entry)moneyMethod(entry,params);else moneyIndex(params);
}
