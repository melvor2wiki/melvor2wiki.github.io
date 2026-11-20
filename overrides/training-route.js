function trainingEligible(node, levelFor, unlocked = false, toolId) {
  if (!node) return false;
  const clauses = [];
  for (const gate of moneyGates(node)) {
    const type = bare(gate.Type);
    const matches = type === 'Level'
      ? levelFor(bare(gate.Data?.Component?.Entity || '')) >= gate.Data?.Level
      : type === 'ToolbeltItemEquipped' && toolId != null
        ? gate.Data?.Item === toolId && (gate.Data?.Quantity ?? 1) === 1
        : unlocked && !/Quest(?:Step|Task|Active)|DemoLocked/.test(type);
    if (gate.Data?.IsOr && clauses.length) clauses[clauses.length - 1] ||= matches;
    else clauses.push(matches);
  }
  return clauses.every(Boolean);
}

function trainingXP(level) {
  let sum = 0;
  for (let i = 1; i < level; i++) sum += Math.floor(i + 300 * 2 ** (i / 7));
  return Math.floor(sum / 4);
}

function trainingTime(seconds) {
  if (seconds >= 3600) return guideV2Num(seconds / 3600, ' h');
  if (seconds >= 60) return guideV2Num(seconds / 60, ' min');
  return guideV2Num(seconds, ' s');
}

function thievingTrainingTools() {
  const nodes=readerCandidates('Thieving').map(guideV2Node);
  const ids=new Set(nodes.flatMap(node=>moneyGates(node)
    .filter(gate=>bare(gate.Type)==='ToolbeltItemEquipped').map(gate=>gate.Data.Item)));
  return [...ids].map(id=>publicNode('Item',id)).filter(Boolean)
    .sort((a,b)=>collator.compare(a.name,b.name));
}

function thievingTrainingChoice(action, level, profile, supply) {
  const node=guideV2Node(action);
  if(action.level>level)return null;
  const levelFor=id=>id==='Thieving'?level:profile.support;
  let fastest=null;
  for(const tool of [null,...(profile.tools||[])]){
    if(!trainingEligible(node,levelFor,profile.unlocked,tool?.id||'')||
      (tool&&!trainingEligible(tool,levelFor,profile.unlocked)))continue;
    const mods={FlatStealth:profile.stealth||0,PercentInterval:-(profile.speed||0)/100,
      StunAvoidanceChance:(profile.stunAvoidance||0)/100};
    const xpMods={FlatXPGained:0,PercentXPGained:(profile.xpBonus||0)/100};
    for(const mod of tool?.data.Capabilities?.['MelvorBase:Toolbelt']?.Bonuses?.Component||[]){
      const scope=mod.LocalContext||{}, name=mod.Stat?.Name;
      if(!name||mod.Condition||mod.Scaling||mod.FromContext||
        Object.entries(scope).some(([key,value])=>key!=='Component'&&value&&
          ({Recipe:node.id,Category:node.data.Category,RecipeType:node.data.RecipeType})[key]!==value))continue;
      const values=Object.hasOwn(xpMods,name)?xpMods:mods;
      values[name]=(values[name]||0)+mod.Value;
    }
    const timing=thievingTiming(node,level,mods);
    if(!(timing.seconds>0))continue;
    const food=profile.mode==='bank'?{seconds:0,cash:0,inputs:[]}:thievingFood(node,timing,mods,supply);
    if(!food||(food.cash>0&&!(supply().gpPerSecond>0)))continue;
    const prep=food.seconds+(food.cash>0?food.cash/supply().gpPerSecond:0);
    const xp=(action.xp+xpMods.FlatXPGained)*(1+xpMods.PercentXPGained);
    const rate=xp/(timing.seconds+prep);
    if(rate>(fastest?.rate||0))fastest={action,tool,rate,xp,timing,active:timing.seconds,prep,inputs:food.inputs};
  }
  return fastest;
}

function thievingTrainingNotes() {
  const chest=guideV2Ref('ThievingRecipe','LockedThugChest');
  const key=guideV2Ref('Item','ThugChestKey');
  return '<p>If you own the '+key+', compare the '+chest+' from level 10. The key gives +500 Stealth on that chest. A plain Lockpick opens it too, with its own rate.</p>'+
    '<p>Compare XP/hour with the same setup. A target with higher XP per completion can lose once you include failures and stuns. When a boost takes a faster target to a high success rate, check the ranking again.</p>';
}

