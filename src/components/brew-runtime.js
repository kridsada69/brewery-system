// UI behavior migrated from the reviewed interactive prototype.
// Domain data is validated and persisted through the Next.js state API.
export function mountBrewery(root, storage) {
  const listeners = [];
  const nativeDocument = globalThis.document;
  const document = new Proxy(nativeDocument, {
    set(target, key, value) { return Reflect.set(target, key, value, target); },
    get(target, key) {
      if (key === 'body') return root;
      if (key === 'querySelector') return selector => root.querySelector(selector);
      if (key === 'querySelectorAll') return selector => root.querySelectorAll(selector);
      if (key === 'getElementById') return id => root.querySelector('#' + id);
      if (key === 'addEventListener') return (name, handler, options) => {
        target.addEventListener(name, handler, options);
        listeners.push([name, handler, options]);
      };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

const maxSlots = 3;
const maxLiters = 60;
// Sample recipe records standing in for the recipe database.
const recipes = {
  'Von Elbert': {dryHopAfterDays: 4, hops:[{name:'Citra', grams:60}, {name:'Mosaic', grams:40}]},
  'Daybreak Lager': {dryHopAfterDays: null, hops:[]},
  'Citrus Trail IPA': {dryHopAfterDays: 5, hops:[{name:'Simcoe', grams:50}, {name:'Centennial', grams:30}]},
  'Midnight Stout': {dryHopAfterDays: null, hops:[]}
};
const seed = [
  {id:'C-01', batches:[]},
  {id:'C-02', batches:[{recipe:'Von Elbert', og:1.067, ph:5.5, liters:48, fermentedOn:'2026-11-06', dryHopAfterDays:4}]},
  {id:'C-03', batches:[]}
];
const board = document.querySelector('#board');
const entry = document.querySelector('#entry');
const form = document.querySelector('#batch');
const notice = document.querySelector('#notice');
const error = document.querySelector('#error');
const storageKey = 'brew-day-board-v1';
let cabinets = structuredClone(seed);
let history = [];
let stockOpening = {};
try {
  const saved = JSON.parse(storage.getItem(storageKey));
  if (saved) ({cabinets, history, stockOpening = {}} = saved);
} catch {
  notice.textContent = 'เปิดข้อมูลที่บันทึกไว้ไม่ได้ กำลังใช้ข้อมูลตัวอย่าง';
}
function persist() {
  try {
    storage.setItem(storageKey, JSON.stringify({cabinets, history, stockOpening}));
    return '';
  } catch {
    return ' · เบราว์เซอร์เก็บข้อมูลข้ามการรีเฟรชไม่ได้';
  }
}
let selected;
let selectedSlot;
let historyIndex = null;
let sgDraft;
let editingDate;
const tracking = document.querySelector('#tracking');
const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Bangkok'}).format(new Date());
const recipeSelect = form.elements.recipe;
Object.assign(recipes['Von Elbert'], {
  liters:60,
  malt:[{name:'Pale Ale Malt', amount:11, unit:'kg', stage:'Mash'}],
  hopRows:[{name:'Magnum', amount:35, unit:'g', stage:'Boil', minutes:60},
    {name:'Citra', amount:60, unit:'g', stage:'Dry Hop'}, {name:'Mosaic', amount:40, unit:'g', stage:'Dry Hop'}],
  yeast:[{name:'US-05', laboratory:'Fermentis', productId:'US-05', amount:33, unit:'g', stage:'Primary fermentation'}]
});
const recipeStorageKey = 'brew-day-imported-recipes';
let importedRecipes = {};
try {
  importedRecipes = JSON.parse(storage.getItem(recipeStorageKey)) ?? {};
  Object.assign(recipes, importedRecipes);
} catch {}
const removedRecipeKey = 'brew-day-removed-recipes';
let removedRecipes = new Set();
try {
  removedRecipes = new Set(JSON.parse(storage.getItem(removedRecipeKey)) ?? []);
} catch {}
const recipeLibrary = document.querySelector('#recipe-library');
const recipeFeedback = document.querySelector('#recipe-feedback');
function refreshRecipeOptions() {
  const current = recipeLibrary.value;
  recipeLibrary.replaceChildren();
  recipeSelect.length = 1;
  for (const name of Object.keys(recipes)) {
    if (removedRecipes.has(name)) continue;
    recipeLibrary.add(new Option(name, name));
    recipeSelect.add(new Option(name, name));
  }
  if (Object.hasOwn(recipes, current) && !removedRecipes.has(current)) recipeLibrary.value = current;
}
const escapeHtml = value => String(value).replace(/[&<>]/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'}[char]));

function parseBeerXml(xml) {
  const root = new DOMParser().parseFromString(xml, 'application/xml');
  if (root.querySelector('parsererror') || root.doctype) throw new Error('อ่านไฟล์ XML ไม่ได้');
  const elements = [...root.querySelectorAll('RECIPES > RECIPE, :root:is(RECIPE)')];
  if (!elements.length) throw new Error('ไฟล์นี้ไม่มีสูตร BeerXML');
  const result = Object.create(null);
  for (const element of elements) {
    const field = (node, tag) => [...node.children].find(child => child.localName === tag)?.textContent.trim() ?? '';
    const rows = (group, tag) => [...element.querySelectorAll(group + ' > ' + tag)];
    const readAmount = (node, tag) => {
      const raw = field(node, tag);
      const value = Number(raw);
      return raw && Number.isFinite(value) && value >= 0 ? value : null;
    };
    const scale = (amount, factor) => amount === null ? null : Number((amount * factor).toPrecision(12));
    const baseName = field(element, 'NAME');
    if (!baseName) throw new Error('พบสูตรที่ไม่มีชื่อ');
    let name = baseName;
    for (let index = 2; name in recipes || Object.hasOwn(result, name); index++) name = baseName + ' (' + index + ')';
    const malt = rows('FERMENTABLES', 'FERMENTABLE').map(node => ({
      name:field(node, 'NAME'), amount:readAmount(node, 'AMOUNT'), unit:'kg',
      stage:field(node, 'ADD_AFTER_BOIL').toUpperCase() === 'TRUE' ? 'After boil' :
        field(node, 'TYPE').toLowerCase() === 'grain' ? 'Mash' : ''
    }));
    const hopRows = rows('HOPS', 'HOP').map(node => ({
      name:field(node, 'NAME'), amount:scale(readAmount(node, 'AMOUNT'), 1000), unit:'g',
      stage:field(node, 'USE'), minutes:readAmount(node, 'TIME')
    }));
    const yeast = rows('YEASTS', 'YEAST').map(node => {
      const byWeight = field(node, 'AMOUNT_IS_WEIGHT').toUpperCase() === 'TRUE';
      return {name:field(node, 'NAME'), laboratory:field(node, 'LABORATORY'), productId:field(node, 'PRODUCT_ID'), amount:scale(readAmount(node, 'AMOUNT'), 1000),
        unit:byWeight ? 'g' : 'mL', stage:field(node, 'ADD_TO_SECONDARY').toUpperCase() === 'TRUE' ? 'Secondary fermentation' : 'Primary fermentation'};
    });
    // TIME is contact duration. Only an explicit start offset sets the schedule.
    const notes = field(element, 'NOTES');
    const startFromNotes = notes.match(/dry[ -]hop(?:ping)?\s*(?:[:–-]\s*)?(?:on\s+)?(?:fermentation\s+)?day\s*(\d+)\b/i);
    const thaiStart = notes.match(/dry[ -]hop\s+หลัง(?:จาก)?(?:หลัง)?(?:หมัก|เริ่มหมัก)(?:แล้ว)?\s*(\d+)\s*วัน/i);
    const startDays = readAmount(element, 'DRY_HOP_START_DAY') ?? ((startFromNotes ?? thaiStart) ? Number((startFromNotes ?? thaiStart)[1]) : null);
    const dryHopAfterDays = hopRows.some(hop => hop.stage.toLowerCase() === 'dry hop') &&
      Number.isInteger(startDays) && startDays >= 0 && startDays <= 365 ? startDays : null;
    result[name] = {
      liters:readAmount(element, 'BATCH_SIZE'), dryHopAfterDays, malt, hopRows, yeast,
      hops:hopRows.filter(hop => hop.stage.toLowerCase() === 'dry hop' && hop.amount !== null)
        .map(hop => ({name:hop.name, grams:hop.amount}))
    };
  }
  return result;
}

function recipeInput(label, value, update, numeric = false) {
  const input = document.createElement('input');
  input.className = 'w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm';
  input.setAttribute('aria-label', label);
  input.type = numeric ? 'number' : 'text';
  input.value = value ?? '';
  if (numeric) {
    input.min = '0';
    input.step = 'any';
  } else {
    input.required = true;
    input.pattern = '.*\\S.*';
  }
  input.addEventListener('input', () => update(numeric
    ? input.value === '' ? null : input.valueAsNumber
    : input.value.trim()));
  return input;
}

function yeastName(row) {
  const parts = [row.name, row.laboratory, row.productId].filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

function renderRecipe(editing = false) {
  const name = recipeLibrary.value;
  const original = recipes[name];
  const recipe = editing && original ? structuredClone(original) : original;
  if (editing && recipe && !recipe.hopRows) {
    recipe.hopRows = recipe.hops.map(hop => ({name:hop.name, amount:hop.grams, unit:'g', stage:'Dry Hop'}));
  }
  const details = document.querySelector('#recipe-details');
  details.replaceChildren();
  document.querySelector('#delete-recipe').hidden = !recipe || editing;
  document.querySelector('#edit-recipe').hidden = !recipe || editing;
  if (!recipe) {
    details.textContent = 'ยังไม่มีสูตรเบียร์';
    return;
  }
  const content = editing ? document.createElement('form') : details;
  if (editing) {
    content.className = 'space-y-4';
    details.append(content);
  }
  if (!Object.hasOwn(importedRecipes, recipeLibrary.value)) {
    const badge = document.createElement('p');
    badge.className = 'text-xs text-zinc-400';
    badge.textContent = 'สูตรตัวอย่าง';
    content.append(badge);
  }
  if (editing) {
    const volume = document.createElement('label');
    volume.className = 'block max-w-48 space-y-1 text-sm';
    volume.append('ขนาดรอบต้ม (L)', recipeInput('ขนาดรอบต้ม (L)', recipe.liters, value => { recipe.liters = value; }, true));
    content.append(volume);
  } else if (recipe.liters != null) {
    const volume = document.createElement('p');
    volume.className = 'text-sm text-zinc-300';
    volume.textContent = 'ขนาดรอบต้ม · ' + recipe.liters + ' L';
    content.append(volume);
  }
  if (recipe.dryHopAfterDays != null && !hopGroups(recipe).some(group => hazeHopOffset(recipeLibrary.value, group.minutes) !== null)) {
    const start = document.createElement('p');
    start.className = 'text-sm text-amber-300';
    start.textContent = 'เริ่ม Dry Hop หลังเริ่มหมัก · ' + recipe.dryHopAfterDays + ' วัน';
    content.append(start);
  }
  for (const [label, rows] of [
    ['Malt / Fermentables', recipe.malt],
    ['Hop', recipe.hopRows ?? recipe.hops.map(hop => ({name:hop.name, amount:hop.grams, unit:'g', stage:'Dry Hop'}))],
    ['Yeast', recipe.yeast]
  ]) {
    const group = document.createElement('div');
    group.className = 'min-w-0 rounded-xl border border-zinc-700 px-3 py-2 sm:px-4';
    group.innerHTML = `<h3 class="mb-2 font-semibold text-amber-300">${label}</h3>
      <table class="recipe-table w-full text-left text-sm"><colgroup><col><col><col></colgroup><thead class="text-zinc-400">
      <tr><th scope="col">วัตถุดิบ</th><th scope="col">ปริมาณ</th><th scope="col">ช่วงที่ใส่ / เวลา</th></tr>
      </thead><tbody></tbody></table>`;
    const body = group.querySelector('tbody');
    for (const row of rows ?? []) {
      const tr = body.insertRow();
      tr.className = 'border-t border-zinc-800';
      const dryHop = row.stage?.toLowerCase() === 'dry hop';
      const days = row.minutes / 1440;
      const time = dryHop && hazeHopOffset(recipeLibrary.value, row.minutes) !== null
        ? hopTiming(recipeLibrary.value, row.minutes) : row.minutes == null ? '' : dryHop
        ? ' · ' + new Intl.NumberFormat(language, {maximumSignificantDigits:6}).format(days) +
          (language === 'th' ? ' วัน' : days === 1 ? ' day' : ' days')
        : ' · ' + row.minutes + ' min';
      // This brewery's XML export uses the yeast amount as kg even when flagged as volume.
      const unit = label === 'Yeast' ? 'g' : row.unit;
      const name = label === 'Yeast' ? yeastName(row) : row.name;
      for (const value of [name || '—', row.amount == null ? '—' : row.amount + ' ' + unit, (row.stage || '—') + time]) {
        const cell = tr.insertCell();
        const caption = document.createElement('span');
        caption.className = 'recipe-cell-label';
        caption.setAttribute('aria-hidden', 'true');
        caption.textContent = ['วัตถุดิบ', 'ปริมาณ', 'ช่วงที่ใส่ / เวลา'][cell.cellIndex];
        cell.append(caption);
        if (editing && cell.cellIndex === 0) {
          cell.append(recipeInput('วัตถุดิบ', row.name, value => { row.name = value; }));
          if (label === 'Yeast') {
            const metadata = document.createElement('p');
            metadata.className = 'mt-1 text-xs text-zinc-400';
            metadata.textContent = [row.laboratory, row.productId].filter(Boolean).join(' · ');
            cell.append(metadata);
          }
        } else if (editing && cell.cellIndex === 1) {
          const amount = recipeInput('ปริมาณ', row.amount, value => { row.amount = value; }, true);
          amount.required = row.amount != null;
          // Keep the checklist indices stable for existing batches.
          amount.disabled = dryHop && row.amount == null;
          cell.append(amount, ' ' + unit);
        } else {
          cell.append(value);
        }
      }
    }
    if (!body.rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 3;
      cell.className = 'py-2 text-zinc-400';
      cell.textContent = 'ไม่มีข้อมูลวัตถุดิบ';
    }
    content.append(group);
  }
  if (!editing) return;

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';
  actions.innerHTML = `<button type="button" class="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-zinc-800">ยกเลิก</button>
    <button class="cursor-pointer rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950">บันทึกสูตร</button>`;
  actions.firstElementChild.addEventListener('click', () => {
    renderRecipe();
    document.querySelector('#edit-recipe').focus();
  });
  content.append(actions);
  content.querySelector('input').focus();
  content.addEventListener('submit', event => {
    event.preventDefault();
    recipe.hops = recipe.hopRows.filter(row => row.stage?.toLowerCase() === 'dry hop' && row.amount != null)
      .map(row => ({name:row.name, grams:row.amount}));
    const updated = {...importedRecipes, [name]:recipe};
    try {
      storage.setItem(recipeStorageKey, JSON.stringify(updated));
    } catch {
      recipeFeedback.textContent = 'บันทึกการแก้ไขสูตรไม่ได้';
      return;
    }
    importedRecipes = updated;
    recipes[name] = recipe;
    renderRecipe();
    render();
    recipeFeedback.textContent = 'บันทึกสูตรแล้ว';
    document.querySelector('#edit-recipe').focus();
  });
}

document.querySelector('#edit-recipe').addEventListener('click', () => renderRecipe(true));
document.querySelector('#delete-recipe').addEventListener('click', () => {
  const name = recipeLibrary.value;
  if (!name || removedRecipes.has(name)) return;
  if (!window.confirm(language === 'en' ? `Delete recipe “${name}” from the library?` : `ยืนยันการลบสูตร “${name}” หรือไม่?`)) return;
  const updated = new Set([...removedRecipes, name]);
  try {
    storage.setItem(removedRecipeKey, JSON.stringify([...updated]));
  } catch {
    recipeFeedback.textContent = 'บันทึกการลบสูตรไม่ได้';
    return;
  }
  removedRecipes = updated;
  refreshRecipeOptions();
  renderRecipe();
  renderStock();
  recipeFeedback.textContent = 'ลบสูตรแล้ว';
  recipeLibrary.focus();
});
recipeLibrary.addEventListener('change', () => renderRecipe());
document.querySelector('#recipe-file').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  try {
    const bytes = await file.arrayBuffer();
    const probe = new TextDecoder().decode(bytes.slice(0, 256));
    const encoding = probe.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1];
    const bom = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
    const decoder = new TextDecoder(bom[0] === 255 && bom[1] === 254 ? 'utf-16le' :
      bom[0] === 254 && bom[1] === 255 ? 'utf-16be' : encoding || 'utf-8');
    const added = parseBeerXml(decoder.decode(bytes));
    const updated = {...importedRecipes, ...added};
    storage.setItem(recipeStorageKey, JSON.stringify(updated));
    importedRecipes = updated;
    Object.assign(recipes, added);
    refreshRecipeOptions();
    recipeLibrary.value = Object.keys(added)[0];
    renderRecipe();
    renderStock();
    recipeFeedback.textContent = 'นำเข้าสูตรแล้ว · ' + Object.keys(added).length;
  } catch (error) {
    recipeFeedback.textContent = 'นำเข้าไม่สำเร็จ · ' + (error.name === 'Error' ? error.message : 'อ่านหรือบันทึกไฟล์ไม่ได้');
  }
});
refreshRecipeOptions();

let dateFormat = new Intl.DateTimeFormat('th-TH', {dateStyle:'medium', timeZone:'UTC'});

const sgEditor = document.querySelector('#sg-editor');
const sgRows = document.querySelector('#sg-rows');
const sgDate = document.querySelector('#sg-date');
const sgValue = document.querySelector('#sg-value');
const sgError = document.querySelector('#sg-error');

function renderSg() {
  sgRows.innerHTML = Object.keys(sgDraft).sort().reverse().map(date => `
    <tr class="border-t border-zinc-700">
      <td class="py-2">${dateFormat.format(new Date(date + 'T00:00:00Z'))}</td>
      <td class="tabular-nums">${sgDraft[date].toFixed(3)}</td>
      <td class="text-right">
        <button type="button" data-edit-sg="${date}" aria-label="แก้ไขค่า SG" title="แก้ไข" class="inline-grid size-8 cursor-pointer place-items-center rounded text-blue-300 hover:bg-zinc-700">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15z"/></svg>
        </button>
        <button type="button" data-delete-sg="${date}" aria-label="ลบค่า SG" title="ลบ" class="inline-grid size-8 cursor-pointer place-items-center rounded text-red-300 hover:bg-zinc-700">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>
        </button>
      </td>
    </tr>`).join('') || '<tr><td colspan="3" class="py-2 text-zinc-400">ยังไม่มีค่า SG</td></tr>';
}

function closeSg() {
  sgEditor.hidden = true;
  sgDate.disabled = true;
  sgValue.disabled = true;
}

function openSg(date = null) {
  editingDate = date;
  sgDate.value = date ?? today();
  sgValue.value = date ? sgDraft[date] : '';
  sgError.textContent = '';
  sgDate.disabled = false;
  sgValue.disabled = false;
  sgEditor.hidden = false;
  sgDate.focus();
}

document.querySelector('#sg-add').addEventListener('click', () => openSg());
document.querySelector('#sg-cancel').addEventListener('click', closeSg);
document.querySelector('#sg-save').addEventListener('click', () => {
  const date = sgDate.value;
  if (!date || !sgValue.value || !sgValue.checkValidity()) {
    sgError.textContent = 'กรุณาเลือกวันที่และกรอกค่า SG เช่น 1.012';
    return;
  }
  if (date !== editingDate && Object.hasOwn(sgDraft, date)) {
    sgError.textContent = 'วันนี้มีค่า SG แล้ว กรุณาแก้ไขจากตาราง';
    return;
  }
  if (editingDate) delete sgDraft[editingDate];
  sgDraft[date] = sgValue.valueAsNumber;
  closeSg();
  renderSg();
});
sgRows.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.editSg) {
    openSg(button.dataset.editSg);
    return;
  }
  delete sgDraft[button.dataset.deleteSg];
  if (editingDate === button.dataset.deleteSg) closeSg();
  renderSg();
});

