/* Shared reader-facing formatting. Function declarations are intentionally hoisted. */
function publicFraction(p) {
  if (!(p > 0)) return '0';
  if (p >= 1) return '1/1';
  return '1/' + polishNumber(1 / p);
}
function publicChanceDisplay(p) {
  if (!Number.isFinite(p)) return 'â€”';
  const percent = polishNumber(p*100) + '%';
  return publicFraction(p) + ' (' + percent + ')';
}
function link(node, withIcon = false) {
  if (/^(AstrologyNode|AstrologyStarNode|MasteryGuildBonus|MasteryGuildRank)$/.test(node?.type)) return (withIcon ? icon(node) : '') + escape(node.name);
  if (node?.type === 'Currency' && bare(node.id) === 'GoldPieces' && withIcon) {
    return '<a class="row-link currency-icon" href="' + detailUrl(node) + '" title="Gold" aria-label="Gold">' + icon(node) + '</a>';
  }
  return formatV2OriginalLink(node, withIcon);
}
function icon(node) {
  if (node.type !== 'ShopPurchase' && (!node.image || /missing_artwork|placeholder/i.test(node.image)) && !node.data.CoverBackground) return '';
  if(node.type!=='ShopPurchase' && !imageSource(node.data.CoverBackground||node.image))return '';
  return formatV2OriginalIcon(node);
}
function itemEntry(value, source, withChance = false) {
  if (bare(value?.Currency) === 'GoldPieces') {
    const currency = publicNode('Currency', value.Currency), min = value.Quantity ?? value.MinQuantity, max = value.MaxQuantity ?? min;
    return '<span class="item-line">' + (currency ? link(currency, true) : 'Gold') + (min == null ? '' : ' ' + number(min) + (max > min ? 'â€“' + number(max) : '')) + (withChance && value.Chance < 1 ? ' Â· ' + publicChanceDisplay(value.Chance) : '') + '</span>';
  }
  return formatV2OriginalItemEntry(value, source, withChance);
}
function formatV2Percent(text) {
  return String(text).replace(/(-?\d[\d,]*\.\d{3,})%/g, (_, amount) => {
    const n = Number(amount.replace(/,/g, ''));
    return polishNumber(n) + '%';
  });
}
function table(headers, rows, sortable = false) {
  let names = headers.map(h => String(h).replace(/^Base XP$/, 'XP').replace(/^Base Chance$|^Chance \/ Trigger$/, 'Chance'));
  const text = c => String(c && typeof c === 'object' ? c.html : c ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const omit = new Set(), shared = [], originalFields = headers.map((_,i)=>i);
  names.forEach((heading,i) => {
    const values = rows.map(r=>text(r[i]));
    if(rows.length && values.every(v=>!v || /^[â€”â€“-]$/.test(v))) omit.add(i);
    else if(rows.length > 1 && !/^(?:Name|Item|Potion|Product|Source|Skill|Monster|Pet|Rank|Objective|Task|Action|Levels?|Tier)/i.test(heading) && values.every(v=>v===values[0]) && values[0] && !/^(?:XP|XP\/s|Value|Sell Price|Quantity|Qty|Points|Count|Effects?|Bonuses?|Modifiers?)$/i.test(heading)) {
      omit.add(i);shared.push('<p class="table-shared"><strong>'+escape(heading)+':</strong> '+String(rows[0][i]&&typeof rows[0][i]==='object'?rows[0][i].html:rows[0][i])+'</p>');
    }
  });
  if(omit.size){names=names.filter((_,i)=>!omit.has(i));rows=rows.map(r=>r.filter((_,i)=>!omit.has(i)));}
  const prepared = rows.map(row => row.map((cell, i) => {
    const obj = cell && typeof cell === 'object';
    let html = String(obj ? cell.html : cell ?? 'â€”');
    const percentValue = /^\d[\d,.]*%$/.test(html.trim()) ? Number(html.replace(/[, %]/g, '')) / 100 : null;
    html = formatV2Percent(html);
    if (/^Chance(?: \(%\))?$/.test(names[i])) {
      html = html.replace(/(?<![\w"=])([\d,]+)\/([\d,]+)(?![\w])/g, (_, a, b) => publicFraction(Number(a.replace(/,/g, '')) / Number(b.replace(/,/g, ''))));
      if (names[i] === 'Chance' && percentValue != null) html = publicChanceDisplay(percentValue);
    }
    return obj ? {...cell, html} : html;
  }));
  const keptFields=originalFields.filter(i=>!omit.has(i));
  return shared.join('') + formatV2OriginalTable(names, prepared, sortable).replace(/data-sort-field="(\d+)"/g,(_,i)=>'data-sort-field="'+keptFields[Number(i)]+'"');
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
    return ref('Item') + ' Ã—' + amount + ' ' + state;
  }
  if (type === 'CurrencyStatistic') return ref('Currency') + ' ' + amount + (/Sale|Sold/.test(d.Statistic) ? ' earned from sales' : /Spent/.test(d.Statistic) ? ' spent' : ' gained');
  if (type === 'EnemyStatistic') return ref('Enemy') + ' Ã—' + amount + (/TasksCompleted/.test(d.Statistic) ? ' Slayer tasks completed' : ' defeated');
  if (type === 'DungeonStatistic') return ref('Dungeon') + ' Ã—' + amount + ' completed';
  if (type === 'FarmingRecipe') {
    const recipe=publicNode('FarmingRecipe',d.Recipe),item=publicNode('Item',recipe?.data.Products?.[0]?.Item||d.Recipe);
    return (item?link(item,true):formatV2Reference(d.Recipe,'FarmingRecipe',task))+' Ã—'+amount+' harvested';
  }
  if (type === 'HuntingAnimalStatistic') return ref('Animal', 'HuntingAnimal') + ' Ã—' + amount + ' trapped';
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
  return sortValue(lines.join('') || 'â€”', unique.find(r => bare(r.Type) === 'Level')?.Data?.Level, true);
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
    wikiSection('drop-rates', 'Drop Rates', '<p>For pets earned through skill XP, each XP gain gives a separate roll. Divide the XP from that gain by the petâ€™s scale factor to find its chance. Most skill pets use <strong>13,034,431</strong>.</p><p>For example, a 100 XP gain gives about <strong>1/130,344</strong> per roll. A 1,000 XP gain gives about <strong>1/13,034</strong>. Larger XP gains improve each roll; faster actions give more rolls.</p><p>Every roll is independent. A long dry streak does not improve the next roll, and reaching 13 million total XP does not guarantee a pet. With 100 XP per action and a scale factor of 13,034,431, roughly 90,346 actions give a 50% chance of finding it at least once.</p><p>Some pets instead require a task or a specific event. Their own pages list those conditions.</p>') +
    wikiSection('pet-list', 'Pet List', table(['Pet', 'Unlock Conditions', 'Effect'], pets.map(p => [link(p, true), wikiPetChance(p), wikiAllBonusText(p.data.Bonuses, p)]), true));
}
function publicRoute(screen, params) {
  if (screen === 'money') {moneyGuide(params);return true;}
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
    if (!text.parentElement.closest('script,style,input,textarea,code,pre')) text.textContent = polishDecimalText(formatV2Percent(text.textContent)).replace(/&lt;/g, '<').replace(/\s*Â·\s*(?=Level\b)/g,' ');
  }
}
