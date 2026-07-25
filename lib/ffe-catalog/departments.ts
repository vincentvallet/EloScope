import departments from "@/data/french-departments.json";

export type DepartmentEntry = {
  code: string;
  name: string;
  regionCode: string;
  regionName: string;
};

const byCode = new Map((departments as DepartmentEntry[]).map((entry) => [entry.code.toUpperCase(), entry]));

export function departmentInfo(code?: string) {
  return code ? byCode.get(code.trim().toUpperCase()) : undefined;
}

export const departmentEntries = departments as DepartmentEntry[];
