-- Run AFTER the migration in the same transaction; it always ends with an exception so nothing is kept.
-- Result is in the error text: "REFTEST OK …" or the first failed check.
do $t$
declare co uuid; jc text; tok_a uuid; tok_b uuid; tok_x uuid; a uuid; b uuid; code text; tk uuid; r jsonb; n int; st text;
begin
  select id, join_code into co, jc from companies order by created_at limit 1;
  update companies set referral_bonus_eur = 0 where id = co;
  tok_a := join_by_link(jc, 'Test Einlader');
  select id into a from workers where token = tok_a;

  -- programme off: no code is handed out
  r := my_referrals(tok_a);
  if (r->>'bonus')::int <> 0 or r->>'code' is not null then raise exception 'FAIL off: %', r; end if;

  update companies set referral_bonus_eur = 50 where id = co;
  r := my_referrals(tok_a); code := r->>'code';
  if length(code) <> 6 then raise exception 'FAIL code: %', r; end if;
  if my_referrals(tok_a)->>'code' <> code then raise exception 'FAIL code stable'; end if;

  r := firm_by_ref(lower(code));
  if r->>'by' <> 'Test' or (r->>'bonus')::int <> 50 then raise exception 'FAIL firm_by_ref: %', r; end if;
  if firm_by_ref('ZZZZZZ') is not null then raise exception 'FAIL unknown code'; end if;

  tok_b := join_by_ref(code, 'Freund Eins');
  select id into b from workers where token = tok_b;
  select status into st from referrals where invitee_id = b and inviter_id = a;
  if st <> 'pending' then raise exception 'FAIL pending: %', st; end if;
  r := my_referrals(tok_a);
  if jsonb_array_length(r->'list') <> 1 or r->'list'->0->>'name' <> 'Freund Eins' then raise exception 'FAIL list: %', r; end if;

  begin perform join_by_ref('ZZZZZZ', 'X Y'); raise exception 'FAIL bad code accepted'; exception when others then if sqlerrm <> 'bad_code' then raise; end if; end;

  -- order where the friend worked only 30 min → not enough
  insert into tasks(title, company_id, status, start_lat, start_lng) values ('Testauftrag', co, 'open', 51.22, 6.78) returning id into tk;
  insert into routes(worker_id, task_id, started_at, ended_at, company_id, break_s) values (b, tk, now() - interval '40 min', now(), co, 600);
  update tasks set status = 'done' where id = tk;
  select status into st from referrals where invitee_id = b;
  if st <> 'pending' then raise exception 'FAIL 30min qualified'; end if;

  -- second order, 2 h → qualifies, inviter gets a message
  update tasks set status = 'open' where id = tk;
  insert into routes(worker_id, task_id, started_at, ended_at, company_id, break_s) values (b, tk, now() - interval '2 hours', now(), co, 0);
  update tasks set status = 'done' where id = tk;
  select status into st from referrals where invitee_id = b;
  if st <> 'qualified' then raise exception 'FAIL not qualified: %', st; end if;
  select count(*) into n from notifications where worker_id = a and kind = 'referral';
  if n <> 1 then raise exception 'FAIL notify count %', n; end if;
  -- done again does not notify twice
  update tasks set status = 'open' where id = tk; update tasks set status = 'done' where id = tk;
  select count(*) into n from notifications where worker_id = a and kind = 'referral';
  if n <> 1 then raise exception 'FAIL double notify %', n; end if;

  -- admin functions refuse non-admins (no auth.uid() here)
  begin perform admin_referrals(); raise exception 'FAIL admin open'; exception when others then if sqlerrm <> 'not_admin' then raise; end if; end;
  begin perform set_referral_bonus(10); raise exception 'FAIL bonus open'; exception when others then if sqlerrm <> 'not_admin' then raise; end if; end;

  -- invitee deletes the account → referral stays, marked deleted
  perform delete_my_account(tok_b);
  r := my_referrals(tok_a);
  if (r->'list'->0->>'deleted')::boolean is not true then raise exception 'FAIL deleted flag: %', r; end if;

  -- inviter limit: 10 per day
  for i in 1..9 loop tok_x := join_by_ref(code, 'Freund ' || (i + 1)); end loop;
  begin perform join_by_ref(code, 'Freund 11'); raise exception 'FAIL limit'; exception when others then if sqlerrm <> 'too_many' then raise; end if; end;

  -- programme switched off later: joining still works, no new referral
  update companies set referral_bonus_eur = 0 where id = co;
  delete from referrals where inviter_id = a and invitee_name like 'Freund %' and invitee_name <> 'Freund Eins';
  tok_x := join_by_ref(code, 'Ohne Bonus');
  select count(*) into n from referrals r join workers w on w.id = r.invitee_id where w.token = tok_x;
  if n <> 0 then raise exception 'FAIL referral while off'; end if;

  raise exception 'REFTEST OK';
end $t$;
