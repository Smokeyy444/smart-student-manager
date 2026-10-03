import { describe, it, expect } from "vitest";
import { parseAcademicCsv, detectDelimiter, generateSemesterCsv } from "@/lib/utils/csv-parser";

describe("CSV / TSV Academic Data Parser", () => {
  it("should auto-detect tab delimiter for Excel and Google Sheets pasted data", () => {
    const tsvData = "CSE214\tData Structures\t4\tCore\nCSE215\tDBMS\t4\tCore";
    expect(detectDelimiter(tsvData)).toBe("\t");
  });

  it("should auto-detect comma delimiter for standard CSV", () => {
    const csvData = "code,name,credits,category\nCSE214,Data Structures,4,Core";
    expect(detectDelimiter(csvData)).toBe(",");
  });

  it("should parse pasted tab-separated data without headers", () => {
    const tsv = `CSE214\tData Structures\t4\tCore\nCSE215\tDBMS\t4\tCore\nCSE216\tOperating Systems\t3.5\tCore`;
    const result = parseAcademicCsv(tsv);

    expect(result.totalRows).toBe(3);
    expect(result.validRows.length).toBe(3);
    expect(result.invalidRows.length).toBe(0);

    expect(result.validRows[0].data.code).toBe("CSE214");
    expect(result.validRows[0].data.name).toBe("Data Structures");
    expect(result.validRows[0].data.creditHours).toBe(4);
    expect(result.validRows[0].data.category).toBe("CORE");

    expect(result.validRows[2].data.creditHours).toBe(3.5);
  });

  it("should parse standard CSV with headers", () => {
    const csv = `subjectCode,subjectName,credits,category,audit
CS301,Algorithms,4,CORE,false
PE101,Physical Education,0,AUDIT,true`;

    const result = parseAcademicCsv(csv);
    expect(result.totalRows).toBe(2);
    expect(result.validRows.length).toBe(2);

    expect(result.validRows[0].data.code).toBe("CS301");
    expect(result.validRows[0].data.name).toBe("Algorithms");
    expect(result.validRows[0].data.isAudit).toBe(false);

    expect(result.validRows[1].data.name).toBe("Physical Education");
    expect(result.validRows[1].data.creditHours).toBe(0);
    expect(result.validRows[1].data.isAudit).toBe(true);
    expect(result.validRows[1].data.category).toBe("AUDIT");
  });

  it("should flag invalid rows with clear error descriptions", () => {
    const badData = `
CS101\tValid Course\t4\tCore
\tMissing Name Course\t3\tCore
CS103\tNegative Credits\t-2\tCore
CS104\tExtreme Credits\t50\tCore
`;
    const result = parseAcademicCsv(badData);
    expect(result.validRows.length).toBe(2); // row 1 and row 2 (which has code='' and name='Missing Name Course')
    expect(result.invalidRows.length).toBe(2); // row 3 and row 4

    const negCreditsRow = result.invalidRows.find((r) => r.data.name === "Negative Credits");
    expect(negCreditsRow).toBeDefined();
    expect(negCreditsRow?.errors.some((e) => e.field === "creditHours")).toBe(true);

    const extremeCreditsRow = result.invalidRows.find((r) => r.data.name === "Extreme Credits");
    expect(extremeCreditsRow).toBeDefined();
    expect(extremeCreditsRow?.errors.some((e) => e.field === "creditHours")).toBe(true);
  });

  it("should generate RFC 4180 compliant CSV export", () => {
    const subjects = [
      {
        code: "CS201",
        name: "Data Structures, Algorithms",
        creditHours: 4,
        category: "CORE",
        isAudit: false,
        grade: {
          gradeLetter: "A+",
          gradePoint: 9.0,
          marksObtained: 88,
          maxMarks: 100,
        },
      },
    ];

    const csvOutput = generateSemesterCsv("Semester 1", 1, subjects);
    expect(csvOutput).toContain('"Data Structures, Algorithms"');
    expect(csvOutput).toContain("A+");
    expect(csvOutput).toContain("36.00"); // 4 * 9.0 = 36.00
  });
});
