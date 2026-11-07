"use client";
import {useRouter} from "next/navigation";
import {useEffect,useRef,useState} from "react";
import {Download,Upload,LogOut,Send,RefreshCw} from "lucide-react";
import {markup} from "./brew-markup";
import {mountBrewery} from "./brew-runtime";
import {createStore,type Data} from "@/lib/client-store";
type Snapshot={data:Data;revision:number};
export default function Brewery() {
  const router=useRouter();
  const root=useRef<HTMLDivElement>(null);
  const snapshot=useRef<Snapshot|null>(null);
  const queue=useRef<Promise<void>>(Promise.resolve());
  const failed=useRef(false);
  const [ready,setReady]=useState(false);
  const [status,setStatus]=useState("กำลังโหลดข้อมูล / Loading…");
  useEffect(()=>{
    const controller=new AbortController();
    const element=root.current;
    let unmount:(()=>void)|undefined;
    async function load() {
      try {
        const response=await fetch("/api/state",{cache:"no-store",signal:controller.signal});
        if (response.status===401) {router.replace("/login");return;}
        const body=await response.json();
        if (!response.ok) throw new Error(body.error);
        snapshot.current=body;
        if (!root.current || controller.signal.aborted) return;
        root.current.innerHTML=markup;
        const storage=createStore(body.data,(data)=>{
          snapshot.current={...snapshot.current!,data};
          if (failed.current) {
            setStatus("ยังบันทึกไม่ได้ ส่งออกข้อมูลก่อนโหลดใหม่ / Saving paused. Export before reloading.");
            return;
          }
          setStatus("กำลังบันทึก / Saving…");
          queue.current=queue.current.then(async()=>{
            if (failed.current) return;
            const response=await fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({revision:snapshot.current!.revision,data})});
            const result=await response.json();
            if (!response.ok) throw new Error(typeof result.error==="string"?result.error:"ข้อมูลไม่ผ่านการตรวจสอบ / Invalid data");
            snapshot.current={...snapshot.current!,revision:result.revision};
            setStatus("บันทึกแล้ว / Saved");
          }).catch(error=>{
            failed.current=true;
            setStatus((error instanceof Error?error.message:"Save failed")+" · ส่งออกข้อมูลก่อนโหลดใหม่ / Export before reloading");
          });
        });
        unmount=mountBrewery(root.current,storage);
        setReady(true);
        setStatus("เชื่อมต่อแล้ว / Connected");
      } catch(error) {
        if (!controller.signal.aborted) setStatus(error instanceof Error?error.message:"Connection failed");
      }
    }
    void load();
    return ()=>{controller.abort();unmount?.();element?.replaceChildren();};
  },[router]);
  function exportData() {
    if (!snapshot.current) return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot.current.data)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="brewery-backup.json";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs">
      <p role="status" className="text-amber-200">{status}</p>
      <div className="flex flex-wrap gap-3">
        <button onClick={()=>window.location.reload()} className="flex items-center gap-1"><RefreshCw size={14}/>โหลดใหม่ / Reload</button>
        <button disabled={!ready} onClick={exportData} className="flex items-center gap-1"><Download size={14}/>Export</button>
        <label className="flex cursor-pointer items-center gap-1"><Upload size={14}/>Import backup
          <input type="file" accept=".json" className="sr-only" disabled={!ready} onChange={async event=>{
            const file=event.target.files?.[0];if (!file)return;event.target.value="";
            if (!confirm("แทนที่ข้อมูลส่วนกลางด้วยไฟล์นี้? / Replace shared data with this backup?"))return;
            try {
              await queue.current;
              if (failed.current) throw new Error("Reload before importing");
              const data:unknown=JSON.parse(await file.text());
              const response=await fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({revision:snapshot.current!.revision,data})});
              const result=await response.json();
              if (!response.ok)throw new Error(JSON.stringify(result.error));
              window.location.reload();
            } catch(error){setStatus(error instanceof Error?error.message:"Import failed");}
          }}/>
        </label>
        <button disabled={!ready} className="flex items-center gap-1" onClick={async()=>{
          if (!confirm("ส่งสรุปวันนี้ไป LINE ส่วนตัว? / Send today’s summary to LINE?"))return;
          try {
            await queue.current;
            if (failed.current)throw new Error("Save failed. Reload first.");
            const response=await fetch("/api/line",{method:"POST"});
            const result=await response.json();
            if (!response.ok)throw new Error(result.error);
            setStatus(result.alreadySent?"ส่งสรุปวันนี้แล้ว / Already sent today":"ส่ง LINE แล้ว / LINE sent");
          } catch(error){setStatus(error instanceof Error?error.message:"LINE failed");}
        }}><Send size={14}/>LINE</button>
        <button className="flex items-center gap-1" onClick={async()=>{
          await queue.current;
          if (failed.current && !confirm("มีข้อมูลที่ยังบันทึกไม่ได้ ออกจากระบบ? / Unsaved data. Sign out?"))return;
          await fetch("/api/session",{method:"DELETE"});router.replace("/login");
        }}><LogOut size={14}/>ออก / Sign out</button>
      </div>
    </div>
    <div ref={root}/>
  </>;
}
