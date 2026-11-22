function dropRateLabels() {
  return {
    common:'Common loot chance (%)', rare:'Rare loot chance (%)', fish:'Fish catch chance (%)',
    specialFlat:'Special chance bonus (percentage points)', specialRelative:'Special chance increase (%)',
    secondSpecial:'Second special roll chance (%)', itemRate:'Item drop chance (%)'
  };
}

function dropEstimateMethod(ref) {
  const {from: node,path,parent} = ref, [root] = path, d = node.data;
  const low = parent?.MinQuantity ?? parent?.Quantity ?? (node.type === 'ItemUpgrade' ? d.QuantityPerUpgrade : 1);
  const high = parent?.MaxQuantity ?? low;
  if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low < 0 || high < low || high === 0) return null;
  const {p: indexed,basis} = lootReference(ref);
  let p = indexed, name = basis || 'per action', roll = path.join('/'), trigger = roll;
  let min = null, max = null, success = 100, stages = 1, rate;
  const tableIndex = path.indexOf('ItemTables');
  if (node.type === 'Enemy' || node.type === 'Dungeon' || node.type === 'Item') {
    if (node.type === 'Item' && path[1] !== 'MelvorBase:Openable') return null;
    if (node.type !== 'Item' && tableIndex < 0 && !path.includes('FixedItems')) return null;
    name = {Enemy:'per kill',Dungeon:'per clear',Item:'per opening'}[node.type];
    trigger = name;
    roll = tableIndex >= 0 ? path.slice(0,tableIndex+2).join('/') :
      path.includes('DropTable') ? 'random' : path.slice(0,-1).join('/');
  } else if (node.type === 'ThievingRecipe') {
    const completion = root === 'CompletionDropTable';
    if (!completion && !['CommonDropTable','RareDropTable'].includes(root)) return null;
    trigger = completion ? 'completion' : 'stage';
    roll = root;
    stages = completion ? Math.max(1,d.Stages || 1) : 1;
    min = d.BaseInterval / 1000;
    success = null;
    if (!completion) {
      const common = root === 'CommonDropTable';
      rate = {field:common?'common':'rare', base:d[common?'BaseCommonLootChance':'BaseRareLootChance'],
        weight:lootWeightedChance(d[root],parent)};
    }
  } else if (node.type === 'FishingRecipe') {
    if (!['RandomProducts','SpecialProducts','JunkItem'].includes(root)) return null;
    name = 'per cast';
    trigger = name;
    roll = root === 'SpecialProducts' ? 'special catch' : 'main catch';
    if (root === 'JunkItem') p = 1 - (d.BaseFishChance ?? d.FishChance);
    if (root !== 'SpecialProducts') {
      const junk = root === 'JunkItem';
      rate = {field:'fish',base:d.BaseFishChance ?? d.FishChance,
        weight:junk ? 1 : lootWeightedChance(d[root],parent), invert:junk};
    }
    min = d.BaseMinInterval / 1000;
    max = d.BaseMaxInterval / 1000;
  } else if (node.type === 'MiningRecipe') {
    if (['BarItem','StoneItem','EssenceItem'].includes(root)) {
      name = root === 'BarItem' ? 'per completed rock' : 'per hit';
      min = root === 'BarItem' ? payload.guides?.skills?.Mining?.rankings?.find(row=>row.id===node.id)?.seconds : d.BaseInterval/1000;
      p = 0;
      rate = {field:'itemRate',base:0,weight:1};
    } else if (root !== 'Product' && root !== 'RandomProductsPerHit') return null;
    else if (root === 'Product') {
      name = 'per completed rock';
      min = payload.guides?.skills?.Mining?.rankings?.find(row => row.id === node.id)?.seconds ?? null;
    } else {
      name = 'per hit';
      min = d.BaseInterval / 1000;
    }
  } else if (node.type === 'WoodcuttingRecipe') {
    name = root === 'RandomProductsPerHit' ? 'per hit' : 'per completed cut';
    min = root === 'RandomProductsPerHit' ? d.BaseInterval / 1000 : actionTime(node) / 1000;
  } else if (node.type === 'CookingRecipe') {
    name = 'per cook';
    min = actionTime(node) / 1000;
    success = null;
  } else if (node.type === 'ArtisanRecipe' || node.type === 'FiremakingRecipe') {
    min = actionTime(node) / 1000;
  } else if (node.type === 'RanchingAnimal') {
    name = 'per production cycle';
    min = d.ProductInterval / 1000;
  } else if (node.type === 'ShopPurchase') {
    if (root !== 'Provides') return null;
    name = 'per purchase';
  } else if (node.type === 'ItemUpgrade') {
    if (root !== 'UpgradedItem') return null;
    name = 'per upgrade';
    p = 1;
  } else if (node.type === 'AgilityCourse') {
    if (!['CompletionRewards','TimedCompletionRewards'].includes(root)) return null;
    name = root === 'TimedCompletionRewards' ? 'per timed clear' : 'per clear';
    p = root === 'TimedCompletionRewards' ? d[root]?.[path[1]]?.Chance : 1;
  } else if (node.type === 'HuntingAnimal' || node.type === 'FarmingRecipe') {
    if (node.type === 'HuntingAnimal') {
      if (root === 'SurveyingProducts') return null;
      name = 'per successful hunt';
    } else {
      name = 'per harvest';
      min = d.BaseInterval / 1000;
    }
  }
  if (Number.isFinite(p) && !rate &&
      ((node.type === 'MiningRecipe' || node.type === 'WoodcuttingRecipe') && /^RandomProductsPer/.test(root) ||
        (node.type === 'FiremakingRecipe' || node.type === 'HuntingAnimal') && root === 'Products')) {
    rate = {field:'itemRate',base:p,weight:1};
  }
  if (!(p > 0 && p <= 1) && !(p === 0 && rate && (rate.field === 'fish' || node.type === 'MiningRecipe'))) return null;
  if (!['Enemy','Dungeon','Item','ThievingRecipe','FishingRecipe'].includes(node.type)) {
    trigger = name;
    roll = path.slice(0,-1).join('/');
  }
  const timed = root === 'TimedCompletionRewards' ? d[root][path[1]].TimeInMS : null;
  return {node,p,min:Number.isFinite(min) && min>0 ? min : null,max:Number.isFinite(max) && max>0 ? max : null,timed,
    success,stages,name,roll,trigger,low,high,rate,
    specialId:node.type === 'FishingRecipe' && root === 'SpecialProducts' ? parent?.Item : null,
    limit:node.type === 'ShopPurchase' ? d.DefaultBuyLimit : null};
}

