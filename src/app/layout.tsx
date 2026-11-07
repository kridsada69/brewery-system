import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Phetkasem Brewery",description:"Brew Day, fermentation, recipes and ingredient stock"};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="th"><body>{children}</body></html>;
}
