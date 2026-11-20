function miningCycle(rock, bonuses = {}) {
  const d = rock.data, value = key => bonuses[key] || 0;
  const clamp = number => Math.max(0,Math.min(1,number));
  const p = clamp(d.BaseProductChance * (1 + value('PercentIncreaseRockBreakChance')));
  const prospecting = clamp(value('FlatMinimumProspecting'));
  if (p <= 0 && prospecting < .9999) return null;
  let cap = p > 0 ? Math.max(1,Math.ceil((.9999-prospecting)/p)) : 1;
  // At the boundary, match the repeated floating point addition used by the game.
  if (cap < 10000 && p > 0 && Math.abs(prospecting+cap*p-.9999)<1e-10) {
    let progress=prospecting;
    cap=0;
    do { progress+=p; cap++; } while(progress<.9999);
  }
  const swings = cap===1 ? 1 : -Math.expm1(cap*Math.log1p(-p))/p;
  const baseInterval=d.BaseInterval+value('FlatInterval'), durationFactor=1+value('PercentInterval');
  if (baseInterval<=0||durationFactor<=0) return null;
  const interval=Math.floor(baseInterval*durationFactor)/1000;
  if (interval<=0) return null;
  const shatter = clamp(value('ShatterChance'));
  const xp = Math.max(0,(d.BaseExperience+value('FlatXPGained'))*(1+value('PercentXPGained')))*(1+shatter);
  const quantity = (Math.max(0,d.Product.Quantity+Math.trunc(value('FlatProductQuantity'))) +
    clamp(value('AdditionalProductQuantityChance')))*(1+clamp(value('DoublingChance')))*(1+2*shatter);
  const active=swings*interval, prep=swings*value('RefillPerHit')+value('RefillPerBreak');
  return {p,prospecting,cap,swings,interval,shatter,xp,quantity,active,prep,rate:xp/(active+prep)};
}

function miningValueKeys() {
  return ['PercentIncreaseRockBreakChance','FlatMinimumProspecting','ShatterChance',
    'FlatXPGained','PercentXPGained','FlatInterval','PercentInterval',
    'FlatProductQuantity','AdditionalProductQuantityChance','DoublingChance','RefillPerHit','RefillPerBreak'];
}

function miningBoosterSources() {
  if (miningBoosterSources.cache) return miningBoosterSources.cache;
  const skill=publicNode('Skill','Mining');
  const types=new Set(['ShopPurchase','AstrologyNode','MasteryGuildBonus','Pet']);
  const slots=(game.EntityConfig[skill.id]?.ToolbeltSlots||[]).map(row=>publicNode('ToolbeltSlot',row.Id)).filter(Boolean);
  const capacities=new Map();
  for(const slot of slots)capacities.set(slot.data.FitsType,(capacities.get(slot.data.FitsType)||0)+1);
  const aliases={GlobalPercentXpGained:'PercentXPGained',GlobalFlatXpGained:'FlatXPGained',
    GlobalPercentActionInterval:'PercentInterval',GlobalFlatActionInterval:'FlatInterval'};
  const keys=new Set(miningValueKeys().slice(0,-2));
  const pool=readerBoosterPool(skill).flatMap(({node,mods})=>{
    const cap=node.data.Capabilities?.['MelvorBase:Toolbelt'];
    const slot=cap?.FitsInSlot;
    if(!types.has(node.type)&&!capacities.has(slot))return [];
    const supported=mods.map(mod=>({mod,key:aliases[mod.StatGroup]||mod.Stat?.Name})).filter(({mod,key})=>
      keys.has(key)&&!mod.Condition&&(!mod.Scaling||bare(mod.Scaling.Type)==='Level')&&!mod.FromContext&&
      Object.entries(mod.LocalContext||{}).every(([name,value])=>!value||['Component','Recipe','Category','Subcategory'].includes(name)));
    if(!supported.length)return [];
    const charges=cap?.ConsumesOn||[];
    const trigger=charges[0]?.Data, type=bare(charges[0]?.Type||'');
    const perBreak=type==='GainExperience'&&bare(trigger?.Component?.Entity||'')==='Mining';
    if(charges.length&&(charges.length!==1||(!perBreak&&type!=='MiningMineRock')||trigger?.WasBroken===false||
      Object.entries(trigger||{}).some(([key,value])=>value!=null&&!['Component','Category','Recipe','Subcategory','WasBroken'].includes(key))))return [];
    return [{node,mods:supported,slot,trigger,charges:charges.length>0,perBreak:perBreak||trigger?.WasBroken===true}];
  });
  return miningBoosterSources.cache={pool,slots};
}