function dryHopDate(date, days, override) {
  if (override) return override;
  if (!date || days == null) return null;
  const target = new Date(date + 'T00:00:00Z');
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

function openHopPicker(input) {
  input.hidden = false;
  input.focus();
  try { input.showPicker?.(); } catch {}
}

function updateDryHop() {
  const recipe = recipes[recipeSelect.value];
  const date = form.elements.fermentedOn.value;
  for (const input of form.querySelectorAll('[data-hop-date]')) {
    input.min = date;
    const offset = hazeHopOffset(recipeSelect.value, Number(input.dataset.minutes)) ?? recipe?.dryHopAfterDays;
    const scheduled = dryHopDate(date, offset, input.value);
    input.previousElementSibling.textContent = scheduled
      ? 'วัน Dry Hop · ' + dateFormat.format(new Date(scheduled + 'T00:00:00Z')) : 'กำหนดวันเริ่ม Dry Hop';
  }
}
form.addEventListener('input', updateDryHop);
const hopList = document.querySelector('#hop-list');
hopList.addEventListener('click', event => {
  const button = event.target.closest('[data-hop-schedule]');
  if (button) openHopPicker(button.nextElementSibling);
});

hopList.addEventListener('change', event => {
  const input = event.target.closest('[data-hop-date]');
  if (input && input.checkValidity()) {
    input.hidden = true;
    input.previousElementSibling.focus();
  }
});
hopList.addEventListener('invalid', event => {
  if (event.target.matches('[data-hop-date]')) event.target.hidden = false;
}, true);

function hopGroups(recipe) {
  const rows = recipe?.hopRows?.filter(hop => hop.stage.toLowerCase() === 'dry hop' && hop.amount !== null);
  const groups = new Map();
  (recipe?.hops ?? []).forEach((hop, index) => {
    const minutes = rows?.[index]?.minutes ?? null;
    const key = String(minutes ?? 'default');
    if (!groups.has(key)) groups.set(key, {key, minutes, hops:[]});
    groups.get(key).hops.push({...hop, index});
  });
  return [...groups.values()];
}
// The brewer confirmed this interpretation for Haze 7-0 v.23.
function hazeHopOffset(name, minutes) {
  if (!/^haze\s+7-?0\s+v\.?23(?:\s+\(\d+\))?$/i.test(name.trim())) return null;
  if (minutes === 2880) return 2;
  if (minutes === 5760) return 14 - 4;
  return null;
}
function hopTiming(name, minutes) {
  const offset = hazeHopOffset(name, minutes);
  if (offset === 2) return ' · หลังเริ่มหมัก 2 วัน';
  if (offset === 10) return ' · ก่อนจบการหมัก 4 วัน';
  return hopDuration(minutes);
}
function hopDuration(minutes) {
  return minutes == null ? '' : ' · ' + Number((minutes / 1440).toPrecision(6)) + ' วัน';
}
function scheduledHopGroups(batch) {
  return hopGroups((batch.recipeSnapshot ?? recipes[batch.recipe])).map(group => ({
    ...group,
    date:dryHopDate(batch.fermentedOn, hazeHopOffset(batch.recipe, group.minutes) ?? batch.dryHopAfterDays, batch.dryHopDates?.[group.key] || batch.dryHopOn)
  }));
}
function renderHops() {
  const batch = historyIndex === null ? cabinets[selected].batches[selectedSlot] : history[historyIndex];
  const groups = hopGroups(batch?.recipe === recipeSelect.value
    ? batch.recipeSnapshot ?? recipes[recipeSelect.value] : recipes[recipeSelect.value]);
  const saved = batch?.recipe === recipeSelect.value ? batch : null;
  const completed = saved?.completedHops ?? [];
  hopList.innerHTML = groups.map(({key, minutes, hops}, groupIndex) => `
    <div class="space-y-2 rounded-xl border border-zinc-700 p-3">
      <p class="text-sm font-semibold text-amber-300">รอบ Dry Hop ${groupIndex + 1}${hopTiming(recipeSelect.value, minutes)}</p>
      <button type="button" data-hop-schedule class="cursor-pointer text-xs text-zinc-400 underline decoration-dotted underline-offset-4"></button>
      <input type="date" hidden aria-label="วันเริ่มรอบนี้" data-hop-date data-minutes="${minutes ?? ''}" name="dryHopGroup-${key}" value="${saved?.dryHopDates?.[key] || saved?.dryHopOn || ''}" class="block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2">
      ${hops.map(({name, grams, index}) => `
        <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2 text-sm has-checked:border-emerald-600 has-checked:bg-emerald-950">
          <input type="checkbox" name="completedHops" value="${index}" ${completed.includes(index) ? 'checked' : ''} class="peer size-4 accent-emerald-500">
          <span class="peer-checked:text-emerald-300 peer-checked:line-through">${escapeHtml(name)} · ${grams} g</span>
        </label>`).join('')}
    </div>`).join('') || '<p class="text-sm text-zinc-400">ไม่มีรายการ Dry Hop</p>';
  updateDryHop();
}
recipeSelect.addEventListener('change', renderHops);

function fermentationDays(batch) {
  const end = batch.completedOn ?? today();
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(batch.fermentedOn)) / 86400000));
}

