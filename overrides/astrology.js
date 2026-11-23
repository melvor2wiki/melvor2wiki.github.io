function astrologyConstellations() {
  return (byType.get('AstrologyConstellation') || []).slice().sort(wikiByLevel);
}

function astrologyNodeParent(node) {
  astrologyNodeParent.index ??= new Map(astrologyConstellations().flatMap(parent=>
    [...(parent.data.MinorNodes || []),...(parent.data.MajorNodes || [])].map(id=>[id,parent])));
  return astrologyNodeParent.index.get(node.id);
}

function astrologyEffects(data, source) {
  const bonuses = data.Bonuses || data.PerMinorNodeBonuses || {};
  const lines = (bonuses.Component || []).map(bonus=>{
    const entity = bonus.LocalContext?.Component?.Entity || bonus.FromContext?.Data?.Component?.Entity;
    const skill = publicNode('Skill',entity);
    const scope = skill ? link(skill,true) : entity ? escape(human(entity)) : '';
    const scalingSkill = bonus.Scaling?.Data?.Experience?.Entity;
    const scaling = scalingSkill ? ' per '+entityV2Named('Skill',scalingSkill)+' level' : '';
    const condition = bare(bonus.Condition?.Type || '') === 'EquipmentSlotEquipped'
      ? 'Requires an item in the '+entityV2Named('EquipmentSlot',bonus.Condition.Data.Slot)+' slot'
      : bonus.Condition ? wikiTaskCondition(bonus.Condition,source) : '';
    return (scope ? scope+' ' : '')+wikiBonusText(bonus,source).replace(/ · conditional(?=<\/span>)/,'') +
      scaling+(condition ? '<br><small>'+condition+'</small>' : '');
  });
  const other = wikiAllBonusText({Global:bonuses.Global,CombatEffect:bonuses.CombatEffect},source);
  if (other!=='—') lines.push(other);
  const description = clean(displayText(data.Description)).trim();
  if (description) lines.push(escape(description));
  return lines.join('<br>') || '—';
}

function astrologyThresholds(constellation) {
  const {MinorNodeUnlockKnowledge:thresholds = [],MinorNodesPerMajorNode:step,MajorNodes:majors = []} = constellation.data;
  return table(['Minor Choices','Total Knowledge','Major Choices After Activation'],thresholds.map((total,i)=>[
    numericCell(i+1),numericCell(total),numericCell(step>0 ? Math.min(majors.length,Math.floor((i+1)/step)) : null)
  ]));
}

function astrologyNodeTables(constellation) {
  const {data} = constellation;
  const rows = ids => ids.map(id=>{
    const node = publicNode('AstrologyNode',id);
    return node ? [link(node),requirements(node),astrologyEffects(node.data,node)] : [escape(human(id)),'—','—'];
  });
  const bonus = astrologyEffects({PerMinorNodeBonuses:data.PerMinorNodeBonuses},constellation);
  return (bonus==='—' ? '' : '<p><strong>Per Minor activated:</strong> '+bonus+'</p>')+
    '<h3>Minor Nodes</h3>'+table(['Node','Additional Requirements','Effect'],rows(data.MinorNodes || []),true)+
    '<h3>Major Nodes</h3>'+table(['Node','Additional Requirements','Effect'],rows(data.MajorNodes || []),true);
}

function astrologyNodeSummary() {
  return '<p>Study a constellation to accumulate its Knowledge. Each threshold grants one Minor choice and the Knowledge stays on that constellation. Activate any eligible Minor nodes to earn Major choices, then pick any eligible Major node.</p>';
}

