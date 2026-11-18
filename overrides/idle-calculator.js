function idleClamp(value, max) {
  return Math.min(max, Math.max(0, value));
}

function idleData() {
  if (idleData.cached) return idleData.cached;
  const objects = payload.game.Objects;
  const indexes = new Map();
  const data = (type, id) => {
    if (!indexes.has(type)) indexes.set(type, new Map((objects[type] || []).map(row => [row.Id, row])));
    return indexes.get(type).get(bare(id || ''));
  };
  const areas = [...(byType.get('CombatArea') || []), ...(byType.get('Dungeon') || [])].map(node => ({
    node,
    category: ({
      CombatAreas: 'Combat Areas', SlayerZones: 'Slayer Zones', DarkAreas: 'Dark Areas',
      StandardDungeons: 'Standard Dungeons', Quests: 'Quest Encounters'
    })[bare(node.data.Category)] || (node.type === 'Dungeon' ? 'Standard Dungeons' : 'Combat Areas'),
    enemies: [...new Set(node.type === 'Dungeon'
      ? node.data.Enemies.flatMap(wave => wave.Enemies.filter(slot => slot.Weight > 0).map(slot => slot.Enemy))
      : node.data.Enemies)]
  }));
  return idleData.cached = {data, areas};
}

function idleAutoEatRates() {
  const upgrade = tier => idleData().data('ShopPurchase', 'AutoEat' + tier)?.Provides?.Bonuses?.Global
    ?.find(mod => mod.StatGroup === 'GlobalFlatAutoEatThreshold')?.Value || 0;
  const level2 = .25 + upgrade(2);
  return [0, .25, level2, level2 + upgrade(3)];
}

function idleRoundEven(value) {
  const lower = Math.floor(value);
  return value - lower === .5 ? lower + lower % 2 : Math.round(value);
}

