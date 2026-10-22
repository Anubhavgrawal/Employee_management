import { type MigrationInterface, type QueryRunner } from "typeorm";

export class AddRefreshTokenMetadata1730000001000
  implements MigrationInterface
{
  name = "AddRefreshTokenMetadata1730000001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent text`,
    );
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip_address varchar(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS ip_address`,
    );
    await queryRunner.query(
      `ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS user_agent`,
    );
  }
}
