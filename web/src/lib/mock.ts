export type Space = {
  id: string;
  short: string;
  name: string;
  active?: boolean;
};

export type Message = {
  id: string;
  author: string;
  time: string;
  text: string;
};

export type Member = {
  id: string;
  name: string;
  role: "admin" | "member";
};

export const spaces: Space[] = [
  { id: "alpha", short: "A", name: "Alpha Studio", active: true },
  { id: "studio", short: "S", name: "Design Studio" },
  { id: "ops", short: "O", name: "Ops Room" },
  { id: "lab", short: "L", name: "Prototype Lab" },
];

export const textChannels = ["общий", "идеи", "дизайн", "backend"];
export const voiceChannels = ["Комната 01", "Фокус", "Ночной эфир"];

export const voicePresence: Record<string, string[]> = {
  "Комната 01": ["gera", "katya", "mike"],
  Фокус: ["pavel"],
};

export const messages: Message[] = [
  {
    id: "m1",
    author: "Екатерина",
    time: "12:41",
    text: "Собрала наброски интерфейса для логина, можешь глянуть?",
  },
  {
    id: "m2",
    author: "Гера",
    time: "12:43",
    text: "Да, выглядит очень чисто. Давайте так и двигаться.",
  },
  {
    id: "m3",
    author: "Екатерина",
    time: "12:49",
    text: "Ок, сделаю ещё вариант чата и голосового блока.",
  },
];

export const members: Member[] = [
  { id: "u1", name: "gera", role: "admin" },
  { id: "u2", name: "katya", role: "member" },
  { id: "u3", name: "mike", role: "member" },
  { id: "u4", name: "pavel", role: "member" },
];