function thievingTrainingBenchmark(profile) {
  const level=profile.from;
  const supply=()=>moneySourceModel(profile.support,'Thieving',1,profile.unlocked);
  const ranks=readerCandidates('Thieving').map(action=>thievingTrainingChoice(action,level,profile,supply))
    .filter(Boolean).sort((a,b)=>b.rate-a.rate);
  if(!ranks.length)return '';
  const examples=new Set(['LockedThugChest','BanditLeader','Miner']);
  const shown=ranks.filter(({action},i)=>i<8||examples.has(bare(action.id)));
  return '<h3>Target comparison at level '+number(level)+'</h3>'+
    table(['Target','Tool','Success per attempt','XP/completion','Seconds per completion incl. supplies','XP/hour'],shown.map(row=>[
      guideV2Link(row.action),row.tool?link(row.tool,true):'—',numericCell(row.timing.chance*100,'%'),
      numericCell(row.xp),numericCell(row.active+row.prep,' s'),numericCell(row.rate*3600)
    ]),true)+'<p>Success is per attempt. XP is awarded once per completed target. The route above also counts the time you entered for each switch.</p>';
}

function trainingChoice(action, skill, level, profile, supply) {
  if (skill === 'Thieving') return thievingTrainingChoice(action,level,profile,supply);
  if (skill === 'Mining') return miningRockSetup(action,level,profile);
  const node = guideV2Node(action);
  const levelFor = id => id === skill ? level : profile.support;
  if (action.level > level || !trainingEligible(node, levelFor, profile.unlocked)) return null;
  const baseRate = readerRate(action, level, skill);
  const multiplier = 1 + (profile.xpBonus || 0) / 100;
  const timeMultiplier = 1 - (profile.speed || 0) / 100;
  const rate = baseRate * multiplier / timeMultiplier;
  if (!(rate > 0)) return null;
  const expectedXP = skill === 'Cooking'
    ? action.xp * Math.min(1, (69 + level) / (69 + node.data.Difficulty))
    : action.xp * (action.successChance ?? 1);
  const active = expectedXP / baseRate * timeMultiplier;
  if (profile.mode === 'bank') return {action, rate, active, prep: 0, inputs: []};

  const ingredients = node.data.Ingredients || {};
  const model = supply();
  const recurring = moneyRecurringInputs(node);
  if (!recurring || (ingredients.Currencies || []).some(x => bare(x.Currency) !== 'GoldPieces')) return null;
  const inputs = recurring.map(x => ({qty: x.Quantity, path: model.paths.get(x.Item)}));
  if (inputs.some(x => !x.path)) return null;
  const cash = (ingredients.Currencies || []).reduce((sum, x) => sum + x.Quantity, 0) +
    inputs.reduce((sum, x) => sum + x.qty * x.path.cash, 0);
  if (cash > 0 && !(model.gpPerSecond > 0)) return null;
  const prep = inputs.reduce((sum, x) => sum + x.qty * x.path.seconds, 0) + (cash > 0 ? cash / model.gpPerSecond : 0);
  if (!(expectedXP > 0)) return null;
  const supplyXP = moneyRouteSteps(inputs).reduce((xp, {path, qty}) => {
    if (path.entry?.skill !== skill) return xp;
    return xp + qty / path.qty * path.node.data.BaseExperience * moneySuccess(path.entry, level);
  }, 0);
  return {action, rate: (expectedXP + supplyXP) * multiplier / (active + prep), active, prep, inputs};
}

