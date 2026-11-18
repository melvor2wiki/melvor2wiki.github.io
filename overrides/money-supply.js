function moneyRepairNumbers(level) {
  return Math.min(99,Math.max(1,Math.floor(Number(level)||99)));
}
function moneyEligible(node,level) {
  const locationType={FishingRecipe:'FishingLocation',ThievingRecipe:'ThievingLocation'}[node.type];
  const location=locationType&&publicNode(locationType,node.data.Location||node.data.Category);
  const gates=[...guideV2ReqList(node),...(node.data.DisplayRequirements||[]),
    ...(location?[...guideV2ReqList(location),...(location.data.DisplayRequirements||[])]:[])];
  return !gates.some(r=>{
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
function moneySourceModel(level) {
  moneySourceModel.cache ||=new Map();
  if(moneySourceModel.cache.has(level))return moneySourceModel.cache.get(level);
  const recipes=[];
  for(const entry of moneyRows()){
    if(!['Gathering','Crafting'].includes(entry.group)||!moneyEligible(entry.n,level))continue;
    const d=entry.n.data;
    const input=d.Ingredients||{},items=moneyRecurringInputs(entry.n);
    if(!items)continue;
    const outputs=entry.skill==='Fishing'?(d.RandomProducts||[]).map(x=>({
      Item:x.Item,Quantity:moneyAverage(x)*x.Weight/d.RandomProducts.reduce((sum,y)=>sum+y.Weight,0)*(d.FishChance??d.BaseFishChance??0)
    })):d.Products||(d.Product?[d.Product]:[]);
    recipes.push({node:entry.n,time:entry.seconds,items,cash:(input.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0),
      outputs:outputs.map(x=>({id:x.Item,qty:(x.Quantity??1)*(x.Chance??1)*moneySuccess(entry,level)}))});
  }
  for(const n of byType.get('ShopPurchase')||[]){
    const d=n.data,c=d.Costs;
    if(!d.AllowBulkPurchase||d.DefaultBuyLimit!==0||!moneyEligible(n,level)||!c||c.Currencies?.some(x=>bare(x.Currency)!=='GoldPieces'))continue;
    const items=c.Items||[],cash=(c.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0);
    if(!items.length&&!cash)continue;
    recipes.push({node:n,time:0,items,cash,outputs:(d.Provides?.Items||[]).map(x=>({id:x.Item,qty:x.Quantity}))});
  }
  for(const n of byType.get('Item')||[]){
    const open=n.data.Capabilities?.['MelvorBase:Openable'];
    if(!open||!moneyEligible(n,level))continue;
    const outputs=(open.AlwaysDrops||[]).filter(x=>x.Item).map(x=>({id:x.Item,qty:moneyAverage(x)}));
    const drops=open.DropTable||[],sum=drops.reduce((total,x)=>total+(x.Weight||0),0);
    if(sum>0)for(const drop of drops)outputs.push({id:drop.Item,qty:moneyAverage(drop)*drop.Weight/sum});
    if(outputs.length)recipes.push({node:n,time:0,items:[{Item:n.id,Quantity:1}],cash:0,outputs});
  }
  // Minimize production time plus time needed to replace GP at the best base gathering rate.
  const baseline=Math.max(1/3600,...moneyRows().filter(e=>e.group==='Gathering'&&moneyEligible(e.n,level)&&moneyRecurringInputs(e.n)).map(e=>e.gross/e.seconds));
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
        const route={id:output.id,node:recipe.node,qty:output.qty,seconds:seconds/output.qty,cash:cash/output.qty,inputs,
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
  const result={paths,food};
  moneySourceModel.cache.set(level,result);
  return result;
}
function moneySupply(entry,level) {
  if(!moneyEligible(entry.n,level))return null;
  const model=moneySourceModel(level);
  if(entry.group==='Thieving'){
    const m=moneyThieving(entry.n,level);
    const damage=m.attempts*(1-m.chance)*(entry.n.data.Damage+1)/2;
    if(damage>0&&!model.food)return null;
    const food=model.food, qty=damage>0?damage/food.healing:0;
    return {gp:m.gp,cash:qty?(qty*food.path.cash):0,seconds:m.seconds+(qty?qty*food.path.seconds:0),
      inputs:qty?[{qty,path:food.path}]:[],actionSeconds:m.seconds};
  }
  const ingredients=entry.n.data.Ingredients||{};
  const recurring=moneyRecurringInputs(entry.n);
  if(!recurring)return null;
  const inputs=recurring.map(x=>({qty:x.Quantity,path:model.paths.get(x.Item)}));
  if(inputs.some(x=>!x.path))return null;
  return {gp:entry.gross*moneySuccess(entry,level),cash:(ingredients.Currencies||[]).reduce((sum,x)=>sum+x.Quantity,0)+inputs.reduce((sum,x)=>sum+x.qty*x.path.cash,0),
    seconds:entry.seconds+inputs.reduce((sum,x)=>sum+x.qty*x.path.seconds,0),actionSeconds:entry.seconds,inputs};
}
function moneyRouteTable(inputs) {
  const steps=new Map();
  function add(path,qty,depth) {
    const key=path.node.key+'/'+path.id, old=steps.get(key);
    if(old){old.qty+=qty;old.depth=Math.max(old.depth,depth);}
    else steps.set(key,{path,qty,depth});
    for(const input of path.inputs)add(input.path,qty*input.qty/path.qty,depth+1);
  }
  for(const input of inputs)add(input.path,input.qty,0);
  return steps.size?table(['Source','Material','Expected quantity','Requirements'],[...steps.values()].sort((a,b)=>b.depth-a.depth).map(x=>[link(x.path.node,true),guideV2Ref('Item',x.path.id),numericCell(x.qty),guideV2Requirements(x.path.node)])):'';
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
