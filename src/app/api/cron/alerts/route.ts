import {equalSecret} from "@/lib/auth";
import {deliverDailySummary} from "@/lib/line";
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  if (!secret || !equalSecret(request.headers.get("authorization")??"","Bearer "+secret)) return new Response(null,{status:401});
  try { return Response.json(await deliverDailySummary()); }
  catch(error) { return Response.json({error:error instanceof Error?error.message:"Delivery failed"},{status:503}); }
}
