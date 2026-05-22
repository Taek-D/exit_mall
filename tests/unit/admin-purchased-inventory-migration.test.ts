import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260522000001_admin_purchased_inventory_management.sql'),
  'utf8',
);

describe('admin purchased inventory management migration', () => {
  it('allows manual purchased lots without an inbound request', () => {
    expect(sql).toContain('alter table public.purchased_inventory_lots');
    expect(sql).toMatch(/alter\s+column\s+inbound_request_id\s+drop\s+not\s+null/i);
    expect(sql).toContain("source_type text not null default 'inbound_request'");
    expect(sql).toContain("source_type in ('inbound_request','admin_manual')");
  });

  it('adds an adjustment audit table with admin-only RLS', () => {
    expect(sql).toContain('create table if not exists public.purchased_inventory_lot_adjustments');
    expect(sql).toContain('alter table public.purchased_inventory_lot_adjustments enable row level security');
    expect(sql).toContain('purchased_inventory_lot_adjustments_admin_all');
  });

  it('defines admin-only add and update RPCs', () => {
    expect(sql).toContain('create or replace function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('create or replace function public.admin_update_purchased_inventory_lot');
    expect(sql).toContain('if not public.is_admin() then raise exception');
    expect(sql).toContain('grant execute on function public.admin_add_purchased_inventory_lot');
    expect(sql).toContain('grant execute on function public.admin_update_purchased_inventory_lot');
  });

  it('protects pending reservations during edits', () => {
    expect(sql).toContain('RESERVED_QUANTITY_EXCEEDED');
    expect(sql).toContain('RESERVED_IDENTITY_LOCKED');
    expect(sql).toMatch(/join\s+public\.order_uploads\s+ou\s+on\s+ou\.id\s+=\s+psa\.upload_id/i);
    expect(sql).toContain("ou.status = 'pending'");
    expect(sql).toContain("ou.upload_type = 'purchased'");
  });
});
