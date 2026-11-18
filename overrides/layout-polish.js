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
function polishLootSources(refs,item) {
  const html=table(['Source','Level','Chance'],refs.map(r=>{
    const amount=publicQty(r.parent||{});
    const drop=amount!=='1' && item ? '<br>'+itemEntry({...(r.parent || {}),Item:item.id},r.from) : '';
    return [link(publicCanonical(r.from),true)+drop,polishSourceLevel(r.from),publicRefChance(r)];
  }),true);
  return '<div class="loot-sources">'+html+'</div>';
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
