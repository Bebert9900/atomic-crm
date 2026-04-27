export const formatCents = (cents: number, currency = "eur") => {
  const value = cents / 100;
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  });
};

export const formatCentsByCurrency = (byCcy: Record<string, number>) => {
  const entries = Object.entries(byCcy);
  if (entries.length === 0) return formatCents(0, "eur");
  return entries.map(([ccy, c]) => formatCents(c, ccy)).join(" + ");
};