function renderHistory() {
  const container = document.querySelector('#history');
  container.replaceChildren();
  if (!history.length) container.textContent = 'ยังไม่มี Batch ที่เสร็จแล้ว';
  for (const [index, batch] of history.entries()) {
    const item = document.createElement('details');
    item.className = 'rounded-lg border border-zinc-700 p-3';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer';
    summary.textContent = `${batch.recipe} · ${batch.cabinetId} · ${batch.liters} ลิตร · Complete ${batch.completedOn}`;
    const details = document.createElement('p');
    details.className = 'mt-2 whitespace-pre-wrap text-xs leading-6';
    const sg = Object.entries(batch.sgByDate ?? {}).sort().map(([date, value]) => `${date} · ${value.toFixed(3)}`);
    const hops = (batch.recipeSnapshot ?? recipes[batch.recipe]).hops.map(({name, grams}, index) =>
      `${batch.completedHops?.includes(index) ? '✓ ' : ''}${name} ${grams} g`);
    details.textContent = [
      `วันหมัก ${batch.fermentedOn} · ${fermentationDays(batch)} วัน · OG ${batch.og.toFixed(3)} · pH ${batch.ph.toFixed(2)}`,
      ...scheduledHopGroups(batch).map((group, index) =>
        'รอบ Dry Hop ' + (index + 1) + hopTiming(batch.recipe, group.minutes) + ' · ' + (group.date ?? 'ยังไม่กำหนดวันเริ่ม Dry Hop')),
      ...hops, ...sg.map(row => 'SG ' + row)
    ].filter(Boolean).join('\n');
    const actions = document.createElement('div');
    actions.className = 'mt-2 flex gap-3';
    for (const [action, icon, label] of [['edit', '✎', 'แก้ไข Batch'], ['delete', '🗑', 'ลบ Batch']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'size-8 cursor-pointer rounded hover:bg-zinc-700';
      button.textContent = icon;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        if (action === 'edit') {
          historyIndex = index;
          openBatch(batch, batch.cabinetId);
        } else if (window.confirm(language === 'en' ? `Delete ${batch.recipe} from batch history?` : 'ลบ ' + batch.recipe + ' ออกจากประวัติ Batch หรือไม่?')) {
          history.splice(index, 1);
          renderHistory();
          renderStock();
          notice.textContent = 'ลบ Batch จากประวัติแล้ว' + persist();
        }
      });
      actions.append(button);
    }
    item.append(summary, details);
    if (batch.note) {
      const note = document.createElement('p');
      note.dataset.userText = '';
      note.className = 'mt-2 whitespace-pre-wrap text-xs';
      note.textContent = batch.note;
      item.append(note);
    }
    item.append(actions);
    container.append(item);
  }
}

