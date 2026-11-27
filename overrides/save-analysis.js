function wikiSaveLevel(xp) {
  let level = 1;
  while (level < 99 && xp >= trainingXP(level+1)) level++;
  return level;
}

function wikiSaveProfile(save) {
  const levels = new Map([...save.skills].map(([id,xp]) => [id,wikiSaveLevel(xp)]));
  const levelFor = id => levels.get(saveShort(id || '')) || 0;
  const stock = new Map(), petIds = new Set(), nodes = new Set(), equipped = new Set();
  const sumStock = (id,qty) => stock.set(id,(stock.get(id)||0)+qty);
  for (const {items} of save.bank) for (const item of items) if (!item.placeholder && item.quantity > 0) sumStock(item.id,item.quantity);
  for (const pets of save.pets.values()) for (const [id,unlocked] of pets) if (unlocked) petIds.add(id);
  for (const c of save.astrology.values()) for (const id of [...c.minor,...c.major]) nodes.add(id);
  for (const item of save.equipment.slots.values()) equipped.add(item.id);
  function statistic(d) {
    const target = d.Item ?? d.Event ?? d.Course ?? d.Enemy ?? d.Species ?? d.Animal ?? d.Master ?? d.Constellation ?? d.Currency;
    for (const {values,groups} of save.stats.values()) {
      if (values.has(d.Statistic)) return values.get(d.Statistic);
      if (!groups.has(d.Statistic)) continue;
      const rows = groups.get(d.Statistic);
      return target ? rows.get(target)||0 : [...rows.values()].reduce((a,b)=>a+b,0);
    }
    return 0;
  }
  const mastery = new Map();
  function test(requirement,node) {
    const d = requirement.Data || {};
    const type = bare(requirement.Type);
    if (type === 'Level') return levelFor(d.Component?.Entity) >= d.Level;
    if (type === 'DemoLocked') return !save.demo;
    if (type === 'ShopPurchase') return (save.shop.get(d.ShopPurchase) || 0) >= (d.Amount ?? 1);
    if (type === 'PetUnlocked') return petIds.has(d.Pet);
    if (type === 'QuestCompleted') return save.quests.get(d.Quest)?.status === 3;
    if (type === 'QuestStepCompleted') return save.quests.get(d.Quest)?.steps.get(d.Step ?? d.QuestStep)?.status === 2;
    if (type === 'QuestTaskCompleted') return save.quests.get(d.Quest)?.steps.get(d.Step ?? d.QuestStep)?.tasks.get(d.Task ?? d.QuestTask)?.status === 2;
    if (type === 'AstrologyMajorNodeUnlocked' || type === 'AstrologyMinorNodeUnlocked') return nodes.has(d.MajorNode || d.MinorNode);
    if (/^Astrology(Major|Minor)NodeUnlockCount$/.test(type)) {
      const found=save.astrology.get(d.Constellation);
      return (found?.[type.includes('Major')?'major':'minor']?.length||0) >= d.Count;
    }
    if (type === 'MasteryGuildRank') {
      const current = mastery.get(saveShort(d.Component?.Entity||''));
      return current?.ranks.some(rank=>rank.id===d.Rank);
    }
    if (type === 'ToolbeltItemEquipped') {
      const slots = save.toolbelts.get(saveShort(d.Component?.Entity || node.skill || ''));
      return slots && [...slots.values()].some(item => item.id===d.Item && Math.max(1,item.quantity)>=(d.Quantity??1));
    }
    if (type === 'EquipmentItemEquipped') return [...save.equipment.slots.values()].some(item => item.id===d.Item && Math.max(1,item.quantity)>=(d.Quantity??1));
    if (type.endsWith('Statistic')) return statistic(d) >= d.Value;
    return false;
  }
  for (const [id,entries] of save.mastery) {
    const skill = publicNode('Skill',id);
    if (!skill) continue;
    let points = 0, total = 0;
    for (const task of wikiOwned(skill,'MasteryGuildTask')) {
      const value = publicNode('MasteryGuildCategory',task.data.Category)?.data.BasePoints||0;
      const saved = entries.get(task.id);
      total += value;
      if (!saved || (task.data.TriggerGoal && !saved.trigger)) continue;
      if (task.data.Goal ? saved.complete : !task.data.ConditionGoal || test(task.data.ConditionGoal,task)) points += value;
    }
    if (!total) continue;
    const ranks=wikiOwned(skill,'MasteryGuildRank')
      .filter(rank=>points>=Math.ceil(total*rank.data.PointPercentRequired))
      .sort((a,b)=>a.data.PointPercentRequired-b.data.PointPercentRequired);
    mastery.set(id,{points,total,ranks});
  }
  function eligible(node,skill) {
    const places = [['Location','HuntingLocation'],['Location','FishingLocation'],['Location','AgilityLocation'],['Category','ThievingLocation']];
    function pass(entry,gates) {
      const groups = [];
      for (const gate of gates) {
        const match = Boolean(test(gate,{...entry,skill:skill || entry.skill || ({ThievingRecipe:'Thieving',FishingRecipe:'Fishing',HuntingRecipe:'Hunting'})[entry.type]}));
        if (gate.Data?.IsOr && groups.length) groups[groups.length-1] ||= match;
        else groups.push(match);
      }
      return groups.every(Boolean);
    }
    const checked = entry => [guideV2ReqList(entry),entry.data.SecondaryRequirements||[],entry.data.DisplayRequirements||[]]
      .every(gates => pass(entry,gates));
    return checked(node) && places.every(([field,type]) => {
      const location = publicNode(type,node.data[field]);
      return !location || checked(location);
    });
  }
  return {levelFor,stock,petIds,nodes,equipped,eligible,mastery};
}

