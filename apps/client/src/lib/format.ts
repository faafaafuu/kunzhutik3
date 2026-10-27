const rubles = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** "1 940 ₽" */
export function money(value: string | number | null | undefined): string {
  const number = Number(value ?? 0);
  return `${rubles.format(Math.round(number))} ₽`;
}

export function time(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** "Сегодня 14:00", "Завтра 10:30" or "24 октября" */
export function slotLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const hm = time(value);
  if (date.toDateString() === today.toDateString()) return `Сегодня ${hm}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Завтра ${hm}`;
  return `${date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} ${hm}`;
}

export function dayLabel(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function minutesFromNow(value: string | null): number | null {
  if (!value) return null;
  return Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60000));
}

/** Formats as the user types: "+7 900 123-45-67". */
export function maskPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (!digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);
  const parts = [digits.slice(1, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)];
  let result = "+7";
  if (parts[0]) result += ` ${parts[0]}`;
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  return result;
}

export function phoneComplete(value: string): boolean {
  return value.replace(/\D/g, "").length === 11;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function bonusWord(count: number): string {
  return plural(count, "бонус", "бонуса", "бонусов");
}

export function modifiersText(mods: { title: string; kind: string; quantity: number }[]): string {
  return mods
    .map((mod) => {
      const title = mod.kind === "remove" ? mod.title.toLowerCase() : mod.title.toLowerCase();
      return mod.quantity > 1 ? `${title} ×${mod.quantity}` : title;
    })
    .join(", ");
}
