function polishNumber(value) {
  const n=Number(value),a=Math.abs(n);
  polishNumber.regular ||=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
  polishNumber.small ||=new Intl.NumberFormat('en-US',{maximumFractionDigits:8});
  polishNumber.tiny ||=new Intl.NumberFormat('en-US',{maximumSignificantDigits:4});
  return a>0&&a<1?(a<1e-8?polishNumber.tiny:polishNumber.small).format(n):polishNumber.regular.format(n);
}
function polishDecimalText(text) {
  return String(text).replace(/\d[\d,]*\.\d{3,}/g,x=>{const n=Number(x.replace(/,/g,''));return Math.abs(n)>=1?polishNumber(n):x;});
}
function goldNumber(value) {
  return Math.round(value).toLocaleString('it-IT');
}
function numericCell(value,suffix='',digits) {
  const valid=typeof value==='number'&&Number.isFinite(value),currency=valid&&suffix===' GP'?publicNode('Currency','GoldPieces'):null;
  const text=valid?(suffix===' GP'?goldNumber(value):polishNumber(value))+suffix:'—';
  return sortValue(currency?'<span class="currency-value">'+escape(text)+icon(currency)+'</span>':text,valid?value:null,true);
}
function polishSourceLevel(n) {
  if(n.type==='Enemy'){
    const stats=payload.monsters?.enemies?.[bare(n.id)];
    return stats?'<span class="level-line">'+icon(publicNode('Skill','Attack'))+'Level '+number(stats.combatLevel)+'</span>':'—';
  }
  if(n.type==='Item'&&n.data.Capabilities?.['MelvorBase:Openable'])return 'Chest';
  const levels=guideV2ReqList(n).filter(r=>bare(r.Type)==='Level');
  if(levels.length)return levels.map(r=>{const s=publicNode('Skill',r.Data.Component?.Entity);return '<span class="level-line">'+(s?'<a href="'+detailUrl(s)+'" title="'+escape(s.name)+'" aria-label="'+escape(s.name)+'">'+icon(s)+'</a>':'')+'Level '+number(r.Data.Level)+'</span>';}).join('');
  return ({MiningRecipe:'Mining',WoodcuttingRecipe:'Woodcutting',ShopPurchase:'Shop',CombatArea:'Combat area',Dungeon:'Dungeon'})[n.type]||'—';
}
function polishLootSources(refs) {
  let html=formatV2OriginalTable(['Source','Level','Qty','Chance','Chance (%)'],refs.map(r=>{
    const text=publicRefChance(r),match=text.match(/^([\d,.]+)%$/),p=text==='Prospecting / rock completion'&&r.path[0]==='Product'?(r.parent?.Chance??1):match?Number(match[1].replace(/,/g,''))/100:null;
    return [link(publicCanonical(r.from),true),polishSourceLevel(r.from),publicQty(r.parent||{}),p==null?escape(text):sortValue(publicFraction(p),p,true),p==null?'—':numericCell(p*100,'%')];
  }),true);
  html=html.replace(/<th scope="col"><button[^>]*>Chance<span[\s\S]*?<\/th>\s*<th scope="col"><button[^>]*>Chance \(%\)<span[\s\S]*?<\/th>/,'<th scope="col" colspan="2"><button type="button" class="sort-head" data-sort-column="3" data-sort-field="3">Chance<span class="sort-indicator" aria-hidden="true"></span></button></th>');
  return '<div class="loot-sources">'+html+'</div>'+(refs.some(r=>r.from.type==='MiningRecipe'&&r.path[0]==='Product')?'<p class="wiki-note">For the main mining product, chance is per completed rock.</p>':'');
}
function catalogUnique(records, preferItem) {
  const entries = new Map();
  for (const record of records) {
    const canonical = publicCanonical(record);
    const key = canonical.key;
    const previous = entries.get(key);
    if (!previous || record.key === key) entries.set(key, preferItem ? canonical : record);
  }
  return [...entries.values()];
}