const statusStyles = {
  Plan: 'bg-amber-400/10 text-amber-300',
  Ferment: 'bg-emerald-400/10 text-emerald-300',
  'Cold crash': 'bg-sky-400/10 text-sky-300'
};

let calendarMonth = new Date(today().slice(0, 7) + '-01T00:00:00Z');
let monthFormat = new Intl.DateTimeFormat('th-TH', {month:'long', year:'numeric', timeZone:'UTC'});

function renderCalendar() {
  const events = new Map();
  function add(date, event) {
    if (!events.has(date)) events.set(date, []);
    events.get(date).push(event);
  }
  cabinets.forEach(({id, batches}, cabinet) => {
    batches.forEach((batch, slot) => {
      if (!batch) return;
      const event = {label:`${id} · ถัง ${slot + 1} · ${batch.recipe}`, cabinet, slot};
      add(batch.fermentedOn, {...event, title:batch.status === 'Plan' ? 'แผนวันหมัก' : 'วันหมัก', style:'bg-emerald-950 text-emerald-200'});
      scheduledHopGroups(batch).forEach((group, index) => {
        if (group.date) add(group.date, {...event, title:'Dry Hop ' + (index + 1) + hopTiming(batch.recipe, group.minutes), style:'bg-amber-950 text-amber-200'});
      });
    });
  });
  document.querySelector('#calendar-month').textContent = monthFormat.format(calendarMonth);
  const days = document.querySelector('#calendar-days');
  days.replaceChildren();
  const first = (calendarMonth.getUTCDay() + 6) % 7;
  const year = calendarMonth.getUTCFullYear();
  const month = calendarMonth.getUTCMonth();
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((first + total) / 7) * 7;
  for (let index = 0; index < cells; index++) {
    const number = index - first + 1;
    const cell = document.createElement('div');
    cell.className = 'min-h-20 min-w-0 space-y-1 bg-zinc-900 p-1.5 text-xs';
    days.append(cell);
    if (number < 1 || number > total) continue;
    const date = new Date(Date.UTC(year, month, number)).toISOString().slice(0, 10);
    const day = document.createElement('time');
    day.dateTime = date;
    day.textContent = number;
    if (date === today()) {
      day.className = 'rounded-full bg-blue-600 px-1.5 py-0.5 text-white';
      day.setAttribute('aria-current', 'date');
    }
    cell.append(day);
    for (const event of events.get(date) ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block w-full cursor-pointer break-words rounded px-1.5 py-1 text-left ' + event.style;
      button.textContent = event.title + ' · ' + event.label;
      button.addEventListener('click', () => {
        selected = event.cabinet;
        selectedSlot = event.slot;
        historyIndex = null;
        const cabinet = cabinets[selected];
        openBatch(cabinet.batches[selectedSlot], cabinet.id);
      });
      cell.append(button);
    }
  }
}
document.querySelector('#calendar-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-month]');
  if (!button) return;
  calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + Number(button.dataset.month));
  renderCalendar();
});

function stockItems(recipe) {
  const item = (type, name, grams) => name && grams != null ? {type, name, grams} : null;
  return {
    base:[
      ...(recipe.malt ?? []).map(row => item('Malt', row.name, row.amount == null ? null : row.amount * 1000)),
      ...(recipe.yeast ?? []).map(row => item('Yeast', yeastName(row), row.amount))
    ].filter(Boolean),
    hops:recipe.hops.map(row => item('Hop', row.name, row.grams))
  };
}

function stockForBatch(batch, previous) {
  const items = stockItems((batch.recipeSnapshot ?? recipes[batch.recipe]));
  const saved = previous?.recipe === batch.recipe ? previous.stockUsage : null;
  return {
    base:batch.status === 'Plan' ? [] : saved?.base.length ? saved.base : items.base,
    hops:Object.fromEntries((batch.completedHops ?? []).filter(index => items.hops[index])
      .map(index => [index, saved?.hops[index] ?? items.hops[index]]))
  };
}

const stockKey = ({type, name}) => JSON.stringify([type, name.trim().toLowerCase()]);
const stockForm = document.querySelector('#stock-form');
function collectStock() {
  const items = new Map();
  const add = (item, used = 0) => {
    if (!item) return;
    const key = stockKey(item);
    if (!items.has(key)) items.set(key, {...item, used:0});
    items.get(key).used += used;
  };
  for (const [name, recipe] of Object.entries(recipes)) {
    if (removedRecipes.has(name)) continue;
    const {base, hops} = stockItems(recipe);
    for (const item of [...base, ...hops]) add(item);
    for (const hop of recipe.hopRows ?? []) {
      if (hop.name) add({type:'Hop', name:hop.name});
    }
  }
  for (const batch of [...cabinets.flatMap(cabinet => cabinet.batches), ...history]) {
    if (!batch?.stockUsage) continue;
    for (const item of [...batch.stockUsage.base, ...Object.values(batch.stockUsage.hops)]) add(item, item.grams);
  }
  for (const key of Object.keys(stockOpening)) {
    if (!items.has(key)) {
      const [type, name] = JSON.parse(key);
      add({type, name});
    }
  }
  return items;
}

