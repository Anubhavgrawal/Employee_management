import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddAuditTimestamp1730000003000 implements MigrationInterface {
  name = "AddAuditTimestamp1730000003000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS timestamp timestamptz NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs DROP COLUMN IF EXISTS timestamp`,
    );
  }
}
