import {authenticated,sameOrigin} from "@/lib/auth";
import {db} from "@/lib/db";
import {saveSchema} from "@/lib/state";
export async function GET() {
  if (!await authenticated()) return new Response(null,{status:401});
  try {
    const state = await db.workspace.upsert({where:{id:"brewery"},create:{id:"brewery",data:{}},update:{}});
    return Response.json(state,{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Database unavailable"},{status:503}); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request) || !await authenticated()) return new Response(null,{status:403});
  const text = await request.text();
  if (Buffer.byteLength(text) > 5_000_000) return new Response(null,{status:413});
  let input;
  try { input = saveSchema.safeParse(JSON.parse(text)); } catch { return new Response(null,{status:400}); }
  if (!input.success) return Response.json({error:input.error.flatten()},{status:400});
  try {
    const result = await db.workspace.updateMany({
      where:{id:"brewery",revision:input.data.revision},
      data:{data:input.data.data,revision:{increment:1}}
    });
    if (!result.count) return Response.json({error:"ข้อมูลถูกแก้จากเครื่องอื่น กรุณาโหลดใหม่ / Another device saved changes. Reload first."},{status:409});
    return Response.json({revision:input.data.revision+1});
  } catch { return Response.json({error:"Database unavailable"},{status:503}); }
}
