import { type MigrationInterface, type QueryRunner } from "typeorm";

export class CreateSessionAuditEvents1730000009000 implements MigrationInterface {
  name = "CreateSessionAuditEvents1730000009000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE session_audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        session_id uuid NOT NULL,
        event_type varchar(40) NOT NULL CHECK (event_type IN (
          'session_created', 'session_expired', 'session_revoked', 'logout', 'refresh_token_reuse'
        )),
        occurred_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_status varchar(20) NOT NULL DEFAULT 'pending'
          CHECK (processing_status IN ('pending', 'processed', 'failed')),
        correlation_id uuid NOT NULL UNIQUE
      )
    `);
    await queryRunner.query(
      "CREATE INDEX idx_session_audit_user_time ON session_audit_events(user_id, occurred_at DESC)",
    );
    await queryRunner.query(
      "CREATE INDEX idx_session_audit_type_time ON session_audit_events(event_type, occurred_at DESC)",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS session_audit_events");
  }
}