function renderStock() {
  const items = collectStock();
  const body = document.querySelector('#stock-rows');
  body.replaceChildren();
  const format = new Intl.NumberFormat(language, {maximumFractionDigits:3});
  for (const type of ['Hop', 'Malt', 'Yeast']) {
    const unit = type === 'Malt' ? 'kg' : 'g';
    const factor = type === 'Malt' ? 1000 : 1;
    const group = document.createElement('section');
    group.className = 'overflow-x-auto rounded-xl border border-zinc-700 p-3';
    group.innerHTML = `<h3 class="mb-2 font-semibold text-amber-300">${type} · ${unit}</h3>
      <table class="w-full min-w-[25rem] text-left text-sm">
        <thead><tr class="text-zinc-400"><th scope="col">วัตถุดิบ</th><th scope="col">ยอดตั้งต้น</th><th scope="col">ตัดแล้ว</th><th scope="col">คงเหลือ</th></tr></thead>
        <tbody></tbody>
      </table>`;
    body.append(group);
    const rows = [...items].filter(([, item]) => item.type === type).sort(([, a], [, b]) => a.name.localeCompare(b.name));
    const tableBody = group.querySelector('tbody');
    if (!rows.length) {
      const empty = tableBody.insertRow().insertCell();
      empty.colSpan = 4;
      empty.textContent = 'ไม่มีข้อมูลวัตถุดิบ';
    }
    for (const [key, item] of rows) {
      const row = tableBody.insertRow();
      row.className = 'border-t border-zinc-700';
      const label = row.insertCell();
      label.className = 'py-2 pr-3';
      label.dataset.userText = '';
      label.textContent = item.name;
      const input = recipeInput('ยอดตั้งต้น (' + unit + ')', stockOpening[key] == null ? null : stockOpening[key] / factor, () => {}, true);
      input.name = key;
      input.dataset.gramsPerUnit = factor;
      input.classList.add('max-w-28');
      row.insertCell().append(input);
      row.insertCell().textContent = format.format(item.used / factor);
      const balance = row.insertCell();
      const remaining = stockOpening[key] == null ? null : stockOpening[key] - item.used;
      balance.textContent = remaining == null ? '—' : format.format(remaining / factor);
      if (remaining < 0) balance.className = 'font-semibold text-red-300';
    }
  }
}
stockForm.addEventListener('submit', event => {
  event.preventDefault();
  const updated = Object.fromEntries([...new FormData(stockForm)].filter(([, value]) => value !== '')
    .map(([key, value]) => [key, Number(value) * Number(stockForm.elements.namedItem(key).dataset.gramsPerUnit)]));
  const previous = stockOpening;
  stockOpening = updated;
  const failure = persist();
  if (failure) stockOpening = previous;
  else renderStock();
  notice.textContent = failure || 'บันทึกยอดสต็อกแล้ว';
});

const alertSummary = document.querySelector('#alert-summary');
const alertFeedback = document.querySelector('#alert-feedback');
function renderAlerts() {
  const date = today();
  const format = new Intl.NumberFormat(language, {maximumFractionDigits:3});
  const pending = [];
  for (const cabinet of cabinets) {
    cabinet.batches.forEach((batch, slot) => {
      if (!batch || batch.status === 'Plan') return;
      scheduledHopGroups(batch).forEach((group, index) => {
        if (group.date !== date) return;
        const hops = group.hops.filter(hop => !batch.completedHops?.includes(hop.index));
        if (!hops.length) return;
        pending.push(`• ${cabinet.id} · ${translate('ถัง')} ${slot + 1} · ${batch.recipe} · ${translate('รอบ Dry Hop')} ${index + 1}`);
        for (const hop of hops) pending.push(`  – ${hop.name} ${format.format(hop.grams)} g`);
      });
    });
  }
  const low = [];
  const stockThresholdGrams = {Malt:10000, Yeast:100, Hop:200};
  for (const [key, item] of collectStock()) {
    const opening = stockOpening[key];
    if (opening == null) continue;
    const remaining = opening - item.used;
    if (remaining > stockThresholdGrams[item.type]) continue;
    const malt = item.type === 'Malt';
    low.push(`• ${item.type} · ${item.name}: ${format.format(remaining / (malt ? 1000 : 1))} ${malt ? 'kg' : 'g'}`);
  }
  alertSummary.value = [
    'Brew Day · ' + dateFormat.format(new Date(date + 'T00:00:00Z')),
    '', translate('Dry Hop ที่ต้องทำวันนี้'),
    ...(pending.length ? pending : [translate('ไม่มี Dry Hop ที่ต้องทำวันนี้')]),
    '', translate('สต็อกถึงเกณฑ์แจ้งเตือน') + ' · Malt ≤ 10 kg / Yeast ≤ 100 g / Hop ≤ 200 g',
    ...(low.length ? low : [translate('ไม่พบวัตถุดิบต่ำกว่าเกณฑ์')]),
    translate('ตรวจเฉพาะวัตถุดิบที่กรอกยอดตั้งต้นแล้ว')
  ].join('\n');
}
document.querySelector('#copy-alert').addEventListener('click', async () => {
  renderAlerts();
  try {
    await navigator.clipboard.writeText(alertSummary.value);
    alertFeedback.textContent = 'คัดลอกข้อความแล้ว';
  } catch {
    alertSummary.focus();
    alertSummary.select();
    alertFeedback.textContent = 'เลือกข้อความแล้ว กดคัดลอกเพื่อส่งใน LINE';
  }
});

function render() {
  renderStock();
  renderAlerts();
  renderHistory();
  renderCalendar();
  board.innerHTML = cabinets.map(({id, batches}, index) => {
    const used = batches.filter(Boolean).length;
    const free = maxSlots - used;
    return `<article class="flex min-h-64 flex-col rounded-2xl border p-4 text-center ${used ? 'border-blue-500 bg-[#1c2536]' : 'border-zinc-800 bg-[#101113]'}">
      <h3 class="text-xl font-bold tracking-wide">
        <button type="button" data-rename="${index}" aria-label="แก้รหัสตู้ ${id}" class="cursor-pointer hover:text-blue-300">${id} <span aria-hidden="true" class="text-sm text-zinc-400">✎</span></button>
      </h3>
      <p class="mt-1 text-xs text-zinc-400">All Rounder · ${maxLiters} ลิตร/ถัง</p>
      <p class="mt-3 text-sm text-zinc-300">ใช้ ${used}/${maxSlots} ช่อง · เหลือ ${free} ช่อง</p>
      <p class="mt-1 text-xs text-zinc-400">ความจุจากถังว่าง ${free * maxLiters} ลิตร</p>
      <div class="mt-4 overflow-x-auto"><div class="grid min-w-[36rem] grid-cols-3 gap-3">${Array.from({length:maxSlots}, (_, slot) => {
        const batch = batches[slot];
        return `<div data-drop-cabinet="${index}" data-drop-slot="${slot}" class="flex min-h-36 flex-col rounded-xl border border-zinc-700 bg-black/20 p-2">
          <p class="mb-2 text-xs font-semibold text-zinc-300">ถัง ${slot + 1}</p>
          ${batch ? `<button type="button" draggable="true" data-cabinet="${index}" data-slot="${slot}" class="block w-full flex-1 cursor-grab rounded-lg bg-black/25 p-2.5 hover:bg-black/40">
          <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[batch.status ?? 'Ferment']}">${batch.status === 'Cold crash' ? '<span aria-hidden="true">❄</span>' : ''}${batch.status ?? 'Ferment'}</span>
          <span class="mt-1 block text-xs text-zinc-300">ถัง ${slot + 1} · ${batch.status === 'Plan' ? 'ยังไม่เริ่มหมัก' : `<strong class="font-bold text-violet-300">หมักแล้ว ${fermentationDays(batch)} วัน</strong>`}</span>
          <span class="block mt-1 font-semibold">${escapeHtml(batch.recipe)} · ${batch.liters} ลิตร</span>
          <span class="block mt-1 text-xs tabular-nums text-zinc-300">OG ${batch.og.toFixed(3)} <span class="mx-1 text-zinc-500">|</span> pH ${batch.ph.toFixed(2)}</span>
          <span class="block mt-2 text-xs text-zinc-300">วันหมัก · ${dateFormat.format(new Date(batch.fermentedOn + 'T00:00:00Z'))}</span>
          ${scheduledHopGroups(batch).map((group, index) => `
            <span class="mt-2 block text-xs text-amber-300">รอบ Dry Hop ${index + 1}${hopTiming(batch.recipe, group.minutes)} · ${group.date ? dateFormat.format(new Date(group.date + 'T00:00:00Z')) : 'ยังไม่กำหนดวันเริ่ม Dry Hop'}</span>
            ${group.hops.map(({name, grams, index}) => {
              const done = batch.completedHops?.includes(index);
              return `<span class="mt-1 block text-xs ${done ? 'text-emerald-300' : 'text-zinc-300'}">${done ? '✓ ' : ''}<span class="${done ? 'line-through' : ''}">${escapeHtml(name)} · ${grams} g</span></span>`;
            }).join('')}`).join('')}
                  <span class="mt-2 block text-xs text-zinc-300">${(batch.recipeSnapshot ?? recipes[batch.recipe]).hops.length ? 'Dry Hop ' + (batch.completedHops?.length ?? 0) + '/' + (batch.recipeSnapshot ?? recipes[batch.recipe]).hops.length : 'แก้ไขรายการ'}${batch.sgByDate?.[today()] != null ? ' · SG วันนี้ ' + batch.sgByDate[today()].toFixed(3) : ''}</span>
        </button>
        <label class="mt-2 text-xs text-zinc-300">ย้ายหรือสลับไป
          <select data-move-cabinet="${index}" data-move-slot="${slot}" class="ml-1 rounded bg-zinc-950 px-1 py-1">
            <option value="">เลือกถัง</option>
            ${Array.from({length:maxSlots}, (_, target) => target === slot ? '' : `<option value="${target}">ถัง ${target + 1}</option>`).join('')}
          </select>
        </label>` : `<button type="button" data-cabinet="${index}" data-slot="${slot}" aria-label="เพิ่มรายการใน ${id} ถัง ${slot + 1}" class="m-auto size-11 cursor-pointer rounded-full bg-white/10 text-2xl hover:bg-blue-600">+</button>`}
        </div>`;
      }).join('')}</div></div>
    </article>`;
  }).join('');
}

