/* Reader-focused training routes. Declarations only: safe before the initial render. */
function guideV2ReqList(n) {
  const d=n?.data||{},c=d.Capabilities||{};
  return [...(d.Requirements||[]),...(d.UnlockRequirements||[]),...(d.AccessRequirements||[]),...(c['MelvorBase:Equipment']?.Requirements||[]),...(c['MelvorBase:Toolbelt']?.Requirements||[])];
}
function guideV2Level(n,id) {
  return Math.max(1,...guideV2ReqList(n).filter(r=>bare(r.Type)==='Level'&&bare(r.Data?.Component?.Entity||'')===id).map(r=>r.Data.Level||1));
}
function guideV2Node(r) {return r?publicNode(r.type,r.id):null;}
function guideV2Link(r) {const n=guideV2Node(r);return n?link(n,true):escape(r?.name||'—');}
function guideV2Html(cell) {return cell&&typeof cell==='object'&&'html' in cell?cell.html:String(cell??'');}
function guideV2Num(v,suffix) {return Number.isFinite(v)?guideV2Html(numericCell(v,suffix||'',3)):'<span class="guide-unavailable">Not available</span>';}
function guideV2Quantity(xs) {return (xs||[]).map(x=>{const n=publicNode(x.Currency?'Currency':'Item',x.Item||x.Currency);return (n?link(n,true):escape(human(x.Item||x.Currency)))+' ×'+number(x.Quantity||1);}).join('<br>')||'None';}
function guideV2Effect(n) {
  const d=n.data,b=d.Bonuses||d.Capabilities?.['MelvorBase:Toolbelt']?.Bonuses||d.Capabilities?.['MelvorBase:Equipment']?.Bonuses||d.Provides?.Bonuses;
  return b?wikiAllBonusText(b,n):'See item stats and equipment requirements.';
}
function guideV2Requirements(n) {
  if(!n)return '—';
  const related=[];
  for(const [field,type] of [['Location','HuntingLocation'],['Location','FishingLocation'],['Location','AgilityLocation'],['Category','ThievingLocation']]){
    const p=publicNode(type,n.data[field]);
    if(p&&guideV2ReqList(p).length)related.push(link(p,true)+': '+guideV2Html(requirements(p)));
  }
  return guideV2Html(requirements(n))+(related.length?'<br>'+related.join('<br>'):'');
}
function guideV2Rate(r,lv,id) {
  if(id!=='Cooking')return r.xpPerSecond;
  const n=guideV2Node(r);return r.xp*Math.min(1,(69+lv)/(69+(n?.data.Difficulty||0)))/r.seconds;
}
function guideV2Ranges(g,id) {
  const rows=[];
  for(let lv=1;lv<=99;lv++){
    const pool=(g.rankings||[]).filter(r=>r.level<=lv);
    const best=pool.reduce((a,b)=>!a||guideV2Rate(b,lv,id)>guideV2Rate(a,lv,id)?b:a,null);
    const previous=rows[rows.length-1];
    if(previous&&previous.action?.id===best?.id)previous.to=lv;
    else rows.push({from:lv,to:lv,action:best});
  }
  return rows;
}
function guideV2RangeLabel(r) {return r.from===r.to?String(r.from):r.from+'–'+r.to;}
function guideV2Products(n,id) {
  const d=n?.data||{};
  if(id==='Astrology')return guideV2Num(d.BaseKnowledge,' knowledge per study');
  const products=[...(d.Products||[]),...(d.Product?[d.Product]:[])];
  if(products.length)return guideV2Quantity(products);
  if(d.RandomProducts?.length)return 'Possible catches: '+d.RandomProducts.map(p=>guideV2Ref('Item',p.Item)+(p.MinQuantity===p.MaxQuantity?' ×'+number(p.MinQuantity):' ×'+number(p.MinQuantity)+'–'+number(p.MaxQuantity))).join('<br>');
  return 'See action rewards';
}
function guideV2ActionAdvice(id,n) {
  const d=n?.data||{};
  if(id==='Hunting')return 'Track and trap with '+guideV2Ref('HuntingTool',d.Tool)+'. Bait: '+guideV2Ref('Item',d.PreferredBait)+'. Trap: '+guideV2Ref('HuntingTrapType',d.TrapType)+'.';
  if(id==='Farming')return 'Plant '+guideV2Quantity(d.Ingredients?.Items)+'. Keep other plots growing; retain seeds for the next planting.';
  if(id==='Ranching')return 'Raise animals only while feed is sustainable: '+guideV2Quantity(d.Eats)+'. Treats: '+guideV2Quantity((d.Treats||[]).slice(0,2))+'.';
  if(id==='Agility')return 'Practise this course to build technique XP. Meet obstacle technique requirements and keep food available.';
  if(id==='Thieving')return 'Try this target when unlocked; keep an earlier target if failures consume too much food. Base perception: '+number(d.Perception||0)+'; stages: '+number(d.Stages||1)+'.';
  if(id==='Slayer')return 'Take assignments from this master; complete assigned kills in '+(d.Areas||[]).map(x=>guideV2Ref('CombatArea',x)).join(', ')+'.';
  if(id==='Magic')return 'Compare this newly unlocked spell against enemy protection. Runes per cast: '+guideV2Quantity(d.RuneCosts)+'.';
  if(id==='Prayer')return 'Use when its bonuses fit your target. Cost: '+guideV2Quantity(d.Cost?[d.Cost]:[])+' per recorded consumption trigger; maintain a prayer-point supply.';
  if(id==='Woodcutting')return 'Cut until the next range. Keep logs needed for Firemaking and Fletching.';
  if(id==='Mining')return 'Mine this rock for base XP; retain ore or essence needed for your next crafting block.';
  if(id==='Fishing')return 'Fish this pool for XP. Choose an alternative pool when you need specific Cooking ingredients.';
  if(id==='Astrology')return 'Study this constellation for XP; choose another when its knowledge nodes support your next training block.';
  if(id==='Cooking')return 'Cook with banked ingredients. Improve proficiency if failures waste supplies.';
  if(id==='Firemaking')return 'Burn this fuel with banked supplies; compare the time needed to replace it.';
  if(id==='Herblore')return 'Brew with banked ingredients. Reserve useful charges and check catalyst consumption.';
  return 'Craft with banked ingredients. Keep useful outputs; compare material replacement time before a long block.';
}
function guideV2Ref(type,id) {const n=publicNode(type,id);return n?link(n,true):escape(id?human(id):'none required');}
function guideV2UnlockNodes(id) {
  const types={Hunting:'HuntingAnimal',Farming:'FarmingRecipe',Ranching:'RanchingAnimal',Agility:'AgilityCourse',Thieving:'ThievingRecipe',Slayer:'SlayerMaster',Magic:'MagicSpell',Prayer:'Prayer'};
  return (byType.get(types[id])||[]).filter(n=>!guideV2ReqList(n).some(r=>['QuestActive','QuestStage'].includes(bare(r.Type)))&&guideV2Level(n,id)<=99&&!/placeholder|undefined|\btest\b/i.test(n.name));
}
function guideV2UnlockRanges(id,nodes) {
  const levels=[...new Set([1,...nodes.map(n=>guideV2Level(n,id))])].sort((a,b)=>a-b);
  return levels.map((lv,i)=>({from:lv,to:i+1<levels.length?levels[i+1]-1:99,nodes:nodes.filter(n=>guideV2Level(n,id)===lv).sort((a,b)=>a.name.localeCompare(b.name))}));
}
function guideV2Combat(g,id) {
  const stances=(g.stances||[]).map(s=>'<strong>'+escape(s.name)+'</strong> ('+s.experienceGain.filter(x=>bare(x.Component.Entity)===id).map(x=>guideV2Num(x.ExperiencePerDamage,' XP/damage')).join(', ')+')').join('; ');
  const starter=guideV2Ref('Enemy','MelvorBase:Golbin');
  let body='<p>Select a stance that awards '+escape(id)+' XP: '+stances+'. Start with '+starter+' if you can sustain incoming damage, then use assigned Slayer targets or enemies whose drops fund your next upgrade.</p>';
  const gear=(byType.get('Item')||[]).filter(n=>{
    const c=n.data.Capabilities||{},e=c['MelvorBase:Equipment'];
    if(!e||!guideV2ReqList(n).some(r=>bare(r.Type)==='Level'&&bare(r.Data?.Component?.Entity||'')===id))return false;
    const weaponType=publicNode('WeaponType',c['MelvorBase:Weapon']?.Type),styles=(weaponType?.data.Stances||[]).map(s=>publicNode('AttackStance',s)?.data.CombatStyle);
    if(id==='Attack')return styles.includes('MelvorBase:Melee');
    if(id==='Ranged')return styles.includes('MelvorBase:Ranged');
    return id==='Defence';
  }).filter(n=>guideV2Level(n,id)<=99);
  if(gear.length){
    body+='<p>Ranges below mark equipment unlocks, rather than proven changes in fastest combat XP. Meet every listed requirement before switching.</p>';
    body+=table(['Levels','Equipment to compare','Training action','XP/s','Requirements'],guideV2UnlockRanges(id,gear).map(r=>{
      const ns=r.nodes.slice(0,3);return [guideV2RangeLabel(r),ns.map(n=>link(n,true)).join('<br>')||'Keep current equipment','Keep the '+escape(id)+' XP stance selected; test accuracy and food use against your target.',guideV2Num(null),ns.map(n=>guideV2Requirements(n)).join('<br>')||'—'];
    }),true);
  }else body+=table(['Levels','Training action','XP/s'],[['1–99','Use the XP stances above. Begin with '+starter+'; move to accessible Slayer assignments when sustainable. Upgrade weapon access alongside accuracy and food supply.',guideV2Num(null)]],true);
  return body+'<p>Combat XP/s needs your equipment, accuracy, enemy defenses, attack timing and food downtime. No target-independent rate is available.</p>';
}
function guideV2Progression(g,id) {
  if(g.rankings?.length){
    const rows=guideV2Ranges(g,id);
    return '<p>Use the highest base XP/s action available at your level, with ingredients already banked and <strong>all access requirements met</strong>. If a quest, location or secondary skill blocks it, keep the previous accessible action.</p><p>'+guideV2ActionAdvice(id,guideV2Node(rows.find(r=>r.action)?.action))+'</p>'+table(['Levels','Recommended action','Base XP/s',id==='Astrology'?'Knowledge':'Products','Requirements'],rows.map(r=>{
      const n=guideV2Node(r.action),first=r.action?guideV2Rate(r.action,r.from,id):null,last=r.action?guideV2Rate(r.action,r.to,id):null;
      return [guideV2RangeLabel(r),r.action?guideV2Link(r.action):'No modeled action unlocked',guideV2Num(first)+(id==='Cooking'&&Math.abs(last-first)>.0005?' → '+guideV2Num(last):''),n?guideV2Products(n,id):'—',guideV2Requirements(n)];
    }),true)+(id==='Cooking'?'<p>Cooking rates rise with skill level: arrows show the first and last level of each range, using base proficiency equal to Cooking level.</p>':'');
  }
  if(['Attack','Strength','Defence','Hitpoints','Ranged'].includes(id))return guideV2Combat(g,id);
  const nodes=guideV2UnlockNodes(id);
  return '<p>Follow these actual unlock ranges. Newly unlocked actions are options to try; a higher required level alone does not prove faster training. <strong>XP/s is unavailable</strong> for this skill’s full training cycle.</p>'+table(['Levels','New actions to use or compare','Practical recommendation','XP/s','Requirements'],guideV2UnlockRanges(id,nodes).map(r=>[
    guideV2RangeLabel(r),r.nodes.map(n=>link(n,true)).join('<br>')||'Continue your accessible action',r.nodes.length?r.nodes.map(n=>'<div class="guide-option">'+(r.nodes.length>1?'<strong>'+escape(n.name)+':</strong> ':'')+guideV2ActionAdvice(id,n)+'</div>').join(''):'Use the previous unlocked action and prepare its supplies.',guideV2Num(null),r.nodes.map(n=>'<div class="guide-option">'+(r.nodes.length>1?'<strong>'+escape(n.name)+':</strong> ':'')+guideV2Requirements(n)+'</div>').join('')||'—'
  ]),true);
}
function guideV2Gear(g,id) {
  const config=game.EntityConfig['MelvorBase:'+id]||{};
  const slotids=new Set((config.ToolbeltSlots||[]).map(x=>x.Id));
  if(['Attack','Strength','Defence','Hitpoints','Ranged','Magic','Prayer','Slayer'].includes(id))for(const x of game.EntityConfig['MelvorBase:Combat']?.ToolbeltSlots||[])slotids.add(x.Id);
  const fits=new Set((byType.get('ToolbeltSlot')||[]).filter(n=>slotids.has(n.id)).map(n=>n.data.FitsType));
  const groups=new Map();
  for(const n of byType.get('Item')||[]){const t=n.data.Capabilities?.['MelvorBase:Toolbelt'];if(!t||!fits.has(t.FitsInSlot)||!t.Bonuses)continue;const list=groups.get(t.FitsInSlot)||[];list.push(n);groups.set(t.FitsInSlot,list);}
  let gear=[],potions=[];
  for(const [slot,list] of groups){
    list.sort((a,b)=>guideV2Level(a,id)-guideV2Level(b,id)||a.name.localeCompare(b.name));
    const potion=/Potion/.test(slot),skill=publicNode('Skill',id);
    const options=list.length<=8?list.map(n=>'<div class="guide-option">'+link(n,true)+'<br>'+guideV2Effect(n)+'<br><span class="guide-gear-req">'+guideV2Requirements(n)+'</span></div>').join(''):'<a href="'+route('scheda',{id:skill?.key||'Skill/MelvorBase:'+id,section:potion?'pozioni':'strumenti'})+'">See all '+escape(human(slot))+' options</a> ('+number(list.length)+' items). Compare requirements and effects on the skill page.';
    const row=[escape(human(slot)),options];
    (/Potion/.test(slot)?potions:gear).push(row);
  }
  const text='<p>Compare attainable options in each compatible slot, ordered by required skill level. Slots with more than eight options link to the full skill tables. Conditional effects apply only to their named actions. Open an item for sources and full details.</p>';
  return {gear:text+(gear.length?table(['Slot','Equipment options and effects'],gear,true):'<p>No compatible toolbelt equipment is recorded. Compare combat equipment on the linked skill and item pages.</p>'),potions:'<p>Use a potion only when its benefit repays its ingredients and replacement time. Check the item’s consumption trigger; compatible potions are alternatives.</p>'+(potions.length?table(['Slot','Potion options and effects'],potions,true):'<p>No compatible potion is recorded for this skill.</p>')};
}
function guideV2Materials(g,id) {
  const routes=guideV2Ranges(g,id).filter(r=>r.action?.ingredients?.Items?.length);
  if(!routes.length)return '';
  return '<p><strong>Banked XP/s</strong> measures only the training action. <strong>Including inputs</strong> adds sequential gathering and supported crafting chains; it excludes combat, shops, Farming, Hunting and Ranching. Missing coverage stays unavailable. Parallel production and your existing stock can change the choice.</p>'+table(['Levels','Action','Inputs per cycle','Banked XP/s','XP/s including inputs'],routes.map(r=>{
    const a=r.action,ac=a.acquisition,complete=ac?.status==='complete within restricted model';
    return [guideV2RangeLabel(r),guideV2Link(a),guideV2Quantity([...(a.ingredients.Items||[]),...(a.ingredients.Currencies||[])]),guideV2Num(guideV2Rate(a,r.from,id)),complete?guideV2Num(a.xp*(id==='Cooking'?Math.min(1,(69+r.from)/(69+guideV2Node(a).data.Difficulty)):a.successChance)/ac.cycleSecondsIncludingInputs):'<span class="guide-unavailable">Not available — incomplete input sources</span>'];
  }),true);
}
function guideV2Method(id) {
  if(id==='Thieving')return '<p>Rates include successful and failed attempts, all stages and the base 2-second stun. Stealth equals skill level before bonuses. Food gathering, healing stops and timer rounding are excluded.</p>';
  const formulas={Woodcutting:'XP/s = cut XP ÷ (tree health × swing interval in seconds), with one base damage per swing.',Mining:'XP/s = break XP ÷ expected time to break, including early breaks and the guaranteed break from prospecting.',Fishing:'XP/s = action XP ÷ average fishing interval. Junk results still award action XP.',Cooking:'XP/s = recipe XP × min(1, (69 + Cooking level) ÷ (69 + difficulty)) ÷ cooking interval in seconds.',Herblore:'XP/s = recipe XP ÷ (preparing + heating + stirring + 10 × bottling time), with all times in seconds.',Astrology:'XP/s = base study XP ÷ study interval in seconds. Event interruptions and choices are excluded.',Firemaking:'XP/s = recipe XP ÷ base burn interval in seconds.'};
  const unsupported={Agility:'No sustained course XP/s is calculated: obstacle failures, techniques and recovery need a full course model.',Farming:'No farming XP/s is calculated: plots run in parallel, with crop care, disease and harvest behavior affecting the cycle.',Ranching:'No ranching XP/s is calculated: feed, maturity, satisfaction, products and lifespan need a full lifecycle model.',Hunting:'No hunting XP/s is calculated: tracking steps, tracking failures and trapping retries need a complete hunt model.',Thieving:'No sustained thieving XP/s is calculated: success, stages, stun time and damage affect the full cycle.',Slayer:'No Slayer XP/s is calculated: assignments, eligible kills and supply time depend on the chosen task.',Prayer:'No Prayer XP/s is calculated: experience and point consumption depend on the active prayer and combat context.'};
  const artisan=['Smithing','Crafting','Fletching','Runecrafting','Beastcrafting'].includes(id);
  const current=formulas[id]||unsupported[id]||(artisan?'XP/s = recipe XP ÷ (number of steps × base step interval in seconds).':'No combat XP/s is calculated: stance XP per damage, accuracy, attack timing, enemy defenses and food downtime depend on your setup.');
  return '<p>'+escape(current)+'</p><p>Base rates exclude equipment, mastery, temporary effects and timer rounding. Requirements remain binding; no bank stock, pets or purchases are assumed. Gathering time is included only where explicitly shown.</p>';
}
function publicGuides(id) {
  const guides=payload.guides?.skills||{};
  if(!id){main.innerHTML='<h1>Skill Training Guides</h1><p>Practical level ranges, equipment choices and supply planning for every Melvor Idle 2 skill. Each guide distinguishes calculated base rates from progression options without a verified XP model.</p>'+table(['Skill','Training guide'],(byType.get('Skill')||[]).filter(s=>guides[bare(s.id)]).map(s=>[link(s,true),'<a href="'+route('guide',{id:bare(s.id)})+'">'+escape(s.name)+' / Training</a>']),true);return;}
  id=bare(id);const g=guides[id],skill=publicNode('Skill',id);
  if(!g){main.innerHTML='<h1>Training Guide</h1><p>Guide analysis is unavailable.</p>';return;}
  const gear=guideV2Gear(g,id),materials=guideV2Materials(g,id),sections=[['leveling','Leveling 1–99'],['equipment','Equipment'],['potions','Potions']];
  if(materials)sections.push(['materials','Materials and gathering time']);
  if(g.otherBoosts?.length)sections.push(['boosts','Other bonuses']);
  sections.push(['method','Rate assumptions']);
  let out='<article class="training-guide-v2"><h1>'+escape(skill?.name||human(id))+' / Training</h1><p class="guide-lead">'+(skill?link(skill,true)+': ':'')+escape(g.intro.split('. ').slice(0,2).join('. '))+((g.intro.split('. ').slice(0,2).join('. ').endsWith('.'))?'':'.')+'</p>'+wikiContents(sections);
  out+=wikiSection('leveling','Leveling 1–99',guideV2Progression(g,id));
  out+=wikiSection('equipment','Equipment',gear.gear)+wikiSection('potions','Potions',gear.potions);
  if(materials)out+=wikiSection('materials','Materials and gathering time',materials);
  if(g.otherBoosts?.length)out+=wikiSection('boosts','Other bonuses','<p>Use bonuses you have unlocked; check conditions before applying them to a training block.</p>'+table(['Source','Effect','Requirements'],g.otherBoosts.map(e=>{const n=guideV2Node(e);return [guideV2Link(e),n?guideV2Effect(n):escape(e.reason),guideV2Requirements(n)];}),true));
  out+=wikiSection('method','Rate assumptions',guideV2Method(id))+'</article>';
  main.innerHTML=out;
}
