/* Reader-facing entity pages. Function declarations intentionally allow pre-render concatenation. */
function entityV2Named(type, id, withIcon = true) {
  const n = publicNode(type, id);
  return n ? link(n, withIcon) : escape(human(id || type));
}
function entityV2Requirements(n) {
  const r = requirements(n);
  return typeof r === 'object' ? r.html : r;
}
function entityV2HasRequirements(n) {
  return ['Requirements', 'UnlockRequirements', 'AccessRequirements', 'DisplayRequirements'].some(k => n.data[k]?.length) ||
    Object.values(n.data.Capabilities || {}).some(c => c.Requirements?.length);
}
function entityV2Money(q, id) {
  const currency = publicNode('Currency', id || 'MelvorBase:GoldPieces');
  return '<span class="entity-money">' + (currency ? icon(currency) : '') + number(q) + '</span>';
}
function entityV2Infobox(n, rows) {
  const src = imageSource(n.image);
  return '<aside class="wiki-infobox entity-infobox" aria-label="' + escape(n.name) + ' information"><h2>' + escape(n.name) + '</h2>' +
    (src ? '<div class="infobox-art"><img src="' + src + '" alt="' + escape(n.name) + '"></div>' : '') +
    '<dl><dt>ID</dt><dd><code>' + escape(n.id) + '</code></dd>' + rows.filter(r => r[1] !== '' && r[1] != null).map(r => '<dt>' + escape(r[0]) + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl></aside>';
}
function entityV2Render(n, rows, sections, intro = '') {
  const toc = '<nav class="wiki-toc entity-toc" aria-label="Contents"><div class="toc-title"><strong>Contents</strong><button type="button" data-toggle-toc aria-expanded="true">hide</button></div><ol>' +
    sections.map(s => '<li><a href="#' + s.id + '" data-jump="' + s.id + '">' + escape(s.title) + '</a>' +
      (s.children?.length ? '<ol>' + s.children.map(c => '<li><a href="#' + c.id + '" data-jump="' + c.id + '">' + escape(c.title) + '</a></li>').join('') + '</ol>' : '') + '</li>').join('') + '</ol></nav>';
  main.innerHTML = '<article class="entity-v2"><header class="page-head"><h1>' + escape(n.name) + '</h1></header>' +
    '<div class="entity-layout">' + entityV2Infobox(n, rows) + '<div class="entity-copy">' + intro + (sections.length ? toc : '') +
    sections.map(s => wikiSection(s.id, s.title, s.body)).join('') + '</div></div></article>';
}
function entityV2Unique(refs) {
  return [...new Map(refs.map(r => [r.from.key + '|' + r.path.slice(0, -2).join('/'), r])).values()];
}
function entityV2Tasks(n) {
  const refs = entityV2Unique((incoming.get(n.key) || []).filter(r => /^(MasteryGuildTask|Quest|SlayerTask)$/.test(r.from.type) && !r.path.some(p => /Reward|Context|Bonus/.test(String(p)))));
  if (!refs.length) return null;
  return {id:'tasks', title:'Tasks and Quests', body:table(['Task / Quest', 'Objective'], refs.map(r => [link(r.from, true), entityV2TaskObjective(r,n)]), true)};
}
function entityV2TaskObjective(r,n) {
  if (r.from.data.Goal) return wikiTaskObjective(r.from);
  if (r.from.type === 'Quest' && r.path.includes('Costs')) return 'Provide ' + publicQty(r.parent || {}) + ' × ' + link(n,true);
  let current=r.from.data, condition=null, step=null;
  for(const part of r.path){
    current=current?.[part];
    if(current?.Type)condition=current;
    if(current?.TasksInOrder)step=current;
  }
  if(condition)return wikiTaskCondition(condition,r.from);
  return step?.Description ? escape(clean(displayText(step.Description))) : entityV2Requirements(r.from);
}
function entityV2Damage(d) {
  const f = d?.Formula || {}, x = f.Data || {}, p = number((x.Percent ?? 1) * 100) + '%';
  const who = {Attacker:"attacker's", Target:"target's", Source:"source's", Self:"affected character's"}[d?.Character] || "character's";
  if (bare(f.Type || '') === 'NormalDamage') return p + ' of ' + who + ' normal damage';
  if (bare(f.Type || '') === 'MaxHit') return p + ' of ' + who + ' maximum hit';
  if (bare(f.Type || '') === 'CurrentHitpoints') return p + ' of ' + who + ' current hitpoints';
  return escape(human(f.Type || 'Damage'));
}
function entityV2EffectNode(effect) {
  const id = effect?.Data?.Effect;
  return id ? (byId.get(id) || []).find(n => /Effect$/.test(n.type)) : null;
}
function entityV2Effect(effect, depth = 0) {
  const e = entityV2EffectNode(effect), cfg = effect?.Data?.Configuration || {}, d = e?.data || {}, lines = [];
  if (!e) return escape(human(effect?.Type || 'Effect'));
  const turns = cfg.Turns ?? d.DefaultTurns;
  if (turns != null) lines.push(number(turns) + ' turn' + (turns === 1 ? '' : 's'));
  if (e.type === 'StunEffect') lines.push('prevents actions');
  if (d.ProcCount != null) {
    const damage = d.DamagePerProc ? entityV2Damage(d.DamagePerProc) : number(d.PercentDamageDealtPerProc * 100) + '% of damage dealt by the triggering hit';
    lines.push(damage + ' per tick; ' + number(d.ProcCount) + ' ticks, every ' + number(d.ProcInterval / 1000) + ' s');
  }
  if (d.DamagePerTurn) lines.push(entityV2Damage(d.DamagePerTurn) + ' damage at end of turn');
  if (d.HealingPerTurn) lines.push('heals ' + entityV2Damage(d.HealingPerTurn) + ' at end of turn');
  if (d.MaxStacks != null) lines.push('adds ' + number(cfg.StacksToAdd ?? d.DefaultStacksToAdd ?? 1) + ' stack(s), maximum ' + number(d.MaxStacks));
  if (d.DefaultMinStacks != null) lines.push('random magnitude: ' + number(cfg.MinStacks ?? d.DefaultMinStacks) + '–' + number(cfg.MaxStacks ?? d.DefaultMaxStacks) + ' stacks');
  if (d.StacksRequired != null) lines.push('adds ' + number(cfg.StacksToAdd ?? d.DefaultStacksToAdd ?? 1) + ' stack(s); ' + number(d.StacksRequired) + ' stacks required' + (d.RemoveOnMiss ? '; removed on miss' : ''));
  if (d.DefaultAttacks != null) lines.push('lasts ' + number(cfg.Attacks ?? d.DefaultAttacks) + ' attack(s)');
  if (d.Modifiers) {
    const b = wikiAllBonusText(d.Modifiers, e);
    if (b !== '—') lines.push(b + ((d.MaxStacks || d.DefaultMinStacks || d.StacksRequired) ? ' per stack' : ''));
  }
  if (d.RemovalEffect && depth < 2) lines.push('On removal: ' + entityV2Effect(d.RemovalEffect, depth + 1));
  return '<span class="entity-effect-name">' + icon(e) + '<strong>' + escape(e.name) + '</strong></span>' + (lines.length ? ': ' + lines.join('; ') : '');
}
function entityV2AppliedEffect(row, timing) {
  const target = row.AppliesTo === 'Self' ? 'self' : row.AppliesTo === 'Target' ? 'target' : human(row.AppliesTo || 'Target');
  return '<li>' + escape(timing) + ': ' + number((row.Chance ?? 1) * 100) + '% chance on ' + escape(target) + ' — ' + entityV2Effect(row.Effect) + '</li>';
}
function entityV2Attack(a, chance) {
  const d = a.data;
  const hits = (d.Hits || []).map(h => '<li>' + number(h.Count ?? 1) + ' hit' + ((h.Count ?? 1) === 1 ? '' : 's') + ', each dealing ' +
    (h.Damage || []).map(entityV2Damage).join(' + ') + ((h.Count ?? 1) > 1 ? '; ' + number(h.Interval / 1000) + ' s between hits' : '') + '.</li>').join('');
  const effects = [...(d.PreHitEffects || []).map(x => entityV2AppliedEffect(x, 'Before hit')), ...(d.OnHitEffects || []).map(x => entityV2AppliedEffect(x, 'On hit'))].join('');
  const image = a.image && !/missing_artwork/.test(a.image) ? icon(a) : '';
  return '<div class="entity-attack"><h3>' + image + escape(a.name) + ' <span class="entity-chance">(' + number(chance * 100) + '%)</span></h3>' +
    '<ul>' + hits + effects + '</ul><p class="wiki-note">' + (d.IsAvoidable === false ? 'Cannot be avoided.' : 'Can be avoided.') +
    (d.DamageType ? ' Damage type: ' + escape(human(d.DamageType)) + '.' : '') + '</p></div>';
}
function entityV2Trigger(trigger) {
  const d = trigger?.Data || {}, type = bare(trigger?.Type || '');
  if (type === 'AtStartOfFight') return 'At the start of combat';
  if (type === 'OnDeath') return 'On death';
  if (type === 'WhenAttacked') return ({WhenHit:'When hit by an attack',WhenAttackEvaded:'When evading an attack'}[d.Type] || 'When attacked');
  if (type === 'OnAttack') return ({OnHit:'On a successful hit', OnMiss:'On a miss', BeforeHit:'Before a hit', BeforeAttack:'Before attacking', OnBeingHit:'When hit', OnAttack:'When attacking',OnFirstAttack:'On the first attack'}[d.Type] || 'When attacking (' + human(d.Type || '') + ')');
  return human(type || 'Combat trigger');
}
function entityV2Passive(p) {
  const b = p.data.Modifiers || {}, numeric = wikiAllBonusText({Global:b.Global, Component:b.Component}, p);
  return '<div class="entity-passive"><h3>' + (p.image && !/missing_artwork/.test(p.image) ? icon(p) : '') + escape(p.name) + '</h3>' +
    (numeric !== '—' ? '<p>' + numeric + '</p>' : '') +
    (b.CombatEffect?.length ? '<ul>' + b.CombatEffect.map(r => entityV2AppliedEffect({...r.Modifier, Chance:r.Chance}, entityV2Trigger(r.Modifier?.Trigger))).join('') + '</ul>' : '') + '</div>';
}
function entityV2ItemEffects(n) {
  const cap = n.data.Capabilities || {}, pieces = [];
  for (const [key, c] of Object.entries(cap)) {
    if (c.BaseHealing != null) pieces.push('<p>Heals <strong>' + number(c.BaseHealing) + '</strong> hitpoints when eaten.</p>');
    const stats = c.Stats;
    const rows = [...(stats?.Stats || []).map(r => [entityV2Named('CombatStat', r.Stat), number(/AttackInterval/.test(r.Stat) ? r.Value / 1000 : r.Value) + (/AttackInterval/.test(r.Stat) ? ' s' : '')]),
      ...(stats?.PowerRatings || []).map(r => ['Power Rating · ' + escape(human(r.DamageType)), number(r.Value)]),
      ...(stats?.ProtectionRatings || []).map(r => ['Protection Rating · ' + escape(human(r.DamageType)), number(r.Value)])];
    if (rows.length) pieces.push(table(['Stat', 'Value'], rows, true));
    if (c.Bonuses) {
      const text = wikiAllBonusText(c.Bonuses, n);
      if (text !== '—') pieces.push('<p>' + text + '</p>');
      if (c.Bonuses.CombatEffect?.length) pieces.push('<ul>' + c.Bonuses.CombatEffect.map(r => entityV2AppliedEffect({...r.Modifier, Chance:r.Chance}, entityV2Trigger(r.Modifier?.Trigger))).join('') + '</ul>');
    }
    if(c.CurrencyGain)pieces.push('<p>Bury to gain ' + publicQty(c.CurrencyGain) + ' × ' + entityV2Named('Currency',c.CurrencyGain.Currency) + '.</p>');
    for(const [field,value] of Object.entries(c)){
      if(field!=='Bonuses' && /Bonuses$|ModifierTemplate$/.test(field) && value){
        const text=wikiAllBonusText(value,n);
        if(text!=='—')pieces.push('<p>'+escape(human(field))+': '+text+'</p>');
      }
    }
    if (c.Attacks?.length) pieces.push(c.Attacks.map(r => {
      const a = publicNode('Attack', typeof r === 'string' ? r : r.Attack);
      return a ? entityV2Attack(a, r.Chance ?? 1) : '';
    }).join(''));
    if (!['MelvorBase:Equipment','MelvorBase:Weapon','MelvorBase:Toolbelt','MelvorBase:Food','MelvorBase:Openable'].includes(key)) {
      const details = Object.entries(c).filter(([k,v]) => v != null && typeof v !== 'object' && !/^(Type|Id)$/.test(k));
      if (details.length) pieces.push(table(['Property', 'Value'], details.map(([k,v]) => [escape(human(k)), typeof v === 'number' && /Chance|Percent/.test(k) ? number(v*100)+'%' : typeof v==='string' ? escape(human(v)) : escape(String(v))])));
    }
  }
  return pieces.join('');
}
function publicItem(n) {
  const refs = incoming.get(n.key) || [], cap = n.data.Capabilities || {}, sections = [];
  const sources = entityV2Unique(refs.filter(r => r.role === 'source' && publicLinkable(r.from) && !/Task|Quest/.test(r.from.type)));
  const creation = sources.filter(r => ['ArtisanRecipe','CookingRecipe','HerbloreRecipe','GrainMillRecipe','FarmingRecipe'].includes(r.from.type));
  const loot = sources.filter(r => !creation.includes(r));
  const uses = entityV2Unique(refs.filter(r => r.role === 'use' && publicLinkable(r.from) && !/Task|Quest/.test(r.from.type)));
  const info = [['Category', 'Item'], ['Type', Object.keys(cap).length ? Object.keys(cap).map(k => escape(human(k))).join('<br>') : 'Resource'],
    ['Sells For', publicPrice(n) == null ? 'Not sellable' : entityV2Money(publicPrice(n), n.data.SellsFor?.Currency)]];
  const equip = cap['MelvorBase:Equipment'], tool = cap['MelvorBase:Toolbelt'], weapon = cap['MelvorBase:Weapon'];
  if (equip?.Type) info.push(['Equipment Type', entityV2Named('EquipmentType', equip.Type)]);
  if (tool?.FitsInSlot) info.push(['Toolbelt Slot', entityV2Named('ToolbeltSlot', tool.FitsInSlot)]);
  if (weapon?.Type) info.push(['Combat Style', escape(human(weapon.Type))]);
  if (weapon?.DamageType) info.push(['Damage Type', escape(human(weapon.DamageType))]);
  if (entityV2HasRequirements(n)) info.push(['Requirements', entityV2Requirements(n)]);
  const effects = entityV2ItemEffects(n);
  if (effects) sections.push({id:'effects', title:'Stats and Effects', body:effects});
  const sourceChildren = [], sourceBody = [];
  if (creation.length) {
    sourceChildren.push({id:'creation', title:'Creation'});
    sourceBody.push('<h3 id="creation">Creation</h3>' + table(['Skill','Requirements','Ingredients','XP','Base Time','Quantity'], creation.map(r => {
      const a = r.from, d = a.data;
      const time = d.BaseInterval != null ? d.BaseInterval * (d.Steps || 1) / 1000 : d.BaseGrowthTime != null ? d.BaseGrowthTime / 1000 : null;
      return [publicSkills(a), requirements(a), wikiCosts(d.Ingredients || d.Costs,a), numericCell(d.BaseExperience), numericCell(time,' s'),publicQty(r.parent || {})];
    }),true));
  }
  if (loot.length) {
    sourceChildren.push({id:'loot', title:'Loot'});
    sourceBody.push('<h3 id="loot">Loot</h3>' + polishLootSources(loot));
  }
  if (sourceBody.length) sections.push({id:'sources',title:'Item Sources',children:sourceChildren,body:sourceBody.join('')});
  if (uses.length) sections.push({id:'uses',title:'Uses',body:table(['Product / Action','Skill','Requirements','XP','Ingredients / Cost'],uses.map(r => {
    const a=r.from,d=a.data, products=d.Products || (d.Product ? [typeof d.Product === 'string' ? {Item:d.Product}:d.Product]:[]);
    return [products.length?publicItems(products,a):link(a,true),publicSkills(a),requirements(a),numericCell(d.BaseExperience),wikiCosts(d.Ingredients || d.Costs || {Items:[r.parent]},a)];
  }),true)});
  const open=cap['MelvorBase:Openable'];
  if (open && (open.AlwaysDrops?.length || open.DropTable?.length)) sections.push({id:'contents',title:'Contents',body:
    (open.AlwaysDrops?.length ? '<h3>Guaranteed Contents</h3>' + publicRows(open.AlwaysDrops,n) : '') +
    (open.DropTable?.length ? '<h3>Random Contents</h3>' + publicLootTables([{Chance:1,Table:open.DropTable}],n) : '')});
  const tasks=entityV2Tasks(n); if(tasks)sections.push(tasks);
  const description=n.data.Description ? '<p>' + escape(clean(displayText(n.data.Description))) + '</p>' : '';
  entityV2Render(n,info,sections,description);
}
function publicMonster(n) {
  const s = payload.monsters?.enemies?.[bare(n.id)]; if (!s) return false;
  const sections=[], attacks=n.data.Attacks || [], passives=n.data.Passives || [], drops=n.data.Drops || {};
  const stats=[['Combat Level',number(s.combatLevel)],['Hitpoints',number(s.hitpoints)],['Attack Speed',number(s.attackSeconds)+' s'],
    ['Base Maximum Hit',s.maxHits.map(h => escape(h.style)+' ('+escape(h.stance)+'): '+number(h.maxHit)).join('<br>')],
    ['Power Rating',number(s.powerRating)],['Protection Rating',number(s.protectionRating)],['Armour',number(s.armour)],['Ward',number(s.ward)]];
  const levelRows=(n.data.Levels || []).map(r=>[entityV2Named('Skill',r.Key),number(r.Value)]);
  sections.push({id:'combat',title:'Combat',body:'<div class="entity-combat-tables">'+table(['Statistic','Value'],stats)+ (levelRows.length ? table(['Skill','Level'],levelRows) : '') + '</div><p class="wiki-note">Base values before active effects, target defenses and the combat triangle. Damage reduction depends on power and protection ratings.</p>'});
  if(s.locations?.length)sections.push({id:'locations',title:'Locations',body:table(['Location','Requirements'],s.locations.map(l=>{const a=publicNode(l.type,l.id);return [entityV2Named(l.type,l.id),a?requirements(a):'—'];}),true)});
  const normal=publicNode('Attack','MelvorBase:Normal'), normalChance=Math.max(0,1-attacks.reduce((v,a)=>v+(a.Chance || 0),0));
  const attackBody=(normal && normalChance>0 ? entityV2Attack(normal,normalChance):'')+attacks.map(r=>{const a=publicNode('Attack',typeof r==='string'?r:r.Attack);return a?entityV2Attack(a,r.Chance??1):'';}).join('');
  if(attackBody)sections.push({id:'attacks',title:'Attacks',body:attackBody});
  if(passives.length)sections.push({id:'passives',title:'Passives',body:passives.map(r=>{const p=publicNode('CombatPassive',typeof r==='string'?r:r.Passive);return p?entityV2Passive(p):'';}).join('')});
  const fixed=[...(drops.FixedItems || []),...(drops.FixedCurrencies || [])], tables=(drops.ItemTables || []).filter(t=>t.Table?.length);
  if(fixed.length || tables.length)sections.push({id:'drops',title:'Drops',body:(fixed.length?'<h3>Always Drops</h3>'+publicRows(fixed,n):'')+(tables.length?'<h3>Loot</h3>'+publicLootTables(tables,n):'')+publicEnemyValue(n)});
  const tasks=entityV2Tasks(n);if(tasks)sections.push(tasks);
  const info=[['Category','Monster'],['Combat Style',s.maxHits.map(h=>escape(h.style)).filter((x,i,a)=>a.indexOf(x)===i).join(', ')],['Damage Type',escape(human(n.data.DamageType))],['Element',escape(human(n.data.Element))]];
  if(entityV2HasRequirements(n))info.push(['Requirements',entityV2Requirements(n)]);
  entityV2Render(n,info,sections);return true;
}
function wikiPetPage(n) {
  const d=n.data.Trigger?.Data || {}, skill=publicNode('Skill',d.Component?.Entity), sections=[];
  const skillLabel=skill?link(skill,true):'skill';
  const unlock=n.data.Goal?wikiTaskObjective({...n,data:{Goal:n.data.Goal}}):'Earn '+skillLabel+' XP. <a href="#/pets?section=drop-rates">Drop Rates</a>.';
  sections.push({id:'pet-unlock',title:'Unlock',body:'<p>'+unlock+'</p>'});
  const effect=wikiAllBonusText(n.data.Bonuses,n);
  if(effect && effect!=='—')sections.push({id:'pet-effect',title:'Effect',body:'<p>'+effect+'</p>'});
  entityV2Render(n,[['Category','Pet'],['Skill',skillLabel]],sections,n.data.Description?'<p>'+escape(clean(displayText(n.data.Description)))+'</p>':'');
}