function idleEncounter(enemy, area) {
  const {data} = idleData();
  const stats = payload.monsters.enemies[bare(enemy.id)];
  const unresolved = new Set(), immunities = new Set();
  const totals = {Enemy: {}, Player: {}};
  const attacks = [], effects = new Map(), visited = new Set();
  const enemyMods = new Set(['FlatMaxHit', 'PercentMaxHit', 'FlatPowerRating', 'PercentPowerRating', 'PercentDamageDealt',
    'FlatCriticalHitChance', 'FlatCriticalHitMultiplier']);
  const playerMods = new Set(['FlatProtectionRating', 'PercentProtectionRating', 'FlatResistance', 'PercentResistance',
    'ResistanceCombatTriangle', 'PercentDamageTaken', 'PercentDamageTakenFrom', 'PercentDamageTakenFromAttacks',
    'FlatMaxHitpoints', 'PercentMaxHitpoints', 'FlatAutoEatThreshold', 'FlatAutoEatLimit']);
  function addMod(mod, side, scale) {
    if (!side || !mod?.Stat) return;
    const name = mod.Stat.Name, value = mod.Value * scale;
    if (side === 'Enemy' && name === 'ImmunityFrom' && value > 0) {
      immunities.add(bare(mod.LocalContext?.CombatStyle || 'All'));
    }
    if (name === 'FlatCombatStatValue' || name === 'PercentCombatStatValue') {
      const stat = bare(mod.LocalContext?.CombatStat || '');
      if (side === 'Player' && /^(Armour|)$/.test(stat) && value < 0) totals.Player.ArmourBroken = 1;
      if (side === 'Enemy' && /StrengthBonus|SpellMaxHit|^$/.test(stat) && value > 0) unresolved.add('Enemy combat stat scaling');
      return;
    }
    const relevant = side === 'Enemy' ? enemyMods : side === 'Player' ? playerMods : null;
    if (!relevant?.has(name)) return;
    const raisesDamage = side === 'Enemy' || name.startsWith('PercentDamage');
    if (!(raisesDamage ? value > 0 : value < 0) && !mod.FromContext) return;
    if (!Number.isFinite(value) || mod.FromContext || mod.Scaling) {
      unresolved.add('Variable ' + human(name));
      return;
    }
    if (/FlatAutoEat|MaxHitpoints/.test(name)) {
      unresolved.add(human(name) + ' changes mid-fight');
      return;
    }
    totals[side][name] = (totals[side][name] || 0) + value;
  }
  function addEffect(configured, side, source) {
    if (!configured) return;
    const type = bare(configured.Type);
    const id = configured.Data?.Effect;
    const key = [type, id, side, source].join('/');
    if (visited.has(key)) return;
    visited.add(key);
    if (type === 'EndOfTurnHealing') return;
    const effect = data(type + 'Effect', id);
    if (!effect) {
      unresolved.add(id ? human(id) : human(type));
      return;
    }
    const scale = type === 'Stacking' ? effect.MaxStacks : type === 'RandomMagnitude'
      ? Math.max(effect.DefaultMaxStacks || 1, configured.Data?.Configuration?.MaxStacks || 1) : 1;
    for (const mod of effect.Modifiers || []) addMod(mod, side, scale);
    if (side === 'Player' && (effect.DamagePerProc || effect.DamagePerTurn || type === 'Bleed')) {
      effects.set(key, {effect, source});
    }
    addEffect(effect.RemovalEffect, side, source);
  }
  function addModifiers(group, scale = 1) {
    if (Array.isArray(group)) group = {Component: group};
    for (const mod of group?.Global || []) {
      if (/AutoEat|Damage|MaxHit|Resistance|Protection|Armour/.test(mod.StatGroup) && mod.Value) unresolved.add(human(mod.StatGroup));
    }
    for (const mod of group?.Component || []) addMod(mod, mod.LocalContext?.Component?.Component, scale);
    for (const row of group?.CombatEffect || []) {
      if (row.Chance <= 0) continue;
      const source = row.Character?.Component;
      if (!['Player', 'Enemy'].includes(source) || !['Self', 'Target'].includes(row.Modifier?.AppliesTo)) {
        unresolved.add('Effect target');
        continue;
      }
      const side = row.Modifier.AppliesTo === 'Self' ? source : source === 'Enemy' ? 'Player' : 'Enemy';
      const type = bare(row.Modifier.Trigger?.Type || '');
      if (side === 'Player' && /FoodEaten|OnDeath/.test(type)) unresolved.add('Effect triggered by food or death');
      addEffect(row.Modifier.Effect, side, source);
    }
  }

  if (!stats?.maxHits?.length) unresolved.add('Missing enemy stats');
  if (enemy.data.PauseOnSpawn) unresolved.add('Fight pauses on spawn');
  for (const id of new Set([...(enemy.data.Passives || []), ...(area?.data.Passives || [])])) {
    const passive = data('CombatPassive', id);
    if (passive) addModifiers(passive.Modifiers);
    else unresolved.add(human(id));
  }
  if (area?.data.Effect) addModifiers(area.data.Effect.Modifiers, area.data.Effect.Magnitude ?? 1);

  const special = (enemy.data.Attacks || []).filter(attack => attack.Chance > 0);
  const choices = special.reduce((sum, attack) => sum + attack.Chance, 0) < 1
    ? [{Attack: 'MelvorBase:Normal'}, ...special] : special;
  for (const choice of choices) {
    const attack = data('Attack', choice.Attack);
    if (!attack?.Hits?.length) {
      unresolved.add('Missing attack data');
      continue;
    }
    for (const row of [...(attack.PreHitEffects || []), ...(attack.OnHitEffects || [])]) {
      if (row.Chance > 0) addEffect(row.Effect, row.AppliesTo === 'Self' ? 'Enemy' : 'Player', 'Enemy');
    }
    attacks.push(attack);
  }
  return {enemy, stats, totals, attacks, effects: [...effects.values()], unresolved, immunities};
}