function dropEstimateSources(refs) {
  const buckets = new Map(), seen = new Set();
  for (const ref of refs) {
    const key = ref.from.key + '/' + ref.path.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const method = dropEstimateMethod(ref);
    if (!method) continue;
    const trigger = method.node.key + '/' + method.trigger;
    if (!buckets.has(trigger)) buckets.set(trigger,{...method,rolls:new Map()});
    const bucket = buckets.get(trigger);
    if (!bucket.rolls.has(method.roll)) bucket.rolls.set(method.roll,[]);
    bucket.rolls.get(method.roll).push({p:method.p,low:method.low,high:method.high,timed:method.timed,
      rate:method.rate,specialId:method.specialId});
  }
  const sources = [...buckets.values()].map(({rolls,...method}) => {
    method.rolls = [...rolls.values()];
    if (method.timed != null) {
      const entries = method.rolls.flat();
      method.tiers = method.node.data.TimedCompletionRewards.map(tier => ({
        time:tier.TimeInMS,
        rolls:entries.filter(row=>row.timed===tier.TimeInMS).map(row=>[row])
      })).sort((a,b)=>a.time-b.time);
      const first = method.tiers.find(tier=>tier.rolls.length);
      method.min = first.time/1000;
      method.rolls = first.rolls;
      method.p = method.rolls[0][0].p;
      return method;
    }
    method.p = dropRollChance(method.rolls);
    method.rates = Object.fromEntries(method.rolls.flat().flatMap(row => row.rate ? [[row.rate.field,row.rate.base]] : []));
    if (method.rolls.flat().some(row=>row.specialId)) Object.assign(method.rates,
      {specialFlat:0,specialRelative:0,secondSpecial:0});
    return method;
  });
  return sources.sort((a,b) => Number(a.p===0)-Number(b.p===0) || Number(a.p===1)-Number(b.p===1) ||
    collator.compare(a.node.name,b.node.name) || collator.compare(a.name,b.name));
}

function dropRollChance(rolls) {
  const probabilities = rolls.map(entries => Math.min(1,entries.reduce((sum,row) =>
    sum + row.p * (row.low ? 1 : row.high/(row.high+1)),0)));
  return probabilities.length === 1 ? probabilities[0] : -Math.expm1(
    probabilities.reduce((sum,p) => sum + Math.log1p(-p),0));
}