function moveBatch(cabinetIndex, from, to) {
  const cabinet = cabinets[cabinetIndex];
  const batches = cabinet.batches;
  if (from === to || !batches[from]) return;
  [batches[from], batches[to]] = [batches[to] ?? null, batches[from]];
  render();
  board.querySelector(`[data-cabinet="${cabinetIndex}"][data-slot="${to}"]`).focus();
  notice.textContent = (language === 'en'
    ? `${cabinet.id} · Moved or swapped tank ${from + 1} to tank ${to + 1}`
    : `${cabinet.id} · ย้ายหรือสลับถัง ${from + 1} ไปถัง ${to + 1} แล้ว`) + persist();
}

let dragged;
board.addEventListener('dragstart', event => {
  const card = event.target.closest('[draggable="true"]');
  if (!card) return;
  dragged = {cabinet:card.dataset.cabinet, slot:Number(card.dataset.slot)};
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.slot);
});
board.addEventListener('dragover', event => {
  const target = event.target.closest('[data-drop-slot]');
  if (dragged && target?.dataset.dropCabinet === dragged.cabinet) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }
});
board.addEventListener('drop', event => {
  const target = event.target.closest('[data-drop-slot]');
  if (dragged && target?.dataset.dropCabinet === dragged.cabinet) {
    event.preventDefault();
    moveBatch(Number(dragged.cabinet), dragged.slot, Number(target.dataset.dropSlot));
    dragged = null;
  }
});
board.addEventListener('dragend', () => { dragged = null; });
board.addEventListener('change', event => {
  const select = event.target.closest('[data-move-slot]');
  if (select && select.value !== '') {
    moveBatch(Number(select.dataset.moveCabinet), Number(select.dataset.moveSlot), Number(select.value));
  }
});

const addCabinet = document.querySelector('#add-cabinet');
addCabinet.addEventListener('click', () => {
  const reserved = new Set([...cabinets.map(cabinet => cabinet.id), ...history.map(batch => batch.cabinetId)]);
  let number = 1;
  let id;
  do {
    id = 'C-' + String(number++).padStart(2, '0');
  } while (reserved.has(id));
  cabinets.push({id, batches:[]});
  render();
  board.querySelector(`[data-rename="${cabinets.length - 1}"]`).focus();
  notice.textContent = (language === 'en' ? `Added cooler ${id}` : 'เพิ่มตู้ ' + id + ' แล้ว') + persist();
});

const renameDialog = document.querySelector('#rename-cabinet');
const renameForm = renameDialog.querySelector('form');
const renameInput = renameForm.elements.code;
const renameError = document.querySelector('#rename-error');
let renameIndex;
renameDialog.querySelector('[data-cancel]').addEventListener('click', () => renameDialog.close());
renameForm.addEventListener('submit', event => {
  event.preventDefault();
  const cabinet = cabinets[renameIndex];
  const id = renameInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,16}$/.test(id)) {
    renameError.textContent = 'ใช้ A–Z, 0–9 หรือขีดกลาง ความยาว 1–16 ตัว';
    return;
  }
  if (cabinets.some(item => item !== cabinet && item.id === id)) {
    renameError.textContent = 'รหัสนี้ถูกใช้แล้ว กรุณาเลือกรหัสอื่น';
    return;
  }
  cabinet.id = id;
  renameDialog.close();
  render();
  board.querySelector(`[data-rename="${renameIndex}"]`).focus();
  notice.textContent = (language === 'en' ? `Changed cooler code to ${id}` : 'เปลี่ยนรหัสตู้เป็น ' + id + ' แล้ว') + persist();
});

const removeCabinet = document.querySelector('#remove-cabinet');
removeCabinet.addEventListener('click', () => {
  const cabinet = cabinets[renameIndex];
  if (cabinet.batches.some(Boolean)) return;
  if (!window.confirm(language === 'en' ? `Delete cooler ${cabinet.id}?` : 'ยืนยันการลบตู้ ' + cabinet.id + '?')) return;
  cabinets.splice(renameIndex, 1);
  renameDialog.close();
  render();
  addCabinet.focus();
  notice.textContent = (language === 'en' ? `Deleted cooler ${cabinet.id}` : 'ลบตู้ ' + cabinet.id + ' แล้ว') + persist();
});

