const idleClamp = (value, max) => Math.min(max, Math.max(0, value));

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
    category: node.type === 'Dungeon' ? 'Dungeons' : ({
      SlayerZones: 'Slayer areas', DarkAreas: 'Dark areas', Quests: 'Quest encounters'
    })[bare(node.data.Category)] || 'Combat areas',
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
  const notes = new Set(), unresolved = new Set(), immunities = new Set();
  const totals = {Enemy: {}, Player: {}};
  const attacks = [], effects = new Map(), visited = new Set();
  const enemyMods = new Set(['FlatMaxHit', 'PercentMaxHit', 'FlatPowerRating', 'PercentPowerRating', 'PercentDamageDealt',
    'FlatCriticalHitChance', 'FlatCriticalHitMultiplier', 'PercentAttackReflect']);
  const playerMods = new Set(['FlatProtectionRating', 'PercentProtectionRating', 'FlatResistance', 'PercentResistance',
    'ResistanceCombatTriangle', 'PercentDamageTaken', 'PercentDamageTakenFrom', 'PercentDamageTakenFromAttacks',
    'FlatMaxHitpoints', 'PercentMaxHitpoints', 'FlatAutoEatThreshold', 'FlatAutoEatLimit']);
  function addMod(mod, side, scale) {
    if (!side || !mod?.Stat) return;
    const name = mod.Stat.Name, value = mod.Value * scale;
    if (side === 'Enemy' && name === 'ImmunityFrom' && value > 0) {
      immunities.add(bare(mod.LocalContext?.CombatStyle || 'All'));
    }
    if (name === 'PercentHealing' && side === 'Food' && value < 0) notes.add('Reduced healing per food');
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
    if (side === 'Player' || type === 'Stacking' || effect.Modifiers?.some(mod => enemyMods.has(mod.Stat?.Name))) {
      notes.add(effect.DisplayName || human(id));
    }
    const scale = type === 'Stacking' ? effect.MaxStacks : type === 'RandomMagnitude'
      ? Math.max(effect.DefaultMaxStacks || 1, configured.Data?.Configuration?.MaxStacks || 1) : 1;
    for (const mod of effect.Modifiers || []) addMod(mod, side, scale);
    if (side === 'Player' && (effect.DamagePerProc || effect.DamagePerTurn || type === 'Bleed')) {
      effects.set(key, {effect, source, name: effect.DisplayName || human(id)});
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
  if (area?.data.Darkness) notes.add('Darkness lowers accuracy and evasion');
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
      unresolved.add('Missing attack data: ' + human(choice.Attack));
      continue;
    }
    for (const row of [...(attack.PreHitEffects || []), ...(attack.OnHitEffects || [])]) {
      if (row.Chance > 0) addEffect(row.Effect, row.AppliesTo === 'Self' ? 'Enemy' : 'Player', 'Enemy');
    }
    attacks.push(attack);
  }
  if (totals.Enemy.PercentAttackReflect) notes.add('Reflect can leave you at 1 HP and trigger Auto Eat');
  return {enemy, stats, totals, attacks, effects: [...effects.values()], notes, unresolved, immunities};
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
        damage.push({name: attack.DisplayName || human(attack.Id), value: hitDamage, style: stance.style, raw});
        if (armour > 0 && hitDamage >= armour) canBreakArmour = true;
        maxDirect = Math.max(maxDirect, hitDamage);
      }
    }
    for (const {effect, source, name} of effects) {
      const row = effect.DamagePerProc || effect.DamagePerTurn;
      const owner = row?.Character === 'Target' ? 'Player' : source;
      const raw = Math.max(1, row ? roll(row, owner, maxDirect) : Math.ceil(maxDirect * effect.PercentDamageDealtPerProc)) * (effect.MaxStacks || 1);
      if (source === 'Player') unresolved.add('Player-sourced damage: ' + name);
      damage.push({name, value: reduce(raw, false), style: stance.style, raw});
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

function idleMinimumHP(encounter, profile, result) {
  if (result.unresolved.size || !result.worst || !profile.threshold) return null;
  const hasHPScaling = encounter.attacks.some(attack => attack.Hits.some(hit =>
    hit.Damage.some(row => row.Character === 'Defender' && /Hitpoints$/.test(row.Formula?.Type || ''))));
  const hasEffectHPScaling = encounter.effects.some(({effect, source}) => {
    const row = effect.DamagePerTurn || effect.DamagePerProc;
    return /Hitpoints$/.test(row?.Formula?.Type || '') &&
      (row.Character === 'Target' || source === 'Player');
  });
  if (hasHPScaling || hasEffectHPScaling) return null;
  let low = 1, high = Math.ceil((result.worst.value + 1) / profile.threshold);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (idleRoundEven(middle * profile.threshold) >= result.worst.value) high = middle;
    else low = middle + 1;
  }
  return low;
}

