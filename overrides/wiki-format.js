/* Shared reader-facing formatting. Function declarations are intentionally hoisted. */
function publicFraction(p) {
  if (!(p > 0)) return '0';
  if (p >= 1) return '1/1';
  return '1/' + new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(1 / p);
}
function publicChanceDisplay(p) {
  if (!Number.isFinite(p)) return '—';
  const percent = p > 0 && p * 100 < 0.001 ? '&lt;0.001%' : new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(p * 100) + '%';
  return publicFraction(p) + ' (' + percent + ')';
}
function link(node, withIcon = false) {
  if (node?.type === 'Currency' && bare(node.id) === 'GoldPieces' && withIcon) {
    return '<a class="row-link currency-icon" href="' + detailUrl(node) + '" title="Gold" aria-label="Gold">' + icon(node) + '</a>';
  }
  return formatV2OriginalLink(node, withIcon);
}
function icon(node) {
  if (node.type !== 'ShopPurchase' && (!node.image || /missing_artwork|placeholder/i.test(node.image)) && !node.data.CoverBackground) return '';
  return formatV2OriginalIcon(node);
}
function itemEntry(value, source, withChance = false) {
  if (bare(value?.Currency) === 'GoldPieces') {
    const currency = publicNode('Currency', value.Currency), min = value.Quantity ?? value.MinQuantity, max = value.MaxQuantity ?? min;
    return '<span class="item-line">' + (currency ? link(currency, true) : 'Gold') + (min == null ? '' : ' ' + number(min) + (max > min ? '–' + number(max) : '')) + (withChance && value.Chance < 1 ? ' · ' + publicChanceDisplay(value.Chance) : '') + '</span>';
  }
  return formatV2OriginalItemEntry(value, source, withChance);
}
function formatV2Percent(text) {
  return String(text).replace(/(-?\d[\d,]*\.\d{4,})%/g, (_, amount) => {
    const n = Number(amount.replace(/,/g, ''));
    return n > 0 && n < 0.001 ? '&lt;0.001%' : new Intl.NumberFormat('en-US', {maximumFractionDigits: 3}).format(n) + '%';
  });
}
function table(headers, rows, sortable = false) {
  const names = headers.map(h => String(h).replace(/^Base XP$/, 'XP').replace(/^Base Chance$|^Chance \/ Trigger$/, 'Chance'));
  const prepared = rows.map(row => row.map((cell, i) => {
    const obj = cell && typeof cell === 'object';
    let html = String(obj ? cell.html : cell ?? '—');
    const percentValue = /^\d[\d,.]*%$/.test(html.trim()) ? Number(html.replace(/[, %]/g, '')) / 100 : null;
    html = formatV2Percent(html);
    if (/^Chance(?: \(%\))?$/.test(names[i])) {
      html = html.replace(/(?<![\w"=])([\d,]+)\/([\d,]+)(?![\w])/g, (_, a, b) => publicFraction(Number(a.replace(/,/g, '')) / Number(b.replace(/,/g, ''))));
      if (names[i] === 'Chance' && percentValue != null) html = publicChanceDisplay(percentValue);
    }
    return obj ? {...cell, html} : html;
  }));
  return formatV2OriginalTable(names, prepared, sortable);
}
function formatV2Reference(id, type, source) {
  const n = publicNode(type, id) || targets(id, [type], source)[0];
  return n ? link(n, true) : escape(human(id));
}
function wikiTaskCondition(condition, task) {
  const d = condition?.Data || {}, type = bare(condition?.Type), amount = number(d.Quantity ?? d.Value ?? d.Count ?? 1);
  const ref = (key, kind = key) => formatV2Reference(d[key], kind, task);
  if (type === 'ItemStatistic') {
    const state = /Sold/.test(d.Statistic) ? 'sold' : /Used|Consumed/.test(d.Statistic) ? 'used' : /Found/.test(d.Statistic) ? 'found' : 'gained';
    return ref('Item') + ' ×' + amount + ' ' + state;
  }
  if (type === 'CurrencyStatistic') return ref('Currency') + ' ' + amount + (/Sale|Sold/.test(d.Statistic) ? ' earned from sales' : /Spent/.test(d.Statistic) ? ' spent' : ' gained');
  if (type === 'EnemyStatistic') return ref('Enemy') + ' ×' + amount + (/TasksCompleted/.test(d.Statistic) ? ' Slayer tasks completed' : ' defeated');
  if (type === 'DungeonStatistic') return ref('Dungeon') + ' ×' + amount + ' completed';
  if (type === 'HuntingAnimalStatistic') return ref('Animal', 'HuntingAnimal') + ' ×' + amount + ' trapped';
  if (type === 'EquipmentSlotEquipped') return 'Equip an item in the ' + escape(human(d.Slot).toLowerCase()) + ' slot';
  if (type === 'Level') {
    const skill = publicNode('Skill', d.Component?.Entity);
    return (skill ? link(skill, true) + ' ' : '') + 'Level ' + number(d.Level);
  }
  if (d.Quest) return (type === 'QuestComplete' ? 'Complete ' : 'During ') + ref('Quest') + (type === 'QuestComplete' ? '' : ': step ' + number((d.Step ?? 0) + 1) + (d.Task != null ? ', objective ' + number(d.Task + 1) : ''));
  return formatV2OriginalTaskCondition(condition, task);
}
function requirements(node) {
  const d = node.data, caps = d.Capabilities || {};
  const entries = [...(d.Requirements || []), ...(d.UnlockRequirements || []), ...(d.AccessRequirements || []), ...(d.DisplayRequirements || []), ...(caps['MelvorBase:Toolbelt']?.Requirements || []), ...(caps['MelvorBase:Equipment']?.Requirements || [])];
  const seen = new Set(), unique = entries.filter(r => {const key = JSON.stringify(r); if(seen.has(key)) return false; seen.add(key); return true;});
  const lines = unique.map(req => {
    const data = req.Data || {}, type = bare(req.Type);
    let text;
    if (type === 'ShopPurchase') text = formatV2Reference(data.ShopPurchase, 'ShopPurchase', node) + ' purchased';
    else if (type === 'MasteryGuildRank') text = formatV2Reference(data.Rank, 'MasteryGuildRank', node) + ' rank';
    else if (/^(Equipment|Toolbelt)ItemEquipped$/.test(type)) text = formatV2Reference(data.Item, 'Item', node) + ' equipped';
    else text = wikiTaskCondition(req, node);
    return (data.IsOr ? '<span class="requirement-or">or</span>' : '') + '<div class="requirement">' + text + '</div>';
  });
  return sortValue(lines.join('') || '—', unique.find(r => bare(r.Type) === 'Level')?.Data?.Level, true);
}
function wikiPetChance(pet) {
  const t = pet.data.Trigger, d = t?.Data;
  if (bare(t?.Type) === 'ChancePerExperience' && d?.ScaleFactor) {
    const skill = publicNode('Skill', d.Component?.Entity);
    return 'Earn ' + (skill ? link(skill, true) : 'skill') + ' XP (<a href="#/pets?section=drop-rates">Drop Rates</a>)';
  }
  if (pet.data.Goal) return wikiTaskObjective({...pet, data: {Goal: pet.data.Goal}});
  return t ? wikiTaskCondition(t, pet) : 'Unlock conditions are not specified.';
}
function formatV2Pets() {
  const pets = byType.get('Pet') || [];
  main.innerHTML = '<h1>Pets</h1><p>Pets provide permanent bonuses once unlocked. Their effects remain active without equipping them.</p>' +
    wikiSection('drop-rates', 'Drop Rates', '<p>For pets earned through skill XP, each XP gain gives a separate roll. Divide the XP from that gain by the pet’s scale factor to find its chance. Most skill pets use <strong>13,034,431</strong>.</p><p>For example, a 100 XP gain gives about <strong>1/130,344</strong> per roll. A 1,000 XP gain gives about <strong>1/13,034</strong>. Larger XP gains improve each roll; faster actions give more rolls.</p><p>Every roll is independent. A long dry streak does not improve the next roll, and reaching 13 million total XP does not guarantee a pet. With 100 XP per action and a scale factor of 13,034,431, roughly 90,346 actions give a 50% chance of finding it at least once.</p><p>Some pets instead require a task or a specific event. Their own pages list those conditions.</p>') +
    wikiSection('pet-list', 'Pet List', table(['Pet', 'Unlock Conditions', 'Effect'], pets.map(p => [link(p, true), wikiPetChance(p), wikiAllBonusText(p.data.Bonuses, p)]), true));
}
function publicRoute(screen, params) {
  if (screen === 'pets' || ((screen === 'categoria' || screen === 'famiglia') && /^(pets|Pet)$/.test(params.get('id')))) {formatV2Pets();return true;}
  if (screen === 'guides') {publicGuides();return true;}
  if (screen === 'guide') {publicGuides(params.get('id'));return true;}
  if (screen === 'suggest') {publicSuggest(params);return true;}
  if ((screen === 'categoria' && params.get('id') === 'enemies') || (screen === 'famiglia' && params.get('id') === 'Enemy')) {publicMonsterList();return true;}
  return false;
}
function publicFinishPage() {
  formatV2OriginalFinishPage();
  main.querySelectorAll('section#requirements').forEach(s => {
    const heading = s.querySelector('h2'); if (heading) heading.remove();
    const text = s.innerHTML; s.innerHTML = table(['Requirements'], [[text]]); s.classList.add('compact-requirements');
  });
  main.querySelectorAll('.facts > div').forEach(d => {if (/^Required Level$/i.test(d.querySelector('dt')?.textContent || '') && main.querySelector('.compact-requirements')) d.remove();});
  main.querySelectorAll('h2,h3,dt,th,.sort-head').forEach(el => {
    if (el.childElementCount && !el.matches('.sort-head')) return;
    for (const node of el.childNodes) if (node.nodeType === 3) node.textContent = node.textContent.replace(/Base XP/g, 'XP').replace(/Chance \/ Trigger/g, 'Chance').replace(/Special Products/g, 'Special Items');
  });
  main.querySelectorAll('section#details > h2').forEach(h => {if(h.parentElement.querySelector('h3')) h.remove();else h.textContent = 'Effects';});
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (!text.parentElement.closest('script,style,input,textarea,code,pre')) text.textContent = formatV2Percent(text.textContent).replace(/&lt;/g, '<');
  }
}
