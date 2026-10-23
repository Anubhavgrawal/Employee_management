import { type MigrationInterface, type QueryRunner } from "typeorm";
export class InitialSchema1730000000000 implements MigrationInterface {
  name = "InitialSchema1730000000000";
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await q.query(
      `CREATE TABLE departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(100) NOT NULL UNIQUE,description text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),first_name varchar(80) NOT NULL,last_name varchar(80) NOT NULL,work_email varchar(254) NOT NULL UNIQUE,password_hash text,role_id uuid,phone varchar(30),department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,job_title varchar(120) NOT NULL,joining_date date NOT NULL,employment_status varchar(20) NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active','inactive','on_leave')),is_active boolean NOT NULL DEFAULT true,salary numeric(12,2) CHECK(salary IS NULL OR salary>=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX idx_employees_department ON employees(department_id); CREATE INDEX idx_employees_manager ON employees(manager_id); CREATE INDEX idx_employees_status ON employees(employment_status); CREATE INDEX idx_employees_name ON employees(last_name,first_name)`,
    );
    await q.query(
      `CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(30) NOT NULL UNIQUE CHECK(name IN ('admin','hr','manager','employee')),description text)`,
    );
    await q.query(
      `CREATE TABLE permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(80) NOT NULL UNIQUE,description text)`,
    );
    await q.query(
      `CREATE TABLE role_permissions(role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,PRIMARY KEY(role_id,permission_id))`,
    );
    await q.query(
      `ALTER TABLE employees ADD CONSTRAINT fk_employees_role FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE RESTRICT`,
    );
    await q.query(
      `CREATE TABLE refresh_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,family_id uuid NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,replaced_by_id uuid,user_agent text,ip_address varchar(64),created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX idx_refresh_employee_active ON refresh_tokens(employee_id,revoked_at); CREATE INDEX idx_refresh_family ON refresh_tokens(family_id)`,
    );
    await q.query(
      `CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,action varchar(100) NOT NULL,resource_type varchar(80) NOT NULL,resource_id uuid,request_id uuid,metadata jsonb,timestamp timestamptz NOT NULL DEFAULT now()); CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp); CREATE INDEX idx_audit_actor ON audit_logs(actor_employee_id)`,
    );
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DROP TABLE IF EXISTS audit_logs, refresh_tokens, role_permissions, permissions, roles, employees, departments CASCADE",
    );
  }
}
