ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS anthropic_api_key text;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS openai_api_key text;