function dropAdjustedRolls(method, rates) {
  return method.rolls.map(entries => {
    const specialId = entries[0]?.specialId;
    if (specialId) {
      const products = (method.node.data.SpecialProducts || []).map(row=>({
        ...row, chance:Math.min(1,Math.max(0,row.Chance*(1+rates.specialRelative)+rates.specialFlat))
      })).sort((a,b)=>a.chance-b.chance);
      let remaining = 1, picked = 0;
      for (const row of products) {
        if (row.Item === specialId) picked += remaining*row.chance;
        remaining *= 1-row.chance;
      }
      const quantity = entries[0].low;
      const secondTarget = rates.secondSpecial*picked;
      return [
        {p:picked*(1-secondTarget)+Math.max(0,1-remaining-picked)*secondTarget,low:quantity,high:quantity},
        {p:picked*secondTarget,low:2*quantity,high:2*quantity}
      ];
    }
    return entries.map(row=>{
      if (!row.rate) return row;
      const {field,weight,invert} = row.rate;
      const value = rates[field];
      return {...row,p:(invert ? 1-value : value)*weight};
    });
  });
}

function dropEstimateAttempts(probability, confidence) {
  if (probability === 1) return 1;
  if (!(probability > 0 && probability < 1)) return null;
  const target = Math.log1p(-confidence), miss = Math.log1p(-probability);
  const attempts = Math.ceil(target/miss);
  if (!Number.isSafeInteger(attempts)) return null;
  if (attempts>1 && (attempts-1)*miss<=target) return attempts-1;
  return attempts*miss<=target ? attempts : attempts+1;
}

function dropEstimateTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds >= 86400) return number(seconds/86400) + ' d';
  if (seconds >= 3600) return number(seconds/3600) + ' h';
  if (seconds >= 60) return number(seconds/60) + ' min';
  return number(seconds) + ' s';
}

// The final bucket absorbs every outcome at or above the requested quantity.
function dropCombine(a, b, target) {
  const result = Array(target + 1).fill(0);
  for (let i = 0; i <= target; i++) {
    if (!a[i]) continue;
    for (let j = 0; j <= target; j++) {
      if (b[j]) result[Math.min(i+j,target)] += a[i]*b[j];
    }
  }
  return result;
}

function dropQuantityDistribution(rolls, target) {
  const identity = Array(target+1).fill(0);
  identity[0] = 1;
  return rolls.reduce((total, entries) => {
    const dist = Array(target+1).fill(0);
    dist[0] = Math.max(0,1-entries.reduce((sum,row)=>sum+row.p,0));
    for (const {p,low,high} of entries) {
      const each = p/(high-low+1);
      for (let i=low; i<Math.min(target,high+1); i++) dist[i] += each;
      if (high>=target) dist[target] += each*(high-Math.max(target,low)+1);
    }
    return dropCombine(total,dist,target);
  },identity);
}

function dropQuantityStats(rolls, target, success, probability, confidences) {
  if (target === 1) return {mean:1/probability, counts:confidences.map(c=>dropEstimateAttempts(probability,c))};
  const dist = dropQuantityDistribution(rolls,target).map(p=>p*success);
  dist[0] += 1-success;
  // Zero-item outcomes leave the remaining quantity unchanged.
  const mean = [0];
  for (let need = 1; need <= target; need++) {
    let before = 0;
    for (let i = 1; i < need; i++) before += dist[i]*mean[need-i];
    mean.push((1+before)/probability);
  }
  const powers = [dist];
  const state = Array(target+1).fill(0);
  state[0] = 1;
  const counts = confidences.map(confidence => {
    let index = powers.length-1;
    while (powers[index][target] < confidence && index < 52) {
      const step = powers[index];
      powers.push(dropCombine(step,step,target));
      index++;
    }
    if (powers[index][target] < confidence) return null;
    let count = 0;
    let incomplete = state;
    for (; index >= 0; index--) {
      const next = dropCombine(incomplete,powers[index],target);
      if (next[target] < confidence) {
        count += 2**index;
        incomplete = next;
      }
    }
    return count+1;
  });
  return {mean:mean[target],counts};
}

