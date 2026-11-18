function lootChanceCell(probability, basis = '') {
  if (!Number.isFinite(probability)) return '—';
  const label = basis ? '<span class="subtle">' + escape(basis) + '</span>' : '';
  return sortValue(publicChanceDisplay(probability) + label, probability, true);
}

function lootWeightedChance(entries, row, activation = 1) {
  const total = entries.reduce((sum, entry) => sum + (entry.Weight || 0), 0);
  if (row.Weight != null && total > 0) return activation * row.Weight / total;
  return Number.isFinite(row.Chance) ? activation * row.Chance : null;
}

function lootActionChance(node, property, row, entries = node.data[property] || []) {
  const d = node.data;
  if (property === 'CommonDropTable') return lootWeightedChance(entries, row, d.BaseCommonLootChance);
  if (property === 'RareDropTable') return lootWeightedChance(entries, row, d.BaseRareLootChance);
  if (property === 'RandomProducts' && node.type === 'FishingRecipe') {
    return lootWeightedChance(entries, row, d.BaseFishChance ?? d.FishChance);
  }
  if (property === 'SpecialProducts' && node.type === 'FishingRecipe') {
    const sorted = entries.slice().sort((a,b) => a.Chance - b.Chance);
    let remaining = 1;
    for (const candidate of sorted) {
      if (candidate === row || candidate.Item === row.Item) return remaining * candidate.Chance;
      remaining *= 1 - candidate.Chance;
    }
    return null;
  }
  if (property === 'Product' && node.type === 'MiningRecipe') return 1;
  const result = lootWeightedChance(Array.isArray(entries) ? entries : [], row);
  if (result != null) return result;
  return ['Products','Product','Provides','FixedItems','FixedCurrencies','AlwaysDrops'].includes(property) ? 1 : null;
}

function lootReference(ref) {
  const node = ref.from, path = ref.path, row = ref.parent || {};
  const root = path[0], property = path.at(-3), basis = ({
    CommonDropTable:'per successful stage', RareDropTable:'per successful stage', CompletionDropTable:'per completed target',
    RandomProductsPerHit:'per hit', RandomProductsPerCut:'per completed cut'
  })[root] || '';
  const tableIndex = path.indexOf('ItemTables');
  if (tableIndex >= 0 && property === 'Table') {
    const table = path.slice(0,tableIndex+2).reduce((value,key) => value?.[key],node.data);
    return {p: lootWeightedChance(table?.Table || [],row,table?.Chance ?? 1), basis};
  }
  const collection = path.slice(0,-2).reduce((value,key) => value?.[key],node.data);
  const kind = property === 'DropTable' || property === 'AlwaysDrops' || property === 'FixedItems' || property === 'FixedCurrencies'
    ? property : root;
  const entries = Array.isArray(collection) ? collection : node.data[root];
  if (kind === 'Product' && node.type === 'MiningRecipe') return {p: 1,basis: 'per completed rock'};
  return {p: lootActionChance(node,kind,row,entries),basis};
}

function publicRefChance(ref) {
  const {p,basis} = lootReference(ref);
  return lootChanceCell(p,basis);
}

function lootItemList(node, property) {
  return (node.data[property] || []).map(row =>
    itemEntry({...row,Chance:lootActionChance(node,property,row)},node,true)).join('<br>') || '—';
}

function lootTable(heading, node, entries, probability, basis = '') {
  if (!entries?.length) return '';
  const rows = entries.map(row => {
    const item = publicNode(row.Currency ? 'Currency' : 'Item',row.Item || row.Currency);
    return [
      itemEntry(row,node), lootChanceCell(probability(row)), numericCell(item ? publicPrice(item) : null,' GP')
    ];
  });
  return '<h3>' + escape(heading) + '</h3>' + (basis ? '<p class="wiki-note">' + escape(basis) + '</p>' : '') +
    table(['Item','Chance','Sell Price'],rows,true);
}

function publicLootTables(tables, node) {
  return (tables || []).map((entry,index) => {
    const items = entry.Table || [];
    if (!items.length) return '';
    const probability = row => lootWeightedChance(items,row,entry.Chance ?? 1);
    let expected = 0;
    for (const row of items) {
      const item = publicNode('Item',row.Item);
      const min = row.MinQuantity ?? row.Quantity ?? 1;
      expected += (min + (row.MaxQuantity ?? min)) / 2 * (item ? publicPrice(item) || 0 : 0) * (probability(row) || 0);
    }
    const container = node.type === 'Item', dungeon = node.type === 'Dungeon';
    const basis = container ? 'per opening' : dungeon ? 'per clear' : 'per kill';
    const heading = tables.length > 1 ? 'Loot Table ' + (index + 1) : 'Random Loot';
    return lootTable(heading,node,items,probability,'Base chance ' + basis + '.') +
      '<p>Average sale value from this loot table: <strong>' + number(expected) + ' GP</strong> ' + basis + '.</p>';
  }).join('');
}

function wikiExtraLoot(actions) {
  const fields = [
    ['RandomProductsPerHit','Per hit'],['RandomProductsPerCut','Per completed cut'],['SpecialProducts','Per fishing action'],
    ['SurveyingProducts','Surveying'],['ExtraProducts','Extra item'],['CommonDropTable','Common · per successful stage'],
    ['RareDropTable','Rare · per successful stage'],['CompletionDropTable','Per completed target']
  ];
  const rows = actions.flatMap(node => fields.flatMap(([property,label]) =>
    (node.data[property] || []).map(row => [
      itemEntry(row,node),link(node,true),escape(label),lootChanceCell(lootActionChance(node,property,row))
    ])));
  return rows.length ? table(['Item','Action','Roll','Chance'],rows,true) : '<p>No additional loot is recorded.</p>';
}

function wikiFish(actions) {
  return table(['Fish','Level','Fishing Spot','Catch Time','XP','Chance','Value'],actions.flatMap(node =>
    (node.data.RandomProducts || []).map(row => {
      const item = publicNode('Item',row.Item);
      return [itemEntry(row,node),numericCell(wikiLevel(node)),link(node,true),
        number(node.data.BaseMinInterval / 1000) + '–' + number(node.data.BaseMaxInterval / 1000) + ' s',numericCell(node.data.BaseExperience),
        lootChanceCell(lootActionChance(node,'RandomProducts',row)),numericCell(item ? publicPrice(item) : null,' GP')];
    })),true);
}