function trainingPlan(skill, profile) {
  const candidates = readerCandidates(skill);
  let states = new Map(), best = null;
  const requiresLiveLevel = ['Cooking','Crafting','Smithing','Fletching','Beastcrafting','Runecrafting','Herblore'].includes(skill);
  for (let level = profile.from; level < profile.to; level++) {
    const next = new Map(), xp = trainingXP(level + 1) - trainingXP(level);
    // Material acquisition paths use the support level, and the current training level
    // only when an ingredient can be made by the skill being trained.
    let model;
    const supply = () => model ||= moneySourceModel(profile.support, skill, requiresLiveLevel ? level : 1, profile.unlocked);
    for (const action of candidates) {
      const node = guideV2Node(action);
      let source = supply;
      if (skill !== 'Thieving' && !node?.data.Ingredients?.Items?.length && !node?.data.Ingredients?.Currencies?.length) {
        source = () => ({paths: new Map(), gpPerSecond: 0});
      }
      const choice = trainingChoice(action, skill, level, profile, source);
      if (!choice || !(choice.rate > 0)) continue;
      const hold = states.get(action.id);
      const start = best && (!hold || best.total + profile.switchTime < hold.total) ? best : hold;
      const switchTime = start && start.choice.action.id !== action.id ? profile.switchTime : 0;
      const seconds = xp / choice.rate;
      next.set(action.id, {choice, level, xp, previous: start, seconds, switchTime,
        total: (start?.total || 0) + switchTime + seconds});
    }
    if (!next.size) break;
    states = next;
    best = [...states.values()].reduce((fastest, row) => row.total < fastest.total ? row : fastest);
  }
  const route = [];
  for (let step = best; step; step = step.previous) route.push(step);
  route.reverse();
  const ranges = [];
  for (const step of route) {
    const {action, tool, gear, prep, active, inputs} = step.choice;
    const last = ranges.at(-1);
    const key = [tool?.id,...(gear||[]).map(node=>node.key),...inputs.map(x => x.path.node.key)].join('/');
    const range = last?.action.id === action.id && last.key === key ? last :
      {from: step.level, to: step.level, action, tool, gear, key, xp: 0, seconds: 0, prep: 0, switches: 0, sources: new Map()};
    range.to = step.level + 1;
    range.xp += step.xp;
    range.seconds += step.seconds;
    range.prep += step.seconds * prep / (active + prep);
    range.switches += step.switchTime;
    for (const {path} of moneyRouteSteps(inputs)) range.sources.set(path.node.key, path.node);
    if (range !== last) ranges.push(range);
  }
  return {ranges, reached: best?.level + 1 || profile.from, seconds: best?.total || 0};
}

function trainingPlanSection(skill) {
  return '<p>Pick your goal and compare the whole route. From scratch includes gathering, intermediate recipes and time to earn any gold spent. From bank uses items you already have.</p>' +
    '<form id="training-plan"><label>Start level <input name="from" type="number" min="1" max="98" value="1" required></label> ' +
    '<label>Goal level <input name="to" type="number" min="2" max="99" value="30" required></label> ' +
    '<label>Other skills <input name="support" type="number" min="1" max="99" value="1" required></label> ' +
    '<label>Supplies <select name="mode"><option value="supply">Gather as needed</option><option value="bank">Already banked</option></select></label> ' +
    '<label>Time per switch (min) <input name="minutes" type="number" min="0" max="10080" step="0.5" value="1" required></label> ' +
    '<label>XP bonus (%) <input name="xpBonus" type="number" min="-99" max="1000" step="any" value="0" required></label> ' +
    '<label>Action time reduction (%) <input name="speed" type="number" min="-100" max="95" step="any" value="0" required></label> ' +
    '<label><input type="checkbox" name="unlocked"> I meet the other unlock requirements</label> ' +
    (skill==='Thieving'?'<p><label>Extra stealth <input name="stealth" type="number" min="0" max="100000" value="0" required></label> '+
      '<label>Stun avoidance (%) <input name="stunAvoidance" type="number" min="0" max="100" step="any" value="0" required></label></p>'+
      '<fieldset><legend>Tools you own</legend>'+thievingTrainingTools().map(tool=>'<label><input type="checkbox" name="tool" value="'+escape(tool.id)+'"> '+
        icon(tool)+escape(tool.name)+'</label> ').join('')+'</fieldset>'+
      '<p>Enter bonuses from your other gear. The planner adds each selected key’s target-specific bonus and picks a compatible tool for each target.</p>':'')+
    (skill==='Mining'?miningPlannerOptions():'')+'<button>Plan training</button></form>' +
    '<p>Enter a level your support skills already meet. Leave extra unlocks unchecked to avoid routes gated by gear, shops, Guild ranks or milestones. The switch cost covers your time getting set up each time you change methods.</p>' +
    '<p>Estimates start at the XP for your start level and apply the bonuses you enter. The route credits XP earned while making ingredients in this skill. Supply chains use base action times. Other skill levels are assumed ready. Passive or unpriced supplies and temporary bonuses are outside the estimate.</p><div id="training-plan-result" aria-live="polite"></div>';
}

