# Structure-only copy of the production database (for SQL tests)

`test/sql/coordinator_role.sh` runs against a local copy of the production **structure** (tables, constraints,
indexes, functions, rules, triggers, grants — no rows). The copy is not stored in this public repository.

1. Run `tools/sql/dump_structure.sql` in the Supabase SQL editor (read-only) and save the single text value as `prod_schema.sql`.
2. Create an empty local database, load `tools/sql/stubs.sql`, then `prod_schema.sql` with `set check_function_bodies = off`
   two or three times (the table `tasks` has a default that calls a function created later; repeat runs only report "already exists").
3. `PGPORT=… bash test/sql/coordinator_role.sh <db> supabase/2026-11-17_coordinator_role.sql supabase/rollback/2026-11-17_coordinator_role.down.sql`

Check after loading: the counts of tables, functions, rules, triggers and constraints equal production.
