function dropEstimateMethod(ref) {
  const {from: node,path,parent} = ref, [root] = path, d = node.data;
  if ((parent?.MaxQuantity ?? parent?.MinQuantity ?? parent?.Quantity ?? 1) <= 0) return null;
  const {p: indexed,basis} = lootReference(ref);
  let p = indexed, name = basis || 'per action', roll = path.join('/'), trigger = roll;
  let min = null, max = null, success = 100, stages = 1, delay = 0;
  const tableIndex = path.indexOf('ItemTables');
  if (node.type === 'Enemy' || node.type === 'Dungeon' || node.type === 'Item') {
    if (node.type === 'Item' && path[1] !== 'MelvorBase:Openable') return null;
    if (node.type !== 'Item' && tableIndex < 0 && !path.includes('FixedItems')) return null;
    name = {Enemy:'per kill',Dungeon:'per clear',Item:'per opening'}[node.type];
    trigger = name;
    roll = tableIndex >= 0 ? path.slice(0,tableIndex+2).join('/') : node.type === 'Item' ? path[2] : 'guaranteed';
  } else if (node.type === 'ThievingRecipe') {
    const completion = root === 'CompletionDropTable';
    if (!completion && !['CommonDropTable','RareDropTable'].includes(root)) return null;
    trigger = completion ? 'completion' : 'stage';
    roll = root;
    stages = completion ? Math.max(1,d.Stages || 1) : 1;
    min = d.BaseInterval / 1000;
    success = null;
    delay = 2;
  } else if (node.type === 'FishingRecipe') {
    if (!['RandomProducts','SpecialProducts','JunkItem'].includes(root)) return null;
    name = 'per cast';
    trigger = name;
    roll = root === 'SpecialProducts' ? 'special catch' : 'main catch';
    if (root === 'JunkItem') p = 1 - (d.BaseFishChance ?? d.FishChance);
    min = d.BaseMinInterval / 1000;
    max = d.BaseMaxInterval / 1000;
  } else if (node.type === 'MiningRecipe') {
    if (root === 'Product') {
      name = 'per completed rock';
      min = payload.guides?.skills?.Mining?.rankings?.find(row => row.id === node.id)?.seconds ?? null;
    } else if (root === 'RandomProductsPerHit') min = d.BaseInterval / 1000;
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
    if (!d.AllowBulkPurchase || d.DefaultBuyLimit !== 0) return null;
    name = 'per purchase';
  } else if (node.type === 'HuntingAnimal' || node.type === 'FarmingRecipe') {
    name = node.type === 'HuntingAnimal' ? 'per successful hunt' : 'per harvest';
  }
  if (!(p > 0 && p <= 1)) return null;
  return {node,p,min:Number.isFinite(min) && min>0 ? min : null,max:Number.isFinite(max) && max>0 ? max : null,
    success,stages,delay,name,roll,trigger};
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
    bucket.rolls.set(method.roll,(bucket.rolls.get(method.roll)||0)+method.p);
  }
  const sources = [...buckets.values()].map(({rolls,...method}) => {
    const probabilities = [...rolls.values()].map(p => Math.min(1,p));
    method.p = probabilities.length === 1 ? probabilities[0] : -Math.expm1(
      probabilities.reduce((sum,p) => sum + Math.log1p(-p),0));
    return method;
  });
  return sources.sort((a,b) => Number(a.p===1)-Number(b.p===1) ||
    collator.compare(a.node.name,b.node.name) || collator.compare(a.name,b.name));
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

function dropEstimateMarkup(sources) {
  const field = (name,label,min,max) => '<label>' + label + ' <input type="number" inputmode="decimal" name="' + name +
    '" min="' + min + '" max="' + max + '" step="any"></label>';
  return '<form class="drop-estimate-form"><label>Source <select name="source">' +
    sources.map(({node,name},i) => moneyOption(i,node.name+' · '+name,0)).join('') +
    moneyOption('custom','Custom rates',sources.length ? 0 : 'custom') + '</select></label>' +
    '<div class="drop-estimate-fields">' +
    field('min','Action time or minimum (s)',0,1000000000) +
    field('max','Maximum time (s, optional)',0,1000000000) +
    field('success','Action success (%)',0,100) +
    field('chance','Drop on success (%)',0,100) +
    '</div><details><summary>Stages and failure delay</summary><div class="drop-estimate-fields">' +
    field('stages','Successes per loot roll',1,1000) +
    field('delay','Extra seconds after a failure',0,1000000000) +
    '</div></details></form><p class="drop-estimate-basis"></p><div class="drop-estimate-result" aria-live="polite"></div>';
}

