import {test} from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {markup} from "../src/components/brew-markup";
import {mountBrewery} from "../src/components/brew-runtime";
import {createStore} from "../src/lib/client-store";
import {saveSchema} from "../src/lib/state";

test("migrated UI mounts, saves Ferment, restores stock on Plan and completes with confirmation",async()=>{
  const dom=new JSDOM("<div id='app'></div>",{url:"http://localhost:3000"});
  const window=dom.window;
  for (const key of ["window","document","NodeFilter","DOMParser","MutationObserver","Option","FormData","Blob"]) {
    Object.defineProperty(globalThis,key,{value:window[key as keyof typeof window],configurable:true});
  }
  Object.defineProperty(window,"matchMedia",{value:()=>({matches:true})});
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let confirmed=true;
  let confirmCount=0;
  window.confirm=()=>{confirmCount++;return confirmed;};
  let saved:Record<string,string>={};
  const root=window.document.querySelector("#app") as HTMLDivElement;
  root.innerHTML=markup;
  const storage=createStore({},data=>{saved=data;});
  const cleanup=mountBrewery(root,storage);
  function click(selector:string) {(root.querySelector(selector) as HTMLButtonElement).click();}
  function submit() {root.querySelector("#batch")!.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));}
  function board() {return JSON.parse(saved["brew-day-board-v1"]);}
  try {
    assert.match(root.querySelector("#board")!.textContent!,/C-01/);
    assert.equal((root.querySelector('#section-sidebar') as HTMLElement).hidden,true);
    click('#section-toggle');
    assert.equal((root.querySelector('#menu-backdrop') as HTMLElement).hidden,false);
    assert.equal((root.querySelector('#main-content') as HTMLElement).inert,true);
    click('#menu-backdrop');
    assert.equal((root.querySelector('#section-sidebar') as HTMLElement).hidden,true);
    click('#mobile-nav [data-view="calendar-view"]');
    assert.equal((root.querySelector('#calendar-view') as HTMLElement).hidden,false);
    assert.equal((root.querySelector('#board-view') as HTMLElement).hidden,true);
    assert.ok(root.querySelector('#calendar-agenda .calendar-agenda-event'));
    assert.equal(root.querySelector('#section-menu [data-view="calendar-view"]')!.getAttribute('aria-current'),'true');
    click('#mobile-nav [data-view="board-view"]');
    assert.equal((root.querySelector('#board-view') as HTMLElement).hidden,false);

    click('[data-cabinet="0"][data-slot="0"]');
    const form=root.querySelector("#batch") as HTMLFormElement;
    for (const [name,value] of Object.entries({recipe:"Von Elbert",status:"Ferment",og:"1.06",ph:"5.4",liters:"45",fermentationTemperature:"19.4"})) {
      (form.elements.namedItem(name) as HTMLInputElement).value=value;
    }
    (form.elements.namedItem("recipe") as HTMLSelectElement).dispatchEvent(new window.Event("change",{bubbles:true}));
    submit();
    assert.equal(board().cabinets[0].batches[0].fermentationTemperature,19.4);
    assert.match(root.querySelector('#board')!.textContent!,/19.4 °C/);
    const usage=board().cabinets[0].batches[0].stockUsage;
    assert.equal(usage.base.find((item:{type:string})=>item.type==="Malt").grams,11000);
    assert.equal(saveSchema.safeParse({revision:0,data:saved}).success,true);
    click('[data-cabinet="0"][data-slot="0"]');
    assert.equal((form.elements.namedItem('fermentationTemperature') as HTMLInputElement).value,'19.4');
    (form.elements.namedItem('fermentationTemperature') as HTMLInputElement).value='';
    (form.elements.namedItem("status") as HTMLSelectElement).value="Plan";
    submit();
    assert.equal(board().cabinets[0].batches[0].stockUsage.base.length,0);
    assert.equal(board().cabinets[0].batches[0].fermentationTemperature,null);
    click('[data-cabinet="0"][data-slot="0"]');
    (form.elements.namedItem("status") as HTMLSelectElement).value="Ferment";
    const hop=root.querySelector('[name="completedHops"]') as HTMLInputElement;
    hop.checked=true;
    submit();
    assert.equal(Object.keys(board().cabinets[0].batches[0].stockUsage.hops).length,1);
    click('[data-cabinet="0"][data-slot="0"]');
    (root.querySelector('[name="completedHops"]') as HTMLInputElement).checked=false;
    submit();
    assert.equal(Object.keys(board().cabinets[0].batches[0].stockUsage.hops).length,0);
    click('[data-cabinet="0"][data-slot="0"]');
    confirmed=false;click("#complete");
    assert.equal(board().history.length,0);
    confirmed=true;click("#complete");
    assert.equal(board().history.length,1);
    assert.equal(board().cabinets[0].batches[0],null);
    assert.equal(confirmCount,2);
    const xml = '<RECIPES><RECIPE><NAME>Haze 7-0 v.23</NAME><BATCH_SIZE>45</BATCH_SIZE><NOTES>Dry hop หลังจากหลังหมักแล้ว 10 วัน</NOTES><HOPS><HOP><NAME>Amarillo</NAME><AMOUNT>0.0567</AMOUNT><USE>Dry Hop</USE><TIME>2880</TIME></HOP><HOP><NAME>Strata</NAME><AMOUNT>0.03</AMOUNT><USE>Dry Hop</USE><TIME>5760</TIME></HOP></HOPS><YEASTS><YEAST><NAME>Test yeast</NAME><LABORATORY>White Labs</LABORATORY><PRODUCT_ID>WLP066</PRODUCT_ID><AMOUNT>0.1</AMOUNT><AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT></YEAST></YEASTS></RECIPE></RECIPES>';
    const fileInput=root.querySelector('#recipe-file') as HTMLInputElement;
    Object.defineProperty(fileInput,'files',{configurable:true,value:[{arrayBuffer:async()=>new TextEncoder().encode(xml).buffer}]});
    fileInput.dispatchEvent(new window.Event('change',{bubbles:true}));
    for (let attempt=0;attempt<20 && !root.querySelector('#recipe-feedback')!.textContent;attempt++) {
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.match(root.querySelector('#recipe-feedback')!.textContent!,/นำเข้าสูตรแล้ว/);
    assert.match(root.querySelector('#recipe-details')!.textContent!,/White Labs · WLP066/);
    click('[data-cabinet="0"][data-slot="0"]');
    (form.elements.namedItem('recipe') as HTMLSelectElement).value='Haze 7-0 v.23';
    (form.elements.namedItem('recipe') as HTMLSelectElement).dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(root.querySelectorAll('[data-hop-date]').length,2);
    assert.match(root.querySelector('#hop-list')!.textContent!,/หลังเริ่มหมัก 2 วัน/);
    assert.match(root.querySelector('#hop-list')!.textContent!,/ก่อนจบการหมัก 4 วัน/);
    assert.equal(saveSchema.safeParse({revision:0,data:saved}).success,true);

    // The brewer requested ferment date + BeerXML days as the default schedule.
    const kadoor = '<RECIPES><RECIPE><NAME>Kadoor test</NAME><NOTES>Dry hop ตอน FG. 1.014</NOTES><HOPS><HOP><NAME>Strata</NAME><AMOUNT>0.144</AMOUNT><USE>Dry Hop</USE><TIME>2880</TIME></HOP></HOPS></RECIPE></RECIPES>';
    root.querySelector('#recipe-feedback')!.textContent='';
    Object.defineProperty(fileInput,'files',{configurable:true,value:[{arrayBuffer:async()=>new TextEncoder().encode(kadoor).buffer}]});
    fileInput.dispatchEvent(new window.Event('change',{bubbles:true}));
    for (let attempt=0;attempt<20 && !root.querySelector('#recipe-feedback')!.textContent;attempt++) {
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.match(root.querySelector('#recipe-details')!.textContent!,/FG. 1.014/);
    click('[data-cabinet="0"][data-slot="0"]');
    (form.elements.namedItem('recipe') as HTMLSelectElement).value='Kadoor test';
    (form.elements.namedItem('recipe') as HTMLSelectElement).dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.match(root.querySelector('#hop-list')!.textContent!,/แช่ฮอป 2 วัน/);
    (form.elements.namedItem('fermentedOn') as HTMLInputElement).value='2026-11-06';
    form.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.match(root.querySelector('[data-hop-schedule]')!.textContent!,/8 พฤศจิกายน 2026/);
    const hopDate=root.querySelector('[data-hop-date]') as HTMLInputElement;
    assert.equal(hopDate.hidden,false);
    hopDate.value='2026-11-10';
    hopDate.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.match(root.querySelector('[data-hop-schedule]')!.textContent!,/10 พฤศจิกายน 2026/);
    for (const [name,value] of Object.entries({og:'1.068',ph:'5.4',liters:'45',fermentedOn:'2026-11-06'})) {
      (form.elements.namedItem(name) as HTMLInputElement).value=value;
    }
    (form.elements.namedItem('status') as HTMLSelectElement).value='Ferment';
    submit();
    assert.equal(board().cabinets[0].batches[0].dryHopDates['2880'],'2026-11-10');
    assert.equal(board().cabinets[0].batches[0].recipeSnapshot.notes,'Dry hop ตอน FG. 1.014');
    assert.match(root.querySelector('#board')!.textContent!,/10 พฤศจิกายน 2026/);
    assert.equal(saveSchema.safeParse({revision:0,data:saved}).success,true);

  } finally {cleanup();dom.window.close();}
});
