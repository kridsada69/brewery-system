import {test} from "node:test";
import assert from "node:assert/strict";
import {buildSummary,belowThreshold,hazeHopOffset,dryHopOffset,shiftedDate,stockKey} from "../src/lib/alerts";
import {saveSchema} from "../src/lib/state";
import {applicationOrigin,sameOrigin,createSession,validSession} from "../src/lib/auth";
const recipe={hops:[{name:"Citra",grams:50},{name:"Mosaic",grams:40}],dryHopAfterDays:2};
const batch={recipe:"IPA",status:"Ferment",og:1.06,ph:5.4,liters:45,fermentedOn:"2026-11-05",dryHopAfterDays:2,
  completedHops:[0],recipeSnapshot:recipe,stockUsage:{base:[{type:"Malt",name:"Pale",grams:5000}],hops:{"0":{type:"Hop",name:"Citra",grams:50}}}};
function data() {
  return {
    "brew-day-board-v1":JSON.stringify({cabinets:[{id:"C-01",batches:[batch]}],history:[],
      stockOpening:{[stockKey({type:"Malt",name:"Pale"})]:15000,[stockKey({type:"Hop",name:"Citra"})]:250}}),
    "brew-day-imported-recipes":JSON.stringify({IPA:recipe})
  };
}
test("summary excludes completed hops and includes threshold equality",()=>{
  const summary=buildSummary(data(),"2026-11-07");
  assert.match(summary,/Mosaic 40 g/);
  assert.doesNotMatch(summary,/Citra 50 g/);
  assert.match(summary,/Pale · 10 kg/);
  assert.match(summary,/Citra · 200 g/);
  assert.equal(belowThreshold("Yeast",100),true);
  assert.equal(belowThreshold("Yeast",100.001),false);
});
test("completion retains stock use without duplicate usage",()=>{
  const source=data();
  const board=JSON.parse(source["brew-day-board-v1"]);
  board.cabinets[0].batches=[null];
  board.history=[{...batch,status:"Complete",completedOn:"2026-11-07"}];
  source["brew-day-board-v1"]=JSON.stringify(board);
  const summary=buildSummary(source,"2026-11-07");
  assert.doesNotMatch(summary,/Mosaic 40 g/);
  assert.match(summary,/Pale · 10 kg/);
});
test("Haze timing follows confirmed brewer convention",()=>{
  assert.equal(hazeHopOffset("Haze 7-0  v.23",2880),2);
  assert.equal(hazeHopOffset("Haze 7-0 v.23 (2)",5760),10);
  assert.equal(hazeHopOffset("Other IPA",2880),null);
  assert.equal(shiftedDate("2026-11-07",10),"2026-11-17");
});
test("server validates imports and fermenter limits",()=>{
  assert.equal(saveSchema.safeParse({revision:0,data:data()}).success,true);
  const source=data(),board=JSON.parse(source["brew-day-board-v1"]);
  board.cabinets[0].batches=[{...batch,liters:61}];
  source["brew-day-board-v1"]=JSON.stringify(board);
  assert.equal(saveSchema.safeParse({revision:0,data:source}).success,false);
  assert.equal(saveSchema.safeParse({revision:0,data:{unexpected:"{}"}}).success,false);
});
test("sessions reject tampering and expiry",()=>{
  process.env.SESSION_SECRET="unit-test-session-key-at-least-32-characters";
  const now=Date.now();
  const token=createSession(now);
  assert.equal(validSession(token,now),true);
  assert.equal(validSession(token+"x",now),false);
  assert.equal(validSession(token,now+8*86400000),false);
});

test("default dry hop dates use ferment date plus XML days in alerts",()=>{
  assert.equal(dryHopOffset('Kadoor',2880,null),2);
  assert.equal(dryHopOffset('Kadoor',2880,5),5);
  assert.equal(dryHopOffset('Haze 7-0 v.23',5760,null),10);
  assert.equal(dryHopOffset('Unknown',null,null),null);
  const source=data(),board=JSON.parse(source['brew-day-board-v1']);
  const current=board.cabinets[0].batches[0];
  current.dryHopAfterDays=null;
  current.recipeSnapshot.hopRows=current.recipeSnapshot.hops.map((hop:{name:string;grams:number})=>({name:hop.name,amount:hop.grams,unit:'g',stage:'Dry Hop',minutes:2880}));
  source['brew-day-board-v1']=JSON.stringify(board);
  assert.match(buildSummary(source,'2026-11-07'),/Mosaic 40 g/);
  current.dryHopDates={'2880':'2026-11-08'};
  source['brew-day-board-v1']=JSON.stringify(board);
  assert.doesNotMatch(buildSummary(source,'2026-11-07'),/Mosaic 40 g/);
  assert.match(buildSummary(source,'2026-11-08'),/Mosaic 40 g/);
});

test("Railway origin checks use configured HTTPS domain behind an HTTP proxy",()=>{
  const previousDomain=process.env.RAILWAY_PUBLIC_DOMAIN;
  const previousOrigin=process.env.APP_ORIGIN;
  try {
    delete process.env.APP_ORIGIN;
    process.env.RAILWAY_PUBLIC_DOMAIN='brewery.example';
    const request=(origin?:string)=>new Request('http://0.0.0.0:8080/api/session',{
      headers:{...(origin?{Origin:origin}:{}),'x-forwarded-host':'attacker.example','x-forwarded-proto':'https'}
    });
    assert.equal(applicationOrigin(request()),'https://brewery.example');
    assert.equal(sameOrigin(request('https://brewery.example')),true);
    for(const origin of [undefined,'null','https://attacker.example','http://brewery.example','https://brewery.example.attacker.test']) {
      assert.equal(sameOrigin(request(origin)),false);
    }
    process.env.APP_ORIGIN='https://custom.example';
    assert.equal(sameOrigin(request('https://custom.example')),true);
    assert.equal(sameOrigin(request('https://brewery.example')),false);
    delete process.env.APP_ORIGIN;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    assert.equal(sameOrigin(new Request('http://localhost:3000/api/session',{headers:{Origin:'http://localhost:3000'}})),true);
  } finally {
    if(previousDomain===undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
    else process.env.RAILWAY_PUBLIC_DOMAIN=previousDomain;
    if(previousOrigin===undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN=previousOrigin;
  }
});
