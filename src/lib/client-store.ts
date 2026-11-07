export type Data = Record<string,string>;
const languageKey="brew-day-language";
export function createStore(initial:Data,save:(data:Data)=>void) {
  const data={...initial};
  return {
    getItem(key:string) {
      if (key===languageKey) return window.localStorage.getItem(key);
      return data[key]??null;
    },
    setItem(key:string,value:string) {
      if (key===languageKey) { window.localStorage.setItem(key,value); return; }
      data[key]=value;
      save({...data});
    }
  };
}