board.addEventListener('click', event => {
  const rename = event.target.closest('[data-rename]');
  if (rename) {
    renameIndex = Number(rename.dataset.rename);
    renameInput.value = cabinets[renameIndex].id;
    renameError.textContent = '';
    removeCabinet.disabled = cabinets[renameIndex].batches.some(Boolean);
    removeCabinet.title = translate(removeCabinet.disabled ? 'ย้ายหรือปิดรายการหมักก่อนลบตู้' : 'ลบตู้');
    renameDialog.showModal();
    renameInput.select();
    return;
  }
  const button = event.target.closest('[data-cabinet]');
  if (!button) return;
  selected = Number(button.dataset.cabinet);
  historyIndex = null;
  selectedSlot = button.hasAttribute('data-slot') ? Number(button.dataset.slot) : null;
  openBatch(cabinets[selected].batches[selectedSlot], cabinets[selected].id);
});
function openBatch(batch, cabinetId) {
  form.reset();
  refreshRecipeOptions();
  if (batch && removedRecipes.has(batch.recipe)) {
    recipeSelect.add(new Option(batch.recipe, batch.recipe));
  }
  tracking.hidden = !batch;
  form.elements.status.disabled = historyIndex !== null;
  document.querySelector('#complete').hidden = !batch || historyIndex !== null;
  form.elements.status.value = historyIndex !== null ? '' : batch ? batch.status ?? 'Ferment' : 'Plan';
  form.elements.status.closest('label').hidden = historyIndex !== null;
  form.elements.fermentedOn.value = today();
  sgDraft = {...batch?.sgByDate};
  closeSg();
  renderSg();
  if (batch) {
    for (const name of ['recipe', 'og', 'ph', 'liters', 'fermentedOn', 'note']) {
      form.elements[name].value = batch[name] ?? '';
    }
  }
  updateDryHop();
  renderHops();
  error.hidden = true;
  const title = historyIndex !== null ? 'แก้ไขประวัติ Batch' : batch ? 'แก้ไขรายการหมัก' : 'เพิ่มถังหมัก';
  document.querySelector('#entry-title').textContent = title + ' · ' + cabinetId;
  entry.showModal();
}
document.querySelector('#cancel').addEventListener('click', () => entry.close());
const complete = document.querySelector('#complete');
complete.addEventListener('click', () => {
  if (!complete.hidden && form.reportValidity()) saveBatch(true);
});
form.addEventListener('submit', event => {
  event.preventDefault();
  saveBatch(false);
});
function saveBatch(completing) {
  if (!sgEditor.hidden) {
    sgError.textContent = 'กรุณากดเก็บค่า SG หรือยกเลิกก่อนบันทึกรายการหมัก';
    return;
  }
  const cabinet = cabinets[selected];
  if (historyIndex === null && !cabinet.batches[selectedSlot] && cabinet.batches.filter(Boolean).length >= maxSlots) {
    error.textContent = 'ตู้หมักนี้ใช้ครบ 3 ช่องแล้ว';
    error.hidden = false;
    return;
  }
  if (!form.reportValidity()) return;
  const {recipe, og, ph, liters, fermentedOn} = Object.fromEntries(new FormData(form));
  const status = completing
    ? 'Complete' : form.elements.status.value;
  if (status === 'Complete' && !window.confirm(language === 'en' ? `Complete ${recipe}? The batch will move to history and free its tank slot.` : 'ยืนยัน Complete สำหรับ ' + recipe + '? รายการจะย้ายไปประวัติ Batch และคืนช่องในตู้หมัก')) return;
  const batch = {id:crypto.randomUUID(), recipe, status, og:Number(og), ph:Number(ph), liters:Number(liters), fermentedOn, dryHopOn:null, dryHopAfterDays:recipes[recipe].dryHopAfterDays};
  batch.dryHopDates = Object.fromEntries([...form.querySelectorAll('[data-hop-date]')]
    .filter(input => input.value).map(input => [input.name.slice('dryHopGroup-'.length), input.value]));
  const previous = historyIndex === null ? cabinet.batches[selectedSlot] : history[historyIndex];
  batch.completedHops = new FormData(form).getAll('completedHops').map(Number);
  batch.id = previous?.id ?? batch.id;
  batch.recipeSnapshot = previous?.recipe === recipe
    ? previous.recipeSnapshot ?? structuredClone(recipes[recipe]) : structuredClone(recipes[recipe]);
  batch.stockUsage = stockForBatch({...batch, status:historyIndex === null ? status : 'Complete'}, previous);
  if (historyIndex !== null) {
    history[historyIndex] = {
      ...history[historyIndex], ...batch, status:'Complete',
      note:form.elements.note.value, sgByDate:sgDraft
    };
    entry.close();
    renderHistory();
    renderStock();
    document.querySelectorAll('#history summary')[historyIndex].focus();
    notice.textContent = 'บันทึกการแก้ไขประวัติ Batch แล้ว' + persist();
    return;
  }
  if (!cabinet.batches[selectedSlot]) {
    cabinet.batches[selectedSlot] = batch;
  } else {
    batch.note = form.elements.note.value;
    batch.sgByDate = sgDraft;
    if (status === 'Complete') {
      history.unshift({...batch, cabinetId:cabinet.id, completedOn:today()});
      cabinet.batches[selectedSlot] = null;
    } else {
      cabinet.batches[selectedSlot] = batch;
    }
  }
  entry.close();
  render();
  board.children[selected].querySelector('[data-cabinet], [data-full]').focus();
  if (status === 'Complete') {
    notice.textContent = (language === 'en' ? `Moved ${recipe} to batch history` : `ย้าย ${recipe} เข้าไปในประวัติ Batch แล้ว`) + persist();
  } else {
    notice.textContent = (language === 'en' ? `Saved ${recipe} to ${cabinet.id}` : `บันทึก ${recipe} ลงตู้ ${cabinet.id} แล้ว`) + persist();
  }
}
document.querySelector('#reset').addEventListener('click', () => {
  cabinets = structuredClone(seed);
  render();
  notice.textContent = 'รีเซ็ตบอร์ดเป็นข้อมูลตัวอย่างแล้ว · ประวัติ Batch ยังอยู่' + persist();
});
const sectionToggle = document.querySelector('#section-toggle');
const sectionMenu = document.querySelector('#section-menu');
const sectionSidebar = document.querySelector('#section-sidebar');
const sectionButtons = [...sectionMenu.querySelectorAll('[data-view]')];
function setMenuOpen(open) {
  sectionSidebar.hidden = !open;
  sectionToggle.setAttribute('aria-expanded', String(open));
}
sectionToggle.addEventListener('click', () => setMenuOpen(sectionSidebar.hidden));
sectionMenu.addEventListener('click', event => {
  const chosen = event.target.closest('[data-view]');
  if (!chosen) return;
  for (const button of sectionButtons) {
    const active = button === chosen;
    button.setAttribute('aria-current', String(active));
    document.getElementById(button.dataset.view).hidden = !active;
  }
  if (chosen.dataset.view === 'alerts-view') {
    alertFeedback.textContent = '';
    renderAlerts();
  }
  const heading = document.getElementById(chosen.dataset.view).querySelector('h1, h2');
  heading.tabIndex = -1;
  heading.focus();
});