function wikiSaveMining(save,profile) {
  const tools = new Set([...(save.toolbelts.get('Mining')||new Map()).values()].map(item=>item.id));
  const sources = miningBoosterSources().pool.filter(({node,charges})=>!charges&&(
    node.type==='Item' && tools.has(node.id) ||
    node.type==='Pet' && profile.petIds.has(node.id) ||
    node.type==='ShopPurchase' && save.shop.get(node.id)>0 ||
    node.type==='AstrologyNode' && profile.nodes.has(node.id) ||
    node.type==='MasteryGuildBonus' && profile.eligible(node,'Mining')));
  const cycles = new Map();
  return rock => {
    if (cycles.has(rock.id)) return cycles.get(rock.id);
    const values = {};
    for (const {mods} of sources) for (const {mod,key} of mods) {
      const scope = mod.LocalContext || {};
      if (['Recipe','Category','Subcategory'].some(field=>scope[field]&&scope[field]!== (field==='Recipe'?rock.id:rock.data[field]))) continue;
      const scale = mod.Scaling?.Data?.Experience?.Entity;
      if (mod.Scaling && !scale) continue;
      values[key]=(values[key]||0)+mod.Value*(scale?profile.levelFor(scale):1);
    }
    const cycle = miningCycle(rock,values);
    cycles.set(rock.id,cycle);
    return cycle;
  };
}

function wikiSaveThievingMods(save,profile,node) {
  const toolbelt = save.toolbelts.get('Thieving') || new Map();
  const equipped = [...toolbelt.values()].map(item => publicNode('Item',item.id)).filter(Boolean);
  const sources = [
    ...equipped.map(item => item.data.Capabilities?.['MelvorBase:Toolbelt']),
    ...[...profile.petIds].map(id => publicNode('Pet',id)?.data),
    ...[...profile.nodes].map(id => publicNode('AstrologyNode',id)?.data)
  ];
  const supported = new Set(['FlatStealth','PercentStealth','FlatPerception','PercentPerception','FlatInterval','PercentInterval',
    'FlatStunInterval','PercentStunInterval','FlatStages','SkipStageChance','StunAvoidanceChance','FlatFortune',
    'FlatFortuneUnderSuccess','DoublingChance','PercentCurrencyLootChance','FlatCurrencyReward','PercentCurrencyReward',
    'DamageAvoidanceChance','PercentCommonLootChance','PercentRareLootChance','PercentXPGained','FlatXPGained']);
  const mods = {};
  for (const source of sources) {
    if (source?.ConsumesOn?.length) continue;
    for (const mod of source?.Bonuses?.Component || []) {
      const stat = mod.Stat?.Name, context = mod.LocalContext || {};
      if (!supported.has(stat) || !Number.isFinite(mod.Value) || mod.Condition || mod.Scaling || mod.FromContext) continue;
      const scope = {Recipe:node.id,Category:node.data.Category,RecipeType:node.data.RecipeType};
      if (Object.entries(context).some(([key,value]) => {
        if (!value) return false;
        if (key === 'Component') return saveShort(value.Entity || (typeof value==='string' ? value : '')) !== 'Thieving';
        return scope[key] !== value;
      })) continue;
      mods[stat] = (mods[stat]||0)+mod.Value;
    }
  }
  return mods;
}

