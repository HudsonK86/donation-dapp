-- Drop beneficiary_user_id from campaigns and require beneficiary_wallet_id.
--
-- Background: campaigns.beneficiary_user_id duplicated the user reachable
-- through campaigns.beneficiary_wallet_id -> wallets.user_id. Keeping both
-- allowed the two fields to drift (e.g. wallet exists but user_id is NULL,
-- or vice versa). One source of truth via the wallet is enough.
--
-- Pre-flight: this migration will fail with
--   ERROR: column "beneficiary_wallet_id" contains null values
-- if any existing row has NULL in beneficiary_wallet_id. Backfill or delete
-- those rows before applying.

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_beneficiary_user_id_fkey";

-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_beneficiary_wallet_id_fkey";

-- AlterTable
ALTER TABLE "campaigns" DROP COLUMN "beneficiary_user_id",
ALTER COLUMN "beneficiary_wallet_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_beneficiary_wallet_id_fkey" FOREIGN KEY ("beneficiary_wallet_id") REFERENCES "wallets"("wallet_id") ON DELETE RESTRICT ON UPDATE CASCADE;