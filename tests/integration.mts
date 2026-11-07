import assert from "node:assert/strict";
import {spawn} from "node:child_process";
const origin="http://localhost:3117";
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port","3117"],{
  stdio:"inherit",env:process.env
});
try {
  let ready=false;
  for (let attempt=0;attempt<60;attempt++) {
    try { if ((await fetch(origin+"/login")).ok) {ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.equal(ready,true,"Server starts");
  assert.equal((await fetch(origin+"/api/state")).status,401);
  const login=await fetch(origin+"/api/session",{
    method:"POST",headers:{"Content-Type":"application/json",Origin:origin},
    body:JSON.stringify({password:process.env.APP_PASSWORD})
  });
  assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie")!.split(";")[0];
  const headers={"Content-Type":"application/json",Origin:origin,Cookie:cookie};
  const state=await (await fetch(origin+"/api/state",{headers})).json();
  const data={
    "brew-day-board-v1":JSON.stringify({cabinets:[{id:"C-01",batches:[]}],history:[],stockOpening:{}})
  };
  const save=await fetch(origin+"/api/state",{method:"PUT",headers,body:JSON.stringify({revision:state.revision,data})});
  assert.equal(save.status,200);
  assert.equal((await save.json()).revision,state.revision+1);
  const stale=await fetch(origin+"/api/state",{method:"PUT",headers,body:JSON.stringify({revision:state.revision,data})});
  assert.equal(stale.status,409);
  const invalid=await fetch(origin+"/api/state",{method:"PUT",headers,body:JSON.stringify({revision:state.revision+1,data:{bad:"{}"}})});
  assert.equal(invalid.status,400);
  const foreign=await fetch(origin+"/api/state",{method:"PUT",headers:{...headers,Origin:"https://other.example"},body:"{}"});
  assert.equal(foreign.status,403);
  const fresh=await (await fetch(origin+"/api/state",{headers})).json();
  assert.deepEqual(fresh.data,data);
  assert.equal(fresh.revision,state.revision+1);
  console.log("PASS: auth, PostgreSQL persistence, invalid data, stale revisions, origin protection");
} finally {
  child.kill("SIGTERM");
}
