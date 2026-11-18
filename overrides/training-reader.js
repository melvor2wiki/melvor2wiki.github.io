/* Practical training pages. Formulas and assumptions stay beside the relevant rates. */
function readerNotes(id) {
  const notes={
    Woodcutting:['Cut the fastest tree you can access, then move on when the next one beats it.','Keep a supply of logs for [Skill:Firemaking] and [Skill:Fletching]. Extra logs are useful, but they do not award extra Woodcutting XP.','Double damage, weak spots and instant cuts shorten a cut. Compare those bonuses as well as XP and swing speed.'],
    Mining:['Train on the rock with the best break XP for the time it takes to mine.','Save ore for [Skill:Smithing] before selling the rest. Prospecting makes long dry streaks less costly than the first-hit chance suggests.','Break chance and shatter bonuses can matter more than a small XP bonus.'],
    Fishing:['Use the quickest XP spot until you need a particular fish for another skill.','Bank the fish you will cook in [Skill:Cooking]. If you are gathering food rather than rushing levels, choose the catch you need.','Shorter fishing intervals speed up training; extra catches mainly improve your food supply.'],
    Cooking:['With ingredients banked, switch from fish to [CookingRecipe:BeefSandwich] at level 15. Keep cooking fish if you cannot yet supply the sandwich ingredients.','If your bank is empty, check the gathering route below before choosing what to cook. Keep useful food for combat.','Success chance matters most while your proficiency is low. The table includes failed cooks.'],
    Herblore:['Brew in batches and keep the potions you will actually use.','Gather the herbs and secondary ingredients before starting. A short brew is only fast overall if its ingredients are easy to replace.','Check which brewing phase a tool improves: preparing, heating, stirring or bottling.'],
    Firemaking:['Burn the best XP fuel you can replace without spending longer gathering it.','Keep logs needed for [Skill:Fletching] before burning your whole bank. Use the gathering route when you need to cut the fuel yourself.','A shorter burn and more XP both help. Extra products improve the return, not the XP from that burn.'],
    Smithing:['Smelt or smith the fastest recipe your ore supply can support.','Keep bars for your next equipment upgrade. Use the supply route below if you are starting with an empty bank.','Step skipping helps long recipes; XP and interval bonuses help every recipe they apply to.'],
    Crafting:['Choose the quickest recipe with ingredients you can afford to replace.','Keep useful jewellery and tools. When supplies run out, compare the time spent gathering them as well as the crafting time.','An expensive recipe is not automatically faster once gathering is included.'],
    Fletching:['Use the fastest recipe you can keep supplied with logs and other materials.','Save ammunition you plan to use in [Skill:Ranged]. Do not turn all your logs into training items if you still need them elsewhere.','Check the recipe step count before choosing a step-skipping bonus.'],
    Runecrafting:['Train on the fastest affordable recipe, while banking runes you will need for [Skill:Magic].','If your essence supply is limited, look at XP per ingredient as well as XP/s.','Resource preservation stretches your bank; action time and XP bonuses make the training itself faster.'],
    Beastcrafting:['Use a repeatable recipe you can keep supplied, and save useful equipment.','Check the full ingredient list before changing recipes. Gathering a rare component can erase the gain from a faster craft.','Compare XP, action time and step skipping before spending materials on an upgrade.'],
    Astrology:['Study the best XP constellation you have unlocked. Change earlier if another constellation has a bonus you need now.','Unlock useful nodes for the skill you plan to train next. Their long-term benefit can be worth more than a small Astrology XP lead.','Study speed and XP help training directly. Event and knowledge bonuses serve different goals.'],
    Thieving:['Stay on [ThievingRecipe:Thug] from level 5 until level 60 for base XP. Higher-level targets can lose their lead once failed attempts and stuns are counted.','Bring enough food for the session. If damage forces you to stop, use an easier target even when its listed XP/s is lower.','Stealth improves success until it reaches 100%. After that, more stealth does not speed up that target.'],
    Hunting:['Choose an animal for the materials you need, then shorten the slower part of its hunt.','Use its matching tool and trap. Add the preferred bait when you can replace it cheaply.','A faster trap does little if most of the hunt is spent tracking. Improve the phase that takes longest.'],
    Farming:['Keep every unlocked plot growing. Pick crops by both XP and the supplies your other skills need.','Reserve seeds for the next planting. Grow herbs for [Skill:Herblore] and food or feed alongside your XP crops.','Plots work in parallel. Treat the crop table as a per-harvest comparison, not a single active-action XP/s ranking.'],
    Ranching:['Start with animals you can keep fed, then fill more space as your supply grows.','Keep enough produce for feed and treats before selling the surplus. A larger herd is useful only if you can maintain it.','Compare maturity, production time and upkeep together; the purchase price alone does not tell you the best animal.'],
    Agility:['Practise the techniques your next useful course needs, then move to that course when you meet its requirements.','Keep food available for failed obstacles. Use a simpler course when failures make a harder one slow or costly.','Shorter obstacles help, but technique level and difficulty decide how reliably you finish them.'],
    Attack:['Use a stance that awards Attack XP and a weapon that hits your target reliably.','Start with [Enemy:Golbin], then move to sustainable Slayer targets or enemies with useful drops.','Compare damage dealt per second, not maximum hit alone. A stronger weapon can lose time through misses.'],
    Strength:['Keep a Strength XP stance selected while you improve your weapon and food supply.','Train alongside [Skill:Attack] so accuracy does not fall behind your damage. Use Slayer assignments when you can sustain them.','The fastest target depends on your accuracy, damage and time spent recovering.'],
    Defence:['Choose a Defence XP stance, then fight something you can handle without constant food stops.','Upgrade your weapon as well as your armour. Killing more slowly for a small defensive gain can reduce training speed.','Compare the whole fight: accuracy, damage, incoming hits and recovery.'],
    Hitpoints:['Train Hitpoints alongside combat rather than looking for a separate gathering action.','Use a sustainable combat setup and keep your food stocked. Slayer assignments let you work on another goal at the same time.','Your XP rate follows damage dealt and the stance XP rules.'],
    Ranged:['Use a Ranged XP stance and keep enough ammunition for the session.','Choose targets you can hit reliably. Bank useful drops and replace ammunition before starting a long session.','A high maximum hit does not make up for poor accuracy or long attack intervals.'],
    Magic:['Use a spell you can keep supplied with runes, against a target it hits reliably.','Keep runes from [Skill:Runecrafting]. Compare the cost of each kill before moving to a more expensive spell.','Spell choice, accuracy and attack time all affect training; spell level alone does not choose the winner.'],
    Prayer:['Build a supply of prayer points, then use prayers that help the combat you are already doing.','Read the consumption rule before a long session. A prayer you cannot sustain will not provide a steady training rate.','Compare the benefit to your fight with the time needed to replace the points.'],
    Slayer:['Work through assignments you can complete safely and keep the useful drops.','Move to a new master when you can handle its eligible areas and keep up with the food cost.','A harder assignment is only faster if your combat setup can finish the kills efficiently.']
  };
  return notes[id]||['Train on an action you can keep supplied.','',''];
}
function readerText(text) {
  return escape(text).replace(/\[(\w+):([^\]]+)\]/g,(_,type,id)=>{const n=publicNode(type,id);return n?link(n,true):escape(human(id));});
}
function readerCandidates(id) {
  if(id==='Thieving')return (byType.get('ThievingRecipe')||[]).filter(n=>n.data.Category!=='MelvorBase:Quests'&&n.data.BaseExperience>0&&n.data.BaseInterval>0&&!guideV2ReqList(n).some(r=>/Quest(?:Step|Task|Active)/.test(bare(r.Type)))).map(n=>({type:n.type,id:n.id,name:n.name,level:guideV2Level(n,id),xp:n.data.BaseExperience,seconds:n.data.BaseInterval/1000}));
  return payload.guides.skills[id]?.rankings||[];
}
function readerRate(r,lv,id) {
  if(id==='Thieving'){
    const n=guideV2Node(r),p=Math.min(1,(100+lv)/(100+n.data.Perception));
    return r.xp*p/(Math.max(1,n.data.Stages)*(r.seconds+(1-p)*2));
  }
  return guideV2Rate(r,lv,id);
}
function readerRanges(id,supplies=false) {
  const candidates=readerCandidates(id),ranges=[];
  for(let lv=1;lv<=99;lv++){
    const pool=candidates.filter(r=>r.level<=lv&&(!supplies||r.acquisition?.status==='complete within restricted model'));
    const rate=r=>supplies?r.xp*(id==='Cooking'?Math.min(1,(69+lv)/(69+guideV2Node(r).data.Difficulty)):r.successChance)/(r.acquisition.cycleSecondsIncludingInputs):readerRate(r,lv,id);
    const best=pool.reduce((a,b)=>!a||rate(b)>rate(a)?b:a,null),last=ranges.at(-1);
    if(last?.action?.id===best?.id)last.to=lv;else ranges.push({from:lv,to:lv,action:best});
  }
  return ranges;
}
function readerExtraRequirements(n,id) {
  const list=guideV2ReqList(n).filter(r=>!(bare(r.Type)==='Level'&&bare(r.Data?.Component?.Entity)===id));
  const related=[];
  for(const field of ['Location','Category'])for(const type of ['FishingLocation','HuntingLocation','ThievingLocation','AgilityLocation']){
    const area=publicNode(type,n.data[field]);if(area&&guideV2ReqList(area).length)related.push(link(area,true)+': '+guideV2Html(requirements(area)));
  }
  return (list.length?guideV2Html(requirements({...n,data:{Requirements:list}})):'')+(related.length?'<br>'+related.join('<br>'):'');
}
function readerAverageRate(range,rateAtLevel) {
  let total=0;
  for(let level=range.from;level<=range.to;level++)total+=rateAtLevel(level);
  return total/(range.to-range.from+1);
}
function readerTraining(id) {
  const candidates=readerCandidates(id);
  if(!candidates.length)return readerUnlockTraining(id);
  const ranges=readerRanges(id),rows=ranges.filter(r=>r.action).map(r=>{
    const a=r.action, rate=readerAverageRate(r, level=>readerRate(a,level,id));
    return [guideV2RangeLabel(r),guideV2Link(a),numericCell(rate)];
  });
  let html='<p>'+readerText(readerNotes(id)[0])+'</p>'+table(['Level','Train on','Average XP/s'],rows,true);
  if(id==='Cooking')html+='<p>Rates average every level in each row and include failed cooks. Ingredients are already in your bank.</p>';
  else if(id==='Thieving')html+='<p>Rates average every level in each row and include failed attempts, all stages and the base 2-second stun. Food gathering and healing stops are extra.</p>';
  else html+='<p>These are base rates, before equipment and bonuses.'+(ranges.some(r=>r.action?.ingredients?.Items?.length)?' Ingredients are already in your bank.':'')+'</p>';
  const locks=ranges.filter(r=>r.action).map(r=>{const n=guideV2Node(r.action),extra=readerExtraRequirements(n,id);if(!extra)return null;const fallback=candidates.filter(a=>a.id!==r.action.id&&a.level<=r.from).sort((a,b)=>readerRate(b,r.from,id)-readerRate(a,r.from,id))[0];return [guideV2Link(r.action),extra,fallback?guideV2Link(fallback):'Keep your current action'];}).filter(Boolean);
  if(locks.length)html+='<h3>Before you switch</h3>'+table(['Action','Also required','Use this until then'],locks,true);
  return html;
}
function readerUnlockTraining(id) {
  if(['Attack','Strength','Defence','Hitpoints','Ranged'].includes(id))return readerCombatTraining(id);
  const nodes=guideV2UnlockNodes(id),ranges=guideV2UnlockRanges(id,nodes);
  let html='<p>'+readerText(readerNotes(id)[0])+'</p>';
  if(id==='Hunting')return html+table(['Level','Hunt','Tool','Trap','Bait'],ranges.map(r=>[guideV2RangeLabel(r),r.nodes.map(n=>link(n,true)).join('<br>')||'Keep your current hunt',r.nodes.map(n=>guideV2Ref('HuntingTool',n.data.Tool)).join('<br>'),r.nodes.map(n=>guideV2Ref('HuntingTrapType',n.data.TrapType)).join('<br>'),r.nodes.map(n=>guideV2Ref('Item',n.data.PreferredBait)).join('<br>')]),true)+'<p>'+readerText(readerNotes(id)[1])+'</p><p>A failed trap can add more tracking steps. Animal discovery, journal levels and trap failure bonuses change the cycle, so these are supply choices by unlock level rather than a claimed fastest XP route.</p>';
  if(id==='Farming'||id==='Ranching'){
    html+='<p>'+readerText(readerNotes(id)[1])+'</p>';
    const rows=nodes.slice().sort((a,b)=>guideV2Level(a,id)-guideV2Level(b,id)).map(n=>[numericCell(guideV2Level(n,id)),link(n,true),numericCell(n.data.BaseExperience),numericCell((id==='Farming'?n.data.BaseInterval:n.data.ProductInterval)/1000,' s'),publicItems(id==='Farming'?n.data.Ingredients?.Items:n.data.Eats,n),publicItems(n.data.Products||(n.data.Product?[n.data.Product]:[]),n)]);
    return html+table(['Level',id==='Farming'?'Crop':'Animal','XP',id==='Farming'?'Growth time':'Production time',id==='Farming'?'Seeds':'Feed','Products'],rows,true)+'<p>'+(id==='Farming'?'XP is per base harvest. Grow crops in parallel; care, pests and regrowth change the full cycle.':'XP is the configured animal value. Maturity, satisfaction and lifespan affect the full return; this is not a sustained XP/s ranking.')+'</p>';
  }
  return html+table(['Level','Next options','Other requirements'],ranges.map(r=>[guideV2RangeLabel(r),r.nodes.map(n=>link(n,true)).join('<br>')||'Keep your current action',r.nodes.map(n=>readerExtraRequirements(n,id)||'—').join('<br>')]),true)+'<p>'+readerText(readerNotes(id)[1])+'</p>';
}
function readerCombatTraining(id) {
  const g=payload.guides.skills[id],stances=(g.stances||[]).map(s=>'<strong>'+escape(s.name)+'</strong>: '+s.experienceGain.filter(x=>bare(x.Component.Entity)===id).map(x=>guideV2Num(x.ExperiencePerDamage,' XP per damage')).join(', ')).join('<br>');
  const gearSkill=['Strength','Hitpoints'].includes(id)?'Attack':id,skill=publicNode('Skill',gearSkill),equipment=wikiEquipmentUnlocks(skill).filter(n=>guideV2Level(n,gearSkill)<=99).sort((a,b)=>guideV2Level(a,gearSkill)-guideV2Level(b,gearSkill));
  const levels=[...new Set([1,...equipment.map(n=>guideV2Level(n,gearSkill))])].sort((a,b)=>a-b),rows=levels.map((lv,i)=>[lv+'–'+(levels[i+1]?levels[i+1]-1:99),equipment.filter(n=>guideV2Level(n,gearSkill)===lv).map(n=>link(n,true)).join('<br>')||'Keep your current equipment']);
  return '<p>'+readerText(readerNotes(id)[0])+'</p><p>'+readerText(readerNotes(id)[1])+'</p><h3>Choose your XP stance</h3><p>'+stances+'</p><h3>'+(id==='Hitpoints'?'Melee equipment checkpoints':'Equipment checkpoints')+'</h3>'+table([gearSkill+' level','New equipment'],rows,true)+'<p>These are equipment unlocks, not fixed target changes. Combat XP/s depends on your weapon, accuracy, enemy and food stops.</p>';
}
function readerSupplyRoute(id) {
  const rs=readerRanges(id,true).filter(r=>r.action);if(!rs.length)return '';
  return '<p>Starting from an empty bank? These choices include gathering the ingredients and assume you have unlocked every source listed at right.</p>'+table(['Level','Make','XP/s with gathering','Gather from'],rs.map(r=>{
    const a=r.action,rate=readerAverageRate(r,level=>a.xp*(id==='Cooking'?Math.min(1,(69+level)/(69+guideV2Node(a).data.Difficulty)):a.successChance)/a.acquisition.cycleSecondsIncludingInputs);
    const refs=[...new Set(a.acquisition.items.flatMap(i=>i.sourceIds||[]))].map(id=>(byId.get(id)||[]).find(n=>actionTypes.has(n.type))).filter(Boolean);
    return [guideV2RangeLabel(r),guideV2Link(a),guideV2Num(rate),refs.map(n=>link(n,true)).join('<br>')];
  }),true)+'<p>Only fully resolved gathering and crafting chains are included. Shop purchases, combat drops and passive farming are outside this comparison.</p>';
}
function readerCategory(name) {
  if(/XP|Experience/i.test(name))return 'XP';
  if(/Interval|ActionSpeed/.test(name))return 'Action Time';
  if(/Success|Stealth|Proficiency|Accuracy|Perception/.test(name))return 'Success and Accuracy';
  if(/Damage|InstantCut|SkipStep|Prospect|MaxHealth|WeakSpot|Shatter|Stages|TrackingSteps/.test(name))return 'Action Progress';
  if(/Preserv|Quantity|Doubl|Cost|Consumption/.test(name))return 'Resources';
  return 'Other Bonuses';
}
function readerModifiers(node,skill) {
  const mods=wikiModifierRows(node.data,skill.id).slice();
  function collect(v){if(!v||typeof v!=='object')return;if(v.StatGroup&&typeof v.Value==='number'&&/Global.*(?:Xp|XP|ActionInterval)/.test(v.StatGroup))mods.push(v);Object.values(v).forEach(x=>{if(Array.isArray(x))x.forEach(collect);else if(x&&typeof x==='object')collect(x);});}
  collect(node.data);return [...new Map(mods.map(m=>[JSON.stringify(m),m])).values()];
}
function readerBoosterPool(skill) {
  readerBoosterPool.cache ||=new Map();if(readerBoosterPool.cache.has(skill.id))return readerBoosterPool.cache.get(skill.id);
  const types=['Item','ShopPurchase','Pet','MasteryGuildBonus','AstrologyNode','EquipmentSetBonus','FiremakingBonfire','RanchingAnimalVariant','AgilityCourse','AgilityTechnique','OvergrowthEffect','AstrologyBonusesEvent'];
  const rows=types.flatMap(type=>byType.get(type)||[]).map(node=>({node,mods:readerModifiers(node,skill)})).filter(x=>x.mods.length);readerBoosterPool.cache.set(skill.id,rows);return rows;
}
function readerBoosterName(n) {
  if(n.type==='AstrologyNode'){
    const c=(byType.get('AstrologyConstellation')||[]).find(c=>bare(n.id).startsWith(bare(c.id)));
    return (c?link(c,true)+' — ':'')+escape(n.name);
  }
  return link(n,true);
}
function readerBoosterType(n) {
  if(n.type==='Item')return /Potion/.test(JSON.stringify(n.data.Capabilities||{}))?'Potions':'Equipment';
  return ({ShopPurchase:'Shop Upgrades',Pet:'Pets',MasteryGuildBonus:'Mastery Guild',AstrologyNode:'Astrology',EquipmentSetBonus:'Equipment Sets',FiremakingBonfire:'Bonfires',RanchingAnimalVariant:'Ranching',AgilityCourse:'Agility',AgilityTechnique:'Agility'})[n.type]||'Other Skills';
}
function readerBoosters(skill) {
  const pool=readerBoosterPool(skill),cats=['XP','Action Time','Success and Accuracy','Action Progress','Resources','Other Bonuses'];
  const groups=[...new Set(pool.map(({node})=>readerBoosterType(node)))].sort(collator.compare);
  return groups.map(group=>{
    const sources=pool.filter(({node})=>readerBoosterType(node)===group);
    const tables=cats.map(cat=>{
      const rows=sources.flatMap(({node,mods})=>{
        const selected=mods.filter(m=>readerCategory(m.Stat?.Name||m.StatGroup)===cat);
        if(!selected.length)return [];
        const effect=selected.map(m=>m.Stat?wikiBonusText(m,node):wikiAllBonusText({Global:[m]},node)).join('<br>');
        return [{node,effect}];
      }).sort((a,b)=>wikiLevel(a.node)-wikiLevel(b.node)||collator.compare(a.node.name,b.node.name));
      return rows.length?'<h4>'+escape(cat)+'</h4>'+table(['Source','Effect','Requirements'],rows.map(({node,effect})=>[readerBoosterName(node),effect,readerBoosterRequirements(node)]),true):'';
    }).join('');
    return '<h3 id="boost-'+group.toLowerCase().replaceAll(' ','-')+'">'+escape(group)+'</h3>'+tables;
  }).join('');
}
function readerBoosterRequirements(n) {
  let req=guideV2Html(requirements(n));
  if(n.type==='AstrologyNode'){
    const c=(byType.get('AstrologyConstellation')||[]).find(c=>bare(n.id).startsWith(bare(c.id)));
    if(c)req=guideV2Html(requirements(c))+(req!=='—'?'<br>'+req:'');
  }
  if(n.type==='Pet')return wikiPetChance(n);
  if(n.type==='Item'&&req==='—'){
    const source=(incoming.get(n.key)||[]).find(r=>r.role==='source'&&['ArtisanRecipe','HerbloreRecipe','ShopPurchase'].includes(r.from.type));
    if(source)req=guideV2Html(requirements(source.from));
  }
  return req;
}
function readerBoostedRate(r,level,id,modifiers) {
  const n=guideV2Node(r),d=n.data,values={};
  const relevant=/XP|Interval|MaxHealth|DoubleDamage|InstantCut|WeakSpot|SkipStep|Break|Shatter|Stealth|Perception|Stages|Proficiency|Success/i;
  for(const m of modifiers){
    let name=m.Stat?.Name||m.StatGroup;
    if(!relevant.test(name))continue;
    if(m.Condition||m.Scaling||m.FromContext)return null;
    const context=m.LocalContext||{};
    let match=true;for(const [k,v]of Object.entries(context))if(k!=='Component'&&v){if(k==='Recipe'||k==='Constellation')match&&=v===r.id;else if(k==='Category')match&&=v===d.Category;else return null;}
    if(!match)continue;
    name=({GlobalPercentXpGained:'PercentXPGained',GlobalPercentActionInterval:'PercentInterval',GlobalFlatActionInterval:'FlatInterval'})[name]||name;
    values[name]=(values[name]||0)+m.Value;
  }
  const v=k=>values[k]||0,clamp=p=>Math.max(0,Math.min(1,p)),xp=(r.xp+v('FlatXPGained'))*(1+v('PercentXPGained'));
  const known=new Set(['FlatXPGained','PercentXPGained','FlatInterval','PercentInterval']);
  let seconds=r.seconds,success=r.successChance??1;
  if(id==='Woodcutting'){
    ['FlatMaxHealth','PercentMaxHealth','DoubleDamageChance','InstantCutChance','WeakSpotChance'].forEach(x=>known.add(x));
    const hp=Math.max(1,Math.ceil((d.BaseMaxHealth+v('FlatMaxHealth'))*(1+v('PercentMaxHealth')))),weakDamage=3+Math.floor(.1*hp),e=[0],dbl=clamp(v('DoubleDamageChance')),inst=clamp(v('InstantCutChance')),weak=clamp(v('WeakSpotChance'));
    for(let h=1;h<=hp;h++)e[h]=h===1?1:1+(1-inst)*((1-weak)*(1-dbl)*e[Math.max(0,h-1)]+(1-weak)*dbl*e[Math.max(0,h-2)]+weak*(1-dbl)*e[Math.max(0,h-weakDamage)]+weak*dbl*e[Math.max(0,h-2*weakDamage)]);
    seconds=e[hp]*(d.BaseInterval*(1+v('PercentInterval'))+v('FlatInterval'))/1000;
  }else if(id==='Thieving'){
    ['FlatStealth','PercentStealth','FlatPerception','PercentPerception','FlatStages','SkipStageChance','StunAvoidanceChance','FlatStunInterval','PercentStunInterval'].forEach(x=>known.add(x));
    const stealth=Math.max(0,Math.floor((level+v('FlatStealth'))*(1+v('PercentStealth')))),perception=Math.max(0,Math.floor((d.Perception+v('FlatPerception'))*(1+v('PercentPerception'))));
    success=Math.min(1,(100+stealth)/(100+perception));const stages=Math.max(1,d.Stages+Math.trunc(v('FlatStages'))),e=[0],skip=clamp(v('SkipStageChance'));
    for(let s=1;s<=stages;s++)e[s]=1+(1-skip)*e[s-1]+skip*e[Math.max(0,s-2)];
    seconds=e[stages]*((d.BaseInterval+v('FlatInterval'))*(1+v('PercentInterval'))/1000+(1-success)*(1-clamp(v('StunAvoidanceChance')))*(2000+v('FlatStunInterval'))*(1+v('PercentStunInterval'))/1000)/success;success=1;
  }else if(id==='Herblore'){
    seconds=0;for(const phase of ['Preparing','Heating','Stirring','Bottling']){known.add('Flat'+phase+'Interval');known.add('Percent'+phase+'Interval');seconds+=(phase==='Bottling'?10:1)*(d['Base'+phase+'Interval']*(1+v('Percent'+phase+'Interval'))+v('Flat'+phase+'Interval'))/1000;}
    if(v('PercentInterval')||v('FlatInterval'))return null;
  }else if(n.type==='ArtisanRecipe'){
    known.add('SkipStepChance');const e=[0],skip=clamp(v('SkipStepChance'));for(let s=1;s<=Math.max(1,d.Steps);s++)e[s]=1+(1-skip)*e[s-1]+skip*e[Math.max(0,s-2)];seconds=e.at(-1)*(d.BaseInterval*(1+v('PercentInterval'))+v('FlatInterval'))/1000;
  }else{
    if(v('FlatInterval')&&!['Firemaking','Astrology','Cooking','Fishing'].includes(id))return null;
    const actions=r.expectedActionsPerReward||1;seconds=r.seconds*(1+v('PercentInterval'))+actions*v('FlatInterval')/1000;
    if(id==='Cooking')success=Math.min(1,(69+level)/(69+d.Difficulty));
  }
  if(Object.keys(values).some(k=>!known.has(k)))return null;
  return seconds>0?xp*success/seconds:null;
}
function readerRateExamples(id) {
  const rs=readerCandidates(id).filter(r=>r.level<=99);if(!rs.length)return '';
  const skill=publicNode('Skill',id),base=Math.max(...rs.map(r=>readerRate(r,99,id))),rows=[];
  for(const {node,mods}of readerBoosterPool(skill)){
    if(node.type==='EquipmentSetBonus'||guideV2Level(node,id)>99)continue;
    const evaluated=rs.map(r=>({r,rate:readerBoostedRate(r,99,id,mods)})).filter(x=>Number.isFinite(x.rate)).sort((a,b)=>b.rate-a.rate),best=evaluated[0];
    if(best&&best.rate>base+1e-6)rows.push({node,action:best.r,rate:best.rate,effect:mods.filter(m=>['XP','Action Time','Action Progress','Success and Accuracy'].includes(readerCategory(m.Stat?.Name||m.StatGroup))).map(m=>m.Stat?wikiBonusText(m,node):wikiAllBonusText({Global:[m]},node)).join('<br>')});
  }
  rows.sort((a,b)=>b.rate-a.rate||collator.compare(a.node.name,b.node.name));
  const chosen=[];for(const row of rows){const group=readerBoosterType(row.node);if(chosen.filter(r=>readerBoosterType(r.node)===group).length<3)chosen.push(row);}
  if(!chosen.length)return '';
  return '<p>At level 99, the fastest unboosted action gives '+guideV2Num(base,' XP/s')+'. These are the largest calculated improvements in each source group, applied one source at a time. Meet its requirements before using it.</p>'+table(['Source','Effect','Train on','XP/s','Gain','Requirements'],chosen.map(r=>[readerBoosterName(r.node),r.effect,guideV2Link(r.action),guideV2Num(r.rate),guideV2Num((r.rate/base-1)*100,'%'),readerBoosterRequirements(r.node)]),true)+'<p>Each row tests one source on its own. Conditional effects, complete equipment sets and unsupported mechanics are listed below without a calculated XP/s.</p>';
}
function publicGuides(id) {
  if(!id){main.innerHTML='<h1>Skill Training Guides</h1>'+table(['Skill','Training guide'],(byType.get('Skill')||[]).map(s=>[link(s,true),'<a href="'+route('guide',{id:bare(s.id)})+'">'+escape(s.name)+'/Training</a>']),true);return;}
  id=bare(id);const skill=publicNode('Skill',id);if(!skill)return;
  const notes=readerNotes(id),supply=readerCandidates(id).some(r=>r.acquisition?.status==='complete within restricted model'),rates=readerCandidates(id).length;
  const comparison=rates?readerRateExamples(id):'';
  const sections=[['leveling','Training (1–99)'],...(supply?[['supplies','Starting without supplies']]:[]),...(comparison?[['comparison','Which upgrades help most?']]:[]),['boosters','Boosters']];
  main.innerHTML='<article class="training-guide-v2 reader-guide"><h1>'+escape(skill.name)+'/Training</h1><p class="guide-back">&lt; '+link(skill,true)+'</p><p class="guide-caption">For recipes, drops and unlocks, see '+link(skill,true)+'.</p>'+wikiContents(sections)+wikiSection('leveling','Training (1–99)',readerTraining(id))+(supply?wikiSection('supplies','Starting without supplies',readerSupplyRoute(id)):'')+(comparison?wikiSection('comparison','Which upgrades help most?',comparison):'')+wikiSection('boosters','Boosters','<p>'+readerText(notes[2])+'</p>'+readerBoosters(skill))+'<details class="guide-calculation"><summary>How the rates are calculated</summary>'+guideV2Method(id)+(id==='Thieving'?'<p>Success = min(1, (100 + level) / (100 + perception)). Expected cycle = stages × (action time + failure chance × stun time) / success chance.</p>':'')+'</details></article>';
  const anchor=main.querySelector('.wiki-toc a[data-jump="boosters"]');
  if(anchor){const list=document.createElement('ol');for(const heading of main.querySelectorAll('#boosters > h3')){const li=document.createElement('li'),a=document.createElement('a');a.href='#'+heading.id;a.dataset.jump=heading.id;a.textContent=heading.textContent;li.append(a);list.append(li);}anchor.closest('li').append(list);}
}
