--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in',
    'like',
    'ilike',
    'is',
    'match',
    'imatch',
    'isdistinct'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text,
	negate boolean
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
begin
    if not exists (
        select 1
        from pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: graphql(text, text, jsonb, jsonb); Type: FUNCTION; Schema: graphql_public; Owner: -
--

CREATE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: check_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_invite(p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM invites
    WHERE code = p_code AND is_active = true AND uses_remaining > 0
  );
$$;


--
-- Name: first_names_compatible(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.first_names_compatible(p_names text[]) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_longest text;
  v_longest_no_hyphen text;
  v_longest_hyphen_as_space text;
  v_initials_no_hyphen text;
  v_initials_with_hyphen_split text;
  v_n text;
  v_clean_no_hyphen text;
  v_clean_no_space text;
  v_clean_initials text;
BEGIN
  IF p_names IS NULL OR array_length(p_names, 1) IS NULL THEN RETURN false; END IF;
  
  v_longest := '';
  FOREACH v_n IN ARRAY p_names LOOP
    IF v_n IS NOT NULL AND LENGTH(v_n) > LENGTH(v_longest) THEN
      v_longest := v_n;
    END IF;
  END LOOP;
  
  IF LENGTH(v_longest) = 0 THEN RETURN false; END IF;
  
  v_longest_no_hyphen := REPLACE(REPLACE(LOWER(v_longest), '-', ''), '.', '');
  v_longest_hyphen_as_space := REPLACE(REPLACE(LOWER(v_longest), '-', ' '), '.', '');
  
  SELECT string_agg(LEFT(part, 1), '')
  INTO v_initials_no_hyphen
  FROM regexp_split_to_table(v_longest_no_hyphen, '\s+') part
  WHERE LENGTH(part) > 0;
  
  SELECT string_agg(LEFT(part, 1), '')
  INTO v_initials_with_hyphen_split
  FROM regexp_split_to_table(v_longest_hyphen_as_space, '\s+') part
  WHERE LENGTH(part) > 0;
  
  FOREACH v_n IN ARRAY p_names LOOP
    IF v_n IS NULL THEN CONTINUE; END IF;
    v_clean_no_hyphen := REPLACE(REPLACE(LOWER(v_n), '-', ''), '.', '');
    v_clean_no_space := REPLACE(v_clean_no_hyphen, ' ', '');
    
    SELECT string_agg(LEFT(part, 1), '')
    INTO v_clean_initials
    FROM regexp_split_to_table(REPLACE(REPLACE(LOWER(v_n), '-', ' '), '.', ''), '\s+') part
    WHERE LENGTH(part) > 0;
    
    -- (a) Equal to longest after hyphen removal
    IF v_clean_no_hyphen = v_longest_no_hyphen THEN CONTINUE; END IF;
    -- (b) Substring of longest (only if shorter is at least 3 chars, to avoid "ha" matching "haiyang")
    IF LENGTH(v_clean_no_hyphen) >= 3 AND POSITION(v_clean_no_hyphen IN v_longest_no_hyphen) > 0 THEN CONTINUE; END IF;
    -- (c) Initials-based matches (requires at least 2-letter initials)
    IF LENGTH(v_clean_no_space) >= 2 AND v_clean_no_space = v_initials_no_hyphen THEN CONTINUE; END IF;
    IF LENGTH(v_clean_no_space) >= 2 AND v_clean_no_space = v_initials_with_hyphen_split THEN CONTINUE; END IF;
    IF LENGTH(v_clean_initials) >= 2 AND v_clean_initials = v_initials_no_hyphen THEN CONTINUE; END IF;
    IF LENGTH(v_clean_initials) >= 2 AND v_clean_initials = v_initials_with_hyphen_split THEN CONTINUE; END IF;
    
    RETURN false;
  END LOOP;
  
  RETURN true;
END;
$$;


--
-- Name: get_app_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_app_config() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM app_config WHERE id = true;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;


--
-- Name: get_community_directory_filtered(text, text, boolean, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_directory_filtered(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text, p_sort text, p_limit integer, p_offset integer) RETURNS TABLE(npi_number text, first_name text, last_name text, credentials text, practice_city text, practice_state text, primary_taxonomy_label text, is_sole_proprietor boolean, career_stage_years integer, matched_hcp_id uuid, is_published_kol boolean, total_payments_3yr numeric, ad_drug_payments_3yr numeric, top_manufacturers jsonb, top_drugs jsonb)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    cp.npi_number,
    cp.first_name,
    cp.last_name,
    cp.credentials,
    cp.practice_city,
    cp.practice_state,
    cp.primary_taxonomy_label,
    cp.is_sole_proprietor,
    cp.career_stage_years,
    cp.matched_hcp_id,
    (cp.matched_hcp_id IS NOT NULL) AS is_published_kol,
    pay.total_payments_3yr,
    pay.ad_drug_payments_3yr,
    pay.top_manufacturers,
    pay.top_drugs
  FROM community_practitioners cp
  LEFT JOIN community_practitioner_payments pay
    ON pay.npi_number = cp.npi_number
  WHERE (p_state IS NULL OR p_state = 'All' OR cp.practice_state = p_state)
    AND (p_taxonomy_label IS NULL OR p_taxonomy_label = 'All'
         OR cp.primary_taxonomy_label = p_taxonomy_label)
    AND (NOT p_ad_only OR pay.ad_drug_payments_3yr > 0)
    AND (
      p_search IS NULL OR p_search = ''
      OR (cp.first_name || ' ' || cp.last_name) ILIKE '%' || p_search || '%'
      OR cp.practice_city ILIKE '%' || p_search || '%'
    )
    -- Exclude designated KOLs (already surfaced in AD Established/Rising).
    AND NOT EXISTS (
      SELECT 1 FROM hcp_established_ranks_v3 er
      WHERE er.hcp_id = cp.matched_hcp_id
        AND er.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    )
    AND NOT EXISTS (
      SELECT 1 FROM hcp_rising_composite_v1 rc
      WHERE rc.hcp_id = cp.matched_hcp_id
        AND rc.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    )
  ORDER BY
    CASE WHEN p_sort = 'ad'     THEN pay.ad_drug_payments_3yr END DESC NULLS LAST,
    CASE WHEN p_sort = 'total'  THEN pay.total_payments_3yr   END DESC NULLS LAST,
    CASE WHEN p_sort = 'tenure' THEN cp.career_stage_years    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name'   THEN cp.last_name  END ASC,
    CASE WHEN p_sort = 'name'   THEN cp.first_name END ASC,
    cp.last_name ASC, cp.first_name ASC, cp.npi_number ASC   -- deterministic paging tiebreak
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_community_directory_filtered_count(text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_directory_filtered_count(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM community_practitioners cp
  LEFT JOIN community_practitioner_payments pay
    ON pay.npi_number = cp.npi_number
  WHERE (p_state IS NULL OR p_state = 'All' OR cp.practice_state = p_state)
    AND (p_taxonomy_label IS NULL OR p_taxonomy_label = 'All'
         OR cp.primary_taxonomy_label = p_taxonomy_label)
    AND (NOT p_ad_only OR pay.ad_drug_payments_3yr > 0)
    AND (
      p_search IS NULL OR p_search = ''
      OR (cp.first_name || ' ' || cp.last_name) ILIKE '%' || p_search || '%'
      OR cp.practice_city ILIKE '%' || p_search || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM hcp_established_ranks_v3 er
      WHERE er.hcp_id = cp.matched_hcp_id
        AND er.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    )
    AND NOT EXISTS (
      SELECT 1 FROM hcp_rising_composite_v1 rc
      WHERE rc.hcp_id = cp.matched_hcp_id
        AND rc.therapeutic_area_id = '9e4139d2-e062-4a58-8728-cdabb2d7dca1'
    );
$$;


--
-- Name: get_community_filtered(uuid, text, text[], text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, patient_volume numeric, pharma_engagement numeric, group_practice_signal numeric, career_years numeric, publication_signal numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text)
    LANGUAGE sql STABLE
    AS $$
  SELECT 
    cr.hcp_id, cr.rank, cr.scope_size, cr.normalized_score, cr.composite_score,
    cr.patient_volume, cr.pharma_engagement, cr.group_practice_signal,
    cr.career_years, cr.publication_signal,
    cr.country, cr.first_name, cr.last_name, cr.institution_normalized,
    cr.career_first_pub_year, cr.total_career_pubs,
    cr.nppes_practice_city, cr.nppes_practice_state, cr.nppes_practice_setting, cr.npi_specialty
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
  ORDER BY cr.rank
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_community_filtered(uuid, text, text[], text[], uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, patient_volume numeric, pharma_engagement numeric, group_practice_signal numeric, career_years numeric, publication_signal numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, nppes_practice_city text, nppes_practice_state text, nppes_practice_setting text, npi_specialty text, cited_by_count integer, h_index integer, works_count integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT 
    cr.hcp_id, cr.rank, cr.scope_size, cr.normalized_score, cr.composite_score,
    cr.patient_volume, cr.pharma_engagement, cr.group_practice_signal,
    cr.career_years, cr.publication_signal,
    cr.country, cr.first_name, cr.last_name, cr.institution_normalized,
    cr.career_first_pub_year, cr.total_career_pubs,
    cr.nppes_practice_city, cr.nppes_practice_state, cr.nppes_practice_setting, cr.npi_specialty,
    am.cited_by_count, am.h_index, am.works_count
  FROM hcp_community_ranks_v2 cr
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = cr.hcp_id
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY cr.normalized_score DESC
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_community_filtered_count(uuid, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0);
$$;


--
-- Name: get_community_filtered_count(uuid, text, text[], text[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_community_ranks_v2 cr
  WHERE cr.therapeutic_area_id = p_ta_id
    AND cr.scope_type = p_scope_type
    AND cr.scope_value = ANY(p_scope_values)
    AND (cardinality(p_states) = 0 OR cr.nppes_practice_state = ANY(p_states))
    -- Community qualification gate (read-layer), NSCLC ONLY: the 500 floor was
    -- derived from NSCLC's volume distribution. Other TAs stay ungated until
    -- their own distributions are examined and given their own floors.
    AND (cr.therapeutic_area_id <> 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid OR cr.patient_volume >= 500 OR cr.pharma_engagement > 0)
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = cr.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$;


--
-- Name: get_congress_social(text[], date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_congress_social(p_hashtags text[], p_capture_start date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
WITH posts AS (
  SELECT posted_at, handle, display_name, hashtags
  FROM social_posts_v2
  WHERE hashtags && p_hashtags
),
bounds AS (
  SELECT
    coalesce(p_capture_start, min(posted_at)::date) AS d0,
    max(posted_at)::date AS d1,
    count(*) AS total,
    count(DISTINCT handle) AS voices
  FROM posts
),
days AS (
  SELECT gs::date AS d
  FROM bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') gs
),
daily AS (
  SELECT d.d, count(p.posted_at) AS n
  FROM days d
  LEFT JOIN posts p ON p.posted_at::date = d.d
  GROUP BY d.d
),
wow AS (
  SELECT
    count(*) FILTER (WHERE posted_at::date >  (SELECT d1 FROM bounds) - 7)  AS last7,
    count(*) FILTER (WHERE posted_at::date <= (SELECT d1 FROM bounds) - 7
                       AND posted_at::date >  (SELECT d1 FROM bounds) - 14) AS prior7
  FROM posts
)
SELECT CASE WHEN (SELECT total FROM bounds) = 0 THEN NULL ELSE jsonb_build_object(
  'total_posts',   (SELECT total  FROM bounds),
  'voices',        (SELECT voices FROM bounds),
  'capture_start', (SELECT d0 FROM bounds),
  'last_day',      (SELECT d1 FROM bounds),
  'wow_pct', CASE WHEN (SELECT prior7 FROM wow) > 0
                  THEN round(100.0 * ((SELECT last7 FROM wow) - (SELECT prior7 FROM wow)) / (SELECT prior7 FROM wow))
                  ELSE NULL END,
  'daily', (SELECT jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d) FROM daily),
  
  'top_voices', (
    SELECT jsonb_agg(jsonb_build_object('handle', handle, 'name', dn, 'posts', n, 'share', share) ORDER BY n DESC)
    FROM (
      SELECT handle, mode() WITHIN GROUP (ORDER BY display_name) AS dn, count(*) AS n,
             round(100.0 * count(*) / nullif((SELECT total FROM bounds), 0)) AS share
      FROM posts GROUP BY handle ORDER BY count(*) DESC LIMIT 8
    ) v
  ),
  
  'hot_hashtags', (
    SELECT jsonb_agg(jsonb_build_object('tag', tag, 'posts', n, 'share', share) ORDER BY n DESC)
    FROM (
      SELECT tag, count(*) AS n, round(100.0 * count(*) / nullif((SELECT total FROM bounds), 0)) AS share
      FROM (SELECT unnest(hashtags) AS tag FROM posts) u
      WHERE tag <> ALL(p_hashtags)
      GROUP BY tag ORDER BY count(*) DESC LIMIT 8
    ) h
  )
) END
$$;


--
-- Name: get_established_filtered(uuid, text, text[], text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_established_filtered(uuid, text, text[], text[], uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    r3.hcp_id, r3.rank, NULL::integer AS scope_size, r3.cohort_score AS normalized_score,
    r3.cohort_score AS composite_score, NULL::numeric AS trial_score, h.country, h.first_name,
    h.last_name, h.institution_normalized, h.career_first_pub_year, h.total_career_pubs,
    am.cited_by_count, am.h_index, am.works_count
  FROM hcp_established_ranks_v3 r3
  JOIN hcps_v2 h ON h.id = r3.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r3.hcp_id
  WHERE r3.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r3.scope_type = 'global')
      OR (r3.scope_type = p_scope_type AND r3.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r3.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r3.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_established_filtered_count(uuid, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND er.scope_type = 'global')
      OR (er.scope_type = p_scope_type AND er.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$$;


--
-- Name: get_established_filtered_count(uuid, text, text[], text[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_established_ranks_v3 er
  JOIN hcps_v2 h ON h.id = er.hcp_id
  WHERE er.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND er.scope_type = 'global')
      OR (er.scope_type = p_scope_type AND er.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = er.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$;


--
-- Name: get_partner_publications(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_partner_publications(p_source text, p_partner text, p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, pubmed_id text, title text, journal text, pub_year integer, pub_date date, citation_count integer, doi text, pubmed_authorships jsonb)
    LANGUAGE sql STABLE
    AS $$
  select distinct p.id, p.pubmed_id, p.title, p.journal, p.pub_year, p.pub_date,
         p.citation_count, p.doi, p.pubmed_authorships
  from publication_authors_v2 a
  join hcps_v2 hs on hs.id = a.hcp_id
  join publication_authors_v2 b on b.publication_id = a.publication_id
  join hcps_v2 hp on hp.id = b.hcp_id
  join publications_v2 p on p.id = a.publication_id
  where (hs.institution_canonical = p_source or hs.institution_normalized = p_source)
    and (hp.institution_canonical = p_partner or hp.institution_normalized = p_partner)
  order by p.citation_count desc nulls last, p.pub_year desc nulls last
  limit p_limit;
$$;


--
-- Name: get_pulse_synthesis_facts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pulse_synthesis_facts(p_ta_slug text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
WITH ta AS (
  SELECT id AS ta_id, name AS ta_label
  FROM therapeutic_areas
  WHERE slug = p_ta_slug
),
bounds AS (
  SELECT
    (date_trunc('month', current_date))::date AS cur_end,
    (date_trunc('month', current_date) - interval '3 months')::date AS cur_start
),
labeled AS (
  SELECT pt.canonical_id, p.id AS publication_id, p.pub_date, p.publication_types
  FROM publication_theme_v1 pt
  JOIN publications_v2 p ON p.id = pt.publication_id
  CROSS JOIN ta
  CROSS JOIN bounds b
  WHERE pt.therapeutic_area_id = ta.ta_id
    AND pt.is_primary
    AND p.pub_date IS NOT NULL
    AND p.pub_date <> date_trunc('year', p.pub_date)::date
    AND p.pub_date >= b.cur_start AND p.pub_date < b.cur_end
),
cur AS (
  SELECT
    l.canonical_id,
    count(*) AS pubs,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Review','Systematic Review','Meta-Analysis','Network Meta-Analysis']) AS reviews,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Clinical Trial','Clinical Trial, Phase I','Clinical Trial, Phase II','Clinical Trial, Phase III','Randomized Controlled Trial','Clinical Trial Protocol']) AS trials,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Editorial','Comment','Letter']) AS commentary,
    count(*) FILTER (WHERE l.publication_types && ARRAY['Practice Guideline','Consensus Statement']) AS guidance
  FROM labeled l
  GROUP BY l.canonical_id
),
cur_total AS (
  SELECT coalesce(sum(pubs), 0)::numeric AS total FROM cur
),
events AS (
  SELECT
    tc.canonical_name AS theme,
    CASE
      WHEN p.publication_types && ARRAY['Practice Guideline'] THEN 'guideline'
      WHEN p.publication_types && ARRAY['Consensus Statement'] THEN 'consensus'
      ELSE 'retraction'
    END AS type,
    p.title,
    p.journal,
    p.pub_date AS date
  FROM labeled l
  JOIN publications_v2 p ON p.id = l.publication_id
  JOIN theme_canonical_v1 tc ON tc.id = l.canonical_id
  WHERE p.publication_types && ARRAY['Practice Guideline','Consensus Statement','Retracted Publication']
)
SELECT jsonb_build_object(
  'therapeutic_area', (SELECT ta_label FROM ta),
  'window', jsonb_build_object(
    'current_start', (SELECT cur_start FROM bounds),
    'current_end',   (SELECT cur_end FROM bounds)
  ),
  'totals', jsonb_build_object(
    'current_pubs', (SELECT total FROM cur_total)
  ),
  'themes', (
    SELECT coalesce(jsonb_agg(t ORDER BY t_pubs DESC), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'name', tc.canonical_name,
        'cur_pubs', coalesce(c.pubs, 0),
        'cur_share', round(100.0 * coalesce(c.pubs, 0) / nullif((SELECT total FROM cur_total), 0), 2),
        'reviews', coalesce(c.reviews, 0),
        'trials', coalesce(c.trials, 0),
        'commentary', coalesce(c.commentary, 0),
        'guidance', coalesce(c.guidance, 0)
      ) AS t,
      coalesce(c.pubs, 0) AS t_pubs
      FROM theme_canonical_v1 tc
      LEFT JOIN cur c ON c.canonical_id = tc.id
      WHERE tc.therapeutic_area = (SELECT ta_label FROM ta)
    ) s
  ),
  'events', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'theme', e.theme, 'type', e.type, 'title', e.title, 'journal', e.journal, 'date', e.date
    ) ORDER BY e.date DESC), '[]'::jsonb)
    FROM events e
  )
)
$$;


--
-- Name: get_rising_composite_filtered(uuid, text, text[], text[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_rising_composite_filtered(uuid, text, text[], text[], uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, scope_size integer, normalized_score numeric, composite_score numeric, trial_score numeric, rising_composite_score double precision, emergence_pctile double precision, network_influence_pctile double precision, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, cited_by_count integer, h_index integer, works_count integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    r.hcp_id,
    r.rank,
    NULL::integer AS scope_size,
    r.rising_composite_score::numeric AS normalized_score,
    r.rising_composite_score::numeric AS composite_score,
    NULL::numeric AS trial_score,
    r.rising_composite_score,
    r.emergence_pctile,
    r.network_influence_pctile,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs,
    am.cited_by_count,
    am.h_index,
    am.works_count
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  LEFT JOIN hcp_author_metrics_for_cards_v2 am ON am.hcp_id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    )
  ORDER BY r.rank ASC
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_rising_composite_filtered_count(uuid, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$$;


--
-- Name: get_rising_composite_filtered_count(uuid, text, text[], text[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::int
  FROM hcp_rising_composite_v1 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      (p_scope_type = 'global' AND r.scope_type = 'global')
      OR (r.scope_type = p_scope_type AND r.scope_value = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    AND (
      cardinality(p_canonical_theme_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM hcp_research_themes_v2 rt
        JOIN theme_to_canonical_v1 ttc
          ON ttc.raw_theme_name = rt.theme_name
          AND ttc.therapeutic_area = rt.therapeutic_area
        WHERE rt.hcp_id = r.hcp_id
          AND ttc.canonical_id = ANY(p_canonical_theme_ids)
          AND rt.centrality IN ('core', 'supporting')
      )
    );
$$;


--
-- Name: get_rising_star_filtered(uuid, text, text[], text[], uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) RETURNS TABLE(hcp_id uuid, rank integer, us_rank integer, rising_star_percentile numeric, momentum_component numeric, visibility_component numeric, scientific_momentum_percentile numeric, network_momentum_percentile numeric, scientific_visibility_percentile numeric, network_visibility_percentile numeric, archetype text, country text, first_name text, last_name text, institution_normalized text, career_first_pub_year integer, total_career_pubs integer, scope_rank integer)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    r.hcp_id,
    r.rank,
    r.us_rank,
    r.rising_star_percentile,
    r.momentum_component,
    r.visibility_component,
    r.scientific_momentum_percentile,
    r.network_momentum_percentile,
    r.scientific_visibility_percentile,
    r.network_visibility_percentile,
    r.archetype,
    h.country,
    h.first_name,
    h.last_name,
    h.institution_normalized,
    h.career_first_pub_year_v2 AS career_first_pub_year,
    h.total_career_pubs,
    CASE
      WHEN p_scope_type = 'global' THEN r.rank
      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank
      ELSE r.rank
    END AS scope_rank
  FROM hcp_rising_star_ranks_v3 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      p_scope_type = 'global'
      OR (p_scope_type = 'region' AND h.country = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states))
    -- p_canonical_theme_ids accepted but not yet wired (v1.1)
  ORDER BY 
    CASE
      WHEN p_scope_type = 'global' THEN r.rank
      WHEN p_scope_type = 'region' AND 'US' = ANY(p_scope_values) THEN r.us_rank
      ELSE r.rank
    END ASC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_rising_star_filtered_count(uuid, text, text[], text[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_rising_star_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
  SELECT COUNT(*)::integer
  FROM hcp_rising_star_ranks_v3 r
  JOIN hcps_v2 h ON h.id = r.hcp_id
  WHERE r.therapeutic_area_id = p_ta_id
    AND (
      p_scope_type = 'global'
      OR (p_scope_type = 'region' AND h.country = ANY(p_scope_values))
    )
    AND (cardinality(p_states) = 0 OR h.nppes_practice_state = ANY(p_states));
$$;


--
-- Name: get_shared_publications(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shared_publications(p_hcp1 uuid, p_hcp2 uuid, p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, pubmed_id text, title text, journal text, pub_year integer, pub_date date, citation_count integer, doi text, pubmed_authorships jsonb)
    LANGUAGE sql STABLE
    AS $$
  select distinct p.id, p.pubmed_id, p.title, p.journal, p.pub_year, p.pub_date,
         p.citation_count, p.doi, p.pubmed_authorships
  from publication_authors_v2 a
  join publication_authors_v2 b on a.publication_id = b.publication_id
  join publications_v2 p on p.id = a.publication_id
  where a.hcp_id = p_hcp1 and b.hcp_id = p_hcp2
  order by p.citation_count desc nulls last, p.pub_year desc nulls last
  limit p_limit;
$$;


--
-- Name: get_ta_cohort_counts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ta_cohort_counts(p_ta_id uuid) RETURNS TABLE(rising_stars bigint, dark_horses bigint, community bigint, workhorses bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    COUNT(*) FILTER (WHERE h.cohort_classification = 'rising_star') AS rising_stars,
    COUNT(*) FILTER (WHERE h.cohort_classification = 'dark_horse') AS dark_horses,
    COUNT(*) FILTER (WHERE h.cohort_classification = 'community') AS community,
    COUNT(*) FILTER (WHERE h.cohort_classification = 'workhorse') AS workhorses
  FROM hcps h
  INNER JOIN hcp_therapeutic_areas ta ON ta.hcp_id = h.id
  WHERE ta.therapeutic_area_id = p_ta_id;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;


--
-- Name: list_invites(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_invites() RETURNS TABLE(code text, inviter_id uuid, inviter_name text, uses_remaining integer, is_active boolean, note text, created_at timestamp with time zone, redemption_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT i.code,
         i.inviter_id,
         nullif(trim(coalesce(ip.first_name, '') || ' ' || coalesce(ip.last_name, '')), '') AS inviter_name,
         i.uses_remaining,
         i.is_active,
         i.note,
         i.created_at,
         (SELECT count(*) FROM invite_redemptions r WHERE r.invite_code = i.code) AS redemption_count
  FROM invites i
  LEFT JOIN msl_profiles ip ON ip.user_id = i.inviter_id
  ORDER BY i.created_at DESC;
END;
$$;


--
-- Name: list_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_users() RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, company text, job_function text, allowed_ta_slugs text[], invited_by uuid, invited_by_name text, is_admin boolean, deactivated_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         u.email::text,
         p.first_name,
         p.last_name,
         p.company,
         p.job_function,
         p.allowed_ta_slugs,
         p.invited_by,
         nullif(trim(coalesce(bp.first_name, '') || ' ' || coalesce(bp.last_name, '')), '') AS invited_by_name,
         EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id = p.user_id) AS is_admin,
         p.deactivated_at,
         u.created_at
  FROM msl_profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN msl_profiles bp ON bp.user_id = p.invited_by
  ORDER BY u.created_at DESC NULLS LAST;
END;
$$;


--
-- Name: live_ta_parent_slugs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.live_ta_parent_slugs() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(array_agg(DISTINCT slug), ARRAY[]::text[])
  FROM (
    SELECT coalesce(parent.slug, child.slug) AS slug
    FROM therapeutic_area_ingestion_config cfg
    JOIN therapeutic_areas child ON child.id = cfg.therapeutic_area_id
    LEFT JOIN therapeutic_areas parent ON parent.id = child.parent_ta_id
    WHERE cfg.is_visible_in_ui = true AND cfg.is_active = true
  ) s
  WHERE slug IS NOT NULL;
$$;


--
-- Name: merge_hcp_pair(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_canonical_row hcps%ROWTYPE;
  v_merged_row hcps%ROWTYPE;
  v_fk_counts jsonb := '{}'::jsonb;
  v_remaining_refs int;
  v_log_id uuid;
BEGIN
  -- Sanity checks
  IF p_canonical_id = p_merged_id THEN
    RAISE EXCEPTION 'Cannot merge HCP into itself: %', p_canonical_id;
  END IF;
  
  SELECT * INTO v_canonical_row FROM hcps WHERE id = p_canonical_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical HCP not found: %', p_canonical_id;
  END IF;
  
  SELECT * INTO v_merged_row FROM hcps WHERE id = p_merged_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merged HCP not found: %', p_merged_id;
  END IF;
  
  -- Capture pre-merge FK counts for log
  v_fk_counts := jsonb_build_object(
    'publication_authors_canonical', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_canonical_id),
    'publication_authors_merged', (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id),
    'publications_canonical', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_canonical_id),
    'publications_merged', (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id),
    'hcp_therapeutic_areas_canonical', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id),
    'hcp_therapeutic_areas_merged', (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id),
    'hcp_scores_canonical', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_canonical_id),
    'hcp_scores_merged', (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id),
    'hcp_open_payments_summary_canonical', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id),
    'hcp_open_payments_summary_merged', (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id),
    'hcp_open_payments_by_ta_canonical', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id),
    'hcp_open_payments_by_ta_merged', (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id),
    'hcp_medicare_summary_canonical', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id),
    'hcp_medicare_summary_merged', (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id),
    'hcp_medicare_by_ta_canonical', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id),
    'hcp_medicare_by_ta_merged', (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id),
    'hcp_narratives_canonical', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_canonical_id),
    'hcp_narratives_merged', (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id),
    'trial_investigators_merged', (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id),
    'dol_matches_canonical', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_canonical_id),
    'dol_matches_merged', (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id),
    'npi_match_proposals_canonical', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_canonical_id),
    'npi_match_proposals_merged', (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id),
    'trial_match_proposals_merged', (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id)
  );
  
  -- Step 1: Insert merge log entry
  INSERT INTO dedup_merge_log (
    canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals,
    original_canonical_data, original_merged_data, fk_updates_count
  )
  VALUES (
    p_canonical_id, p_merged_id, p_pass_name, p_signals,
    to_jsonb(v_canonical_row), to_jsonb(v_merged_row), v_fk_counts
  )
  RETURNING id INTO v_log_id;
  
  -- Step 2: Resolve UNIQUE constraint conflicts
  -- For each table with UNIQUE involving hcp_id, delete merged's conflicting rows first
  
  -- hcp_therapeutic_areas: UNIQUE (hcp_id, therapeutic_area_id)
  DELETE FROM hcp_therapeutic_areas
  WHERE hcp_id = p_merged_id
    AND therapeutic_area_id IN (
      SELECT therapeutic_area_id FROM hcp_therapeutic_areas WHERE hcp_id = p_canonical_id
    );
  
  -- hcp_scores: UNIQUE (hcp_id, therapeutic_area_id) AND UNIQUE (hcp_id, therapeutic_area_id, score_version)
  -- Stricter constraint catches first; deleting by ta_id handles both
  DELETE FROM hcp_scores
  WHERE hcp_id = p_merged_id
    AND therapeutic_area_id IN (
      SELECT therapeutic_area_id FROM hcp_scores WHERE hcp_id = p_canonical_id
    );
  
  -- hcp_open_payments_summary: UNIQUE (hcp_id)
  IF EXISTS (SELECT 1 FROM hcp_open_payments_summary WHERE hcp_id = p_canonical_id) THEN
    DELETE FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id;
  END IF;
  
  -- hcp_open_payments_by_ta: UNIQUE (hcp_id, therapeutic_area_id)
  DELETE FROM hcp_open_payments_by_ta
  WHERE hcp_id = p_merged_id
    AND therapeutic_area_id IN (
      SELECT therapeutic_area_id FROM hcp_open_payments_by_ta WHERE hcp_id = p_canonical_id
    );
  
  -- hcp_medicare_summary: UNIQUE (hcp_id)
  IF EXISTS (SELECT 1 FROM hcp_medicare_summary WHERE hcp_id = p_canonical_id) THEN
    DELETE FROM hcp_medicare_summary WHERE hcp_id = p_merged_id;
  END IF;
  
  -- hcp_medicare_by_ta: UNIQUE (hcp_id, therapeutic_area_id)
  DELETE FROM hcp_medicare_by_ta
  WHERE hcp_id = p_merged_id
    AND therapeutic_area_id IN (
      SELECT therapeutic_area_id FROM hcp_medicare_by_ta WHERE hcp_id = p_canonical_id
    );
  
  -- hcp_narratives: UNIQUE (hcp_id, therapeutic_area_id, model_version)
  DELETE FROM hcp_narratives
  WHERE hcp_id = p_merged_id
    AND (therapeutic_area_id, model_version) IN (
      SELECT therapeutic_area_id, model_version FROM hcp_narratives WHERE hcp_id = p_canonical_id
    );
  
  -- publication_authors: UNIQUE (publication_id, hcp_id)
  DELETE FROM publication_authors
  WHERE hcp_id = p_merged_id
    AND publication_id IN (
      SELECT publication_id FROM publication_authors WHERE hcp_id = p_canonical_id
    );
  
  -- publications: UNIQUE (hcp_id, pubmed_id) — newly handled
  DELETE FROM publications
  WHERE hcp_id = p_merged_id
    AND pubmed_id IN (
      SELECT pubmed_id FROM publications WHERE hcp_id = p_canonical_id AND pubmed_id IS NOT NULL
    );
  
  -- dol_matches: UNIQUE (hcp_id, social_user_id)
  DELETE FROM dol_matches
  WHERE hcp_id = p_merged_id
    AND social_user_id IN (
      SELECT social_user_id FROM dol_matches WHERE hcp_id = p_canonical_id
    );
  
  -- npi_match_proposals: UNIQUE (hcp_id) — newly handled
  IF EXISTS (SELECT 1 FROM npi_match_proposals WHERE hcp_id = p_canonical_id) THEN
    DELETE FROM npi_match_proposals WHERE hcp_id = p_merged_id;
  END IF;
  
  -- Step 3: Update FKs in remaining (non-conflicting) rows from merged_id to canonical_id
  
  UPDATE publication_authors SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE publications SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_therapeutic_areas SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_scores SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_open_payments_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_open_payments_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_medicare_summary SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_medicare_by_ta SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_claims SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE hcp_narratives SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE trial_investigators SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE dol_matches SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE npi_match_proposals SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE trial_investigator_match_proposals SET proposed_hcp_id = p_canonical_id WHERE proposed_hcp_id = p_merged_id;
  -- Empty tables (no rows currently) — safe to update for future-proofing
  UPDATE hcp_watchlist SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE msl_contributions SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  UPDATE cohort_overrides SET hcp_id = p_canonical_id WHERE hcp_id = p_merged_id;
  
  -- Step 4: Field merge — fill-if-null from merged into canonical for null fields,
  -- numeric maximums for count fields, numeric minimum for first_pub_year
  UPDATE hcps c SET
    npi_number = COALESCE(c.npi_number, m.npi_number),
    middle_name = COALESCE(c.middle_name, m.middle_name),
    credentials = COALESCE(c.credentials, m.credentials),
    twitter_handle = COALESCE(c.twitter_handle, m.twitter_handle),
    bluesky_handle = COALESCE(c.bluesky_handle, m.bluesky_handle),
    orcid = COALESCE(c.orcid, m.orcid),
    nppes_enumeration_date = COALESCE(c.nppes_enumeration_date, m.nppes_enumeration_date),
    nppes_practice_address = COALESCE(c.nppes_practice_address, m.nppes_practice_address),
    nppes_practice_city = COALESCE(c.nppes_practice_city, m.nppes_practice_city),
    nppes_practice_state = COALESCE(c.nppes_practice_state, m.nppes_practice_state),
    nppes_practice_zip = COALESCE(c.nppes_practice_zip, m.nppes_practice_zip),
    nppes_organization_name = COALESCE(c.nppes_organization_name, m.nppes_organization_name),
    nppes_organization_npi = COALESCE(c.nppes_organization_npi, m.nppes_organization_npi),
    nppes_career_stage = COALESCE(c.nppes_career_stage, m.nppes_career_stage),
    nppes_career_stage_years = COALESCE(c.nppes_career_stage_years, m.nppes_career_stage_years),
    nppes_enriched_at = COALESCE(c.nppes_enriched_at, m.nppes_enriched_at),
    -- For count fields: numeric max via direct compare (cleaner than GREATEST with COALESCE)
    total_career_pubs = CASE 
      WHEN c.total_career_pubs IS NULL THEN m.total_career_pubs
      WHEN m.total_career_pubs IS NULL THEN c.total_career_pubs
      ELSE GREATEST(c.total_career_pubs, m.total_career_pubs)
    END,
    scholar_citations_total = CASE 
      WHEN c.scholar_citations_total IS NULL THEN m.scholar_citations_total
      WHEN m.scholar_citations_total IS NULL THEN c.scholar_citations_total
      ELSE GREATEST(c.scholar_citations_total, m.scholar_citations_total)
    END,
    -- For first_pub_year: minimum (earliest)
    first_pub_year = CASE 
      WHEN c.first_pub_year IS NULL THEN m.first_pub_year
      WHEN m.first_pub_year IS NULL THEN c.first_pub_year
      ELSE LEAST(c.first_pub_year, m.first_pub_year)
    END
  FROM hcps m
  WHERE c.id = p_canonical_id AND m.id = p_merged_id;
  
  -- Step 5: Verify zero remaining FK references
  SELECT 
    (SELECT COUNT(*) FROM publication_authors WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM publications WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_therapeutic_areas WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_open_payments_summary WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_open_payments_by_ta WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_medicare_summary WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_medicare_by_ta WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_claims WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_scores WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_narratives WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM trial_investigators WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM dol_matches WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM npi_match_proposals WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM trial_investigator_match_proposals WHERE proposed_hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM hcp_watchlist WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM msl_contributions WHERE hcp_id = p_merged_id) +
    (SELECT COUNT(*) FROM cohort_overrides WHERE hcp_id = p_merged_id)
  INTO v_remaining_refs;
  
  IF v_remaining_refs > 0 THEN
    RAISE EXCEPTION 'Cannot delete merged HCP %: % FK refs still pointing at it', p_merged_id, v_remaining_refs;
  END IF;
  
  -- Step 6: Delete merged hcp row
  DELETE FROM hcps WHERE id = p_merged_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'canonical_id', p_canonical_id,
    'merged_id', p_merged_id,
    'fk_counts', v_fk_counts
  );
END;
$$;


--
-- Name: mint_invite(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mint_invite(p_quota integer DEFAULT 10, p_note text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_quota IS NULL OR p_quota < 1 THEN
    RAISE EXCEPTION 'quota must be at least 1';
  END IF;

  v_code := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO invites (code, inviter_id, uses_remaining, note)
  VALUES (v_code, auth.uid(), p_quota, p_note);

  RETURN v_code;
END;
$$;


--
-- Name: msl_profiles_lock_entitlement_cols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.msl_profiles_lock_entitlement_cols() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.allowed_ta_slugs IS DISTINCT FROM OLD.allowed_ta_slugs THEN
      RAISE EXCEPTION 'allowed_ta_slugs is server-controlled and cannot be modified by the user';
    END IF;
    IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'invited_by is server-controlled and cannot be modified by the user';
    END IF;
    IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at THEN
      RAISE EXCEPTION 'deactivated_at is server-controlled and cannot be modified by the user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: normalize_first_name_to_initials(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_first_name_to_initials(p_first_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_cleaned text;
  v_parts text[];
  v_initials text := '';
  v_part text;
BEGIN
  IF p_first_name IS NULL THEN RETURN NULL; END IF;
  v_cleaned := REPLACE(LOWER(TRIM(p_first_name)), '-', '');
  v_parts := regexp_split_to_array(v_cleaned, '\s+');
  FOREACH v_part IN ARRAY v_parts LOOP
    IF LENGTH(v_part) > 0 THEN
      v_initials := v_initials || LEFT(v_part, 1);
    END IF;
  END LOOP;
  RETURN v_initials;
END;
$$;


--
-- Name: normalize_institution(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_institution(p_raw text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_lower text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  
  v_lower := LOWER(TRIM(p_raw));
  
  -- Department-level / specialty-only fragments → NULL (skip these in Pass 6)
  IF v_lower LIKE 'division of%' 
     OR v_lower LIKE 'department of%'
     OR v_lower LIKE 'laboratory of%'
     OR v_lower LIKE 'key laboratory%'
     OR v_lower LIKE 'institute of%' AND v_lower NOT LIKE '%cancer%'
     OR v_lower LIKE 'section of%'
     OR v_lower LIKE 'unit of%'
     OR v_lower LIKE 'center for%'
     OR v_lower IN (
       'pediatrics', 'internal medicine', 'surgery', 'oncology', 
       'hepatology', 'gastroenterology', 'cardiology', 'neurology',
       'radiology', 'pathology', 'medical oncology', 'radiation oncology',
       'clinical development', 'research and development'
     )
  THEN
    RETURN NULL;
  END IF;
  
  -- (Rest of function unchanged from before — keeping all the MSKCC/Dana-Farber/etc. mappings)
  
  -- MSKCC variations
  IF v_lower LIKE '%memorial sloan kettering%' 
     OR v_lower LIKE '%memorial sloan-kettering%'
     OR v_lower = 'mskcc' THEN
    RETURN 'memorial sloan kettering cancer center';
  END IF;
  
  IF v_lower LIKE '%dana-farber%' 
     OR v_lower LIKE '%dana farber%'
     OR v_lower = 'dfci' THEN
    RETURN 'dana-farber cancer institute';
  END IF;
  
  IF v_lower LIKE '%md anderson%' 
     OR v_lower LIKE '%m.d. anderson%' THEN
    RETURN 'md anderson cancer center';
  END IF;
  
  IF v_lower LIKE '%mayo clinic%' THEN
    RETURN 'mayo clinic';
  END IF;
  
  IF v_lower LIKE '%cleveland clinic%' THEN
    RETURN 'cleveland clinic';
  END IF;
  
  IF v_lower LIKE '%johns hopkins%' 
     OR v_lower LIKE '%sidney kimmel comprehensive%' THEN
    RETURN 'johns hopkins';
  END IF;
  
  IF v_lower LIKE '%stanford%' THEN
    RETURN 'stanford';
  END IF;
  
  IF v_lower LIKE '%yale%' THEN
    RETURN 'yale';
  END IF;
  
  IF v_lower LIKE '%ucsf%' 
     OR v_lower LIKE '%university of california, san francisco%'
     OR v_lower LIKE '%university of california san francisco%' THEN
    RETURN 'ucsf';
  END IF;
  
  IF v_lower LIKE '%ucla%' 
     OR v_lower LIKE '%university of california, los angeles%'
     OR v_lower LIKE '%david geffen%' THEN
    RETURN 'ucla';
  END IF;
  
  IF v_lower LIKE '%ucsd%' 
     OR v_lower LIKE '%university of california, san diego%' THEN
    RETURN 'ucsd';
  END IF;
  
  IF v_lower LIKE '%weill cornell%' THEN
    RETURN 'weill cornell medicine';
  END IF;
  
  IF v_lower LIKE '%massachusetts general%' 
     OR v_lower LIKE '%mass general%'
     OR v_lower = 'mgh' THEN
    RETURN 'massachusetts general hospital';
  END IF;
  
  IF v_lower LIKE '%brigham and women%' 
     OR v_lower LIKE '%brigham & women%' THEN
    RETURN 'brigham and womens hospital';
  END IF;
  
  IF v_lower LIKE '%northwestern%' THEN
    RETURN 'northwestern university';
  END IF;
  
  IF v_lower LIKE '%university of chicago%' THEN
    RETURN 'university of chicago';
  END IF;
  
  IF v_lower LIKE '%ohio state%' THEN
    RETURN 'ohio state university';
  END IF;
  
  IF v_lower LIKE '%university of pennsylvania%' 
     OR v_lower LIKE '%hospital of the university of pennsylvania%'
     OR v_lower LIKE '%abramson cancer%' THEN
    RETURN 'university of pennsylvania';
  END IF;
  
  IF v_lower LIKE '%duke university%' 
     OR v_lower LIKE '%duke cancer%' THEN
    RETURN 'duke university';
  END IF;
  
  IF v_lower LIKE '%emory%' 
     OR v_lower LIKE '%winship cancer%' THEN
    RETURN 'emory university';
  END IF;
  
  IF v_lower LIKE '%vanderbilt%' THEN
    RETURN 'vanderbilt university';
  END IF;
  
  IF v_lower LIKE '%washington university%' 
     OR v_lower LIKE '%siteman cancer%' THEN
    RETURN 'washington university';
  END IF;
  
  IF v_lower LIKE '%city of hope%' THEN
    RETURN 'city of hope';
  END IF;
  
  IF v_lower LIKE '%karmanos%' THEN
    RETURN 'karmanos cancer institute';
  END IF;
  
  IF v_lower LIKE '%fred hutchinson%' 
     OR v_lower LIKE '%fred hutch%' THEN
    RETURN 'fred hutchinson cancer center';
  END IF;
  
  IF v_lower LIKE '%roswell park%' THEN
    RETURN 'roswell park comprehensive cancer center';
  END IF;
  
  -- International
  
  IF v_lower LIKE '%medical university of vienna%' 
     OR v_lower LIKE '%medizinische universität wien%' THEN
    RETURN 'medical university of vienna';
  END IF;
  
  IF v_lower LIKE '%antwerp university hospital%' 
     OR v_lower LIKE '%university of antwerp%' THEN
    RETURN 'antwerp university hospital';
  END IF;
  
  IF v_lower LIKE '%university of oxford%' 
     OR v_lower LIKE '%oxford university%'
     OR v_lower LIKE '%radcliffe department%' THEN
    RETURN 'university of oxford';
  END IF;
  
  IF v_lower LIKE '%pinnacle clinical%' 
     OR v_lower LIKE '%pinnacle research%'
     OR v_lower LIKE '%summit clinical%' THEN
    RETURN 'pinnacle clinical research';
  END IF;
  
  IF v_lower LIKE '%wenzhou medical%' THEN
    RETURN 'wenzhou medical university';
  END IF;
  
  IF v_lower LIKE '%national university of singapore%' 
     OR v_lower LIKE '%national university hospital%'
     OR v_lower LIKE '%nafld research center%' THEN
    RETURN 'national university of singapore';
  END IF;
  
  IF v_lower LIKE '%chinese university of hong kong%' THEN
    RETURN 'chinese university of hong kong';
  END IF;
  
  RETURN v_lower;
END;
$$;


--
-- Name: redeem_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_invite(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inviter uuid;
  v_enabled boolean;
  v_cap int;
  v_count int;
  v_slugs text[];
  v_new_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT signups_enabled, global_signup_cap INTO v_enabled, v_cap FROM app_config WHERE id = true;
  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION 'signups are currently paused';
  END IF;
  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM msl_profiles;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'signup cap reached';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM msl_profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile already exists';
  END IF;

  UPDATE invites
     SET uses_remaining = uses_remaining - 1
   WHERE code = p_code
     AND is_active = true
     AND uses_remaining > 0
  RETURNING inviter_id INTO v_inviter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or exhausted invite';
  END IF;

  IF v_inviter = v_uid THEN
    RAISE EXCEPTION 'cannot redeem your own invite';
  END IF;

  v_slugs := live_ta_parent_slugs();

  INSERT INTO msl_profiles (user_id, allowed_ta_slugs, invited_by)
  VALUES (v_uid, v_slugs, v_inviter);

  INSERT INTO invite_redemptions (invite_code, redeemed_by, inviter_id)
  VALUES (p_code, v_uid, v_inviter);

  v_new_code := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO invites (code, inviter_id, uses_remaining) VALUES (v_new_code, v_uid, 10);

  RETURN jsonb_build_object('ok', true, 'allowed_ta_slugs', v_slugs, 'invite_code', v_new_code);
END;
$$;


--
-- Name: referral_graph(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.referral_graph() RETURNS TABLE(redeemed_by uuid, inviter_id uuid, inviter_name text, inviter_company text, invitee_name text, invitee_company text, job_function text, invite_code text, redeemed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT r.redeemed_by,
         r.inviter_id,
         nullif(trim(coalesce(ip.first_name, '') || ' ' || coalesce(ip.last_name, '')), '') AS inviter_name,
         ip.company AS inviter_company,
         nullif(trim(coalesce(rp.first_name, '') || ' ' || coalesce(rp.last_name, '')), '') AS invitee_name,
         rp.company AS invitee_company,
         rp.job_function,
         r.invite_code,
         r.redeemed_at
  FROM invite_redemptions r
  LEFT JOIN msl_profiles ip ON ip.user_id = r.inviter_id
  LEFT JOIN msl_profiles rp ON rp.user_id = r.redeemed_by
  ORDER BY r.redeemed_at;
END;
$$;


--
-- Name: refresh_social_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_social_analytics() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_social_share_of_voice_by_ta;
  REFRESH MATERIALIZED VIEW mv_social_hot_topics_by_ta;
  REFRESH MATERIALIZED VIEW mv_social_trending_topics_by_ta;
  REFRESH MATERIALIZED VIEW mv_social_voice_emergence_by_ta;
END;
$$;


--
-- Name: run_pass_2_openalex_merge(boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_pass_2_openalex_merge(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_group RECORD;
  v_canonical_id uuid;
  v_merged_id uuid;
  v_groups_processed int := 0;
  v_merges_succeeded int := 0;
  v_merges_failed int := 0;
  v_groups_skipped int := 0;
  v_pair_index int;
  v_us_states text[] := ARRAY[
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR'
  ];
  v_has_us_row boolean;
  v_error_msg text;
BEGIN
  -- Iterate through all OpenAlex-matching duplicate groups
  -- ordering by row_count ascending so we process simpler cases first
  FOR v_group IN 
    SELECT 
      LOWER(TRIM(first_name)) AS norm_first,
      LOWER(TRIM(last_name)) AS norm_last,
      openalex_author_id,
      array_agg(id ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        nppes_enriched_at DESC NULLS LAST,
        created_at ASC
      ) AS hcp_ids,
      array_agg(derived_state ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        nppes_enriched_at DESC NULLS LAST
      ) AS states,
      COUNT(*) AS row_count
    FROM hcps
    WHERE first_name IS NOT NULL 
      AND last_name IS NOT NULL
      AND openalex_author_id IS NOT NULL
    GROUP BY LOWER(TRIM(first_name)), LOWER(TRIM(last_name)), openalex_author_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) ASC
    LIMIT p_limit
  LOOP
    v_groups_processed := v_groups_processed + 1;
    
    -- Mitigation for OpenAlex name collisions:
    -- If row_count >= 4 AND no row has US state, likely a name collision (Lei Wang case)
    -- Skip and queue for manual review
    v_has_us_row := false;
    FOR v_pair_index IN 1..array_length(v_group.states, 1) LOOP
      IF v_group.states[v_pair_index] = ANY(v_us_states) THEN
        v_has_us_row := true;
        EXIT;
      END IF;
    END LOOP;
    
    IF v_group.row_count >= 4 AND NOT v_has_us_row THEN
      v_groups_skipped := v_groups_skipped + 1;
      CONTINUE;
    END IF;
    
    -- Set canonical to first hcp_id (NPPES-preferred per array_agg ORDER BY)
    v_canonical_id := v_group.hcp_ids[1];
    
    -- Process pairs: each non-canonical row gets merged into canonical
    FOR v_pair_index IN 2..array_length(v_group.hcp_ids, 1) LOOP
      v_merged_id := v_group.hcp_ids[v_pair_index];
      
      IF p_dry_run THEN
        v_merges_succeeded := v_merges_succeeded + 1;
        CONTINUE;
      END IF;
      
      BEGIN
        PERFORM merge_hcp_pair(
          v_canonical_id,
          v_merged_id,
          'pass_2_openalex',
          jsonb_build_object(
            'matching_signal', 'openalex_author_id',
            'openalex_author_id', v_group.openalex_author_id,
            'name_match', true,
            'group_row_count', v_group.row_count,
            'pair_index', v_pair_index
          )
        );
        v_merges_succeeded := v_merges_succeeded + 1;
      EXCEPTION WHEN OTHERS THEN
        v_merges_failed := v_merges_failed + 1;
        v_error_msg := SQLERRM;
        -- Log the failure but continue
        INSERT INTO dedup_merge_log (
          canonical_hcp_id,
          merged_hcp_id,
          merge_pass,
          merge_signals
        ) VALUES (
          v_canonical_id,
          v_merged_id,
          'pass_2_openalex_FAILED',
          jsonb_build_object(
            'error', v_error_msg,
            'openalex_author_id', v_group.openalex_author_id
          )
        );
      END;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'groups_processed', v_groups_processed,
    'groups_skipped_collision', v_groups_skipped,
    'merges_succeeded', v_merges_succeeded,
    'merges_failed', v_merges_failed,
    'dry_run', p_dry_run
  );
END;
$$;


--
-- Name: run_pass_5_institution_merge(boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_pass_5_institution_merge(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_group RECORD;
  v_canonical_id uuid;
  v_merged_id uuid;
  v_groups_processed int := 0;
  v_merges_succeeded int := 0;
  v_merges_failed int := 0;
  v_groups_skipped int := 0;
  v_pair_index int;
  v_error_msg text;
BEGIN
  FOR v_group IN 
    SELECT 
      LOWER(TRIM(first_name)) AS norm_first,
      LOWER(TRIM(last_name)) AS norm_last,
      LOWER(TRIM(institution_short)) AS norm_institution,
      array_agg(id ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        nppes_enriched_at DESC NULLS LAST,
        created_at ASC
      ) AS hcp_ids,
      COUNT(*) AS row_count
    FROM hcps
    WHERE first_name IS NOT NULL 
      AND last_name IS NOT NULL
      AND institution_short IS NOT NULL
    GROUP BY LOWER(TRIM(first_name)), LOWER(TRIM(last_name)), LOWER(TRIM(institution_short))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) ASC
    LIMIT p_limit
  LOOP
    v_groups_processed := v_groups_processed + 1;
    
    -- Row-count guard: skip 4+ row groups (likely name collisions at large institutions)
    IF v_group.row_count >= 4 THEN
      v_groups_skipped := v_groups_skipped + 1;
      CONTINUE;
    END IF;
    
    v_canonical_id := v_group.hcp_ids[1];
    
    FOR v_pair_index IN 2..array_length(v_group.hcp_ids, 1) LOOP
      v_merged_id := v_group.hcp_ids[v_pair_index];
      
      IF p_dry_run THEN
        v_merges_succeeded := v_merges_succeeded + 1;
        CONTINUE;
      END IF;
      
      BEGIN
        PERFORM merge_hcp_pair(
          v_canonical_id,
          v_merged_id,
          'pass_5_institution',
          jsonb_build_object(
            'matching_signal', 'name_plus_institution_short',
            'institution_short', v_group.norm_institution,
            'name_match', true,
            'group_row_count', v_group.row_count,
            'pair_index', v_pair_index
          )
        );
        v_merges_succeeded := v_merges_succeeded + 1;
      EXCEPTION WHEN OTHERS THEN
        v_merges_failed := v_merges_failed + 1;
        v_error_msg := SQLERRM;
        INSERT INTO dedup_merge_log (
          canonical_hcp_id,
          merged_hcp_id,
          merge_pass,
          merge_signals
        ) VALUES (
          v_canonical_id,
          v_merged_id,
          'pass_5_institution_FAILED',
          jsonb_build_object(
            'error', v_error_msg,
            'institution_short', v_group.norm_institution
          )
        );
      END;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'groups_processed', v_groups_processed,
    'groups_skipped_collision', v_groups_skipped,
    'merges_succeeded', v_merges_succeeded,
    'merges_failed', v_merges_failed,
    'dry_run', p_dry_run
  );
END;
$$;


--
-- Name: run_pass_6_fuzzy_institution_merge(boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_pass_6_fuzzy_institution_merge(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_group RECORD;
  v_canonical_id uuid;
  v_merged_id uuid;
  v_groups_processed int := 0;
  v_merges_succeeded int := 0;
  v_merges_failed int := 0;
  v_pair_index int;
  v_error_msg text;
BEGIN
  FOR v_group IN 
    SELECT 
      LOWER(TRIM(first_name)) AS norm_first,
      LOWER(TRIM(last_name)) AS norm_last,
      normalize_institution(institution_short) AS norm_institution,
      array_agg(id ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        nppes_enriched_at DESC NULLS LAST,
        created_at ASC
      ) AS hcp_ids,
      COUNT(*) AS row_count
    FROM hcps
    WHERE first_name IS NOT NULL 
      AND last_name IS NOT NULL
      AND normalize_institution(institution_short) IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) ASC
    LIMIT p_limit
  LOOP
    v_groups_processed := v_groups_processed + 1;
    v_canonical_id := v_group.hcp_ids[1];
    
    FOR v_pair_index IN 2..array_length(v_group.hcp_ids, 1) LOOP
      v_merged_id := v_group.hcp_ids[v_pair_index];
      
      IF p_dry_run THEN
        v_merges_succeeded := v_merges_succeeded + 1;
        CONTINUE;
      END IF;
      
      BEGIN
        PERFORM merge_hcp_pair(
          v_canonical_id,
          v_merged_id,
          'pass_6_fuzzy_institution',
          jsonb_build_object(
            'matching_signal', 'name_plus_normalized_institution',
            'norm_institution', v_group.norm_institution,
            'name_match', true,
            'group_row_count', v_group.row_count,
            'pair_index', v_pair_index
          )
        );
        v_merges_succeeded := v_merges_succeeded + 1;
      EXCEPTION WHEN OTHERS THEN
        v_merges_failed := v_merges_failed + 1;
        v_error_msg := SQLERRM;
        INSERT INTO dedup_merge_log (
          canonical_hcp_id,
          merged_hcp_id,
          merge_pass,
          merge_signals
        ) VALUES (
          v_canonical_id,
          v_merged_id,
          'pass_6_fuzzy_institution_FAILED',
          jsonb_build_object(
            'error', v_error_msg,
            'norm_institution', v_group.norm_institution
          )
        );
      END;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'groups_processed', v_groups_processed,
    'merges_succeeded', v_merges_succeeded,
    'merges_failed', v_merges_failed,
    'dry_run', p_dry_run
  );
END;
$$;


--
-- Name: run_pass_7_openalex_state_merge(boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_pass_7_openalex_state_merge(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_group RECORD;
  v_canonical_id uuid;
  v_merged_id uuid;
  v_groups_processed int := 0;
  v_merges_succeeded int := 0;
  v_merges_failed int := 0;
  v_error_msg text;
BEGIN
  FOR v_group IN 
    SELECT 
      LOWER(TRIM(first_name)) AS norm_first,
      LOWER(TRIM(last_name)) AS norm_last,
      array_agg(id ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        nppes_enriched_at DESC NULLS LAST,
        total_career_pubs DESC NULLS LAST,
        created_at ASC
      ) AS hcp_ids,
      COUNT(DISTINCT derived_state) FILTER (WHERE derived_state IS NOT NULL) AS distinct_states,
      COUNT(*) AS row_count,
      COUNT(*) FILTER (WHERE openalex_author_id IS NOT NULL) AS openalex_count
    FROM hcps
    WHERE first_name IS NOT NULL AND last_name IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(*) = 2
       AND COUNT(DISTINCT derived_state) FILTER (WHERE derived_state IS NOT NULL) <= 1
       AND COUNT(*) FILTER (WHERE openalex_author_id IS NOT NULL) >= 2
    ORDER BY COUNT(*) ASC
    LIMIT p_limit
  LOOP
    v_groups_processed := v_groups_processed + 1;
    v_canonical_id := v_group.hcp_ids[1];
    v_merged_id := v_group.hcp_ids[2];
    
    IF p_dry_run THEN
      v_merges_succeeded := v_merges_succeeded + 1;
      CONTINUE;
    END IF;
    
    BEGIN
      PERFORM merge_hcp_pair(
        v_canonical_id,
        v_merged_id,
        'pass_7_openalex_state',
        jsonb_build_object(
          'matching_signal', 'name_state_both_openalex',
          'name_match', true,
          'state_consistent', true,
          'both_have_openalex', true
        )
      );
      v_merges_succeeded := v_merges_succeeded + 1;
    EXCEPTION WHEN OTHERS THEN
      v_merges_failed := v_merges_failed + 1;
      v_error_msg := SQLERRM;
      INSERT INTO dedup_merge_log (
        canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals
      ) VALUES (
        v_canonical_id, v_merged_id, 'pass_7_openalex_state_FAILED',
        jsonb_build_object('error', v_error_msg)
      );
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'groups_processed', v_groups_processed,
    'merges_succeeded', v_merges_succeeded,
    'merges_failed', v_merges_failed,
    'dry_run', p_dry_run
  );
END;
$$;


--
-- Name: run_pass_7b_initialized_name_merge(boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_pass_7b_initialized_name_merge(p_dry_run boolean DEFAULT false, p_limit integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_group RECORD;
  v_canonical_id uuid;
  v_merged_id uuid;
  v_groups_processed int := 0;
  v_merges_succeeded int := 0;
  v_merges_failed int := 0;
  v_groups_skipped int := 0;
  v_pair_index int;
  v_error_msg text;
BEGIN
  FOR v_group IN 
    SELECT 
      LEFT(LOWER(TRIM(first_name)), 1) AS first_initial,
      LOWER(TRIM(last_name)) AS norm_last,
      openalex_author_id,
      array_agg(id ORDER BY 
        CASE WHEN nppes_enriched_at IS NOT NULL THEN 0 ELSE 1 END,
        LENGTH(first_name) DESC,
        nppes_enriched_at DESC NULLS LAST,
        created_at ASC
      ) AS hcp_ids,
      array_agg(first_name) AS first_names,
      COUNT(*) AS row_count,
      COUNT(DISTINCT derived_state) FILTER (WHERE derived_state IS NOT NULL) AS distinct_states
    FROM hcps
    WHERE first_name IS NOT NULL 
      AND last_name IS NOT NULL
      AND openalex_author_id IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) ASC
    LIMIT p_limit
  LOOP
    v_groups_processed := v_groups_processed + 1;
    
    -- Safety guards:
    -- 1. Skip multi-state groups (likely name collisions across geographies)
    IF v_group.distinct_states >= 2 THEN
      v_groups_skipped := v_groups_skipped + 1;
      CONTINUE;
    END IF;
    
    -- 2. Skip if first names not compatible (Hao vs Hai-Long etc.)
    IF NOT first_names_compatible(v_group.first_names) THEN
      v_groups_skipped := v_groups_skipped + 1;
      CONTINUE;
    END IF;
    
    v_canonical_id := v_group.hcp_ids[1];
    
    FOR v_pair_index IN 2..array_length(v_group.hcp_ids, 1) LOOP
      v_merged_id := v_group.hcp_ids[v_pair_index];
      
      IF p_dry_run THEN
        v_merges_succeeded := v_merges_succeeded + 1;
        CONTINUE;
      END IF;
      
      BEGIN
        PERFORM merge_hcp_pair(
          v_canonical_id,
          v_merged_id,
          'pass_7b_initialized_name',
          jsonb_build_object(
            'matching_signal', 'first_initial_plus_openalex_plus_name_compatible',
            'openalex_author_id', v_group.openalex_author_id,
            'first_names', v_group.first_names,
            'group_row_count', v_group.row_count
          )
        );
        v_merges_succeeded := v_merges_succeeded + 1;
      EXCEPTION WHEN OTHERS THEN
        v_merges_failed := v_merges_failed + 1;
        v_error_msg := SQLERRM;
        INSERT INTO dedup_merge_log (
          canonical_hcp_id, merged_hcp_id, merge_pass, merge_signals
        ) VALUES (
          v_canonical_id, v_merged_id, 'pass_7b_initialized_name_FAILED',
          jsonb_build_object('error', v_error_msg, 'openalex_author_id', v_group.openalex_author_id)
        );
      END;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'groups_processed', v_groups_processed,
    'groups_skipped', v_groups_skipped,
    'merges_succeeded', v_merges_succeeded,
    'merges_failed', v_merges_failed,
    'dry_run', p_dry_run
  );
END;
$$;


--
-- Name: set_invite_active(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_invite_active(p_code text, p_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_active boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_code IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'code and active are required';
  END IF;

  UPDATE invites
     SET is_active = p_active
   WHERE code = p_code
  RETURNING is_active INTO v_is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;

  RETURN jsonb_build_object('code', p_code, 'is_active', v_is_active);
END;
$$;


--
-- Name: set_signup_cap(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_signup_cap(p_cap integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_cap IS NOT NULL AND p_cap < 0 THEN
    RAISE EXCEPTION 'cap cannot be negative';
  END IF;

  UPDATE app_config
     SET global_signup_cap = p_cap,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_user_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_active(p_user uuid, p_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deactivated_at timestamptz;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_user IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'user and active are required';
  END IF;

  IF NOT p_active AND p_user = auth.uid() THEN
    RAISE EXCEPTION 'an admin cannot deactivate their own account';
  END IF;

  UPDATE msl_profiles
     SET deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END
   WHERE user_id = p_user
  RETURNING deactivated_at INTO v_deactivated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  RETURN jsonb_build_object('user_id', p_user, 'deactivated_at', v_deactivated_at);
END;
$$;


--
-- Name: toggle_signups(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_signups(p_enabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled must be true or false';
  END IF;

  UPDATE app_config
     SET signups_enabled = p_enabled,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;


--
-- Name: upsert_trial_investigators_preserving_match(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_trial_investigators_preserving_match(rows_data jsonb) RETURNS TABLE(rows_affected integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  affected int := 0;
BEGIN
  INSERT INTO trial_investigators (
    trial_id,
    hcp_id,
    role,
    investigator_name,
    investigator_raw_first_name,
    investigator_raw_last_name,
    investigator_raw_affiliation,
    investigator_raw_facility,
    investigator_raw_city,
    investigator_raw_state,
    investigator_raw_country,
    match_confidence,
    source
  )
  SELECT
    (r->>'trial_id')::uuid,
    NULLIF(r->>'hcp_id', '')::uuid,
    r->>'role',
    r->>'investigator_name',
    r->>'investigator_raw_first_name',
    r->>'investigator_raw_last_name',
    r->>'investigator_raw_affiliation',
    r->>'investigator_raw_facility',
    r->>'investigator_raw_city',
    r->>'investigator_raw_state',
    r->>'investigator_raw_country',
    NULLIF(r->>'match_confidence', '')::int,
    r->>'source'
  FROM jsonb_array_elements(rows_data) AS r
  ON CONFLICT (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source)
  DO UPDATE SET
    hcp_id = COALESCE(EXCLUDED.hcp_id, trial_investigators.hcp_id),
    match_confidence = CASE 
      WHEN EXCLUDED.hcp_id IS NOT NULL THEN EXCLUDED.match_confidence
      ELSE trial_investigators.match_confidence
    END,
    investigator_name = COALESCE(EXCLUDED.investigator_name, trial_investigators.investigator_name),
    investigator_raw_affiliation = COALESCE(EXCLUDED.investigator_raw_affiliation, trial_investigators.investigator_raw_affiliation),
    investigator_raw_facility = COALESCE(EXCLUDED.investigator_raw_facility, trial_investigators.investigator_raw_facility),
    investigator_raw_city = COALESCE(EXCLUDED.investigator_raw_city, trial_investigators.investigator_raw_city),
    investigator_raw_state = COALESCE(EXCLUDED.investigator_raw_state, trial_investigators.investigator_raw_state),
    investigator_raw_country = COALESCE(EXCLUDED.investigator_raw_country, trial_investigators.investigator_raw_country);
  
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN QUERY SELECT affected;
END;
$$;


--
-- Name: upsert_trial_investigators_v2_preserving_match(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_trial_investigators_v2_preserving_match(rows_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO trial_investigators_v2 (
    hcp_id,
    trial_id,
    role,
    investigator_name,
    investigator_raw_first_name,
    investigator_raw_middle_name,
    investigator_raw_last_name,
    investigator_raw_affiliation,
    investigator_raw_facility,
    investigator_raw_city,
    investigator_raw_state,
    investigator_raw_country,
    match_confidence,
    source
  )
  SELECT
    NULLIF(r.hcp_id, '')::uuid,
    r.trial_id::uuid,
    r.role,
    r.investigator_name,
    r.investigator_raw_first_name,
    r.investigator_raw_middle_name,
    r.investigator_raw_last_name,
    r.investigator_raw_affiliation,
    r.investigator_raw_facility,
    r.investigator_raw_city,
    r.investigator_raw_state,
    r.investigator_raw_country,
    r.match_confidence,
    r.source
  FROM jsonb_to_recordset(rows_data) AS r(
    hcp_id text,
    trial_id text,
    role text,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_middle_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    match_confidence integer,
    source text
  )
  ON CONFLICT (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source)
  DO UPDATE SET
    hcp_id = COALESCE(EXCLUDED.hcp_id, trial_investigators_v2.hcp_id),
    match_confidence = GREATEST(
      COALESCE(EXCLUDED.match_confidence, 0),
      COALESCE(trial_investigators_v2.match_confidence, 0)
    ),
    source = CASE
      WHEN EXCLUDED.hcp_id IS NOT NULL THEN EXCLUDED.source
      ELSE trial_investigators_v2.source
    END,
    investigator_name = COALESCE(EXCLUDED.investigator_name, trial_investigators_v2.investigator_name),
    investigator_raw_middle_name = COALESCE(
      EXCLUDED.investigator_raw_middle_name,
      trial_investigators_v2.investigator_raw_middle_name
    ),
    investigator_raw_affiliation = COALESCE(
      EXCLUDED.investigator_raw_affiliation,
      trial_investigators_v2.investigator_raw_affiliation
    ),
    investigator_raw_facility = COALESCE(
      EXCLUDED.investigator_raw_facility,
      trial_investigators_v2.investigator_raw_facility
    ),
    investigator_raw_city = COALESCE(
      EXCLUDED.investigator_raw_city,
      trial_investigators_v2.investigator_raw_city
    ),
    investigator_raw_state = COALESCE(
      EXCLUDED.investigator_raw_state,
      trial_investigators_v2.investigator_raw_state
    ),
    investigator_raw_country = COALESCE(
      EXCLUDED.investigator_raw_country,
      trial_investigators_v2.investigator_raw_country
    );
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
    -- Regclass of the table e.g. public.notes
    entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

    -- I, U, D, T: insert, update ...
    action realtime.action = (
        case wal ->> 'action'
            when 'I' then 'INSERT'
            when 'U' then 'UPDATE'
            when 'D' then 'DELETE'
            else 'ERROR'
        end
    );

    -- Is row level security enabled for the table
    is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

    subscriptions realtime.subscription[] = array_agg(subs)
        from
            realtime.subscription subs
        where
            subs.entity = entity_
            -- Filter by action early - only get subscriptions interested in this action
            -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
            and (subs.action_filter = '*' or subs.action_filter = action::text);

    -- Subscription vars
    working_role regrole;
    working_selected_columns text[];
    claimed_role regrole;
    claims jsonb;

    subscription_id uuid;
    subscription_has_access bool;
    visible_to_subscription_ids uuid[] = '{}';

    -- structured info for wal's columns
    columns realtime.wal_column[];
    -- previous identity values for update/delete
    old_columns realtime.wal_column[];

    error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

    -- Primary jsonb output for record
    output jsonb;

    -- Loop record for iterating unique roles (outer loop)
    role_record record;
    -- Loop record for iterating unique selected_columns within a role (inner loop)
    cols_record record;
    -- Subscription ids visible at the role level (before fanning out by selected_columns)
    visible_role_sub_ids uuid[] = '{}';

begin
    perform set_config('role', null, true);

    columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'columns') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    old_columns =
        array_agg(
            (
                x->>'name',
                x->>'type',
                x->>'typeoid',
                realtime.cast(
                    (x->'value') #>> '{}',
                    coalesce(
                        (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                        (x->>'type')::regtype
                    )
                ),
                (pks ->> 'name') is not null,
                true
            )::realtime.wal_column
        )
        from
            jsonb_array_elements(wal -> 'identity') x
            left join jsonb_array_elements(wal -> 'pk') pks
                on (x ->> 'name') = (pks ->> 'name');

    for role_record in
        select claims_role
        from (select distinct claims_role from unnest(subscriptions)) t
        order by claims_role::text
    loop
        working_role := role_record.claims_role;

        -- Update `is_selectable` for columns and old_columns (once per role)
        columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(columns) c;

        old_columns =
                array_agg(
                    (
                        c.name,
                        c.type_name,
                        c.type_oid,
                        c.value,
                        c.is_pkey,
                        pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                    )::realtime.wal_column
                )
                from
                    unnest(old_columns) c;

        if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
            -- Fan out 400 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 400: Bad Request, no primary key']
                )::realtime.wal_rls;
            end loop;

        -- The claims role does not have SELECT permission to the primary key of entity
        elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
            -- Fan out 401 error per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;
                return next (
                    jsonb_build_object(
                        'schema', wal ->> 'schema',
                        'table', wal ->> 'table',
                        'type', action
                    ),
                    is_rls_enabled,
                    (select array_agg(s.subscription_id) from unnest(subscriptions) as s where s.claims_role = working_role and (s.selected_columns is not distinct from working_selected_columns)),
                    array['Error 401: Unauthorized']
                )::realtime.wal_rls;
            end loop;

        else
            -- Create the prepared statement (once per role)
            if is_rls_enabled and action <> 'DELETE' then
                if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                    deallocate walrus_rls_stmt;
                end if;
                execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
            end if;

            -- Collect all visible subscription IDs for this role (filter check + RLS check)
            visible_role_sub_ids = '{}';

            for subscription_id, claims in (
                    select
                        subs.subscription_id,
                        subs.claims
                    from
                        unnest(subscriptions) subs
                    where
                        subs.entity = entity_
                        and subs.claims_role = working_role
                        and (
                            realtime.is_visible_through_filters(columns, subs.filters)
                            or (
                              action = 'DELETE'
                              and realtime.is_visible_through_filters(old_columns, subs.filters)
                            )
                        )
            ) loop

                if not is_rls_enabled or action = 'DELETE' then
                    visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                else
                    -- Check if RLS allows the role to see the record
                    perform
                        -- Trim leading and trailing quotes from working_role because set_config
                        -- doesn't recognize the role as valid if they are included
                        set_config('role', trim(both '"' from working_role::text), true),
                        set_config('request.jwt.claims', claims::text, true);

                    execute 'execute walrus_rls_stmt' into subscription_has_access;

                    -- Reset the role on every FOR..LOOP batch execution.
                    -- The first batch of 10 rows is pre-fetched using the current connection role (PG internal behaviour)
                    -- then we have to reset it again otherwise it would use the role defined in the `set_config` above
                    -- to fetch the remaining rows when rows>10, which could be a user-defined role that lacks execution grants.
                    -- The flow is:
                    --   1. run batch with conn role
                    --   2. set_config working_role
                    --   3. execute walrus
                    --   4. reset role (revert)
                    --   5. repeat
                    perform set_config('role', null, true);

                    if subscription_has_access then
                        visible_role_sub_ids = visible_role_sub_ids || subscription_id;
                    end if;
                end if;
            end loop;

            perform set_config('role', null, true);

            -- Inner loop: per distinct selected_columns for this role
            for cols_record in
                select selected_columns
                from (select distinct selected_columns from unnest(subscriptions) s where s.claims_role = working_role) t
                order by coalesce(array_to_string(selected_columns, ','), '')
            loop
                working_selected_columns := cols_record.selected_columns;

                output = jsonb_build_object(
                    'schema', wal ->> 'schema',
                    'table', wal ->> 'table',
                    'type', action,
                    'commit_timestamp', to_char(
                        ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ),
                    'columns', (
                        select
                            jsonb_agg(
                                jsonb_build_object(
                                    'name', pa.attname,
                                    'type', pt.typname
                                )
                                order by pa.attnum asc
                            )
                        from
                            pg_attribute pa
                            join pg_type pt
                                on pa.atttypid = pt.oid
                            left join (
                                select unnest(conkey) as pkey_attnum
                                from pg_constraint
                                where conrelid = entity_ and contype = 'p'
                            ) pk on pk.pkey_attnum = pa.attnum
                        where
                            attrelid = entity_
                            and attnum > 0
                            and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
                            and (working_selected_columns is null or pa.attname = any(working_selected_columns) or pk.pkey_attnum is not null)
                    )
                )
                -- Add "record" key for insert and update
                || case
                    when action in ('INSERT', 'UPDATE') then
                        jsonb_build_object(
                            'record',
                            (
                                select
                                    jsonb_object_agg(
                                        -- if unchanged toast, get column name and value from old record
                                        coalesce((c).name, (oc).name),
                                        case
                                            when (c).name is null then (oc).value
                                            else (c).value
                                        end
                                    )
                                from
                                    unnest(columns) c
                                    full outer join unnest(old_columns) oc
                                        on (c).name = (oc).name
                                where
                                    coalesce((c).is_selectable, (oc).is_selectable)
                                    and (working_selected_columns is null or coalesce((c).name, (oc).name) = any(working_selected_columns) or coalesce((c).is_pkey, (oc).is_pkey))
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            )
                        )
                    else '{}'::jsonb
                end
                -- Add "old_record" key for update and delete
                || case
                    when action = 'UPDATE' then
                        jsonb_build_object(
                                'old_record',
                                (
                                    select jsonb_object_agg((c).name, (c).value)
                                    from unnest(old_columns) c
                                    where
                                        (c).is_selectable
                                        and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                        and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                )
                            )
                    when action = 'DELETE' then
                        jsonb_build_object(
                            'old_record',
                            (
                                select jsonb_object_agg((c).name, (c).value)
                                from unnest(old_columns) c
                                where
                                    (c).is_selectable
                                    and (working_selected_columns is null or (c).name = any(working_selected_columns) or (c).is_pkey)
                                    and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                                    and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                            )
                        )
                    else '{}'::jsonb
                end;

                -- Filter visible_role_sub_ids to those matching the current selected_columns group
                visible_to_subscription_ids = coalesce(
                    (
                        select array_agg(s.subscription_id)
                        from unnest(subscriptions) s
                        where s.claims_role = working_role
                          and (s.selected_columns is not distinct from working_selected_columns)
                          and s.subscription_id = any(visible_role_sub_ids)
                    ),
                    '{}'::uuid[]
                );

                return next (
                    output,
                    is_rls_enabled,
                    visible_to_subscription_ids,
                    case
                        when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                        else '{}'
                    end
                )::realtime.wal_rls;
            end loop;

        end if;
    end loop;

    perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
/*
Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
*/
declare
    op_symbol text = (
        case
            when op = 'eq' then '='
            when op = 'neq' then '!='
            when op = 'lt' then '<'
            when op = 'lte' then '<='
            when op = 'gt' then '>'
            when op = 'gte' then '>='
            when op = 'in' then '= any'
            else 'UNKNOWN OP'
        end
    );
    res boolean;
begin
    execute format(
        'select %L::'|| type_::text || ' ' || op_symbol
        || ' ( %L::'
        || (
            case
                when op = 'in' then type_::text || '[]'
                else type_::text end
        )
        || ')', val_1, val_2) into res;
    return res;
end;
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
declare
    op_symbol text;
    res boolean;
begin
    -- IS DISTINCT FROM / IS NOT DISTINCT FROM: infix, both sides typed literals
    if op = 'isdistinct' then
        execute format(
            'select %L::%s %s %L::%s',
            val_1,
            type_::text,
            case when negate then 'IS NOT DISTINCT FROM' else 'IS DISTINCT FROM' end,
            val_2,
            type_::text
        ) into res;
        return res;
    end if;

    -- IS requires a keyword RHS (NULL, TRUE, FALSE, UNKNOWN), not a typed literal
    if op = 'is' then
        if val_2 not in ('null', 'true', 'false', 'unknown') then
            raise exception 'invalid value for is filter: must be null, true, false, or unknown';
        end if;
        execute format(
            'select %L::%s %s %s',
            val_1,
            type_::text,
            case when negate then 'IS NOT' else 'IS' end,
            upper(val_2)
        ) into res;
        return res;
    end if;

    op_symbol = case
        when op = 'eq'    then '='
        when op = 'neq'   then '!='
        when op = 'lt'    then '<'
        when op = 'lte'   then '<='
        when op = 'gt'    then '>'
        when op = 'gte'   then '>='
        when op = 'in'    then '= any'
        when op = 'like'   then 'LIKE'
        when op = 'ilike'  then 'ILIKE'
        when op = 'match'  then '~'
        when op = 'imatch' then '~*'
        else null
    end;

    if op_symbol is null then
        raise exception 'unsupported equality operator: %', op::text;
    end if;

    execute format(
        'select %L::%s %s (%L::%s)',
        val_1,
        type_::text,
        op_symbol,
        val_2,
        case when op = 'in' then type_::text || '[]' else type_::text end
    ) into res;

    return case when negate then not res else res end;
end;
$$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select
        filters is null
        or array_length(filters, 1) is null
        or coalesce(
            count(col.name) = count(1)
            and sum(
                realtime.check_equality_op(
                    op:=f.op,
                    type_:=coalesce(col.type_oid::regtype, col.type_name::regtype),
                    val_1:=col.value #>> '{}',
                    val_2:=f.value,
                    negate:=coalesce(f.negate, false)
                )::int
            ) filter (where col.name is not null) = count(col.name),
            false
        )
    from
        unnest(filters) f
        left join unnest(columns) col
            on f.column_name = col.name;
$$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  SELECT
    realtime.wal2json_escape_identifier(nsp.nspname::text)
    || '.'
    || realtime.wal2json_escape_identifier(pc.relname::text)
  FROM pg_class pc
  JOIN pg_namespace nsp ON pc.relnamespace = nsp.oid
  WHERE pc.oid = entity
$$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: send_binary(bytea, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
BEGIN
  BEGIN
    generated_id := gen_random_uuid();

    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    INSERT INTO realtime.messages (id, binary_payload, event, topic, private, extension)
    VALUES (generated_id, payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'WarnSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
    col_names text[] = coalesce(
            array_agg(a.attname order by a.attnum),
            '{}'::text[]
        )
        from
            pg_catalog.pg_attribute a
        where
            a.attrelid = new.entity
            and a.attnum > 0
            and not a.attisdropped
            and pg_catalog.has_column_privilege(
                (new.claims ->> 'role'),
                a.attrelid,
                a.attnum,
                'SELECT'
            );
    filter realtime.user_defined_filter;
    col_type regtype;
    in_val jsonb;
    selected_col text;
begin
    for filter in select * from unnest(new.filters) loop
        if not filter.column_name = any(col_names) then
            raise exception 'invalid column for filter %', filter.column_name;
        end if;

        col_type = (
            select atttypid::regtype
            from pg_catalog.pg_attribute
            where attrelid = new.entity
                  and attname = filter.column_name
        );
        if col_type is null then
            raise exception 'failed to lookup type for column %', filter.column_name;
        end if;

        if filter.op = 'in'::realtime.equality_op then
            in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
            if coalesce(jsonb_array_length(in_val), 0) > 100 then
                raise exception 'too many values for `in` filter. Maximum 100';
            end if;
        elsif filter.op = 'is'::realtime.equality_op then
            -- `is` requires a keyword RHS rather than a typed literal
            if filter.value not in ('null', 'true', 'false', 'unknown') then
                raise exception 'invalid value for is filter: must be null, true, false, or unknown';
            end if;
            -- IS NULL works for any type, but IS TRUE/FALSE/UNKNOWN require a boolean
            -- operand. Reject the non-null keywords on non-boolean columns here so they
            -- don't abort apply_rls at WAL time.
            if filter.value <> 'null' and col_type <> 'boolean'::regtype then
                raise exception 'is % filter requires a boolean column, got %', filter.value, col_type::text;
            end if;
        elsif filter.op in ('like'::realtime.equality_op, 'ilike'::realtime.equality_op) then
            -- like/ilike apply the text pattern operator (~~); reject column types that
            -- have no such operator instead of failing at WAL time
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = '~~' and oprleft = col_type
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
        elsif filter.op in ('match'::realtime.equality_op, 'imatch'::realtime.equality_op) then
            -- match/imatch apply the regex operators ~ / ~*; reject column types that have
            -- no such operator (e.g. integer) instead of failing at WAL time, mirroring the
            -- like/ilike guard above.
            if not exists (
                select 1 from pg_catalog.pg_operator
                where oprname = case when filter.op = 'imatch'::realtime.equality_op then '~*' else '~' end
                  and oprleft = col_type
                  and oprright = col_type
                  and oprresult = 'boolean'::regtype
            ) then
                raise exception 'operator % requires a text-compatible column type, got %', filter.op::text, col_type::text;
            end if;
            -- validate the regex eagerly so a bad pattern is rejected here, not inside
            -- apply_rls where it would abort the WAL stream for the entity
            begin
                perform '' ~ filter.value;
            exception when others then
                raise exception 'invalid regular expression for % filter: %', filter.op::text, sqlerrm;
            end;
        else
            -- eq/neq/lt/lte/gt/gte: value must be coercable to the type
            perform realtime.cast(filter.value, col_type);
        end if;
    end loop;

    if new.selected_columns is not null then
        for selected_col in select * from unnest(new.selected_columns) loop
            if not selected_col = any(col_names) then
                raise exception 'invalid column for select %', selected_col;
            end if;
        end loop;
    end if;

    -- Apply consistent order to filters so the unique constraint can't be tricked by a
    -- different filter order. negate is part of the sort key.
    new.filters = coalesce(
        array_agg(f order by f.column_name, f.op, f.value, f.negate),
        '{}'
    ) from unnest(new.filters) f;

    new.selected_columns = (
        select array_agg(c order by c)
        from unnest(new.selected_columns) c
    );

    return new;
end;
$$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: wal2json_escape_identifier(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.wal2json_escape_identifier(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
  -- Prefix `\`, `,`, `.`, and any whitespace with `\`
  SELECT regexp_replace(name, '([\\,.[:space:]])', '\\\1', 'g')
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: ad_pubs_delete_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_pubs_delete_list (
    id uuid NOT NULL
);


--
-- Name: ad_stale_detour_tags_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_stale_detour_tags_backup (
    hcp_id uuid,
    therapeutic_area_id uuid,
    publication_count integer,
    assigned_at timestamp with time zone
);


--
-- Name: ad_yearly; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_yearly (
    hcp_id uuid,
    year integer,
    works integer
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    user_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    id boolean DEFAULT true NOT NULL,
    signups_enabled boolean DEFAULT true NOT NULL,
    global_signup_cap integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT app_config_singleton CHECK ((id = true))
);


--
-- Name: author_pub_flat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.author_pub_flat (
    author_id text,
    pub_id uuid,
    pub_year integer,
    source_ta_id uuid,
    display_name text,
    orcid text,
    institution text,
    institution_ror text
);


--
-- Name: canonical_hcps_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canonical_hcps_snapshot (
    id uuid,
    npi_number text,
    first_name text,
    last_name text,
    credentials text,
    institution text,
    city text,
    state text,
    zip_code text,
    country text,
    specialty text,
    subspecialty text,
    opt_out boolean,
    is_claimed boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    first_pub_year integer,
    total_career_pubs integer,
    institution_full text,
    twitter_handle text,
    twitter_followers integer,
    twitter_following integer,
    twitter_tweet_count integer,
    twitter_verified boolean,
    twitter_bio text,
    twitter_enriched_at timestamp with time zone,
    institution_short text,
    bluesky_handle text,
    bluesky_followers integer,
    bluesky_posts integer,
    bluesky_bio text,
    bluesky_enriched_at timestamp with time zone,
    scholar_h_index integer,
    scholar_citations_total integer,
    scholar_i10_index integer,
    scholar_enriched_at timestamp with time zone,
    social_verified boolean,
    social_verification_method text,
    social_verification_reasoning text,
    social_verified_at timestamp with time zone,
    alternative_affiliations jsonb,
    merged_from_count integer,
    merge_category text,
    merged_at timestamp with time zone,
    npi_taxonomy text,
    npi_specialty text,
    is_verified_dol boolean,
    affiliation_profile jsonb,
    clinician_score numeric,
    affiliation_classification text,
    affiliation_profile_calculated_at timestamp with time zone,
    source text,
    source_calculated_at timestamp with time zone,
    middle_name text,
    nppes_enumeration_date date,
    nppes_is_sole_proprietor text,
    nppes_practice_address text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_zip text,
    nppes_organization_name text,
    nppes_organization_npi text,
    nppes_organization_match_quality text,
    nppes_co_located_npi_count integer,
    nppes_practice_setting text,
    nppes_career_stage text,
    nppes_career_stage_years integer,
    nppes_enriched_at timestamp with time zone,
    openalex_author_id text,
    orcid text,
    openalex_resolved_at timestamp with time zone,
    openalex_resolution_method text,
    openalex_resolution_confidence text,
    openalex_institution_ror_id text,
    institution_state text,
    institution_state_code text,
    institution_country text,
    institution_geo_method text,
    institution_geo_confidence text,
    institution_geo_resolved_at timestamp with time zone,
    derived_state text,
    cohort_classification text,
    cohort_score numeric,
    snapshotted_at timestamp with time zone,
    preservation_reason text
);


--
-- Name: clean_dedup_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clean_dedup_map (
    duplicate_id uuid,
    canonical_id uuid,
    first_name text,
    last_name text
);


--
-- Name: clinical_trials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_trials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nct_id text NOT NULL,
    title text,
    phase text,
    status text,
    sponsor text,
    start_date date,
    completion_date date,
    ingested_at timestamp with time zone DEFAULT now(),
    locations jsonb,
    lead_sponsor_class text,
    study_type text,
    responsible_party_type text,
    collaborators jsonb,
    conditions jsonb,
    interventions jsonb
);


--
-- Name: clinical_trials_ta_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_trials_ta_v2 (
    trial_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    match_signal text NOT NULL,
    tagged_at timestamp with time zone DEFAULT now()
);


--
-- Name: clinical_trials_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_trials_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nct_id text NOT NULL,
    title text,
    phase text,
    status text,
    sponsor text,
    lead_sponsor_class text,
    study_type text,
    responsible_party_type text,
    start_date date,
    completion_date date,
    collaborators jsonb,
    conditions text[],
    interventions jsonb,
    source text DEFAULT 'clinicaltrials_gov_v2'::text NOT NULL,
    ingested_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: cohort_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cohort_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    cohort_classification text NOT NULL,
    reason text,
    override_added_by text,
    override_added_at timestamp with time zone DEFAULT now()
);


--
-- Name: community_practitioner_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_practitioner_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    npi_number text NOT NULL,
    total_payments_3yr numeric,
    payment_count_3yr integer,
    distinct_manufacturers integer,
    distinct_drugs integer,
    consulting_3yr numeric,
    speaker_3yr numeric,
    food_beverage_3yr numeric,
    travel_3yr numeric,
    education_3yr numeric,
    other_payments_3yr numeric,
    ad_drug_payments_3yr numeric,
    ad_drug_payment_count_3yr integer,
    top_manufacturers jsonb,
    top_drugs jsonb,
    payments_2022 numeric,
    payments_2023 numeric,
    payments_2024 numeric,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_practitioners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_practitioners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    npi_number text NOT NULL,
    first_name text,
    last_name text,
    middle_name text,
    name_suffix text,
    credentials text,
    primary_taxonomy_code text,
    primary_taxonomy_label text,
    practice_city text,
    practice_state text,
    practice_zip text,
    practice_address text,
    sex_code text,
    enumeration_date text,
    career_stage_years integer,
    is_sole_proprietor boolean,
    source text DEFAULT 'nppes_community'::text NOT NULL,
    matched_hcp_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: congress_abstracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.congress_abstracts (
    abstract_number text NOT NULL,
    congress_slug text NOT NULL,
    speaker_display_name text,
    speaker_key text,
    session_title text,
    session_type text,
    presentation_title text,
    tracks text,
    presentation_start timestamp with time zone,
    presentation_end timestamp with time zone,
    presentation_timezone text,
    is_lung boolean DEFAULT false NOT NULL,
    is_breast boolean DEFAULT false NOT NULL
);


--
-- Name: congress_confirmed_presenters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.congress_confirmed_presenters (
    congress_slug text NOT NULL,
    speaker_key text NOT NULL,
    speaker_display_name text NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    established_rank integer,
    rising_rank integer,
    matched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: curated_ta_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curated_ta_concepts (
    therapeutic_area_id uuid NOT NULL,
    openalex_concept_id text NOT NULL,
    display_name text NOT NULL,
    concept_level integer,
    notes text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: dedup_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dedup_map (
    duplicate_id uuid,
    canonical_id uuid,
    first_name text,
    last_name text
);


--
-- Name: dedup_merge_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dedup_merge_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_hcp_id uuid NOT NULL,
    merged_hcp_id uuid NOT NULL,
    merge_pass text NOT NULL,
    merge_signals jsonb,
    merged_at timestamp with time zone DEFAULT now(),
    original_canonical_data jsonb,
    original_merged_data jsonb,
    fk_updates_count jsonb
);


--
-- Name: dol_canonical_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dol_canonical_overrides (
    hcp_id uuid NOT NULL,
    social_user_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text
);


--
-- Name: dol_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dol_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    social_user_id uuid,
    match_confidence text NOT NULL,
    match_signals jsonb,
    matched_at timestamp with time zone DEFAULT now(),
    verified_by_human boolean DEFAULT false,
    CONSTRAINT dol_matches_match_confidence_check CHECK ((match_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'manual_review'::text, 'rejected'::text])))
);


--
-- Name: dol_matches_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dol_matches_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    social_user_id uuid,
    match_confidence text NOT NULL,
    match_signals jsonb,
    matched_at timestamp with time zone DEFAULT now(),
    verified_by_human boolean DEFAULT false
);


--
-- Name: excluded_institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excluded_institutions (
    id integer NOT NULL,
    match_type text NOT NULL,
    match_value text NOT NULL,
    category text NOT NULL,
    notes text,
    added_at timestamp with time zone DEFAULT now(),
    CONSTRAINT excluded_institutions_match_type_check CHECK ((match_type = ANY (ARRAY['exact'::text, 'pattern'::text])))
);


--
-- Name: excluded_institutions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.excluded_institutions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: excluded_institutions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.excluded_institutions_id_seq OWNED BY public.excluded_institutions.id;


--
-- Name: excluded_taxonomies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excluded_taxonomies (
    taxonomy_code text NOT NULL,
    specialty_label text,
    exclusion_category text NOT NULL,
    exclusion_reason text,
    applies_to_cohorts text[] DEFAULT ARRAY['rising_star'::text, 'community'::text, 'workhorse'::text] NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_affiliation_profile_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_affiliation_profile_v2 (
    hcp_id uuid NOT NULL,
    affiliation_profile jsonb,
    clinician_score numeric,
    affiliation_classification text,
    profile_version text,
    affiliation_profile_calculated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid
);


--
-- Name: TABLE hcp_affiliation_profile_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hcp_affiliation_profile_v2 IS 'Affiliation classification derived from publication authorships. Sidecar to hcps_v2: kept separate because classification is computed analysis, not core HCP identity. Matches pattern of hcp_nppes_detail_v2, hcp_open_payments_summary_v2.';


--
-- Name: COLUMN hcp_affiliation_profile_v2.clinician_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_affiliation_profile_v2.clinician_score IS 'Ratio of clinical signals to total signals (clinical+research). Null when insufficient data or industry-classified.';


--
-- Name: COLUMN hcp_affiliation_profile_v2.affiliation_classification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_affiliation_profile_v2.affiliation_classification IS 'One of: clinician, mixed, researcher, industry, insufficient_data';


--
-- Name: hcp_ai_overviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_ai_overviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    synthesis_type text DEFAULT 'overview'::text NOT NULL,
    therapeutic_area text NOT NULL,
    body text NOT NULL,
    model_used text,
    prompt_tokens integer,
    completion_tokens integer,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hcp_author_metrics_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_author_metrics_v2 (
    hcp_id uuid NOT NULL,
    openalex_author_id text NOT NULL,
    snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
    cited_by_count integer,
    works_count integer,
    h_index integer,
    i10_index integer,
    counts_by_year jsonb,
    two_yr_mean_citedness numeric,
    enrichment_run_id uuid,
    fetch_status text,
    fetch_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    data_quality_flags jsonb
);


--
-- Name: TABLE hcp_author_metrics_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hcp_author_metrics_v2 IS 'Time-stamped snapshots of OpenAlex author metrics. Primary citation/h-index source for FieldMark. One row per HCP per enrichment run date.';


--
-- Name: COLUMN hcp_author_metrics_v2.cited_by_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.cited_by_count IS 'Lifetime citation count from OpenAlex. Source: author.cited_by_count';


--
-- Name: COLUMN hcp_author_metrics_v2.works_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.works_count IS 'Lifetime peer-reviewed publication count from OpenAlex. Source: author.works_count';


--
-- Name: COLUMN hcp_author_metrics_v2.h_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.h_index IS 'h-index from OpenAlex, computed on the peer-reviewed corpus. Source: author.summary_stats.h_index';


--
-- Name: COLUMN hcp_author_metrics_v2.i10_index; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.i10_index IS 'i10-index (publications with 10+ citations) from OpenAlex. Source: author.summary_stats.i10_index';


--
-- Name: COLUMN hcp_author_metrics_v2.counts_by_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.counts_by_year IS 'Per-year citation curve from OpenAlex, last 10 years. Source: author.counts_by_year (JSON array of {year, works_count, cited_by_count})';


--
-- Name: COLUMN hcp_author_metrics_v2.two_yr_mean_citedness; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.two_yr_mean_citedness IS '2-year mean citedness from OpenAlex. Source: author.summary_stats.2yr_mean_citedness';


--
-- Name: COLUMN hcp_author_metrics_v2.fetch_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.fetch_status IS 'Status of this snapshot fetch: "ok", "not_found" (author ID returned 404), "error" (other failure). NULL means snapshot is valid.';


--
-- Name: COLUMN hcp_author_metrics_v2.fetch_error; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.fetch_error IS 'Error detail when fetch_status is "error". For debugging failed enrichment runs.';


--
-- Name: COLUMN hcp_author_metrics_v2.data_quality_flags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_author_metrics_v2.data_quality_flags IS 'Structured data quality assessment per snapshot. Pipeline computes multiple checks (conflation, plausibility, completeness) and stores results here. Shape: {conflation_suspected: bool, checks_failed: [string], pubs_per_year: float, computed_at: timestamp}. NULL means no checks failed or checks not yet run.';


--
-- Name: hcp_author_metrics_for_cards_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_author_metrics_for_cards_v2 WITH (security_invoker='true') AS
 SELECT DISTINCT ON (hcp_id) hcp_id,
    openalex_author_id,
    snapshot_date,
    cited_by_count,
    works_count,
    h_index,
    i10_index,
    counts_by_year,
    two_yr_mean_citedness,
    enrichment_run_id,
    fetch_status,
    data_quality_flags,
    created_at
   FROM public.hcp_author_metrics_v2
  WHERE ((fetch_status IS NULL) OR (fetch_status = 'ok'::text))
  ORDER BY hcp_id, snapshot_date DESC;


--
-- Name: hcp_author_metrics_latest_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_author_metrics_latest_v2 WITH (security_invoker='true') AS
 SELECT DISTINCT ON (hcp_id) hcp_id,
    openalex_author_id,
    snapshot_date,
    cited_by_count,
    works_count,
    h_index,
    i10_index,
    counts_by_year,
    two_yr_mean_citedness,
    enrichment_run_id,
    fetch_status,
    data_quality_flags,
    created_at
   FROM public.hcp_author_metrics_v2
  WHERE (((fetch_status IS NULL) OR (fetch_status = 'ok'::text)) AND ((data_quality_flags IS NULL) OR (((data_quality_flags ->> 'conflation_suspected'::text))::boolean IS NOT TRUE)))
  ORDER BY hcp_id, snapshot_date DESC;


--
-- Name: VIEW hcp_author_metrics_latest_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.hcp_author_metrics_latest_v2 IS 'Latest valid snapshot per HCP. Excludes rows with fetch_status=error/not_found and rows flagged conflation_suspected. Read by frontend API functions.';


--
-- Name: hcp_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    submitted_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    CONSTRAINT hcp_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: hcp_cohort_classification_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_cohort_classification_v2 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    cohort text NOT NULL,
    cohort_reason text NOT NULL,
    career_first_pub_year_v2 integer,
    total_career_pubs integer,
    career_age integer,
    tier_inputs jsonb NOT NULL,
    threshold_version text NOT NULL,
    classified_at timestamp with time zone NOT NULL,
    classification_run_id uuid NOT NULL
);


--
-- Name: hcp_community_scores_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_community_scores_v2 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    composite_score numeric,
    normalized_score numeric,
    pharma_engagement_score numeric,
    engagement_breadth_score numeric,
    medicare_volume_score numeric,
    career_stage_score numeric,
    scored_at timestamp with time zone DEFAULT now(),
    scoring_run_id uuid,
    patient_volume_signal numeric,
    pharma_signal numeric,
    group_practice_signal numeric,
    career_years_signal numeric,
    publication_signal numeric,
    patient_volume numeric,
    pharma_engagement numeric,
    career_years numeric
);


--
-- Name: hcps_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_hash text,
    npi_number text,
    orcid text,
    first_name text,
    middle_name text,
    last_name text NOT NULL,
    name_suffix text,
    preferred_display_name text,
    institution_normalized text,
    institution_raw text,
    institution_secondary text,
    institution_history jsonb,
    country text DEFAULT 'USA'::text,
    career_first_pub_year integer,
    total_career_pubs integer,
    latest_pub_year integer,
    identity_confidence_score numeric,
    identity_method text,
    quality_flags text[] DEFAULT ARRAY[]::text[],
    cohort_classification text,
    cohort_score numeric,
    is_verified_dol boolean DEFAULT false,
    verified_dol_at timestamp with time zone,
    npi_specialty text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_setting text,
    nppes_career_stage_years integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid,
    last_name_lower text GENERATED ALWAYS AS (lower(last_name)) STORED,
    state_lower text GENERATED ALWAYS AS (lower(nppes_practice_state)) STORED,
    credentials text,
    nppes_practice_zip text,
    nppes_enriched_at timestamp with time zone,
    npi_taxonomy text,
    career_first_pub_year_v2 integer,
    career_age_years integer GENERATED ALWAYS AS (
CASE
    WHEN ((latest_pub_year IS NOT NULL) AND (career_first_pub_year_v2 IS NOT NULL)) THEN ((latest_pub_year - career_first_pub_year_v2) + 1)
    ELSE NULL::integer
END) STORED,
    nih_profile_id bigint,
    institution_canonical text,
    derived_state text
);


--
-- Name: COLUMN hcps_v2.identity_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcps_v2.identity_hash IS 'Dedup fingerprint, populated post-creation by enrichment passes. NOT a stable identity — id (UUID) is the only stable identifier. May be recomputed when NPI/canonical fields change.';


--
-- Name: COLUMN hcps_v2.credentials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcps_v2.credentials IS 'Professional credentials string from NPPES (e.g., MD, DO, PhD, MD PhD).';


--
-- Name: hcp_community_ranks_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_community_ranks_v2 WITH (security_invoker='true') AS
 WITH global_ranks AS (
         SELECT c.hcp_id,
            c.therapeutic_area_id,
            c.composite_score,
            c.normalized_score,
            c.patient_volume,
            c.pharma_engagement,
            c.group_practice_signal,
            c.career_years,
            c.publication_signal,
            h.country,
            h.first_name,
            h.last_name,
            h.institution_normalized,
            h.career_first_pub_year,
            h.total_career_pubs,
            h.nppes_career_stage_years,
            h.nppes_practice_city,
            h.nppes_practice_state,
            h.nppes_practice_setting,
            h.npi_specialty,
            'global'::text AS scope_type,
            NULL::text AS scope_value,
            (row_number() OVER (PARTITION BY c.therapeutic_area_id ORDER BY c.normalized_score DESC))::integer AS rank,
            (count(*) OVER (PARTITION BY c.therapeutic_area_id))::integer AS scope_size
           FROM (public.hcp_community_scores_v2 c
             JOIN public.hcps_v2 h ON ((h.id = c.hcp_id)))
        ), region_ranks AS (
         SELECT c.hcp_id,
            c.therapeutic_area_id,
            c.composite_score,
            c.normalized_score,
            c.patient_volume,
            c.pharma_engagement,
            c.group_practice_signal,
            c.career_years,
            c.publication_signal,
            h.country,
            h.first_name,
            h.last_name,
            h.institution_normalized,
            h.career_first_pub_year,
            h.total_career_pubs,
            h.nppes_career_stage_years,
            h.nppes_practice_city,
            h.nppes_practice_state,
            h.nppes_practice_setting,
            h.npi_specialty,
            'region'::text AS scope_type,
            h.country AS scope_value,
            (row_number() OVER (PARTITION BY c.therapeutic_area_id, h.country ORDER BY c.normalized_score DESC))::integer AS rank,
            (count(*) OVER (PARTITION BY c.therapeutic_area_id, h.country))::integer AS scope_size
           FROM (public.hcp_community_scores_v2 c
             JOIN public.hcps_v2 h ON ((h.id = c.hcp_id)))
          WHERE (h.country IS NOT NULL)
        )
 SELECT global_ranks.hcp_id,
    global_ranks.therapeutic_area_id,
    global_ranks.composite_score,
    global_ranks.normalized_score,
    global_ranks.patient_volume,
    global_ranks.pharma_engagement,
    global_ranks.group_practice_signal,
    global_ranks.career_years,
    global_ranks.publication_signal,
    global_ranks.country,
    global_ranks.first_name,
    global_ranks.last_name,
    global_ranks.institution_normalized,
    global_ranks.career_first_pub_year,
    global_ranks.total_career_pubs,
    global_ranks.nppes_career_stage_years,
    global_ranks.nppes_practice_city,
    global_ranks.nppes_practice_state,
    global_ranks.nppes_practice_setting,
    global_ranks.npi_specialty,
    global_ranks.scope_type,
    global_ranks.scope_value,
    global_ranks.rank,
    global_ranks.scope_size
   FROM global_ranks
UNION ALL
 SELECT region_ranks.hcp_id,
    region_ranks.therapeutic_area_id,
    region_ranks.composite_score,
    region_ranks.normalized_score,
    region_ranks.patient_volume,
    region_ranks.pharma_engagement,
    region_ranks.group_practice_signal,
    region_ranks.career_years,
    region_ranks.publication_signal,
    region_ranks.country,
    region_ranks.first_name,
    region_ranks.last_name,
    region_ranks.institution_normalized,
    region_ranks.career_first_pub_year,
    region_ranks.total_career_pubs,
    region_ranks.nppes_career_stage_years,
    region_ranks.nppes_practice_city,
    region_ranks.nppes_practice_state,
    region_ranks.nppes_practice_setting,
    region_ranks.npi_specialty,
    region_ranks.scope_type,
    region_ranks.scope_value,
    region_ranks.rank,
    region_ranks.scope_size
   FROM region_ranks;


--
-- Name: hcp_community_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_community_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date date NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_value text,
    rank integer,
    composite_score numeric,
    normalized_score numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_established_scores_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_established_scores_v2 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    composite_score numeric,
    normalized_score numeric,
    pub_volume_score numeric,
    recent_productivity_score numeric,
    lead_density_score numeric,
    trial_score numeric,
    career_length_score numeric,
    pharma_breadth_score numeric,
    pharma_weight_applied boolean,
    scored_at timestamp with time zone DEFAULT now(),
    scoring_run_id uuid
);


--
-- Name: hcp_established_ranks_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_established_ranks_v2 WITH (security_invoker='true') AS
 WITH global_ranks AS (
         SELECT e.hcp_id,
            e.therapeutic_area_id,
            e.composite_score,
            e.normalized_score,
            e.pub_volume_score,
            e.recent_productivity_score,
            e.lead_density_score,
            e.trial_score,
            e.career_length_score,
            e.pharma_breadth_score,
            h.country,
            h.first_name,
            h.last_name,
            h.institution_normalized,
            h.career_first_pub_year,
            h.total_career_pubs,
            'global'::text AS scope_type,
            NULL::text AS scope_value,
            (row_number() OVER (PARTITION BY e.therapeutic_area_id ORDER BY e.normalized_score DESC))::integer AS rank,
            (count(*) OVER (PARTITION BY e.therapeutic_area_id))::integer AS scope_size
           FROM (public.hcp_established_scores_v2 e
             JOIN public.hcps_v2 h ON ((h.id = e.hcp_id)))
        ), region_ranks AS (
         SELECT e.hcp_id,
            e.therapeutic_area_id,
            e.composite_score,
            e.normalized_score,
            e.pub_volume_score,
            e.recent_productivity_score,
            e.lead_density_score,
            e.trial_score,
            e.career_length_score,
            e.pharma_breadth_score,
            h.country,
            h.first_name,
            h.last_name,
            h.institution_normalized,
            h.career_first_pub_year,
            h.total_career_pubs,
            'region'::text AS scope_type,
            h.country AS scope_value,
            (row_number() OVER (PARTITION BY e.therapeutic_area_id, h.country ORDER BY e.normalized_score DESC))::integer AS rank,
            (count(*) OVER (PARTITION BY e.therapeutic_area_id, h.country))::integer AS scope_size
           FROM (public.hcp_established_scores_v2 e
             JOIN public.hcps_v2 h ON ((h.id = e.hcp_id)))
          WHERE (h.country IS NOT NULL)
        )
 SELECT global_ranks.hcp_id,
    global_ranks.therapeutic_area_id,
    global_ranks.composite_score,
    global_ranks.normalized_score,
    global_ranks.pub_volume_score,
    global_ranks.recent_productivity_score,
    global_ranks.lead_density_score,
    global_ranks.trial_score,
    global_ranks.career_length_score,
    global_ranks.pharma_breadth_score,
    global_ranks.country,
    global_ranks.first_name,
    global_ranks.last_name,
    global_ranks.institution_normalized,
    global_ranks.career_first_pub_year,
    global_ranks.total_career_pubs,
    global_ranks.scope_type,
    global_ranks.scope_value,
    global_ranks.rank,
    global_ranks.scope_size
   FROM global_ranks
UNION ALL
 SELECT region_ranks.hcp_id,
    region_ranks.therapeutic_area_id,
    region_ranks.composite_score,
    region_ranks.normalized_score,
    region_ranks.pub_volume_score,
    region_ranks.recent_productivity_score,
    region_ranks.lead_density_score,
    region_ranks.trial_score,
    region_ranks.career_length_score,
    region_ranks.pharma_breadth_score,
    region_ranks.country,
    region_ranks.first_name,
    region_ranks.last_name,
    region_ranks.institution_normalized,
    region_ranks.career_first_pub_year,
    region_ranks.total_career_pubs,
    region_ranks.scope_type,
    region_ranks.scope_value,
    region_ranks.rank,
    region_ranks.scope_size
   FROM region_ranks;


--
-- Name: hcp_established_ranks_v3; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_established_ranks_v3 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_value text,
    rank integer NOT NULL,
    cohort_score numeric NOT NULL,
    scientific_influence_pctile numeric,
    network_influence_pctile numeric,
    pharma_engagement_pctile numeric,
    computed_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_established_ranks_v3_nsclc_contaminated_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_established_ranks_v3_nsclc_contaminated_backup (
    id uuid,
    hcp_id uuid,
    therapeutic_area_id uuid,
    scope_type text,
    scope_value text,
    rank integer,
    cohort_score numeric,
    scientific_influence_pctile numeric,
    network_influence_pctile numeric,
    pharma_engagement_pctile numeric,
    computed_at timestamp with time zone
);


--
-- Name: hcp_established_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_established_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date date NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_value text,
    us_rank integer,
    cohort_score numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_industry_classification_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_industry_classification_v1 (
    hcp_id uuid NOT NULL,
    classification text NOT NULL,
    confidence text NOT NULL,
    match_method text NOT NULL,
    matched_pattern text,
    matched_institution text,
    classified_at timestamp with time zone DEFAULT now() NOT NULL,
    run_id uuid NOT NULL,
    CONSTRAINT hcp_industry_classification_v1_classification_check CHECK ((classification = ANY (ARRAY['ACADEMIC'::text, 'INDUSTRY'::text, 'GOVERNMENT'::text, 'UNKNOWN'::text]))),
    CONSTRAINT hcp_industry_classification_v1_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: hcp_institutions_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_institutions_v2 (
    hcp_id uuid NOT NULL,
    reference_institution_id uuid NOT NULL,
    match_pattern text NOT NULL,
    match_source text NOT NULL,
    match_confidence numeric NOT NULL,
    linked_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_leadership_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_leadership_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    tier integer NOT NULL,
    role_type text NOT NULL,
    role_title text NOT NULL,
    organization text,
    snippet text,
    source_url text NOT NULL,
    source_domain text NOT NULL,
    confidence numeric NOT NULL,
    extraction_model text,
    therapeutic_area text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_verified_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    enrichment_run_id uuid,
    CONSTRAINT hcp_leadership_evidence_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- Name: hcp_medicare_by_ta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_medicare_by_ta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    ta_beneficiaries_3yr_high_confidence integer,
    ta_services_3yr_high_confidence integer,
    ta_payments_3yr_high_confidence numeric,
    ta_distinct_codes_3yr_high_confidence integer,
    ta_beneficiaries_3yr_total integer,
    ta_services_3yr_total integer,
    ta_payments_3yr_total numeric,
    ta_distinct_codes_3yr_total integer,
    ta_drug_admin_volume_3yr integer,
    ta_procedure_volume_3yr integer,
    ta_beneficiaries_yoy_trend_pct numeric,
    calculated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_medicare_by_ta_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_medicare_by_ta_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    ta_beneficiaries_3yr_high_confidence integer,
    ta_services_3yr_high_confidence integer,
    ta_payments_3yr_high_confidence numeric,
    ta_distinct_codes_3yr_high_confidence integer,
    ta_beneficiaries_3yr_total integer,
    ta_services_3yr_total integer,
    ta_payments_3yr_total numeric,
    ta_distinct_codes_3yr_total integer,
    ta_drug_admin_volume_3yr integer,
    ta_procedure_volume_3yr integer,
    ta_beneficiaries_yoy_trend_pct numeric,
    aggregated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid
);


--
-- Name: hcp_medicare_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_medicare_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    npi text,
    total_beneficiaries_3yr integer,
    total_beneficiaries_3yr_unique_est integer,
    total_services_3yr integer,
    total_medicare_payment_3yr numeric,
    total_distinct_hcpcs_codes_3yr integer,
    beneficiaries_2021 integer,
    beneficiaries_2022 integer,
    beneficiaries_2023 integer,
    beneficiaries_yoy_trend_pct numeric,
    primary_place_of_service text,
    predominant_specialty text,
    predominant_state text,
    predominant_ruca text,
    top_hcpcs_codes text[],
    medicare_calculated_at timestamp with time zone DEFAULT now(),
    medicare_program_years integer[]
);


--
-- Name: hcp_medicare_summary_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_medicare_summary_v2 (
    hcp_id uuid NOT NULL,
    total_beneficiaries_3yr_unique_est integer,
    beneficiaries_2021 integer,
    beneficiaries_2022 integer,
    beneficiaries_2023 integer,
    total_services_3yr integer,
    drug_services_3yr integer,
    aggregated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid,
    npi text,
    total_beneficiaries_3yr integer,
    total_medicare_payment_3yr numeric,
    total_distinct_hcpcs_codes_3yr integer,
    beneficiaries_yoy_trend_pct numeric,
    primary_place_of_service text,
    predominant_specialty text,
    predominant_state text,
    predominant_ruca text,
    top_hcpcs_codes text[],
    medicare_calculated_at timestamp with time zone,
    medicare_program_years integer[]
);


--
-- Name: hcp_narratives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_narratives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid,
    narrative text,
    why_now text,
    generated_at timestamp with time zone DEFAULT now(),
    model_version text,
    engagement_angle text,
    signal_strength text,
    caution_flags text
);


--
-- Name: hcp_narratives_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_narratives_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_slug text NOT NULL,
    narrative_text text NOT NULL,
    prompt_version text NOT NULL,
    model_used text,
    generated_at timestamp with time zone DEFAULT now(),
    why_now text,
    engagement_angle text,
    signal_strength text,
    caution_flags text[] DEFAULT ARRAY[]::text[]
);


--
-- Name: COLUMN hcp_narratives_v2.why_now; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_narratives_v2.why_now IS 'Most important field — explains current timing signal for engagement.';


--
-- Name: COLUMN hcp_narratives_v2.engagement_angle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_narratives_v2.engagement_angle IS 'Suggested approach or topic for MSL engagement.';


--
-- Name: COLUMN hcp_narratives_v2.signal_strength; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_narratives_v2.signal_strength IS 'Qualitative strength assessment of the rising-star signal.';


--
-- Name: COLUMN hcp_narratives_v2.caution_flags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_narratives_v2.caution_flags IS 'Array of caveats or risks for this HCP profile.';


--
-- Name: hcp_network_centrality_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_network_centrality_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    window_type text NOT NULL,
    degree_centrality_weighted numeric,
    eigenvector_centrality numeric,
    betweenness_centrality numeric,
    degree_percentile integer,
    eigenvector_percentile integer,
    betweenness_percentile integer,
    network_influence_score numeric,
    collaborator_count integer,
    total_collaboration_weight numeric,
    computed_at timestamp with time zone DEFAULT now(),
    enrichment_run_id uuid
);


--
-- Name: hcp_network_momentum_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_network_momentum_v1 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    early_window_type text NOT NULL,
    recent_window_type text NOT NULL,
    early_collaborator_count integer,
    recent_collaborator_count integer,
    early_degree_percentile numeric,
    recent_degree_percentile numeric,
    degree_delta numeric,
    early_eigenvector_percentile numeric,
    recent_eigenvector_percentile numeric,
    eigenvector_delta numeric,
    early_betweenness_percentile numeric,
    recent_betweenness_percentile numeric,
    betweenness_delta numeric,
    degree_delta_percentile numeric,
    eigenvector_delta_percentile numeric,
    betweenness_delta_percentile numeric,
    network_momentum_raw numeric,
    network_momentum_percentile numeric,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    enrichment_run_id uuid
);


--
-- Name: hcp_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid,
    composite_score double precision,
    pub_velocity_score double precision,
    citation_trajectory_score double precision,
    trial_investigator_score double precision,
    congress_score double precision,
    msl_signal_score double precision,
    score_version text,
    calculated_at timestamp with time zone DEFAULT now(),
    normalized_score double precision,
    tier text
);


--
-- Name: hcp_normalized_scores; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_normalized_scores WITH (security_invoker='true') AS
 SELECT hcp_id,
    therapeutic_area_id,
    composite_score AS raw_score,
    round(((percent_rank() OVER (PARTITION BY therapeutic_area_id ORDER BY composite_score))::numeric * (100)::numeric), 2) AS normalized_score,
    pub_velocity_score,
    citation_trajectory_score,
    trial_investigator_score,
    congress_score,
    msl_signal_score,
    calculated_at,
    tier
   FROM public.hcp_scores;


--
-- Name: hcp_nppes_detail_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_nppes_detail_v2 (
    hcp_id uuid NOT NULL,
    nppes_enumeration_date date,
    nppes_is_sole_proprietor boolean,
    nppes_practice_address text,
    nppes_practice_zip text,
    nppes_organization_name text,
    nppes_organization_npi text,
    nppes_organization_match_quality text,
    nppes_co_located_npi_count integer,
    nppes_career_stage text,
    npi_taxonomy text,
    npi_taxonomy_enrichment_status text,
    npi_taxonomy_enriched_at timestamp with time zone,
    nppes_enriched_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid,
    nppes_mailing_address jsonb,
    nppes_taxonomies jsonb,
    nppes_other_names jsonb,
    nppes_identifiers jsonb,
    nppes_endpoints jsonb,
    raw_api_response jsonb
);


--
-- Name: hcp_open_payments_by_drug_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_by_drug_v2 (
    hcp_id uuid NOT NULL,
    drug_name text NOT NULL,
    manufacturer_name text NOT NULL,
    total_amount_usd numeric DEFAULT 0 NOT NULL,
    payment_count integer DEFAULT 0 NOT NULL,
    most_recent_payment_date date,
    year_over_year_trend_pct numeric,
    py2022_total numeric DEFAULT 0,
    py2023_total numeric DEFAULT 0,
    py2024_total numeric DEFAULT 0,
    payments_by_quarter jsonb
);


--
-- Name: hcp_open_payments_by_ta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_by_ta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    ta_payments_3yr numeric,
    ta_payments_count_3yr integer,
    ta_distinct_drugs_3yr integer,
    ta_distinct_companies_3yr integer,
    ta_speaker_bureau_3yr numeric,
    ta_consulting_3yr numeric,
    ta_honoraria_3yr numeric,
    calculated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_open_payments_by_ta_backup_20260520; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_by_ta_backup_20260520 (
    id uuid,
    hcp_id uuid,
    therapeutic_area_id uuid,
    ta_payments_3yr numeric,
    ta_payments_count_3yr integer,
    ta_distinct_drugs_3yr integer,
    ta_distinct_companies_3yr integer,
    ta_speaker_bureau_3yr numeric,
    ta_consulting_3yr numeric,
    ta_honoraria_3yr numeric,
    calculated_at timestamp with time zone
);


--
-- Name: hcp_open_payments_by_ta_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_by_ta_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    ta_payments_3yr numeric,
    ta_payments_count_3yr integer,
    ta_distinct_drugs_3yr integer,
    ta_distinct_companies_3yr integer,
    ta_speaker_bureau_3yr numeric,
    ta_consulting_3yr numeric,
    ta_honoraria_3yr numeric,
    aggregated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid
);


--
-- Name: hcp_open_payments_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    npi text,
    total_payments_lifetime numeric,
    total_payments_count_lifetime integer,
    distinct_companies_lifetime integer,
    total_payments_3yr numeric,
    speaker_bureau_3yr numeric,
    consulting_3yr numeric,
    honoraria_3yr numeric,
    education_3yr numeric,
    royalty_3yr numeric,
    food_beverage_3yr numeric,
    travel_lodging_3yr numeric,
    year_over_year_trend_pct numeric,
    most_recent_payment_date date,
    py2022_total numeric,
    py2023_total numeric,
    py2024_total numeric,
    open_payments_calculated_at timestamp with time zone DEFAULT now(),
    open_payments_version text,
    open_payments_program_years integer[]
);


--
-- Name: hcp_open_payments_summary_backup_20260520; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_summary_backup_20260520 (
    id uuid,
    hcp_id uuid,
    npi text,
    total_payments_lifetime numeric,
    total_payments_count_lifetime integer,
    distinct_companies_lifetime integer,
    total_payments_3yr numeric,
    speaker_bureau_3yr numeric,
    consulting_3yr numeric,
    honoraria_3yr numeric,
    education_3yr numeric,
    royalty_3yr numeric,
    food_beverage_3yr numeric,
    travel_lodging_3yr numeric,
    year_over_year_trend_pct numeric,
    most_recent_payment_date date,
    py2022_total numeric,
    py2023_total numeric,
    py2024_total numeric,
    open_payments_calculated_at timestamp with time zone,
    open_payments_version text,
    open_payments_program_years integer[]
);


--
-- Name: hcp_open_payments_summary_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_summary_v2 (
    hcp_id uuid NOT NULL,
    distinct_companies_lifetime integer,
    total_payments_lifetime numeric,
    py2022_total numeric,
    py2023_total numeric,
    py2024_total numeric,
    speaker_bureau_3yr numeric,
    consulting_3yr numeric,
    honoraria_3yr numeric,
    education_3yr numeric,
    royalty_3yr numeric,
    food_beverage_3yr numeric,
    travel_lodging_3yr numeric,
    aggregated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid,
    total_payments_3yr numeric,
    total_payments_count_lifetime integer,
    most_recent_payment_date date,
    year_over_year_trend_pct numeric
);


--
-- Name: hcp_open_payments_top_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_top_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    manufacturer_name text NOT NULL,
    total_amount_usd numeric DEFAULT 0 NOT NULL,
    payment_count integer DEFAULT 0 NOT NULL,
    most_recent_payment_date date,
    rank_by_amount integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_open_payments_top_companies_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_open_payments_top_companies_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    manufacturer_name text NOT NULL,
    total_amount_usd numeric DEFAULT 0 NOT NULL,
    payment_count integer DEFAULT 0 NOT NULL,
    most_recent_payment_date date,
    rank_by_amount integer NOT NULL,
    aggregated_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid
);


--
-- Name: hcp_openalex_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_openalex_authors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    openalex_author_id text NOT NULL,
    is_primary boolean DEFAULT false,
    match_status text NOT NULL,
    match_confidence text NOT NULL,
    match_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_openalex_authors_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_openalex_authors_v2 (
    hcp_id uuid NOT NULL,
    openalex_author_id text NOT NULL,
    is_primary boolean DEFAULT false,
    match_confidence numeric NOT NULL,
    match_method text NOT NULL,
    first_seen_pub_year integer,
    last_seen_pub_year integer,
    corpus_pub_count integer,
    linked_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_openalex_authors_v2_pre_cycletest_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_openalex_authors_v2_pre_cycletest_20260720 (
    hcp_id uuid,
    openalex_author_id text,
    is_primary boolean,
    match_confidence numeric,
    match_method text,
    first_seen_pub_year integer,
    last_seen_pub_year integer,
    corpus_pub_count integer,
    linked_at timestamp with time zone
);


--
-- Name: hcp_pharma_engagement_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_pharma_engagement_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    total_payments_3yr numeric,
    distinct_companies_3yr integer,
    distinct_drugs_3yr integer,
    payment_count_3yr integer,
    raw_score numeric,
    percentile_rank numeric,
    computed_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_publication_leadership_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_publication_leadership_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid,
    senior_pub_count integer DEFAULT 0,
    senior_pub_total_citations integer DEFAULT 0,
    senior_pub_recent_5yr integer DEFAULT 0,
    first_pub_count integer DEFAULT 0,
    first_pub_total_citations integer DEFAULT 0,
    guideline_pub_count integer DEFAULT 0,
    guideline_pub_senior integer DEFAULT 0,
    guideline_pub_first integer DEFAULT 0,
    editorial_senior_count integer DEFAULT 0,
    review_senior_count integer DEFAULT 0,
    raw_score numeric,
    normalized_score numeric,
    computed_at timestamp with time zone DEFAULT now(),
    percentile_rank double precision
);


--
-- Name: hcp_publication_leadership_v2_nsclc_presweep_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_publication_leadership_v2_nsclc_presweep_backup (
    id uuid,
    hcp_id uuid,
    therapeutic_area_id uuid,
    senior_pub_count integer,
    senior_pub_total_citations integer,
    senior_pub_recent_5yr integer,
    first_pub_count integer,
    first_pub_total_citations integer,
    guideline_pub_count integer,
    guideline_pub_senior integer,
    guideline_pub_first integer,
    editorial_senior_count integer,
    review_senior_count integer,
    raw_score numeric,
    normalized_score numeric,
    computed_at timestamp with time zone,
    percentile_rank double precision
);


--
-- Name: hcp_research_themes_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_research_themes_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    theme_name text NOT NULL,
    centrality text NOT NULL,
    paper_count integer DEFAULT 0 NOT NULL,
    display_rank integer,
    example_pmids text[],
    therapeutic_area text DEFAULT 'NSCLC'::text NOT NULL,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_run_id uuid NOT NULL,
    CONSTRAINT hcp_research_themes_v2_centrality_check CHECK ((centrality = ANY (ARRAY['core'::text, 'supporting'::text, 'peripheral'::text])))
);


--
-- Name: hcp_rising_composite_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_rising_composite_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_value text,
    rank integer,
    rising_composite_score double precision,
    emergence_pctile double precision,
    network_influence_pctile double precision,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hcp_score_ranks_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_score_ranks_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    cohort text NOT NULL,
    scope_type text NOT NULL,
    scope_value text,
    rank integer NOT NULL,
    percentile numeric(5,2) NOT NULL,
    scope_size integer NOT NULL,
    score_at_rank numeric NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    scoring_run_id uuid,
    rank_run_id uuid NOT NULL,
    CONSTRAINT hcp_score_ranks_v2_cohort_check CHECK ((cohort = ANY (ARRAY['rising'::text, 'established'::text, 'community'::text]))),
    CONSTRAINT hcp_score_ranks_v2_percentile_check CHECK (((percentile >= (0)::numeric) AND (percentile <= (100)::numeric))),
    CONSTRAINT hcp_score_ranks_v2_rank_check CHECK ((rank >= 1)),
    CONSTRAINT hcp_score_ranks_v2_scope_consistency CHECK ((((scope_type = 'global'::text) AND (scope_value IS NULL)) OR ((scope_type = ANY (ARRAY['country'::text, 'region'::text])) AND (scope_value IS NOT NULL)))),
    CONSTRAINT hcp_score_ranks_v2_scope_size_check CHECK ((scope_size >= 1)),
    CONSTRAINT hcp_score_ranks_v2_scope_type_check CHECK ((scope_type = ANY (ARRAY['country'::text, 'region'::text, 'global'::text])))
);


--
-- Name: TABLE hcp_score_ranks_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hcp_score_ranks_v2 IS 'Precomputed ranks for HCP scores across cohorts (rising/established/community) and scopes (country/region/global). Refreshed on every scoring run. See migrations/2026-05-27_create_hcp_score_ranks_v2.sql.';


--
-- Name: hcp_scores_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_scores_v2 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    composite_score numeric,
    normalized_score numeric,
    pub_velocity_score numeric,
    citation_trajectory_score numeric,
    trial_investigator_score numeric,
    career_age_multiplier numeric,
    tier text,
    scored_at timestamp with time zone DEFAULT now(),
    scoring_run_id uuid,
    congress_score numeric,
    msl_signal_score numeric
);


--
-- Name: COLUMN hcp_scores_v2.congress_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_scores_v2.congress_score IS 'Conference/congress activity signal. v1.4 placeholder weight 10%, default 0.0.';


--
-- Name: COLUMN hcp_scores_v2.msl_signal_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcp_scores_v2.msl_signal_score IS 'MSL contribution signal. v1.4 placeholder weight 10%, default 0.0.';


--
-- Name: hcp_rising_star_ranks_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_rising_star_ranks_v2 WITH (security_invoker='true') AS
 SELECT r.id AS rank_id,
    r.hcp_id,
    r.therapeutic_area_id,
    r.cohort,
    r.scope_type,
    r.scope_value,
    r.rank,
    r.percentile,
    r.scope_size,
    r.score_at_rank,
    r.computed_at AS rank_computed_at,
    s.tier,
    s.normalized_score,
    s.composite_score,
    s.pub_velocity_score,
    s.citation_trajectory_score,
    s.trial_investigator_score,
    s.career_age_multiplier,
    h.career_first_pub_year,
    h.total_career_pubs
   FROM ((public.hcp_score_ranks_v2 r
     JOIN public.hcp_scores_v2 s ON (((s.hcp_id = r.hcp_id) AND (s.therapeutic_area_id = r.therapeutic_area_id))))
     JOIN public.hcps_v2 h ON ((h.id = r.hcp_id)))
  WHERE (r.cohort = 'rising'::text);


--
-- Name: VIEW hcp_rising_star_ranks_v2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.hcp_rising_star_ranks_v2 IS 'Pre-joined view of rank rows for tier=rising_star HCPs in cohort=rising. Eliminates need for two-step query in frontend (which produced URL length errors). Filter by therapeutic_area_id + scope_type + scope_value for region-aware counts and lists.';


--
-- Name: hcp_rising_star_ranks_deduped_v2; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.hcp_rising_star_ranks_deduped_v2 WITH (security_invoker='true') AS
 WITH ranked AS (
         SELECT v.rank_id,
            v.hcp_id,
            v.therapeutic_area_id,
            v.cohort,
            v.scope_type,
            v.scope_value,
            v.rank,
            v.percentile,
            v.scope_size,
            v.score_at_rank,
            v.rank_computed_at,
            v.tier,
            v.normalized_score,
            v.composite_score,
            v.pub_velocity_score,
            v.citation_trajectory_score,
            v.trial_investigator_score,
            v.career_age_multiplier,
            v.career_first_pub_year,
            v.total_career_pubs,
            h.first_name,
            h.last_name,
            COALESCE(h.institution_normalized, h.institution_raw, (v.hcp_id)::text) AS institution_key,
            row_number() OVER (PARTITION BY v.scope_type, v.scope_value, v.therapeutic_area_id, h.first_name, h.last_name, COALESCE(h.institution_normalized, h.institution_raw, (v.hcp_id)::text) ORDER BY v.rank) AS dedup_rank
           FROM (public.hcp_rising_star_ranks_v2 v
             JOIN public.hcps_v2 h ON ((h.id = v.hcp_id)))
        )
 SELECT rank_id,
    hcp_id,
    therapeutic_area_id,
    cohort,
    scope_type,
    scope_value,
    rank,
    percentile,
    scope_size,
    score_at_rank,
    rank_computed_at,
    tier,
    normalized_score,
    composite_score,
    pub_velocity_score,
    citation_trajectory_score,
    trial_investigator_score,
    career_age_multiplier,
    career_first_pub_year,
    total_career_pubs,
    first_name,
    last_name,
    institution_key
   FROM ranked
  WHERE (dedup_rank = 1);


--
-- Name: hcp_rising_star_ranks_v3; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_rising_star_ranks_v3 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    scientific_momentum_percentile numeric,
    network_momentum_percentile numeric,
    scientific_visibility_percentile numeric,
    network_visibility_percentile numeric,
    momentum_component numeric,
    visibility_component numeric,
    rising_star_raw numeric,
    rising_star_percentile numeric,
    rank integer,
    us_rank integer,
    archetype text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    enrichment_run_id uuid,
    country text
);


--
-- Name: hcp_rising_star_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_rising_star_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_date date NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    us_rank integer,
    global_rank integer,
    rising_star_percentile numeric,
    archetype text,
    scientific_momentum_percentile numeric,
    network_momentum_percentile numeric,
    scientific_visibility_percentile numeric,
    network_visibility_percentile numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_scientific_emergence_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_scientific_emergence_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    recent_start_year integer NOT NULL,
    recent_end_year integer NOT NULL,
    recent_pub_count integer,
    recent_senior_pubs integer,
    recent_first_pubs integer,
    recent_senior_first_pct double precision,
    recent_total_citations integer,
    recent_citations_per_pub double precision,
    recent_pub_percentile double precision,
    recent_authorship_percentile double precision,
    recent_citation_impact_percentile double precision,
    emergence_raw double precision,
    emergence_percentile double precision,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    enrichment_run_id uuid
);


--
-- Name: hcp_scientific_momentum_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_scientific_momentum_v1 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    early_start_year integer,
    early_end_year integer,
    recent_start_year integer,
    recent_end_year integer,
    early_total_pubs integer,
    early_senior_pubs integer,
    early_senior_author_pct numeric,
    early_citation_rate numeric,
    recent_total_pubs integer,
    recent_senior_pubs integer,
    recent_senior_author_pct numeric,
    recent_citation_rate numeric,
    pub_velocity_delta numeric,
    citation_velocity_delta numeric,
    authorship_progression_delta numeric,
    pub_velocity_percentile numeric,
    citation_velocity_percentile numeric,
    authorship_progression_percentile numeric,
    scientific_momentum_raw numeric,
    scientific_momentum_percentile numeric,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    enrichment_run_id uuid
);


--
-- Name: hcp_scientific_positions_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_scientific_positions_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    publication_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    author_role text NOT NULL,
    position_type text NOT NULL,
    drug_name text,
    drug_class text,
    biomarker text,
    disease_context text,
    position_text text NOT NULL,
    evidence_excerpt text NOT NULL,
    confidence numeric NOT NULL,
    model_name text NOT NULL,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    position_category text,
    pub_year integer,
    citation_count integer,
    CONSTRAINT hcp_scientific_positions_v1_author_role_check CHECK ((author_role = ANY (ARRAY['first_author'::text, 'senior_author'::text, 'co_first_author'::text, 'co_senior_author'::text]))),
    CONSTRAINT hcp_scientific_positions_v1_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT hcp_scientific_positions_v1_position_category_check CHECK (((position_category IS NULL) OR (position_category = ANY (ARRAY['efficacy'::text, 'patient_selection'::text, 'biomarker'::text, 'safety'::text, 'resistance'::text, 'sequencing'::text, 'access'::text, 'diagnostics'::text, 'methodology'::text])))),
    CONSTRAINT hcp_scientific_positions_v1_position_type_check CHECK ((position_type = ANY (ARRAY['positive_position'::text, 'cautionary_position'::text, 'unmet_need_position'::text, 'hypothesis_position'::text])))
);


--
-- Name: hcp_therapeutic_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_therapeutic_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    strength_score double precision DEFAULT 0,
    last_calculated timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_therapeutic_areas_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_therapeutic_areas_v2 (
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    publication_count integer DEFAULT 0 NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hcp_therapeutic_areas_v2_publication_count_check CHECK ((publication_count >= 0))
);


--
-- Name: hcp_top_collaborators_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_top_collaborators_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    window_type text NOT NULL,
    rank integer NOT NULL,
    collaborator_hcp_id uuid NOT NULL,
    shared_publications integer NOT NULL,
    computed_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    notes text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: hcp_web_signals_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcp_web_signals_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    signal_type text NOT NULL,
    signal_value text NOT NULL,
    source_url text,
    source_title text,
    source_date text,
    confidence text,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    extraction_run_id uuid,
    phase text,
    CONSTRAINT hcp_web_signals_v1_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))
);


--
-- Name: hcps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    npi_number text,
    first_name text,
    last_name text NOT NULL,
    credentials text,
    institution text,
    city text,
    state text,
    zip_code text,
    country text DEFAULT 'US'::text,
    specialty text,
    subspecialty text,
    opt_out boolean DEFAULT false,
    is_claimed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    first_pub_year integer,
    total_career_pubs integer,
    institution_full text,
    twitter_handle text,
    twitter_followers integer,
    twitter_following integer,
    twitter_tweet_count integer,
    twitter_verified boolean,
    twitter_bio text,
    twitter_enriched_at timestamp with time zone,
    institution_short text,
    bluesky_handle text,
    bluesky_followers integer,
    bluesky_posts integer,
    bluesky_bio text,
    bluesky_enriched_at timestamp with time zone,
    scholar_h_index integer,
    scholar_citations_total integer,
    scholar_i10_index integer,
    scholar_enriched_at timestamp with time zone,
    social_verified boolean DEFAULT false,
    social_verification_method text,
    social_verification_reasoning text,
    social_verified_at timestamp with time zone,
    alternative_affiliations jsonb,
    merged_from_count integer DEFAULT 0,
    merge_category text,
    merged_at timestamp with time zone,
    npi_taxonomy text,
    npi_specialty text,
    is_verified_dol boolean DEFAULT false,
    affiliation_profile jsonb,
    clinician_score numeric,
    affiliation_classification text,
    affiliation_profile_calculated_at timestamp with time zone,
    source text DEFAULT 'publication_ingestion'::text,
    source_calculated_at timestamp with time zone,
    middle_name text,
    nppes_enumeration_date date,
    nppes_is_sole_proprietor text,
    nppes_practice_address text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_zip text,
    nppes_organization_name text,
    nppes_organization_npi text,
    nppes_organization_match_quality text,
    nppes_co_located_npi_count integer,
    nppes_practice_setting text,
    nppes_career_stage text,
    nppes_career_stage_years integer,
    nppes_enriched_at timestamp with time zone,
    openalex_author_id text,
    orcid text,
    openalex_resolved_at timestamp with time zone,
    openalex_resolution_method text,
    openalex_resolution_confidence text,
    openalex_institution_ror_id text,
    institution_state text,
    institution_state_code text,
    institution_country text,
    institution_geo_method text,
    institution_geo_confidence text,
    institution_geo_resolved_at timestamp with time zone,
    derived_state text GENERATED ALWAYS AS (COALESCE(nppes_practice_state, institution_state_code)) STORED,
    cohort_classification text,
    cohort_score numeric,
    last_name_lower text GENERATED ALWAYS AS (lower(last_name)) STORED,
    state_lower text GENERATED ALWAYS AS (lower(state)) STORED,
    npi_taxonomy_enrichment_status text,
    npi_taxonomy_enriched_at timestamp with time zone,
    identity_hash text,
    CONSTRAINT hcps_affiliation_classification_check CHECK (((affiliation_classification IS NULL) OR (affiliation_classification = ANY (ARRAY['clinician'::text, 'mixed'::text, 'researcher'::text, 'industry'::text, 'insufficient_data'::text]))))
);


--
-- Name: COLUMN hcps.cohort_classification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hcps.cohort_classification IS 'Cohort assignment from v1.0 methodology. Values: established, rising_star, community, null (unclassified). Populated by cohort_classification SQL run; updated as data changes.';


--
-- Name: hcps_backup_institution_cleanup_phase1_20260520; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_backup_institution_cleanup_phase1_20260520 (
    id uuid,
    npi_number text,
    first_name text,
    last_name text,
    credentials text,
    institution text,
    city text,
    state text,
    zip_code text,
    country text,
    specialty text,
    subspecialty text,
    opt_out boolean,
    is_claimed boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    first_pub_year integer,
    total_career_pubs integer,
    institution_full text,
    twitter_handle text,
    twitter_followers integer,
    twitter_following integer,
    twitter_tweet_count integer,
    twitter_verified boolean,
    twitter_bio text,
    twitter_enriched_at timestamp with time zone,
    institution_short text,
    bluesky_handle text,
    bluesky_followers integer,
    bluesky_posts integer,
    bluesky_bio text,
    bluesky_enriched_at timestamp with time zone,
    scholar_h_index integer,
    scholar_citations_total integer,
    scholar_i10_index integer,
    scholar_enriched_at timestamp with time zone,
    social_verified boolean,
    social_verification_method text,
    social_verification_reasoning text,
    social_verified_at timestamp with time zone,
    alternative_affiliations jsonb,
    merged_from_count integer,
    merge_category text,
    merged_at timestamp with time zone,
    npi_taxonomy text,
    npi_specialty text,
    is_verified_dol boolean,
    affiliation_profile jsonb,
    clinician_score numeric,
    affiliation_classification text,
    affiliation_profile_calculated_at timestamp with time zone,
    source text,
    source_calculated_at timestamp with time zone,
    middle_name text,
    nppes_enumeration_date date,
    nppes_is_sole_proprietor text,
    nppes_practice_address text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_zip text,
    nppes_organization_name text,
    nppes_organization_npi text,
    nppes_organization_match_quality text,
    nppes_co_located_npi_count integer,
    nppes_practice_setting text,
    nppes_career_stage text,
    nppes_career_stage_years integer,
    nppes_enriched_at timestamp with time zone,
    openalex_author_id text,
    orcid text,
    openalex_resolved_at timestamp with time zone,
    openalex_resolution_method text,
    openalex_resolution_confidence text,
    openalex_institution_ror_id text,
    institution_state text,
    institution_state_code text,
    institution_country text,
    institution_geo_method text,
    institution_geo_confidence text,
    institution_geo_resolved_at timestamp with time zone,
    derived_state text,
    cohort_classification text,
    cohort_score numeric,
    last_name_lower text,
    state_lower text,
    npi_taxonomy_enrichment_status text,
    npi_taxonomy_enriched_at timestamp with time zone
);


--
-- Name: hcps_backup_institution_cleanup_phase2_20260520; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_backup_institution_cleanup_phase2_20260520 (
    id uuid,
    npi_number text,
    first_name text,
    last_name text,
    credentials text,
    institution text,
    city text,
    state text,
    zip_code text,
    country text,
    specialty text,
    subspecialty text,
    opt_out boolean,
    is_claimed boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    first_pub_year integer,
    total_career_pubs integer,
    institution_full text,
    twitter_handle text,
    twitter_followers integer,
    twitter_following integer,
    twitter_tweet_count integer,
    twitter_verified boolean,
    twitter_bio text,
    twitter_enriched_at timestamp with time zone,
    institution_short text,
    bluesky_handle text,
    bluesky_followers integer,
    bluesky_posts integer,
    bluesky_bio text,
    bluesky_enriched_at timestamp with time zone,
    scholar_h_index integer,
    scholar_citations_total integer,
    scholar_i10_index integer,
    scholar_enriched_at timestamp with time zone,
    social_verified boolean,
    social_verification_method text,
    social_verification_reasoning text,
    social_verified_at timestamp with time zone,
    alternative_affiliations jsonb,
    merged_from_count integer,
    merge_category text,
    merged_at timestamp with time zone,
    npi_taxonomy text,
    npi_specialty text,
    is_verified_dol boolean,
    affiliation_profile jsonb,
    clinician_score numeric,
    affiliation_classification text,
    affiliation_profile_calculated_at timestamp with time zone,
    source text,
    source_calculated_at timestamp with time zone,
    middle_name text,
    nppes_enumeration_date date,
    nppes_is_sole_proprietor text,
    nppes_practice_address text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_zip text,
    nppes_organization_name text,
    nppes_organization_npi text,
    nppes_organization_match_quality text,
    nppes_co_located_npi_count integer,
    nppes_practice_setting text,
    nppes_career_stage text,
    nppes_career_stage_years integer,
    nppes_enriched_at timestamp with time zone,
    openalex_author_id text,
    orcid text,
    openalex_resolved_at timestamp with time zone,
    openalex_resolution_method text,
    openalex_resolution_confidence text,
    openalex_institution_ror_id text,
    institution_state text,
    institution_state_code text,
    institution_country text,
    institution_geo_method text,
    institution_geo_confidence text,
    institution_geo_resolved_at timestamp with time zone,
    derived_state text,
    cohort_classification text,
    cohort_score numeric,
    last_name_lower text,
    state_lower text,
    npi_taxonomy_enrichment_status text,
    npi_taxonomy_enriched_at timestamp with time zone
);


--
-- Name: hcps_cohort_backup_20260518; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_cohort_backup_20260518 (
    id uuid,
    cohort_classification text,
    cohort_score numeric
);


--
-- Name: hcps_v2_ad_july_delete_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_ad_july_delete_list (
    id uuid NOT NULL
);


--
-- Name: hcps_v2_ad_july_detour_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_ad_july_detour_backup (
    id uuid,
    identity_hash text,
    npi_number text,
    orcid text,
    first_name text,
    middle_name text,
    last_name text,
    name_suffix text,
    preferred_display_name text,
    institution_normalized text,
    institution_raw text,
    institution_secondary text,
    institution_history jsonb,
    country text,
    career_first_pub_year integer,
    total_career_pubs integer,
    latest_pub_year integer,
    identity_confidence_score numeric,
    identity_method text,
    quality_flags text[],
    cohort_classification text,
    cohort_score numeric,
    is_verified_dol boolean,
    verified_dol_at timestamp with time zone,
    npi_specialty text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_setting text,
    nppes_career_stage_years integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    ingestion_run_id uuid,
    last_name_lower text,
    state_lower text,
    credentials text,
    nppes_practice_zip text,
    nppes_enriched_at timestamp with time zone,
    npi_taxonomy text,
    career_first_pub_year_v2 integer,
    career_age_years integer,
    nih_profile_id bigint,
    institution_canonical text
);


--
-- Name: hcps_v2_cohort_backup_20260526; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_cohort_backup_20260526 (
    id uuid,
    cohort_classification text,
    cohort_score numeric
);


--
-- Name: hcps_v2_cohort_backup_20260529; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_cohort_backup_20260529 (
    id uuid,
    cohort_classification text,
    backup_time timestamp with time zone
);


--
-- Name: hcps_v2_cohortscore_backup_20260529; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_cohortscore_backup_20260529 (
    id uuid,
    cohort_score numeric,
    backup_time timestamp with time zone
);


--
-- Name: hcps_v2_pre_dedup_cleanup_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_pre_dedup_cleanup_20260720 (
    id uuid,
    identity_hash text,
    npi_number text,
    orcid text,
    first_name text,
    middle_name text,
    last_name text,
    name_suffix text,
    preferred_display_name text,
    institution_normalized text,
    institution_raw text,
    institution_secondary text,
    institution_history jsonb,
    country text,
    career_first_pub_year integer,
    total_career_pubs integer,
    latest_pub_year integer,
    identity_confidence_score numeric,
    identity_method text,
    quality_flags text[],
    cohort_classification text,
    cohort_score numeric,
    is_verified_dol boolean,
    verified_dol_at timestamp with time zone,
    npi_specialty text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_setting text,
    nppes_career_stage_years integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    ingestion_run_id uuid,
    last_name_lower text,
    state_lower text,
    credentials text,
    nppes_practice_zip text,
    nppes_enriched_at timestamp with time zone,
    npi_taxonomy text,
    career_first_pub_year_v2 integer,
    career_age_years integer,
    nih_profile_id bigint,
    institution_canonical text,
    derived_state text
);


--
-- Name: hcps_v2_pre_hashbackfill_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_pre_hashbackfill_20260720 (
    id uuid,
    identity_hash text
);


--
-- Name: hcps_v2_pre_stepc_incremental_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hcps_v2_pre_stepc_incremental_20260720 (
    id uuid,
    identity_hash text,
    npi_number text,
    orcid text,
    first_name text,
    middle_name text,
    last_name text,
    name_suffix text,
    preferred_display_name text,
    institution_normalized text,
    institution_raw text,
    institution_secondary text,
    institution_history jsonb,
    country text,
    career_first_pub_year integer,
    total_career_pubs integer,
    latest_pub_year integer,
    identity_confidence_score numeric,
    identity_method text,
    quality_flags text[],
    cohort_classification text,
    cohort_score numeric,
    is_verified_dol boolean,
    verified_dol_at timestamp with time zone,
    npi_specialty text,
    nppes_practice_city text,
    nppes_practice_state text,
    nppes_practice_setting text,
    nppes_career_stage_years integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    ingestion_run_id uuid,
    last_name_lower text,
    state_lower text,
    credentials text,
    nppes_practice_zip text,
    nppes_enriched_at timestamp with time zone,
    npi_taxonomy text,
    career_first_pub_year_v2 integer,
    career_age_years integer,
    nih_profile_id bigint,
    institution_canonical text,
    derived_state text
);


--
-- Name: institution_geo_lookup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.institution_geo_lookup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ror_id text NOT NULL,
    openalex_institution_id text,
    institution_display_name text,
    country text,
    country_code text,
    state_name text,
    state_code text,
    city text,
    latitude numeric,
    longitude numeric,
    source text DEFAULT 'openalex_authorship_ror_lookup'::text,
    resolved_at timestamp with time zone DEFAULT now()
);


--
-- Name: institution_investigator_counts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.institution_investigator_counts WITH (security_invoker='true') AS
 SELECT institution_canonical,
    (count(*))::integer AS investigator_count
   FROM public.hcps_v2
  WHERE (institution_canonical IS NOT NULL)
  GROUP BY institution_canonical;


--
-- Name: invite_email_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_email_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    recipient_email text NOT NULL,
    invite_code text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invite_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invite_code text,
    redeemed_by uuid NOT NULL,
    inviter_id uuid,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    code text NOT NULL,
    inviter_id uuid,
    uses_remaining integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invites_uses_nonneg CHECK ((uses_remaining >= 0))
);


--
-- Name: therapeutic_area_ingestion_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.therapeutic_area_ingestion_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    pubmed_query text,
    pubmed_max_results integer DEFAULT 30000,
    pubmed_days_back integer DEFAULT 1460,
    nppes_taxonomy_codes text[] DEFAULT '{}'::text[],
    openalex_concept_ids text[] DEFAULT '{}'::text[] NOT NULL,
    openalex_min_works_count integer DEFAULT 5 NOT NULL,
    openalex_max_authors_to_fetch integer DEFAULT 15000 NOT NULL,
    ctgov_condition_filters text[] DEFAULT '{}'::text[] NOT NULL,
    scoring_weights jsonb DEFAULT '{}'::jsonb NOT NULL,
    indication_keyword_filters text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    is_visible_in_ui boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: live_therapeutic_areas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.live_therapeutic_areas AS
 SELECT therapeutic_area_id
   FROM public.therapeutic_area_ingestion_config
  WHERE ((is_visible_in_ui = true) AND (is_active = true));


--
-- Name: msl_belief_claim_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_belief_claim_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contributor_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    claim_key text NOT NULL,
    claim_section text NOT NULL,
    claim_title text NOT NULL,
    field_read text,
    resonance text,
    behavior_change text,
    therapeutic_area_slug text,
    is_verified boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: msl_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    contributor_id uuid NOT NULL,
    field_type text NOT NULL,
    field_value text NOT NULL,
    therapeutic_area_slug text,
    is_verified boolean DEFAULT false,
    submitted_at timestamp with time zone DEFAULT now(),
    subject_type text,
    subject_key text,
    CONSTRAINT msl_contributions_field_type_check CHECK ((field_type = ANY (ARRAY['congress_presentation'::text, 'clinical_trial_activity'::text, 'institutional_move'::text, 'therapeutic_area_shift'::text, 'peer_recognition'::text, 'patient_advocacy_role'::text])))
);


--
-- Name: msl_hcp_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_hcp_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    has_relationship boolean DEFAULT false NOT NULL,
    content jsonb NOT NULL,
    ai_status text DEFAULT 'pending'::text NOT NULL,
    ai_error text,
    model_used text,
    prompt_tokens integer,
    completion_tokens integer,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT msl_hcp_briefs_ai_status_check CHECK ((ai_status = ANY (ARRAY['pending'::text, 'generated'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: msl_hcp_next_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_hcp_next_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    priority text DEFAULT 'normal'::text NOT NULL,
    created_from text,
    CONSTRAINT msl_hcp_next_actions_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT msl_hcp_next_actions_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])))
);


--
-- Name: msl_hcp_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_hcp_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    interaction_type text DEFAULT 'general'::text NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_extraction_status text DEFAULT 'pending'::text NOT NULL,
    ai_extracted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    insight_strength text DEFAULT 'routine'::text NOT NULL,
    insight_category text,
    why_it_matters text,
    interaction_type_other_label text,
    insight_category_other_label text,
    belief_claim_key text,
    belief_claim_title text,
    CONSTRAINT msl_hcp_notes_ai_extraction_status_check CHECK ((ai_extraction_status = ANY (ARRAY['pending'::text, 'processing'::text, 'extracted'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT msl_hcp_notes_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT msl_hcp_notes_insight_strength_check CHECK ((insight_strength = ANY (ARRAY['routine'::text, 'notable'::text, 'strategic'::text]))),
    CONSTRAINT msl_hcp_notes_interaction_type_check CHECK ((interaction_type = ANY (ARRAY['general'::text, 'meeting'::text, 'email'::text, 'phone'::text, 'conference'::text, 'publication_review'::text, 'internal'::text, 'advisory_board'::text, 'tumor_board'::text, 'other'::text]))),
    CONSTRAINT msl_hcp_notes_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'team'::text, 'community'::text])))
);


--
-- Name: msl_hcp_relationship_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_hcp_relationship_tags (
    relationship_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: msl_hcp_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_hcp_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    status text DEFAULT 'not_engaged'::text NOT NULL,
    created_from text,
    first_added_at timestamp with time zone DEFAULT now() NOT NULL,
    last_interaction_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT msl_hcp_relationships_status_check CHECK ((status = ANY (ARRAY['not_engaged'::text, 'targeted'::text, 'contacted'::text, 'engaged'::text, 'active_relationship'::text, 'paused'::text])))
);


--
-- Name: msl_pinned_institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_pinned_institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    institution_name text NOT NULL,
    pinned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: msl_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_profiles (
    user_id uuid NOT NULL,
    first_name text,
    last_name text,
    company text,
    role text DEFAULT 'Medical Science Liaison'::text,
    linkedin_url text,
    linkedin_verified_at timestamp with time zone,
    default_ta_slug text DEFAULT 'oncology'::text,
    default_indication_slug text DEFAULT 'nsclc'::text,
    region text,
    states_covered text[] DEFAULT ARRAY[]::text[],
    territory_set_by text,
    territory_locked boolean DEFAULT false,
    notify_new_rising_stars boolean DEFAULT true,
    notify_score_changes boolean DEFAULT true,
    notify_field_notes boolean DEFAULT false,
    notification_digest_day text DEFAULT 'sunday'::text,
    active_conference_slug text,
    active_conference_until date,
    onboarded_at timestamp with time zone,
    last_active_at timestamp with time zone,
    last_dashboard_view_at timestamp with time zone,
    total_sessions_count integer DEFAULT 0,
    ui_preferences jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    territory_label text,
    territory_states text[],
    therapeutic_areas text[],
    allowed_ta_slugs text[] DEFAULT ARRAY[]::text[],
    invited_by uuid,
    job_function text,
    deactivated_at timestamp with time zone
);


--
-- Name: msl_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT msl_tags_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: msl_team_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_team_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_user_id uuid NOT NULL,
    invitee_email text,
    invitee_name text,
    invitee_company text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_at timestamp with time zone,
    accepted_at timestamp with time zone,
    CONSTRAINT msl_team_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'invited'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: msl_watchlist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_watchlist_items (
    watchlist_id uuid NOT NULL,
    relationship_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    list_note text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: msl_watchlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.msl_watchlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    color text,
    is_default boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT msl_watchlists_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: social_posts_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    platform_post_id text NOT NULL,
    handle text NOT NULL,
    display_name text,
    post_text text,
    posted_at timestamp with time zone NOT NULL,
    engagement_likes integer,
    engagement_replies integer,
    engagement_reposts integer,
    engagement_quotes integer,
    hashtags text[],
    captured_at timestamp with time zone,
    captured_via_query text,
    therapeutic_areas text[],
    conversation_id text,
    parent_platform_post_id text,
    is_reply boolean DEFAULT false
);


--
-- Name: mv_social_hot_topics_by_ta; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_social_hot_topics_by_ta AS
 WITH expanded AS (
         SELECT unnest(social_posts_v2.therapeutic_areas) AS ta_slug,
            lower(unnest(social_posts_v2.hashtags)) AS hashtag,
            (((COALESCE(social_posts_v2.engagement_likes, 0) + COALESCE(social_posts_v2.engagement_replies, 0)) + COALESCE(social_posts_v2.engagement_reposts, 0)) + COALESCE(social_posts_v2.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2
          WHERE ((social_posts_v2.therapeutic_areas IS NOT NULL) AND (social_posts_v2.hashtags IS NOT NULL) AND (social_posts_v2.posted_at >= (now() - '30 days'::interval)))
        ), filtered AS (
         SELECT expanded.ta_slug,
            expanded.hashtag,
            expanded.engagement
           FROM expanded
          WHERE (expanded.hashtag <> ALL (ARRAY['#asco26'::text, '#asco2026'::text, '#esmo2026'::text, '#easl2026'::text, '#aasld2026'::text, '#eha2026'::text]))
        ), aggregated AS (
         SELECT filtered.ta_slug,
            filtered.hashtag,
            count(*) AS post_count,
            sum(filtered.engagement) AS total_engagement
           FROM filtered
          GROUP BY filtered.ta_slug, filtered.hashtag
         HAVING (count(*) >= 3)
        ), ta_totals AS (
         SELECT aggregated.ta_slug,
            sum(aggregated.total_engagement) AS ta_total
           FROM aggregated
          GROUP BY aggregated.ta_slug
        )
 SELECT a.ta_slug,
    a.hashtag,
    a.post_count,
    a.total_engagement,
    round(((100.0 * (a.total_engagement)::numeric) / NULLIF(t.ta_total, (0)::numeric)), 2) AS engagement_pct,
    row_number() OVER (PARTITION BY a.ta_slug ORDER BY a.total_engagement DESC) AS rank_within_ta,
    now() AS computed_at,
    ((now() - '30 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM (aggregated a
     JOIN ta_totals t ON ((a.ta_slug = t.ta_slug)))
  WITH NO DATA;


--
-- Name: social_users_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_users_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    handle text NOT NULL,
    display_name text,
    bio text,
    location text,
    website text,
    follower_count integer,
    following_count integer,
    post_count integer,
    verified boolean,
    profile_url text,
    profile_fetched_at timestamp with time zone,
    data_quality_flag text,
    discovery_source text
);


--
-- Name: mv_social_share_of_voice_by_ta; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_social_share_of_voice_by_ta AS
 WITH expanded AS (
         SELECT unnest(sp.therapeutic_areas) AS ta_slug,
            sp.handle,
            (((COALESCE(sp.engagement_likes, 0) + COALESCE(sp.engagement_replies, 0)) + COALESCE(sp.engagement_reposts, 0)) + COALESCE(sp.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2 sp
          WHERE ((sp.therapeutic_areas IS NOT NULL) AND (sp.posted_at >= (now() - '30 days'::interval)))
        ), aggregated AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            count(*) AS post_count,
            sum(expanded.engagement) AS total_engagement
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle
        ), ta_totals AS (
         SELECT aggregated.ta_slug,
            sum(aggregated.total_engagement) AS ta_total
           FROM aggregated
          GROUP BY aggregated.ta_slug
        )
 SELECT a.ta_slug,
    a.handle,
    su.display_name,
    a.post_count,
    a.total_engagement,
    round(((100.0 * (a.total_engagement)::numeric) / NULLIF(t.ta_total, (0)::numeric)), 2) AS engagement_pct,
    row_number() OVER (PARTITION BY a.ta_slug ORDER BY a.total_engagement DESC) AS rank_within_ta,
    now() AS computed_at,
    ((now() - '30 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM ((aggregated a
     JOIN ta_totals t ON ((a.ta_slug = t.ta_slug)))
     LEFT JOIN public.social_users_v2 su ON ((lower(su.handle) = lower(a.handle))))
  WITH NO DATA;


--
-- Name: mv_social_trending_topics_by_ta; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_social_trending_topics_by_ta AS
 WITH expanded AS (
         SELECT unnest(social_posts_v2.therapeutic_areas) AS ta_slug,
            lower(unnest(social_posts_v2.hashtags)) AS hashtag,
            social_posts_v2.posted_at,
            (((COALESCE(social_posts_v2.engagement_likes, 0) + COALESCE(social_posts_v2.engagement_replies, 0)) + COALESCE(social_posts_v2.engagement_reposts, 0)) + COALESCE(social_posts_v2.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2
          WHERE ((social_posts_v2.therapeutic_areas IS NOT NULL) AND (social_posts_v2.hashtags IS NOT NULL) AND (social_posts_v2.posted_at >= (now() - '14 days'::interval)))
        ), filtered AS (
         SELECT expanded.ta_slug,
            expanded.hashtag,
            expanded.posted_at,
            expanded.engagement
           FROM expanded
          WHERE (expanded.hashtag <> ALL (ARRAY['#asco26'::text, '#asco2026'::text, '#esmo2026'::text, '#easl2026'::text, '#aasld2026'::text, '#eha2026'::text]))
        ), current_window AS (
         SELECT filtered.ta_slug,
            filtered.hashtag,
            sum(filtered.engagement) AS current_engagement,
            count(*) AS current_posts
           FROM filtered
          WHERE (filtered.posted_at >= (now() - '7 days'::interval))
          GROUP BY filtered.ta_slug, filtered.hashtag
        ), prior_window AS (
         SELECT filtered.ta_slug,
            filtered.hashtag,
            sum(filtered.engagement) AS prior_engagement,
            count(*) AS prior_posts
           FROM filtered
          WHERE ((filtered.posted_at >= (now() - '14 days'::interval)) AND (filtered.posted_at < (now() - '7 days'::interval)))
          GROUP BY filtered.ta_slug, filtered.hashtag
        )
 SELECT COALESCE(c.ta_slug, p.ta_slug) AS ta_slug,
    COALESCE(c.hashtag, p.hashtag) AS hashtag,
    COALESCE(c.current_engagement, (0)::bigint) AS current_engagement,
    COALESCE(p.prior_engagement, (0)::bigint) AS prior_engagement,
    COALESCE(c.current_posts, (0)::bigint) AS current_posts,
    COALESCE(p.prior_posts, (0)::bigint) AS prior_posts,
        CASE
            WHEN ((COALESCE(p.prior_engagement, (0)::bigint) = 0) AND (COALESCE(c.current_engagement, (0)::bigint) > 0)) THEN 'new'::text
            WHEN ((COALESCE(c.current_engagement, (0)::bigint) = 0) AND (COALESCE(p.prior_engagement, (0)::bigint) > 0)) THEN 'gone'::text
            WHEN ((COALESCE(c.current_engagement, (0)::bigint))::numeric > ((COALESCE(p.prior_engagement, (0)::bigint))::numeric * 1.5)) THEN 'rising'::text
            WHEN ((COALESCE(c.current_engagement, (0)::bigint))::numeric < ((COALESCE(p.prior_engagement, (0)::bigint))::numeric * 0.5)) THEN 'falling'::text
            ELSE 'flat'::text
        END AS trend,
        CASE
            WHEN (COALESCE(p.prior_engagement, (0)::bigint) = 0) THEN NULL::numeric
            ELSE round(((100.0 * ((COALESCE(c.current_engagement, (0)::bigint) - p.prior_engagement))::numeric) / (p.prior_engagement)::numeric), 1)
        END AS pct_change,
    now() AS computed_at
   FROM (current_window c
     FULL JOIN prior_window p ON (((c.ta_slug = p.ta_slug) AND (c.hashtag = p.hashtag))))
  WHERE (GREATEST(COALESCE(c.current_posts, (0)::bigint), COALESCE(p.prior_posts, (0)::bigint)) >= 3)
  WITH NO DATA;


--
-- Name: mv_social_voice_emergence_by_ta; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_social_voice_emergence_by_ta AS
 WITH expanded AS (
         SELECT unnest(sp.therapeutic_areas) AS ta_slug,
            sp.handle,
            sp.captured_via_query,
            (((COALESCE(sp.engagement_likes, 0) + COALESCE(sp.engagement_replies, 0)) + COALESCE(sp.engagement_reposts, 0)) + COALESCE(sp.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2 sp
          WHERE ((sp.therapeutic_areas IS NOT NULL) AND (sp.posted_at >= (now() - '30 days'::interval)))
        ), aggregated AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            sum(expanded.engagement) AS total_engagement,
            count(*) AS post_count
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle
         HAVING (count(*) >= 2)
        ), source_counts AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            expanded.captured_via_query,
            count(*) AS query_count,
            row_number() OVER (PARTITION BY expanded.ta_slug, expanded.handle ORDER BY (count(*)) DESC) AS rn
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle, expanded.captured_via_query
        ), dominant_source AS (
         SELECT source_counts.ta_slug,
            source_counts.handle,
            source_counts.captured_via_query AS dominant_source_hashtag
           FROM source_counts
          WHERE (source_counts.rn = 1)
        )
 SELECT a.ta_slug,
    a.handle,
    a.post_count,
    a.total_engagement,
    COALESCE(su.follower_count, 0) AS follower_count,
        CASE
            WHEN (COALESCE(su.follower_count, 0) > 0) THEN round(((a.total_engagement)::numeric / (su.follower_count)::numeric), 4)
            ELSE NULL::numeric
        END AS engagement_per_follower,
    su.display_name,
    su.bio,
    su.platform,
    ds.dominant_source_hashtag,
        CASE
            WHEN (dm.hcp_id IS NOT NULL) THEN true
            ELSE false
        END AS hcp_matched,
    now() AS computed_at,
    ((now() - '30 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM (((aggregated a
     LEFT JOIN public.social_users_v2 su ON ((lower(su.handle) = lower(a.handle))))
     LEFT JOIN public.dol_matches_v2 dm ON ((dm.social_user_id = su.id)))
     LEFT JOIN dominant_source ds ON (((ds.ta_slug = a.ta_slug) AND (ds.handle = a.handle))))
  WITH NO DATA;


--
-- Name: nih_grant_investigators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nih_grant_investigators (
    core_project_num text NOT NULL,
    hcp_id uuid NOT NULL,
    role text NOT NULL,
    match_confidence text NOT NULL,
    match_method text NOT NULL,
    raw_nih_name text NOT NULL,
    raw_nih_institution text,
    matched_at timestamp with time zone DEFAULT now(),
    CONSTRAINT nih_grant_investigators_match_confidence_check CHECK ((match_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'review_pending'::text]))),
    CONSTRAINT nih_grant_investigators_role_check CHECK ((role = ANY (ARRAY['pi'::text, 'co_pi'::text, 'multi_pi'::text, 'other'::text])))
);


--
-- Name: nih_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nih_grants (
    core_project_num text NOT NULL,
    appl_id bigint,
    project_title text,
    abstract_text text,
    public_health_relevance text,
    fiscal_year integer NOT NULL,
    project_start_date date,
    project_end_date date,
    award_notice_date date,
    total_cost numeric,
    direct_cost_amt numeric,
    indirect_cost_amt numeric,
    activity_code text,
    administering_ic text,
    funding_mechanism text,
    study_section text,
    org_name text,
    org_city text,
    org_state text,
    org_country text,
    org_duns text,
    is_active boolean,
    is_new boolean,
    subproject_id text,
    parent_project_num text,
    agency_code text,
    spending_categories jsonb,
    pref_terms text,
    raw_payload jsonb,
    ingested_at timestamp with time zone DEFAULT now()
);


--
-- Name: nih_merge_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nih_merge_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id_a uuid NOT NULL,
    hcp_id_b uuid NOT NULL,
    evidence_core_project_num text NOT NULL,
    raw_nih_name text NOT NULL,
    normalized_name text NOT NULL,
    shared_institution text,
    confidence_score numeric,
    status text DEFAULT 'pending_review'::text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now(),
    reviewed_at timestamp with time zone,
    CONSTRAINT nih_merge_candidates_check CHECK ((hcp_id_a < hcp_id_b)),
    CONSTRAINT nih_merge_candidates_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed_merge'::text, 'confirmed_distinct'::text, 'merged'::text])))
);


--
-- Name: nih_unmatched_researchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nih_unmatched_researchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    core_project_num text NOT NULL,
    raw_nih_name text NOT NULL,
    normalized_name text NOT NULL,
    raw_nih_institution text,
    role text NOT NULL,
    unmatched_reason text,
    recorded_at timestamp with time zone DEFAULT now(),
    CONSTRAINT nih_unmatched_researchers_role_check CHECK ((role = ANY (ARRAY['pi'::text, 'co_pi'::text, 'multi_pi'::text, 'other'::text])))
);


--
-- Name: npi_match_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npi_match_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    npi text,
    npi_first_name text,
    npi_last_name text,
    npi_credentials text,
    npi_practice_city text,
    npi_practice_state text,
    npi_practice_zip text,
    npi_practice_address text,
    npi_taxonomy_codes text[],
    npi_primary_taxonomy text,
    match_tier integer,
    match_confidence integer,
    match_status text,
    match_calculated_at timestamp with time zone DEFAULT now(),
    candidates_found integer
);


--
-- Name: npi_match_proposals_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npi_match_proposals_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    npi text NOT NULL,
    match_tier integer,
    match_confidence integer,
    match_status text,
    candidates_found integer,
    match_calculated_at timestamp with time zone DEFAULT now(),
    applied_at timestamp with time zone
);


--
-- Name: nppes_enrichment_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nppes_enrichment_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    matched_npi text,
    match_confidence text,
    match_reason text,
    candidates_considered jsonb,
    enriched_at timestamp without time zone DEFAULT now(),
    reverted_at timestamp without time zone,
    CONSTRAINT nppes_enrichment_log_match_confidence_check CHECK ((match_confidence = ANY (ARRAY['high_confidence'::text, 'ambiguous'::text])))
);


--
-- Name: nppes_enrichment_log_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nppes_enrichment_log_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    matched_npi text,
    match_confidence text,
    match_reason text,
    candidates_considered jsonb,
    enriched_at timestamp with time zone DEFAULT now(),
    reverted_at timestamp with time zone
);


--
-- Name: nppes_org_to_ror; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nppes_org_to_ror (
    nppes_organization_name text NOT NULL,
    ror_id text,
    ror_name text,
    ror_score numeric,
    ror_matching_type text,
    ror_chosen_flag boolean,
    confidence text NOT NULL,
    candidate_count integer,
    mapped_at timestamp with time zone DEFAULT now(),
    CONSTRAINT nppes_org_to_ror_confidence_check CHECK ((confidence = ANY (ARRAY['high'::text, 'medium'::text, 'no_match'::text])))
);


--
-- Name: nsclc_oracle_counts_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsclc_oracle_counts_20260720 (
    hcps_v2_total bigint,
    nsclc_hcp_count bigint,
    nsclc_link_count bigint,
    dedup_merge_total bigint,
    captured_at timestamp with time zone
);


--
-- Name: nsclc_oracle_counts_postcleanup_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsclc_oracle_counts_postcleanup_20260720 (
    hcps_v2_total bigint,
    nsclc_hcp_count bigint,
    dedup_merge_total bigint,
    captured_at timestamp with time zone
);


--
-- Name: nsclc_oracle_hcpset_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsclc_oracle_hcpset_20260720 (
    id uuid,
    preferred_display_name text,
    first_name text,
    last_name text,
    total_career_pubs integer,
    career_first_pub_year_v2 integer,
    cohort_classification text,
    cohort_score numeric
);


--
-- Name: nsclc_oracle_merges_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nsclc_oracle_merges_20260720 (
    id uuid,
    canonical_hcp_id uuid,
    merged_hcp_id uuid,
    merge_pass text,
    merge_signals jsonb,
    merged_at timestamp with time zone,
    original_canonical_data jsonb,
    original_merged_data jsonb,
    fk_updates_count jsonb
);


--
-- Name: openalex_author_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openalex_author_inventory (
    openalex_author_id text NOT NULL,
    display_name text,
    last_known_institution text,
    last_known_institution_ror text,
    orcid text,
    corpus_pub_count integer NOT NULL,
    first_seen_pub_year integer,
    last_seen_pub_year integer,
    has_matching_hcp boolean DEFAULT false,
    matching_hcp_id uuid,
    inventoried_at timestamp with time zone DEFAULT now()
);


--
-- Name: openalex_author_inventory_pre_ad_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openalex_author_inventory_pre_ad_backup (
    openalex_author_id text,
    display_name text,
    last_known_institution text,
    last_known_institution_ror text,
    orcid text,
    corpus_pub_count integer,
    first_seen_pub_year integer,
    last_seen_pub_year integer,
    has_matching_hcp boolean,
    matching_hcp_id uuid,
    inventoried_at timestamp with time zone
);


--
-- Name: openalex_author_inventory_pre_cycletest_20260720; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openalex_author_inventory_pre_cycletest_20260720 (
    openalex_author_id text,
    display_name text,
    last_known_institution text,
    last_known_institution_ror text,
    orcid text,
    corpus_pub_count integer,
    first_seen_pub_year integer,
    last_seen_pub_year integer,
    has_matching_hcp boolean,
    matching_hcp_id uuid,
    inventoried_at timestamp with time zone
);


--
-- Name: openalex_author_inventory_pre_reingest_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.openalex_author_inventory_pre_reingest_backup (
    openalex_author_id text,
    corpus_pub_count integer,
    last_seen_pub_year integer,
    display_name text,
    last_known_institution text,
    last_known_institution_ror text,
    orcid text
);


--
-- Name: pipeline_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_name text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status text NOT NULL,
    rows_processed integer DEFAULT 0,
    rows_succeeded integer DEFAULT 0,
    rows_flagged integer DEFAULT 0,
    rows_failed integer DEFAULT 0,
    metrics jsonb,
    error_message text,
    triggered_by text
);


--
-- Name: pub_authors_v2_ad_july_detour_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pub_authors_v2_ad_july_detour_backup (
    publication_id uuid,
    hcp_id uuid,
    author_position integer,
    is_first_author boolean,
    is_senior_author boolean,
    total_authors integer,
    openalex_author_id text,
    disambiguation_method text,
    disambiguation_confidence text,
    linked_at timestamp with time zone
);


--
-- Name: publication_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_authors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    publication_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    author_position text,
    is_corresponding boolean,
    openalex_author_id text,
    affiliation_at_publication text,
    match_method text,
    match_confidence text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: publication_authors_backup_20260520; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_authors_backup_20260520 (
    id uuid,
    publication_id uuid,
    hcp_id uuid,
    author_position text,
    is_corresponding boolean,
    openalex_author_id text,
    affiliation_at_publication text,
    match_method text,
    match_confidence text,
    created_at timestamp with time zone
);


--
-- Name: publication_authors_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_authors_v2 (
    publication_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    author_position integer,
    is_first_author boolean,
    is_senior_author boolean,
    total_authors integer,
    openalex_author_id text,
    disambiguation_method text,
    disambiguation_confidence text,
    linked_at timestamp with time zone DEFAULT now()
);


--
-- Name: publication_theme_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_theme_v1 (
    publication_id uuid NOT NULL,
    canonical_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    score real NOT NULL,
    method text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    labeler_version text NOT NULL,
    labeled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT publication_theme_v1_method_chk CHECK ((method = ANY (ARRAY['concept'::text, 'keyword'::text, 'mesh'::text, 'hybrid'::text, 'llm_tiebreak'::text])))
);


--
-- Name: publication_therapeutic_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_therapeutic_areas (
    publication_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    source text,
    tagged_at timestamp with time zone DEFAULT now()
);


--
-- Name: publication_therapeutic_areas_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publication_therapeutic_areas_v2 (
    publication_id uuid NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    source text,
    tagged_at timestamp with time zone DEFAULT now()
);


--
-- Name: publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    pubmed_id text NOT NULL,
    title text,
    journal text,
    pub_year integer,
    citation_count integer DEFAULT 0,
    doi text,
    ingested_at timestamp with time zone DEFAULT now(),
    citation_counts_by_year jsonb,
    authorships jsonb,
    primary_location jsonb,
    publication_type text,
    openalex_concepts jsonb,
    open_access jsonb,
    openalex_enriched_at timestamp with time zone,
    abstract text,
    pub_date date,
    pubmed_authorships jsonb,
    mesh_terms text[],
    publication_types text[],
    language text,
    source_therapeutic_area_id uuid,
    source text
);


--
-- Name: publications_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publications_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pubmed_id text,
    doi text,
    openalex_work_id text,
    title text,
    abstract text,
    journal text,
    pub_year integer,
    pub_date date,
    language text,
    pubmed_authorships jsonb,
    mesh_terms text[],
    publication_types text[],
    citation_count integer,
    citation_counts_by_year jsonb,
    openalex_enriched_at timestamp with time zone,
    source_therapeutic_area_id uuid,
    source text NOT NULL,
    ingested_at timestamp with time zone DEFAULT now(),
    ingestion_run_id uuid,
    authorships jsonb,
    primary_location jsonb,
    publication_type text,
    openalex_concepts jsonb,
    open_access jsonb
);


--
-- Name: publications_v2_ad_contaminated_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publications_v2_ad_contaminated_backup (
    id uuid,
    pubmed_id text,
    doi text,
    openalex_work_id text,
    title text,
    abstract text,
    journal text,
    pub_year integer,
    pub_date date,
    language text,
    pubmed_authorships jsonb,
    mesh_terms text[],
    publication_types text[],
    citation_count integer,
    citation_counts_by_year jsonb,
    openalex_enriched_at timestamp with time zone,
    source_therapeutic_area_id uuid,
    source text,
    ingested_at timestamp with time zone,
    ingestion_run_id uuid,
    authorships jsonb,
    primary_location jsonb,
    publication_type text,
    openalex_concepts jsonb,
    open_access jsonb
);


--
-- Name: pulse_ai_synthesis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulse_ai_synthesis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ta_slug text NOT NULL,
    window_start date NOT NULL,
    window_end date NOT NULL,
    body text NOT NULL,
    model_used text,
    prompt_tokens integer,
    completion_tokens integer,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pulse_concept_blocklist_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulse_concept_blocklist_v1 (
    concept_name text NOT NULL,
    reason text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pulse_preflight_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pulse_preflight_concepts (
    publication_id uuid,
    concept_id text,
    concept_name text,
    concept_score real,
    concept_level integer
);


--
-- Name: reference_institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_institutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    match_patterns text[] NOT NULL,
    institution_type text NOT NULL,
    is_coe boolean NOT NULL,
    nci_designation text,
    primary_state text,
    network_parent text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reference_institutions_institution_type_check CHECK ((institution_type = ANY (ARRAY['nci_cancer_center'::text, 'aamc_medical_school'::text, 'teaching_hospital'::text, 'transplant_center'::text, 'academic_idn'::text, 'community_idn'::text, 'va_facility'::text, 'pediatric_facility'::text])))
);


--
-- Name: region_countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_countries (
    region_key text NOT NULL,
    country_code text NOT NULL
);


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    region_key text NOT NULL,
    display_name text NOT NULL,
    sort_order integer NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    is_catchall boolean DEFAULT false NOT NULL
);


--
-- Name: reingest_diff_summary_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reingest_diff_summary_v2 (
    diff_run_id uuid NOT NULL,
    ta_slug text NOT NULL,
    computed_at timestamp with time zone NOT NULL,
    new_rising_stars integer DEFAULT 0 NOT NULL,
    promotions integer DEFAULT 0 NOT NULL,
    movers_up integer DEFAULT 0 NOT NULL,
    movers_down integer DEFAULT 0 NOT NULL,
    new_entrants integer DEFAULT 0 NOT NULL,
    dropped_outs integer DEFAULT 0 NOT NULL,
    hcps_with_new_pubs integer DEFAULT 0 NOT NULL,
    total_hcps_changed integer DEFAULT 0 NOT NULL,
    activity_level text NOT NULL,
    CONSTRAINT reingest_diff_summary_v2_activity_level_check CHECK ((activity_level = ANY (ARRAY['quiet'::text, 'moderate'::text, 'busy'::text])))
);


--
-- Name: reingest_diff_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reingest_diff_v2 (
    diff_run_id uuid NOT NULL,
    ta_slug text NOT NULL,
    computed_at timestamp with time zone NOT NULL,
    hcp_id uuid NOT NULL,
    hcp_display_name text,
    change_type text NOT NULL,
    before_cohort text,
    after_cohort text,
    before_rank integer,
    after_rank integer,
    rank_delta integer,
    before_pub_count integer,
    after_pub_count integer,
    pub_delta integer,
    magnitude numeric NOT NULL,
    why_context text,
    CONSTRAINT reingest_diff_v2_change_type_check CHECK ((change_type = ANY (ARRAY['new_rising_star'::text, 'cohort_promotion'::text, 'rank_mover_up'::text, 'rank_mover_down'::text, 'new_entrant'::text, 'new_publications'::text, 'dropped_out'::text])))
);


--
-- Name: reingest_snapshot_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reingest_snapshot_v2 (
    snapshot_id uuid NOT NULL,
    hcp_id uuid NOT NULL,
    ta_slug text NOT NULL,
    cohort text,
    cohort_score numeric,
    rank integer,
    pub_count integer,
    captured_at timestamp with time zone NOT NULL
);


--
-- Name: ror_to_country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ror_to_country (
    ror_id text NOT NULL,
    country_code text,
    country_name text,
    ror_name text,
    enriched_at timestamp with time zone DEFAULT now()
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    platform_post_id text NOT NULL,
    handle text NOT NULL,
    display_name text,
    post_text text,
    posted_at timestamp with time zone NOT NULL,
    engagement_likes integer DEFAULT 0,
    engagement_replies integer DEFAULT 0,
    engagement_reposts integer DEFAULT 0,
    engagement_quotes integer DEFAULT 0,
    hashtags text[] DEFAULT '{}'::text[],
    captured_at timestamp with time zone DEFAULT now(),
    captured_via_query text,
    CONSTRAINT social_posts_platform_check CHECK ((platform = ANY (ARRAY['twitter'::text, 'bluesky'::text])))
);


--
-- Name: social_posts_backup_pre_nash_cleanup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_posts_backup_pre_nash_cleanup (
    id uuid,
    platform text,
    platform_post_id text,
    handle text,
    display_name text,
    post_text text,
    posted_at timestamp with time zone,
    engagement_likes integer,
    engagement_replies integer,
    engagement_reposts integer,
    engagement_quotes integer,
    hashtags text[],
    captured_at timestamp with time zone,
    captured_via_query text
);


--
-- Name: social_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    handle text NOT NULL,
    display_name text,
    bio text,
    location text,
    website text,
    follower_count integer,
    following_count integer,
    post_count integer,
    verified boolean DEFAULT false,
    profile_url text,
    profile_fetched_at timestamp with time zone DEFAULT now(),
    data_quality_flag text DEFAULT 'clean'::text,
    CONSTRAINT social_users_data_quality_flag_check CHECK ((data_quality_flag = ANY (ARRAY['clean'::text, 'suspicious'::text, 'rejected'::text]))),
    CONSTRAINT social_users_platform_check CHECK ((platform = ANY (ARRAY['twitter'::text, 'bluesky'::text])))
);


--
-- Name: social_users_backup_pre_nash_cleanup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_users_backup_pre_nash_cleanup (
    id uuid,
    platform text,
    handle text,
    display_name text,
    bio text,
    location text,
    website text,
    follower_count integer,
    following_count integer,
    post_count integer,
    verified boolean,
    profile_url text,
    profile_fetched_at timestamp with time zone,
    data_quality_flag text
);


--
-- Name: staging_us_institution_to_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staging_us_institution_to_state (
    institution_normalized text NOT NULL,
    state text NOT NULL
);


--
-- Name: ta_clinical_taxonomies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ta_clinical_taxonomies (
    therapeutic_area_id uuid NOT NULL,
    taxonomy_code text NOT NULL,
    notes text,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: ta_cohort_counts_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ta_cohort_counts_cache (
    therapeutic_area_id uuid NOT NULL,
    rising_stars bigint DEFAULT 0 NOT NULL,
    dark_horses bigint DEFAULT 0 NOT NULL,
    community bigint DEFAULT 0 NOT NULL,
    workhorses bigint DEFAULT 0 NOT NULL,
    refreshed_at timestamp with time zone DEFAULT now() NOT NULL,
    total_hcps bigint
);


--
-- Name: ta_drug_keywords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ta_drug_keywords (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    drug_name text NOT NULL,
    drug_brand_name text,
    drug_generic_name text,
    is_primary_signal boolean DEFAULT true,
    launch_year integer,
    withdrawal_year integer,
    market_position text,
    expected_recipient_profile text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ta_hcpcs_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ta_hcpcs_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    therapeutic_area_id uuid NOT NULL,
    hcpcs_code text NOT NULL,
    code_description text,
    code_category text NOT NULL,
    is_primary_signal boolean DEFAULT true,
    requires_specialty_match boolean DEFAULT false,
    specialty_match_patterns text[],
    approval_year integer,
    withdrawal_year integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: theme_canonical_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_canonical_v1 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_name text NOT NULL,
    description text,
    therapeutic_area text NOT NULL,
    display_order integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: theme_concept_signature_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_concept_signature_v1 (
    canonical_id uuid NOT NULL,
    concept_name text NOT NULL,
    concept_id text,
    weight real DEFAULT 1.0 NOT NULL,
    can_set_primary boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: theme_keyword_signature_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_keyword_signature_v1 (
    canonical_id uuid NOT NULL,
    term text NOT NULL,
    match_mode text DEFAULT 'substring'::text NOT NULL,
    field_scope text DEFAULT 'title'::text NOT NULL,
    weight real DEFAULT 1.0 NOT NULL,
    can_set_primary boolean DEFAULT true NOT NULL,
    observed_title_hits integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT theme_keyword_signature_v1_field_scope_chk CHECK ((field_scope = ANY (ARRAY['title'::text, 'title_abstract'::text]))),
    CONSTRAINT theme_keyword_signature_v1_match_mode_chk CHECK ((match_mode = ANY (ARRAY['substring'::text, 'word'::text])))
);


--
-- Name: theme_to_canonical_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.theme_to_canonical_v1 (
    raw_theme_name text NOT NULL,
    therapeutic_area text NOT NULL,
    canonical_id uuid NOT NULL,
    confidence text,
    assigned_at timestamp with time zone DEFAULT now()
);


--
-- Name: therapeutic_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.therapeutic_areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    parent_ta_id uuid,
    ta_level text NOT NULL,
    CONSTRAINT therapeutic_areas_ta_level_check CHECK ((ta_level = ANY (ARRAY['broad_ta'::text, 'indication'::text])))
);


--
-- Name: tracked_conferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracked_conferences (
    slug text NOT NULL,
    display_name text NOT NULL,
    hashtag_patterns text[] NOT NULL,
    start_date date,
    end_date date,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: trial_backfill_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_backfill_progress (
    nct_id text NOT NULL,
    processed_at timestamp with time zone DEFAULT now(),
    officials_added integer,
    contacts_added integer,
    skipped_existing integer,
    status text,
    error_message text
);


--
-- Name: trial_investigator_match_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_investigator_match_proposals (
    id bigint NOT NULL,
    trial_investigator_id uuid NOT NULL,
    proposed_hcp_id uuid,
    proposed_match_confidence integer,
    proposed_match_status text,
    candidate_count integer,
    decision_path text,
    raw_first_name text,
    raw_last_name text,
    raw_facility text,
    raw_city text,
    raw_state text,
    hcp_first_name text,
    hcp_last_name text,
    hcp_institution_short text,
    hcp_city text,
    hcp_state text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: trial_investigator_match_proposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trial_investigator_match_proposals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trial_investigator_match_proposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trial_investigator_match_proposals_id_seq OWNED BY public.trial_investigator_match_proposals.id;


--
-- Name: trial_investigator_match_proposals_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_investigator_match_proposals_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trial_investigator_id uuid NOT NULL,
    proposed_hcp_id uuid,
    proposed_match_confidence integer,
    proposed_match_status text NOT NULL,
    candidate_count integer,
    decision_path text,
    raw_first_name text,
    raw_last_name text,
    raw_facility text,
    raw_city text,
    raw_state text,
    hcp_first_name text,
    hcp_last_name text,
    hcp_institution_normalized text,
    hcp_city text,
    hcp_state text,
    proposed_at timestamp with time zone DEFAULT now(),
    applied_at timestamp with time zone
);


--
-- Name: trial_investigators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_investigators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    trial_id uuid NOT NULL,
    role text,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    match_confidence integer,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    source text,
    match_status text
);


--
-- Name: trial_investigators_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_investigators_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid,
    trial_id uuid NOT NULL,
    role text NOT NULL,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    match_confidence integer,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    investigator_raw_middle_name text
);


--
-- Name: trial_investigators_v2_backup_20260706; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trial_investigators_v2_backup_20260706 (
    id uuid,
    hcp_id uuid,
    trial_id uuid,
    role text,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    match_confidence integer,
    source text,
    created_at timestamp with time zone,
    investigator_raw_middle_name text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    linkedin_id text NOT NULL,
    email text,
    full_name text,
    role_verified text,
    institution text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    role text,
    organization text,
    ta_interest text,
    source text DEFAULT 'landing'::text,
    referrer text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wipe_candidates_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wipe_candidates_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hcp_id uuid NOT NULL,
    first_name text,
    last_name text,
    institution text,
    city text,
    state text,
    country text,
    source text,
    created_at_original timestamp with time zone,
    reason_for_wipe text,
    audit_run_id text,
    audited_at timestamp with time zone DEFAULT now(),
    deletion_status text DEFAULT 'pending'::text
);


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binary_payload bytea
)
PARTITION BY RANGE (inserted_at);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    selected_columns text[],
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: excluded_institutions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excluded_institutions ALTER COLUMN id SET DEFAULT nextval('public.excluded_institutions_id_seq'::regclass);


--
-- Name: trial_investigator_match_proposals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals ALTER COLUMN id SET DEFAULT nextval('public.trial_investigator_match_proposals_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: ad_pubs_delete_list ad_pubs_delete_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_pubs_delete_list
    ADD CONSTRAINT ad_pubs_delete_list_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (user_id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: clinical_trials clinical_trials_nct_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials
    ADD CONSTRAINT clinical_trials_nct_id_key UNIQUE (nct_id);


--
-- Name: clinical_trials clinical_trials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials
    ADD CONSTRAINT clinical_trials_pkey PRIMARY KEY (id);


--
-- Name: clinical_trials_ta_v2 clinical_trials_ta_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials_ta_v2
    ADD CONSTRAINT clinical_trials_ta_v2_pkey PRIMARY KEY (trial_id, therapeutic_area_id);


--
-- Name: clinical_trials_v2 clinical_trials_v2_nct_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials_v2
    ADD CONSTRAINT clinical_trials_v2_nct_id_key UNIQUE (nct_id);


--
-- Name: clinical_trials_v2 clinical_trials_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials_v2
    ADD CONSTRAINT clinical_trials_v2_pkey PRIMARY KEY (id);


--
-- Name: cohort_overrides cohort_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_overrides
    ADD CONSTRAINT cohort_overrides_pkey PRIMARY KEY (id);


--
-- Name: community_practitioner_payments community_practitioner_payments_npi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_practitioner_payments
    ADD CONSTRAINT community_practitioner_payments_npi_key UNIQUE (npi_number);


--
-- Name: community_practitioner_payments community_practitioner_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_practitioner_payments
    ADD CONSTRAINT community_practitioner_payments_pkey PRIMARY KEY (id);


--
-- Name: community_practitioners community_practitioners_npi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_practitioners
    ADD CONSTRAINT community_practitioners_npi_key UNIQUE (npi_number);


--
-- Name: community_practitioners community_practitioners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_practitioners
    ADD CONSTRAINT community_practitioners_pkey PRIMARY KEY (id);


--
-- Name: congress_abstracts congress_abstracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.congress_abstracts
    ADD CONSTRAINT congress_abstracts_pkey PRIMARY KEY (abstract_number);


--
-- Name: congress_confirmed_presenters congress_confirmed_presenters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.congress_confirmed_presenters
    ADD CONSTRAINT congress_confirmed_presenters_pkey PRIMARY KEY (congress_slug, speaker_key);


--
-- Name: curated_ta_concepts curated_ta_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_ta_concepts
    ADD CONSTRAINT curated_ta_concepts_pkey PRIMARY KEY (therapeutic_area_id, openalex_concept_id);


--
-- Name: dedup_merge_log dedup_merge_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dedup_merge_log
    ADD CONSTRAINT dedup_merge_log_pkey PRIMARY KEY (id);


--
-- Name: dol_canonical_overrides dol_canonical_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_canonical_overrides
    ADD CONSTRAINT dol_canonical_overrides_pkey PRIMARY KEY (hcp_id, social_user_id);


--
-- Name: dol_matches dol_matches_hcp_id_social_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches
    ADD CONSTRAINT dol_matches_hcp_id_social_user_id_key UNIQUE (hcp_id, social_user_id);


--
-- Name: dol_matches dol_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches
    ADD CONSTRAINT dol_matches_pkey PRIMARY KEY (id);


--
-- Name: dol_matches_v2 dol_matches_v2_hcp_id_social_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches_v2
    ADD CONSTRAINT dol_matches_v2_hcp_id_social_user_id_key UNIQUE (hcp_id, social_user_id);


--
-- Name: dol_matches_v2 dol_matches_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches_v2
    ADD CONSTRAINT dol_matches_v2_pkey PRIMARY KEY (id);


--
-- Name: excluded_institutions excluded_institutions_match_type_match_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excluded_institutions
    ADD CONSTRAINT excluded_institutions_match_type_match_value_key UNIQUE (match_type, match_value);


--
-- Name: excluded_institutions excluded_institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excluded_institutions
    ADD CONSTRAINT excluded_institutions_pkey PRIMARY KEY (id);


--
-- Name: excluded_taxonomies excluded_taxonomies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excluded_taxonomies
    ADD CONSTRAINT excluded_taxonomies_pkey PRIMARY KEY (taxonomy_code);


--
-- Name: hcp_affiliation_profile_v2 hcp_affiliation_profile_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_affiliation_profile_v2
    ADD CONSTRAINT hcp_affiliation_profile_v2_pkey PRIMARY KEY (hcp_id);


--
-- Name: hcp_ai_overviews hcp_ai_overviews_hcp_id_synthesis_type_therapeutic_area_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_ai_overviews
    ADD CONSTRAINT hcp_ai_overviews_hcp_id_synthesis_type_therapeutic_area_key UNIQUE (hcp_id, synthesis_type, therapeutic_area);


--
-- Name: hcp_ai_overviews hcp_ai_overviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_ai_overviews
    ADD CONSTRAINT hcp_ai_overviews_pkey PRIMARY KEY (id);


--
-- Name: hcp_author_metrics_v2 hcp_author_metrics_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_author_metrics_v2
    ADD CONSTRAINT hcp_author_metrics_v2_pkey PRIMARY KEY (hcp_id, snapshot_date);


--
-- Name: hcp_claims hcp_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_claims
    ADD CONSTRAINT hcp_claims_pkey PRIMARY KEY (id);


--
-- Name: hcp_cohort_classification_v2 hcp_cohort_classification_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_cohort_classification_v2
    ADD CONSTRAINT hcp_cohort_classification_v2_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_community_scores_v2 hcp_community_scores_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_community_scores_v2
    ADD CONSTRAINT hcp_community_scores_v2_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_community_snapshots hcp_community_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_community_snapshots
    ADD CONSTRAINT hcp_community_snapshots_pkey PRIMARY KEY (id);


--
-- Name: hcp_established_ranks_v3 hcp_established_ranks_v3_hcp_ta_scope_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_ranks_v3
    ADD CONSTRAINT hcp_established_ranks_v3_hcp_ta_scope_uq UNIQUE NULLS NOT DISTINCT (hcp_id, therapeutic_area_id, scope_type, scope_value);


--
-- Name: hcp_established_ranks_v3 hcp_established_ranks_v3_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_ranks_v3
    ADD CONSTRAINT hcp_established_ranks_v3_pkey PRIMARY KEY (id);


--
-- Name: hcp_established_scores_v2 hcp_established_scores_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_scores_v2
    ADD CONSTRAINT hcp_established_scores_v2_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_established_snapshots hcp_established_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_snapshots
    ADD CONSTRAINT hcp_established_snapshots_pkey PRIMARY KEY (id);


--
-- Name: hcp_industry_classification_v1 hcp_industry_classification_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_industry_classification_v1
    ADD CONSTRAINT hcp_industry_classification_v1_pkey PRIMARY KEY (hcp_id);


--
-- Name: hcp_institutions_v2 hcp_institutions_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_institutions_v2
    ADD CONSTRAINT hcp_institutions_v2_pkey PRIMARY KEY (hcp_id, reference_institution_id);


--
-- Name: hcp_leadership_evidence hcp_leadership_evidence_hcp_id_role_type_organization_sourc_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_leadership_evidence
    ADD CONSTRAINT hcp_leadership_evidence_hcp_id_role_type_organization_sourc_key UNIQUE (hcp_id, role_type, organization, source_url);


--
-- Name: hcp_leadership_evidence hcp_leadership_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_leadership_evidence
    ADD CONSTRAINT hcp_leadership_evidence_pkey PRIMARY KEY (id);


--
-- Name: hcp_medicare_by_ta hcp_medicare_by_ta_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta
    ADD CONSTRAINT hcp_medicare_by_ta_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_medicare_by_ta hcp_medicare_by_ta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta
    ADD CONSTRAINT hcp_medicare_by_ta_pkey PRIMARY KEY (id);


--
-- Name: hcp_medicare_by_ta_v2 hcp_medicare_by_ta_v2_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta_v2
    ADD CONSTRAINT hcp_medicare_by_ta_v2_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_medicare_by_ta_v2 hcp_medicare_by_ta_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta_v2
    ADD CONSTRAINT hcp_medicare_by_ta_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_medicare_summary hcp_medicare_summary_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_summary
    ADD CONSTRAINT hcp_medicare_summary_hcp_id_key UNIQUE (hcp_id);


--
-- Name: hcp_medicare_summary hcp_medicare_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_summary
    ADD CONSTRAINT hcp_medicare_summary_pkey PRIMARY KEY (id);


--
-- Name: hcp_medicare_summary_v2 hcp_medicare_summary_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_summary_v2
    ADD CONSTRAINT hcp_medicare_summary_v2_pkey PRIMARY KEY (hcp_id);


--
-- Name: hcp_narratives hcp_narratives_hcp_id_therapeutic_area_id_model_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives
    ADD CONSTRAINT hcp_narratives_hcp_id_therapeutic_area_id_model_version_key UNIQUE (hcp_id, therapeutic_area_id, model_version);


--
-- Name: hcp_narratives hcp_narratives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives
    ADD CONSTRAINT hcp_narratives_pkey PRIMARY KEY (id);


--
-- Name: hcp_narratives_v2 hcp_narratives_v2_hcp_id_therapeutic_area_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives_v2
    ADD CONSTRAINT hcp_narratives_v2_hcp_id_therapeutic_area_slug_key UNIQUE (hcp_id, therapeutic_area_slug);


--
-- Name: hcp_narratives_v2 hcp_narratives_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives_v2
    ADD CONSTRAINT hcp_narratives_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_network_centrality_v2 hcp_network_centrality_v2_hcp_id_therapeutic_area_id_window_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_network_centrality_v2
    ADD CONSTRAINT hcp_network_centrality_v2_hcp_id_therapeutic_area_id_window_key UNIQUE (hcp_id, therapeutic_area_id, window_type);


--
-- Name: hcp_network_centrality_v2 hcp_network_centrality_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_network_centrality_v2
    ADD CONSTRAINT hcp_network_centrality_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_network_momentum_v1 hcp_network_momentum_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_network_momentum_v1
    ADD CONSTRAINT hcp_network_momentum_v1_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_nppes_detail_v2 hcp_nppes_detail_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_nppes_detail_v2
    ADD CONSTRAINT hcp_nppes_detail_v2_pkey PRIMARY KEY (hcp_id);


--
-- Name: hcp_open_payments_by_drug_v2 hcp_open_payments_by_drug_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_drug_v2
    ADD CONSTRAINT hcp_open_payments_by_drug_v2_pkey PRIMARY KEY (hcp_id, drug_name, manufacturer_name);


--
-- Name: hcp_open_payments_by_ta hcp_open_payments_by_ta_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta
    ADD CONSTRAINT hcp_open_payments_by_ta_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_open_payments_by_ta hcp_open_payments_by_ta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta
    ADD CONSTRAINT hcp_open_payments_by_ta_pkey PRIMARY KEY (id);


--
-- Name: hcp_open_payments_by_ta_v2 hcp_open_payments_by_ta_v2_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta_v2
    ADD CONSTRAINT hcp_open_payments_by_ta_v2_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_open_payments_by_ta_v2 hcp_open_payments_by_ta_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta_v2
    ADD CONSTRAINT hcp_open_payments_by_ta_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_open_payments_summary hcp_open_payments_summary_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_summary
    ADD CONSTRAINT hcp_open_payments_summary_hcp_id_key UNIQUE (hcp_id);


--
-- Name: hcp_open_payments_summary hcp_open_payments_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_summary
    ADD CONSTRAINT hcp_open_payments_summary_pkey PRIMARY KEY (id);


--
-- Name: hcp_open_payments_summary_v2 hcp_open_payments_summary_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_summary_v2
    ADD CONSTRAINT hcp_open_payments_summary_v2_pkey PRIMARY KEY (hcp_id);


--
-- Name: hcp_open_payments_top_companies hcp_open_payments_top_companies_hcp_id_manufacturer_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies
    ADD CONSTRAINT hcp_open_payments_top_companies_hcp_id_manufacturer_name_key UNIQUE (hcp_id, manufacturer_name);


--
-- Name: hcp_open_payments_top_companies hcp_open_payments_top_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies
    ADD CONSTRAINT hcp_open_payments_top_companies_pkey PRIMARY KEY (id);


--
-- Name: hcp_open_payments_top_companies_v2 hcp_open_payments_top_companies_v2_hcp_id_manufacturer_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies_v2
    ADD CONSTRAINT hcp_open_payments_top_companies_v2_hcp_id_manufacturer_name_key UNIQUE (hcp_id, manufacturer_name);


--
-- Name: hcp_open_payments_top_companies_v2 hcp_open_payments_top_companies_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies_v2
    ADD CONSTRAINT hcp_open_payments_top_companies_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_openalex_authors hcp_openalex_authors_hcp_id_openalex_author_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_openalex_authors
    ADD CONSTRAINT hcp_openalex_authors_hcp_id_openalex_author_id_key UNIQUE (hcp_id, openalex_author_id);


--
-- Name: hcp_openalex_authors hcp_openalex_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_openalex_authors
    ADD CONSTRAINT hcp_openalex_authors_pkey PRIMARY KEY (id);


--
-- Name: hcp_openalex_authors_v2 hcp_openalex_authors_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_openalex_authors_v2
    ADD CONSTRAINT hcp_openalex_authors_v2_pkey PRIMARY KEY (hcp_id, openalex_author_id);


--
-- Name: hcp_pharma_engagement_v2 hcp_pharma_engagement_v2_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_pharma_engagement_v2
    ADD CONSTRAINT hcp_pharma_engagement_v2_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_pharma_engagement_v2 hcp_pharma_engagement_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_pharma_engagement_v2
    ADD CONSTRAINT hcp_pharma_engagement_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_publication_leadership_v2 hcp_publication_leadership_v2_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_publication_leadership_v2
    ADD CONSTRAINT hcp_publication_leadership_v2_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_publication_leadership_v2 hcp_publication_leadership_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_publication_leadership_v2
    ADD CONSTRAINT hcp_publication_leadership_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_research_themes_v2 hcp_research_themes_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_research_themes_v2
    ADD CONSTRAINT hcp_research_themes_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_rising_composite_v1 hcp_rising_composite_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_rising_composite_v1
    ADD CONSTRAINT hcp_rising_composite_v1_pkey PRIMARY KEY (id);


--
-- Name: hcp_rising_composite_v1 hcp_rising_composite_v1_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_rising_composite_v1
    ADD CONSTRAINT hcp_rising_composite_v1_scope_key UNIQUE (hcp_id, therapeutic_area_id, scope_type, scope_value);


--
-- Name: hcp_rising_star_ranks_v3 hcp_rising_star_ranks_v3_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_rising_star_ranks_v3
    ADD CONSTRAINT hcp_rising_star_ranks_v3_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_rising_star_snapshots hcp_rising_star_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_rising_star_snapshots
    ADD CONSTRAINT hcp_rising_star_snapshots_pkey PRIMARY KEY (id);


--
-- Name: hcp_rising_star_snapshots hcp_rising_star_snapshots_snapshot_date_hcp_id_therapeutic__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_rising_star_snapshots
    ADD CONSTRAINT hcp_rising_star_snapshots_snapshot_date_hcp_id_therapeutic__key UNIQUE (snapshot_date, hcp_id, therapeutic_area_id);


--
-- Name: hcp_scientific_emergence_v1 hcp_scientific_emergence_v1_hcp_ta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_emergence_v1
    ADD CONSTRAINT hcp_scientific_emergence_v1_hcp_ta_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_scientific_emergence_v1 hcp_scientific_emergence_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_emergence_v1
    ADD CONSTRAINT hcp_scientific_emergence_v1_pkey PRIMARY KEY (id);


--
-- Name: hcp_scientific_momentum_v1 hcp_scientific_momentum_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_momentum_v1
    ADD CONSTRAINT hcp_scientific_momentum_v1_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_scientific_positions_v1 hcp_scientific_positions_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_positions_v1
    ADD CONSTRAINT hcp_scientific_positions_v1_pkey PRIMARY KEY (id);


--
-- Name: hcp_score_ranks_v2 hcp_score_ranks_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_score_ranks_v2
    ADD CONSTRAINT hcp_score_ranks_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_score_ranks_v2 hcp_score_ranks_v2_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_score_ranks_v2
    ADD CONSTRAINT hcp_score_ranks_v2_unique UNIQUE NULLS NOT DISTINCT (hcp_id, therapeutic_area_id, cohort, scope_type, scope_value);


--
-- Name: hcp_scores hcp_scores_hcp_ta_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores
    ADD CONSTRAINT hcp_scores_hcp_ta_unique UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_scores hcp_scores_hcp_ta_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores
    ADD CONSTRAINT hcp_scores_hcp_ta_version_unique UNIQUE (hcp_id, therapeutic_area_id, score_version);


--
-- Name: hcp_scores hcp_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores
    ADD CONSTRAINT hcp_scores_pkey PRIMARY KEY (id);


--
-- Name: hcp_scores_v2 hcp_scores_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores_v2
    ADD CONSTRAINT hcp_scores_v2_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_therapeutic_areas hcp_therapeutic_areas_hcp_id_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas
    ADD CONSTRAINT hcp_therapeutic_areas_hcp_id_therapeutic_area_id_key UNIQUE (hcp_id, therapeutic_area_id);


--
-- Name: hcp_therapeutic_areas hcp_therapeutic_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas
    ADD CONSTRAINT hcp_therapeutic_areas_pkey PRIMARY KEY (id);


--
-- Name: hcp_therapeutic_areas_v2 hcp_therapeutic_areas_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas_v2
    ADD CONSTRAINT hcp_therapeutic_areas_v2_pkey PRIMARY KEY (hcp_id, therapeutic_area_id);


--
-- Name: hcp_top_collaborators_v2 hcp_top_collaborators_v2_hcp_id_therapeutic_area_id_window__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_top_collaborators_v2
    ADD CONSTRAINT hcp_top_collaborators_v2_hcp_id_therapeutic_area_id_window__key UNIQUE (hcp_id, therapeutic_area_id, window_type, rank);


--
-- Name: hcp_top_collaborators_v2 hcp_top_collaborators_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_top_collaborators_v2
    ADD CONSTRAINT hcp_top_collaborators_v2_pkey PRIMARY KEY (id);


--
-- Name: hcp_watchlist hcp_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_watchlist
    ADD CONSTRAINT hcp_watchlist_pkey PRIMARY KEY (id);


--
-- Name: hcp_watchlist hcp_watchlist_user_id_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_watchlist
    ADD CONSTRAINT hcp_watchlist_user_id_hcp_id_key UNIQUE (user_id, hcp_id);


--
-- Name: hcp_web_signals_v1 hcp_web_signals_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_web_signals_v1
    ADD CONSTRAINT hcp_web_signals_v1_pkey PRIMARY KEY (id);


--
-- Name: hcps hcps_name_institution_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps
    ADD CONSTRAINT hcps_name_institution_unique UNIQUE (first_name, last_name, institution);


--
-- Name: hcps hcps_npi_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps
    ADD CONSTRAINT hcps_npi_number_key UNIQUE (npi_number);


--
-- Name: hcps hcps_npi_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps
    ADD CONSTRAINT hcps_npi_number_unique UNIQUE (npi_number);


--
-- Name: hcps hcps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps
    ADD CONSTRAINT hcps_pkey PRIMARY KEY (id);


--
-- Name: hcps_v2_ad_july_delete_list hcps_v2_ad_july_delete_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps_v2_ad_july_delete_list
    ADD CONSTRAINT hcps_v2_ad_july_delete_list_pkey PRIMARY KEY (id);


--
-- Name: hcps_v2 hcps_v2_identity_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps_v2
    ADD CONSTRAINT hcps_v2_identity_hash_key UNIQUE (identity_hash);


--
-- Name: hcps_v2 hcps_v2_npi_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps_v2
    ADD CONSTRAINT hcps_v2_npi_number_key UNIQUE (npi_number);


--
-- Name: hcps_v2 hcps_v2_orcid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps_v2
    ADD CONSTRAINT hcps_v2_orcid_key UNIQUE (orcid);


--
-- Name: hcps_v2 hcps_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcps_v2
    ADD CONSTRAINT hcps_v2_pkey PRIMARY KEY (id);


--
-- Name: institution_geo_lookup institution_geo_lookup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_geo_lookup
    ADD CONSTRAINT institution_geo_lookup_pkey PRIMARY KEY (id);


--
-- Name: institution_geo_lookup institution_geo_lookup_ror_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.institution_geo_lookup
    ADD CONSTRAINT institution_geo_lookup_ror_id_key UNIQUE (ror_id);


--
-- Name: invite_email_sends invite_email_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_email_sends
    ADD CONSTRAINT invite_email_sends_pkey PRIMARY KEY (id);


--
-- Name: invite_redemptions invite_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_redemptions
    ADD CONSTRAINT invite_redemptions_pkey PRIMARY KEY (id);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (code);


--
-- Name: msl_belief_claim_reactions msl_belief_claim_reactions_contributor_id_hcp_id_claim_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_belief_claim_reactions
    ADD CONSTRAINT msl_belief_claim_reactions_contributor_id_hcp_id_claim_key_key UNIQUE (contributor_id, hcp_id, claim_key);


--
-- Name: msl_belief_claim_reactions msl_belief_claim_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_belief_claim_reactions
    ADD CONSTRAINT msl_belief_claim_reactions_pkey PRIMARY KEY (id);


--
-- Name: msl_contributions msl_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_contributions
    ADD CONSTRAINT msl_contributions_pkey PRIMARY KEY (id);


--
-- Name: msl_hcp_briefs msl_hcp_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_briefs
    ADD CONSTRAINT msl_hcp_briefs_pkey PRIMARY KEY (id);


--
-- Name: msl_hcp_briefs msl_hcp_briefs_user_hcp_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_briefs
    ADD CONSTRAINT msl_hcp_briefs_user_hcp_key UNIQUE (user_id, hcp_id);


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_next_actions
    ADD CONSTRAINT msl_hcp_next_actions_pkey PRIMARY KEY (id);


--
-- Name: msl_hcp_notes msl_hcp_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_notes
    ADD CONSTRAINT msl_hcp_notes_pkey PRIMARY KEY (id);


--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationship_tags
    ADD CONSTRAINT msl_hcp_relationship_tags_pkey PRIMARY KEY (relationship_id, tag_id);


--
-- Name: msl_hcp_relationships msl_hcp_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationships
    ADD CONSTRAINT msl_hcp_relationships_pkey PRIMARY KEY (id);


--
-- Name: msl_hcp_relationships msl_hcp_relationships_user_id_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationships
    ADD CONSTRAINT msl_hcp_relationships_user_id_hcp_id_key UNIQUE (user_id, hcp_id);


--
-- Name: msl_pinned_institutions msl_pinned_institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_pinned_institutions
    ADD CONSTRAINT msl_pinned_institutions_pkey PRIMARY KEY (id);


--
-- Name: msl_pinned_institutions msl_pinned_institutions_user_id_institution_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_pinned_institutions
    ADD CONSTRAINT msl_pinned_institutions_user_id_institution_name_key UNIQUE (user_id, institution_name);


--
-- Name: msl_profiles msl_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_profiles
    ADD CONSTRAINT msl_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: msl_tags msl_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_tags
    ADD CONSTRAINT msl_tags_pkey PRIMARY KEY (id);


--
-- Name: msl_team_invites msl_team_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_team_invites
    ADD CONSTRAINT msl_team_invites_pkey PRIMARY KEY (id);


--
-- Name: msl_watchlist_items msl_watchlist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_watchlist_items
    ADD CONSTRAINT msl_watchlist_items_pkey PRIMARY KEY (watchlist_id, relationship_id);


--
-- Name: msl_watchlists msl_watchlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_watchlists
    ADD CONSTRAINT msl_watchlists_pkey PRIMARY KEY (id);


--
-- Name: nih_grant_investigators nih_grant_investigators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_grant_investigators
    ADD CONSTRAINT nih_grant_investigators_pkey PRIMARY KEY (core_project_num, hcp_id, role);


--
-- Name: nih_grants nih_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_grants
    ADD CONSTRAINT nih_grants_pkey PRIMARY KEY (core_project_num, fiscal_year);


--
-- Name: nih_merge_candidates nih_merge_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_merge_candidates
    ADD CONSTRAINT nih_merge_candidates_pkey PRIMARY KEY (id);


--
-- Name: nih_unmatched_researchers nih_unmatched_researchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_unmatched_researchers
    ADD CONSTRAINT nih_unmatched_researchers_pkey PRIMARY KEY (id);


--
-- Name: npi_match_proposals npi_match_proposals_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals
    ADD CONSTRAINT npi_match_proposals_hcp_id_key UNIQUE (hcp_id);


--
-- Name: npi_match_proposals npi_match_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals
    ADD CONSTRAINT npi_match_proposals_pkey PRIMARY KEY (id);


--
-- Name: npi_match_proposals_v2 npi_match_proposals_v2_hcp_id_npi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals_v2
    ADD CONSTRAINT npi_match_proposals_v2_hcp_id_npi_key UNIQUE (hcp_id, npi);


--
-- Name: npi_match_proposals_v2 npi_match_proposals_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals_v2
    ADD CONSTRAINT npi_match_proposals_v2_pkey PRIMARY KEY (id);


--
-- Name: nppes_enrichment_log nppes_enrichment_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nppes_enrichment_log
    ADD CONSTRAINT nppes_enrichment_log_pkey PRIMARY KEY (id);


--
-- Name: nppes_enrichment_log_v2 nppes_enrichment_log_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nppes_enrichment_log_v2
    ADD CONSTRAINT nppes_enrichment_log_v2_pkey PRIMARY KEY (id);


--
-- Name: nppes_org_to_ror nppes_org_to_ror_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nppes_org_to_ror
    ADD CONSTRAINT nppes_org_to_ror_pkey PRIMARY KEY (nppes_organization_name);


--
-- Name: openalex_author_inventory openalex_author_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.openalex_author_inventory
    ADD CONSTRAINT openalex_author_inventory_pkey PRIMARY KEY (openalex_author_id);


--
-- Name: pipeline_runs pipeline_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_runs
    ADD CONSTRAINT pipeline_runs_pkey PRIMARY KEY (id);


--
-- Name: publication_authors publication_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors
    ADD CONSTRAINT publication_authors_pkey PRIMARY KEY (id);


--
-- Name: publication_authors publication_authors_publication_id_hcp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors
    ADD CONSTRAINT publication_authors_publication_id_hcp_id_key UNIQUE (publication_id, hcp_id);


--
-- Name: publication_authors_v2 publication_authors_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors_v2
    ADD CONSTRAINT publication_authors_v2_pkey PRIMARY KEY (publication_id, hcp_id);


--
-- Name: publication_theme_v1 publication_theme_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_theme_v1
    ADD CONSTRAINT publication_theme_v1_pkey PRIMARY KEY (publication_id, canonical_id);


--
-- Name: publication_therapeutic_areas publication_therapeutic_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas
    ADD CONSTRAINT publication_therapeutic_areas_pkey PRIMARY KEY (publication_id, therapeutic_area_id);


--
-- Name: publication_therapeutic_areas_v2 publication_therapeutic_areas_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas_v2
    ADD CONSTRAINT publication_therapeutic_areas_v2_pkey PRIMARY KEY (publication_id, therapeutic_area_id);


--
-- Name: publications publications_hcp_pubmed_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_hcp_pubmed_unique UNIQUE (hcp_id, pubmed_id);


--
-- Name: publications publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_pkey PRIMARY KEY (id);


--
-- Name: publications_v2 publications_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications_v2
    ADD CONSTRAINT publications_v2_pkey PRIMARY KEY (id);


--
-- Name: publications_v2 publications_v2_pubmed_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications_v2
    ADD CONSTRAINT publications_v2_pubmed_id_key UNIQUE (pubmed_id);


--
-- Name: pulse_ai_synthesis pulse_ai_synthesis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse_ai_synthesis
    ADD CONSTRAINT pulse_ai_synthesis_pkey PRIMARY KEY (id);


--
-- Name: pulse_ai_synthesis pulse_ai_synthesis_ta_slug_window_start_window_end_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse_ai_synthesis
    ADD CONSTRAINT pulse_ai_synthesis_ta_slug_window_start_window_end_key UNIQUE (ta_slug, window_start, window_end);


--
-- Name: pulse_concept_blocklist_v1 pulse_concept_blocklist_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pulse_concept_blocklist_v1
    ADD CONSTRAINT pulse_concept_blocklist_v1_pkey PRIMARY KEY (concept_name);


--
-- Name: reference_institutions reference_institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_institutions
    ADD CONSTRAINT reference_institutions_pkey PRIMARY KEY (id);


--
-- Name: region_countries region_countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_countries
    ADD CONSTRAINT region_countries_pkey PRIMARY KEY (region_key, country_code);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (region_key);


--
-- Name: reingest_diff_summary_v2 reingest_diff_summary_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reingest_diff_summary_v2
    ADD CONSTRAINT reingest_diff_summary_v2_pkey PRIMARY KEY (diff_run_id);


--
-- Name: reingest_diff_v2 reingest_diff_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reingest_diff_v2
    ADD CONSTRAINT reingest_diff_v2_pkey PRIMARY KEY (diff_run_id, hcp_id);


--
-- Name: reingest_snapshot_v2 reingest_snapshot_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reingest_snapshot_v2
    ADD CONSTRAINT reingest_snapshot_v2_pkey PRIMARY KEY (snapshot_id, hcp_id);


--
-- Name: ror_to_country ror_to_country_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ror_to_country
    ADD CONSTRAINT ror_to_country_pkey PRIMARY KEY (ror_id);


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);


--
-- Name: social_posts social_posts_platform_platform_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts
    ADD CONSTRAINT social_posts_platform_platform_post_id_key UNIQUE (platform, platform_post_id);


--
-- Name: social_posts_v2 social_posts_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts_v2
    ADD CONSTRAINT social_posts_v2_pkey PRIMARY KEY (id);


--
-- Name: social_posts_v2 social_posts_v2_platform_platform_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_posts_v2
    ADD CONSTRAINT social_posts_v2_platform_platform_post_id_key UNIQUE (platform, platform_post_id);


--
-- Name: social_users social_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_users
    ADD CONSTRAINT social_users_pkey PRIMARY KEY (id);


--
-- Name: social_users social_users_platform_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_users
    ADD CONSTRAINT social_users_platform_handle_key UNIQUE (platform, handle);


--
-- Name: social_users_v2 social_users_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_users_v2
    ADD CONSTRAINT social_users_v2_pkey PRIMARY KEY (id);


--
-- Name: social_users_v2 social_users_v2_platform_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_users_v2
    ADD CONSTRAINT social_users_v2_platform_handle_key UNIQUE (platform, handle);


--
-- Name: staging_us_institution_to_state staging_us_institution_to_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staging_us_institution_to_state
    ADD CONSTRAINT staging_us_institution_to_state_pkey PRIMARY KEY (institution_normalized);


--
-- Name: ta_clinical_taxonomies ta_clinical_taxonomies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_clinical_taxonomies
    ADD CONSTRAINT ta_clinical_taxonomies_pkey PRIMARY KEY (therapeutic_area_id, taxonomy_code);


--
-- Name: ta_cohort_counts_cache ta_cohort_counts_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_cohort_counts_cache
    ADD CONSTRAINT ta_cohort_counts_cache_pkey PRIMARY KEY (therapeutic_area_id);


--
-- Name: ta_drug_keywords ta_drug_keywords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_drug_keywords
    ADD CONSTRAINT ta_drug_keywords_pkey PRIMARY KEY (id);


--
-- Name: ta_hcpcs_codes ta_hcpcs_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_hcpcs_codes
    ADD CONSTRAINT ta_hcpcs_codes_pkey PRIMARY KEY (id);


--
-- Name: ta_hcpcs_codes ta_hcpcs_codes_therapeutic_area_id_hcpcs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_hcpcs_codes
    ADD CONSTRAINT ta_hcpcs_codes_therapeutic_area_id_hcpcs_code_key UNIQUE (therapeutic_area_id, hcpcs_code);


--
-- Name: theme_canonical_v1 theme_canonical_v1_canonical_name_therapeutic_area_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_canonical_v1
    ADD CONSTRAINT theme_canonical_v1_canonical_name_therapeutic_area_key UNIQUE (canonical_name, therapeutic_area);


--
-- Name: theme_canonical_v1 theme_canonical_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_canonical_v1
    ADD CONSTRAINT theme_canonical_v1_pkey PRIMARY KEY (id);


--
-- Name: theme_concept_signature_v1 theme_concept_signature_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_concept_signature_v1
    ADD CONSTRAINT theme_concept_signature_v1_pkey PRIMARY KEY (canonical_id, concept_name);


--
-- Name: theme_keyword_signature_v1 theme_keyword_signature_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_keyword_signature_v1
    ADD CONSTRAINT theme_keyword_signature_v1_pkey PRIMARY KEY (canonical_id, term);


--
-- Name: theme_to_canonical_v1 theme_to_canonical_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_to_canonical_v1
    ADD CONSTRAINT theme_to_canonical_v1_pkey PRIMARY KEY (raw_theme_name, therapeutic_area);


--
-- Name: therapeutic_area_ingestion_config therapeutic_area_ingestion_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_area_ingestion_config
    ADD CONSTRAINT therapeutic_area_ingestion_config_pkey PRIMARY KEY (id);


--
-- Name: therapeutic_area_ingestion_config therapeutic_area_ingestion_config_therapeutic_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_area_ingestion_config
    ADD CONSTRAINT therapeutic_area_ingestion_config_therapeutic_area_id_key UNIQUE (therapeutic_area_id);


--
-- Name: therapeutic_areas therapeutic_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_areas
    ADD CONSTRAINT therapeutic_areas_pkey PRIMARY KEY (id);


--
-- Name: therapeutic_areas therapeutic_areas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_areas
    ADD CONSTRAINT therapeutic_areas_slug_key UNIQUE (slug);


--
-- Name: tracked_conferences tracked_conferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracked_conferences
    ADD CONSTRAINT tracked_conferences_pkey PRIMARY KEY (slug);


--
-- Name: trial_backfill_progress trial_backfill_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_backfill_progress
    ADD CONSTRAINT trial_backfill_progress_pkey PRIMARY KEY (nct_id);


--
-- Name: trial_investigator_match_proposals trial_investigator_match_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals
    ADD CONSTRAINT trial_investigator_match_proposals_pkey PRIMARY KEY (id);


--
-- Name: trial_investigator_match_proposals_v2 trial_investigator_match_proposals_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals_v2
    ADD CONSTRAINT trial_investigator_match_proposals_v2_pkey PRIMARY KEY (id);


--
-- Name: trial_investigator_match_proposals_v2 trial_investigator_match_proposals_v2_trial_investigator_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals_v2
    ADD CONSTRAINT trial_investigator_match_proposals_v2_trial_investigator_id_key UNIQUE (trial_investigator_id);


--
-- Name: trial_investigators trial_investigators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators
    ADD CONSTRAINT trial_investigators_pkey PRIMARY KEY (id);


--
-- Name: trial_investigators trial_investigators_raw_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators
    ADD CONSTRAINT trial_investigators_raw_uniq UNIQUE (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source);


--
-- Name: trial_investigators_v2 trial_investigators_v2_natural_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators_v2
    ADD CONSTRAINT trial_investigators_v2_natural_key UNIQUE (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source);


--
-- Name: trial_investigators_v2 trial_investigators_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators_v2
    ADD CONSTRAINT trial_investigators_v2_pkey PRIMARY KEY (id);


--
-- Name: users users_linkedin_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_linkedin_id_key UNIQUE (linkedin_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: wipe_candidates_audit wipe_candidates_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wipe_candidates_audit
    ADD CONSTRAINT wipe_candidates_audit_pkey PRIMARY KEY (id);


--
-- Name: messages messages_payload_exclusive; Type: CHECK CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages
    ADD CONSTRAINT messages_payload_exclusive CHECK (((payload IS NULL) OR (binary_payload IS NULL))) NOT VALID;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: idx_users_created_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_created_at_desc ON auth.users USING btree (created_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: idx_users_last_sign_in_at_desc; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);


--
-- Name: idx_users_name; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: ad_yearly_hcp_id_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_yearly_hcp_id_year_idx ON public.ad_yearly USING btree (hcp_id, year);


--
-- Name: clinical_trials_status_phase_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinical_trials_status_phase_idx ON public.clinical_trials USING btree (status, phase);


--
-- Name: hcp_author_metrics_v2_hcp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_hcp_idx ON public.hcp_author_metrics_v2 USING btree (hcp_id);


--
-- Name: hcp_author_metrics_v2_openalex_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_openalex_idx ON public.hcp_author_metrics_v2 USING btree (openalex_author_id);


--
-- Name: hcp_author_metrics_v2_quality_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_quality_idx ON public.hcp_author_metrics_v2 USING btree (((data_quality_flags ->> 'conflation_suspected'::text)));


--
-- Name: hcp_author_metrics_v2_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_run_idx ON public.hcp_author_metrics_v2 USING btree (enrichment_run_id);


--
-- Name: hcp_author_metrics_v2_snapshot_hcp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_snapshot_hcp_idx ON public.hcp_author_metrics_v2 USING btree (snapshot_date, hcp_id);


--
-- Name: hcp_author_metrics_v2_snapshot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_author_metrics_v2_snapshot_idx ON public.hcp_author_metrics_v2 USING btree (snapshot_date DESC);


--
-- Name: hcp_cohort_classification_v2_cohort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_cohort_classification_v2_cohort_idx ON public.hcp_cohort_classification_v2 USING btree (cohort);


--
-- Name: hcp_cohort_classification_v2_therapeutic_area_id_cohort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_cohort_classification_v2_therapeutic_area_id_cohort_idx ON public.hcp_cohort_classification_v2 USING btree (therapeutic_area_id, cohort);


--
-- Name: hcp_scores_hcp_id_therapeutic_area_id_calculated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_scores_hcp_id_therapeutic_area_id_calculated_at_idx ON public.hcp_scores USING btree (hcp_id, therapeutic_area_id, calculated_at DESC);


--
-- Name: hcp_watchlist_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcp_watchlist_user_id_idx ON public.hcp_watchlist USING btree (user_id);


--
-- Name: hcps_last_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcps_last_name_idx ON public.hcps USING btree (last_name);


--
-- Name: hcps_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcps_state_idx ON public.hcps USING btree (state);


--
-- Name: hcps_zip_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hcps_zip_code_idx ON public.hcps USING btree (zip_code);


--
-- Name: idx_author_pub_flat_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_author_pub_flat_author ON public.author_pub_flat USING btree (author_id);


--
-- Name: idx_author_pub_flat_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_author_pub_flat_pub ON public.author_pub_flat USING btree (pub_id);


--
-- Name: idx_author_pub_flat_source_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_author_pub_flat_source_ta ON public.author_pub_flat USING btree (source_ta_id);


--
-- Name: idx_belief_reactions_contributor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belief_reactions_contributor ON public.msl_belief_claim_reactions USING btree (contributor_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_belief_reactions_hcp_claim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belief_reactions_hcp_claim ON public.msl_belief_claim_reactions USING btree (hcp_id, claim_key) WHERE (deleted_at IS NULL);


--
-- Name: idx_belief_reactions_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_belief_reactions_submitted_at ON public.msl_belief_claim_reactions USING btree (submitted_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_clinical_trials_locations_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_locations_gin ON public.clinical_trials USING gin (locations);


--
-- Name: idx_clinical_trials_sponsor_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_sponsor_class ON public.clinical_trials USING btree (lead_sponsor_class);


--
-- Name: idx_clinical_trials_v2_nct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_v2_nct ON public.clinical_trials_v2 USING btree (nct_id);


--
-- Name: idx_clinical_trials_v2_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_v2_phase ON public.clinical_trials_v2 USING btree (phase);


--
-- Name: idx_clinical_trials_v2_sponsor_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_v2_sponsor_class ON public.clinical_trials_v2 USING btree (lead_sponsor_class);


--
-- Name: idx_clinical_trials_v2_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clinical_trials_v2_status ON public.clinical_trials_v2 USING btree (status);


--
-- Name: idx_community_practitioners_city_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_practitioners_city_state ON public.community_practitioners USING btree (practice_state, practice_city);


--
-- Name: idx_community_practitioners_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_practitioners_state ON public.community_practitioners USING btree (practice_state);


--
-- Name: idx_community_practitioners_taxonomy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_practitioners_taxonomy ON public.community_practitioners USING btree (primary_taxonomy_code);


--
-- Name: idx_community_snapshot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_community_snapshot_unique ON public.hcp_community_snapshots USING btree (snapshot_date, hcp_id, therapeutic_area_id, scope_type, COALESCE(scope_value, '__null__'::text));


--
-- Name: idx_community_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_snapshots_date ON public.hcp_community_snapshots USING btree (snapshot_date);


--
-- Name: idx_community_snapshots_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_community_snapshots_hcp ON public.hcp_community_snapshots USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_congress_abstracts_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_congress_abstracts_slug ON public.congress_abstracts USING btree (congress_slug);


--
-- Name: idx_congress_abstracts_speaker_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_congress_abstracts_speaker_key ON public.congress_abstracts USING btree (congress_slug, speaker_key);


--
-- Name: idx_congress_confirmed_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_congress_confirmed_hcp ON public.congress_confirmed_presenters USING btree (hcp_id);


--
-- Name: idx_cpp_ad_drug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cpp_ad_drug ON public.community_practitioner_payments USING btree (ad_drug_payments_3yr DESC);


--
-- Name: idx_cpp_total; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cpp_total ON public.community_practitioner_payments USING btree (total_payments_3yr DESC);


--
-- Name: idx_curated_ta_concepts_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curated_ta_concepts_concept ON public.curated_ta_concepts USING btree (openalex_concept_id);


--
-- Name: idx_curated_ta_concepts_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curated_ta_concepts_ta ON public.curated_ta_concepts USING btree (therapeutic_area_id);


--
-- Name: idx_dedup_merge_log_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dedup_merge_log_canonical ON public.dedup_merge_log USING btree (canonical_hcp_id);


--
-- Name: idx_dedup_merge_log_merged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dedup_merge_log_merged ON public.dedup_merge_log USING btree (merged_hcp_id);


--
-- Name: idx_dedup_merge_log_pass; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dedup_merge_log_pass ON public.dedup_merge_log USING btree (merge_pass);


--
-- Name: idx_dol_matches_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_confidence ON public.dol_matches USING btree (match_confidence);


--
-- Name: idx_dol_matches_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_hcp ON public.dol_matches USING btree (hcp_id);


--
-- Name: idx_dol_matches_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_user ON public.dol_matches USING btree (social_user_id);


--
-- Name: idx_dol_matches_v2_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_v2_confidence ON public.dol_matches_v2 USING btree (match_confidence);


--
-- Name: idx_dol_matches_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_v2_hcp_id ON public.dol_matches_v2 USING btree (hcp_id);


--
-- Name: idx_dol_matches_v2_social_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dol_matches_v2_social_user_id ON public.dol_matches_v2 USING btree (social_user_id);


--
-- Name: idx_est_snapshot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_est_snapshot_unique ON public.hcp_established_snapshots USING btree (snapshot_date, hcp_id, therapeutic_area_id, scope_type, COALESCE(scope_value, '__null__'::text));


--
-- Name: idx_est_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_est_snapshots_date ON public.hcp_established_snapshots USING btree (snapshot_date);


--
-- Name: idx_est_snapshots_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_est_snapshots_hcp ON public.hcp_established_snapshots USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_hcp_affiliation_profile_v2_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_affiliation_profile_v2_classification ON public.hcp_affiliation_profile_v2 USING btree (affiliation_classification);


--
-- Name: idx_hcp_affiliation_profile_v2_clinician_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_affiliation_profile_v2_clinician_score ON public.hcp_affiliation_profile_v2 USING btree (clinician_score);


--
-- Name: idx_hcp_ai_overviews_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_ai_overviews_hcp_id ON public.hcp_ai_overviews USING btree (hcp_id);


--
-- Name: idx_hcp_ai_overviews_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_ai_overviews_lookup ON public.hcp_ai_overviews USING btree (hcp_id, synthesis_type, therapeutic_area);


--
-- Name: idx_hcp_established_ranks_v3_scope_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_established_ranks_v3_scope_rank ON public.hcp_established_ranks_v3 USING btree (therapeutic_area_id, scope_type, scope_value, rank);


--
-- Name: idx_hcp_industry_class_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_industry_class_classification ON public.hcp_industry_classification_v1 USING btree (classification);


--
-- Name: idx_hcp_institutions_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_institutions_hcp ON public.hcp_institutions_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_institutions_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_institutions_ref ON public.hcp_institutions_v2 USING btree (reference_institution_id);


--
-- Name: idx_hcp_leadership_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_leadership_hcp ON public.hcp_leadership_evidence USING btree (hcp_id) WHERE (is_active = true);


--
-- Name: idx_hcp_leadership_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_leadership_tier ON public.hcp_leadership_evidence USING btree (hcp_id, tier) WHERE (is_active = true);


--
-- Name: idx_hcp_medicare_by_ta_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_by_ta_hcp ON public.hcp_medicare_by_ta USING btree (hcp_id);


--
-- Name: idx_hcp_medicare_by_ta_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_by_ta_ranking ON public.hcp_medicare_by_ta USING btree (therapeutic_area_id, ta_beneficiaries_3yr_high_confidence DESC);


--
-- Name: idx_hcp_medicare_by_ta_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_by_ta_v2_hcp_id ON public.hcp_medicare_by_ta_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_medicare_by_ta_v2_ta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_by_ta_v2_ta_id ON public.hcp_medicare_by_ta_v2 USING btree (therapeutic_area_id);


--
-- Name: idx_hcp_medicare_summary_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_summary_hcp_id ON public.hcp_medicare_summary USING btree (hcp_id);


--
-- Name: idx_hcp_medicare_summary_npi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_summary_npi ON public.hcp_medicare_summary USING btree (npi);


--
-- Name: idx_hcp_medicare_summary_specialty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_summary_specialty ON public.hcp_medicare_summary USING btree (predominant_specialty);


--
-- Name: idx_hcp_medicare_summary_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_summary_state ON public.hcp_medicare_summary USING btree (predominant_state);


--
-- Name: idx_hcp_medicare_summary_total_3yr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_medicare_summary_total_3yr ON public.hcp_medicare_summary USING btree (total_beneficiaries_3yr DESC);


--
-- Name: idx_hcp_narratives_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_narratives_v2_hcp ON public.hcp_narratives_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_network_centrality_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_network_centrality_hcp ON public.hcp_network_centrality_v2 USING btree (hcp_id, therapeutic_area_id, window_type);


--
-- Name: idx_hcp_network_centrality_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_network_centrality_score ON public.hcp_network_centrality_v2 USING btree (therapeutic_area_id, window_type, network_influence_score DESC);


--
-- Name: idx_hcp_nppes_detail_v2_org_npi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_nppes_detail_v2_org_npi ON public.hcp_nppes_detail_v2 USING btree (nppes_organization_npi);


--
-- Name: idx_hcp_op_by_ta_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_by_ta_hcp ON public.hcp_open_payments_by_ta USING btree (hcp_id);


--
-- Name: idx_hcp_op_by_ta_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_by_ta_ranking ON public.hcp_open_payments_by_ta USING btree (therapeutic_area_id, ta_payments_3yr DESC);


--
-- Name: idx_hcp_op_by_ta_speaker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_by_ta_speaker ON public.hcp_open_payments_by_ta USING btree (therapeutic_area_id, ta_speaker_bureau_3yr DESC);


--
-- Name: idx_hcp_op_summary_consulting_3yr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_summary_consulting_3yr ON public.hcp_open_payments_summary USING btree (consulting_3yr DESC);


--
-- Name: idx_hcp_op_summary_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_summary_hcp_id ON public.hcp_open_payments_summary USING btree (hcp_id);


--
-- Name: idx_hcp_op_summary_npi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_summary_npi ON public.hcp_open_payments_summary USING btree (npi);


--
-- Name: idx_hcp_op_summary_speaker_3yr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_summary_speaker_3yr ON public.hcp_open_payments_summary USING btree (speaker_bureau_3yr DESC);


--
-- Name: idx_hcp_op_summary_total_3yr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_op_summary_total_3yr ON public.hcp_open_payments_summary USING btree (total_payments_3yr DESC);


--
-- Name: idx_hcp_open_payments_by_ta_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_open_payments_by_ta_v2_hcp_id ON public.hcp_open_payments_by_ta_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_open_payments_by_ta_v2_ta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_open_payments_by_ta_v2_ta_id ON public.hcp_open_payments_by_ta_v2 USING btree (therapeutic_area_id);


--
-- Name: idx_hcp_open_payments_top_companies_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_open_payments_top_companies_v2_hcp_id ON public.hcp_open_payments_top_companies_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_open_payments_top_companies_v2_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_open_payments_top_companies_v2_rank ON public.hcp_open_payments_top_companies_v2 USING btree (hcp_id, rank_by_amount);


--
-- Name: idx_hcp_openalex_authors_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_openalex_authors_confidence ON public.hcp_openalex_authors USING btree (match_confidence);


--
-- Name: idx_hcp_openalex_authors_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_openalex_authors_hcp_id ON public.hcp_openalex_authors USING btree (hcp_id);


--
-- Name: idx_hcp_openalex_authors_oa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_openalex_authors_oa_id ON public.hcp_openalex_authors USING btree (openalex_author_id);


--
-- Name: idx_hcp_openalex_v2_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_openalex_v2_author_id ON public.hcp_openalex_authors_v2 USING btree (openalex_author_id);


--
-- Name: idx_hcp_openalex_v2_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_openalex_v2_primary ON public.hcp_openalex_authors_v2 USING btree (hcp_id) WHERE (is_primary = true);


--
-- Name: idx_hcp_payments_top_companies_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_payments_top_companies_hcp_id ON public.hcp_open_payments_top_companies USING btree (hcp_id);


--
-- Name: idx_hcp_payments_top_companies_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_payments_top_companies_rank ON public.hcp_open_payments_top_companies USING btree (hcp_id, rank_by_amount);


--
-- Name: idx_hcp_pharma_engagement_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_pharma_engagement_hcp ON public.hcp_pharma_engagement_v2 USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_hcp_pharma_engagement_pctile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_pharma_engagement_pctile ON public.hcp_pharma_engagement_v2 USING btree (therapeutic_area_id, percentile_rank DESC);


--
-- Name: idx_hcp_pub_leadership_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_pub_leadership_hcp ON public.hcp_publication_leadership_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_pub_leadership_percentile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_pub_leadership_percentile ON public.hcp_publication_leadership_v2 USING btree (therapeutic_area_id, percentile_rank DESC);


--
-- Name: idx_hcp_pub_leadership_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_pub_leadership_ta ON public.hcp_publication_leadership_v2 USING btree (therapeutic_area_id, normalized_score DESC);


--
-- Name: idx_hcp_research_themes_v2_display_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_research_themes_v2_display_rank ON public.hcp_research_themes_v2 USING btree (hcp_id, display_rank) WHERE (display_rank IS NOT NULL);


--
-- Name: idx_hcp_research_themes_v2_extraction_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_research_themes_v2_extraction_run ON public.hcp_research_themes_v2 USING btree (extraction_run_id);


--
-- Name: idx_hcp_research_themes_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_research_themes_v2_hcp_id ON public.hcp_research_themes_v2 USING btree (hcp_id);


--
-- Name: idx_hcp_rising_composite_v1_ta_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_rising_composite_v1_ta_scope ON public.hcp_rising_composite_v1 USING btree (therapeutic_area_id, scope_type, rising_composite_score DESC);


--
-- Name: idx_hcp_scientific_emergence_v1_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_emergence_v1_hcp ON public.hcp_scientific_emergence_v1 USING btree (hcp_id);


--
-- Name: idx_hcp_scientific_emergence_v1_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_emergence_v1_ta ON public.hcp_scientific_emergence_v1 USING btree (therapeutic_area_id, emergence_percentile DESC);


--
-- Name: idx_hcp_scientific_positions_v1_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_positions_v1_hcp_id ON public.hcp_scientific_positions_v1 USING btree (hcp_id);


--
-- Name: idx_hcp_scientific_positions_v1_hcp_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_positions_v1_hcp_ta ON public.hcp_scientific_positions_v1 USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_hcp_scientific_positions_v1_position_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_positions_v1_position_category ON public.hcp_scientific_positions_v1 USING btree (position_category);


--
-- Name: idx_hcp_scientific_positions_v1_position_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_positions_v1_position_type ON public.hcp_scientific_positions_v1 USING btree (position_type);


--
-- Name: idx_hcp_scientific_positions_v1_pub_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scientific_positions_v1_pub_year ON public.hcp_scientific_positions_v1 USING btree (pub_year);


--
-- Name: idx_hcp_score_ranks_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_score_ranks_v2_hcp ON public.hcp_score_ranks_v2 USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_hcp_score_ranks_v2_query; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_score_ranks_v2_query ON public.hcp_score_ranks_v2 USING btree (therapeutic_area_id, cohort, scope_type, scope_value, rank);


--
-- Name: idx_hcp_score_ranks_v2_rank_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_score_ranks_v2_rank_run ON public.hcp_score_ranks_v2 USING btree (rank_run_id);


--
-- Name: idx_hcp_scores_ta_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scores_ta_score ON public.hcp_scores USING btree (therapeutic_area_id, composite_score DESC NULLS LAST);


--
-- Name: idx_hcp_scores_ta_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scores_ta_tier ON public.hcp_scores USING btree (therapeutic_area_id, tier);


--
-- Name: idx_hcp_scores_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scores_tier ON public.hcp_scores USING btree (tier);


--
-- Name: idx_hcp_scores_v2_ta_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_scores_v2_ta_score ON public.hcp_scores_v2 USING btree (therapeutic_area_id, normalized_score DESC);


--
-- Name: idx_hcp_ta_v2_ta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_ta_v2_ta_id ON public.hcp_therapeutic_areas_v2 USING btree (therapeutic_area_id);


--
-- Name: idx_hcp_top_collab_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_top_collab_lookup ON public.hcp_top_collaborators_v2 USING btree (hcp_id, therapeutic_area_id, window_type, rank);


--
-- Name: idx_hcp_top_collaborators_v2_collaborator_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_top_collaborators_v2_collaborator_hcp_id ON public.hcp_top_collaborators_v2 USING btree (collaborator_hcp_id);


--
-- Name: idx_hcp_web_signals_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_web_signals_hcp ON public.hcp_web_signals_v1 USING btree (hcp_id);


--
-- Name: idx_hcp_web_signals_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcp_web_signals_type ON public.hcp_web_signals_v1 USING btree (signal_type);


--
-- Name: idx_hcps_affiliation_calc_null; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_affiliation_calc_null ON public.hcps USING btree (id) WHERE (affiliation_profile_calculated_at IS NULL);


--
-- Name: idx_hcps_affiliation_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_affiliation_classification ON public.hcps USING btree (affiliation_classification);


--
-- Name: idx_hcps_cohort_classification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_cohort_classification ON public.hcps USING btree (cohort_classification);


--
-- Name: idx_hcps_cohort_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_cohort_score ON public.hcps USING btree (cohort_score DESC NULLS LAST);


--
-- Name: idx_hcps_id_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_id_cohort ON public.hcps USING btree (id, cohort_classification) WHERE (cohort_classification IS NOT NULL);


--
-- Name: idx_hcps_identity_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_identity_hash ON public.hcps USING btree (identity_hash);


--
-- Name: idx_hcps_institution_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_institution_country ON public.hcps USING btree (institution_country) WHERE (institution_country IS NOT NULL);


--
-- Name: idx_hcps_institution_state_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_institution_state_code ON public.hcps USING btree (institution_state_code) WHERE (institution_state_code IS NOT NULL);


--
-- Name: idx_hcps_last_name_lower_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_last_name_lower_new ON public.hcps USING btree (last_name_lower);


--
-- Name: idx_hcps_openalex_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_openalex_author_id ON public.hcps USING btree (openalex_author_id) WHERE (openalex_author_id IS NOT NULL);


--
-- Name: idx_hcps_openalex_institution_ror_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_openalex_institution_ror_id ON public.hcps USING btree (openalex_institution_ror_id) WHERE (openalex_institution_ror_id IS NOT NULL);


--
-- Name: idx_hcps_orcid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_orcid ON public.hcps USING btree (orcid) WHERE (orcid IS NOT NULL);


--
-- Name: idx_hcps_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_source ON public.hcps USING btree (source);


--
-- Name: idx_hcps_state_lower_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_state_lower_new ON public.hcps USING btree (state_lower);


--
-- Name: idx_hcps_taxonomy_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_taxonomy_status ON public.hcps USING btree (npi_taxonomy_enrichment_status);


--
-- Name: idx_hcps_v2_cohort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_cohort ON public.hcps_v2 USING btree (cohort_classification) WHERE (cohort_classification IS NOT NULL);


--
-- Name: idx_hcps_v2_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_country ON public.hcps_v2 USING btree (country);


--
-- Name: idx_hcps_v2_is_verified_dol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_is_verified_dol ON public.hcps_v2 USING btree (is_verified_dol) WHERE (is_verified_dol = true);


--
-- Name: idx_hcps_v2_last_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_last_name ON public.hcps_v2 USING btree (lower(last_name));


--
-- Name: idx_hcps_v2_last_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_last_name_lower ON public.hcps_v2 USING btree (last_name_lower);


--
-- Name: idx_hcps_v2_last_name_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_last_name_state ON public.hcps_v2 USING btree (last_name_lower, state_lower);


--
-- Name: idx_hcps_v2_npi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_npi ON public.hcps_v2 USING btree (npi_number) WHERE (npi_number IS NOT NULL);


--
-- Name: idx_hcps_v2_orcid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_orcid ON public.hcps_v2 USING btree (orcid) WHERE (orcid IS NOT NULL);


--
-- Name: idx_hcps_v2_state_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_v2_state_lower ON public.hcps_v2 USING btree (state_lower);


--
-- Name: idx_hcps_verified_dol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hcps_verified_dol ON public.hcps USING btree (is_verified_dol) WHERE (is_verified_dol = true);


--
-- Name: idx_hta_ta_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hta_ta_hcp ON public.hcp_therapeutic_areas USING btree (therapeutic_area_id, hcp_id);


--
-- Name: idx_institution_geo_lookup_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_geo_lookup_country_code ON public.institution_geo_lookup USING btree (country_code) WHERE (country_code IS NOT NULL);


--
-- Name: idx_institution_geo_lookup_ror_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_geo_lookup_ror_id ON public.institution_geo_lookup USING btree (ror_id);


--
-- Name: idx_institution_geo_lookup_state_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_institution_geo_lookup_state_code ON public.institution_geo_lookup USING btree (state_code) WHERE (state_code IS NOT NULL);


--
-- Name: idx_invite_email_sends_sender_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invite_email_sends_sender_time ON public.invite_email_sends USING btree (sender_id, sent_at DESC);


--
-- Name: idx_invites_inviter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invites_inviter ON public.invites USING btree (inviter_id);


--
-- Name: idx_medicare_v2_beneficiaries; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medicare_v2_beneficiaries ON public.hcp_medicare_summary_v2 USING btree (total_beneficiaries_3yr_unique_est DESC);


--
-- Name: idx_msl_hcp_notes_insight_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msl_hcp_notes_insight_category ON public.msl_hcp_notes USING btree (insight_category) WHERE ((deleted_at IS NULL) AND (insight_category IS NOT NULL));


--
-- Name: idx_msl_pinned_institutions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msl_pinned_institutions_user ON public.msl_pinned_institutions USING btree (user_id);


--
-- Name: idx_msl_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msl_profiles_active ON public.msl_profiles USING btree (last_active_at DESC);


--
-- Name: idx_msl_profiles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msl_profiles_company ON public.msl_profiles USING btree (company);


--
-- Name: idx_msl_profiles_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_msl_profiles_invited_by ON public.msl_profiles USING btree (invited_by);


--
-- Name: idx_mv_social_emergence_ta_eng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_social_emergence_ta_eng ON public.mv_social_voice_emergence_by_ta USING btree (ta_slug, engagement_per_follower DESC);


--
-- Name: idx_mv_social_sov_ta_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_social_sov_ta_rank ON public.mv_social_share_of_voice_by_ta USING btree (ta_slug, rank_within_ta);


--
-- Name: idx_mv_social_topics_ta_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_social_topics_ta_rank ON public.mv_social_hot_topics_by_ta USING btree (ta_slug, rank_within_ta);


--
-- Name: idx_mv_social_trending_topics_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_social_trending_topics_ta ON public.mv_social_trending_topics_by_ta USING btree (ta_slug, current_engagement DESC);


--
-- Name: idx_net_momentum_ta_pctile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_net_momentum_ta_pctile ON public.hcp_network_momentum_v1 USING btree (therapeutic_area_id, network_momentum_percentile DESC);


--
-- Name: idx_nih_grants_activity_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_grants_activity_code ON public.nih_grants USING btree (activity_code);


--
-- Name: idx_nih_grants_fiscal_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_grants_fiscal_year ON public.nih_grants USING btree (fiscal_year);


--
-- Name: idx_nih_grants_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_grants_is_active ON public.nih_grants USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_nih_grants_org_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_grants_org_name ON public.nih_grants USING btree (org_name);


--
-- Name: idx_nih_grants_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_grants_parent ON public.nih_grants USING btree (parent_project_num) WHERE (parent_project_num IS NOT NULL);


--
-- Name: idx_nih_investigators_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_investigators_confidence ON public.nih_grant_investigators USING btree (match_confidence);


--
-- Name: idx_nih_investigators_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_investigators_hcp ON public.nih_grant_investigators USING btree (hcp_id);


--
-- Name: idx_nih_merge_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_merge_status ON public.nih_merge_candidates USING btree (status);


--
-- Name: idx_nih_merge_unique_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_nih_merge_unique_pair ON public.nih_merge_candidates USING btree (hcp_id_a, hcp_id_b);


--
-- Name: idx_nih_unmatched_institution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_unmatched_institution ON public.nih_unmatched_researchers USING btree (raw_nih_institution);


--
-- Name: idx_nih_unmatched_normalized_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nih_unmatched_normalized_name ON public.nih_unmatched_researchers USING btree (normalized_name);


--
-- Name: idx_npi_match_proposals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_npi_match_proposals_status ON public.npi_match_proposals USING btree (match_status);


--
-- Name: idx_npi_match_proposals_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_npi_match_proposals_tier ON public.npi_match_proposals USING btree (match_tier);


--
-- Name: idx_npi_match_proposals_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_npi_match_proposals_v2_hcp_id ON public.npi_match_proposals_v2 USING btree (hcp_id);


--
-- Name: idx_npi_match_proposals_v2_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_npi_match_proposals_v2_status ON public.npi_match_proposals_v2 USING btree (match_status);


--
-- Name: idx_nppes_enrichment_log_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nppes_enrichment_log_v2_hcp_id ON public.nppes_enrichment_log_v2 USING btree (hcp_id);


--
-- Name: idx_nppes_enrichment_log_v2_npi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nppes_enrichment_log_v2_npi ON public.nppes_enrichment_log_v2 USING btree (matched_npi);


--
-- Name: idx_nppes_org_to_ror_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nppes_org_to_ror_confidence ON public.nppes_org_to_ror USING btree (confidence);


--
-- Name: idx_nppes_org_to_ror_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nppes_org_to_ror_id ON public.nppes_org_to_ror USING btree (ror_id) WHERE (ror_id IS NOT NULL);


--
-- Name: idx_op_by_drug_v2_drug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_op_by_drug_v2_drug ON public.hcp_open_payments_by_drug_v2 USING btree (drug_name);


--
-- Name: idx_op_by_drug_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_op_by_drug_v2_hcp ON public.hcp_open_payments_by_drug_v2 USING btree (hcp_id);


--
-- Name: idx_open_payments_v2_total; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_open_payments_v2_total ON public.hcp_open_payments_summary_v2 USING btree (total_payments_lifetime DESC);


--
-- Name: idx_openalex_author_inventory_corpus_pub_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_openalex_author_inventory_corpus_pub_count ON public.openalex_author_inventory USING btree (corpus_pub_count DESC);


--
-- Name: idx_openalex_author_inventory_has_matching_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_openalex_author_inventory_has_matching_hcp ON public.openalex_author_inventory USING btree (has_matching_hcp);


--
-- Name: idx_pipeline_runs_name_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_runs_name_started ON public.pipeline_runs USING btree (pipeline_name, started_at DESC);


--
-- Name: idx_pub_authors_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pub_authors_v2_hcp ON public.publication_authors_v2 USING btree (hcp_id);


--
-- Name: idx_pub_authors_v2_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pub_authors_v2_position ON public.publication_authors_v2 USING btree (publication_id, author_position);


--
-- Name: idx_pub_ta_pub_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pub_ta_pub_id ON public.publication_therapeutic_areas USING btree (publication_id);


--
-- Name: idx_pub_ta_ta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pub_ta_ta_id ON public.publication_therapeutic_areas USING btree (therapeutic_area_id);


--
-- Name: idx_pub_ta_v2_ta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pub_ta_v2_ta_id ON public.publication_therapeutic_areas_v2 USING btree (therapeutic_area_id);


--
-- Name: idx_publication_authors_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publication_authors_hcp_id ON public.publication_authors USING btree (hcp_id);


--
-- Name: idx_publication_authors_openalex_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publication_authors_openalex_author_id ON public.publication_authors USING btree (openalex_author_id) WHERE (openalex_author_id IS NOT NULL);


--
-- Name: idx_publication_authors_publication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publication_authors_publication_id ON public.publication_authors USING btree (publication_id);


--
-- Name: idx_publications_openalex_enriched_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_openalex_enriched_at ON public.publications USING btree (openalex_enriched_at) WHERE (openalex_enriched_at IS NULL);


--
-- Name: idx_publications_v2_doi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_v2_doi ON public.publications_v2 USING btree (doi) WHERE (doi IS NOT NULL);


--
-- Name: idx_publications_v2_openalex_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_v2_openalex_work ON public.publications_v2 USING btree (openalex_work_id) WHERE (openalex_work_id IS NOT NULL);


--
-- Name: idx_publications_v2_pubmed_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_publications_v2_pubmed_id ON public.publications_v2 USING btree (pubmed_id) WHERE (pubmed_id IS NOT NULL);


--
-- Name: idx_publications_v2_source_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_v2_source_ta ON public.publications_v2 USING btree (source_therapeutic_area_id);


--
-- Name: idx_publications_v2_unenriched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_v2_unenriched ON public.publications_v2 USING btree (id) WHERE (openalex_enriched_at IS NULL);


--
-- Name: idx_publications_v2_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publications_v2_year ON public.publications_v2 USING btree (pub_year);


--
-- Name: idx_redemptions_inviter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_inviter ON public.invite_redemptions USING btree (inviter_id);


--
-- Name: idx_redemptions_redeemed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_redemptions_redeemed_by ON public.invite_redemptions USING btree (redeemed_by);


--
-- Name: idx_ref_inst_coe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_inst_coe ON public.reference_institutions USING btree (is_coe);


--
-- Name: idx_ref_inst_patterns; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_inst_patterns ON public.reference_institutions USING gin (match_patterns);


--
-- Name: idx_ref_inst_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_inst_type ON public.reference_institutions USING btree (institution_type);


--
-- Name: idx_region_countries_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_region_countries_country ON public.region_countries USING btree (country_code);


--
-- Name: idx_reingest_diff_summary_v2_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_diff_summary_v2_ta ON public.reingest_diff_summary_v2 USING btree (ta_slug, computed_at);


--
-- Name: idx_reingest_diff_v2_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_diff_v2_feed ON public.reingest_diff_v2 USING btree (ta_slug, computed_at, magnitude);


--
-- Name: idx_reingest_diff_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_diff_v2_hcp ON public.reingest_diff_v2 USING btree (hcp_id);


--
-- Name: idx_reingest_diff_v2_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_diff_v2_run ON public.reingest_diff_v2 USING btree (diff_run_id, magnitude);


--
-- Name: idx_reingest_snapshot_v2_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_snapshot_v2_snapshot ON public.reingest_snapshot_v2 USING btree (snapshot_id);


--
-- Name: idx_reingest_snapshot_v2_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reingest_snapshot_v2_ta ON public.reingest_snapshot_v2 USING btree (ta_slug, captured_at);


--
-- Name: idx_rising_star_v3_ta_pctile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rising_star_v3_ta_pctile ON public.hcp_rising_star_ranks_v3 USING btree (therapeutic_area_id, rising_star_percentile DESC);


--
-- Name: idx_rising_star_v3_ta_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rising_star_v3_ta_rank ON public.hcp_rising_star_ranks_v3 USING btree (therapeutic_area_id, rank);


--
-- Name: idx_rising_star_v3_ta_us_rank; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rising_star_v3_ta_us_rank ON public.hcp_rising_star_ranks_v3 USING btree (therapeutic_area_id, us_rank) WHERE (us_rank IS NOT NULL);


--
-- Name: idx_ror_to_country_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ror_to_country_country_code ON public.ror_to_country USING btree (country_code);


--
-- Name: idx_rs_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rs_snapshots_date ON public.hcp_rising_star_snapshots USING btree (snapshot_date);


--
-- Name: idx_rs_snapshots_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rs_snapshots_hcp ON public.hcp_rising_star_snapshots USING btree (hcp_id, therapeutic_area_id);


--
-- Name: idx_sci_momentum_ta_pctile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sci_momentum_ta_pctile ON public.hcp_scientific_momentum_v1 USING btree (therapeutic_area_id, scientific_momentum_percentile DESC);


--
-- Name: idx_social_posts_handle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_handle ON public.social_posts USING btree (platform, handle);


--
-- Name: idx_social_posts_hashtags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_hashtags ON public.social_posts USING gin (hashtags);


--
-- Name: idx_social_posts_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_platform ON public.social_posts USING btree (platform);


--
-- Name: idx_social_posts_posted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_posted_at ON public.social_posts USING btree (posted_at DESC);


--
-- Name: idx_social_posts_v2_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_v2_conversation_id ON public.social_posts_v2 USING btree (conversation_id);


--
-- Name: idx_social_posts_v2_handle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_v2_handle ON public.social_posts_v2 USING btree (handle);


--
-- Name: idx_social_posts_v2_parent_platform_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_v2_parent_platform_post_id ON public.social_posts_v2 USING btree (parent_platform_post_id) WHERE (parent_platform_post_id IS NOT NULL);


--
-- Name: idx_social_posts_v2_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_v2_platform ON public.social_posts_v2 USING btree (platform);


--
-- Name: idx_social_posts_v2_posted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_posts_v2_posted_at ON public.social_posts_v2 USING btree (posted_at DESC);


--
-- Name: idx_social_users_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_users_platform ON public.social_users USING btree (platform);


--
-- Name: idx_social_users_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_users_quality ON public.social_users USING btree (data_quality_flag);


--
-- Name: idx_social_users_v2_discovery_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_users_v2_discovery_source ON public.social_users_v2 USING btree (discovery_source);


--
-- Name: idx_social_users_v2_handle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_users_v2_handle ON public.social_users_v2 USING btree (handle);


--
-- Name: idx_social_users_v2_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_users_v2_platform ON public.social_users_v2 USING btree (platform);


--
-- Name: idx_ta_drug_keywords_brand_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_drug_keywords_brand_lower ON public.ta_drug_keywords USING btree (lower(drug_brand_name)) WHERE (drug_brand_name IS NOT NULL);


--
-- Name: idx_ta_drug_keywords_drug_name_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_drug_keywords_drug_name_lower ON public.ta_drug_keywords USING btree (lower(drug_name));


--
-- Name: idx_ta_drug_keywords_generic_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_drug_keywords_generic_lower ON public.ta_drug_keywords USING btree (lower(drug_generic_name)) WHERE (drug_generic_name IS NOT NULL);


--
-- Name: idx_ta_drug_keywords_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_drug_keywords_ta ON public.ta_drug_keywords USING btree (therapeutic_area_id);


--
-- Name: idx_ta_hcpcs_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_hcpcs_codes_code ON public.ta_hcpcs_codes USING btree (hcpcs_code);


--
-- Name: idx_ta_hcpcs_codes_ta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ta_hcpcs_codes_ta ON public.ta_hcpcs_codes USING btree (therapeutic_area_id);


--
-- Name: idx_theme_to_canonical_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_theme_to_canonical_canonical ON public.theme_to_canonical_v1 USING btree (canonical_id);


--
-- Name: idx_tim_proposals_v2_hcp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tim_proposals_v2_hcp_id ON public.trial_investigator_match_proposals_v2 USING btree (proposed_hcp_id);


--
-- Name: idx_tim_proposals_v2_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tim_proposals_v2_status ON public.trial_investigator_match_proposals_v2 USING btree (proposed_match_status);


--
-- Name: idx_tim_proposals_v2_ti_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tim_proposals_v2_ti_id ON public.trial_investigator_match_proposals_v2 USING btree (trial_investigator_id);


--
-- Name: idx_trial_investigators_v2_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trial_investigators_v2_confidence ON public.trial_investigators_v2 USING btree (match_confidence) WHERE (match_confidence IS NOT NULL);


--
-- Name: idx_trial_investigators_v2_hcp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trial_investigators_v2_hcp ON public.trial_investigators_v2 USING btree (hcp_id) WHERE (hcp_id IS NOT NULL);


--
-- Name: idx_trial_investigators_v2_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trial_investigators_v2_role ON public.trial_investigators_v2 USING btree (role);


--
-- Name: idx_trial_investigators_v2_trial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trial_investigators_v2_trial ON public.trial_investigators_v2 USING btree (trial_id);


--
-- Name: idx_wipe_candidates_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wipe_candidates_run_id ON public.wipe_candidates_audit USING btree (audit_run_id);


--
-- Name: idx_wipe_candidates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wipe_candidates_status ON public.wipe_candidates_audit USING btree (deletion_status);


--
-- Name: match_proposals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_proposals_status_idx ON public.trial_investigator_match_proposals USING btree (proposed_match_status);


--
-- Name: msl_contributions_hcp_id_field_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_contributions_hcp_id_field_type_idx ON public.msl_contributions USING btree (hcp_id, field_type);


--
-- Name: msl_hcp_briefs_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_briefs_lookup_idx ON public.msl_hcp_briefs USING btree (user_id, hcp_id, expires_at);


--
-- Name: msl_hcp_next_actions_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_next_actions_open_idx ON public.msl_hcp_next_actions USING btree (user_id, due_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NULL));


--
-- Name: msl_hcp_next_actions_overdue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_next_actions_overdue_idx ON public.msl_hcp_next_actions USING btree (user_id, relationship_id, due_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NULL) AND (due_at IS NOT NULL));


--
-- Name: msl_hcp_next_actions_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_next_actions_relationship_idx ON public.msl_hcp_next_actions USING btree (relationship_id) WHERE (deleted_at IS NULL);


--
-- Name: msl_hcp_next_actions_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_next_actions_sort_idx ON public.msl_hcp_next_actions USING btree (user_id, priority, due_at, created_at DESC) WHERE ((deleted_at IS NULL) AND (completed_at IS NULL));


--
-- Name: msl_hcp_next_actions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_next_actions_user_idx ON public.msl_hcp_next_actions USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: msl_hcp_notes_extraction_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_notes_extraction_pending_idx ON public.msl_hcp_notes USING btree (created_at) WHERE ((ai_extraction_status = 'pending'::text) AND (deleted_at IS NULL));


--
-- Name: msl_hcp_notes_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_notes_relationship_idx ON public.msl_hcp_notes USING btree (relationship_id) WHERE (deleted_at IS NULL);


--
-- Name: msl_hcp_notes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_notes_user_idx ON public.msl_hcp_notes USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: msl_hcp_notes_user_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_notes_user_occurred_idx ON public.msl_hcp_notes USING btree (user_id, occurred_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: msl_hcp_relationship_tags_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_relationship_tags_tag_idx ON public.msl_hcp_relationship_tags USING btree (tag_id);


--
-- Name: msl_hcp_relationships_hcp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_relationships_hcp_idx ON public.msl_hcp_relationships USING btree (hcp_id);


--
-- Name: msl_hcp_relationships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_relationships_user_idx ON public.msl_hcp_relationships USING btree (user_id);


--
-- Name: msl_hcp_relationships_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_hcp_relationships_user_status_idx ON public.msl_hcp_relationships USING btree (user_id, status);


--
-- Name: msl_tags_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_tags_user_idx ON public.msl_tags USING btree (user_id);


--
-- Name: msl_tags_user_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX msl_tags_user_name_lower_idx ON public.msl_tags USING btree (user_id, lower(name));


--
-- Name: msl_watchlist_items_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_watchlist_items_relationship_idx ON public.msl_watchlist_items USING btree (relationship_id);


--
-- Name: msl_watchlist_items_watchlist_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_watchlist_items_watchlist_sort_idx ON public.msl_watchlist_items USING btree (watchlist_id, sort_order);


--
-- Name: msl_watchlists_one_default_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX msl_watchlists_one_default_per_user ON public.msl_watchlists USING btree (user_id) WHERE ((is_default = true) AND (archived_at IS NULL));


--
-- Name: msl_watchlists_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_watchlists_user_idx ON public.msl_watchlists USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: msl_watchlists_user_sort_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX msl_watchlists_user_sort_idx ON public.msl_watchlists USING btree (user_id, sort_order) WHERE (archived_at IS NULL);


--
-- Name: publication_theme_v1_canonical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publication_theme_v1_canonical_idx ON public.publication_theme_v1 USING btree (canonical_id);


--
-- Name: publication_theme_v1_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publication_theme_v1_primary_idx ON public.publication_theme_v1 USING btree (canonical_id, is_primary) WHERE is_primary;


--
-- Name: publication_theme_v1_pub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publication_theme_v1_pub_idx ON public.publication_theme_v1 USING btree (publication_id);


--
-- Name: publication_theme_v1_ta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publication_theme_v1_ta_idx ON public.publication_theme_v1 USING btree (therapeutic_area_id);


--
-- Name: publications_hcp_id_pub_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publications_hcp_id_pub_year_idx ON public.publications USING btree (hcp_id, pub_year DESC);


--
-- Name: pulse_preflight_concepts_concept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pulse_preflight_concepts_concept_id_idx ON public.pulse_preflight_concepts USING btree (concept_id);


--
-- Name: pulse_preflight_concepts_publication_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pulse_preflight_concepts_publication_id_idx ON public.pulse_preflight_concepts USING btree (publication_id);


--
-- Name: trial_investigators_facility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trial_investigators_facility_idx ON public.trial_investigators USING btree (investigator_raw_facility, investigator_raw_state) WHERE (hcp_id IS NULL);


--
-- Name: trial_investigators_stage2_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trial_investigators_stage2_target_idx ON public.trial_investigators USING btree (investigator_raw_last_name, investigator_raw_state) WHERE ((source = 'site_contact'::text) AND (hcp_id IS NULL) AND (investigator_raw_country = 'United States'::text));


--
-- Name: trial_investigators_unmatched_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trial_investigators_unmatched_idx ON public.trial_investigators USING btree (trial_id) WHERE (hcp_id IS NULL);


--
-- Name: uq_trial_investigators_v2_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_trial_investigators_v2_identity ON public.trial_investigators_v2 USING btree (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source);


--
-- Name: waitlist_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_created_at_idx ON public.waitlist USING btree (created_at DESC);


--
-- Name: waitlist_email_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX waitlist_email_uidx ON public.waitlist USING btree (lower(email));


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_selec; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_selec ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter, COALESCE(selected_columns, '{}'::text[]));


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER msl_hcp_next_actions_set_updated_at BEFORE UPDATE ON public.msl_hcp_next_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: msl_hcp_notes msl_hcp_notes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER msl_hcp_notes_set_updated_at BEFORE UPDATE ON public.msl_hcp_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: msl_hcp_relationships msl_hcp_relationships_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER msl_hcp_relationships_set_updated_at BEFORE UPDATE ON public.msl_hcp_relationships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: msl_profiles msl_profiles_lock_entitlement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER msl_profiles_lock_entitlement BEFORE UPDATE ON public.msl_profiles FOR EACH ROW EXECUTE FUNCTION public.msl_profiles_lock_entitlement_cols();


--
-- Name: msl_watchlists msl_watchlists_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER msl_watchlists_set_updated_at BEFORE UPDATE ON public.msl_watchlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_users admin_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: clinical_trials_ta_v2 clinical_trials_ta_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials_ta_v2
    ADD CONSTRAINT clinical_trials_ta_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id) ON DELETE CASCADE;


--
-- Name: clinical_trials_ta_v2 clinical_trials_ta_v2_trial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_trials_ta_v2
    ADD CONSTRAINT clinical_trials_ta_v2_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES public.clinical_trials_v2(id) ON DELETE CASCADE;


--
-- Name: cohort_overrides cohort_overrides_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cohort_overrides
    ADD CONSTRAINT cohort_overrides_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: congress_confirmed_presenters congress_confirmed_presenters_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.congress_confirmed_presenters
    ADD CONSTRAINT congress_confirmed_presenters_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: curated_ta_concepts curated_ta_concepts_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curated_ta_concepts
    ADD CONSTRAINT curated_ta_concepts_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: dol_canonical_overrides dol_canonical_overrides_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_canonical_overrides
    ADD CONSTRAINT dol_canonical_overrides_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: dol_matches dol_matches_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches
    ADD CONSTRAINT dol_matches_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: dol_matches dol_matches_social_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches
    ADD CONSTRAINT dol_matches_social_user_id_fkey FOREIGN KEY (social_user_id) REFERENCES public.social_users(id) ON DELETE CASCADE;


--
-- Name: dol_matches_v2 dol_matches_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches_v2
    ADD CONSTRAINT dol_matches_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: dol_matches_v2 dol_matches_v2_social_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dol_matches_v2
    ADD CONSTRAINT dol_matches_v2_social_user_id_fkey FOREIGN KEY (social_user_id) REFERENCES public.social_users_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_affiliation_profile_v2 hcp_affiliation_profile_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_affiliation_profile_v2
    ADD CONSTRAINT hcp_affiliation_profile_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_ai_overviews hcp_ai_overviews_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_ai_overviews
    ADD CONSTRAINT hcp_ai_overviews_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_author_metrics_v2 hcp_author_metrics_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_author_metrics_v2
    ADD CONSTRAINT hcp_author_metrics_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_claims hcp_claims_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_claims
    ADD CONSTRAINT hcp_claims_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_claims hcp_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_claims
    ADD CONSTRAINT hcp_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: hcp_community_scores_v2 hcp_community_scores_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_community_scores_v2
    ADD CONSTRAINT hcp_community_scores_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_community_scores_v2 hcp_community_scores_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_community_scores_v2
    ADD CONSTRAINT hcp_community_scores_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id) ON DELETE CASCADE;


--
-- Name: hcp_established_ranks_v3 hcp_established_ranks_v3_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_ranks_v3
    ADD CONSTRAINT hcp_established_ranks_v3_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_established_ranks_v3 hcp_established_ranks_v3_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_ranks_v3
    ADD CONSTRAINT hcp_established_ranks_v3_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_established_scores_v2 hcp_established_scores_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_scores_v2
    ADD CONSTRAINT hcp_established_scores_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_established_scores_v2 hcp_established_scores_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_established_scores_v2
    ADD CONSTRAINT hcp_established_scores_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id) ON DELETE CASCADE;


--
-- Name: hcp_industry_classification_v1 hcp_industry_classification_v1_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_industry_classification_v1
    ADD CONSTRAINT hcp_industry_classification_v1_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_institutions_v2 hcp_institutions_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_institutions_v2
    ADD CONSTRAINT hcp_institutions_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_institutions_v2 hcp_institutions_v2_reference_institution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_institutions_v2
    ADD CONSTRAINT hcp_institutions_v2_reference_institution_id_fkey FOREIGN KEY (reference_institution_id) REFERENCES public.reference_institutions(id) ON DELETE CASCADE;


--
-- Name: hcp_leadership_evidence hcp_leadership_evidence_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_leadership_evidence
    ADD CONSTRAINT hcp_leadership_evidence_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_medicare_by_ta hcp_medicare_by_ta_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta
    ADD CONSTRAINT hcp_medicare_by_ta_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: hcp_medicare_by_ta hcp_medicare_by_ta_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta
    ADD CONSTRAINT hcp_medicare_by_ta_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_medicare_by_ta_v2 hcp_medicare_by_ta_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta_v2
    ADD CONSTRAINT hcp_medicare_by_ta_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_medicare_by_ta_v2 hcp_medicare_by_ta_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_by_ta_v2
    ADD CONSTRAINT hcp_medicare_by_ta_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_medicare_summary hcp_medicare_summary_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_summary
    ADD CONSTRAINT hcp_medicare_summary_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: hcp_medicare_summary_v2 hcp_medicare_summary_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_medicare_summary_v2
    ADD CONSTRAINT hcp_medicare_summary_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_narratives hcp_narratives_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives
    ADD CONSTRAINT hcp_narratives_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_narratives hcp_narratives_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives
    ADD CONSTRAINT hcp_narratives_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_narratives_v2 hcp_narratives_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_narratives_v2
    ADD CONSTRAINT hcp_narratives_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_network_centrality_v2 hcp_network_centrality_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_network_centrality_v2
    ADD CONSTRAINT hcp_network_centrality_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_network_centrality_v2 hcp_network_centrality_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_network_centrality_v2
    ADD CONSTRAINT hcp_network_centrality_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_nppes_detail_v2 hcp_nppes_detail_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_nppes_detail_v2
    ADD CONSTRAINT hcp_nppes_detail_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_open_payments_by_drug_v2 hcp_open_payments_by_drug_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_drug_v2
    ADD CONSTRAINT hcp_open_payments_by_drug_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_open_payments_by_ta hcp_open_payments_by_ta_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta
    ADD CONSTRAINT hcp_open_payments_by_ta_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: hcp_open_payments_by_ta hcp_open_payments_by_ta_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta
    ADD CONSTRAINT hcp_open_payments_by_ta_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_open_payments_by_ta_v2 hcp_open_payments_by_ta_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta_v2
    ADD CONSTRAINT hcp_open_payments_by_ta_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_open_payments_by_ta_v2 hcp_open_payments_by_ta_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_by_ta_v2
    ADD CONSTRAINT hcp_open_payments_by_ta_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_open_payments_summary hcp_open_payments_summary_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_summary
    ADD CONSTRAINT hcp_open_payments_summary_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: hcp_open_payments_summary_v2 hcp_open_payments_summary_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_summary_v2
    ADD CONSTRAINT hcp_open_payments_summary_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_open_payments_top_companies hcp_open_payments_top_companies_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies
    ADD CONSTRAINT hcp_open_payments_top_companies_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_open_payments_top_companies_v2 hcp_open_payments_top_companies_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_open_payments_top_companies_v2
    ADD CONSTRAINT hcp_open_payments_top_companies_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_openalex_authors hcp_openalex_authors_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_openalex_authors
    ADD CONSTRAINT hcp_openalex_authors_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_openalex_authors_v2 hcp_openalex_authors_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_openalex_authors_v2
    ADD CONSTRAINT hcp_openalex_authors_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_pharma_engagement_v2 hcp_pharma_engagement_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_pharma_engagement_v2
    ADD CONSTRAINT hcp_pharma_engagement_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_pharma_engagement_v2 hcp_pharma_engagement_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_pharma_engagement_v2
    ADD CONSTRAINT hcp_pharma_engagement_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_publication_leadership_v2 hcp_publication_leadership_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_publication_leadership_v2
    ADD CONSTRAINT hcp_publication_leadership_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_publication_leadership_v2 hcp_publication_leadership_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_publication_leadership_v2
    ADD CONSTRAINT hcp_publication_leadership_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_research_themes_v2 hcp_research_themes_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_research_themes_v2
    ADD CONSTRAINT hcp_research_themes_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_scientific_positions_v1 hcp_scientific_positions_v1_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_positions_v1
    ADD CONSTRAINT hcp_scientific_positions_v1_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_scientific_positions_v1 hcp_scientific_positions_v1_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scientific_positions_v1
    ADD CONSTRAINT hcp_scientific_positions_v1_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_score_ranks_v2 hcp_score_ranks_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_score_ranks_v2
    ADD CONSTRAINT hcp_score_ranks_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_score_ranks_v2 hcp_score_ranks_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_score_ranks_v2
    ADD CONSTRAINT hcp_score_ranks_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id) ON DELETE CASCADE;


--
-- Name: hcp_scores hcp_scores_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores
    ADD CONSTRAINT hcp_scores_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_scores hcp_scores_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores
    ADD CONSTRAINT hcp_scores_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_scores_v2 hcp_scores_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores_v2
    ADD CONSTRAINT hcp_scores_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_scores_v2 hcp_scores_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_scores_v2
    ADD CONSTRAINT hcp_scores_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_therapeutic_areas hcp_therapeutic_areas_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas
    ADD CONSTRAINT hcp_therapeutic_areas_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_therapeutic_areas hcp_therapeutic_areas_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas
    ADD CONSTRAINT hcp_therapeutic_areas_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_therapeutic_areas_v2 hcp_therapeutic_areas_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas_v2
    ADD CONSTRAINT hcp_therapeutic_areas_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_therapeutic_areas_v2 hcp_therapeutic_areas_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_therapeutic_areas_v2
    ADD CONSTRAINT hcp_therapeutic_areas_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_top_collaborators_v2 hcp_top_collaborators_v2_collaborator_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_top_collaborators_v2
    ADD CONSTRAINT hcp_top_collaborators_v2_collaborator_hcp_id_fkey FOREIGN KEY (collaborator_hcp_id) REFERENCES public.hcps_v2(id);


--
-- Name: hcp_top_collaborators_v2 hcp_top_collaborators_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_top_collaborators_v2
    ADD CONSTRAINT hcp_top_collaborators_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: hcp_top_collaborators_v2 hcp_top_collaborators_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_top_collaborators_v2
    ADD CONSTRAINT hcp_top_collaborators_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: hcp_watchlist hcp_watchlist_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_watchlist
    ADD CONSTRAINT hcp_watchlist_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: hcp_watchlist hcp_watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hcp_watchlist
    ADD CONSTRAINT hcp_watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invite_email_sends invite_email_sends_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_email_sends
    ADD CONSTRAINT invite_email_sends_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invite_redemptions invite_redemptions_invite_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_redemptions
    ADD CONSTRAINT invite_redemptions_invite_code_fkey FOREIGN KEY (invite_code) REFERENCES public.invites(code) ON DELETE SET NULL;


--
-- Name: invite_redemptions invite_redemptions_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_redemptions
    ADD CONSTRAINT invite_redemptions_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invite_redemptions invite_redemptions_redeemed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_redemptions
    ADD CONSTRAINT invite_redemptions_redeemed_by_fkey FOREIGN KEY (redeemed_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invites invites_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: msl_contributions msl_contributions_contributor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_contributions
    ADD CONSTRAINT msl_contributions_contributor_id_fkey FOREIGN KEY (contributor_id) REFERENCES public.users(id);


--
-- Name: msl_contributions msl_contributions_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_contributions
    ADD CONSTRAINT msl_contributions_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: msl_contributions msl_contributions_therapeutic_area_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_contributions
    ADD CONSTRAINT msl_contributions_therapeutic_area_slug_fkey FOREIGN KEY (therapeutic_area_slug) REFERENCES public.therapeutic_areas(slug);


--
-- Name: msl_hcp_briefs msl_hcp_briefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_briefs
    ADD CONSTRAINT msl_hcp_briefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_next_actions
    ADD CONSTRAINT msl_hcp_next_actions_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.msl_hcp_relationships(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_next_actions
    ADD CONSTRAINT msl_hcp_next_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_notes msl_hcp_notes_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_notes
    ADD CONSTRAINT msl_hcp_notes_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.msl_hcp_relationships(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_notes msl_hcp_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_notes
    ADD CONSTRAINT msl_hcp_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationship_tags
    ADD CONSTRAINT msl_hcp_relationship_tags_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.msl_hcp_relationships(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationship_tags
    ADD CONSTRAINT msl_hcp_relationship_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.msl_tags(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_relationships msl_hcp_relationships_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationships
    ADD CONSTRAINT msl_hcp_relationships_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: msl_hcp_relationships msl_hcp_relationships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_hcp_relationships
    ADD CONSTRAINT msl_hcp_relationships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_pinned_institutions msl_pinned_institutions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_pinned_institutions
    ADD CONSTRAINT msl_pinned_institutions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_profiles msl_profiles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_profiles
    ADD CONSTRAINT msl_profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: msl_profiles msl_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_profiles
    ADD CONSTRAINT msl_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_tags msl_tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_tags
    ADD CONSTRAINT msl_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_team_invites msl_team_invites_inviter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_team_invites
    ADD CONSTRAINT msl_team_invites_inviter_user_id_fkey FOREIGN KEY (inviter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: msl_watchlist_items msl_watchlist_items_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_watchlist_items
    ADD CONSTRAINT msl_watchlist_items_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.msl_hcp_relationships(id) ON DELETE CASCADE;


--
-- Name: msl_watchlist_items msl_watchlist_items_watchlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_watchlist_items
    ADD CONSTRAINT msl_watchlist_items_watchlist_id_fkey FOREIGN KEY (watchlist_id) REFERENCES public.msl_watchlists(id) ON DELETE CASCADE;


--
-- Name: msl_watchlists msl_watchlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.msl_watchlists
    ADD CONSTRAINT msl_watchlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: nih_grant_investigators nih_grant_investigators_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_grant_investigators
    ADD CONSTRAINT nih_grant_investigators_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: nih_merge_candidates nih_merge_candidates_hcp_id_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_merge_candidates
    ADD CONSTRAINT nih_merge_candidates_hcp_id_a_fkey FOREIGN KEY (hcp_id_a) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: nih_merge_candidates nih_merge_candidates_hcp_id_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nih_merge_candidates
    ADD CONSTRAINT nih_merge_candidates_hcp_id_b_fkey FOREIGN KEY (hcp_id_b) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: npi_match_proposals npi_match_proposals_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals
    ADD CONSTRAINT npi_match_proposals_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: npi_match_proposals_v2 npi_match_proposals_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npi_match_proposals_v2
    ADD CONSTRAINT npi_match_proposals_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: nppes_enrichment_log nppes_enrichment_log_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nppes_enrichment_log
    ADD CONSTRAINT nppes_enrichment_log_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id);


--
-- Name: nppes_enrichment_log_v2 nppes_enrichment_log_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nppes_enrichment_log_v2
    ADD CONSTRAINT nppes_enrichment_log_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE SET NULL;


--
-- Name: publication_authors publication_authors_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors
    ADD CONSTRAINT publication_authors_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: publication_authors publication_authors_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors
    ADD CONSTRAINT publication_authors_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications(id) ON DELETE CASCADE;


--
-- Name: publication_authors_v2 publication_authors_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors_v2
    ADD CONSTRAINT publication_authors_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE CASCADE;


--
-- Name: publication_authors_v2 publication_authors_v2_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_authors_v2
    ADD CONSTRAINT publication_authors_v2_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications_v2(id) ON DELETE CASCADE;


--
-- Name: publication_theme_v1 publication_theme_v1_canonical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_theme_v1
    ADD CONSTRAINT publication_theme_v1_canonical_id_fkey FOREIGN KEY (canonical_id) REFERENCES public.theme_canonical_v1(id) ON DELETE CASCADE;


--
-- Name: publication_theme_v1 publication_theme_v1_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_theme_v1
    ADD CONSTRAINT publication_theme_v1_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications_v2(id) ON DELETE CASCADE;


--
-- Name: publication_therapeutic_areas publication_therapeutic_areas_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas
    ADD CONSTRAINT publication_therapeutic_areas_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications(id) ON DELETE CASCADE;


--
-- Name: publication_therapeutic_areas publication_therapeutic_areas_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas
    ADD CONSTRAINT publication_therapeutic_areas_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: publication_therapeutic_areas_v2 publication_therapeutic_areas_v2_publication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas_v2
    ADD CONSTRAINT publication_therapeutic_areas_v2_publication_id_fkey FOREIGN KEY (publication_id) REFERENCES public.publications_v2(id) ON DELETE CASCADE;


--
-- Name: publication_therapeutic_areas_v2 publication_therapeutic_areas_v2_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publication_therapeutic_areas_v2
    ADD CONSTRAINT publication_therapeutic_areas_v2_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: publications publications_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: publications publications_source_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications
    ADD CONSTRAINT publications_source_therapeutic_area_id_fkey FOREIGN KEY (source_therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: publications_v2 publications_v2_source_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publications_v2
    ADD CONSTRAINT publications_v2_source_therapeutic_area_id_fkey FOREIGN KEY (source_therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: region_countries region_countries_region_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_countries
    ADD CONSTRAINT region_countries_region_key_fkey FOREIGN KEY (region_key) REFERENCES public.regions(region_key) ON DELETE CASCADE;


--
-- Name: ta_clinical_taxonomies ta_clinical_taxonomies_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_clinical_taxonomies
    ADD CONSTRAINT ta_clinical_taxonomies_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: ta_drug_keywords ta_drug_keywords_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_drug_keywords
    ADD CONSTRAINT ta_drug_keywords_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: ta_hcpcs_codes ta_hcpcs_codes_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ta_hcpcs_codes
    ADD CONSTRAINT ta_hcpcs_codes_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: theme_concept_signature_v1 theme_concept_signature_v1_canonical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_concept_signature_v1
    ADD CONSTRAINT theme_concept_signature_v1_canonical_id_fkey FOREIGN KEY (canonical_id) REFERENCES public.theme_canonical_v1(id) ON DELETE CASCADE;


--
-- Name: theme_keyword_signature_v1 theme_keyword_signature_v1_canonical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_keyword_signature_v1
    ADD CONSTRAINT theme_keyword_signature_v1_canonical_id_fkey FOREIGN KEY (canonical_id) REFERENCES public.theme_canonical_v1(id) ON DELETE CASCADE;


--
-- Name: theme_to_canonical_v1 theme_to_canonical_v1_canonical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.theme_to_canonical_v1
    ADD CONSTRAINT theme_to_canonical_v1_canonical_id_fkey FOREIGN KEY (canonical_id) REFERENCES public.theme_canonical_v1(id);


--
-- Name: therapeutic_area_ingestion_config therapeutic_area_ingestion_config_therapeutic_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_area_ingestion_config
    ADD CONSTRAINT therapeutic_area_ingestion_config_therapeutic_area_id_fkey FOREIGN KEY (therapeutic_area_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: therapeutic_areas therapeutic_areas_parent_ta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.therapeutic_areas
    ADD CONSTRAINT therapeutic_areas_parent_ta_id_fkey FOREIGN KEY (parent_ta_id) REFERENCES public.therapeutic_areas(id);


--
-- Name: trial_investigator_match_proposals trial_investigator_match_proposals_proposed_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals
    ADD CONSTRAINT trial_investigator_match_proposals_proposed_hcp_id_fkey FOREIGN KEY (proposed_hcp_id) REFERENCES public.hcps(id);


--
-- Name: trial_investigator_match_proposals trial_investigator_match_proposals_trial_investigator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals
    ADD CONSTRAINT trial_investigator_match_proposals_trial_investigator_id_fkey FOREIGN KEY (trial_investigator_id) REFERENCES public.trial_investigators(id);


--
-- Name: trial_investigator_match_proposals_v2 trial_investigator_match_proposals_v2_proposed_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals_v2
    ADD CONSTRAINT trial_investigator_match_proposals_v2_proposed_hcp_id_fkey FOREIGN KEY (proposed_hcp_id) REFERENCES public.hcps_v2(id) ON DELETE SET NULL;


--
-- Name: trial_investigator_match_proposals_v2 trial_investigator_match_proposals_v_trial_investigator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigator_match_proposals_v2
    ADD CONSTRAINT trial_investigator_match_proposals_v_trial_investigator_id_fkey FOREIGN KEY (trial_investigator_id) REFERENCES public.trial_investigators_v2(id) ON DELETE CASCADE;


--
-- Name: trial_investigators trial_investigators_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators
    ADD CONSTRAINT trial_investigators_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps(id) ON DELETE CASCADE;


--
-- Name: trial_investigators trial_investigators_trial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators
    ADD CONSTRAINT trial_investigators_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES public.clinical_trials(id) ON DELETE CASCADE;


--
-- Name: trial_investigators_v2 trial_investigators_v2_hcp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators_v2
    ADD CONSTRAINT trial_investigators_v2_hcp_id_fkey FOREIGN KEY (hcp_id) REFERENCES public.hcps_v2(id) ON DELETE SET NULL;


--
-- Name: trial_investigators_v2 trial_investigators_v2_trial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trial_investigators_v2
    ADD CONSTRAINT trial_investigators_v2_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES public.clinical_trials_v2(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_network_momentum_v1 Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.hcp_network_momentum_v1 FOR SELECT USING (true);


--
-- Name: hcp_rising_star_ranks_v3 Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.hcp_rising_star_ranks_v3 FOR SELECT USING (true);


--
-- Name: hcp_scientific_momentum_v1 Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.hcp_scientific_momentum_v1 FOR SELECT USING (true);


--
-- Name: hcp_web_signals_v1 Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.hcp_web_signals_v1 FOR SELECT USING (true);


--
-- Name: hcp_narratives Allow public read access to narratives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to narratives" ON public.hcp_narratives FOR SELECT TO anon USING (true);


--
-- Name: hcp_established_ranks_v3 Authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read access" ON public.hcp_established_ranks_v3 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_network_centrality_v2 Authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read access" ON public.hcp_network_centrality_v2 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_pharma_engagement_v2 Authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read access" ON public.hcp_pharma_engagement_v2 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_publication_leadership_v2 Authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read access" ON public.hcp_publication_leadership_v2 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_top_collaborators_v2 Authenticated read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read access" ON public.hcp_top_collaborators_v2 FOR SELECT TO authenticated USING (true);


--
-- Name: msl_profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.msl_profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: msl_profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.msl_profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scientific_positions_v1 anon_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anon_read_all ON public.hcp_scientific_positions_v1 FOR SELECT TO anon USING (true);


--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scientific_positions_v1 authenticated_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_read_all ON public.hcp_scientific_positions_v1 FOR SELECT TO authenticated USING (true);


--
-- Name: msl_belief_claim_reactions belief_reactions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY belief_reactions_insert_own ON public.msl_belief_claim_reactions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = contributor_id));


--
-- Name: msl_belief_claim_reactions belief_reactions_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY belief_reactions_select_all ON public.msl_belief_claim_reactions FOR SELECT TO authenticated USING ((deleted_at IS NULL));


--
-- Name: msl_belief_claim_reactions belief_reactions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY belief_reactions_update_own ON public.msl_belief_claim_reactions FOR UPDATE TO authenticated USING ((auth.uid() = contributor_id)) WITH CHECK ((auth.uid() = contributor_id));


--
-- Name: canonical_hcps_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canonical_hcps_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: clean_dedup_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clean_dedup_map ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_trials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_trials ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_trials_ta_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_trials_ta_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_trials_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clinical_trials_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: clinical_trials_v2 clinical_trials_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clinical_trials_v2_public_read ON public.clinical_trials_v2 FOR SELECT USING (true);


--
-- Name: cohort_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cohort_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: community_practitioner_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_practitioner_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: community_practitioner_payments community_practitioner_payments_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_practitioner_payments_authenticated_read ON public.community_practitioner_payments FOR SELECT TO authenticated USING (true);


--
-- Name: community_practitioners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_practitioners ENABLE ROW LEVEL SECURITY;

--
-- Name: community_practitioners community_practitioners_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_practitioners_authenticated_read ON public.community_practitioners FOR SELECT TO authenticated USING (true);


--
-- Name: congress_abstracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.congress_abstracts ENABLE ROW LEVEL SECURITY;

--
-- Name: congress_abstracts congress_abstracts_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY congress_abstracts_select_all ON public.congress_abstracts FOR SELECT TO authenticated, anon USING (true);


--
-- Name: congress_confirmed_presenters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.congress_confirmed_presenters ENABLE ROW LEVEL SECURITY;

--
-- Name: congress_confirmed_presenters congress_confirmed_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY congress_confirmed_select_all ON public.congress_confirmed_presenters FOR SELECT TO authenticated, anon USING (true);


--
-- Name: msl_contributions contributions_auth_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contributions_auth_read ON public.msl_contributions FOR SELECT TO authenticated USING (true);


--
-- Name: msl_contributions contributions_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contributions_owner_insert ON public.msl_contributions FOR INSERT WITH CHECK ((auth.uid() = contributor_id));


--
-- Name: curated_ta_concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curated_ta_concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: dedup_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dedup_map ENABLE ROW LEVEL SECURITY;

--
-- Name: dedup_merge_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dedup_merge_log ENABLE ROW LEVEL SECURITY;

--
-- Name: dol_canonical_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dol_canonical_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: dol_canonical_overrides dol_canonical_overrides_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dol_canonical_overrides_public_read ON public.dol_canonical_overrides FOR SELECT USING (true);


--
-- Name: dol_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dol_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: dol_matches dol_matches_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dol_matches_public_read ON public.dol_matches FOR SELECT USING (true);


--
-- Name: dol_matches_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dol_matches_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: excluded_institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.excluded_institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: excluded_taxonomies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.excluded_taxonomies ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_affiliation_profile_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_affiliation_profile_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_ai_overviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_ai_overviews ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_ai_overviews hcp_ai_overviews_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_ai_overviews_select_all ON public.hcp_ai_overviews FOR SELECT TO authenticated, anon USING (true);


--
-- Name: hcp_author_metrics_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_author_metrics_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_community_scores_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_community_scores_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_community_scores_v2 hcp_community_scores_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_community_scores_v2_public_read ON public.hcp_community_scores_v2 FOR SELECT USING (true);


--
-- Name: hcp_community_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_community_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_established_ranks_v3; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_established_ranks_v3 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_established_scores_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_established_scores_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_established_scores_v2 hcp_established_scores_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_established_scores_v2_public_read ON public.hcp_established_scores_v2 FOR SELECT USING (true);


--
-- Name: hcp_established_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_established_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_industry_classification_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_industry_classification_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_institutions_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_institutions_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_leadership_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_leadership_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_medicare_by_ta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_medicare_by_ta ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_medicare_by_ta_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_medicare_by_ta_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_medicare_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_medicare_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_medicare_summary hcp_medicare_summary_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_medicare_summary_public_read ON public.hcp_medicare_summary FOR SELECT USING (true);


--
-- Name: hcp_medicare_summary_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_medicare_summary_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_medicare_summary_v2 hcp_medicare_summary_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_medicare_summary_v2_public_read ON public.hcp_medicare_summary_v2 FOR SELECT USING (true);


--
-- Name: hcp_narratives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_narratives ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_narratives_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_narratives_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_narratives_v2 hcp_narratives_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_narratives_v2_public_read ON public.hcp_narratives_v2 FOR SELECT USING (true);


--
-- Name: hcp_network_centrality_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_network_centrality_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_network_momentum_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_network_momentum_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_nppes_detail_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_nppes_detail_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_by_drug_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_by_drug_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_by_drug_v2 hcp_open_payments_by_drug_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_open_payments_by_drug_v2_public_read ON public.hcp_open_payments_by_drug_v2 FOR SELECT USING (true);


--
-- Name: hcp_open_payments_by_ta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_by_ta ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_by_ta_backup_20260520; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_by_ta_backup_20260520 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_by_ta_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_by_ta_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_by_ta_v2 hcp_open_payments_by_ta_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_open_payments_by_ta_v2_public_read ON public.hcp_open_payments_by_ta_v2 FOR SELECT USING (true);


--
-- Name: hcp_open_payments_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_summary_backup_20260520; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_summary_backup_20260520 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_summary hcp_open_payments_summary_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_open_payments_summary_public_read ON public.hcp_open_payments_summary FOR SELECT USING (true);


--
-- Name: hcp_open_payments_summary_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_summary_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_summary_v2 hcp_open_payments_summary_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_open_payments_summary_v2_public_read ON public.hcp_open_payments_summary_v2 FOR SELECT USING (true);


--
-- Name: hcp_open_payments_top_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_top_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_top_companies_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_open_payments_top_companies_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_open_payments_top_companies_v2 hcp_open_payments_top_companies_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_open_payments_top_companies_v2_public_read ON public.hcp_open_payments_top_companies_v2 FOR SELECT USING (true);


--
-- Name: hcp_openalex_authors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_openalex_authors ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_openalex_authors_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_openalex_authors_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_openalex_authors_v2_pre_cycletest_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_openalex_authors_v2_pre_cycletest_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_openalex_authors_v2 hcp_openalex_authors_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_openalex_authors_v2_public_read ON public.hcp_openalex_authors_v2 FOR SELECT USING (true);


--
-- Name: hcp_pharma_engagement_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_pharma_engagement_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_publication_leadership_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_publication_leadership_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_research_themes_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_research_themes_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_research_themes_v2 hcp_research_themes_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_research_themes_v2_public_read ON public.hcp_research_themes_v2 FOR SELECT USING (true);


--
-- Name: hcp_rising_composite_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_rising_composite_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_rising_composite_v1 hcp_rising_composite_v1_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_rising_composite_v1_authenticated_read ON public.hcp_rising_composite_v1 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_rising_star_ranks_v3; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_rising_star_ranks_v3 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_rising_star_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_rising_star_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scientific_emergence_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_scientific_emergence_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scientific_emergence_v1 hcp_scientific_emergence_v1_authenticated_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_scientific_emergence_v1_authenticated_read ON public.hcp_scientific_emergence_v1 FOR SELECT TO authenticated USING (true);


--
-- Name: hcp_scientific_momentum_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_scientific_momentum_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scientific_positions_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_scientific_positions_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_score_ranks_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_score_ranks_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scores_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_scores_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scores_v2 hcp_scores_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_scores_v2_public_read ON public.hcp_scores_v2 FOR SELECT USING (true);


--
-- Name: hcp_therapeutic_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_therapeutic_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_therapeutic_areas hcp_therapeutic_areas_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_therapeutic_areas_public_read ON public.hcp_therapeutic_areas FOR SELECT USING (true);


--
-- Name: hcp_therapeutic_areas_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_therapeutic_areas_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_therapeutic_areas_v2 hcp_therapeutic_areas_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcp_therapeutic_areas_v2_public_read ON public.hcp_therapeutic_areas_v2 FOR SELECT USING (true);


--
-- Name: hcp_top_collaborators_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_top_collaborators_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_watchlist ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_web_signals_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcp_web_signals_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_backup_institution_cleanup_phase1_20260520; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_backup_institution_cleanup_phase1_20260520 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_backup_institution_cleanup_phase2_20260520; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_backup_institution_cleanup_phase2_20260520 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_cohort_backup_20260518; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_cohort_backup_20260518 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps hcps_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcps_public_read ON public.hcps FOR SELECT USING ((opt_out = false));


--
-- Name: hcps_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_cohort_backup_20260526; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_cohort_backup_20260526 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_cohort_backup_20260529; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_cohort_backup_20260529 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_cohortscore_backup_20260529; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_cohortscore_backup_20260529 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_pre_dedup_cleanup_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_pre_dedup_cleanup_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_pre_hashbackfill_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_pre_hashbackfill_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2_pre_stepc_incremental_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hcps_v2_pre_stepc_incremental_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: hcps_v2 hcps_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hcps_v2_public_read ON public.hcps_v2 FOR SELECT USING (true);


--
-- Name: institution_geo_lookup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.institution_geo_lookup ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_email_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_email_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

--
-- Name: invites invites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invites_select_own ON public.invites FOR SELECT TO authenticated USING ((inviter_id = auth.uid()));


--
-- Name: msl_belief_claim_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_belief_claim_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_briefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_hcp_briefs ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_briefs msl_hcp_briefs_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_briefs_delete_own ON public.msl_hcp_briefs FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_briefs msl_hcp_briefs_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_briefs_insert_own ON public.msl_hcp_briefs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_hcp_briefs msl_hcp_briefs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_briefs_select_own ON public.msl_hcp_briefs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_briefs msl_hcp_briefs_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_briefs_update_own ON public.msl_hcp_briefs FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_hcp_next_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_hcp_next_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_next_actions_delete_own ON public.msl_hcp_next_actions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_next_actions_insert_own ON public.msl_hcp_next_actions FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_hcp_next_actions.relationship_id) AND (r.user_id = auth.uid()))))));


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_next_actions_select_own ON public.msl_hcp_next_actions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_next_actions msl_hcp_next_actions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_next_actions_update_own ON public.msl_hcp_next_actions FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_hcp_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_hcp_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_notes msl_hcp_notes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_notes_delete_own ON public.msl_hcp_notes FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_notes msl_hcp_notes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_notes_insert_own ON public.msl_hcp_notes FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_hcp_notes.relationship_id) AND (r.user_id = auth.uid()))))));


--
-- Name: msl_hcp_notes msl_hcp_notes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_notes_select_own ON public.msl_hcp_notes FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_notes msl_hcp_notes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_notes_update_own ON public.msl_hcp_notes FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_hcp_relationship_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_hcp_relationship_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationship_tags_delete_own ON public.msl_hcp_relationship_tags FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_hcp_relationship_tags.relationship_id) AND (r.user_id = auth.uid())))));


--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationship_tags_insert_own ON public.msl_hcp_relationship_tags FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_hcp_relationship_tags.relationship_id) AND (r.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.msl_tags t
  WHERE ((t.id = msl_hcp_relationship_tags.tag_id) AND (t.user_id = auth.uid()))))));


--
-- Name: msl_hcp_relationship_tags msl_hcp_relationship_tags_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationship_tags_select_own ON public.msl_hcp_relationship_tags FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_hcp_relationship_tags.relationship_id) AND (r.user_id = auth.uid())))));


--
-- Name: msl_hcp_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_hcp_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_hcp_relationships msl_hcp_relationships_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationships_delete_own ON public.msl_hcp_relationships FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_relationships msl_hcp_relationships_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationships_insert_own ON public.msl_hcp_relationships FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_hcp_relationships msl_hcp_relationships_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationships_select_own ON public.msl_hcp_relationships FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_hcp_relationships msl_hcp_relationships_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_hcp_relationships_update_own ON public.msl_hcp_relationships FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_pinned_institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_pinned_institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_pinned_institutions msl_pinned_institutions_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_pinned_institutions_delete_own ON public.msl_pinned_institutions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_pinned_institutions msl_pinned_institutions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_pinned_institutions_insert_own ON public.msl_pinned_institutions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_pinned_institutions msl_pinned_institutions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_pinned_institutions_select_own ON public.msl_pinned_institutions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_tags msl_tags_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_tags_delete_own ON public.msl_tags FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_tags msl_tags_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_tags_insert_own ON public.msl_tags FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_tags msl_tags_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_tags_select_own ON public.msl_tags FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_tags msl_tags_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_tags_update_own ON public.msl_tags FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_team_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_team_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_team_invites msl_team_invites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_team_invites_insert_own ON public.msl_team_invites FOR INSERT TO authenticated WITH CHECK ((auth.uid() = inviter_user_id));


--
-- Name: msl_team_invites msl_team_invites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_team_invites_select_own ON public.msl_team_invites FOR SELECT TO authenticated USING ((auth.uid() = inviter_user_id));


--
-- Name: msl_team_invites msl_team_invites_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_team_invites_update_own ON public.msl_team_invites FOR UPDATE TO authenticated USING ((auth.uid() = inviter_user_id)) WITH CHECK ((auth.uid() = inviter_user_id));


--
-- Name: msl_watchlist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_watchlist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_watchlist_items msl_watchlist_items_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlist_items_delete_own ON public.msl_watchlist_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.msl_watchlists w
  WHERE ((w.id = msl_watchlist_items.watchlist_id) AND (w.user_id = auth.uid())))));


--
-- Name: msl_watchlist_items msl_watchlist_items_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlist_items_insert_own ON public.msl_watchlist_items FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.msl_watchlists w
  WHERE ((w.id = msl_watchlist_items.watchlist_id) AND (w.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.msl_hcp_relationships r
  WHERE ((r.id = msl_watchlist_items.relationship_id) AND (r.user_id = auth.uid()))))));


--
-- Name: msl_watchlist_items msl_watchlist_items_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlist_items_select_own ON public.msl_watchlist_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.msl_watchlists w
  WHERE ((w.id = msl_watchlist_items.watchlist_id) AND (w.user_id = auth.uid())))));


--
-- Name: msl_watchlist_items msl_watchlist_items_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlist_items_update_own ON public.msl_watchlist_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.msl_watchlists w
  WHERE ((w.id = msl_watchlist_items.watchlist_id) AND (w.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.msl_watchlists w
  WHERE ((w.id = msl_watchlist_items.watchlist_id) AND (w.user_id = auth.uid())))));


--
-- Name: msl_watchlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.msl_watchlists ENABLE ROW LEVEL SECURITY;

--
-- Name: msl_watchlists msl_watchlists_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlists_delete_own ON public.msl_watchlists FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_watchlists msl_watchlists_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlists_insert_own ON public.msl_watchlists FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: msl_watchlists msl_watchlists_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlists_select_own ON public.msl_watchlists FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: msl_watchlists msl_watchlists_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY msl_watchlists_update_own ON public.msl_watchlists FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: nih_grant_investigators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nih_grant_investigators ENABLE ROW LEVEL SECURITY;

--
-- Name: nih_grant_investigators nih_grant_investigators_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nih_grant_investigators_public_read ON public.nih_grant_investigators FOR SELECT USING (true);


--
-- Name: nih_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nih_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: nih_grants nih_grants_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nih_grants_public_read ON public.nih_grants FOR SELECT USING (true);


--
-- Name: nih_merge_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nih_merge_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: nih_merge_candidates nih_merge_candidates_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nih_merge_candidates_public_read ON public.nih_merge_candidates FOR SELECT USING (true);


--
-- Name: nih_unmatched_researchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nih_unmatched_researchers ENABLE ROW LEVEL SECURITY;

--
-- Name: nih_unmatched_researchers nih_unmatched_researchers_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nih_unmatched_researchers_public_read ON public.nih_unmatched_researchers FOR SELECT USING (true);


--
-- Name: npi_match_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.npi_match_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: npi_match_proposals_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.npi_match_proposals_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: nppes_enrichment_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nppes_enrichment_log ENABLE ROW LEVEL SECURITY;

--
-- Name: nppes_enrichment_log_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nppes_enrichment_log_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: nppes_org_to_ror; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nppes_org_to_ror ENABLE ROW LEVEL SECURITY;

--
-- Name: nsclc_oracle_counts_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsclc_oracle_counts_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: nsclc_oracle_counts_postcleanup_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsclc_oracle_counts_postcleanup_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: nsclc_oracle_hcpset_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsclc_oracle_hcpset_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: nsclc_oracle_merges_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nsclc_oracle_merges_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: openalex_author_inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.openalex_author_inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: openalex_author_inventory_pre_cycletest_20260720; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.openalex_author_inventory_pre_cycletest_20260720 ENABLE ROW LEVEL SECURITY;

--
-- Name: openalex_author_inventory_pre_reingest_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.openalex_author_inventory_pre_reingest_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_runs pipeline_runs_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pipeline_runs_public_read ON public.pipeline_runs FOR SELECT USING (true);


--
-- Name: publication_authors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_authors ENABLE ROW LEVEL SECURITY;

--
-- Name: publication_authors_backup_20260520; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_authors_backup_20260520 ENABLE ROW LEVEL SECURITY;

--
-- Name: publication_authors_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_authors_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: publication_authors_v2 publication_authors_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publication_authors_v2_public_read ON public.publication_authors_v2 FOR SELECT USING (true);


--
-- Name: publication_therapeutic_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_therapeutic_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: publication_therapeutic_areas_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publication_therapeutic_areas_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: publication_therapeutic_areas_v2 publication_therapeutic_areas_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publication_therapeutic_areas_v2_public_read ON public.publication_therapeutic_areas_v2 FOR SELECT USING (true);


--
-- Name: publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

--
-- Name: publications_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publications_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: publications_v2 publications_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY publications_v2_public_read ON public.publications_v2 FOR SELECT USING (true);


--
-- Name: pulse_ai_synthesis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pulse_ai_synthesis ENABLE ROW LEVEL SECURITY;

--
-- Name: pulse_ai_synthesis pulse_ai_synthesis_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pulse_ai_synthesis_select_all ON public.pulse_ai_synthesis FOR SELECT TO authenticated, anon USING (true);


--
-- Name: pulse_preflight_concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pulse_preflight_concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_institutions ENABLE ROW LEVEL SECURITY;

--
-- Name: region_countries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.region_countries ENABLE ROW LEVEL SECURITY;

--
-- Name: regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

--
-- Name: reingest_diff_summary_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reingest_diff_summary_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: reingest_diff_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reingest_diff_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: reingest_snapshot_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reingest_snapshot_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: ror_to_country; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ror_to_country ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_scores scores_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scores_public_read ON public.hcp_scores FOR SELECT USING (true);


--
-- Name: hcp_scientific_positions_v1 service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.hcp_scientific_positions_v1 TO service_role USING (true) WITH CHECK (true);


--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts_backup_pre_nash_cleanup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts_backup_pre_nash_cleanup ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts social_posts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_posts_public_read ON public.social_posts FOR SELECT USING (true);


--
-- Name: social_posts_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_posts_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: social_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_users ENABLE ROW LEVEL SECURITY;

--
-- Name: social_users_backup_pre_nash_cleanup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_users_backup_pre_nash_cleanup ENABLE ROW LEVEL SECURITY;

--
-- Name: social_users social_users_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_users_public_read ON public.social_users FOR SELECT USING (true);


--
-- Name: social_users_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_users_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: social_users_v2 social_users_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY social_users_v2_public_read ON public.social_users_v2 FOR SELECT USING (true);


--
-- Name: staging_us_institution_to_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staging_us_institution_to_state ENABLE ROW LEVEL SECURITY;

--
-- Name: ta_clinical_taxonomies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ta_clinical_taxonomies ENABLE ROW LEVEL SECURITY;

--
-- Name: ta_cohort_counts_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ta_cohort_counts_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: ta_cohort_counts_cache ta_cohort_counts_cache_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ta_cohort_counts_cache_public_read ON public.ta_cohort_counts_cache FOR SELECT USING (true);


--
-- Name: ta_drug_keywords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ta_drug_keywords ENABLE ROW LEVEL SECURITY;

--
-- Name: ta_hcpcs_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ta_hcpcs_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_canonical_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_canonical_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_canonical_v1 theme_canonical_v1_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_canonical_v1_public_read ON public.theme_canonical_v1 FOR SELECT USING (true);


--
-- Name: theme_to_canonical_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.theme_to_canonical_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: theme_to_canonical_v1 theme_to_canonical_v1_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY theme_to_canonical_v1_public_read ON public.theme_to_canonical_v1 FOR SELECT USING (true);


--
-- Name: therapeutic_area_ingestion_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.therapeutic_area_ingestion_config ENABLE ROW LEVEL SECURITY;

--
-- Name: therapeutic_areas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.therapeutic_areas ENABLE ROW LEVEL SECURITY;

--
-- Name: therapeutic_areas therapeutic_areas_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY therapeutic_areas_public_read ON public.therapeutic_areas FOR SELECT USING (true);


--
-- Name: tracked_conferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tracked_conferences ENABLE ROW LEVEL SECURITY;

--
-- Name: tracked_conferences tracked_conferences_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tracked_conferences_public_read ON public.tracked_conferences FOR SELECT USING (true);


--
-- Name: trial_backfill_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_backfill_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_investigator_match_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_investigator_match_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_investigator_match_proposals_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_investigator_match_proposals_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_investigators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_investigators ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_investigators_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trial_investigators_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: trial_investigators_v2 trial_investigators_v2_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trial_investigators_v2_public_read ON public.trial_investigators_v2 FOR SELECT USING (true);


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: hcp_watchlist watchlist_owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY watchlist_owner_only ON public.hcp_watchlist USING ((auth.uid() = user_id));


--
-- Name: wipe_candidates_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wipe_candidates_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO umbra_research_reader;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA realtime TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA realtime TO anon;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT USAGE ON SCHEMA realtime TO service_role;
GRANT ALL ON SCHEMA realtime TO supabase_realtime_admin;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: SCHEMA vault; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA vault TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA vault TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.armor(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.armor(bytea, text[], text[]) FROM postgres;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.crypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.dearmor(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.digest(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.digest(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.gen_random_bytes(integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.gen_random_uuid() FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.gen_salt(text, integer) FROM postgres;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.hmac(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.hmac(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO dashboard_user;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) FROM postgres;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint, minmax_only boolean) TO dashboard_user;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_key_id(bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) FROM postgres;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v1mc() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v4() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_nil() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_dns() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_oid() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_url() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.uuid_ns_x500() FROM postgres;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: -
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION pg_reload_conf(); Type: ACL; Schema: pg_catalog; Owner: -
--

GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: -
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: FUNCTION check_invite(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_invite(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_invite(p_code text) TO anon;
GRANT ALL ON FUNCTION public.check_invite(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.check_invite(p_code text) TO service_role;


--
-- Name: FUNCTION first_names_compatible(p_names text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.first_names_compatible(p_names text[]) TO anon;
GRANT ALL ON FUNCTION public.first_names_compatible(p_names text[]) TO authenticated;
GRANT ALL ON FUNCTION public.first_names_compatible(p_names text[]) TO service_role;


--
-- Name: FUNCTION get_app_config(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_app_config() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_app_config() TO anon;
GRANT ALL ON FUNCTION public.get_app_config() TO authenticated;
GRANT ALL ON FUNCTION public.get_app_config() TO service_role;


--
-- Name: FUNCTION get_community_directory_filtered(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text, p_sort text, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_directory_filtered(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text, p_sort text, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_community_directory_filtered(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text, p_sort text, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_directory_filtered(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text, p_sort text, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_community_directory_filtered_count(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_directory_filtered_count(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text) TO anon;
GRANT ALL ON FUNCTION public.get_community_directory_filtered_count(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_directory_filtered_count(p_state text, p_taxonomy_label text, p_ad_only boolean, p_search text) TO service_role;


--
-- Name: FUNCTION get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO anon;
GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO service_role;


--
-- Name: FUNCTION get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_community_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_congress_social(p_hashtags text[], p_capture_start date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_congress_social(p_hashtags text[], p_capture_start date) TO anon;
GRANT ALL ON FUNCTION public.get_congress_social(p_hashtags text[], p_capture_start date) TO authenticated;
GRANT ALL ON FUNCTION public.get_congress_social(p_hashtags text[], p_capture_start date) TO service_role;


--
-- Name: FUNCTION get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_established_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO anon;
GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO service_role;


--
-- Name: FUNCTION get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_established_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_partner_publications(p_source text, p_partner text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_partner_publications(p_source text, p_partner text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_partner_publications(p_source text, p_partner text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_partner_publications(p_source text, p_partner text, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_pulse_synthesis_facts(p_ta_slug text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pulse_synthesis_facts(p_ta_slug text) TO anon;
GRANT ALL ON FUNCTION public.get_pulse_synthesis_facts(p_ta_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.get_pulse_synthesis_facts(p_ta_slug text) TO service_role;


--
-- Name: FUNCTION get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO anon;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[]) TO service_role;


--
-- Name: FUNCTION get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_composite_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_star_filtered(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[], p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_rising_star_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_rising_star_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_rising_star_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_rising_star_filtered_count(p_ta_id uuid, p_scope_type text, p_scope_values text[], p_states text[], p_canonical_theme_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_shared_publications(p_hcp1 uuid, p_hcp2 uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_shared_publications(p_hcp1 uuid, p_hcp2 uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_shared_publications(p_hcp1 uuid, p_hcp2 uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_shared_publications(p_hcp1 uuid, p_hcp2 uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_ta_cohort_counts(p_ta_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_ta_cohort_counts(p_ta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_ta_cohort_counts(p_ta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_ta_cohort_counts(p_ta_id uuid) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION list_invites(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_invites() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_invites() TO anon;
GRANT ALL ON FUNCTION public.list_invites() TO authenticated;
GRANT ALL ON FUNCTION public.list_invites() TO service_role;


--
-- Name: FUNCTION list_users(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_users() TO anon;
GRANT ALL ON FUNCTION public.list_users() TO authenticated;
GRANT ALL ON FUNCTION public.list_users() TO service_role;


--
-- Name: FUNCTION live_ta_parent_slugs(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.live_ta_parent_slugs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.live_ta_parent_slugs() TO anon;
GRANT ALL ON FUNCTION public.live_ta_parent_slugs() TO authenticated;
GRANT ALL ON FUNCTION public.live_ta_parent_slugs() TO service_role;


--
-- Name: FUNCTION merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb) TO anon;
GRANT ALL ON FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.merge_hcp_pair(p_canonical_id uuid, p_merged_id uuid, p_pass_name text, p_signals jsonb) TO service_role;


--
-- Name: FUNCTION mint_invite(p_quota integer, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mint_invite(p_quota integer, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mint_invite(p_quota integer, p_note text) TO anon;
GRANT ALL ON FUNCTION public.mint_invite(p_quota integer, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.mint_invite(p_quota integer, p_note text) TO service_role;


--
-- Name: FUNCTION msl_profiles_lock_entitlement_cols(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.msl_profiles_lock_entitlement_cols() TO anon;
GRANT ALL ON FUNCTION public.msl_profiles_lock_entitlement_cols() TO authenticated;
GRANT ALL ON FUNCTION public.msl_profiles_lock_entitlement_cols() TO service_role;


--
-- Name: FUNCTION normalize_first_name_to_initials(p_first_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_first_name_to_initials(p_first_name text) TO anon;
GRANT ALL ON FUNCTION public.normalize_first_name_to_initials(p_first_name text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_first_name_to_initials(p_first_name text) TO service_role;


--
-- Name: FUNCTION normalize_institution(p_raw text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.normalize_institution(p_raw text) TO anon;
GRANT ALL ON FUNCTION public.normalize_institution(p_raw text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_institution(p_raw text) TO service_role;


--
-- Name: FUNCTION redeem_invite(p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.redeem_invite(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_invite(p_code text) TO anon;
GRANT ALL ON FUNCTION public.redeem_invite(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.redeem_invite(p_code text) TO service_role;


--
-- Name: FUNCTION referral_graph(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.referral_graph() FROM PUBLIC;
GRANT ALL ON FUNCTION public.referral_graph() TO anon;
GRANT ALL ON FUNCTION public.referral_graph() TO authenticated;
GRANT ALL ON FUNCTION public.referral_graph() TO service_role;


--
-- Name: FUNCTION refresh_social_analytics(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_social_analytics() TO anon;
GRANT ALL ON FUNCTION public.refresh_social_analytics() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_social_analytics() TO service_role;


--
-- Name: FUNCTION run_pass_2_openalex_merge(p_dry_run boolean, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.run_pass_2_openalex_merge(p_dry_run boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.run_pass_2_openalex_merge(p_dry_run boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_pass_2_openalex_merge(p_dry_run boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION run_pass_5_institution_merge(p_dry_run boolean, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.run_pass_5_institution_merge(p_dry_run boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.run_pass_5_institution_merge(p_dry_run boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_pass_5_institution_merge(p_dry_run boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION run_pass_6_fuzzy_institution_merge(p_dry_run boolean, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.run_pass_6_fuzzy_institution_merge(p_dry_run boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.run_pass_6_fuzzy_institution_merge(p_dry_run boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_pass_6_fuzzy_institution_merge(p_dry_run boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION run_pass_7_openalex_state_merge(p_dry_run boolean, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.run_pass_7_openalex_state_merge(p_dry_run boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.run_pass_7_openalex_state_merge(p_dry_run boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_pass_7_openalex_state_merge(p_dry_run boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION run_pass_7b_initialized_name_merge(p_dry_run boolean, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.run_pass_7b_initialized_name_merge(p_dry_run boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.run_pass_7b_initialized_name_merge(p_dry_run boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.run_pass_7b_initialized_name_merge(p_dry_run boolean, p_limit integer) TO service_role;


--
-- Name: FUNCTION set_invite_active(p_code text, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_invite_active(p_code text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_invite_active(p_code text, p_active boolean) TO anon;
GRANT ALL ON FUNCTION public.set_invite_active(p_code text, p_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_invite_active(p_code text, p_active boolean) TO service_role;


--
-- Name: FUNCTION set_signup_cap(p_cap integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_signup_cap(p_cap integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_signup_cap(p_cap integer) TO anon;
GRANT ALL ON FUNCTION public.set_signup_cap(p_cap integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_signup_cap(p_cap integer) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION set_user_active(p_user uuid, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_user_active(p_user uuid, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_user_active(p_user uuid, p_active boolean) TO anon;
GRANT ALL ON FUNCTION public.set_user_active(p_user uuid, p_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_user_active(p_user uuid, p_active boolean) TO service_role;


--
-- Name: FUNCTION toggle_signups(p_enabled boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.toggle_signups(p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_signups(p_enabled boolean) TO anon;
GRANT ALL ON FUNCTION public.toggle_signups(p_enabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_signups(p_enabled boolean) TO service_role;


--
-- Name: FUNCTION upsert_trial_investigators_preserving_match(rows_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upsert_trial_investigators_preserving_match(rows_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.upsert_trial_investigators_preserving_match(rows_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_trial_investigators_preserving_match(rows_data jsonb) TO service_role;


--
-- Name: FUNCTION upsert_trial_investigators_v2_preserving_match(rows_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upsert_trial_investigators_v2_preserving_match(rows_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.upsert_trial_investigators_v2_preserving_match(rows_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_trial_investigators_v2_preserving_match(rows_data jsonb) TO service_role;


--
-- Name: FUNCTION apply_rls(wal jsonb, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;


--
-- Name: FUNCTION broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;
GRANT ALL ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;


--
-- Name: FUNCTION build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;


--
-- Name: FUNCTION "cast"(val text, type_ regtype); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;
GRANT ALL ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;


--
-- Name: FUNCTION check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO anon;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO authenticated;
GRANT ALL ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean) TO service_role;


--
-- Name: FUNCTION is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;
GRANT ALL ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;


--
-- Name: FUNCTION list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;
GRANT ALL ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;


--
-- Name: FUNCTION quote_wal2json(entity regclass); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;
GRANT ALL ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;


--
-- Name: FUNCTION send(payload jsonb, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION send_binary(payload bytea, event text, topic text, private boolean); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO postgres;
GRANT ALL ON FUNCTION realtime.send_binary(payload bytea, event text, topic text, private boolean) TO dashboard_user;


--
-- Name: FUNCTION subscription_check_filters(); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO postgres;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO anon;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO authenticated;
GRANT ALL ON FUNCTION realtime.subscription_check_filters() TO service_role;


--
-- Name: FUNCTION to_regrole(role_name text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO postgres;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO anon;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;
GRANT ALL ON FUNCTION realtime.to_regrole(role_name text) TO service_role;


--
-- Name: FUNCTION topic(); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.topic() TO postgres;
GRANT ALL ON FUNCTION realtime.topic() TO dashboard_user;


--
-- Name: FUNCTION wal2json_escape_identifier(name text); Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO postgres;
GRANT ALL ON FUNCTION realtime.wal2json_escape_identifier(name text) TO dashboard_user;


--
-- Name: FUNCTION _crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea, nonce bytea) TO service_role;


--
-- Name: FUNCTION create_secret(new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: FUNCTION update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid); Type: ACL; Schema: vault; Owner: -
--

GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid) TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: -
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON TABLE extensions.pg_stat_statements FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements TO dashboard_user;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON TABLE extensions.pg_stat_statements_info FROM postgres;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE extensions.pg_stat_statements_info TO dashboard_user;


--
-- Name: TABLE ad_pubs_delete_list; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_pubs_delete_list TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_pubs_delete_list TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_pubs_delete_list TO service_role;


--
-- Name: TABLE ad_stale_detour_tags_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_stale_detour_tags_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_stale_detour_tags_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_stale_detour_tags_backup TO service_role;


--
-- Name: TABLE ad_yearly; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_yearly TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_yearly TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ad_yearly TO service_role;


--
-- Name: TABLE admin_users; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.admin_users TO service_role;


--
-- Name: TABLE app_config; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.app_config TO service_role;


--
-- Name: TABLE author_pub_flat; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.author_pub_flat TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.author_pub_flat TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.author_pub_flat TO service_role;


--
-- Name: TABLE canonical_hcps_snapshot; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.canonical_hcps_snapshot TO anon;
GRANT ALL ON TABLE public.canonical_hcps_snapshot TO authenticated;
GRANT ALL ON TABLE public.canonical_hcps_snapshot TO service_role;


--
-- Name: TABLE clean_dedup_map; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clean_dedup_map TO anon;
GRANT ALL ON TABLE public.clean_dedup_map TO authenticated;
GRANT ALL ON TABLE public.clean_dedup_map TO service_role;


--
-- Name: TABLE clinical_trials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clinical_trials TO anon;
GRANT ALL ON TABLE public.clinical_trials TO authenticated;
GRANT ALL ON TABLE public.clinical_trials TO service_role;


--
-- Name: TABLE clinical_trials_ta_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clinical_trials_ta_v2 TO anon;
GRANT ALL ON TABLE public.clinical_trials_ta_v2 TO authenticated;
GRANT ALL ON TABLE public.clinical_trials_ta_v2 TO service_role;


--
-- Name: TABLE clinical_trials_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clinical_trials_v2 TO anon;
GRANT ALL ON TABLE public.clinical_trials_v2 TO authenticated;
GRANT ALL ON TABLE public.clinical_trials_v2 TO service_role;


--
-- Name: TABLE cohort_overrides; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cohort_overrides TO anon;
GRANT ALL ON TABLE public.cohort_overrides TO authenticated;
GRANT ALL ON TABLE public.cohort_overrides TO service_role;


--
-- Name: TABLE community_practitioner_payments; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community_practitioner_payments TO anon;
GRANT ALL ON TABLE public.community_practitioner_payments TO authenticated;
GRANT ALL ON TABLE public.community_practitioner_payments TO service_role;


--
-- Name: TABLE community_practitioners; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.community_practitioners TO anon;
GRANT ALL ON TABLE public.community_practitioners TO authenticated;
GRANT ALL ON TABLE public.community_practitioners TO service_role;


--
-- Name: TABLE congress_abstracts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.congress_abstracts TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.congress_abstracts TO authenticated;
GRANT ALL ON TABLE public.congress_abstracts TO service_role;


--
-- Name: TABLE congress_confirmed_presenters; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.congress_confirmed_presenters TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.congress_confirmed_presenters TO authenticated;
GRANT ALL ON TABLE public.congress_confirmed_presenters TO service_role;


--
-- Name: TABLE curated_ta_concepts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.curated_ta_concepts TO anon;
GRANT ALL ON TABLE public.curated_ta_concepts TO authenticated;
GRANT ALL ON TABLE public.curated_ta_concepts TO service_role;


--
-- Name: TABLE dedup_map; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dedup_map TO anon;
GRANT ALL ON TABLE public.dedup_map TO authenticated;
GRANT ALL ON TABLE public.dedup_map TO service_role;


--
-- Name: TABLE dedup_merge_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dedup_merge_log TO anon;
GRANT ALL ON TABLE public.dedup_merge_log TO authenticated;
GRANT ALL ON TABLE public.dedup_merge_log TO service_role;


--
-- Name: TABLE dol_canonical_overrides; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dol_canonical_overrides TO anon;
GRANT ALL ON TABLE public.dol_canonical_overrides TO authenticated;
GRANT ALL ON TABLE public.dol_canonical_overrides TO service_role;


--
-- Name: TABLE dol_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dol_matches TO anon;
GRANT ALL ON TABLE public.dol_matches TO authenticated;
GRANT ALL ON TABLE public.dol_matches TO service_role;


--
-- Name: TABLE dol_matches_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dol_matches_v2 TO anon;
GRANT ALL ON TABLE public.dol_matches_v2 TO authenticated;
GRANT ALL ON TABLE public.dol_matches_v2 TO service_role;


--
-- Name: TABLE excluded_institutions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.excluded_institutions TO anon;
GRANT ALL ON TABLE public.excluded_institutions TO authenticated;
GRANT ALL ON TABLE public.excluded_institutions TO service_role;


--
-- Name: SEQUENCE excluded_institutions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.excluded_institutions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.excluded_institutions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.excluded_institutions_id_seq TO service_role;


--
-- Name: TABLE excluded_taxonomies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.excluded_taxonomies TO anon;
GRANT ALL ON TABLE public.excluded_taxonomies TO authenticated;
GRANT ALL ON TABLE public.excluded_taxonomies TO service_role;


--
-- Name: TABLE hcp_affiliation_profile_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_affiliation_profile_v2 TO anon;
GRANT ALL ON TABLE public.hcp_affiliation_profile_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_affiliation_profile_v2 TO service_role;


--
-- Name: TABLE hcp_ai_overviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_ai_overviews TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_ai_overviews TO authenticated;
GRANT ALL ON TABLE public.hcp_ai_overviews TO service_role;


--
-- Name: TABLE hcp_author_metrics_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_author_metrics_v2 TO anon;
GRANT ALL ON TABLE public.hcp_author_metrics_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_author_metrics_v2 TO service_role;


--
-- Name: TABLE hcp_author_metrics_for_cards_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_author_metrics_for_cards_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_author_metrics_for_cards_v2 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_author_metrics_for_cards_v2 TO service_role;


--
-- Name: TABLE hcp_author_metrics_latest_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_author_metrics_latest_v2 TO anon;
GRANT ALL ON TABLE public.hcp_author_metrics_latest_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_author_metrics_latest_v2 TO service_role;


--
-- Name: TABLE hcp_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_claims TO anon;
GRANT ALL ON TABLE public.hcp_claims TO authenticated;
GRANT ALL ON TABLE public.hcp_claims TO service_role;


--
-- Name: TABLE hcp_cohort_classification_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_cohort_classification_v2 TO anon;
GRANT ALL ON TABLE public.hcp_cohort_classification_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_cohort_classification_v2 TO service_role;


--
-- Name: TABLE hcp_community_scores_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_community_scores_v2 TO anon;
GRANT ALL ON TABLE public.hcp_community_scores_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_community_scores_v2 TO service_role;


--
-- Name: TABLE hcps_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_v2 TO anon;
GRANT ALL ON TABLE public.hcps_v2 TO authenticated;
GRANT ALL ON TABLE public.hcps_v2 TO service_role;
GRANT SELECT ON TABLE public.hcps_v2 TO umbra_research_reader;


--
-- Name: TABLE hcp_community_ranks_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_community_ranks_v2 TO anon;
GRANT ALL ON TABLE public.hcp_community_ranks_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_community_ranks_v2 TO service_role;


--
-- Name: TABLE hcp_community_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_community_snapshots TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_community_snapshots TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_community_snapshots TO service_role;


--
-- Name: TABLE hcp_established_scores_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_established_scores_v2 TO anon;
GRANT ALL ON TABLE public.hcp_established_scores_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_established_scores_v2 TO service_role;


--
-- Name: TABLE hcp_established_ranks_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_established_ranks_v2 TO anon;
GRANT ALL ON TABLE public.hcp_established_ranks_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_established_ranks_v2 TO service_role;


--
-- Name: TABLE hcp_established_ranks_v3; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_ranks_v3 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_ranks_v3 TO authenticated;
GRANT ALL ON TABLE public.hcp_established_ranks_v3 TO service_role;


--
-- Name: TABLE hcp_established_ranks_v3_nsclc_contaminated_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_ranks_v3_nsclc_contaminated_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_ranks_v3_nsclc_contaminated_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_ranks_v3_nsclc_contaminated_backup TO service_role;


--
-- Name: TABLE hcp_established_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_snapshots TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_snapshots TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_established_snapshots TO service_role;


--
-- Name: TABLE hcp_industry_classification_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_industry_classification_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_industry_classification_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_industry_classification_v1 TO service_role;


--
-- Name: TABLE hcp_institutions_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_institutions_v2 TO anon;
GRANT ALL ON TABLE public.hcp_institutions_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_institutions_v2 TO service_role;
GRANT SELECT ON TABLE public.hcp_institutions_v2 TO umbra_research_reader;


--
-- Name: TABLE hcp_leadership_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_leadership_evidence TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_leadership_evidence TO authenticated;
GRANT ALL ON TABLE public.hcp_leadership_evidence TO service_role;


--
-- Name: TABLE hcp_medicare_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_medicare_by_ta TO anon;
GRANT ALL ON TABLE public.hcp_medicare_by_ta TO authenticated;
GRANT ALL ON TABLE public.hcp_medicare_by_ta TO service_role;


--
-- Name: TABLE hcp_medicare_by_ta_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_medicare_by_ta_v2 TO anon;
GRANT ALL ON TABLE public.hcp_medicare_by_ta_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_medicare_by_ta_v2 TO service_role;


--
-- Name: TABLE hcp_medicare_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_medicare_summary TO anon;
GRANT ALL ON TABLE public.hcp_medicare_summary TO authenticated;
GRANT ALL ON TABLE public.hcp_medicare_summary TO service_role;


--
-- Name: TABLE hcp_medicare_summary_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_medicare_summary_v2 TO anon;
GRANT ALL ON TABLE public.hcp_medicare_summary_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_medicare_summary_v2 TO service_role;


--
-- Name: TABLE hcp_narratives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_narratives TO anon;
GRANT ALL ON TABLE public.hcp_narratives TO authenticated;
GRANT ALL ON TABLE public.hcp_narratives TO service_role;


--
-- Name: TABLE hcp_narratives_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_narratives_v2 TO anon;
GRANT ALL ON TABLE public.hcp_narratives_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_narratives_v2 TO service_role;


--
-- Name: TABLE hcp_network_centrality_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_network_centrality_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_network_centrality_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_network_centrality_v2 TO service_role;


--
-- Name: TABLE hcp_network_momentum_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_network_momentum_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_network_momentum_v1 TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_network_momentum_v1 TO service_role;


--
-- Name: TABLE hcp_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_scores TO anon;
GRANT ALL ON TABLE public.hcp_scores TO authenticated;
GRANT ALL ON TABLE public.hcp_scores TO service_role;


--
-- Name: TABLE hcp_normalized_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_normalized_scores TO anon;
GRANT ALL ON TABLE public.hcp_normalized_scores TO authenticated;
GRANT ALL ON TABLE public.hcp_normalized_scores TO service_role;


--
-- Name: TABLE hcp_nppes_detail_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_nppes_detail_v2 TO anon;
GRANT ALL ON TABLE public.hcp_nppes_detail_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_nppes_detail_v2 TO service_role;


--
-- Name: TABLE hcp_open_payments_by_drug_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_by_drug_v2 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_by_drug_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_by_drug_v2 TO service_role;


--
-- Name: TABLE hcp_open_payments_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_by_ta TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta TO service_role;


--
-- Name: TABLE hcp_open_payments_by_ta_backup_20260520; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_by_ta_backup_20260520 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta_backup_20260520 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta_backup_20260520 TO service_role;


--
-- Name: TABLE hcp_open_payments_by_ta_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_by_ta_v2 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_by_ta_v2 TO service_role;


--
-- Name: TABLE hcp_open_payments_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_summary TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_summary TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_summary TO service_role;


--
-- Name: TABLE hcp_open_payments_summary_backup_20260520; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_summary_backup_20260520 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_summary_backup_20260520 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_summary_backup_20260520 TO service_role;


--
-- Name: TABLE hcp_open_payments_summary_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_summary_v2 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_summary_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_summary_v2 TO service_role;


--
-- Name: TABLE hcp_open_payments_top_companies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_top_companies TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_top_companies TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_top_companies TO service_role;


--
-- Name: TABLE hcp_open_payments_top_companies_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_open_payments_top_companies_v2 TO anon;
GRANT ALL ON TABLE public.hcp_open_payments_top_companies_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_open_payments_top_companies_v2 TO service_role;


--
-- Name: TABLE hcp_openalex_authors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_openalex_authors TO anon;
GRANT ALL ON TABLE public.hcp_openalex_authors TO authenticated;
GRANT ALL ON TABLE public.hcp_openalex_authors TO service_role;


--
-- Name: TABLE hcp_openalex_authors_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_openalex_authors_v2 TO anon;
GRANT ALL ON TABLE public.hcp_openalex_authors_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_openalex_authors_v2 TO service_role;


--
-- Name: TABLE hcp_openalex_authors_v2_pre_cycletest_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_openalex_authors_v2_pre_cycletest_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_openalex_authors_v2_pre_cycletest_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_openalex_authors_v2_pre_cycletest_20260720 TO service_role;


--
-- Name: TABLE hcp_pharma_engagement_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_pharma_engagement_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_pharma_engagement_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_pharma_engagement_v2 TO service_role;


--
-- Name: TABLE hcp_publication_leadership_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_publication_leadership_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_publication_leadership_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_publication_leadership_v2 TO service_role;


--
-- Name: TABLE hcp_publication_leadership_v2_nsclc_presweep_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_publication_leadership_v2_nsclc_presweep_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_publication_leadership_v2_nsclc_presweep_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_publication_leadership_v2_nsclc_presweep_backup TO service_role;


--
-- Name: TABLE hcp_research_themes_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_research_themes_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_research_themes_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_research_themes_v2 TO service_role;


--
-- Name: TABLE hcp_rising_composite_v1; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.hcp_rising_composite_v1 TO anon;
GRANT ALL ON TABLE public.hcp_rising_composite_v1 TO authenticated;
GRANT ALL ON TABLE public.hcp_rising_composite_v1 TO service_role;


--
-- Name: TABLE hcp_score_ranks_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_score_ranks_v2 TO anon;
GRANT ALL ON TABLE public.hcp_score_ranks_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_score_ranks_v2 TO service_role;


--
-- Name: TABLE hcp_scores_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_scores_v2 TO anon;
GRANT ALL ON TABLE public.hcp_scores_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_scores_v2 TO service_role;


--
-- Name: TABLE hcp_rising_star_ranks_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_rising_star_ranks_v2 TO anon;
GRANT ALL ON TABLE public.hcp_rising_star_ranks_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_rising_star_ranks_v2 TO service_role;


--
-- Name: TABLE hcp_rising_star_ranks_deduped_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_rising_star_ranks_deduped_v2 TO anon;
GRANT ALL ON TABLE public.hcp_rising_star_ranks_deduped_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_rising_star_ranks_deduped_v2 TO service_role;


--
-- Name: TABLE hcp_rising_star_ranks_v3; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_ranks_v3 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_ranks_v3 TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_ranks_v3 TO service_role;


--
-- Name: TABLE hcp_rising_star_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_snapshots TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_snapshots TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_rising_star_snapshots TO service_role;


--
-- Name: TABLE hcp_scientific_emergence_v1; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.hcp_scientific_emergence_v1 TO anon;
GRANT ALL ON TABLE public.hcp_scientific_emergence_v1 TO authenticated;
GRANT ALL ON TABLE public.hcp_scientific_emergence_v1 TO service_role;


--
-- Name: TABLE hcp_scientific_momentum_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_scientific_momentum_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_scientific_momentum_v1 TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_scientific_momentum_v1 TO service_role;


--
-- Name: TABLE hcp_scientific_positions_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_scientific_positions_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_scientific_positions_v1 TO authenticated;
GRANT ALL ON TABLE public.hcp_scientific_positions_v1 TO service_role;


--
-- Name: TABLE hcp_therapeutic_areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_therapeutic_areas TO anon;
GRANT ALL ON TABLE public.hcp_therapeutic_areas TO authenticated;
GRANT ALL ON TABLE public.hcp_therapeutic_areas TO service_role;


--
-- Name: TABLE hcp_therapeutic_areas_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_therapeutic_areas_v2 TO anon;
GRANT ALL ON TABLE public.hcp_therapeutic_areas_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_therapeutic_areas_v2 TO service_role;
GRANT SELECT ON TABLE public.hcp_therapeutic_areas_v2 TO umbra_research_reader;


--
-- Name: TABLE hcp_top_collaborators_v2; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_top_collaborators_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_top_collaborators_v2 TO authenticated;
GRANT ALL ON TABLE public.hcp_top_collaborators_v2 TO service_role;


--
-- Name: TABLE hcp_watchlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcp_watchlist TO anon;
GRANT ALL ON TABLE public.hcp_watchlist TO authenticated;
GRANT ALL ON TABLE public.hcp_watchlist TO service_role;


--
-- Name: TABLE hcp_web_signals_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_web_signals_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_web_signals_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcp_web_signals_v1 TO service_role;


--
-- Name: TABLE hcps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps TO anon;
GRANT ALL ON TABLE public.hcps TO authenticated;
GRANT ALL ON TABLE public.hcps TO service_role;


--
-- Name: TABLE hcps_backup_institution_cleanup_phase1_20260520; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase1_20260520 TO anon;
GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase1_20260520 TO authenticated;
GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase1_20260520 TO service_role;


--
-- Name: TABLE hcps_backup_institution_cleanup_phase2_20260520; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase2_20260520 TO anon;
GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase2_20260520 TO authenticated;
GRANT ALL ON TABLE public.hcps_backup_institution_cleanup_phase2_20260520 TO service_role;


--
-- Name: TABLE hcps_cohort_backup_20260518; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_cohort_backup_20260518 TO anon;
GRANT ALL ON TABLE public.hcps_cohort_backup_20260518 TO authenticated;
GRANT ALL ON TABLE public.hcps_cohort_backup_20260518 TO service_role;


--
-- Name: TABLE hcps_v2_ad_july_delete_list; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_delete_list TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_delete_list TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_delete_list TO service_role;


--
-- Name: TABLE hcps_v2_ad_july_detour_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_detour_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_detour_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_ad_july_detour_backup TO service_role;


--
-- Name: TABLE hcps_v2_cohort_backup_20260526; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260526 TO anon;
GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260526 TO authenticated;
GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260526 TO service_role;


--
-- Name: TABLE hcps_v2_cohort_backup_20260529; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260529 TO anon;
GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260529 TO authenticated;
GRANT ALL ON TABLE public.hcps_v2_cohort_backup_20260529 TO service_role;


--
-- Name: TABLE hcps_v2_cohortscore_backup_20260529; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hcps_v2_cohortscore_backup_20260529 TO anon;
GRANT ALL ON TABLE public.hcps_v2_cohortscore_backup_20260529 TO authenticated;
GRANT ALL ON TABLE public.hcps_v2_cohortscore_backup_20260529 TO service_role;


--
-- Name: TABLE hcps_v2_pre_dedup_cleanup_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_dedup_cleanup_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_dedup_cleanup_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_dedup_cleanup_20260720 TO service_role;


--
-- Name: TABLE hcps_v2_pre_hashbackfill_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_hashbackfill_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_hashbackfill_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_hashbackfill_20260720 TO service_role;


--
-- Name: TABLE hcps_v2_pre_stepc_incremental_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_stepc_incremental_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_stepc_incremental_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.hcps_v2_pre_stepc_incremental_20260720 TO service_role;


--
-- Name: TABLE institution_geo_lookup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.institution_geo_lookup TO anon;
GRANT ALL ON TABLE public.institution_geo_lookup TO authenticated;
GRANT ALL ON TABLE public.institution_geo_lookup TO service_role;
GRANT SELECT ON TABLE public.institution_geo_lookup TO umbra_research_reader;


--
-- Name: TABLE institution_investigator_counts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.institution_investigator_counts TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.institution_investigator_counts TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.institution_investigator_counts TO service_role;


--
-- Name: TABLE invite_email_sends; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.invite_email_sends TO service_role;


--
-- Name: TABLE invite_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.invite_redemptions TO service_role;


--
-- Name: TABLE invites; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.invites TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.invites TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.invites TO service_role;


--
-- Name: TABLE therapeutic_area_ingestion_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.therapeutic_area_ingestion_config TO anon;
GRANT ALL ON TABLE public.therapeutic_area_ingestion_config TO authenticated;
GRANT ALL ON TABLE public.therapeutic_area_ingestion_config TO service_role;


--
-- Name: TABLE live_therapeutic_areas; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.live_therapeutic_areas TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.live_therapeutic_areas TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.live_therapeutic_areas TO service_role;


--
-- Name: TABLE msl_belief_claim_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_belief_claim_reactions TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.msl_belief_claim_reactions TO authenticated;
GRANT ALL ON TABLE public.msl_belief_claim_reactions TO service_role;


--
-- Name: TABLE msl_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.msl_contributions TO anon;
GRANT ALL ON TABLE public.msl_contributions TO authenticated;
GRANT ALL ON TABLE public.msl_contributions TO service_role;


--
-- Name: TABLE msl_hcp_briefs; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_briefs TO anon;
GRANT ALL ON TABLE public.msl_hcp_briefs TO authenticated;
GRANT ALL ON TABLE public.msl_hcp_briefs TO service_role;


--
-- Name: TABLE msl_hcp_next_actions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_next_actions TO anon;
GRANT ALL ON TABLE public.msl_hcp_next_actions TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_next_actions TO service_role;


--
-- Name: TABLE msl_hcp_notes; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_notes TO anon;
GRANT ALL ON TABLE public.msl_hcp_notes TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_notes TO service_role;


--
-- Name: TABLE msl_hcp_relationship_tags; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_relationship_tags TO anon;
GRANT ALL ON TABLE public.msl_hcp_relationship_tags TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_relationship_tags TO service_role;


--
-- Name: TABLE msl_hcp_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_relationships TO anon;
GRANT ALL ON TABLE public.msl_hcp_relationships TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_hcp_relationships TO service_role;


--
-- Name: TABLE msl_pinned_institutions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_pinned_institutions TO anon;
GRANT ALL ON TABLE public.msl_pinned_institutions TO authenticated;
GRANT ALL ON TABLE public.msl_pinned_institutions TO service_role;


--
-- Name: TABLE msl_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_profiles TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.msl_profiles TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_profiles TO service_role;


--
-- Name: TABLE msl_tags; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_tags TO anon;
GRANT ALL ON TABLE public.msl_tags TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_tags TO service_role;


--
-- Name: TABLE msl_team_invites; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_team_invites TO anon;
GRANT ALL ON TABLE public.msl_team_invites TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_team_invites TO service_role;


--
-- Name: TABLE msl_watchlist_items; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_watchlist_items TO anon;
GRANT ALL ON TABLE public.msl_watchlist_items TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_watchlist_items TO service_role;


--
-- Name: TABLE msl_watchlists; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_watchlists TO anon;
GRANT ALL ON TABLE public.msl_watchlists TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.msl_watchlists TO service_role;


--
-- Name: TABLE social_posts_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_posts_v2 TO anon;
GRANT ALL ON TABLE public.social_posts_v2 TO authenticated;
GRANT ALL ON TABLE public.social_posts_v2 TO service_role;


--
-- Name: TABLE mv_social_hot_topics_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO service_role;


--
-- Name: TABLE social_users_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_users_v2 TO anon;
GRANT ALL ON TABLE public.social_users_v2 TO authenticated;
GRANT ALL ON TABLE public.social_users_v2 TO service_role;


--
-- Name: TABLE mv_social_share_of_voice_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO service_role;


--
-- Name: TABLE mv_social_trending_topics_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mv_social_trending_topics_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_trending_topics_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_trending_topics_by_ta TO service_role;


--
-- Name: TABLE mv_social_voice_emergence_by_ta; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO service_role;


--
-- Name: TABLE nih_grant_investigators; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_grant_investigators TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_grant_investigators TO authenticated;
GRANT ALL ON TABLE public.nih_grant_investigators TO service_role;


--
-- Name: TABLE nih_grants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_grants TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_grants TO authenticated;
GRANT ALL ON TABLE public.nih_grants TO service_role;


--
-- Name: TABLE nih_merge_candidates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_merge_candidates TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_merge_candidates TO authenticated;
GRANT ALL ON TABLE public.nih_merge_candidates TO service_role;


--
-- Name: TABLE nih_unmatched_researchers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_unmatched_researchers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nih_unmatched_researchers TO authenticated;
GRANT ALL ON TABLE public.nih_unmatched_researchers TO service_role;


--
-- Name: TABLE npi_match_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.npi_match_proposals TO anon;
GRANT ALL ON TABLE public.npi_match_proposals TO authenticated;
GRANT ALL ON TABLE public.npi_match_proposals TO service_role;


--
-- Name: TABLE npi_match_proposals_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.npi_match_proposals_v2 TO anon;
GRANT ALL ON TABLE public.npi_match_proposals_v2 TO authenticated;
GRANT ALL ON TABLE public.npi_match_proposals_v2 TO service_role;


--
-- Name: TABLE nppes_enrichment_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nppes_enrichment_log TO anon;
GRANT ALL ON TABLE public.nppes_enrichment_log TO authenticated;
GRANT ALL ON TABLE public.nppes_enrichment_log TO service_role;


--
-- Name: TABLE nppes_enrichment_log_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nppes_enrichment_log_v2 TO anon;
GRANT ALL ON TABLE public.nppes_enrichment_log_v2 TO authenticated;
GRANT ALL ON TABLE public.nppes_enrichment_log_v2 TO service_role;


--
-- Name: TABLE nppes_org_to_ror; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nppes_org_to_ror TO anon;
GRANT ALL ON TABLE public.nppes_org_to_ror TO authenticated;
GRANT ALL ON TABLE public.nppes_org_to_ror TO service_role;


--
-- Name: TABLE nsclc_oracle_counts_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_20260720 TO service_role;


--
-- Name: TABLE nsclc_oracle_counts_postcleanup_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_postcleanup_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_postcleanup_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_counts_postcleanup_20260720 TO service_role;


--
-- Name: TABLE nsclc_oracle_hcpset_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_hcpset_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_hcpset_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_hcpset_20260720 TO service_role;


--
-- Name: TABLE nsclc_oracle_merges_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_merges_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_merges_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.nsclc_oracle_merges_20260720 TO service_role;


--
-- Name: TABLE openalex_author_inventory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.openalex_author_inventory TO anon;
GRANT ALL ON TABLE public.openalex_author_inventory TO authenticated;
GRANT ALL ON TABLE public.openalex_author_inventory TO service_role;


--
-- Name: TABLE openalex_author_inventory_pre_ad_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_ad_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_ad_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_ad_backup TO service_role;


--
-- Name: TABLE openalex_author_inventory_pre_cycletest_20260720; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_cycletest_20260720 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_cycletest_20260720 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_cycletest_20260720 TO service_role;


--
-- Name: TABLE openalex_author_inventory_pre_reingest_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_reingest_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_reingest_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.openalex_author_inventory_pre_reingest_backup TO service_role;


--
-- Name: TABLE pipeline_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pipeline_runs TO anon;
GRANT ALL ON TABLE public.pipeline_runs TO authenticated;
GRANT ALL ON TABLE public.pipeline_runs TO service_role;
GRANT SELECT ON TABLE public.pipeline_runs TO umbra_research_reader;


--
-- Name: TABLE pub_authors_v2_ad_july_detour_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pub_authors_v2_ad_july_detour_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pub_authors_v2_ad_july_detour_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pub_authors_v2_ad_july_detour_backup TO service_role;


--
-- Name: TABLE publication_authors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publication_authors TO anon;
GRANT ALL ON TABLE public.publication_authors TO authenticated;
GRANT ALL ON TABLE public.publication_authors TO service_role;


--
-- Name: TABLE publication_authors_backup_20260520; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publication_authors_backup_20260520 TO anon;
GRANT ALL ON TABLE public.publication_authors_backup_20260520 TO authenticated;
GRANT ALL ON TABLE public.publication_authors_backup_20260520 TO service_role;


--
-- Name: TABLE publication_authors_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publication_authors_v2 TO anon;
GRANT ALL ON TABLE public.publication_authors_v2 TO authenticated;
GRANT ALL ON TABLE public.publication_authors_v2 TO service_role;
GRANT SELECT ON TABLE public.publication_authors_v2 TO umbra_research_reader;


--
-- Name: TABLE publication_theme_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publication_theme_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publication_theme_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publication_theme_v1 TO service_role;


--
-- Name: TABLE publication_therapeutic_areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publication_therapeutic_areas TO anon;
GRANT ALL ON TABLE public.publication_therapeutic_areas TO authenticated;
GRANT ALL ON TABLE public.publication_therapeutic_areas TO service_role;


--
-- Name: TABLE publication_therapeutic_areas_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publication_therapeutic_areas_v2 TO anon;
GRANT ALL ON TABLE public.publication_therapeutic_areas_v2 TO authenticated;
GRANT ALL ON TABLE public.publication_therapeutic_areas_v2 TO service_role;


--
-- Name: TABLE publications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publications TO anon;
GRANT ALL ON TABLE public.publications TO authenticated;
GRANT ALL ON TABLE public.publications TO service_role;


--
-- Name: TABLE publications_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.publications_v2 TO anon;
GRANT ALL ON TABLE public.publications_v2 TO authenticated;
GRANT ALL ON TABLE public.publications_v2 TO service_role;
GRANT SELECT ON TABLE public.publications_v2 TO umbra_research_reader;


--
-- Name: TABLE publications_v2_ad_contaminated_backup; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publications_v2_ad_contaminated_backup TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publications_v2_ad_contaminated_backup TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.publications_v2_ad_contaminated_backup TO service_role;


--
-- Name: TABLE pulse_ai_synthesis; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_ai_synthesis TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_ai_synthesis TO authenticated;
GRANT ALL ON TABLE public.pulse_ai_synthesis TO service_role;


--
-- Name: TABLE pulse_concept_blocklist_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_concept_blocklist_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_concept_blocklist_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_concept_blocklist_v1 TO service_role;


--
-- Name: TABLE pulse_preflight_concepts; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_preflight_concepts TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_preflight_concepts TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.pulse_preflight_concepts TO service_role;


--
-- Name: TABLE reference_institutions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reference_institutions TO anon;
GRANT ALL ON TABLE public.reference_institutions TO authenticated;
GRANT ALL ON TABLE public.reference_institutions TO service_role;
GRANT SELECT ON TABLE public.reference_institutions TO umbra_research_reader;


--
-- Name: TABLE region_countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.region_countries TO anon;
GRANT ALL ON TABLE public.region_countries TO authenticated;
GRANT ALL ON TABLE public.region_countries TO service_role;


--
-- Name: TABLE regions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.regions TO anon;
GRANT ALL ON TABLE public.regions TO authenticated;
GRANT ALL ON TABLE public.regions TO service_role;


--
-- Name: TABLE reingest_diff_summary_v2; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_diff_summary_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_diff_summary_v2 TO authenticated;
GRANT ALL ON TABLE public.reingest_diff_summary_v2 TO service_role;


--
-- Name: TABLE reingest_diff_v2; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_diff_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_diff_v2 TO authenticated;
GRANT ALL ON TABLE public.reingest_diff_v2 TO service_role;


--
-- Name: TABLE reingest_snapshot_v2; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_snapshot_v2 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reingest_snapshot_v2 TO authenticated;
GRANT ALL ON TABLE public.reingest_snapshot_v2 TO service_role;


--
-- Name: TABLE ror_to_country; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ror_to_country TO anon;
GRANT ALL ON TABLE public.ror_to_country TO authenticated;
GRANT ALL ON TABLE public.ror_to_country TO service_role;


--
-- Name: TABLE social_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_posts TO anon;
GRANT ALL ON TABLE public.social_posts TO authenticated;
GRANT ALL ON TABLE public.social_posts TO service_role;


--
-- Name: TABLE social_posts_backup_pre_nash_cleanup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_posts_backup_pre_nash_cleanup TO anon;
GRANT ALL ON TABLE public.social_posts_backup_pre_nash_cleanup TO authenticated;
GRANT ALL ON TABLE public.social_posts_backup_pre_nash_cleanup TO service_role;


--
-- Name: TABLE social_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_users TO anon;
GRANT ALL ON TABLE public.social_users TO authenticated;
GRANT ALL ON TABLE public.social_users TO service_role;


--
-- Name: TABLE social_users_backup_pre_nash_cleanup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_users_backup_pre_nash_cleanup TO anon;
GRANT ALL ON TABLE public.social_users_backup_pre_nash_cleanup TO authenticated;
GRANT ALL ON TABLE public.social_users_backup_pre_nash_cleanup TO service_role;


--
-- Name: TABLE staging_us_institution_to_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staging_us_institution_to_state TO anon;
GRANT ALL ON TABLE public.staging_us_institution_to_state TO authenticated;
GRANT ALL ON TABLE public.staging_us_institution_to_state TO service_role;


--
-- Name: TABLE ta_clinical_taxonomies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ta_clinical_taxonomies TO anon;
GRANT ALL ON TABLE public.ta_clinical_taxonomies TO authenticated;
GRANT ALL ON TABLE public.ta_clinical_taxonomies TO service_role;


--
-- Name: TABLE ta_cohort_counts_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ta_cohort_counts_cache TO anon;
GRANT ALL ON TABLE public.ta_cohort_counts_cache TO authenticated;
GRANT ALL ON TABLE public.ta_cohort_counts_cache TO service_role;


--
-- Name: TABLE ta_drug_keywords; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ta_drug_keywords TO anon;
GRANT ALL ON TABLE public.ta_drug_keywords TO authenticated;
GRANT ALL ON TABLE public.ta_drug_keywords TO service_role;


--
-- Name: TABLE ta_hcpcs_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ta_hcpcs_codes TO anon;
GRANT ALL ON TABLE public.ta_hcpcs_codes TO authenticated;
GRANT ALL ON TABLE public.ta_hcpcs_codes TO service_role;


--
-- Name: TABLE theme_canonical_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_canonical_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_canonical_v1 TO authenticated;
GRANT ALL ON TABLE public.theme_canonical_v1 TO service_role;


--
-- Name: TABLE theme_concept_signature_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_concept_signature_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_concept_signature_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_concept_signature_v1 TO service_role;


--
-- Name: TABLE theme_keyword_signature_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_keyword_signature_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_keyword_signature_v1 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_keyword_signature_v1 TO service_role;


--
-- Name: TABLE theme_to_canonical_v1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_to_canonical_v1 TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.theme_to_canonical_v1 TO authenticated;
GRANT ALL ON TABLE public.theme_to_canonical_v1 TO service_role;


--
-- Name: TABLE therapeutic_areas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.therapeutic_areas TO anon;
GRANT ALL ON TABLE public.therapeutic_areas TO authenticated;
GRANT ALL ON TABLE public.therapeutic_areas TO service_role;
GRANT SELECT ON TABLE public.therapeutic_areas TO umbra_research_reader;


--
-- Name: TABLE tracked_conferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tracked_conferences TO anon;
GRANT ALL ON TABLE public.tracked_conferences TO authenticated;
GRANT ALL ON TABLE public.tracked_conferences TO service_role;


--
-- Name: TABLE trial_backfill_progress; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.trial_backfill_progress TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.trial_backfill_progress TO authenticated;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.trial_backfill_progress TO service_role;


--
-- Name: TABLE trial_investigator_match_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_investigator_match_proposals TO anon;
GRANT ALL ON TABLE public.trial_investigator_match_proposals TO authenticated;
GRANT ALL ON TABLE public.trial_investigator_match_proposals TO service_role;


--
-- Name: SEQUENCE trial_investigator_match_proposals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.trial_investigator_match_proposals_id_seq TO anon;
GRANT ALL ON SEQUENCE public.trial_investigator_match_proposals_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.trial_investigator_match_proposals_id_seq TO service_role;


--
-- Name: TABLE trial_investigator_match_proposals_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_investigator_match_proposals_v2 TO anon;
GRANT ALL ON TABLE public.trial_investigator_match_proposals_v2 TO authenticated;
GRANT ALL ON TABLE public.trial_investigator_match_proposals_v2 TO service_role;


--
-- Name: TABLE trial_investigators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_investigators TO anon;
GRANT ALL ON TABLE public.trial_investigators TO authenticated;
GRANT ALL ON TABLE public.trial_investigators TO service_role;


--
-- Name: TABLE trial_investigators_v2; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trial_investigators_v2 TO anon;
GRANT ALL ON TABLE public.trial_investigators_v2 TO authenticated;
GRANT ALL ON TABLE public.trial_investigators_v2 TO service_role;


--
-- Name: TABLE trial_investigators_v2_backup_20260706; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.trial_investigators_v2_backup_20260706 TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.trial_investigators_v2_backup_20260706 TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.trial_investigators_v2_backup_20260706 TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.waitlist TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.waitlist TO authenticated;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE wipe_candidates_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wipe_candidates_audit TO anon;
GRANT ALL ON TABLE public.wipe_candidates_audit TO authenticated;
GRANT ALL ON TABLE public.wipe_candidates_audit TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.messages TO postgres;
GRANT ALL ON TABLE realtime.messages TO dashboard_user;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE realtime.messages TO service_role;


--
-- Name: TABLE subscription; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON TABLE realtime.subscription TO postgres;
GRANT ALL ON TABLE realtime.subscription TO dashboard_user;
GRANT SELECT ON TABLE realtime.subscription TO anon;
GRANT SELECT ON TABLE realtime.subscription TO authenticated;
GRANT SELECT ON TABLE realtime.subscription TO service_role;


--
-- Name: SEQUENCE subscription_id_seq; Type: ACL; Schema: realtime; Owner: -
--

GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO postgres;
GRANT ALL ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: -
--

REVOKE ALL ON TABLE storage.buckets FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO postgres WITH GRANT OPTION;


--
-- Name: TABLE buckets_analytics; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.buckets_analytics TO service_role;
GRANT ALL ON TABLE storage.buckets_analytics TO authenticated;
GRANT ALL ON TABLE storage.buckets_analytics TO anon;


--
-- Name: TABLE buckets_vectors; Type: ACL; Schema: storage; Owner: -
--

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;
GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;
GRANT SELECT ON TABLE storage.buckets_vectors TO anon;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: -
--

REVOKE ALL ON TABLE storage.objects FROM supabase_storage_admin;
GRANT ALL ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres WITH GRANT OPTION;


--
-- Name: TABLE s3_multipart_uploads; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;


--
-- Name: TABLE s3_multipart_uploads_parts; Type: ACL; Schema: storage; Owner: -
--

GRANT ALL ON TABLE storage.s3_multipart_uploads_parts TO service_role;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;
GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;


--
-- Name: TABLE vector_indexes; Type: ACL; Schema: storage; Owner: -
--

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;
GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;
GRANT SELECT ON TABLE storage.vector_indexes TO anon;


--
-- Name: TABLE secrets; Type: ACL; Schema: vault; Owner: -
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.secrets TO service_role;


--
-- Name: TABLE decrypted_secrets; Type: ACL; Schema: vault; Owner: -
--

GRANT SELECT,REFERENCES,DELETE,TRUNCATE ON TABLE vault.decrypted_secrets TO postgres WITH GRANT OPTION;
GRANT SELECT,DELETE ON TABLE vault.decrypted_secrets TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--


