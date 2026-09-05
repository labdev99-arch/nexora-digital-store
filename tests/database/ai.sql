BEGIN;
DO $$ DECLARE table_name text; rls_enabled boolean; BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_documents','ai_jobs','ai_conversations','ai_messages','ai_usage_logs','ai_cache','product_recommendation_edges','profile_recommendations','ai_risk_assessments','ai_glossary_terms','ai_translation_jobs','ai_insights'] LOOP
    SELECT relrowsecurity INTO rls_enabled FROM pg_class WHERE oid=('public.'||table_name)::regclass;
    IF NOT rls_enabled THEN RAISE EXCEPTION 'RLS missing on %',table_name; END IF;
  END LOOP;
END $$;
DO $$ BEGIN
  IF has_function_privilege('anon','public.match_ai_documents(extensions.vector,text,real,integer)','EXECUTE') THEN RAISE EXCEPTION 'anon can execute vector match'; END IF;
  IF has_function_privilege('authenticated','public.claim_ai_jobs(text,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'authenticated can claim AI jobs'; END IF;
END $$;
DO $$ DECLARE owner_policies integer; source_constraint text; BEGIN
  SELECT count(*) INTO owner_policies
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('ai_conversations','ai_messages','profile_recommendations')
    AND cmd='SELECT'
    AND qual LIKE '%auth.uid()%';
  IF owner_policies<>3 THEN
    RAISE EXCEPTION 'AI owner isolation policies are incomplete: %',owner_policies;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO source_constraint
  FROM pg_constraint
  WHERE conrelid='public.ai_documents'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%source_type%';
  IF source_constraint IS NULL OR source_constraint LIKE '%order%' THEN
    RAISE EXCEPTION 'Private orders must not be valid AI document sources';
  END IF;

  IF has_table_privilege('authenticated','public.ai_messages','INSERT') THEN
    RAISE EXCEPTION 'Clients can bypass the assistant endpoint and insert AI messages';
  END IF;
END $$;
ROLLBACK;
