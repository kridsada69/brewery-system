import {randomUUID} from "node:crypto";
import {db} from "./db";
import {buildSummary,dateInThailand} from "./alerts";
import type {SharedData} from "./state";
export async function deliverDailySummary() {
  const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const user=process.env.LINE_USER_ID;
  if (!token || !user) throw new Error("Configure LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID");
  const workspace=await db.workspace.findUnique({where:{id:"brewery"}});
  if (!workspace) throw new Error("Save brewery data first");
  const id="daily-"+dateInThailand();
  const delivery=await db.alertDelivery.upsert({
    where:{id},create:{id,retryKey:randomUUID(),message:buildSummary(workspace.data as SharedData)},update:{}
  });
  if (delivery.sentAt) return {alreadySent:true};
  const chunks=delivery.message.match(/[\s\S]{1,4500}/gu)??[];
  if (chunks.length>5) throw new Error("Summary exceeds LINE message limit");
  const response=await fetch("https://api.line.me/v2/bot/message/push",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,"X-Line-Retry-Key":delivery.retryKey},
    body:JSON.stringify({to:user,messages:chunks.map(text=>({type:"text",text}))}),
    signal:AbortSignal.timeout(15000)
  });
  // LINE returns 409 when this retry key was already accepted.
  if (!response.ok && response.status!==409) throw new Error("LINE rejected delivery ("+response.status+")");
  await db.alertDelivery.update({where:{id},data:{sentAt:new Date()}});
  return {alreadySent:false};
}
