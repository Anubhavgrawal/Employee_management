import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddAuditMetadata1730000002000 implements MigrationInterface {
  name = "AddAuditMetadata1730000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata`,
    );
  }
}
