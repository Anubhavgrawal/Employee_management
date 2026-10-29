import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateActivityLogs1730000008000 implements MigrationInterface {
  name = "CreateActivityLogs1730000008000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE activity_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        description text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS activity_logs");
  }
}