function trainingStartPlanner(skill) {
  const form = main.querySelector('#training-plan');
  if (!form) return;
  const result = main.querySelector('#training-plan-result');
  const render = () => {
    const values = new FormData(form);
    const profile = {
      from: Number(values.get('from')), to: Number(values.get('to')), support: Number(values.get('support')),
      mode: values.get('mode'), switchTime: Number(values.get('minutes')) * 60, unlocked: values.has('unlocked'),
      xpBonus: Number(values.get('xpBonus')), stealth: Number(values.get('stealth')), speed: Number(values.get('speed')),
      stunAvoidance: Number(values.get('stunAvoidance')), tools: values.getAll('tool').map(id=>publicNode('Item',id)).filter(Boolean)
    };
    if (profile.to <= profile.from) {
      result.innerHTML = '<p>Choose a goal above your current level.</p>';
      return;
    }
    if(skill==='Mining'){
      profile.miningOwned=values.getAll('miningOwned');
      profile.miningPreview=values.has('miningPreview');
      profile.miningBreak=Number(values.get('miningBreak'));
      profile.miningProspecting=Number(values.get('miningProspecting'));
      profile.miningShatter=Number(values.get('miningShatter'));
      profile.miningRefill=values.get('miningRefill')===''?null:Number(values.get('miningRefill'));
      profile.miningSources=miningProfileSources(profile);
    }
    const plan = trainingPlan(skill, profile);
    const targets=skill==='Thieving'?thievingTrainingBenchmark(profile):skill==='Mining'?miningTrainingBenchmark(profile):'';
    if (!plan.ranges.length) {
      result.innerHTML = '<p>No route begins at those levels with the modeled sources. Try banked supplies or raise the support level if you already have those unlocks.</p>'+targets;
      return;
    }
    result.innerHTML = '<p><strong>Level ' + profile.from + ' to ' + plan.reached + ' takes about ' + trainingTime(plan.seconds) + '.</strong></p>' +
      (plan.reached < profile.to ? '<p>The available routes end here. Supply or unlock data is missing for the next level.</p>' : '') +
      table(['Train from → to','Train on',...(skill==='Thieving'?['Tool']:skill==='Mining'?['Equip']:[]),'XP/s incl. prep','Supply + switch time','Total time','Get supplies from'], plan.ranges.map(range => [
        range.from + ' → ' + range.to, guideV2Link(range.action), ...(skill==='Thieving'?[range.tool?link(range.tool,true):'—']:skill==='Mining'?[miningSetupLabel(range)]:[]), numericCell(range.xp / (range.seconds + range.switches)),
        trainingTime(range.prep + range.switches), trainingTime(range.seconds + range.switches),
        [...range.sources.values()].map(node => link(node, true)).join('<br>') || '—'
      ]), true)+targets;
  };
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  render();
}

function trainingCompareSection() {
  return '<p>Compare your current and proposed XP per hour. Count the time to get gear, food, ammo, potions or other supplies. Use a steady stretch of training to measure each rate.</p>' +
    '<form id="training-compare"><label>XP left <input name="xp" type="number" min="1" value="10000" required></label> ' +
    '<label>Current XP/hour <input name="base" type="number" min="1" required></label> ' +
    '<label>New setup XP/hour <input name="next" type="number" min="1" required></label> ' +
    '<label>Extra prep (min) <input name="prep" type="number" min="0" step="0.5" value="0" required></label> ' +
    '<button>Compare total time</button></form><div id="training-compare-result" aria-live="polite"></div>';
}

function trainingStartComparison() {
  const form = main.querySelector('#training-compare');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const xp = Number(data.get('xp')), base = Number(data.get('base')), next = Number(data.get('next'));
    const prep = Number(data.get('prep')) * 60;
    const current = 3600 * xp / base, upgraded = prep + 3600 * xp / next;
    const result = main.querySelector('#training-compare-result');
    result.innerHTML = table(['Setup','Total time'], [['Current setup',trainingTime(current)],['New setup',trainingTime(upgraded)]]) +
      '<p>' + (upgraded < current ? 'The upgrade saves ' + trainingTime(current - upgraded) + '.'
        : upgraded > current ? 'Keep your current setup to save ' + trainingTime(upgraded - current) + '.'
        : 'Both setups take the same time.') +
      (next > base && prep > 0 ? ' It pays off after ' + number(Math.ceil(prep / (3600 / base - 3600 / next))) + ' XP.' : '') + '</p>';
  });
}