function idleEvaluate(encounter, profile, hp = profile.hp) {
  const {stats, totals, attacks, effects} = encounter;
  const unresolved = new Set(encounter.unresolved);
  if (encounter.immunities.has(profile.style) || encounter.immunities.has('All')) {
    unresolved.add('Immune to ' + profile.style + ' attacks');
  }
  const threshold = idleRoundEven(hp * profile.threshold);
  if (!stats?.maxHits?.length) return {threshold, unresolved};
  const {data} = idleData();
  const e = name => totals.Enemy[name] || 0;
  const p = name => totals.Player[name] || 0;
  const armour = p('ArmourBroken') ? 0 : profile.armour;
  const power = Math.max(1, Math.ceil((stats.powerRating + e('FlatPowerRating')) * (1 + e('PercentPowerRating'))));
  const protection = Math.max(0, Math.floor((profile.protection + p('FlatProtectionRating')) * (1 + p('PercentProtectionRating'))));
  const damage = [];
  let canBreakArmour = false;
  for (const stance of stats.maxHits) {
    const triangle = data('CombatTriangleBonus', profile.style + 'Vs' + stance.style);
    const triangleResistance = triangle?.Bonuses?.Component
      ?.find(mod => mod.Stat?.Name === 'ResistanceCombatTriangle')?.Value || 0;
    const resistance = idleClamp(idleClamp(
      (protection / (power + protection) + p('FlatResistance') + profile.resistance / 100) * (1 + p('PercentResistance')), .7
    ) * (1 + triangleResistance + p('ResistanceCombatTriangle')), 1);
    const maxHit = Math.max(1, Math.floor(stance.maxHit * (1 + e('PercentMaxHit')) + e('FlatMaxHit')));
    const reduce = (raw, isAttack) => Math.trunc(Math.max(1, raw * (1 + e('PercentDamageDealt')) *
      (1 + p('PercentDamageTaken') + profile.vulnerability / 100 + p('PercentDamageTakenFrom') + (isAttack ? p('PercentDamageTakenFromAttacks') : 0)) *
      (1 - resistance) - armour));
    function roll(row, owner, directDamage = 0) {
      const type = bare(row?.Formula?.Type || '');
      const config = row?.Formula?.Data || {};
      if (type === 'Fixed' && Number.isFinite(config.Damage)) return config.Damage;
      const scale = config.Percent;
      if (Number.isFinite(scale) && type === 'DamageDealt') return Math.trunc(directDamage * scale);
      if (Number.isFinite(scale) && ['NormalDamage', 'MaxHit', 'CurrentHitpoints', 'MaxHitpoints'].includes(type)) {
        const hitpoints = /Hitpoints$/.test(type);
        const bound = owner === 'Enemy' ? (hitpoints ? stats.hitpoints : maxHit) : (hitpoints ? hp : null);
        if (bound != null) return Math.ceil(bound * scale);
      }
      unresolved.add('Damage formula: ' + (type ? human(type) : 'missing'));
      return 0;
    }
    let maxDirect = 0;
    for (const attack of attacks) {
      for (const hit of attack.Hits) {
        if (!(hit.Count > 0)) continue;
        let raw = hit.Damage.reduce((sum, row) => sum + roll(row, row.Character === 'Attacker' ? 'Enemy' : 'Player'), 0);
        if (e('FlatCriticalHitChance')) raw = Math.trunc(raw * (1.5 + e('FlatCriticalHitMultiplier')));
        const hitDamage = raw > 0 ? reduce(raw, true) : 0;
        damage.push({value: hitDamage, style: stance.style});
        if (armour > 0 && hitDamage >= armour) canBreakArmour = true;
        maxDirect = Math.max(maxDirect, hitDamage);
      }
    }
    for (const {effect, source} of effects) {
      const row = effect.DamagePerProc || effect.DamagePerTurn;
      const owner = row?.Character === 'Target' ? 'Player' : source;
      const raw = Math.max(1, row ? roll(row, owner, maxDirect) : Math.ceil(maxDirect * effect.PercentDamageDealtPerProc)) * (effect.MaxStacks || 1);
      if (source === 'Player') unresolved.add('Player-sourced damage');
      damage.push({value: reduce(raw, false), style: stance.style});
    }
  }
  // The game removes armour after an attack deals at least that much damage through it.
  // Later hits and effect ticks then get no armour reduction.
  if (canBreakArmour) {
    return {...idleEvaluate(encounter, {...profile, armour: 0}, hp), canBreakArmour};
  }
  const worst = damage.reduce((max, hit) => !max || hit.value > max.value ? hit : max, null);
  if (!worst) unresolved.add('No modeled damage events');
  return {worst, threshold, unresolved, fits: Boolean(worst && worst.value <= threshold && !unresolved.size)};
}

