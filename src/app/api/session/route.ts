import {cookies} from "next/headers";
import {createSession,equalSecret,sameOrigin,sessionCookie} from "@/lib/auth";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:"Invalid origin"},{status:403});
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) return Response.json({error:"Configure APP_PASSWORD and SESSION_SECRET first"},{status:503});
  let password: unknown;
  try { ({password} = await request.json()); } catch { return Response.json({error:"Invalid request"},{status:400}); }
  if (typeof password !== "string" || !equalSecret(password,process.env.APP_PASSWORD)) {
    await new Promise(resolve => setTimeout(resolve,1000));
    return Response.json({error:"รหัสผ่านไม่ถูกต้อง / Incorrect password"},{status:401});
  }
  (await cookies()).set(sessionCookie,createSession(),{
    httpOnly:true,sameSite:"strict",secure:new URL(request.url).protocol === "https:",path:"/",maxAge:7*86400
  });
  return Response.json({ok:true});
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return new Response(null,{status:403});
  (await cookies()).delete(sessionCookie);
  return Response.json({ok:true});
}
