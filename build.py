"""Reconstruct the checked static release without network access or dependencies."""
import base64,hashlib,io,json,zipfile,os,re
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'release-manifest.json').read_text())
parts=sorted((root/'release').glob('site-*.b64'))
assert len(parts)==manifest['parts'], 'Release part count mismatch'
data=base64.b64decode(''.join(p.read_text() for p in parts),validate=True)
assert len(data)==manifest['bytes'] and hashlib.sha256(data).hexdigest()==manifest['sha256'], 'Release integrity check failed'
out=root/'public';out.mkdir(exist_ok=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for entry in archive.infolist():
        target=(out/entry.filename).resolve()
        assert target.is_relative_to(out.resolve()) and not entry.is_dir(), 'Invalid release path'
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(archive.read(entry))
print('Verified static release:',len(parts),'parts')

# Replace undersized thumbnails with artwork extracted from the installed game.
data_path = out / 'data.js'
assignment = data_path.read_text(encoding='utf-8')
prefix, encoded = assignment.split('=', 1)
payload = json.loads(json.loads(encoded.strip().removesuffix(';')))
with zipfile.ZipFile(root / 'release/artwork-refresh.zip') as artwork:
    replacements = json.loads(artwork.read('images.json'))
    for key, target in replacements.items():
        assert re.fullmatch(r'assets/\d+-[a-f0-9]{12}\.webp', target)
        asset = artwork.read(target)
        assert hashlib.sha256(asset).hexdigest()[:12] == Path(target).stem.rsplit('-', 1)[1]
        (out / target).write_bytes(asset)
        assert key in payload['images']
    old_paths = set(payload['images'].values())
    payload['images'].update(replacements)
    for old in old_paths - set(payload['images'].values()):
        assert re.fullmatch(r'assets/\d+\.webp', old)
        (out / old).unlink()
data_path.write_text(prefix + '= ' + json.dumps(json.dumps(payload, separators=(',', ':'))) + ';\n', encoding='utf-8')

# Reader-facing form changes are maintained separately from the large game-data release.
app_path=out/'app.js'
app=app_path.read_text(encoding='utf-8')
start=app.index('function publicSuggest(')
end=app.index('function publicRoute(',start)
app=app[:start]+(root/'overrides/public-suggest.js').read_text(encoding='utf-8-sig')+app[end:]
app=app.replace('const results = records.filter(node => (!type || node.type === type) &&',
                'const matches = records.filter(node => (!type || node.type === type) &&', 1)
marker='  const values = {\n    nome: n => n.name,'
assert app.count(marker)==1
app=app.replace(marker, '  const results = catalogUnique(matches, screen === "cerca" && !type);\n'+marker)
app=app.replace('const brand = imageSource(visuals.logo);','const brand = "data:image/webp;base64,'+base64.b64encode((root/'overrides/logo-high-resolution.webp').read_bytes()).decode()+'";')
app=app.replace('const number = value => italian.format(value);','const number = value => polishNumber(value);')
# Keep all loot views on the same probability model.
for name, marker in [
    ('wikiFish', 'function wikiMiningRocks('),
    ('publicRefChance', 'function publicItem('),
    ('publicFraction', 'function publicEnemyValue('),
    ('wikiProductRows', 'function wikiThievingAreas('),
]:
    start = app.index('function ' + name + '(')
    end = app.index(marker, start)
    app = app[:start] + app[end:]
start = app.index('  const dropTable = (heading, entries, activation = null)')
end = app.index('  if (node.type === "Item")', start)
app = app[:start] + '''  const dropTable = (heading, entries, activation = 1) => {
    chunks.push(lootTable(heading, node, entries, row => lootWeightedChance(entries, row, activation),
      node.type === 'ThievingRecipe' ? (heading === 'Completion Loot' ? 'Base chance per completed target.' : 'Base chance per successful stage.') : ''));
  };
''' + app[end:]
app = app.replace('["CompletionDropTable", "Completion Loot", null]', '["CompletionDropTable", "Completion Loot", 1]')
app = app.replace('itemTable("Special Products", d.SpecialProducts);',
    'chunks.push(lootTable("Special Items", node, d.SpecialProducts, row => lootActionChance(node, "SpecialProducts", row)));')
app = app.replace('if (d.Levels?.length) chunks.push', '''if (node.type === "FishingRecipe") chunks.push(
    lootTable("Fish", node, d.RandomProducts, row => lootActionChance(node, "RandomProducts", row), "Base chance per fishing action.")
  );
  if (d.Levels?.length) chunks.push''', 1)
app = app.replace('itemList(n.data.RandomProducts, n), itemList(n.data.SpecialProducts, n)', 'lootItemList(n, "RandomProducts"), lootItemList(n, "SpecialProducts")')
app = app.replace('itemEntry(item, node, true)).join("<br>")', 'itemEntry({...item, Chance: lootActionChance(node, "SpecialProducts", item)}, node, true)).join("<br>")')
app = app.replace('Within a table, item chance equals its weight divided by the total weight. Table activation is a separate roll.',
    'Chances include the table activation roll and use the base rates for a successful stage or a completed target.')
app = app.replace('escape(publicRefChance(r))', 'publicRefChance(r)')
start = app.index('    let chance = typeof p.Chance')
end = app.index('    const skill = [...(owners.get(ref.from.key)', start)
app = app[:start] + '''    const chance = publicRefChance(ref);
''' + app[end:]
app = app.replace('"Quantity", "Chance or Weight"], computed.map', '"Quantity", "Chance"], computed.map')
app = app.replace("amount + '</span>', escape(chance)", "amount + '</span>', chance")

app = app.replace('numericCell(p.Quantity), numericCell(p.Chance * 100, "%")',
    'numericCell(p.Quantity), lootChanceCell(p.Chance)')
app = app.replace('numericCell(d.BaseCurrencyLootChance * 100, "%")', 'lootChanceCell(d.BaseCurrencyLootChance)')
app = app.replace('numericCell(n.data.BaseProductChance * 100, "%")', 'lootChanceCell(n.data.BaseProductChance)')
app = app.replace('"Base Product Chance"', '"Early Break Chance"')
app = app.replace('numericCell(n.data.FishChance * 100, "%")', 'lootChanceCell(n.data.FishChance)')
app = app.replace('link(n) + " · " + number(n.data.FishChance * 100) + "%"',
    'link(n) + " · " + publicChanceDisplay(n.data.FishChance)')
app = app.replace('  const itemTable = (heading, entries) => {\n    if (!entries?.length) return;',
    '  const itemTable = (heading, entries) => {\n    if (!entries?.length) return;\n    const showChance = entries.some(p => Number.isFinite(p.Chance) && p.Chance < 1);')
app = app.replace('item?.data.SellsFor ? escape(value(item)) : "—", numericCell(p.Chance != null ? p.Chance * 100 : 100, "%")',
    'item?.data.SellsFor ? escape(value(item)) : "—", ...(showChance ? [lootChanceCell(p.Chance ?? 1)] : [])')
app = app.replace('"Sell Price per Unit", "Base Chance"], entries.map',
    '"Sell Price per Unit", ...(showChance ? ["Chance"] : [])], entries.map')
start = app.index('function publicDetail(')
end = app.index('function publicGuides(', start)
detail = app[start:end]
detail = detail.replace('let out=publicHead(n);', 'let out="";')
detail = re.sub(r"  const req=requirements\(n\);[^\n]*\n\s*if\(d\.BaseExperience[^\n]*\n", '', detail, count=1)
detail = detail.replace("if(properties.length && n.type!=='MasteryGuildRank')",
    "if(properties.length && !['MasteryGuildRank','ThievingRecipe'].includes(n.type))")
detail = detail.replace('main.innerHTML=out;return true;', '''const facts = entityV2RecordFacts(n);
  if (facts.length) {
    const description = d.Description ? '<p>' + escape(clean(displayText(d.Description))) + '</p>' : '';
    entityV2Render(n,facts,[],description+out);
  } else main.innerHTML=publicHead(n)+out;
  return true;''')
app = app[:start] + detail + app[end:]
# Keep shared primitives available to the focused reader-facing overrides.
for original, saved in [('link','formatV2OriginalLink'),('icon','formatV2OriginalIcon'),('table','formatV2OriginalTable'),('itemEntry','formatV2OriginalItemEntry'),
                        ('wikiTaskCondition','formatV2OriginalTaskCondition'),
                        ('wikiSkillCoreSections','cleanOriginalCoreSections'),
                        ('wikiReferenceOrder','cleanOriginalReferenceOrder'),
                        ('wikiInfobox','cleanOriginalInfobox'),
                        ('wikiBonusText','cleanOriginalBonusText'),
                        ('numericCell','polishOriginalNumericCell'),
                        ('publicFinishPage','formatV2OriginalFinishPage')]:
    marker='function '+original+'('
    assert app.count(marker)==1, 'Unexpected primitive declaration: '+original
    app=app.replace(marker,'function '+saved+'(',1)
for module in ['wiki-format','training-guides','entity-pages','skill-cleanup','training-reader','layout-polish']:
    app+='\n'+(root/'overrides'/f'{module}.js').read_text(encoding='utf-8-sig')
app+='\n'+(root/'overrides/money-guide.js').read_text(encoding='utf-8')
app+='\n'+(root/'overrides/money-supply.js').read_text(encoding='utf-8-sig')
app+='\n'+(root/'overrides/money-combos.js').read_text(encoding='utf-8-sig')
app+='\n'+(root/'overrides/idle-calculator.js').read_text(encoding='utf-8')
app+='\n'+(root/'overrides/drop-odds.js').read_text(encoding='utf-8')
app+='\n'+(root/'overrides/drop-calculator.js').read_text(encoding='utf-8')
app+='\n'+(root/'overrides/training-route.js').read_text(encoding='utf-8')
other_nav = '    navGroup("quests"), navGroup("shops"), navGroup("mastery"), navGroup("pets"),\n'
assert app.count(other_nav) == 1
app = app.replace(other_nav, other_nav + """    moneyNavLink(),
    '<a class="row-link" href="#/idle">' + combatSwordsIcon() + 'Can I Idle?</a>',
""", 1)
for character in '\u2013\u2014\u2019\u00d7\u00b7':
    assert character.encode('utf-8').decode('cp1252') not in app, 'Corrupted text in app.js'
app_path.write_text(app,encoding='utf-8')
style=out/'style.css'
style.write_text(style.read_text(encoding='utf-8')+'\n'+(root/'overrides/suggest.css').read_text(encoding='utf-8-sig'),encoding='utf-8')
for module in ['wiki-format','training-guides','entity-pages','skill-cleanup','training-reader','layout-polish','idle-calculator']:
    style.write_text(style.read_text(encoding='utf-8')+'\n'+(root/'overrides'/f'{module}.css').read_text(encoding='utf-8-sig'),encoding='utf-8')
html=out/'index.html'
html.write_text(html.read_text(encoding='utf-8').replace("connect-src 'none'",'connect-src https://ijmztvsjdzypvxnlicbf.supabase.co').replace('<strong>Melvor 2 Wiki</strong>','<strong>MELVOR 2</strong>'),encoding='utf-8')
markup=html.read_text(encoding='utf-8')
markup,count=re.subn(r'(<div class="sidebar-group"><h3>Tools</h3>).*?(<a href="https://db\.melvor\.aevv\.net/live"[^<]*</a>)(</div>)',
    r'\1\2<a href="#/idle">Can I Idle?</a>\3', markup)
assert count == 1, 'Unexpected sidebar tools markup'
html.write_text(markup,encoding='utf-8')
feedback=json.loads((root/'feedback-config.json').read_text(encoding='utf-8-sig'))
assert re.fullmatch(r'https://ijmztvsjdzypvxnlicbf\.supabase\.co/functions/v1/submit-feedback',feedback['suggestionEndpoint']), 'Invalid public form endpoint'
config={'issueRepository':os.environ.get('GITHUB_REPOSITORY','melvor2wiki/melvor2wiki.github.io'),**feedback}
(out/'config.js').write_text('window.WIKI_CONFIG = '+json.dumps(config)+';\n',encoding='utf-8')
print('Anonymous suggestion form configured; no email address or private key embedded')

# Refresh only changed browser files after a deployment; keep the large data cache.
html=out/'index.html'
markup=html.read_text(encoding='utf-8')
for filename in ['app.js','config.js','style.css','data.js']:
    version=hashlib.sha256((out/filename).read_bytes()).hexdigest()[:12]
    markup=markup.replace('"'+filename+'"','"'+filename+'?v='+version+'"')
html.write_text(markup,encoding='utf-8')
