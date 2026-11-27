/* Binary layout adapted from jtwilli/melvor2sim (MIT), see save-vendor/LICENSE-melvor2sim.txt. */
const saveShort = id => id.replace(/^MelvorBase:/, '');
const saveUTF8 = new TextDecoder('utf-8', {fatal:true});

class WikiSaveReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
    this.pos = 0;
  }
  take(size) {
    if (size < 0 || this.pos + size > this.bytes.length) throw new Error('Truncated save');
    const start = this.pos;
    this.pos += size;
    return start;
  }
  i32() { return this.view.getInt32(this.take(4),true); }
  i64() { return this.view.getBigInt64(this.take(8),true); }
  f64() {
    const value = this.view.getFloat64(this.take(8),true);
    if (!Number.isFinite(value)) throw new Error('Invalid number in save');
    return value;
  }
  u8() { return this.view.getUint8(this.take(1)); }
  bool() {
    const value = this.u8();
    if (value > 1) throw new Error('Invalid flag in save');
    return Boolean(value);
  }
  str() {
    let size = 0;
    for (let shift=0; shift<=28; shift+=7) {
      const byte = this.u8();
      size += (byte & 127)*2**shift;
      if (size > 1048576) break;
      if (!(byte & 128)) {
        const start = this.take(size);
        return saveUTF8.decode(this.bytes.subarray(start,this.pos));
      }
    }
    throw new Error('Invalid text length in save');
  }
  optional() { return this.bool() ? this.str() : ''; }
  region() {
    const start = this.take(this.i32());
    return new WikiSaveReader(this.bytes.subarray(start,this.pos));
  }
  list(read) {
    const count = this.i32();
    if (count < 0 || count > 250000 || count > this.bytes.length-this.pos) throw new Error('Invalid entry count in save');
    return Array.from({length:count},() => read(this));
  }
  entries(read) { return new Map(this.list(read)); }
  get left() { return this.bytes.length-this.pos; }
}

async function wikiSaveInflate(file) {
  const module = await import('./save-vendor/pkg/brotli_dec_wasm.js');
  await module.default();
  const input = new Uint8Array(await file.arrayBuffer());
  const stream = new module.BrotliDecStream();
  const chunks = [];
  let size = 0, offset = 0;
  const bufferSize = 262144;
  try {
    for (;;) {
      const result = stream.decompress(input.subarray(offset),bufferSize);
      let code, chunk;
      try {
        code = result.code;
        chunk = result.buf;
        offset += result.input_offset;
      } finally { result.free(); }
      size += chunk.length;
      if (size > 24*1024*1024) throw new Error('Save is too large');
      chunks.push(chunk);
      if (code===module.BrotliStreamResultCode.ResultSuccess ||
          (code===module.BrotliStreamResultCode.NeedsMoreInput && chunk.length<bufferSize)) break;
      if (!chunk.length) throw new Error('Invalid compressed save');
    }
    // Melvor flushes the stream without writing a Brotli end marker.
    const output = new Uint8Array(size);
    let index = 0;
    for (const chunk of chunks) { output.set(chunk,index); index += chunk.length; }
    return output;
  } finally { stream.free(); }
}

function wikiSaveSlots(reader, combat = false) {
  return new Map(reader.list(r => {
    const slot = r.str(), entry = r.region(), quantity = entry.i32();
    if (combat) entry.bool();
    return [slot, entry.bool() ? {id:entry.str(),quantity} : null];
  }).filter(([,item]) => item));
}

function wikiSaveBank(reader, version) {
  reader.i32();
  return reader.list(r => {
    r.take(14);
    const items = r.list(i => ({quantity:i.i32(),placeholder:i.bool(),locked:i.bool(),id:i.str()}));
    const name = r.str();
    r.list(i => { i.bool(); i.bool(); return i.str(); });
    if (version >= 32) r.optional(); // Custom bank-tab icon.
    return {name,items};
  });
}

function wikiSaveStatistics(reader) {
  const values = reader.entries(r => [r.str(),r.region().f64()]);
  const groups = new Map();
  while (reader.left) {
    for (const [id,rows] of reader.entries(r => [r.str(),r.region().entries(row => {
      const amount = row.f64();
      return [row.str(),amount];
    })])) groups.set(id,rows);
  }
  return {values,groups};
}

function wikiSaveLootHistory(reader, thieving = false) {
  return reader.entries(r => {
    const id = r.str(), record = r.region(), count = record.i32();
    const items = record.entries(row => { const amount = row.i32(); return [row.str(),amount]; });
    const currency = record.entries(row => { const amount = row.i64(); return [saveShort(row.str()),amount]; });
    record.take(8);
    const time = Number(record.i64())/1e7;
    const xp = record.entries(row => { const amount = row.f64(), skill = row.str(); row.str(); return [skill,amount]; });
    const active = thieving ? Number(record.i64())/1e7 : time;
    const stunned = thieving ? Number(record.i64())/1e7 : 0;
    return [id,{count,items,currency,time,xp,active,stunned}];
  });
}

