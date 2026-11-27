function combatStatModel(rows, levels) {
  const stats = new Map(), power = new Map(), protection = new Map();
  function add(map, key, value) { map.set(key,(map.get(key)||0)+value); }
  for (const row of rows.filter(Boolean)) {
    for (const x of row.Stats||[]) add(stats,x.Stat,x.Value);
    for (const x of row.PowerRatings||[]) add(power,x.DamageType,x.Value);
    for (const x of row.ProtectionRatings||[]) add(protection,x.DamageType,x.Value);
  }
  const stat = id => stats.get(namespaced(id))||0;
  const level = ratios => (ratios||[]).reduce((sum,x)=>sum+(levels[bare(x.Level)]||1)*x.Ratio,0);
  return {stats,stat,level,power,protection};
}

function combatPlannerBuild(input) {
  const equipment = input.equipment.map(item=>item.data.Capabilities['MelvorBase:Equipment']);
  const weapon = input.weapon?.data.Capabilities['MelvorBase:Weapon'];
  const stance = input.stance?.data;
  const style = publicNode('CombatStyle',stance?.CombatStyle)?.data;
  const unsupported = new Set(), invalid = [];
  const partial = note => unsupported.add(note);
  if (!weapon || !style) return {invalid:['Select a weapon and one of its stances.']};
  const ammo = input.equipment.find(item=>item.data.Capabilities['MelvorBase:Equipment'].Type==='MelvorBase:Ammo');
  const ammoId=ammo?.data.Capabilities['MelvorBase:Equipment'].AmmoType;
  const ammoRule=weapon.RequiredAmmoType;
  if (ammoRule && ![].concat(ammoRule).includes(ammoId)) invalid.push('Equip the ammunition this weapon requires.');
  if (style.UsesSpells && !input.spell) invalid.push('Select a spell for this magic stance.');
  const weaponCap=input.weapon.data.Capabilities['MelvorBase:Equipment'];
  if (weaponCap.OccupiesSlots?.some(slot=>input.slots.has(slot))) invalid.push('Remove the item occupying a slot reserved by the weapon.');
  const base=combatStatModel([...equipment.map(e=>e.Stats),style.UsesSpells?input.spell?.data.Stats:null],input.levels);
  const activeSets=(byType.get('EquipmentSetBonus')||[]).flatMap(set=>{
    const count=new Set(input.equipment.filter(item=>set.data.Items.includes(item.id)).map(item=>item.id)).size;
    return (set.data.Bonuses||[]).filter(tier=>tier.ItemCount<=count)
      .map(tier=>({label:set.name,bonuses:tier.Modifiers}));
  });
  const prayer=input.prayer?.data, food=input.food?.data.Capabilities?.['MelvorBase:Food'];
  const sources=[
    ...input.equipment.map((item,i)=>({label:item.name,bonuses:equipment[i].Bonuses})),
    {label:input.stance.name,bonuses:stance.Bonuses}, {label:input.prayer?.name,bonuses:prayer?.Bonuses},
    {label:input.food?.name,bonuses:food?.Bonuses},...activeSets
  ];
  const flatStats=new Map(), percentStats=new Map(), mods=new Map();
  const supported=new Set(['FlatAccuracyRating','PercentAccuracyRating','FlatMaxHit','PercentMaxHit','FlatMinHit','PercentMinHit',
    'FlatAttackInterval','PercentAttackInterval','PercentDamageDealt','PercentDamageTaken','FlatMaxHitpoints','PercentMaxHitpoints',
    'GlobalPercentXpGained','GlobalFlatAutoEatEfficiency','GlobalFlatAutoEatThreshold','GlobalFlatAutoEatLimit']);
  for (const {label,bonuses} of sources.filter(x=>x.bonuses)) {
    if (bonuses.CombatEffect?.length) partial(label+' has a combat effect');
    for (const m of [...(bonuses.Component||[]),...(bonuses.Global||[])]) {
      const name=m.Stat?.Name||m.StatGroup, scope=m.LocalContext||{};
      if (scope.CombatStyle && scope.CombatStyle!==stance.CombatStyle) continue;
      if (scope.AttackStance && scope.AttackStance!==input.stance.id) continue;
      const unhandled=Object.entries(scope).some(([k,v])=>v!=null&&!['Component','CombatStyle','AttackStance','CombatStat'].includes(k));
      if (m.Condition || m.Scaling || m.FromContext || unhandled) { partial(label+' has a conditional modifier'); continue; }
      let bucket=mods, key=name;
      if (name==='FlatCombatStatValue'||name==='PercentCombatStatValue') {
        bucket=name==='FlatCombatStatValue'?flatStats:percentStats;
        key=scope.CombatStat;
      } else if (!supported.has(name)) { partial(label+' has an unmodeled modifier'); continue; }
      if (key) bucket.set(key,(bucket.get(key)||0)+m.Value);
    }
  }
  if (weaponCap.Attacks?.length||input.spell?.data.AttackOverride) partial('Player special attacks');
  if (input.imbuement) partial(input.imbuement.name+' combat effect');
  if (input.equipment.some((item,i)=>equipment[i].ConsumesOn?.length&&equipment[i].Type!=='MelvorBase:Ammo')) partial('Equipment charge use');
  if (base.stat('MaximumWard')>0) partial('Player ward');
  const v=id=>mods.get(id)||0;
  const rating=id=>(base.stat(id)+(flatStats.get(namespaced(id))||0))*(1+(percentStats.get(namespaced(id))||0));
  const formula=style.MaxHitFormula.Data, level=base.level(formula.Levels);
  const raw=bare(style.MaxHitFormula.Type)==='StrengthBonus'
    ? 22+level+(level+17)*rating(formula.StrengthBonusStat)/64
    : rating(formula.MaxHitStat)*(1+rating(formula.DamageBonusStat))*(1+(level+1)/200);
  const element=style.UsesSpells?input.spell?.data.Element:weapon.Elements?.[0];
  if (bare(element)!=='Neutral') partial('Elemental matchup');
  const xp = Object.fromEntries(stance.ExperienceGain.map(x=>[bare(x.Component.Entity),x.ExperiencePerDamage*(1+v('GlobalPercentXpGained'))]));
  return {invalid,unsupported,activeSets,input,xp,style:bare(stance.CombatStyle),type:weapon.DamageType,
    max:Math.max(1,Math.floor(Math.floor(raw)*(1+v('PercentMaxHit'))+v('FlatMaxHit'))),
    min:Math.max(1,Math.floor(v('FlatMinHit')*(1+v('PercentMinHit')))),
    accuracy:Math.max(1,Math.floor(Math.floor((base.level(style.AccuracyRatingLevels)+9)*(64+rating(stance.AccuracyStat)))*(1+v('PercentAccuracyRating'))+v('FlatAccuracyRating'))),
    interval:Math.max(.25,Math.floor((rating(style.AttackIntervalStat)||3000)*(1+v('PercentAttackInterval'))+v('FlatAttackInterval'))/1000),
    hp:Math.max(1,Math.floor(input.levels.Hitpoints*10*(1+v('PercentMaxHitpoints'))+v('FlatMaxHitpoints'))),
    armour:Math.max(0,Math.floor(rating('Armour'))),power:Math.max(1,base.power.get(weapon.DamageType)||0),
    protection:type=>Math.max(0,base.protection.get(type)||0),
    evasion:incoming=>Math.max(1,Math.floor((base.level(publicNode('CombatStyle',incoming.CombatStyle).data.EvasionLevels)+9)*(64+rating(incoming.EvasionStat)))),
    defenceMod:v('PercentDamageTaken'),offenceMod:v('PercentDamageDealt'),
    threshold:input.tier?idleClamp(idleAutoEatRates()[input.tier]+v('GlobalFlatAutoEatThreshold'),1):0,
    eatLimit:idleClamp(1+v('GlobalFlatAutoEatLimit'),1),
    heal:input.tier&&food?Math.max(1,Math.floor(food.BaseHealing*(1+(input.tier-1)*.05+v('GlobalFlatAutoEatEfficiency')))):0,
    ammo:ammoRule&&ammoId?ammo:null,
    runes:style.UsesSpells?input.spell?.data.RuneCosts||[]:[]
  };
}

