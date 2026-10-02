import { describe, it, expect } from "vitest";
import { studentProfileSchema } from "@/lib/validations/profile";

describe("Student Profile Validation Schema", () => {
  it("should successfully parse valid profile details", () => {
    const validProfile = {
      fullName: "Alex Mercer",
      studentIdNumber: "21BCE0944",
      university: "National Institute of Technology",
      course: "B.Tech Computer Science",
      branch: "Software Engineering",
      currentSemester: 3,
      avatarUrl: "https://example.com/avatar.png",
    };

    const result = studentProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe("Alex Mercer");
      expect(result.data.currentSemester).toBe(3);
    }
  });

  it("should reject full names shorter than 2 characters", () => {
    const invalidProfile = {
      fullName: "A",
      currentSemester: 1,
    };

    const result = studentProfileSchema.safeParse(invalidProfile);
    expect(result.success).toBe(false);
  });

  it("should reject semester numbers less than 1 or greater than 16", () => {
    expect(
      studentProfileSchema.safeParse({ fullName: "Jane Doe", currentSemester: 0 }).success
    ).toBe(false);

    expect(
      studentProfileSchema.safeParse({ fullName: "Jane Doe", currentSemester: 17 }).success
    ).toBe(false);

    expect(
      studentProfileSchema.safeParse({ fullName: "Jane Doe", currentSemester: 4 }).success
    ).toBe(true);
  });

  it("should allow empty strings for optional fields", () => {
    const profileWithEmpties = {
      fullName: "Jane Doe",
      studentIdNumber: "",
      university: "",
      course: "",
      branch: "",
      currentSemester: 1,
      avatarUrl: "",
    };

    const result = studentProfileSchema.safeParse(profileWithEmpties);
    expect(result.success).toBe(true);
  });

  it("should reject invalid avatar URLs", () => {
    const profileWithBadUrl = {
      fullName: "Jane Doe",
      avatarUrl: "not-a-valid-url",
    };

    const result = studentProfileSchema.safeParse(profileWithBadUrl);
    expect(result.success).toBe(false);
  });
});
