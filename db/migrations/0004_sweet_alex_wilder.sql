CREATE TABLE "totp_mfa_pending_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_secret" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "totp_mfa_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_secret" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"last_accepted_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "totp_mfa_login_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"digest" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "totp_mfa_login_challenges_digest_unique" UNIQUE("digest"),
	CONSTRAINT "totp_mfa_login_challenges_attempts_nonnegative_check" CHECK ("totp_mfa_login_challenges"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "totp_mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"digest" char(64) NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "totp_mfa_recovery_codes_digest_unique" UNIQUE("digest")
);
--> statement-breakpoint
ALTER TABLE "totp_mfa_pending_enrollments" ADD CONSTRAINT "totp_mfa_pending_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_mfa_configurations" ADD CONSTRAINT "totp_mfa_configurations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_mfa_login_challenges" ADD CONSTRAINT "totp_mfa_login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_mfa_recovery_codes" ADD CONSTRAINT "totp_mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "totp_mfa_pending_enrollments_user_id_unique_idx" ON "totp_mfa_pending_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "totp_mfa_pending_enrollments_user_expires_at_idx" ON "totp_mfa_pending_enrollments" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "totp_mfa_configurations_user_id_unique_idx" ON "totp_mfa_configurations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "totp_mfa_login_challenges_user_expires_consumed_idx" ON "totp_mfa_login_challenges" USING btree ("user_id","expires_at","consumed_at");--> statement-breakpoint
CREATE INDEX "totp_mfa_recovery_codes_user_consumed_at_idx" ON "totp_mfa_recovery_codes" USING btree ("user_id","consumed_at");