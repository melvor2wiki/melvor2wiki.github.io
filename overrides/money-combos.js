function moneyOpenValue(id) {
  const open=publicNode('Item',id)?.data.Capabilities?.['MelvorBase:Openable'];
  const sale=moneyQuote(id);
  if(!open)return sale;
  const fixed=(open.AlwaysDrops||[]).reduce((sum,x)=>sum+moneyAverage(x)*moneyQuote(x.Item),0);
  return Math.max(sale,fixed+moneyWeighted(open.DropTable));
}
function moneyCombinationCycle(entry,level,gear,base,allowPriority=true) {
  const d=entry.n.data,skill=entry.skill,mods=gear.flatMap(x=>x.mods);
  const value=(name,item)=>mods.reduce((sum,m)=>sum+((m.Stat?.Name||m.StatGroup)===name&&(!m.LocalContext?.Item||m.LocalContext.Item===item)?m.Value:0),0);
  const globalPercent=value('GlobalPercentActionInterval');
  const clamp=x=>Math.min(1,Math.max(0,x)), twice=1+clamp(value('DoublingChance'));
  let gp=base.gp, seconds=base.actionSeconds, attempts=1, inputs=base.inputs, cash=base.cash, priority;
  if(skill==='Fishing'){
    const interval=(key)=>Math.max(250,Math.floor((d['Base'+key+'Interval']+value('Flat'+key+'Interval'))*(1+value('Percent'+key+'Interval')+globalPercent)));
    seconds=(interval('Min')+Math.max(interval('Min'),interval('Max')))/2000;
    const p=clamp((d.FishChance+value('FlatFishChance'))*(1+value('IncreasedFishChance')));
    const fish=p+(1-p)*clamp(value('JunkRerollChance'));
    const ordinary=fish*moneyWeighted(d.RandomProducts)+(1-fish)*moneyQuote(d.JunkItem);
    let catchValue=ordinary;
    const location=publicNode('FishingLocation',d.Location);
    const unlocks=location?.data.PriorityRequirements;
    if(allowPriority&&unlocks?.length){
      const total=d.RandomProducts.reduce((sum,x)=>sum+x.Weight,0);
      for(const x of d.RandomProducts){
        const priorityRoll=p*x.Weight/total;
        const withPriority=priorityRoll*moneyAverage(x)*moneyQuote(x.Item)+(1-priorityRoll)*ordinary;
        if(withPriority>catchValue){
          catchValue=withPriority;
          priority={item:x.Item,unlocks,location};
        }
      }
    }
    gp=twice*catchValue;
    let remaining=1, specialValue=0;
    const specials=(d.SpecialProducts||[]).map(x=>({
      gp:Math.max(0,(x.Quantity??1)+Math.trunc(value('FlatSpecialProductQuantity',x.Item)))*moneyOpenValue(x.Item),
      p:clamp(x.Chance*(1+value('IncreasedSpecialProductChance',x.Item))+value('FlatSpecialProductChance',x.Item))
    })).sort((a,b)=>a.p-b.p);
    for(const x of specials){specialValue+=remaining*x.p*x.gp;remaining*=1-x.p;}
    gp+=twice*specialValue*(1+(1-remaining)*clamp(value('SecondSpecialItemChance')));
  }else if(skill==='Mining'){
    const p=clamp(d.BaseProductChance*(1+value('PercentIncreaseRockBreakChance')));
    const cap=p>0?Math.max(1,Math.ceil((.9999-value('FlatMinimumProspecting'))/p)):Infinity;
    if(!Number.isFinite(cap))return null;
    attempts=(1-(1-p)**cap)/p;
    seconds=attempts*Math.max(250,Math.floor((d.BaseInterval+value('FlatInterval'))*(1+value('PercentInterval')+globalPercent)))/1000;
    const mainQty=Math.max(0,d.Product.Quantity+Math.trunc(value('FlatProductQuantity')))+clamp(value('AdditionalProductQuantityChance'));
    gp=twice*mainQty*(1+2*clamp(value('ShatterChance')))*moneyQuote(d.Product.Item);
    if(d.BarItem)gp+=twice*clamp(value('BarItemChance'))*moneyQuote(d.BarItem);
    for(const x of d.RandomProductsPerHit||[]){
      const pHit=clamp((x.Chance+value('FlatOnHitItemChance',x.Item))*(1+value('PercentOnHitItemChance',x.Item)));
      gp+=attempts*twice*pHit*x.Quantity*moneyOpenValue(x.Item);
    }
    const config=game.EntityConfig['MelvorBase:Mining'];
    for(const [key,stat] of [['StoneItems','StoneItemChance'],['EssenceItems','EssenceItemChance']]){
      const list=config?.[key]||[];
      gp+=attempts*twice*clamp(value(stat))*list.reduce((sum,x)=>sum+moneyQuote(typeof x==='string'?x:x.Id),0);
    }
  }else if(entry.n.type==='ArtisanRecipe'){
    const costing=1-clamp(value('PreservationChance')), discount=1+value('PercentIngredientCost');
    inputs=base.inputs.map(x=>({...x,qty:Math.max(1,Math.trunc(x.qty*discount))*costing}));
    cash=(d.Ingredients?.Currencies||[]).reduce((sum,x)=>sum+Math.max(1,Math.trunc(x.Quantity*discount))*costing,0)+inputs.reduce((sum,x)=>sum+x.qty*x.path.cash,0);
    const count=Math.max(1,d.Steps),skip=clamp(value('SkipStepChance')),expected=[0];
    for(let i=1;i<=count;i++)expected[i]=1+(1-skip)*expected[i-1]+skip*expected[Math.max(0,i-2)];
    seconds=expected[count]*Math.max(250,Math.floor(d.BaseInterval*(1+value('PercentInterval')+globalPercent)+value('FlatInterval')))/1000;
    gp=(d.Products||[]).reduce((sum,x)=>sum+Math.max(1,Math.trunc((x.Quantity+value('FlatProductQuantity',x.Item))*(1+value('PercentProductQuantity',x.Item))))*(x.Chance??1)*moneyQuote(x.Item),0)*twice;
  }else if(skill==='Woodcutting'){
    const r={type:entry.n.type,id:entry.n.id,xp:1,seconds,successChance:1};
    const timing=mods.filter(m=>/Interval|MaxHealth|DoubleDamageChance|InstantCutChance|WeakSpotChance/.test(m.Stat?.Name||m.StatGroup));
    const rps=readerBoostedRate(r,level,skill,timing);
    if(rps>0)seconds=1/rps;
    for(const x of [d.Product].filter(Boolean))gp=twice*Math.max(0,x.Quantity+Math.trunc(value('FlatProductQuantity')))*moneyQuote(x.Item);
  }else return null;
  let supply=inputs.reduce((sum,x)=>sum+x.qty*x.path.seconds,0);
  const consumables=[];
  for(const item of gear){
    if(!item.consumable)continue;
    const qty=attempts;
    supply+=qty*item.consumable.seconds;
    cash+=qty*item.consumable.cash;
    consumables.push({qty,path:item.consumable});
  }
  return {gp,seconds:seconds+supply,cash,actionSeconds:seconds,inputs:[...inputs,...consumables],priority};
}
function moneyCombinationGroups(entry,level) {
  const skill=publicNode('Skill',entry.skill);
  const slotTypes=new Map();
  for(const slotId of game.EntityConfig[skill.id]?.ToolbeltSlots||[]){
    const slot=publicNode('ToolbeltSlot',slotId.Id);
    if(!slot||!moneyEligible(slot,level))continue;
    const type=slot.data.FitsType;
    slotTypes.set(type,(slotTypes.get(type)||0)+1);
  }
  const groups=new Map(),result=[];
  const eligible=/^(?:DoublingChance|FlatFishChance|IncreasedFishChance|JunkRerollChance|SecondSpecialItemChance|(?:Flat|Increased)SpecialProductChance|FlatSpecialProductQuantity|(?:Flat|Percent)(?:Min|Max)?Interval|GlobalPercentActionInterval|FlatMinimumProspecting|PercentIncreaseRockBreakChance|(?:Flat|Percent)OnHitItemChance|AdditionalProductQuantityChance|ShatterChance|BarItemChance|StoneItemChance|EssenceItemChance|(?:Flat|Percent)ProductQuantity|PreservationChance|PercentIngredientCost|SkipStepChance|DoubleDamageChance|InstantCutChance|WeakSpotChance|(?:Flat|Percent)MaxHealth)$/;
  for(const {node,mods} of readerBoosterPool(skill)){
    if(!moneyEligible(node,level))continue;
    const cap=node.data.Capabilities?.['MelvorBase:Toolbelt'];
    let group=cap?.FitsInSlot;
    if(!slotTypes.has(group)){
      if(node.type==='Pet')group='Pet';
      else if(node.type==='MasteryGuildBonus')group='Guild';
      else if(node.type==='AstrologyNode')group='Astrology';
      else continue;
    }
    if(group==='Astrology'){
      const parent=(byType.get('AstrologyConstellation')||[]).find(x=>bare(node.id).startsWith(bare(x.id)));
      if(!parent||!moneyEligible(parent,level))continue;
    }
    let consumable;
    if(cap?.ConsumesOn?.length){
      const t=cap.ConsumesOn[0];
      if(entry.skill!=='Fishing'||cap.ConsumesOn.length!==1||bare(t.Type)!=='FishingFishRecipe'||Object.entries(t.Data||{}).some(([k,v])=>k!=='Component'&&v!=null))continue;
      consumable=moneySourceModel(level).paths.get(node.id);
      if(!consumable)continue;
    }
    const applicable=mods.filter(m=>eligible.test(m.Stat?.Name||m.StatGroup)&&!m.Condition&&!m.Scaling&&!m.FromContext&&
      Object.entries(m.LocalContext||{}).every(([k,v])=>!v||k==='Component'||k==='Item'||
        ({Recipe:entry.n.id,Category:entry.n.data.Category,Subcategory:entry.n.data.Subcategory,Location:entry.n.data.Location})[k]===v));
    if(!applicable.length)continue;
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push({node,mods:applicable,consumable});
  }
  for(const [type,choices] of groups)for(let i=0;i<(slotTypes.get(type)||1);i++)result.push(choices);
  return result;
}
function moneyCombination(entry,level) {
  moneyCombination.cache ||= new Map();
  const key=entry.n.key+'/'+level;
  if(moneyCombination.cache.has(key))return moneyCombination.cache.get(key);
  const base=moneySupply(entry,level);
  if(!base)return null;
  const initial=moneyCombinationCycle(entry,level,[],base,false);
  if(!initial)return null;
  const groups=moneyCombinationGroups(entry,level),equipped=Array(groups.length).fill(null);
  const evaluate=items=>moneyCombinationCycle(entry,level,items,base);
  for(let pass=0;pass<2;pass++)for(const [i,options] of groups.entries()){
    const others=equipped.filter((x,j)=>x&&i!==j);
    let winner=null, best=moneyCycleHourly(evaluate(others));
    for(const item of options){
      if(others.some(x=>x.node===item.node))continue;
      const rate=moneyCycleHourly(evaluate([...others,item]));
      if(rate>best){winner=item;best=rate;}
    }
    equipped[i]=winner;
  }
  const gear=equipped.filter(Boolean),cycle=evaluate(gear);
  const result={gear,cycle,rate:moneyCycleHourly(cycle),baseRate:moneyCycleHourly(initial)};
  moneyCombination.cache.set(key,result);
  return result;
}
function moneyCombinedDetails(combo) {
  const cycle=combo.cycle;
  return '<h3>Combined setup</h3><p>These compatible bonuses are applied together. The estimate charges for repeatable supplies and includes time to replace them.</p>'+
    table(['Base profit/hour','Combined profit/hour','Combined cycle','Cash spent per cycle'],[[moneyAmount(combo.baseRate),moneyAmount(combo.rate),numericCell(cycle.seconds,' s'),moneyAmount(cycle.cash)]])+
    (combo.gear.length?table(['Equip or unlock','Effect used','Requirements'],combo.gear.map(x=>[readerBoosterName(x.node),x.mods.map(m=>m.Stat?wikiBonusText(m,x.node):wikiAllBonusText({Global:[m]},x.node)).join('<br>'),readerBoosterRequirements(x.node)])):'')+
    (cycle.inputs.length?'<h4>Supplies with this setup</h4>'+moneyRouteTable(cycle.inputs):'')+
    (cycle.priority?'<p>Set '+guideV2Ref('Item',cycle.priority.item)+' as your priority catch at '+link(cycle.priority.location,true)+'. Unlock: '+guideV2Html(requirements({...cycle.priority.location,data:{Requirements:cycle.priority.unlocks}}))+'</p>':'')+
    '<p>Rates use one Guild bonus, one Astrology node and the toolbelt slots available to the skill. Side drops are valued at shop prices or at the expected value of opening a container, whichever is higher. Multi-skill supply steps use base rates. The search leaves out unmodeled effects and can miss stronger combinations.</p>';
}
