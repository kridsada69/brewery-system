"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {Beer} from "lucide-react";
export default function Login() {
  const router=useRouter();
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
    <Beer className="mb-5 text-amber-400" size={40}/>
    <h1 className="text-2xl font-bold">PHETKASEM BREWERY</h1>
    <p className="mt-2 text-sm text-zinc-400">เข้าสู่ระบบ / Sign in</p>
    <form className="mt-6 space-y-4" onSubmit={async event=>{
      event.preventDefault();setPending(true);setError("");
      try {
        const response=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({password:new FormData(event.currentTarget).get("password")})});
        const result=await response.json();
        if (!response.ok) throw new Error(result.error);
        router.replace("/");router.refresh();
      } catch(error) {setError(error instanceof Error?error.message:"Connection failed");}
      finally {setPending(false);}
    }}>
      <label className="block text-sm">รหัสผ่าน / Password
        <input name="password" type="password" required autoComplete="current-password" className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3"/>
      </label>
      <p role="alert" className="text-sm text-red-300">{error}</p>
      <button disabled={pending} className="w-full rounded-xl bg-amber-400 p-3 font-semibold text-zinc-950 disabled:opacity-50">{pending?"กำลังเข้าสู่ระบบ…":"เข้าสู่ระบบ / Sign in"}</button>
    </form>
  </main>;
}