function wikiSaveMoneyBoosters(save,profile) {
  const pools = new Map();
  const supported = /^(?:DoublingChance|FlatFishChance|IncreasedFishChance|JunkRerollChance|SecondSpecialItemChance|(?:Flat|Increased)SpecialProductChance|FlatSpecialProductQuantity|(?:Flat|Percent)(?:Min|Max)?Interval|GlobalPercentActionInterval|(?:Flat|Percent)ProductQuantity|PreservationChance|PercentIngredientCost|SkipStepChance|DoubleDamageChance|InstantCutChance|WeakSpotChance|(?:Flat|Percent)MaxHealth)$/;
  return ({skill,n}) => {
    if (!pools.has(skill)) {
      const tools = new Set([...(save.toolbelts.get(skill)||new Map()).values()].map(item=>item.id));
      pools.set(skill,readerBoosterPool(publicNode('Skill',skill)).filter(({node}) => {
        if (node.type==='Item') return tools.has(node.id)&&!node.data.Capabilities?.['MelvorBase:Toolbelt']?.ConsumesOn?.length;
        if (node.type==='AstrologyNode') return profile.nodes.has(node.id);
        if (node.type==='Pet') return profile.petIds.has(node.id);
        if (node.type==='ShopPurchase') return save.shop.get(node.id)>0;
        return node.type==='MasteryGuildBonus' && profile.eligible(node,skill);
      }));
    }
    const scope = {Recipe:n.id,Category:n.data.Category,Subcategory:n.data.Subcategory,Location:n.data.Location,RecipeType:n.data.RecipeType};
    return pools.get(skill).map(({node,mods})=>({node,mods:mods.filter(m=>
      supported.test(m.Stat?.Name||m.StatGroup) && !m.Condition && !m.Scaling && !m.FromContext &&
      Object.entries(m.LocalContext||{}).every(([k,v])=>!v||k==='Component'||k==='Item'||scope[k]===v))
    })).filter(x=>x.mods.length);
  };
}

