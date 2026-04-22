insert into public.app_settings (id, bank_name, bank_account_number, bank_account_holder, notice)
values (1, '', '', '', '이체 전 입금자명을 반드시 본인 이름으로 설정해주세요.')
on conflict (id) do nothing;