function idlePage(params) {
  const {areas} = idleData();
  const tiers = idleAutoEatRates(), styles = ['Melee', 'Ranged', 'Magic'];
  const enemies = byType.get('Enemy') || [];
  const masters = byType.get('SlayerMaster') || [];
  const all = 'All Monsters', slayer = 'Slayer Masters';
  const groups = ['Combat Areas', 'Slayer Zones', slayer, 'Dark Areas', 'Standard Dungeons', all, 'Quest Encounters'];
  const legacyGroups = new Map([['slayer areas', 'Slayer Zones'], ['dungeons', 'Standard Dungeons']]);
  const category = params.get('group')?.toLowerCase();
  const group = groups.find(name => name.toLowerCase() === category) || legacyGroups.get(category) || '';
  const statuses = {'': 'Any result', fit: 'Can idle', exceeds: 'Above limit', review: 'Review needed'};
  const value = (key, fallback, min, max) => {
    const raw = params.get(key);
    return raw && Number.isFinite(Number(raw)) ? Math.max(min, Math.min(max, Number(raw))) : fallback;
  };
  const hp = Math.round(value('hp', 100, 1, 1000000)), tier = Math.round(value('tier', 1, 1, 3));
  const bonus = value('eat', 0, -35, 15), protection = Math.round(value('protection', 0, 0, 1000000));
  const armour = Math.round(value('armour', 0, 0, 1000000)), resistance = value('resistance', 0, -100, 70);
  const vulnerability = value('damage', 0, 0, 1000);
  const style = styles.includes(params.get('style')) ? params.get('style') : 'Melee';
  const status = ['fit', 'exceeds', 'review'].includes(params.get('show')) ? params.get('show') : '';
  const query = (params.get('q') || '').trim().slice(0, 80);
  const locationsFor = group => areas.filter(area => !group || group === all || area.category === group);
  const locationOptions = (group, selected) => [
    moneyOption('', 'All locations', selected),
    ...(group === slayer ? masters : [...locationsFor(group).map(area => area.node), ...(!group ? masters : [])])
      .map(node => moneyOption(node.id, node.name, selected))
  ].join('');
  const numberField = (name, label, selectedValue, min, max, step = 1) => '<label>' + label +
    ' <input name="' + name + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' +
    selectedValue + '"' + (name === 'hp' ? ' required' : '') + '></label>';
  main.innerHTML = '<h1>Can I Idle?</h1><p>Check a fight against your Auto Eat threshold with unlimited equipped food. Enter your max HP, protection rating and armour as they appear outside combat.</p>' +
    '<form id="idle-profile"><fieldset><legend>Your character</legend><div class="idle-fields">' +
    numberField('hp', 'Max HP', hp, 1, 1000000) + numberField('protection', 'Protection rating', protection, 0, 1000000) +
    numberField('armour', 'Armour', armour, 0, 1000000) + '<label>Auto Eat <select name="tier">' +
    tiers.slice(1).map((rate, i) => moneyOption(i + 1, (i + 1) + ' (' + Math.round(rate * 100) + '%)', tier)).join('') +
    '</select></label><label>Combat style <select name="style">' + styles.map(name => moneyOption(name, name, style)).join('') + '</select></label></div>' +
    '<details' + (bonus || resistance || vulnerability ? ' open' : '') + '><summary>Advanced stats</summary><div class="idle-fields">' +
    numberField('eat', 'Auto Eat bonus (percentage points)', bonus, -35, 15, .1) +
    numberField('resistance', 'Flat resistance (%)', resistance, -100, 70, .1) +
    numberField('damage', 'Extra damage taken (%)', vulnerability, 0, 1000, .1) +
    '</div><p>Protection rating is handled separately from flat resistance.</p></details></fieldset>' +
    '<fieldset><legend>Encounters</legend><div class="idle-fields"><label>Category <select name="group">' +
    moneyOption('', 'Overview', group) + groups.map(name => moneyOption(name, name, group)).join('') + '</select></label><label>Location or master <select name="target">' +
    locationOptions(group, params.get('target') || '') + '</select></label><label>Find a monster or area <input type="search" name="q" maxlength="80" value="' + escape(query) +
    '"></label><label>Result <select name="show">' + Object.entries(statuses).map(([key, label]) => moneyOption(key, label, status)).join('') +
    '</select></label></div></fieldset></form>' +
    '<p id="idle-threshold" aria-live="polite">Calculating Auto Eat threshold…</p><p>Each hit or damage tick is checked separately, allowing for armour breaking mid-fight. ' +
    'The estimate assumes unlimited equipped food and uses the upper bound for harmful effects.</p>' +
    '<p>Green means the setup is within the Auto Eat limit. Grey means above the limit or that the fight needs review.</p><div id="idle-results"><p>Calculating encounters…</p></div>';

  const form = main.querySelector('#idle-profile');
  const results = main.querySelector('#idle-results');
  const threshold = main.querySelector('#idle-threshold');
  const outline = document.getElementById('article-outline');
  const encounters = new Map();
  const locations = new Map();
  for (const area of areas) for (const id of area.enemies) {
    if (!locations.has(id)) locations.set(id, []);
    locations.get(id).push(area.node);
  }
  const resultKey = ({result}) => result.unresolved.size ? 'review' : result.fits ? 'fit' : 'exceeds';
  const badge = (key, reasons = []) => '<span class="idle-result idle-' + key +
    (reasons.length ? '" title="' + escape(reasons.join('; ')) : '') + '">' + statuses[key] + '</span>';
  const damageCell = hit => {
    if (!Number.isFinite(hit?.value)) return '—';
    const src = imageSource(idleData().data('CombatStyle', hit.style)?.Icon);
    const style = escape(hit.style || '');
    const image = src ? '<img class="icon" src="' + src + '" alt="' + style + '" title="' + style + '">' : '';
    return sortValue('<span class="idle-damage">' + image + number(hit.value) + '</span>', hit.value, true);
  };

  let urlTimer, lastProfile;
  function renderResults(updateUrl = false) {
    const fields = Object.fromEntries(['hp', 'tier', 'style', 'eat', 'protection', 'armour', 'resistance', 'damage', 'group', 'target', 'show', 'q']
      .map(name => [name, form.elements.namedItem(name).value]));
    const signature = JSON.stringify(fields);
    const valid = form.checkValidity();
    if (valid && signature === lastProfile) return;
    lastProfile = valid ? signature : undefined;
    clearTimeout(urlTimer);
    if (!valid) {
      threshold.textContent = 'Enter valid character stats to see the results.';
      results.innerHTML = '';
      if (outline) outline.innerHTML = '';
      return;
    }
    const profile = {
      hp: Number(fields.hp), threshold: idleClamp(tiers[Number(fields.tier)] + Number(fields.eat) / 100, .5),
      style: fields.style, protection: Number(fields.protection), armour: Number(fields.armour),
      resistance: Number(fields.resistance), vulnerability: Number(fields.damage)
    };
    const {group, target: selected, show: status} = fields;
    const query = fields.q.trim().toLowerCase();
    const urlParams = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== '' && val !== '0'));
    if (updateUrl) {
      const nextHash = route('idle', urlParams);
      urlTimer = setTimeout(() => {
        if (form.isConnected && location.hash !== nextHash) history.replaceState(history.state, '', nextHash);
      }, 200);
    }
    const thresholdText = 'Auto Eat triggers at ' + number(idleRoundEven(profile.hp * profile.threshold)) + ' HP.';
    if (threshold.textContent !== thresholdText) threshold.textContent = thresholdText;
    const seen = new Map();
    const check = (node, area) => {
      const key = node.key + '/' + (area?.key || '');
      if (!seen.has(key)) {
        if (!encounters.has(key)) encounters.set(key, idleEncounter(node, area));
        seen.set(key, {node, area, result: idleEvaluate(encounters.get(key), profile)});
      }
      return seen.get(key);
    };
    const matches = ({node, area}) => !query || [node.name, area?.name].some(name => name?.toLowerCase().includes(query));
    const visible = row => !status || resultKey(row) === status;
    const empty = '<p>No encounters match these filters.</p>';
    const sectionId = name => 'idle-' + name.toLowerCase().replaceAll(' ', '-');
    const monsterTable = rows => rows.length ? table(['Monster','Location','Max damage/event','Result'], rows.map(row => [
      link(row.node,true), row.area ? link(row.area,true) : '—', damageCell(row.result.worst),
      badge(resultKey(row), [...row.result.unresolved])
    ]), true) : empty;
    const areaRows = area => area.enemies.map(id => publicNode('Enemy',id)).filter(Boolean).map(node => check(node,area.node));
    function renderCategory(name) {
      if (name === all) {
        // A monster found in several places uses its most restrictive matching location.
        const risk = row => row.result.unresolved.size ? Infinity : row.result.worst?.value ?? Infinity;
        const rows = enemies.map(node => {
          const areas = locations.get(node.id) || [null];
          return areas.filter(area => !selected || area?.id === selected).map(area => check(node,area))
            .filter(matches).reduce((worst,row) => !worst || risk(row)>risk(worst) ? row : worst,null);
        }).filter(row => row && visible(row));
        return wikiSection(sectionId(name),name,monsterTable(rows));
      }
      const categoryAreas = locationsFor(name);
      const collections = name === slayer
        ? masters.map(node => ({node, areas: areas.filter(area => node.data.Areas.includes(area.node.id))}))
        : categoryAreas.map(area => ({node: area.node,areas:[area]}));
      const ranked = collections.filter(({node}) => !selected || node.id === selected).map(({node,areas}) => {
        const rows = areas.flatMap(areaRows);
        const keys = rows.map(resultKey);
        const key = keys.includes('exceeds') ? 'exceeds' : keys.includes('review') ? 'review' : 'fit';
        const nameMatches = Boolean(query && node.name.toLowerCase().includes(query));
        return {node, rows, key, nameMatches};
      }).filter(row => row.rows.length && (!query || row.nameMatches || row.rows.some(matches)));
      const summaries = ranked.filter(row => !status || row.key === status);
      const summary = summaries.length ? table([name === slayer ? 'Slayer Master' : 'Location','Max damage/event','Result'],
        summaries.map(({node, rows, key}) => {
          const worst = rows.reduce((max,row) => {
            const hit = row.result.worst;
            return hit && (!max || hit.value > max.value) ? hit : max;
          },null);
          const target = '<a class="row-link" href="' + escape(route('idle', {...urlParams, group: name, target: node.id})) +
            '">' + icon(node) + escape(node.name) + '</a>';
          return [target,damageCell(worst),badge(key)];
        }),true) : empty;
      const details = group && (selected || ranked.length) ? '<h3>Monster results</h3>' + monsterTable(
        [...new Set(ranked.flatMap(row => row.rows.filter(monster => (row.nameMatches || matches(monster)) && visible(monster))))]
      ) : '';
      return wikiSection(sectionId(name),name,summary+details);
    }
    const activeGroups = group ? [group] : groups;
    results.innerHTML = activeGroups.map(renderCategory).join('');
    if (outline) outline.innerHTML = '<h3>On This Page</h3>' + activeGroups.map(name => {
      const id = sectionId(name);
      return '<a href="#' + id + '" data-outline="' + id + '">' + escape(name) + '</a>';
    }).join('');
  }

  let frame, activeGroup = group;
  const groupInput = form.elements.namedItem('group');
  const targetInput = form.elements.namedItem('target');
  function syncLocation() {
    if (groupInput.value === activeGroup) return;
    activeGroup = groupInput.value;
    targetInput.innerHTML = locationOptions(activeGroup, '');
  }
  function selectLocation() {
    if (groupInput.value || !targetInput.value) return;
    const id = targetInput.value;
    groupInput.value = areas.find(area => area.node.id === id)?.category || slayer;
    activeGroup = groupInput.value;
    targetInput.innerHTML = locationOptions(activeGroup,id);
  }
  function update(updateUrl) {
    try {
      renderResults(updateUrl);
    } catch (error) {
      lastProfile = undefined;
      threshold.textContent = 'Could not calculate encounters.';
      results.innerHTML = '<p>Change a stat or filter to try the calculation again.</p>';
      if (outline) outline.innerHTML = '';
      console.error(error);
    }
  }
  function refresh(event) {
    if (event.target === targetInput) selectLocation();
    syncLocation();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (form.isConnected) update(true);
    });
  }
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', event => event.preventDefault());
  selectLocation();
  update(false);
}
