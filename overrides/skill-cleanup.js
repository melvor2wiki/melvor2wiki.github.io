/* Skill layout and concise, useful cross-references. */
function wikiBonusText(bonus,source) {
  const html=cleanOriginalBonusText(bonus,source),name=bonus.Stat?.Name||'';
  if(!/Interval|Perception|Cost|DamageTaken/.test(name))return html;
  return html.replace(/bonus-line (?:buff|debuff)/,'bonus-line '+(bonus.Value<=0?'buff':'debuff'));
}
function wikiReferenceOrder(name, sections) {
  cleanOriginalReferenceOrder(name, sections);
  const pet = sections.findIndex(s=>s[0]==='pet');if(pet>=0)sections.splice(pet,1);
  const guild=sections.find(s=>s[0]==='gilda'),boost=sections.find(s=>s[0]==='bonus');
  for(let i=sections.length-1;i>=0;i--)if(['gilda','bonus'].includes(sections[i][0]))sections.splice(i,1);
  const skill=publicNode('Skill',name),categories=skill?readerBoosters(skill):'';
  if(categories)sections.push(['bonus','Skill Boosts',categories]);else if(boost)sections.push(boost);if(guild)sections.push(guild);
  if(name==='Herblore'){
    const mechanics=sections.find(s=>s[0]==='meccaniche');
    if(mechanics){mechanics[1]='Using Potions';mechanics[2]='<p>Equip a potion in its matching skill slot to use its effect. The item page lists its bonuses and consumption rules.</p><p>Brewing follows four stages: preparing, heating, stirring and bottling. Batch time includes all four stages, with ten bottling ticks. Times below are before bonuses.</p>';}
  }
}
function wikiInfobox(skill, actions) {
  let html=cleanOriginalInfobox(skill,actions);
  const pets=wikiOwned(skill,'Pet');
  const text=pets.map(p=>{
    const effect=wikiAllBonusText(p.data.Bonuses,p).replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g,'$1');
    return link(p,true)+(effect&&effect!=='—'?': '+effect:'')+' (<a href="#/pets?section=drop-rates">Drop Rates</a>)';
  }).join('<br>');
  return html.replace(/<dt>Skill Pet<\/dt><dd>[\s\S]*?<\/dd>/,'<dt>Skill Pet</dt><dd>'+text+'</dd>');
}
function cleanHerbloreSections(skill, actions) {
  const recipes=actions.filter(n=>n.type==='HerbloreRecipe').sort(wikiByLevel);
  const herbs=[...new Set(recipes.flatMap(n=>(n.data.Ingredients?.Items||[]).filter(x=>/Herb$/.test(x.Item)).map(x=>x.Item)))].map(id=>publicNode('Item',id)).filter(Boolean);
  const herbBody=table(['Herb','First Used At','Sell Price'],herbs.map(h=>{
    const rs=recipes.filter(r=>r.data.Ingredients?.Items?.some(x=>x.Item===h.id));
    return [link(h,true),numericCell(Math.min(...rs.map(wikiLevel))),numericCell(publicPrice(h),' GP')];
  }),true);
  const common=(recipes[0]?.data.Ingredients?.Items||[]).filter(x=>recipes.every(r=>r.data.Ingredients?.Items?.some(y=>y.Item===x.Item&&y.Quantity===x.Quantity)));
  const commonIds=new Set(common.map(x=>x.Item));
  const note=common.length?'<p>Every recipe also uses '+publicItems(common,skill)+'.</p>':'';
  const groups=[...new Set(recipes.map(n=>n.data.Category))];
  const potionBody=note+groups.map(category=>{
    const group=publicNode('HerblorePotionCategory',category)||(byId.get(category)||[])[0];
    const title=group?.name||human(category);
    const rows=recipes.filter(n=>n.data.Category===category).map(n=>{
      const inputs=n.data.Ingredients?.Items||[],herb=inputs.filter(x=>/Herb$/.test(x.Item)),other=inputs.filter(x=>!commonIds.has(x.Item)&&!/Herb$/.test(x.Item));
      const p=publicNode('Item',n.data.Products?.[0]?.Item);
      const d=n.data,seconds=(d.BasePreparingInterval+d.BaseHeatingInterval+d.BaseStirringInterval+10*d.BaseBottlingInterval)/1000;
      return [requirements(n),p?link(p,true):link(n,true),numericCell(d.BaseExperience),publicItems(herb,n),publicItems(other,n),publicQty(d.Products?.[0]||{}),numericCell(seconds,' s'),p?wikiAllBonusText(p.data.Capabilities,p):'—'];
    });
    return '<h3>'+escape(title)+'</h3>'+table(['Requirements','Potion','XP','Herb','Secondary','Quantity','Batch Time','Effect'],rows,true);
  }).join('');
  return [['herbs','Herbs',herbBody],['voci','Potions',potionBody]];
}
function wikiSkillCoreSections(skill,actions) {
  return bare(skill.id)==='Herblore'?cleanHerbloreSections(skill,actions):cleanOriginalCoreSections(skill,actions);
}
