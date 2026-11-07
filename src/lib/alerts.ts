import type {Batch,Recipe,SharedData} from "./state";
export function dateInThailand(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Bangkok"}).format(now);
}
export function shiftedDate(start:string,days:number) {
  const date = new Date(start+"T00:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function hazeHopOffset(name:string,minutes:number|null) {
  if (!/^haze\s+7-?0\s+v\.?23(?:\s+\(\d+\))?$/i.test(name.trim())) return null;
  return minutes === 2880 ? 2 : minutes === 5760 ? 10 : null;
}
type StockItem = {type:string;name:string;grams:number};
export function stockKey(item:Pick<StockItem,"type"|"name">) {
  return JSON.stringify([item.type,item.name.trim().toLowerCase()]);
}
export const thresholds:Record<string,number> = {Malt:10000,Yeast:100,Hop:200};
export function belowThreshold(type:string,remaining:number) { return remaining <= thresholds[type]; }
export function buildSummary(data:SharedData,date=dateInThailand()) {
  const board = JSON.parse(data["brew-day-board-v1"] ?? '{"cabinets":[],"history":[],"stockOpening":{}}') as {
    cabinets:{id:string;batches:(Batch|null)[]}[];history:Batch[];stockOpening:Record<string,number>
  };
  const recipes = JSON.parse(data["brew-day-imported-recipes"] ?? "{}") as Record<string,Recipe>;
  const pending:string[] = [];
  for (const cabinet of board.cabinets) {
    cabinet.batches.forEach((batch,slot) => {
      if (!batch || batch.status === "Plan") return;
      const recipe = batch.recipeSnapshot ?? recipes[batch.recipe];
      if (!recipe) return;
      const rows = recipe.hopRows?.filter(row=>row.stage?.toLowerCase()==="dry hop" && row.amount!==null);
      recipe.hops.forEach((hop,index) => {
        if (batch.completedHops?.includes(index)) return;
        const minutes = rows?.[index]?.minutes ?? null;
        const key = String(minutes ?? "default");
        const offset = hazeHopOffset(batch.recipe,minutes) ?? batch.dryHopAfterDays;
        const due = batch.dryHopDates?.[key] || batch.dryHopOn || (offset==null ? null : shiftedDate(batch.fermentedOn,offset));
        if (due===date) pending.push(`• ${cabinet.id} · ถัง ${slot+1} · ${batch.recipe} · ${hop.name} ${hop.grams} g`);
      });
    });
  }
  const used = new Map<string,StockItem>();
  for (const batch of [...board.cabinets.flatMap(cabinet=>cabinet.batches),...board.history]) {
    if (!batch?.stockUsage) continue;
    for (const item of [...batch.stockUsage.base,...Object.values(batch.stockUsage.hops)]) {
      const key = stockKey(item);
      used.set(key,{...item,grams:(used.get(key)?.grams??0)+item.grams});
    }
  }
  const low:string[] = [];
  for (const [key,opening] of Object.entries(board.stockOpening??{})) {
    const [type,name] = JSON.parse(key) as [string,string];
    const remaining = opening-(used.get(key)?.grams??0);
    if (belowThreshold(type,remaining)) {
      const factor=type==="Malt"?1000:1;
      low.push(`• ${used.get(key)?.name??name} · ${Number((remaining/factor).toFixed(3))} ${type==="Malt"?"kg":"g"}`);
    }
  }
  return [`Brew Day · ${date}`,"","Dry Hop วันนี้",...(pending.length?pending:["ไม่มีรายการ"]),"",
    "Stock · Malt ≤ 10 kg / Yeast ≤ 100 g / Hop ≤ 200 g",...(low.length?low:["ไม่มีรายการ"])].join("\n");
}
