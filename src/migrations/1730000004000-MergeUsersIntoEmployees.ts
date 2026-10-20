import { MigrationInterface, QueryRunner } from "typeorm";

export class MergeUsersIntoEmployees1730000004000 implements MigrationInterface {
  name = "MergeUsersIntoEmployees1730000004000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const users = await queryRunner.hasTable("users");
    if (!users) return;

    await queryRunner.query(`
      ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS password_hash text,
        ADD COLUMN IF NOT EXISTS role_id uuid,
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      ALTER TABLE employees
        ADD CONSTRAINT fk_employees_role FOREIGN KEY (role_id)
        REFERENCES roles(id) ON DELETE RESTRICT
    `).catch(() => undefined);
    await queryRunner.query(`
      UPDATE employees e
      SET work_email = u.email,
          password_hash = u.password_hash,
          role_id = u.role_id,
          is_active = u.is_active
      FROM users u
      WHERE u.employee_id = e.id
    `);
    await queryRunner.query(`
      INSERT INTO employees
        (first_name, last_name, work_email, password_hash, role_id, department_id,
         job_title, joining_date, employment_status, is_active)
      SELECT 'System', 'Account', u.email, u.password_hash, u.role_id,
             (SELECT id FROM departments ORDER BY created_at LIMIT 1),
             'System account', CURRENT_DATE, 'active', u.is_active
      FROM users u
      WHERE u.employee_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM employees e WHERE LOWER(e.work_email) = LOWER(u.email))
    `);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS employee_id uuid
    `);
    await queryRunner.query(`
      UPDATE refresh_tokens t
      SET employee_id = COALESCE(u.employee_id, e.id)
      FROM users u
      LEFT JOIN employees e ON LOWER(e.work_email) = LOWER(u.email)
      WHERE t.user_id = u.id
    `);
    await queryRunner.query(`ALTER TABLE refresh_tokens ALTER COLUMN employee_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey`);
    await queryRunner.query(`ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS user_id`);
    await queryRunner.query(`ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_employee_id uuid`);
    await queryRunner.query(`UPDATE audit_logs SET actor_employee_id = u.employee_id FROM users u WHERE audit_logs.actor_user_id = u.id`);
    await queryRunner.query(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey`);
    await queryRunner.query(`ALTER TABLE audit_logs DROP COLUMN IF EXISTS actor_user_id`);
    await queryRunner.query(`ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_employee_id_fkey FOREIGN KEY (actor_employee_id) REFERENCES employees(id) ON DELETE SET NULL`);
    await queryRunner.query(`DROP TABLE users`);
  }

  public async down(): Promise<void> {
    throw new Error("The users table merge is irreversible; restore from a database backup instead.");
  }
}