function dropEstimateBind(sources) {
  const section = main.querySelector('#drop-calculator');
  const form = section.querySelector('form'), result = section.querySelector('.drop-estimate-result');
  const basis = section.querySelector('.drop-estimate-basis');
  const source = form.elements.namedItem('source');
  const fieldNames = ['min','max','success','chance','stages','delay'];
  const fields = Object.fromEntries(fieldNames.map(name=>[name,form.elements.namedItem(name)]));
  fields.stages.step = '1';
  function render() {
    const valid = fieldNames.every(name=>fields[name].validity.valid);
    if (!valid) {
      result.innerHTML = '<p>Check that percentages are between 0 and 100, times are positive and successes per roll is a whole number.</p>';
      return;
    }
    const read = name => fields[name].value === '' ? null : Number(fields[name].value);
    const duration = read('min'), end = read('max'), success = read('success'), chance = read('chance');
    const stages = read('stages') ?? 1, delay = read('delay') ?? 0;
    if (success == null || chance == null) {
      result.innerHTML = '<p>Enter the action success and drop chances to calculate the odds.</p>';
      return;
    }
    if (success === 0 || chance === 0) {
      result.innerHTML = '<p>With these rates the item cannot drop.</p>';
      return;
    }
    if ((duration != null && duration <= 0) || (end != null && (duration == null || end < duration))) {
      result.innerHTML = '<p>Enter a positive action time. Maximum time must be at least that long.</p>';
      return;
    }
    const single = stages === 1, s = success/100, q = chance/100;
    const probability = single ? s*q : q;
    const average = duration == null ? null : ((duration+(end ?? duration))/2+(1-s)*delay) * (single ? 1 : stages/s);
    const variable = (end != null && end !== duration) || (s < 1 && (!single || delay > 0));
    const timeBounds = duration != null && variable && (single || s === 1);
    const rows = [0.5,0.9,0.95,0.99].map(confidence=>{
      const count = dropEstimateAttempts(probability,confidence);
      const time = count == null || average == null ? '—' : dropEstimateTime(count*average);
      const bounds = count == null ? '—' : dropEstimateTime(count*stages*duration) + ' – ' +
        dropEstimateTime(count*stages*((end ?? duration)+(s<1 ? delay : 0)));
      return [Math.round(confidence*100)+'%',count == null ? 'Beyond calculation range' : number(count),time,...(timeBounds?[bounds]:[])];
    });
    result.innerHTML = '<p>' + (single ? 'Chance per attempt' : 'Chance per completed loot roll') + ': <strong>' +
      publicChanceDisplay(probability) + '</strong></p>' +
      table(['Chance to get at least one',single?'Attempts':'Completed loot rolls',variable?'Time at average pace':'Estimated time',
        ...(timeBounds?['Time bounds']:[])],rows) +
      '<p class="wiki-note">Each row is the minimum number of independent attempts or rolls to hit that chance.' +
      (variable ? ' Time at average pace uses the midpoint of the duration range and expected failures.' : '') +
      (timeBounds ? ' The bounds bracket when the stated chance is reached if every attempt stays within the entered times, including failure delay.' : '') +
      (!timeBounds && variable && average != null ? ' Actual elapsed time may vary.' : '') +
      (average == null ? ' Add an action time to estimate the duration.' : '') + '</p>';
  }
  function useSource() {
    const method = source.value === 'custom' ? null : sources[Number(source.value)];
    const values = method ? {...method,chance:method.p*100} : {success:100,stages:1,delay:0};
    for (const name of fieldNames) fields[name].value = values[name] ?? '';
    form.querySelector('details').open = Boolean(method && (method.stages>1 || method.delay>0));
    basis.innerHTML = method ? 'Base drop chance ' + escape(method.name) + ' from ' + link(method.node,true) +
      '. Enter the times and chances you see with your setup.' : 'Use the drop chance after any loot-table activation roll. Enter 100% success for actions that always reach the loot roll.';
    render();
  }
  source.addEventListener('change',useSource);
  form.addEventListener('input', event => { if (event.target !== source) render(); });
  form.addEventListener('submit', event => event.preventDefault());
  useSource();
}