function wikiSaveAdvice(save) {
  const profile = wikiSaveProfile(save);
  profile.mining = wikiSaveMining(save,profile);
  const model = moneySourceModel(null,null,null,false,profile);
  const getBoosters = wikiSaveMoneyBoosters(save,profile);
  const training = new Map(), gold = [];
  for (const [skill,xp] of save.skills) {
    if (['Farming','Ranching','Agility','Hunting'].includes(skill)) continue;
    const level = profile.levelFor(skill), target = level<99 ? trainingXP(level+1)-xp : null;
    const candidates = [];
    for (const action of readerCandidates(skill)) {
      const node = guideV2Node(action);
      if (!node || action.level>level || !profile.eligible(node,skill)) continue;
      const items = moneyRecurringInputs(node);
      const currencies = node.data.Ingredients?.Currencies || [];
      if (!items) continue;
      const stockActions = Math.min(Infinity,...items.map(item => Math.floor((profile.stock.get(item.Item)||0)/item.Quantity)),
        ...currencies.map(c => {
          const id = saveShort(c.Currency), balance = save.wallet.get(id) ?? (id==='GoldPieces' ? save.gold : 0n);
          return Math.floor(Number(balance)/c.Quantity);
        }));
      const mods = skill==='Thieving' ? wikiSaveThievingMods(save,profile,node) : null;
      const mining = skill==='Mining' ? profile.mining(node) : null;
      const activeRate = mining?.rate ?? (mods
        ? Math.max(0,(action.xp+(mods.FlatXPGained||0))*(1+(mods.PercentXPGained||0)))/thievingTiming(node,level,mods).seconds
        : readerRate(action,level,skill));
      const earnedXP = mining?.xp ?? (skill==='Cooking' ? action.xp*moneySuccess({skill,n:node},level) :
        mods ? Math.max(0,(action.xp+(mods.FlatXPGained||0))*(1+(mods.PercentXPGained||0))) :
        action.xp*(action.successChance??1));
      if (!(activeRate>0) || !(earnedXP>0)) continue;
      const activeTime = earnedXP/activeRate;
      const inputs = items.map(item => ({qty:item.Quantity,path:model.paths.get(item.Item)}));
      const cash = currencies.reduce((sum,c)=>sum+(saveShort(c.Currency)==='GoldPieces'?c.Quantity:0),0);
      let supply = currencies.some(c => saveShort(c.Currency)!=='GoldPieces') || inputs.some(i => !i.path) ? null : {inputs,cash};
      if (mods && supply) {
        const food = thievingFood(node,thievingTiming(node,level,mods),mods,() => model);
        supply = food && {inputs:food.inputs,cash:food.cash};
      }
      let sustain = 0, prep = 0;
      if (supply) {
        const cost = supply.cash+inputs.reduce((sum,i)=>sum+i.qty*i.path.cash,0);
        if (!cost || model.gpPerSecond>0) {
          prep = supply.inputs.reduce((sum,i)=>sum+i.qty*i.path.seconds,0)+(cost ? cost/model.gpPerSecond : 0);
          const extraXP = moneyRouteSteps(supply.inputs).reduce((sum,{path,qty}) => path.entry?.skill===skill
            ? sum+qty/path.qty*(path.node.data.BaseExperience||0)*moneySuccess(path.entry,level)
            : sum,0);
          sustain = (earnedXP+extraXP)/(activeTime+prep);
        }
      }
      const stockXP = stockActions*earnedXP;
      const remaining = target==null ? 0 : Math.max(0,target-stockXP);
      const time = target==null || (mods&&!sustain) ? null :
        mods ? target/sustain : Math.min(target,stockXP)/activeRate+(remaining ? (sustain>0 ? remaining/sustain : Infinity) : 0);
      candidates.push({node,activeRate,sustain,activeTime,prep,stockActions,time,level,inputs:supply?.inputs||[]});
    }
    if (candidates.length) training.set(skill,candidates.sort((a,b) => {
      const timeA = a.time ?? Infinity, timeB = b.time ?? Infinity;
      return (timeA===timeB ? 0 : timeA-timeB) || b.sustain-a.sustain || b.activeRate-a.activeRate;
    }));
  }
  for (const entry of moneyRows()) {
    if (entry.group==='Combat' || entry.level>profile.levelFor(entry.skill) || !profile.eligible(entry.n,entry.skill)) continue;
    const level = profile.levelFor(entry.skill);
    const ingredients = entry.n.data.Ingredients || {};
    if (ingredients.Currencies?.some(c => saveShort(c.Currency)!=='GoldPieces')) continue;
    const recurring = moneyRecurringInputs(entry.n);
    if (!recurring) continue;
    const inputs = recurring.map(i => ({qty:i.Quantity,path:model.paths.get(i.Item)}));
    if (inputs.some(i => !i.path)) continue;
    const mining = entry.skill==='Mining' ? profile.mining(entry.n) : null;
    const active = mining?.active ?? entry.seconds;
    let cycle = entry.group==='Thieving'
      ? moneyThievingCycle(entry.n,level,wikiSaveThievingMods(save,profile,entry.n),model)
      : {gp:mining ? mining.quantity*moneyQuote(entry.n.data.Product.Item) : entry.gross*moneySuccess(entry,level),actionSeconds:active,inputs,
        cash:(ingredients.Currencies||[]).reduce((sum,c)=>sum+c.Quantity,0)+inputs.reduce((sum,i)=>sum+i.qty*i.path.cash,0),
        seconds:active+inputs.reduce((sum,i)=>sum+i.qty*i.path.seconds,0)};
    let boosters = [];
    if (cycle && (entry.skill==='Fishing'||entry.skill==='Woodcutting'||entry.n.type==='ArtisanRecipe')) {
      boosters = getBoosters(entry);
      // A saved priority-catch choice is not decoded, so use ordinary fishing.
      const combined = moneyCombinationCycle(entry,level,boosters,cycle,false);
      if (combined && Number.isFinite(combined.gp) && combined.seconds>0) cycle = combined;
      else boosters = [];
    }
    const rate = moneyCycleHourly(cycle);
    if (rate>0 && Number.isFinite(rate)) gold.push({entry,cycle,rate,level,boosters});
  }
  return {profile,training,gold:gold.sort((a,b)=>b.rate-a.rate)};
}

function wikiSaveExpectedLoot(tables,excluded,record) {
  const byItem = new Map();
  for (const {Chance=1,Table=[]} of tables) {
    const total = Table.reduce((sum,item)=>sum+(item.Weight||0),0);
    if (!(total>0)) continue;
    const perTable = new Map();
    for (const item of Table) {
      if (!item.Item || !(item.Weight>0)) continue;
      const roll = (perTable.get(item.Item)||{p:0,units:0});
      const probability = Chance*item.Weight/total;
      const min = item.MinQuantity??item.Quantity??1, max = item.MaxQuantity??min;
      roll.p += probability*(min>0?1:max/(max+1));
      roll.units += probability*(min+max)/2;
      perTable.set(item.Item,roll);
    }
    for (const [id,values] of perTable) {
      const roll = byItem.get(id)||{miss:1,units:0};
      roll.miss *= 1-values.p;
      roll.units += values.units;
      byItem.set(id,roll);
    }
  }
  return [...byItem].filter(([id,{miss}]) => !excluded.has(id) && miss>0 && miss<1).map(([id,roll]) => {
    const observed = record.items.get(id)||0;
    return {id,observed,expected:record.count*roll.units,p:1-roll.miss,
      dry:observed===0 ? Math.exp(record.count*Math.log(roll.miss)) : null};
  });
}