function combatHitProbability(accuracy,evasion) {
  return accuracy>=evasion ? 1-evasion/(2*accuracy) : accuracy/(2*evasion);
}

function combatRandom(seed) {
  return () => (seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
}

function combatPlannerLoot(target) {
  const d=target.data.Drops || {}, drops=new Map();
  let gp=0, loot=0;
  const record=(row,weight,fixed=false)=>{
    const p=drops.get(row.Item)||{units:0,miss:1};
    const quantity=moneyAverage(row);
    p.units+=quantity*weight;
    if(fixed) p.miss*=1-weight;
    drops.set(row.Item,p);
    loot+=moneyQuote(row.Item)*quantity*weight;
  };
  for (const row of d.FixedCurrencies||[]) if (bare(row.Currency)==='GoldPieces') gp+=moneyAverage(row);
  for (const row of d.FixedItems||[]) record(row,1,true);
  for (const {Chance=1,Table=[]} of d.ItemTables||[]) {
    const weights=new Map(), total=Table.reduce((sum,x)=>sum+(x.Weight||0),0);
    if (!(total>0)) continue;
    for (const row of Table) {
      const weight=Chance*(row.Weight||0)/total;
      record(row,weight);
      const low=row.MinQuantity??row.Quantity??1, high=row.MaxQuantity??low;
      weights.set(row.Item,(weights.get(row.Item)||0)+weight*(low>0?1:high/(high+1)));
    }
    for (const [id,p] of weights) drops.get(id).miss*=1-idleClamp(p,1);
  }
  return {gp,loot,drops};
}

function combatPlannerFight(target, area, player, trials, seed) {
  const stats=payload.monsters.enemies[bare(target.id)], raw=target.data;
  if (!stats?.maxHits?.length || !stats.attackSeconds || player.invalid.length) return null;
  const enemyStance=publicNode('AttackStance',raw.Stances[0]?.Stance)?.data;
  const enemyStyle=publicNode('CombatStyle',enemyStance?.CombatStyle)?.data;
  const stance=player.input.stance.data, battle=idleEncounter(target,area);
  if (!enemyStyle || raw.PauseOnSpawn || battle.immunities.has(player.style)||battle.immunities.has('All')) return null;
  const enemy=combatStatModel([raw.Stats],stats.levels);
  const probability=combatHitProbability(player.accuracy,Math.max(1,Math.floor((enemy.level(publicNode('CombatStyle',stance.CombatStyle).data.EvasionLevels)+9)*(64+enemy.stat(stance.EvasionStat)))));
  const incoming=combatHitProbability(Math.max(1,Math.floor((enemy.level(enemyStyle.AccuracyRatingLevels)+9)*(64+enemy.stat(enemyStance.AccuracyStat)))),player.evasion(enemyStance));
  const triangle=idleData().data('CombatTriangleBonus',player.style+'Vs'+bare(enemyStance.CombatStyle));
  const forSide=(name,side)=>triangle?.Bonuses?.Component?.find(x=>x.Stat?.Name===name&&bare(x.LocalContext?.Component?.Component)===side)?.Value||0;
  const resistance=(prot,power,side)=>idleClamp(idleClamp(prot/Math.max(1,power+prot),.7)*(1+forSide('ResistanceCombatTriangle',side)),1);
  const outFactor=(1+player.offenceMod)*(1-resistance(enemy.protection.get(player.type)||0,player.power,'Enemy'));
  const inFactor=(1+player.defenceMod)*(1-resistance(player.protection(raw.DamageType),stats.powerRating,'Player'));
  const playerMax=Math.max(1,Math.floor(player.max*(1+forSide('MaxHitCombatTriangle','Player'))));
  const enemyMax=Math.max(1,Math.floor(stats.maxHits[0].maxHit*(1+forSide('MaxHitCombatTriangle','Enemy'))));
  const advanced = [...player.unsupported];
  if (raw.Attacks?.length||raw.Passives?.length||area?.data.Passives?.length||area?.data.Effect||area?.data.Darkness||stats.ward||
      (raw.Element && bare(raw.Element)!=='Neutral')||battle.unresolved.size) advanced.push('Enemy or area has additional mechanics');
  const reward=combatPlannerLoot(target);
  if (advanced.length) return {node:target,area,advanced,reward,probability,incoming,benchmark:true,
    time:stats.hitpoints/(Math.max(1,(playerMax+player.min)/2*outFactor-stats.armour)*probability)*player.interval+3,
    xpDamage:stats.hitpoints};
  const random=combatRandom(seed), roll=(min,max)=>min+Math.floor(random()*(Math.max(min,max)-min+1));
  const threshold=idleRoundEven(player.hp*player.threshold);
  let seconds=0, deaths=0, kills=0, damage=0, food=0, swings=0, maxTaken=0, lowest=player.hp;
  for(let trial=0;trial<trials;trial++){
    let hp=player.hp,targetHP=stats.hitpoints,pa=player.armour,ea=stats.armour,nextP=player.interval,nextE=stats.attackSeconds;
    let time=0;
    const damageOf=(n,factor,armour)=>Math.max(1,Math.floor(n*factor-armour));
    for(let turn=0;hp>0&&targetHP>0&&turn<4000;turn++){
      if(nextP<=nextE){
        time=nextP;
        nextP+=player.interval;
        swings++;
        if(random()>=probability) continue;
        const hit=damageOf(roll(Math.min(player.min,playerMax),playerMax),outFactor,ea);
        damage+=Math.min(targetHP,hit);
        targetHP-=hit;
        if(hit>=ea) ea=0;
      }else{
        time=nextE;
        nextE+=stats.attackSeconds;
        if(random()>=incoming) continue;
        const hit=damageOf(roll(1,enemyMax),inFactor,pa);
        hp-=hit;
        maxTaken=Math.max(maxTaken,hit);
        lowest=Math.min(lowest,Math.max(0,hp));
        if(hit>=pa) pa=0;
        if (hp>0 && hp<=threshold && player.heal>0) {
          const units=Math.max(1,Math.floor((player.hp*player.eatLimit-hp)/player.heal));
          hp=Math.min(player.hp,hp+units*player.heal);
          food+=units;
        }
      }
    }
    if(targetHP>0&&hp>0) return null;
    seconds+=time+3;
    if(hp<=0) deaths++; else kills++;
  }
  return {node:target,area,advanced,reward,probability,incoming,time:seconds/trials,kills:kills/trials,
    deaths:deaths/trials,xpDamage:damage/trials,food:food/trials,swings:swings/trials,maxTaken,lowest,trials};
}