function miningProfileSources(profile) {
  const {pool}=miningBoosterSources();
  const selected=new Set(profile.miningOwned||[]);
  // Later pickaxe heads require ownership of their earlier purchases.
  let changed=true;
  while(changed){
    changed=false;
    for(const id of selected){
      const node=byKey.get(id);
      if(node?.type!=='ShopPurchase')continue;
      for(const gate of moneyGates(node)){
        if(bare(gate.Type)!=='ShopPurchase'||gate.Data?.IsOr)continue;
        const purchase=publicNode('ShopPurchase',gate.Data.ShopPurchase);
        if(purchase&&!selected.has(purchase.key)){selected.add(purchase.key);changed=true;}
      }
    }
  }
  const rankThreshold = source => {
    const requirement=moneyGates(source.node).find(gate=>bare(gate.Type)==='MasteryGuildRank');
    return publicNode('MasteryGuildRank',requirement?.Data.Rank)?.data.PointPercentRequired ?? Infinity;
  };
  const selectedRanks=pool.filter(source=>source.node.type==='MasteryGuildBonus'&&selected.has(source.node.key));
  const highest=Math.max(-1,...selectedRanks.map(rankThreshold));
  return pool.filter(source=>selected.has(source.node.key)||(profile.miningPreview&&!source.charges)||
    (source.node.type==='MasteryGuildBonus'&&rankThreshold(source)<=highest));
}

function miningRockSetup(action,level,profile) {
  const rock=guideV2Node(action), levelFor=id=>id==='Mining'?level:profile.support;
  if(action.level>level||!trainingEligible(rock,levelFor,profile.unlocked)||!moneyRecurringInputs(rock))return null;
  const keys=miningValueKeys(), {slots}=miningBoosterSources();
  const sources=profile.miningSources||miningProfileSources(profile);
  const veteran=sources.some(source=>bare(source.node.id)==='MiningRank5');
  const capacities=new Map();
  for(const slot of slots){
    if(!trainingEligible(slot,levelFor,veteran))continue;
    const type=slot.data.FitsType;
    capacities.set(type,(capacities.get(type)||0)+1);
  }
  const base={PercentIncreaseRockBreakChance:(profile.miningBreak||0)/100,
    FlatMinimumProspecting:(profile.miningProspecting||0)/100,ShatterChance:(profile.miningShatter||0)/100,
    PercentXPGained:(profile.xpBonus||0)/100,PercentInterval:-(profile.speed||0)/100};
  const groups=new Map(), passive=[];
  const scopeMatches=scope=>['Category','Recipe','Subcategory'].every(key=>!scope[key]||
    scope[key]===(key==='Recipe'?rock.id:rock.data[key]));
  function addValues(left,right){
    return Object.fromEntries(keys.map(key=>[key,(left[key]||0)+(right[key]||0)]));
  }
  for(const source of sources){
    if(source.slot&&!capacities.has(source.slot))continue;
    if(source.charges&&(profile.miningRefill==null||!scopeMatches(source.trigger||{})))continue;
    // Ownership is asserted separately. Still enforce skill levels and exclude temporary quests.
    if(!trainingEligible(source.node,levelFor,true))continue;
    if(source.node.type==='AstrologyNode'){
      const constellation=(byType.get('AstrologyConstellation')||[]).find(node=>source.node.id.startsWith(node.id));
      if(!constellation||!trainingEligible({...constellation,data:{...constellation.data,Requirements:[
        ...(constellation.data.Requirements||[]),...(constellation.data.SecondaryRequirements||[])
      ]}},levelFor,true))continue;
    }
    const values={};
    for(const {mod,key} of source.mods){
      if(!scopeMatches(mod.LocalContext||{}))continue;
      const experience=mod.Scaling?.Data?.Experience?.Entity;
      values[key]=(values[key]||0)+mod.Value*(experience ? levelFor(bare(experience)) : 1);
    }
    if(!Object.values(values).some(Boolean))continue;
    if(!source.slot){passive.push(source.node);Object.assign(base,addValues(base,values));continue;}
    if(source.charges)values[source.perBreak?'RefillPerBreak':'RefillPerHit']=profile.miningRefill;
    if(!groups.has(source.slot))groups.set(source.slot,[]);
    groups.get(source.slot).push({node:source.node,values});
  }
  profile.miningMemo ||= new Map();
  const cacheKey=JSON.stringify([rock.key,base,passive.map(node=>node.key),[...capacities],
    [...groups].map(([slot,choices])=>[slot,choices.map(({node,values})=>[node.key,values])])]);
  if(profile.miningMemo.has(cacheKey))return profile.miningMemo.get(cacheKey);

  // Keep combinations that trade speed, XP, output or refill costs against one another.
  const lower=new Set(['FlatInterval','PercentInterval','RefillPerHit','RefillPerBreak']);
  const choices=[...groups.values()].flat();
  const mostNegative=key=>choices.reduce((sum,row)=>sum+Math.min(0,row.values[key]||0),base[key]||0);
  const mayInvalidateInterval=rock.data.BaseInterval+mostNegative('FlatInterval')<=0||mostNegative('PercentInterval')<=-1;
  const dominates=(a,b)=>keys.every(key=>{
    if(mayInvalidateInterval&&['FlatInterval','PercentInterval'].includes(key))return a[key]===b[key];
    return lower.has(key)?a[key]<=b[key]:a[key]>=b[key];
  });
  let frontier=[{values:addValues(base,{}),gear:[]}];
  for(const [slot,choices] of groups){
    const variants=[{values:addValues({},{}),gear:[]}];
    for(const choice of choices){
      // Generate combinations once per slot type, so two utility slots cannot pick the same item twice.
      for(const prior of variants.slice()){
        if(prior.gear.length>=capacities.get(slot))continue;
        variants.push({values:addValues(prior.values,choice.values),gear:[...prior.gear,choice.node]});
      }
    }
    const next=[];
    for(const state of frontier)for(const variant of variants){
      const values=addValues(state.values,variant.values);
      if(next.some(prior=>dominates(prior.values,values)))continue;
      for(let i=next.length-1;i>=0;i--)if(dominates(values,next[i].values))next.splice(i,1);
      next.push({values,gear:[...state.gear,...variant.gear]});
    }
    frontier=next;
  }
  let best=null;
  for(const {values,gear} of frontier){
    const cycle=miningCycle(rock,values);
    if(!cycle)continue;
    const output=cycle.quantity/(cycle.active+cycle.prep);
    if(!best||cycle.rate>best.rate+1e-10||(Math.abs(cycle.rate-best.rate)<1e-10&&output>best.output)){
      best={...cycle,action,gear,passive,output,inputs:[]};
    }
  }
  profile.miningMemo.set(cacheKey,best);
  return best;
}

