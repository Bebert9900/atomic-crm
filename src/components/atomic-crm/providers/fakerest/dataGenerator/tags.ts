import type { Db } from "./types";

const tags = [
  { id: 0, name: "client", color: "#d1fae5" },
  { id: 1, name: "prospect", color: "#dbeafe" },
  { id: 2, name: "decision-maker", color: "#ede9fe" },
  { id: 3, name: "demo-faite", color: "#fef3c7" },
  { id: 4, name: "partenaire", color: "#fce7f3" },
  { id: 5, name: "churn-risk", color: "#fee2e2" },
  { id: 6, name: "referral", color: "#e0f2fe" },
  { id: 7, name: "revendeur", color: "#f3f4f6" },
  { id: 8, name: "saas-signup", color: "#ecfdf5" },
  { id: 9, name: "inbound", color: "#f0fdf4" },
];

export const generateTags = (_: Db) => {
  return [...tags];
};
