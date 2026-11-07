import {authenticated,sameOrigin} from "@/lib/auth";
import {deliverDailySummary} from "@/lib/line";
export async function POST(request:Request) {
  if (!sameOrigin(request) || !await authenticated()) return new Response(null,{status:403});
  try { return Response.json(await deliverDailySummary()); }
  catch(error) { return Response.json({error:error instanceof Error?error.message:"Delivery failed"},{status:503}); }
}