function dropEstimateMarkup(sources, xpFactor = 0) {
  const field = (name,label,min,max,step='any') => '<label>' + label + ' <input type="number" inputmode="' +
    (step === 1 ? 'numeric' : 'decimal') + '" name="' + name + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>';
  const source = xpFactor ? '' : '<label>Source <select name="source">' +
    sources.map(({node,name},i) => moneyOption(i,node.name+' · '+name,0)).join('') +
    moneyOption('custom','Custom rates',sources.length ? 0 : 'custom') + '</select></label>';
  const inputs = xpFactor ? '' : Object.entries(dropRateLabels()).map(([name,label]) =>
    field(name,label,name==='specialFlat'||name==='specialRelative' ? -100 : 0,name==='specialRelative' ? 100000 : 100)).join('');
  return '<form class="drop-estimate-form">' + source + '<div class="drop-estimate-fields">' +
    field('min','Action time (s)',0,1000000000) +
    field('max','Maximum time (s)',0,1000000000) +
    field('success','Action success (%)',0,100) +
    (xpFactor ? field('xp','XP per gain',0,1000000000) : field('chance','Drop chance (%)',0,100) +
      field('perDrop','Items per drop',1,1000000,1) + field('quantity','Quantity wanted',1,250,1)) +
    inputs + '</div></form><p class="drop-estimate-basis"></p><div class="drop-estimate-result" aria-live="polite"></div>';
}