function wikiSaveQuest(reader) {
  return reader.entries(r => {
    const id = r.str(), q = r.region(), status = q.i32();
    const steps = q.entries(row => {
      const step = row.str(), s = row.region();
      const tasks = s.entries(task => {
        const id = task.str(), t = task.region();
        const goals = t.entries(goal => {
          const id = goal.str(), g = goal.region();
          return [id,{progress:g.f64(),complete:g.bool()}];
        });
        t.take(2);
        return [id,{goals,status:t.i32()}];
      });
      s.bool();
      return [step,{tasks,status:s.i32()}];
    });
    return [id,{status,steps}];
  });
}

function wikiSaveMastery(reader) {
  reader.optional();
  return reader.entries(r => {
    const id = r.str(), t = r.region();
    let progress = null, complete = null;
    if (t.optional()) { const g=t.region(); progress=g.f64(); complete=g.bool(); }
    return [id,{progress,complete,trigger:t.bool()}];
  });
}

function wikiSaveAstrology(reader) {
  reader.take(16);
  return reader.entries(r => {
    const id = r.str(), c = r.region(), knowledge = c.f64();
    return [id,{knowledge,minor:c.list(row => row.str()),major:c.list(row => row.str())}];
  });
}

function wikiSaveParse(bytes) {
  const r = new WikiSaveReader(bytes), version = r.i32();
  if (version !== 31 && version !== 32) throw new Error('Unsupported save version');
  r.take(16); // Character ID is deliberately discarded.
  const character=r.str(), mode=r.str(), ticks=r.i64() & 0x3fffffffffffffffn;
  const activeSkill=r.str(); r.str();
  const activeAction=r.str(); r.str();
  const totalLevel=r.i32(), gold=r.i64(), slayerCoins=r.i64(), demo=r.bool();
  const entities = r.entries(row => [saveShort(row.str()),row.region().entries(part => [part.str(),part.region()])]);
  // Saves can have a trailer after the length-prefixed entity array.
  if (!entities.size) throw new Error('Invalid save structure');
  const save = {version,character,mode,ticks,activeSkill,activeAction,totalLevel,gold,slayerCoins,demo,
    warnings:[],skills:new Map(),toolbelts:new Map(),mastery:new Map(),stats:new Map(),pets:new Map()};
  function component(entity,key,read,fallback) {
    const value = entities.get(entity)?.get(key);
    if (!value) return fallback;
    try { return read(value); }
    catch { save.warnings.push(entity+'/'+key); return fallback; }
  }
  for (const key of entities.keys()) {
    const xp = component(key,'Experience',row => Math.max(0,row.f64()));
    if (xp !== undefined) save.skills.set(key,xp);
    const slots = component(key,'Toolbelt',wikiSaveSlots);
    if (slots?.size) save.toolbelts.set(key,slots);
    const mastery = component(key,'MasteryGuild',wikiSaveMastery);
    if (mastery?.size) save.mastery.set(key,mastery);
    const stats = component(key,'Statistics',wikiSaveStatistics);
    if (stats) save.stats.set(key,stats);
    const pets = component(key,'Pets',row => row.entries(p => [p.str(),p.region().bool()]));
    if (pets?.size) save.pets.set(key,pets);
  }
  if (!save.skills.size) throw new Error('Save has no readable skill progress');
  save.bank = component('Bank','Inventory',row => wikiSaveBank(row,version),[]);
  save.wallet = component('Bank','Wallet',row => row.entries(c => {
    const amount = c.i64(); return [saveShort(c.str()),amount];
  }),new Map());
  save.shop = component('Shop','Shop',row => {
    row.take(11);
    return row.entries(s => { const amount=s.i32(); return [s.str(),amount]; });
  },new Map());
  save.equipment = component('Combat','Equipment',row => {
    const slots = wikiSaveSlots(row,true);
    return {slots,loadouts:row.entries(r => [r.str(),wikiSaveSlots(r.region(),true)])};
  },{slots:new Map(),loadouts:new Map()});
  save.combat = component('Combat','LootHistory',wikiSaveLootHistory,new Map());
  save.thieving = component('Thieving','LootHistory',row => wikiSaveLootHistory(row,true),new Map());
  save.quests = component('Quests','Quests',wikiSaveQuest,new Map());
  save.astrology = component('Astrology','Action',wikiSaveAstrology,new Map());
  save.slayer = component('Slayer','Tasks',row => row.entries(r => {
    const id = r.str(), m = r.region(), target = m.optional();
    return [id,{target,length:m.i32(),progress:m.i32(),extended:m.bool(),auto:m.bool(),
      blocked:m.entries(row => { const slot=row.str(), b=row.region(); return [slot,{unlocked:b.bool(),target:b.optional()}]; })}];
  }),new Map());
  save.hunting = component('Hunting','Journal',row => row.entries(r => {
    const id = r.str(), j = r.region();
    return [id,{discovered:j.bool(),xp:j.f64(),level:j.i32()}];
  }),new Map());
  save.techniques = component('Agility','Techniques',row => row.entries(r => [r.str(),r.region().f64()]),new Map());
  save.magic = component('Combat','MagicSpells',row => [row.optional(),row.optional()],[]);
  save.combatFood = component('Combat','Food',row => row.optional(),'');
  save.thievingFood = component('Thieving','Food',row => row.optional(),'');
  save.agilityFood = component('Agility','Food',row => row.optional(),'');
  save.fishingBait = component('Fishing','BaitComponent',row => row.optional(),'');
  return save;
}
