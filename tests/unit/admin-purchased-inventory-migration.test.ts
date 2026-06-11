import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260522000001_admin_purchased_inventory_management.sql',
);
const shippingUploadActionPath = join(process.cwd(), 'lib/actions/shipping-upload.ts');
const purchasedShippingPath = join(process.cwd(), 'lib/purchased-shipping.ts');

function readMigrationSql() {
  expect(existsSync(migrationPath), `${migrationPath} should exist`).toBe(true);

  return readFileSync(migrationPath, 'utf8');
}

function readShippingUploadAction() {
  expect(existsSync(shippingUploadActionPath), `${shippingUploadActionPath} should exist`).toBe(
    true,
  );

  return readFileSync(shippingUploadActionPath, 'utf8');
}

function readPurchasedShipping() {
  expect(existsSync(purchasedShippingPath), `${purchasedShippingPath} should exist`).toBe(true);

  return readFileSync(purchasedShippingPath, 'utf8');
}

function extractFunctionBody(sql: string, functionName: string) {
  const match = sql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
      'i',
    ),
  );

  expect(match, `Function public.${functionName} should be defined`).not.toBeNull();

  return match?.[1] ?? '';
}

function extractPolicy(sql: string, policyName: string, tableName: string) {
  const match = sql.match(
    new RegExp(
      `create\\s+policy\\s+${policyName}\\s+on\\s+public\\.${tableName}\\b[\\s\\S]*?;`,
      'i',
    ),
  );

  expect(match, `Policy ${policyName} on public.${tableName} should be defined`).not.toBeNull();

  return match?.[0] ?? '';
}

describe('admin purchased inventory management migration', () => {
  it('allows manual purchased lots without an inbound request', () => {
    const sql = readMigrationSql();

    expect(sql).toContain('alter table public.purchased_inventory_lots');
    expect(sql).toMatch(/alter\s+column\s+inbound_request_id\s+drop\s+not\s+null/i);
    expect(sql).toContain("source_type text not null default 'inbound_request'");
    expect(sql).toContain("source_type in ('inbound_request','admin_manual')");
    expect(sql).not.toMatch(/add\s+column\s+if\s+not\s+exists\s+admin_memo/i);
    expect(sql).toContain('purchased_inventory_lots_source_inbound_consistency_check');
    expect(sql).toMatch(/source_type\s*=\s*'admin_manual'\s+and\s+inbound_request_id\s+is\s+null/i);
    expect(sql).toMatch(/source_type\s*=\s*'inbound_request'\s+and\s+inbound_request_id\s+is\s+not\s+null/i);
  });

  it('adds an adjustment audit table with admin-only RLS', () => {
    const sql = readMigrationSql();
    const adminPolicy = extractPolicy(
      sql,
      'purchased_inventory_lot_adjustments_admin_all',
      'purchased_inventory_lot_adjustments',
    );

    expect(sql).toContain('create table if not exists public.purchased_inventory_lot_adjustments');
    expect(sql).toContain('alter table public.purchased_inventory_lot_adjustments enable row level security');
    expect(sql).toContain('purchased_inventory_lot_adjustments_admin_all');
    expect(adminPolicy).toMatch(/using\s*\(\s*public\.is_admin\(\)\s*\)/i);
    expect(adminPolicy).toMatch(/with\s+check\s*\(\s*public\.is_admin\(\)\s*\)/i);
  });

  it('defines admin-only add and update RPCs', () => {
    const sql = readMigrationSql();
    const addLotBody = extractFunctionBody(sql, 'admin_add_purchased_inventory_lot');
    const updateLotBody = extractFunctionBody(sql, 'admin_update_purchased_inventory_lot');

    expect(sql).toContain('create or replace function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('create or replace function public.admin_update_purchased_inventory_lot');
    expect(addLotBody).toContain('if not public.is_admin() then raise exception');
    expect(updateLotBody).toContain('if not public.is_admin() then raise exception');
    expect(sql).toContain('grant execute on function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('grant execute on function public.admin_update_purchased_inventory_lot');
  });

  it('protects pending reservations during edits', () => {
    const sql = readMigrationSql();

    expect(sql).toContain('RESERVED_QUANTITY_EXCEEDED');
    expect(sql).toContain('RESERVED_IDENTITY_LOCKED');
    expect(sql).toMatch(/join\s+public\.order_uploads\s+ou\s+on\s+ou\.id\s+=\s+psa\.upload_id/i);
    expect(sql).toContain("ou.status = 'pending'");
    expect(sql).toContain("ou.upload_type = 'purchased'");
  });

  it('allows admin manual lots while preserving completed inbound validation for purchased shipping', () => {
    const sql = readMigrationSql();
    const uploadBody = extractFunctionBody(sql, 'create_purchased_shipping_upload');

    expect(uploadBody).toContain('pil.source_type');
    expect(uploadBody).toContain('pil.inbound_request_id');
    expect(uploadBody).toMatch(
      /source_type\s*=\s*'admin_manual'\s+and\s+v_check\.inbound_request_id\s+is\s+null/i,
    );
    expect(uploadBody).toMatch(
      /source_type\s*=\s*'inbound_request'\s+and\s+v_check\.inbound_status\s*=\s*'completed'/i,
    );
    expect(uploadBody).not.toMatch(/v_check\.inbound_status\s*<>\s*'completed'/i);
  });

  it('locks allocated lots before validating item identity in purchased shipping', () => {
    const sql = readMigrationSql();
    const uploadBody = extractFunctionBody(sql, 'create_purchased_shipping_upload');
    const lockIndex = uploadBody.indexOf('for update');
    const identityIndex = uploadBody.indexOf('ALLOCATION_LOT_MISMATCH');

    expect(lockIndex).toBeGreaterThan(-1);
    expect(identityIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(identityIndex);
  });

  it('fetches manual lots and only completed inbound lots for purchased shipping allocation', () => {
    const action = readShippingUploadAction();
    const purchasedShipping = readPurchasedShipping();

    expect(action).not.toContain('inbound_requests!inner(status)');
    expect(action).toContain('source_type, inbound_requests(status)');
    expect(purchasedShipping).toContain('isPurchasedLotVisibleForShipping');
    expect(purchasedShipping).toContain("row.source_type === 'admin_manual'");
    expect(purchasedShipping).toContain("row.source_type === 'inbound_request'");
    expect(purchasedShipping).toContain("getPurchasedLotInboundStatus(row) === 'completed'");
    expect(action).not.toContain(".eq('inbound_requests.status', 'completed')");
  });
});
