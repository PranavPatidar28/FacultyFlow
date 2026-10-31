import Papa from "papaparse";
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const content = Papa.unparse(rows, { escapeFormulae: true });
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
