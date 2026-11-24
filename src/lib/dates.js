// lib/dates.js — local-date helpers (all dates are plain "YYYY-MM-DD" strings)

const pad = (n) => String(n).padStart(2, "0");

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => todayStr().slice(0, 7);

export const daysInMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

// "2025-03" -> ["2025-03-01", ... "2025-03-31"]
export const datesOfMonth = (month) =>
  Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);

export const monthLabel = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

export const dayLabel = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
};
