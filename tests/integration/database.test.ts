
import { afterAll, describe, expect, it } from "@jest/globals";
import { TestDataSource } from "../config/database";

describe("Test database connection", () => {
  afterAll(async () => {
    if (TestDataSource.isInitialized) {
      await TestDataSource.destroy();
    }
  });

  it("connects to employee_management_test", async () => {
    await TestDataSource.initialize();

    const result = await TestDataSource.query(
      "SELECT current_database() AS database_name",
    );

    expect(result[0].database_name).toBe(
      "employee_management_test",
    );
  });
});
