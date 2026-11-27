function moneyRepairNumbers(level) {
  return Math.min(99,Math.max(1,Math.floor(Number(level)||99)));
}
function moneyGates(node) {
  const locationType={FishingRecipe:'FishingLocation',ThievingRecipe:'ThievingLocation'}[node.type];
  const location=locationType&&publicNode(locationType,node.data.Location||node.data.Category);
  return [...guideV2ReqList(node),...(node.data.DisplayRequirements||[]),
    ...(location?[...guideV2ReqList(location),...(location.data.DisplayRequirements||[])]:[])];
}
function moneyEligible(node,level) {
  return !moneyGates(node).some(r=>{
    const type=bare(r.Type);
    return type==='Level'&&r.Data?.Level>level ||
      /Quest(?:Step|Task|Active)|DemoLocked/.test(type);
  });
}
function moneyRecurringInputs(node) {
  const items=[...(node.data.Ingredients?.Items||[])];
  for(const req of guideV2ReqList(node)){
    if(!/^(Toolbelt|Equipment)ItemEquipped$/.test(bare(req.Type)))continue;
    const item=publicNode('Item',req.Data?.Item);
    const trigger=item?.data.Capabilities?.['MelvorBase:Toolbelt']?.ConsumesOn||
      item?.data.Capabilities?.['MelvorBase:Equipment']?.ConsumesOn;
    if(trigger?.length)return null;
  }
  return items;
}
function moneySuccess(entry,level) {
  return entry.skill==='Cooking'?Math.min(1,(69+level)/(69+entry.n.data.Difficulty)):1;
}
function moneySourceModel(level, trainingSkill, trainingLevel, unlocked, character) {
  moneySourceModel.cache ||=new Map();
  const key=trainingSkill ? [level, trainingSkill, trainingLevel, Boolean(unlocked)].join('/') : level;
  if(!character&&moneySourceModel.cache.has(key))return moneySourceModel.cache.get(key);
  const levelFor=character?.levelFor || (skill=>skill===trainingSkill ? trainingLevel : level);
  const eligible=character?.eligible || (node=>trainingSkill ? trainingEligible(node,levelFor,unlocked) : moneyEligible(node,level));
  const recipes=[];
  for(const entry of moneyRows()){
    if(!['Gathering','Crafting'].includes(entry.group)||!eligible(entry.n)||((trainingSkill||character)&&entry.level>levelFor(entry.skill)))continue;
    const d=entry.n.data;
    const input=d.Ingredients||{},items=moneyRecurringInputs(entry.n);
    if(!items)continue;
    const mining=entry.skill==='Mining' && character?.mining?.(entry.n);
    const outputs=mining?[{Item:d.Product.Item,Quantity:mining.quantity}]:entry.skill==='Fishing'?(d.RandomProducts||[]).map(x=>({
      Item:x.Item,Quantity:moneyAverage(x)*x.Weight/d.RandomProducts.reduce((sum,y)=>sum+y.Weight,0)*(d.FishChance??d.BaseFishChance??0)
    })):d.Products||(d.Product?[d.Product]:[]);
    recipes.push({node:entry.n,entry,time:mining?.active??entry.seconds,items,cash:(input.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0),
      outputs:outputs.map(x=>({id:x.Item,qty:(x.Quantity??1)*(x.Chance??1)*moneySuccess(entry,levelFor(entry.skill))}))});
  }
  for(const n of byType.get('ShopPurchase')||[]){
    const d=n.data,c=d.Costs;
    if(!d.AllowBulkPurchase||d.DefaultBuyLimit!==0||!eligible(n)||!c||c.Currencies?.some(x=>bare(x.Currency)!=='GoldPieces'))continue;
    const items=c.Items||[],cash=(c.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0);
    if(!items.length&&!cash)continue;
    recipes.push({node:n,time:0,items,cash,outputs:(d.Provides?.Items||[]).map(x=>({id:x.Item,qty:x.Quantity}))});
  }
  for(const n of byType.get('Item')||[]){
    const open=n.data.Capabilities?.['MelvorBase:Openable'];
    if(!open||!eligible(n))continue;
    const outputs=(open.AlwaysDrops||[]).filter(x=>x.Item).map(x=>({id:x.Item,qty:moneyAverage(x)}));
    const drops=open.DropTable||[],sum=drops.reduce((total,x)=>total+(x.Weight||0),0);
    if(sum>0)for(const drop of drops)outputs.push({id:drop.Item,qty:moneyAverage(drop)*drop.Weight/sum});
    if(outputs.length)recipes.push({node:n,time:0,items:[{Item:n.id,Quantity:1}],cash:0,outputs});
  }
  // Minimize production time plus time needed to replace GP at the best base gathering rate.
  const gpPerSecond=Math.max(0,...moneyRows().filter(e=>{
    if(e.group!=='Gathering'||!eligible(e.n))return false;
    const inputs=moneyRecurringInputs(e.n);
    return inputs && (!(trainingSkill||character) || (inputs.length===0 && e.level<=levelFor(e.skill)));
  }).map(e=>{
    const mining=e.skill==='Mining' && character?.mining?.(e.n);
    return mining?moneyQuote(e.n.data.Product.Item)*mining.quantity/mining.active:e.gross/e.seconds;
  }));
  const baseline=Math.max(1/3600,gpPerSecond);
  const paths=new Map(), score=p=>p.seconds+p.cash/baseline;
  for(let pass=0;pass<24;pass++){
    let changed=false;
    for(const recipe of recipes){
      const inputs=recipe.items.map(x=>({qty:x.Quantity,path:paths.get(x.Item)}));
      if(inputs.some(x=>!x.path))continue;
      const seconds=recipe.time+inputs.reduce((sum,x)=>sum+x.qty*x.path.seconds,0);
      const cash=recipe.cash+inputs.reduce((sum,x)=>sum+x.qty*x.path.cash,0);
      for(const output of recipe.outputs){
        if(!output.id||!(output.qty>0)||inputs.some(x=>x.path.used.has(output.id)))continue;
        const route={id:output.id,node:recipe.node,entry:recipe.entry,qty:output.qty,actionSeconds:recipe.time,actionCash:recipe.cash,
          seconds:seconds/output.qty,cash:cash/output.qty,inputs,
          used:new Set([output.id,...inputs.flatMap(x=>[...x.path.used])])};
        if(paths.has(output.id)&&score(paths.get(output.id))<=score(route)+1e-9)continue;
        paths.set(output.id,route);changed=true;
      }
    }
    if(!changed)break;
  }
  const food=[...paths.values()].filter(x=>publicNode('Item',x.id)?.data.Capabilities?.['MelvorBase:Food']?.BaseHealing>0).map(x=>{
    const healing=publicNode('Item',x.id).data.Capabilities['MelvorBase:Food'].BaseHealing;
    return {path:x,healing};
  }).sort((a,b)=>score(a.path)/a.healing-score(b.path)/b.healing)[0];
  const result={paths,food,gpPerSecond};
  if (character) return result;
  if (trainingSkill) {
    const trainingKeys = [...moneySourceModel.cache.keys()].filter(key => typeof key === 'string');
    if (trainingKeys.length >= 150) moneySourceModel.cache.delete(trainingKeys[0]);
  }
  moneySourceModel.cache.set(key,result);
  return result;
}
function moneySupply(entry,level) {
  if(!moneyEligible(entry.n,level))return null;
  const model=moneySourceModel(level);
  if(entry.group==='Thieving')return moneyThievingCycle(entry.n,level);
  const ingredients=entry.n.data.Ingredients||{};
  const recurring=moneyRecurringInputs(entry.n);
  if(!recurring)return null;
  const inputs=recurring.map(x=>({qty:x.Quantity,path:model.paths.get(x.Item)}));
  if(inputs.some(x=>!x.path))return null;
  return {gp:entry.gross*moneySuccess(entry,level),cash:(ingredients.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0)+inputs.reduce((sum,x)=>sum+x.qty*x.path.cash,0),
    seconds:entry.seconds+inputs.reduce((sum,x)=>sum+x.qty*x.path.seconds,0),actionSeconds:entry.seconds,inputs};
}
function thievingFood(n,timing,mods,model) {
  const avoidance=Math.min(1,Math.max(0,mods.DamageAvoidanceChance||0));
  const damage=timing.attempts*(1-timing.chance)*(1-avoidance)*(n.data.Damage+1)/2;
  if(!damage)return {seconds:0,cash:0,inputs:[]};
  const food=model().food;
  if(!food)return null;
  const qty=damage/food.healing;
  return {seconds:qty*food.path.seconds,cash:qty*food.path.cash,inputs:[{qty,path:food.path}]};
}
function moneyThievingCycle(n,level,mods={},model) {
  const m=moneyThieving(n,level,mods);
  const food=thievingFood(n,m,mods,()=>model||moneySourceModel(level));
  if(!food)return null;
  return {gp:m.gp,cash:food.cash,seconds:m.seconds+food.seconds,inputs:food.inputs,
    actionSeconds:m.seconds,earnings:{direct:m.wins*m.direct,loot:m.wins*m.items,completion:m.finish}};
}
function moneyCycleHourly(cycle) {
  return cycle&&cycle.seconds>0?(cycle.gp-cycle.cash)*3600/cycle.seconds:0;
}
function moneyRouteSteps(inputs) {
  const steps=new Map();
  function add(path,qty,depth) {
    const old=steps.get(path);
    if(old){old.qty+=qty;old.depth=Math.max(old.depth,depth);}
    else steps.set(path,{path,qty,depth});
    for(const input of path.inputs)add(input.path,qty*input.qty/path.qty,depth+1);
  }
  for(const input of inputs)add(input.path,input.qty,0);
  return [...steps.values()].sort((a,b)=>b.depth-a.depth);
}
function moneyRouteTable(inputs,finalStep) {
  const rows=moneyRouteSteps(inputs).map(({path,qty})=>[
    link(path.node,true),guideV2Ref('Item',path.id),numericCell(qty),
    numericCell(qty/path.qty*path.actionSeconds,' s'),moneyAmount(qty/path.qty*path.actionCash),guideV2Requirements(path.node)
  ]);
  if(finalStep){
    const {entry,cycle,level}=finalStep, data=entry.n.data;
    const products=data.Products||(data.Product?[data.Product]:[]);
    rows.push([link(entry.n,true),products.map(x=>guideV2Ref('Item',x.Item)).join('<br>')||'—',
      products.length===1?numericCell((products[0].Quantity??1)*(products[0].Chance??1)*moneySuccess(entry,level)):'—',
      numericCell(cycle.actionSeconds,' s'),moneyAmount((data.Ingredients?.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0)),moneyAccess(entry)]);
  }
  return rows.length?table(['Step','Output','Expected quantity','Time in this cycle','Cash spent','Requirements'],rows.map((row,i)=>[String(i+1)+'. '+row[0],...row.slice(1)])):'';
}
function moneyRequiredSkills(entry,inputs) {
  const levels=new Map();
  function add(skill,lvl){
    if(publicNode('Skill',skill)&&Number.isFinite(lvl))levels.set(bare(skill),Math.max(levels.get(bare(skill))||1,lvl));
  }
  function read(node){
    for(const gate of moneyGates(node)){
      if(bare(gate.Type)==='Level'&&!gate.Data?.IsOr)add(gate.Data?.Component?.Entity,gate.Data?.Level);
    }
  }
  if(entry.group==='Combat'){
    read(entry.n);
    const areas=moneyCombat(entry.n).stats.locations.filter(x=>x.type==='CombatArea');
    if(areas.length===1){const area=publicNode(areas[0].type,areas[0].id);if(area)read(area);}
  }else{
    add(entry.skill,entry.level);
    read(entry.n);
  }
  for(const {path} of moneyRouteSteps(inputs))read(path.node);
  return [...levels].map(([skill,lvl])=>'<span class="level-line">'+guideV2Ref('Skill',skill)+' '+number(lvl)+'</span>').join('')||'—';
}
function moneyRouteBoosters(entry,cycle,level) {
  const actions=new Map();
  const add=(e,time)=>{
    if(e&&time>0)actions.set(e.n.key,{entry:e,time:(actions.get(e.n.key)?.time||0)+time});
  };
  add(entry,cycle.actionSeconds);
  for(const {path,qty} of moneyRouteSteps(cycle.inputs))add(path.entry,path.actionSeconds*qty/path.qty);
  const rows=[];
  for(const {entry:step,time} of actions.values()){
    const skill=publicNode('Skill',step.skill);
    const base={type:step.n.type,id:step.n.id,xp:1,seconds:step.seconds,successChance:1};
    const baseline=readerBoostedRate(base,level,step.skill,[]);
    if(!skill||!(baseline>0))continue;
    for(const {node,mods} of readerBoosterPool(skill)){
      if(!moneyEligible(node,level)||node.type==='EquipmentSetBonus')continue;
      const caps=Object.values(node.data.Capabilities||{});
      if(caps.some(c=>c?.ConsumesOn?.length)||/Potion/.test(node.name))continue;
      const applicable=mods.filter(m=>{
        const name=m.Stat?.Name||m.StatGroup;
        if(!/Interval|MaxHealth|DoubleDamageChance|InstantCutChance|WeakSpotChance|SkipStepChance/.test(name))return false;
        // The generic model cannot convert a flat fishing interval or unmodeled mining effects into reward time.
        if(step.skill==='Fishing'&&/Flat/.test(name))return false;
        return !m.Condition&&!m.Scaling&&!m.FromContext;
      });
      if(!applicable.length)continue;
      const boosted=readerBoostedRate(base,level,step.skill,applicable);
      if(!(boosted>baseline))continue;
      const saving=time*(1-baseline/boosted);
      if(saving>0.001)rows.push({node,step,applicable,saving});
    }
  }
  rows.sort((a,b)=>b.saving-a.saving);
  const selected=rows.slice(0,8);
  return (selected.length?'<h3>Upgrades that speed up this route</h3>'+table(['Booster','Step','Effect used','Time saved per cycle','Estimated profit/hour','Unlock'],selected.map(x=>[
    readerBoosterName(x.node),link(x.step.n,true),
    x.applicable.map(m=>m.Stat?wikiBonusText(m,x.node):wikiAllBonusText({Global:[m]},x.node)).join('<br>'),
    numericCell(x.saving,' s'),moneyAmount((cycle.gp-cycle.cash)*3600/(cycle.seconds-x.saving)),readerBoosterRequirements(x.node)
  ]),true)+'<p>Each comparison changes one step with one permanent booster. The remaining steps, sale prices and input quantities stay at base values.</p>':'')+
    '<p>Check the skill pages for additional yield bonuses, preservation and potions. Temporary boosts and replacements are excluded from these comparisons.</p>'+
    [...new Set([...actions.values()].map(x=>x.entry.skill))].map(s=>guideV2Ref('Skill',s)).join(' · ');
}
function moneyCombatWeapons(level) {
  moneyCombatWeapons.cache ||=new Map();
  if(moneyCombatWeapons.cache.has(level))return moneyCombatWeapons.cache.get(level);
  const choices=[];
  for(const n of byType.get('Item')||[]){
    const weapon=n.data.Capabilities?.['MelvorBase:Weapon'],equipment=n.data.Capabilities?.['MelvorBase:Equipment'];
    if(!weapon||!equipment||weapon.RequiredAmmoType||equipment.ConsumesOn||!moneyEligible(n,level))continue;
    const stats=new Map((equipment.Stats?.Stats||[]).map(x=>[x.Stat,x.Value]));
    const seconds=(stats.get('MelvorBase:AttackInterval')||0)/1000;
    if(seconds<=0)continue;
    for(const id of publicNode('WeaponType',weapon.Type)?.data.Stances||[]){
      const stance=publicNode('AttackStance',id);
      if(bare(stance?.data.CombatStyle)!=='Melee')continue;
      const accuracy=(level+9)*((stats.get(stance.data.AccuracyStat)||0)+64);
      const max=Math.floor(22+level+(level+17)*(stats.get('MelvorBase:MeleeStrengthBonus')||0)/64);
      choices.push({n,stance,accuracy,max,seconds,power:(equipment.Stats?.PowerRatings||[]).find(x=>x.DamageType===weapon.DamageType)?.Value||1,damageType:weapon.DamageType});
    }
  }
  moneyCombatWeapons.cache.set(level,choices);
  return choices;
}
function moneyCombatEstimate(entry,level) {
  moneyCombatEstimate.cache ||=new Map();
  const cacheKey=entry.n.key+'/'+level;
  if(moneyCombatEstimate.cache.has(cacheKey))return moneyCombatEstimate.cache.get(cacheKey);
  const c=moneyCombat(entry.n), food=moneySourceModel(level).food;
  const enemy=entry.n.data, enemyStats=new Map((enemy.Stats?.Stats||[]).map(x=>[x.Stat,x.Value]));
  const setups=[];
  const resistance=Math.min(.7,Math.max(0,1/(c.stats.powerRating+1))); // Unarmoured reference protection of 1.
  const hitChance=(a,e)=>a>=e?1-e/(2*a):a/(2*e);
  let incoming=0;
  for(const [i,h] of c.stats.maxHits.entries()){
    const stance=publicNode('AttackStance',enemy.Stances?.[i]?.Stance),style=publicNode('CombatStyle',stance?.data.CombatStyle);
    if(!style)continue;
    const accuracyLevel=(style.data.AccuracyRatingLevels||[]).reduce((sum,x)=>sum+(c.stats.levels[bare(x.Level)]??1)*x.Ratio,0);
    const accuracy=(accuracyLevel+9)*((enemyStats.get(stance.data.AccuracyStat)||0)+64);
    const def=(level+9)*64, interval=(enemyStats.get(style.data.AttackIntervalStat)||2400)/1000;
    incoming=Math.max(incoming,hitChance(accuracy,def)*(h.maxHit+1)/2*(1-resistance)/Math.max(.25,interval));
  }
  for(const w of moneyCombatWeapons(level)){
    const def=(c.stats.levels.Defence+9)*((enemyStats.get(w.stance.data.EvasionStat)||0)+64);
    const p=hitChance(w.accuracy,def);
    const protect=(enemy.Stats?.ProtectionRatings||[]).find(x=>x.DamageType===w.damageType)?.Value||0;
    const res=Math.min(.7,protect/(w.power+protect));
    const damage=Math.max(1,(w.max+1)/2*(1-res)-c.stats.armour);
    const attacks=Math.max(1,Math.ceil((c.stats.hitpoints+c.stats.ward)/(damage*p)));
    const fighting=attacks*w.seconds, qty=food?incoming*fighting/food.healing:0;
    if(incoming>0&&!food)continue;
    const seconds=fighting+3+(food?qty*food.path.seconds:0), cost=food?qty*food.path.cash:0;
    setups.push({w,fighting,seconds,cost,qty,food,p,rate:(c.gp-cost)*3600/seconds});
  }
  setups.sort((a,b)=>b.rate-a.rate);
  const seen=new Set();
  const results={best:setups[0],alternatives:setups.filter(x=>{
    if(seen.has(x.w.n.key))return false;
    seen.add(x.w.n.key);return true;
  }).slice(0,3)};
  moneyCombatEstimate.cache.set(cacheKey,results);
  return results;
}
