-- File Manager isolation is a schema rule, not a query that later code can skip.
-- Rows without a workspace are deleted. Existing cafés that already stored
-- files through the old shared Drive receive a copy of that token on their
-- own workspace so their downloads keep working. A workspace with no files
-- does not receive it.

DELETE FROM drive_files WHERE workspace_id IS NULL;

INSERT INTO workspace_secrets (workspace_id, key, value, updated_at)
SELECT owners.workspace_id, secrets.key, secrets.value, now()
FROM (
  SELECT DISTINCT workspace_id
  FROM drive_files
  WHERE workspace_id IS NOT NULL
) owners
JOIN app_secrets secrets
  ON secrets.key IN ('drive_refresh_token', 'drive_access_token')
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_secrets existing
  WHERE existing.workspace_id = owners.workspace_id
    AND existing.key = secrets.key
);

ALTER TABLE drive_files ALTER COLUMN workspace_id SET NOT NULL;
