import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmployeeDocuments1730000005000 implements MigrationInterface {
  name = "AddEmployeeDocuments1730000005000";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE employee_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE, object_key text NOT NULL UNIQUE, original_name varchar(255) NOT NULL, mime_type varchar(100) NOT NULL, extension varchar(10) NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes > 0), sha256 varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE INDEX idx_employee_documents_employee_created ON employee_documents(employee_id, created_at)`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query("DROP TABLE IF EXISTS employee_documents"); }
}