function dropEstimateBind(sources, xpFactor = 0) {
  const section = main.querySelector('#drop-calculator');
  const form = section.querySelector('form'), result = section.querySelector('.drop-estimate-result');
  const basis = section.querySelector('.drop-estimate-basis');
  const source = form.elements.namedItem('source');
  const names = ['min','max','success','chance','xp','perDrop','quantity',...Object.keys(dropRateLabels())];
  const fields = Object.fromEntries(names.map(name=>[name,form.elements.namedItem(name)]));
  const read = name => !fields[name] || fields[name].value === '' ? null : Number(fields[name].value);
  const confidences = [.5,.9,.95,.99];
  let method, hasRange, usesSuccess, maxFollowsMin;
  let lastKey, lastStats;

  function render() {
    const visible = names.map(name=>fields[name]).filter(field=>field && !field.disabled);
    if (visible.some(field=>!field.validity.valid)) {
      result.innerHTML = '<p>Check the input values. Quantity wanted must be a whole number from 1 to 250.</p>';
      return;
    }
    const duration = read('min'), end = hasRange ? read('max') : null;
    const success = usesSuccess ? read('success') : 100;
    const target = xpFactor ? 1 : read('quantity');
    const perDrop = method || xpFactor ? 1 : read('perDrop');
    if (method?.tiers && duration == null) {
      result.innerHTML = '<p>Enter your clear time to find the reward chance.</p>';
      return;
    }
    const tier = method?.tiers?.find(tier=>tier.time/1000>=duration);
    const rateFields = Object.keys(method?.rates || {});
    const rates = Object.fromEntries(rateFields.map(name=>[name,(read(name) ?? method.rates[name]*100)/100]));
    const rolls = method?.tiers ? tier?.rolls : rateFields.length ? dropAdjustedRolls(method,rates) : method?.rolls;
    const q = method ? (rolls ? dropRollChance(rolls) : 0) :
      xpFactor ? Math.min(1,read('xp')/xpFactor) : (read('chance') ?? 0)/100;
    if (success == null || target == null || perDrop == null || (!method && !q && read(xpFactor?'xp':'chance') == null)) {
      result.innerHTML = '<p>Enter ' + (xpFactor ? 'the XP gained per roll' : 'the missing rates and quantity') + ' to calculate the odds.</p>';
      return;
    }
    if (success === 0 || q === 0) {
      result.innerHTML = '<p>With these rates the item cannot drop.</p>';
      return;
    }
    if (method?.limit && target > method.limit * method.high) {
      result.innerHTML = '<p>The base limit is '+number(method.limit)+' purchases. Choose another source for a larger quantity.</p>';
      return;
    }
    if ((duration != null && duration <= 0) || (end != null && (duration == null || end < duration))) {
      result.innerHTML = '<p>Enter a positive action time. Maximum time must be at least that long.</p>';
      return;
    }
    const stages = method?.stages ?? 1, s = success/100;
    const successPerRoll = stages === 1 ? s : 1;
    const stun = method?.node.type === 'ThievingRecipe' ? duration : 0;
    const actionTime = duration == null ? null : (duration+(end ?? duration))/2;
    const average = actionTime == null ? null : (actionTime+(1-s)*stun) * (stages === 1 ? 1 : stages/s);
    const probability = q*successPerRoll;
    const key = [source?.value,q,s,target,perDrop,tier?.time,...Object.values(rates)].join('/');
    if (lastKey !== key) {
      lastStats = dropQuantityStats(rolls ?? [[{p:q,low:perDrop,high:perDrop}]],target,successPerRoll,probability,confidences);
      lastKey = key;
    }
    const {counts,mean} = lastStats;
    const rows = counts.map((count,i)=>[Math.round(confidences[i]*100)+'%',
      count == null ? 'Beyond calculation range' : number(count),
      ...(average == null ? [] : [count == null ? '—' : dropEstimateTime(count*average)])]);
    const goal = xpFactor ? 'unlock' : 'get '+number(target)+(target>1?' items':' item');
    const chanceLabel = stages > 1 ? 'Chance per completed target' : usesSuccess ? 'Chance per attempt' :
      'Chance '+(method?.name ?? (xpFactor ? 'per XP gain' : 'per action'));
    const rollLabel = stages > 1 ? 'Completed targets' : ({Enemy:'Kills',Dungeon:'Clears',AgilityCourse:'Clears',Item:'Openings',
      ShopPurchase:'Purchases',ItemUpgrade:'Upgrades',FarmingRecipe:'Harvests',RanchingAnimal:'Production cycles'})[method?.node.type] ??
      (xpFactor ? 'XP gains' : 'Attempts');
    result.innerHTML = '<p>' + escape(chanceLabel) + ': <strong>' + publicChanceDisplay(probability) + '</strong></p>' +
      (average == null ? '' : '<p>Average time to ' + goal + ' <strong>' + dropEstimateTime(mean*average) + '</strong></p>') +
      table([xpFactor ? 'Chance to unlock' : 'Chance to get at least '+number(target),rollLabel,
        ...(average == null ? [] : ['Estimated time'])],rows) +
      '<p class="wiki-note">Counts give the minimum independent rolls for each chance.' +
      (average != null && ((end != null && end !== duration) || (s < 1 && (stun || stages > 1)))
        ? ' Time estimates use the average duration of those rolls.' : '') +
      (average == null && !fields.min.disabled ? ' Add an action time to estimate duration.' : '') + '</p>';
  }

  function useSource() {
    method = !source || source.value === 'custom' ? null : sources[Number(source.value)];
    const type = method?.node.type;
    const untimed = type === 'ShopPurchase' || type === 'ItemUpgrade';
    hasRange = type === 'FishingRecipe' || (!method && !xpFactor);
    usesSuccess = method ? method.success == null : !xpFactor;
    const average = method?.min == null ? null : (method.min+(method.max ?? method.min))/2;
    const values = {min:average,max:average,success:method ? method.success : 100,quantity:read('quantity') ?? 1,perDrop:1};
    const enabled = {min:!untimed,max:hasRange,success:usesSuccess,chance:!method,perDrop:!method,xp:true,quantity:true};
    for (const [name,rate] of Object.entries(method?.rates || {})) {
      enabled[name] = true;
      values[name] = Number((rate*100).toPrecision(12));
    }
    for (const name of names) {
      const field = fields[name];
      if (!field) continue;
      field.disabled = field.parentElement.hidden = !enabled[name];
      field.value = values[name] ?? '';
    }
    maxFollowsMin = true;
    basis.innerHTML = xpFactor ? 'Enter the XP actually awarded per eligible gain. The chance is XP divided by '+number(xpFactor)+'.'
      : method ? 'Source: '+link(method.node,true)+'.'+
        (method.stages > 1 ? ' One roll after '+number(method.stages)+' successful stages.' : '')+
        (type === 'ThievingRecipe' ? ' This estimate adds one action’s worth of stun time per failure. In game, base stun is 2 s before modifiers.' : '')+
        (type === 'FishingRecipe' && method.max !== method.min ? ' Both times start at the base average of '+number(average)+' s.' : '')+
        (method.tiers ? ' Enter a representative clear time to select the reward tier.' : '')+
        (untimed ? ' Counts transactions using base stack sizes. Time to gather the cost depends on your setup.' : ' Uses the recorded base stack sizes.')+
        (method.rates?.common != null || method.rates?.rare != null ? ' Enter the loot-table chance after bonuses. Item odds within each table are applied automatically.' : '')+
        (method.rates?.fish != null ? ' Enter the effective fish chance, including any junk reroll.' : '')+
        (method.rates?.secondSpecial != null ? ' The second special roll can happen only if the first yields a special item.' : '')
      : 'For a source with no modeled rate, enter the final drop chance after any loot-table activation and the items awarded per drop.';
    render();
  }
  source?.addEventListener('change',useSource);
  form.addEventListener('input', event => {
    if (event.target === source) return;
    if (event.target === fields.max) maxFollowsMin = fields.max.value === '' || fields.max.value === fields.min.value;
    if (event.target === fields.min && maxFollowsMin && hasRange) fields.max.value = fields.min.value;
    render();
  });
  form.addEventListener('submit', event => event.preventDefault());
  useSource();
}
