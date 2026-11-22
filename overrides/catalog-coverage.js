function catalogSkillTypes() {
  return catalogSkillTypes.cached ??= {
    Magic:['MagicSpell','Imbuement','SpellBook','Element','ElementalBonus'],
    Prayer:['PrayerSlot','PrayerSlotType'],
    Farming:['FarmingPlot','GrainMill','FarmingMillCategory','GrainMillRecipe'],
    Ranching:['RanchingLand','RanchingEnclosure','RanchingEnclosureUpgrade'],
    Hunting:['HuntingTool','HuntingTrapType','HuntingJournalBonus','HuntingAnimalSpecies'],
    Agility:['AgilityCoursePath'],
    Thieving:['ThievingHeistBonus','ThievingRecipeType'],
    Firemaking:['FiremakingEvent'],
    Astrology:['AstrologyItemEvent','AstrologyObservationEvent','AstrologyTableEvent','AstrologyEventType']
  };
}

function catalogCombatType(type) {
  return /^(?:MagicSpell|Imbuement|SpellBook|Prayer(?:Slot(?:Type)?)?|Combat(?:Style|Level|Stat(?:Category)?|Passive|TriangleBonus|AreaCategory|AreaDifficulty)|Attack(?:Stance)?|DamageType|WeaponType|AmmoType|EquipmentSlot|LoadoutSlot|Element(?:alBonus)?)$/.test(type) ||
    /Effect$/.test(type);
}

function catalogFeatured(type) {
  return catalogCombatType(type) || /^(?:NPC|EquipmentType|ToolbeltSlot|RareBonusesEvent)$/.test(type) ||
    Object.values(catalogSkillTypes()).some(types=>types.includes(type));
}

function catalogDirectoryLink(node) {
  const screen = publicLinkable(node) && publicCanonical(node) === node ? 'scheda' : 'record';
  return '<a class="row-link" href="' + escape(route(screen,{id:node.key})) + '">' + icon(node) + escape(node.name) + '</a>';
}

function catalogIndex() {
  const types = [...new Set([...Object.keys(game.Objects), ...byType.keys()])].sort((a,b)=>collator.compare(typeName(a),typeName(b)));
  const groups = new Map([
    ['combat-data','Combat and Magic'], ['skill-data','Skills and Crafting'],
    ['world-data','Items and the World'], ['reference-data','System Data']
  ]);
  const rows = new Map([...groups.keys()].map(id=>[id,[]]));
  for (const type of types) {
    const group = catalogCombatType(type) || /^(CombatArea|Dungeon|Enemy|Slayer)/.test(type) ? 'combat-data' :
      /^(Recipe|Skill$|Farming|Firemaking|Thieving|Agility|Astrology|Fishing|Woodcutting|Mining|Herblore|GrainMill|Hunting|Ranching|Cooking|Artisan|MasteryGuild)/.test(type) ? 'skill-data' :
      /^(Item|Shop|Pet|Currency|BankTag|Quest|NPC|Equipment|Weather|DaySegment)/.test(type) ? 'world-data' : 'reference-data';
    rows.get(group).push([
      '<a href="'+escape(route('famiglia',{id:type}))+'">'+escape(typeName(type))+'</a>', numericCell(byType.get(type)?.length || 0)
    ]);
  }
  const sections = [...groups].map(([id,name])=>[id,name,table(['Category','Entries'],rows.get(id),true)]);
  main.innerHTML = '<h1>Game Data Index</h1><p>Browse the records included in this build. A count of zero marks a category with no records.</p>' +
    wikiContents(sections) + sections.map(([id,name,body])=>wikiSection(id,name,body)).join('');
}

function catalogSkillReference(skill) {
  const types = (catalogSkillTypes()[skill] || []).filter(type=>type !== 'MagicSpell' && byType.get(type)?.length);
  if (!types.length) return '';
  return table(['Category','Entries'],types.map(type=>[
    '<a href="' + escape(route('famiglia',{id:type})) + '">' + escape(typeName(type)) + '</a>',
    numericCell(byType.get(type).length)
  ]),true);
}

function catalogImbuementNodes(available) {
  const configured = new Set((game.EntityConfig[namespaced('Combat')]?.Imbuements || []).map(row=>row.Id ?? row));
  return (byType.get('Imbuement') || []).filter(node=>configured.has(node.id)===available).sort(wikiByLevel);
}

function catalogImbuements(full) {
  const configured = catalogImbuementNodes(true), unlisted = catalogImbuementNodes(false);
  const list = nodes => table(['Imbuement','Magic Level','Element','Runes per Attack Turn','Effect'],nodes.map(node=>[
    link(node,true),numericCell(wikiLevel(node)),entityV2Named('Element',node.data.Element),
    wikiCountedItems(node.data.RuneCosts,node),catalogEffects(node)
  ]),true);
  return '<p>Equip an imbuement whose element is available to your character. Rune costs are checked at the start of an attack turn. The listed effect rolls on the first successful hit of that attack.</p>' +
    list(configured) + (full ?
      (unlisted.length ? wikiSection('unlisted-imbuements','Data-only Imbuements',
        '<p>These entries are present in the game data but are absent from the combat configuration for this build.</p>'+list(unlisted)) : '') :
      '<p><a href="' + escape(route('famiglia',{id:'Imbuement'})) + '">View all ' + (configured.length+unlisted.length) + ' imbuement records</a></p>');
}

