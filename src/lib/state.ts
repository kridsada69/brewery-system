import {z} from "zod";

const quantity = z.number().finite().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
});
const ingredient = z.object({name:z.string().min(1),type:z.enum(["Malt","Hop","Yeast"]),grams:quantity});
const hop = z.object({name:z.string(),grams:quantity});
const row = z.object({
  name:z.string(),amount:quantity.nullable(),unit:z.string(),stage:z.string().optional(),
  minutes:quantity.nullable().optional(),laboratory:z.string().optional(),productId:z.string().optional()
});
export const recipeSchema = z.object({
  hops:z.array(hop),dryHopAfterDays:quantity.nullable(),notes:z.string().max(20000).optional(),
  liters:quantity.nullable().optional(),malt:z.array(row).optional(),
  hopRows:z.array(row).optional(),yeast:z.array(row).optional()
});
export const batchSchema = z.object({
  id:z.string().optional(),recipe:z.string().min(1),status:z.enum(["Plan","Ferment","Cold crash","Complete"]).optional(),
  og:z.number().min(1),ph:z.number().min(0).max(14),liters:z.number().positive().max(60),
  fermentationTemperature:z.number().finite().min(-10).max(60).nullable().optional(),
  fermentedOn:date,dryHopAfterDays:quantity.nullable(),
  dryHopOn:date.nullable().optional(),dryHopDates:z.record(z.string(),date).optional(),
  completedHops:z.array(z.number().int().nonnegative()).optional(),
  note:z.string().max(20000).optional(),sgByDate:z.record(date,z.number().min(0.9)).optional(),
  cabinetId:z.string().optional(),completedOn:date.optional(),
  recipeSnapshot:recipeSchema.optional(),
  stockUsage:z.object({base:z.array(ingredient),hops:z.record(z.string(),ingredient)}).optional()
});
export type Batch = z.infer<typeof batchSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
const boardSchema = z.object({
  cabinets:z.array(z.object({id:z.string().regex(/^[A-Z0-9-]{1,16}$/),batches:z.array(batchSchema.nullable()).max(3)})),
  history:z.array(batchSchema),stockOpening:z.record(z.string(),quantity).default({})
}).superRefine((board, context) => {
  const ids = board.cabinets.map(cabinet => cabinet.id);
  if (new Set(ids).size !== ids.length) context.addIssue({code:"custom",message:"Duplicate cooler code"});
});
const storageKeys = ["brew-day-board-v1","brew-day-imported-recipes","brew-day-removed-recipes"] as const;
export const dataSchema = z.record(z.string(),z.string()).superRefine((data, context) => {
  for (const key of Object.keys(data)) {
    if (!storageKeys.includes(key as typeof storageKeys[number])) context.addIssue({code:"custom",message:"Unsupported storage key"});
  }
  for (const [key,schema] of [
    [storageKeys[0],boardSchema],
    [storageKeys[1],z.record(z.string(),recipeSchema)],
    [storageKeys[2],z.array(z.string())]
  ] as const) {
    if (!(key in data)) continue;
    try {
      const result = schema.safeParse(JSON.parse(data[key]));
      if (!result.success) context.addIssue({code:"custom",message:"Invalid data for " + key});
    } catch { context.addIssue({code:"custom",message:"Invalid JSON for " + key}); }
  }
});
export const saveSchema = z.object({revision:z.number().int().nonnegative(),data:dataSchema});
export type SharedData = z.infer<typeof dataSchema>;
