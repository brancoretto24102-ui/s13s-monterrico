import { useEffect, useState } from "react";
import { todayLima } from "./dates";

export function useLimaToday() {
  const [today, setToday] = useState(todayLima);
  useEffect(() => {
    const update = () => setToday(todayLima());
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
}
