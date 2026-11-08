import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261108142644 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cooloff_withdrawal" drop constraint if exists "cooloff_withdrawal_storage_key_unique";`);
    this.addSql(`create table if not exists "cooloff_withdrawal" ("id" text not null, "receipt_id" text not null, "storage_key" text not null, "name" text not null, "contract" text not null, "email" text not null, "items" jsonb not null, "language" text not null, "submitted_at" text not null, "acknowledged_at" text null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cooloff_withdrawal_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cooloff_withdrawal_receipt_id" ON "cooloff_withdrawal" ("receipt_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cooloff_withdrawal_storage_key_unique" ON "cooloff_withdrawal" ("storage_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cooloff_withdrawal_submitted_at" ON "cooloff_withdrawal" ("submitted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cooloff_withdrawal_deleted_at" ON "cooloff_withdrawal" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cooloff_withdrawal" cascade;`);
  }

}
