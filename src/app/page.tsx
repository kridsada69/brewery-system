import {redirect} from "next/navigation";
import {authenticated} from "@/lib/auth";
import Brewery from "@/components/brewery";
export const dynamic="force-dynamic";
export default async function Home() {
  if (!await authenticated()) redirect("/login");
  return <Brewery/>;
}
