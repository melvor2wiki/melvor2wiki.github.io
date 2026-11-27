function wikiPatchPage() {
  const notes='https://news.melvoridle.com/game-update-v0-11-7-alpha/';
  const ref=(type,id)=>wikiSaveRef(type,id);
  const rows=[
    [ref('Skill','Thieving'),'Keltesta Mining Town gains the '+ref('ThievingDistraction','CoalMiner')+' distraction. Mine 20,000 Coal to unlock −5% Perception there. Existing progress counts.'],
    [ref('Skill','Farming'),'Wine costs for Allotment, Herb, Compost and Mill Farm automation are one-third lower.'],
    [ref('Skill','Hunting'),'Basic traps gain +2% trap chance after a failure.'],
    [ref('Skill','Cooking'),'Journeyman Chef gives +30 Proficiency.'],
    [ref('Skill','Smithing'),'Abyssal Bar and Abyssal Vault Key give less Smithing XP. Sacrificial Anvil excludes quest items.'],
    [ref('Skill','Herblore'),'Fixed catalyst consumption and the unlock for '+ref('Item','SuperRunecraftingPotionP2B')+'.'],
    [ref('Skill','Fishing'),'Bait preservation now applies.'],
    [ref('Skill','Agility'),'Mark Shop gear is organized by skill. The Night Sprints description was corrected.'],
    [ref('Skill','Beastcrafting'),ref('Item','PhantomShield')+' appears under Shields.'],
    ['Combat','Sharp Spin from '+ref('Enemy','BlightedTorfish')+' now buffs the enemy. Stance tooltips display XP splits. Item tooltips and the bank show set bonuses.'],
    ['Bank','The 50-slot purchase unlocked after ten Kraken’s Domain clears is available. Bank tabs can use item icons, and openable items can mark previously found drops.'],
    ['Player Activity','The game refreshes its presence counter every 30 seconds.']
  ];
  main.innerHTML='<h1>Patch Notes</h1><p><strong>Melvor Idle 2 '+escape(payload.gameVersion)+' · Steam build '+escape(payload.build)+'</strong></p>'+
    '<p>The wiki uses this Steam build for items, skills, loot, monsters and training estimates.</p>'+
    '<h2>Gameplay changes</h2>'+table(['Area','Change'],rows)+
    '<p>Interface, accessibility, performance and Steam Deck changes are listed in the <a href="'+notes+'">official patch notes</a>.</p>';
}

function wikiThievingDistractions() {
  const rows=(byType.get('ThievingLocation')||[]).flatMap(location=>(location.data.AvailableDistractions||[]).flatMap(id=>{
    const distraction=publicNode('ThievingDistraction',id);
    if (!distraction) return [];
    const effects=(distraction.data.Bonuses||[]).map(x=>wikiBonusText(x,distraction)).join('<br>');
    return [[link(location,true),escape(distraction.name),guideV2Requirements(distraction),effects]];
  }));
  return rows.length?table(['Location','Distraction','Requirements','Effect'],rows,true):'';
}

function wikiEquipmentSetsFor(item) {
  const sets=(byType.get('EquipmentSetBonus')||[]).filter(set=>set.data.Items?.includes(item.id));
  const rows=sets.flatMap(set=>(set.data.Bonuses||[]).map(tier=>[
    escape(set.name),numericCell(tier.ItemCount),set.data.Items.map(id=>wikiSaveRef('Item',id)).join('<br>'),
    wikiAllBonusText(tier.Modifiers,item)
  ]));
  return rows.length?{id:'set-bonuses',title:'Set Bonuses',body:table(['Set','Pieces equipped','Items','Effect'],rows,true)}:null;
}
