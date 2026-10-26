import { type MigrationInterface, type QueryRunner } from "typeorm";

export class EnsureEmployeeSalary1730000007000 implements MigrationInterface {
  name = "EnsureEmployeeSalary1730000007000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary numeric(12,2) CHECK(salary IS NULL OR salary >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE employees DROP COLUMN IF EXISTS salary`,
    );
  }
}