const english = {
  "กด + ที่ตู้เพื่อบันทึกรอบที่ต้มเสร็จแล้ว · 1 ตู้ใส่ถัง All Rounder ได้ 3 ถัง ถังละไม่เกิน 60 ลิตร": "Select + to log a brewed batch. Each cooler holds three All Rounders, up to 60 L each.",
  "รีเซ็ตบอร์ดเป็นข้อมูลตัวอย่างแล้ว · ประวัติ Batch ยังอยู่": "Board reset to demo data. Batch history was kept.",
  "เปิดข้อมูลที่บันทึกไว้ไม่ได้ กำลังใช้ข้อมูลตัวอย่าง": "Could not load saved data. Demo data is shown.",
  "บันทึกค่าที่วัดได้ก่อนเริ่มหมักในถัง All Rounder": "Record measurements before fermenting in the All Rounder.",
  "กรุณากดเก็บค่า SG หรือยกเลิกก่อนบันทึกรายการหมัก": "Save or cancel the SG reading before saving the batch.",
  "ใช้ A–Z, 0–9 หรือขีดกลาง ความยาว 1–16 ตัว": "Use 1–16 letters A–Z, digits, or hyphens.",
  "เบราว์เซอร์เก็บข้อมูลข้ามการรีเฟรชไม่ได้": "Changes could not be saved across refreshes.",
  "กรุณาเลือกวันที่และกรอกค่า SG เช่น 1.012": "Choose a date and enter an SG reading such as 1.012.",
  "วันนี้มีค่า SG แล้ว กรุณาแก้ไขจากตาราง": "An SG reading already exists for this date. Edit it in the table.",
  "รหัสนี้ถูกใช้แล้ว กรุณาเลือกรหัสอื่น": "This code is already in use. Choose another code.",
  "บันทึกการแก้ไขประวัติ Batch แล้ว": "Batch history updated.",
  "ย้ายหรือปิดรายการหมักก่อนลบตู้": "Move or complete batches before deleting this cooler",
  "ยังไม่มี Batch ที่เสร็จแล้ว": "No completed batches yet",
  "ตู้หมักนี้ใช้ครบ 3 ช่องแล้ว": "All three slots in this cooler are occupied.",
  "ลบ Batch จากประวัติแล้ว": "Batch deleted from history",
  "เปิดหรือปิดเมนูหัวข้อ": "Toggle navigation",
  "รีเซ็ตข้อมูลตัวอย่าง": "Reset demo data",
  "สูตรนี้ไม่มี Dry Hop": "This recipe has no dry hop",
  "ยืนยันสูตรและบันทึก": "Save Batch",
  "ไม่มีรายการ Dry Hop": "No dry hops",
  "ปริมาณลงถัง (ลิตร)": "Volume in fermenter (L)",
  "แก้ไขประวัติ Batch": "Edit batch history",
  "เปลี่ยนรหัสตู้เป็น": "Changed cooler code to",
  "ความจุจากถังว่าง": "Available capacity",
  "หัวข้อ Brew Day": "Brew Day navigation",
  "ยังไม่เริ่มหมัก": "Fermentation not started",
  "แก้ไขรายการหมัก": "Edit fermentation batch",
  "ย้ายหรือสลับถัง": "Moved or swapped tank",
  "สูงสุด 60 ลิตร": "Up to 60 L",
  "รายการ Dry Hop": "Dry Hop Checklist",
  "ยังไม่มีค่า SG": "No SG readings yet",
  "ย้ายหรือสลับไป": "Move or swap to",
  "ปฏิทินถังหมัก": "Fermentation Calendar",
  "ประวัติ Batch": "Batch History",
  "+ เพิ่มตู้แช่": "+ Add Cooler",
  "แก้รหัสตู้แช่": "Edit cooler code",
  "+ เพิ่มค่า SG": "+ Add SG Reading",
  "บันทึกการหมัก": "Fermentation notes",
  "เพิ่มรายการใน": "Add batch to",
  "บอร์ดตู้หมัก": "Fermentation Board",
  "เพิ่มถังหมัก": "Add fermentation batch",
  "แก้ไขค่า SG": "Edit SG reading",
  "วัน Dry Hop": "Dry Hop date",
  "แก้ไข Batch": "Edit Batch",
  "แก้ไขรายการ": "Edit batch",
  "เดือนถัดไป": "Next month",
  "สูตรเบียร์": "Beer recipe",
  "แผนวันหมัก": "Planned fermentation",
  "ประวัติ SG": "SG History",
  "เก็บค่า SG": "Save reading",
  "แก้รหัสตู้": "Edit cooler code",
  "เดือนก่อน": "Previous month",
  "เลือกสูตร": "Select a recipe",
  "วันที่วัด": "Measurement date",
  "SG วันนี้": "Today's SG",
  "ลบค่า SG": "Delete SG reading",
  "ลบ Batch": "Delete Batch",
  "ลิตร/ถัง": "L per tank",
  "หมักแล้ว": "Fermenting for",
  "เลือกถัง": "Select tank",
  "เพิ่มตู้": "Added cooler",
  "อาทิตย์": "Sun",
  "รหัสตู้": "Cooler code",
  "วันหมัก": "Fermentation date",
  "ตู้แช่": "Coolers",
  "จันทร์": "Mon",
  "อังคาร": "Tue",
  "ยกเลิก": "Cancel",
  "จัดการ": "Actions",
  "ค่า SG": "SG reading",
  "บันทึก": "Save",
  "พฤหัส": "Thu",
  "ศุกร์": "Fri",
  "เสาร์": "Sat",
  "สถานะ": "Status",
  "ลบตู้": "Delete cooler",
  "แก้ไข": "Edit",
  "เหลือ": "available",
  "ลิตร": "L",
  "ช่อง": "slots",
  "พุธ": "Wed",
  "ใช้": "Used",
  "ถัง": "Tank",
  "วัน": "days",
  "ลบ": "Delete"
};
Object.assign(english, {"แจ้งเตือน":"Alerts","สรุปวันนี้ตามเวลาไทย พร้อมคัดลอกไปส่งใน LINE":"Today’s summary in Thailand time, ready to copy to LINE.","ข้อความสรุปสำหรับ LINE":"LINE summary","คัดลอกข้อความสำหรับ LINE":"Copy message for LINE","คัดลอกข้อความแล้ว":"Message copied","เลือกข้อความแล้ว กดคัดลอกเพื่อส่งใน LINE":"Message selected. Copy it to send in LINE.","Dry Hop ที่ต้องทำวันนี้":"Dry hops due today","ไม่มี Dry Hop ที่ต้องทำวันนี้":"No dry hops due today","สต็อกถึงเกณฑ์แจ้งเตือน":"Low stock alerts","ไม่พบวัตถุดิบต่ำกว่าเกณฑ์":"No ingredients below the threshold","ตรวจเฉพาะวัตถุดิบที่กรอกยอดตั้งต้นแล้ว":"Only ingredients with an opening balance entered are checked.","ยอดตั้งต้น":"Opening stock","ตัดแล้ว":"Used","คงเหลือ":"Remaining","สต็อกวัตถุดิบ":"Ingredient Stock","ชื่อวัตถุดิบมาจากสูตรเบียร์ กรอกยอดตั้งต้นรวมที่ใช้คำนวณสต็อก":"Ingredients come from beer recipes. Enter the opening totals to calculate stock.","ยอดตั้งต้น (g)":"Opening stock (g)","ตัดแล้ว (g)":"Used (g)","คงเหลือ (g)":"Remaining (g)","บันทึกยอดสต็อก":"Save stock totals","บันทึกยอดสต็อกแล้ว":"Stock totals saved","แก้ไขสูตร":"Edit recipe","บันทึกสูตร":"Save recipe","บันทึกสูตรแล้ว":"Recipe saved","บันทึกการแก้ไขสูตรไม่ได้":"Could not save recipe changes","ลบสูตร":"Delete recipe","ลบสูตรแล้ว":"Recipe deleted","ยังไม่มีสูตรเบียร์":"No recipes yet","บันทึกการลบสูตรไม่ได้":"Could not save recipe deletion","หลังเริ่มหมัก 2 วัน":"2 days after fermentation starts","ก่อนจบการหมัก 4 วัน":"4 days before fermentation ends","รอบ Dry Hop":"Dry Hop round","วันเริ่มรอบนี้":"Start date for this round","เริ่ม Dry Hop หลังเริ่มหมัก":"Dry hop starts after fermentation begins","กำหนดวันเริ่ม Dry Hop":"Set dry hop start date","เว้นว่างเพื่อใช้วันที่จากสูตร ถ้ามี":"Leave blank to use the recipe schedule, when available.","สูตรตัวอย่าง":"Demo recipe","นำเข้า BeerXML": "Import BeerXML", "ขนาดรอบต้ม": "Batch size", "วัตถุดิบ": "Ingredient", "ปริมาณ": "Amount", "ช่วงที่ใส่ / เวลา": "Stage / time", "ไม่มีข้อมูลวัตถุดิบ": "No ingredient data", "นำเข้าสูตรแล้ว": "Recipes imported", "นำเข้าไม่สำเร็จ": "Import failed", "อ่านไฟล์ XML ไม่ได้": "Could not read XML", "ไฟล์นี้ไม่มีสูตร BeerXML": "No BeerXML recipes found", "พบสูตรที่ไม่มีชื่อ": "A recipe has no name", "อ่านหรือบันทึกไฟล์ไม่ได้": "Could not read or save the file", "ยังไม่กำหนดวันเริ่ม Dry Hop": "Dry hop start date is unspecified"});
const translationPattern = new RegExp(Object.keys(english).sort((a, b) => b.length - a.length)
  .map(key => [...key].map(char => '.*+?^${}()|[]'.includes(char) || char === String.fromCharCode(92)
    ? String.fromCharCode(92) + char : char).join('')).join('|'), 'g');
let language = 'th';
try { language = storage.getItem('brew-day-language') === 'en' ? 'en' : 'th'; } catch {}
function translate(text) {
  return language === 'en' ? text.replace(translationPattern, key => english[key]) : text;
}
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
function translatePage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement.closest('script, style, [data-user-text], #language-switch, textarea, #recipe-library, #batch select[name="recipe"] option:not([value=""])')) continue;
    const previous = originalText.get(node);
    const source = previous?.result === node.data ? previous.source : node.data;
    const result = translate(source);
    originalText.set(node, {source, result});
    if (node.data !== result) node.data = result;
  }
  for (const node of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    const originals = originalAttributes.get(node) ?? {};
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      if (!node.hasAttribute(attribute)) continue;
      const current = node.getAttribute(attribute);
      const previous = originals[attribute];
      const source = previous?.result === current ? previous.source : current;
      const result = translate(source);
      originals[attribute] = {source, result};
      if (current !== result) node.setAttribute(attribute, result);
    }
    originalAttributes.set(node, originals);
  }
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = 'Brew Day · ' + translate('บอร์ดตู้หมัก');
  document.querySelector('#language-name').textContent = language === 'en' ? 'ENGLISH' : 'ภาษาไทย';
  document.querySelector('#language-code').textContent = language === 'en' ? 'EN' : 'TH';
  dateFormat = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'th-TH', {dateStyle:'medium', timeZone:'UTC'});
  monthFormat = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'th-TH', {month:'long', year:'numeric', timeZone:'UTC'});
  render();
  if (!document.querySelector('#recipe-details form')) renderRecipe();
  translatePage();
}
document.querySelector('#language-switch').addEventListener('click', () => {
  language = language === 'th' ? 'en' : 'th';
  try { storage.setItem('brew-day-language', language); } catch {}
  applyLanguage();
});
const translator = new MutationObserver(translatePage);
translator.observe(document.body, {childList:true, subtree:true, characterData:true});


applyLanguage();

if (!storage.getItem(storageKey)) persist();
if (!storage.getItem(recipeStorageKey)) storage.setItem(recipeStorageKey, JSON.stringify(recipes));

  if (window.matchMedia('(max-width:639px)').matches) setMenuOpen(false);
  return () => {
    translator.disconnect();
    for (const args of listeners) nativeDocument.removeEventListener(...args);
  };
}