function idleMinimumProtection(encounter, profile, result) {
  if (result.unresolved.size || !result.worst || !profile.threshold) return null;
  const fits = protection => idleEvaluate(encounter, {...profile, protection}).fits;
  if (fits(0)) return 0;
  let high = 1;
  while (high < 1000000 && !fits(high)) high *= 2;
  high = Math.min(high, 1000000);
  if (!fits(high)) return null;
  let low = Math.floor(high / 2);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

function idlePage(params) {
  const {areas} = idleData();
  const tiers = idleAutoEatRates(), styles = ['Melee', 'Ranged', 'Magic'];
  const enemies = byType.get('Enemy') || [];
  const masters = byType.get('SlayerMaster') || [];
  const all = 'All monsters';
  const groups = [all, 'Combat areas', 'Slayer areas', 'Slayer masters', 'Dungeons', 'Dark areas', 'Quest encounters'];
  const group = groups.includes(params.get('group')) ? params.get('group') : all;
  const value = (key, fallback, min, max) => params.has(key) && params.get(key) !== ''
    ? Math.max(min, Math.min(max, Number(params.get(key)) || 0)) : fallback;
  const hp = Math.round(value('hp', 100, 1, 1000000)), tier = Math.round(value('tier', 1, 1, 3));
  const bonus = value('eat', 0, -35, 15);
  const profile = {
    hp, threshold: idleClamp(tiers[tier] + bonus / 100, .5),
    style: styles.includes(params.get('style')) ? params.get('style') : 'Melee',
    protection: value('protection', 0, 0, 1000000), armour: value('armour', 0, 0, 1000000),
    resistance: value('resistance', 0, -100, 70), vulnerability: value('damage', 0, 0, 1000)
  };
  const selected = params.get('target') || '';
  const query = (params.get('q') || '').trim().slice(0, 80);
  const status = ['fit', 'exceeds', 'review'].includes(params.get('show')) ? params.get('show') : '';
  const options = [moneyOption('', group === all ? 'All locations' : 'All in category', selected)];
  const showAreas = areas.filter(area => area.category === group || group === all);
  if (group === 'Slayer masters') options.push(...masters.map(node => moneyOption(node.id, node.name, selected)));
  else options.push(...showAreas.map(({node}) => moneyOption(node.id, node.name, selected)));
  const numberField = (name, label, selectedValue, min, max, step = 1) => '<label>' + label +
    ' <input name="' + name + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' +
    (selectedValue ?? '') + '"></label>';
  main.innerHTML = '<h1>Can I Idle?</h1><p>Check a fight against your Auto Eat threshold with unlimited equipped food. Enter your max HP, protection rating and armour as they appear outside combat.</p>' +
    '<form id="idle-profile"><fieldset><legend>Your character</legend><div class="idle-fields">' +
    numberField('hp', 'Max HP', hp, 1, 1000000) + numberField('protection', 'Protection rating', profile.protection, 0, 1000000) +
    numberField('armour', 'Armour', profile.armour, 0, 1000000) + '<label>Auto Eat <select name="tier">' +
    tiers.slice(1).map((rate, i) => moneyOption(i + 1, (i + 1) + ' (' + Math.round(rate * 100) + '%)', tier)).join('') +
    '</select></label><label>Combat style <select name="style">' + styles.map(style => moneyOption(style, style, profile.style)).join('') + '</select></label></div>' +
    '<details' + (params.has('eat') || profile.resistance || profile.vulnerability ? ' open' : '') + '><summary>Advanced stats</summary><div class="idle-fields">' +
    numberField('eat', 'Auto Eat bonus (percentage points)', bonus, -35, 15, .1) +
    numberField('resistance', 'Flat resistance (%)', profile.resistance, -100, 70, .1) +
    numberField('damage', 'Extra damage taken (%)', profile.vulnerability, 0, 1000, .1) +
    '</div><p>Protection rating is handled separately from flat resistance.</p></details></fieldset>' +
    '<fieldset><legend>Encounters</legend><div class="idle-fields"><label>Category <select name="group">' +
    groups.map(name => moneyOption(name, name, group)).join('') + '</select></label><label>Location or master <select name="target">' +
    options.join('') + '</select></label><label>Find a monster or area <input type="search" name="q" maxlength="80" value="' + escape(query) +
    '"></label><label>Result <select name="show">' + ['', 'fit', 'exceeds', 'review'].map(key => moneyOption(key, {
      '': 'Any result', fit: 'Within limit', exceeds: 'Above limit', review: 'Review needed'
    }[key], status)).join('') + '</select></label></div></fieldset><button>Check encounters</button></form>' +
    '<p><strong>Auto Eat triggers at ' + number(idleRoundEven(hp * profile.threshold)) + ' HP.</strong> A damage event must leave you alive before Auto Eat can fire. ' +
    'Each hit or damage tick is checked separately. The estimate allows for armour breaking mid-fight. Ward and temporary defensive buffs are left out of the limit.</p>' +
    '<p>Enemy bonuses and harmful effects are tested together at their upper bounds. Above limit means the estimate cannot certify unattended survival. ' +
    'Review needed flags mechanics or stats the calculator could not bound. HP and protection targets each hold your other stats fixed.</p><div id="idle-results"></div>';

  const results = main.querySelector('#idle-results');
  const seen = new Map();
  const check = (node, area) => {
    const key = node.key + '/' + (area?.key || '');
    if (!seen.has(key)) {
      const encounter = idleEncounter(node, area);
      seen.set(key, {node, area, encounter, result: idleEvaluate(encounter, profile)});
    }
    return seen.get(key);
  };
  const resultKey = ({result}) => result.unresolved.size ? 'review' : result.fits ? 'fit' : 'exceeds';
  const matches = ({node, area}) => !query || [node.name, area?.name].some(name => name?.toLowerCase().includes(query.toLowerCase()));
  const badge = key => '<span class="idle-result idle-' + key + '">' + {fit: 'Within limit', exceeds: 'Above limit', review: 'Review needed'}[key] + '</span>';
  const numeric = value => Number.isFinite(value) ? numericCell(value) : '—';
  const needs = row => row.needs ||= [idleMinimumHP(row.encounter, profile, row.result), idleMinimumProtection(row.encounter, profile, row.result)];
  const detailTable = rows => table(['Monster','Location','Worst damage source','Max damage/event','HP needed','Protection needed','Result','Mechanics'],
    rows.map(row => [link(row.node,true), row.area ? link(row.area,true) : '—',
      escape(row.result.worst?.name || '—'), numeric(row.result.worst?.value), ...needs(row).map(numeric), badge(resultKey(row)),
      [...row.result.unresolved, ...(row.result.canBreakArmour ? ['Can break your armour'] : []), ...row.encounter.notes].map(escape).join('<br>') || '—']), true);
  let detailRows = [], summary = '';
  if (group === all && !selected) {
    const locations = new Map();
    for (const area of areas) for (const id of area.enemies) {
      if (!locations.has(id)) locations.set(id, []);
      locations.get(id).push(area.node);
    }
    // A monster in several locations is shown under its most restrictive result.
    detailRows = enemies.map(node => {
      const rows = (locations.get(node.id) || [null]).map(area => check(node, area));
      const risk = row => row.result.unresolved.size > 0 ? Infinity : row.result.worst?.value ?? Infinity;
      return query ? (rows.filter(matches).sort((a,b) => risk(b) - risk(a))[0] || rows[0])
        : rows.sort((a,b) => risk(b) - risk(a))[0];
    });
  } else {
    const collections = group === 'Slayer masters'
      ? masters.filter(node => !selected || node.id === selected).map(node => ({node, areas: areas.filter(a => node.data.Areas.includes(a.node.id))}))
      : showAreas.filter(a => !selected || a.node.id === selected).map(a => ({node: a.node, areas: [a]}));
    const completed = collections.map(collection => ({
      node: collection.node,
      rows: collection.areas.flatMap(({node, enemies: ids}) => ids.map(id => publicNode('Enemy', id)).filter(Boolean).map(enemy => check(enemy, node)))
    })).filter(row => row.rows.length);
    const collectionKey = rows => rows.some(row => resultKey(row) === 'exceeds') ? 'exceeds'
      : rows.some(row => resultKey(row) === 'review') ? 'review' : 'fit';
    summary = table([group === 'Slayer masters' ? 'Slayer master' : 'Location','Worst encounter','Max damage/event','HP needed','Protection needed','Result'],
      completed.filter(row => (!query || row.rows.some(matches)) && (!status || collectionKey(row.rows) === status)).map(({node,rows}) => {
        const worst = rows.reduce((a,b) => (b.result.worst?.value || 0) > (a.result.worst?.value || 0) ? b : a);
        const key = collectionKey(rows);
        const limits = rows.map(needs);
        const maximum = column => {
          const values = limits.map(row => row[column]);
          return values.every(Number.isFinite) ? numericCell(Math.max(...values)) : '—';
        };
        const target = '<a class="row-link" href="' + escape(route('idle', {...Object.fromEntries(params), group, target: node.id})) +
          '">' + icon(node) + escape(node.name) + '</a>';
        return [target,link(worst.node,true),numeric(worst.result.worst?.value),maximum(0),maximum(1),badge(key)];
      }),true);
    detailRows = [...new Set(completed.flatMap(row => row.rows))];
  }
  detailRows = detailRows.filter(row => matches(row) && (!status || resultKey(row) === status));
  results.innerHTML = summary + '<h2>Monster results</h2>' + (detailRows.length
    ? detailTable(detailRows) : '<p>No encounters match these filters.</p>');
  const form = main.querySelector('#idle-profile');
  function submit(resetTarget = false) {
    const fields = new FormData(form);
    if (resetTarget) fields.delete('target');
    location.hash = route('idle', Object.fromEntries([...fields].filter(([, val]) => val !== '' && val !== '0')));
  }
  form.addEventListener('submit', event => { event.preventDefault(); submit(); });
  form.elements.group.addEventListener('change', () => submit(true));
  form.elements.target.addEventListener('change', () => submit());
  form.elements.show.addEventListener('change', () => submit());
}