function miningPlannerOptions() {
  const groups=new Map();
  for(const source of miningBoosterSources().pool){
    const category=source.charges?'Charged items':readerBoosterType(source.node);
    if(!groups.has(category))groups.set(category,[]);
    groups.get(category).push(source);
  }
  const input=(name,label,min,max,value='0')=>'<label>'+label+' <input type="number" name="'+name+
    '" min="'+min+'" max="'+max+'" value="'+value+'" step="any"></label>';
  return '<fieldset><legend>Mining setup</legend><p>Enter bonuses from sources you leave unchecked. Added break chance is relative to the rock’s base chance.</p>'+
    input('miningBreak','Increased rock break chance (%)',-100,10000)+' '+
    input('miningProspecting','Starting prospecting (%)',0,100)+' '+
    input('miningShatter','Shatter chance (%)',0,100)+' '+
    input('miningRefill','Seconds to replace one charge',0,10000000,'')+
    '<p><label><input type="checkbox" name="miningPreview"> Preview all compatible permanent sources</label></p>'+
    '<p>Preview assumes you own each modeled unlock and gear piece. Select your own sources to rank your actual setup. Charged items need a refill time, or 0 for banked charges.</p>'+
    '<details><summary>Owned equipment and upgrades</summary>'+[...groups].map(([name,sources])=>
      '<h4>'+escape(name)+'</h4><div class="mining-source-choices">'+sources.map(({node})=>
        '<label><input type="checkbox" name="miningOwned" value="'+escape(node.key)+'"> '+icon(node)+escape(node.name)+'</label>').join('')+
      '</div>').join('')+'</details></fieldset>';
}

function miningSetupLabel(setup) {
  return setup.gear.map(node=>link(node,true)).join('<br>') || '—';
}

function miningTrainingBenchmark(profile) {
  const results=readerCandidates('Mining').map(action=>miningRockSetup(action,profile.from,profile))
    .filter(Boolean).sort((a,b)=>b.rate-a.rate||b.output-a.output);
  if(!results.length)return '';
  return '<h3>Rock comparison at level '+number(profile.from)+'</h3>'+
    table(['Rock','Break chance per swing','Starting prospecting','Swings to guaranteed break','Average swings','Swing time','Shatter','XP/hour','Primary output/hour','Equip'],
      results.map(setup=>[guideV2Link(setup.action),numericCell(setup.p*100,'%'),numericCell(setup.prospecting*100,'%'),
        numericCell(setup.cap),numericCell(setup.swings),numericCell(setup.interval,' s'),numericCell(setup.shatter*100,'%'),numericCell(setup.rate*3600),
        numericCell(setup.output*3600),miningSetupLabel(setup)]),true)+
    '<p>Primary output is for the XP setup shown and includes expected extra quantity, doubling and shatter. Each miss adds the break chance to prospecting. Side loot and timer tick rounding are outside this estimate.</p>';
}