function astrologyOverview() {
  const nodes = astrologyConstellations();
  if (!nodes.length) return [];
  const sharedTime = nodes.every(node=>node.data.BaseInterval===nodes[0].data.BaseInterval);
  const countLabel = node=>node.data.MinorNodes.length+' Minor and '+node.data.MajorNodes.length+' Major nodes';
  const sharedCounts = nodes.every(node=>countLabel(node)===countLabel(nodes[0]));
  const tableData = table(['Constellation','Astrology Level','Other Requirements','XP per Study','Knowledge per Study',
    ...(sharedTime ? [] : ['Base Study Time']),...(sharedCounts ? [] : ['Nodes']),'Events'],nodes.map(node=>[
    link(node,true),numericCell(wikiLevel(node)),wikiCompactRequirements({...node,data:{Requirements:node.data.SecondaryRequirements}}),
    numericCell(node.data.BaseExperience),numericCell(node.data.BaseKnowledge),
    ...(sharedTime ? [] : [numericCell(node.data.BaseInterval/1000,' s')]),
    ...(sharedCounts ? [] : [escape(countLabel(node))]),
    astrologyEvents(node).map(event=>link(event,true)).join('<br>') || '—'
  ]),true);
  const time = sharedTime ? '<p>Base study time is <strong>'+number(nodes[0].data.BaseInterval/1000)+' s</strong>.</p>' : '';
  const shared = nodes.every(node=>JSON.stringify(node.data.MinorNodeUnlockKnowledge)===JSON.stringify(nodes[0].data.MinorNodeUnlockKnowledge) &&
    node.data.MinorNodesPerMajorNode===nodes[0].data.MinorNodesPerMajorNode && node.data.MajorNodes.length===nodes[0].data.MajorNodes.length);
  const selector = '<label>Constellation <select id="astrology-constellation">'+nodes.map(node=>
    '<option value="'+escape(node.id)+'">'+escape(node.name)+'</option>').join('')+'</select></label>';
  return [
    ['voci','Constellations',time+(sharedCounts ? '<p>Each constellation has '+escape(countLabel(nodes[0]))+'.</p>' : '')+tableData],
    ['constellation-nodes','Constellation Nodes',astrologyNodeSummary()+
      (shared ? '<p>Every '+number(nodes[0].data.MinorNodesPerMajorNode)+' activated Minor nodes grant one Major choice.</p>'+
        '<details><summary>Knowledge thresholds for all constellations</summary>'+astrologyThresholds(nodes[0])+'</details>' : '')+
      '<p>'+selector+'</p><div id="astrology-node-preview">'+astrologyPreview(nodes[0],shared)+'</div>']
  ];
}

function astrologyEvents(node) {
  return (node.data.Events || []).map(id=>(byId.get(id) || []).find(entry=>/Event$/.test(entry.type))).filter(Boolean);
}

function astrologyPreview(node, shared) {
  return '<p>'+link(node,true)+' constellation</p>'+
    (shared ? '' : '<details><summary>Knowledge thresholds</summary>'+astrologyThresholds(node)+'</details>')+astrologyNodeTables(node);
}

function astrologyBind() {
  const select = main.querySelector('#astrology-constellation');
  if (!select || select.dataset.bound) return;
  select.dataset.bound = 'true';
  const preview = main.querySelector('#astrology-node-preview');
  const shared = !preview.querySelector('details');
  select.addEventListener('change',()=>{
    const node = publicNode('AstrologyConstellation',select.value);
    if (node) preview.innerHTML = astrologyPreview(node,shared);
  });
}

function astrologyDetail(node) {
  if (node.type === 'AstrologyConstellation') {
    const {data:d} = node;
    const secondary = entityV2Requirements({...node,data:{Requirements:d.SecondaryRequirements}});
    const facts = [['Astrology',entityV2Named('Skill','Astrology')],['Requirements',entityV2Requirements(node)],
      ['Other Requirements',secondary],['Study Time',number(d.BaseInterval/1000)+' s'],
      ['XP per Study',number(d.BaseExperience)],['Knowledge per Study',number(d.BaseKnowledge)]];
    const sections = [
      {id:'knowledge-thresholds',title:'Knowledge Thresholds',body:astrologyNodeSummary()+astrologyThresholds(node)},
      {id:'constellation-nodes',title:'Constellation Nodes',body:astrologyNodeTables(node)}
    ];
    const events = astrologyEvents(node);
    if (events.length) sections.push({id:'constellation-events',title:'Events',body:'<ul>'+
      events.map(event=>'<li>'+link(event,true)+'</li>').join('')+'</ul>'});
    entityV2Render(node,facts,sections);
    return true;
  }
  if (node.type !== 'AstrologyNode') return false;
  const parent = astrologyNodeParent(node);
  if (!parent) return false;
  const facts = [['Constellation',link(parent,true)],['Node Type',escape(node.data.NodeType)]];
  if (entityV2HasRequirements(node)) facts.push(['Additional Requirements',entityV2Requirements(node)]);
  const effects = astrologyEffects(node.data,node);
  entityV2Render({...node,name:parent.name+' — '+node.name},facts,
    [{id:'node-effect',title:'Effect',body:'<p>'+effects+'</p>'}],
    '<p>Use an available '+escape(node.data.NodeType)+' choice in '+link(parent,true)+'.</p>');
  return true;
}