function catalogEffects(node) {
  const b = node.data.Bonuses || node.data.Modifiers;
  if (!b) return '—';
  const numeric = wikiAllBonusText(b,node);
  const rows = (b.CombatEffect || []).map(({Modifier:m,Chance}) => {
    const timing = m?.Trigger?.Data?.Type === 'OnFirstHit' ? 'On the first successful hit' : entityV2Trigger(m?.Trigger);
    return escape(timing) + ' · ' + publicChanceDisplay(Chance ?? 1) + ' · ' + entityV2Effect(m?.Effect) +
      (m?.AppliesTo === 'Self' ? ' (self)' : m?.AppliesTo === 'Target' ? ' (target)' : '');
  });
  return [...(numeric === '—' ? [] : [numeric]),...rows].join('<br>') || '—';
}

function catalogMagicPage(node) {
  const {data:d} = node;
  const imbuement = node.type === 'Imbuement';
  const facts = [['Type',escape(typeName(node.type))],['Element',entityV2Named('Element',d.Element)]];
  if (entityV2HasRequirements(node)) facts.push(['Requirements',entityV2Requirements(node)]);
  if (imbuement) facts.push(['Availability',catalogImbuementNodes(true).includes(node) ? 'Available in this build' : 'Data only']);
  else if (d.Book) facts.push(['Spellbook',entityV2Named('SpellBook',d.Book)]);
  const sections = [{id:'rune-cost',title:'Rune Costs',body:wikiCountedItems(d.RuneCosts,node) +
    '<p class="wiki-note">' + (imbuement ? 'Base cost per attack turn.' : 'Base cost per cast.') + '</p>'}];
  const stats = (d.Stats?.Stats || []).map(row=>[entityV2Named('CombatStat',row.Stat),numericCell(row.Value)]);
  if (stats.length) sections.push({id:'spell-stats',title:'Combat Stats',body:table(['Stat','Base Value'],stats,true)});
  if (d.AttackOverride) sections.push({id:'spell-attack',title:'Special Attack',body:'<p>'+entityV2Named('Attack',d.AttackOverride)+'</p>'});
  const effects = catalogEffects(node);
  if (effects !== '—') sections.push({id:'magic-effects',title:'Effects',body:'<p>'+effects+'</p>'});
  const book = publicNode('SpellBook',d.Book);
  const parent = imbuement ? route('famiglia',{id:'Imbuement'}) : detailUrl(book || publicNode('Skill','Magic'));
  entityV2Render(node,facts,sections,'<p><a href="'+escape(parent)+'">'+(imbuement ? 'Magic Imbuements' : 'Spell List')+'</a></p>');
}

function catalogRecord(node, full = false) {
  const facts = [['Type',escape(typeName(node.type))]];
  if (entityV2HasRequirements(node)) facts.push(['Requirements',entityV2Requirements(node)]);
  const sections = [];
  const costs = node.data.Costs || node.data.EntryCost;
  if (costs?.Items?.length || costs?.Currencies?.length) sections.push({id:'reference-costs',title:'Costs',body:wikiCosts(costs,node)});
  const effects = catalogEffects(node);
  if (effects !== '—') sections.push({id:'reference-effects',title:'Effects',body:'<p>'+effects+'</p>'});
  const visible = Object.fromEntries(Object.entries(node.data).filter(([key,value])=>
    full || (value != null && (!Array.isArray(value) || value.length) &&
      !/^(Id|DisplayName|Name|Description|Icon|Media|Bonuses|Modifiers|Costs|EntryCost|.*Requirements)$/.test(key))
  ));
  if (Object.keys(visible).length) sections.push({id:'record-data',title:'Game Data',body:
    full ? '<details><summary>Show fields</summary><div id="record-fields"></div></details>' : fieldList(node,visible)});
  const familiesLink = '<a href="'+escape(route('famiglia',{id:node.type}))+'">'+escape(typeName(node.type))+' index</a>';
  const description = displayText(node.data.Description);
  entityV2Render(node,facts,sections,'<p>'+familiesLink+'</p>'+(description?'<p>'+escape(clean(description))+'</p>':''));
  const container = main.querySelector('#record-fields');
  if (container) container.parentElement.addEventListener('toggle',()=>{
    if (container.parentElement.open && !container.hasChildNodes()) container.innerHTML = fieldList(node,visible);
  });
}

function catalogDetail(node) {
  if (node.type === 'Imbuement' || node.type === 'MagicSpell') {
    catalogMagicPage(node);
  } else if (node.type === 'SpellBook') {
    const spells = (byType.get('MagicSpell') || []).filter(spell=>spell.data.Book===node.id).sort(wikiByLevel);
    const facts = entityV2HasRequirements(node) ? [['Requirements',entityV2Requirements(node)]] : [];
    entityV2Render(node,facts,[{id:'book-spells',title:'Spells',
      body:table(['Spell','Magic Level','Element','Runes per Cast'],spells.map(spell=>[
        link(spell,true),numericCell(wikiLevel(spell)),entityV2Named('Element',spell.data.Element),wikiCountedItems(spell.data.RuneCosts,spell)
      ]),true)}]);
  } else if (catalogFeatured(node.type) &&
      !/^(?:Prayer|Attack|CombatPassive|OvergrowthEffect)$/.test(node.type)) {
    catalogRecord(node);
  } else return false;
  return true;
}
