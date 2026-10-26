import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddEmployeeInvitation1730000006000 implements MigrationInterface {
  name = "AddEmployeeInvitation1730000006000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE employees ADD COLUMN invitation_token_hash varchar(64), ADD COLUMN invitation_expires_at timestamptz`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_employees_invitation_token_hash ON employees(invitation_token_hash) WHERE invitation_token_hash IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_employees_invitation_token_hash`,
    );
    await queryRunner.query(
      `ALTER TABLE employees DROP COLUMN IF EXISTS invitation_token_hash, DROP COLUMN IF EXISTS invitation_expires_at`,
    );
  }
}