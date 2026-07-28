-- Field Intelligence Forum — seed from Design's six frames.
-- All discussion is fabricated (SIMULATED) for compliance review; the publication
-- anchors are real (join to publications_v2 by pubmed_id). Author handles are the
-- seven sanctioned pseudonyms; Design's non-exemplar threads used a few additional
-- pseudonyms which are consolidated onto the sanctioned set here.
--
-- Counts are REAL, not Design's illustrative aggregates: after seeding, every
-- thread/anchor count is recomputed as COUNT(*) of what was actually seeded. The
-- exemplar Tarlatamab thread carries Design's full post set (the four compliance
-- states); the other threads carry a small set of strictly on-anchor replies so
-- they are honest and non-empty rather than claiming volume they do not have.
-- Idempotent: clears the five tables first.

BEGIN;

TRUNCATE public.field_intel_moderation_records,
         public.field_intel_post_notes,
         public.field_intel_posts,
         public.field_intel_threads,
         public.field_intel_anchors RESTART IDENTITY CASCADE;

DO $seed$
DECLARE
  scope_on  text := 'results, endpoints, methods and limitations as published here';
  scope_off text := 'treatment recommendations, sequencing advice, comparisons to trials this paper was not designed against, and inferences beyond the powered analyses';
  a_tarl uuid; a_nivo uuid; a_amiv uuid; a_path uuid; a_neversmk uuid; a_osi uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid;
BEGIN
  -- ── Anchors ──
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40454646', 'NEJM', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40454646' RETURNING id INTO a_tarl;
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40454642', 'NEJM', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40454642' RETURNING id INTO a_nivo;
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40923797', 'NEJM', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40923797' RETURNING id INTO a_amiv;
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40634781', 'Nature Medicine', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40634781' RETURNING id INTO a_path;
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40604281', 'Nature', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40604281' RETURNING id INTO a_neversmk;
  INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
    SELECT id, '40454705', 'JCO', scope_on, scope_off FROM publications_v2 WHERE pubmed_id = '40454705' RETURNING id INTO a_osi;

  -- ── Threads ──
  INSERT INTO field_intel_threads(anchor_id, question_title, question_body, author_handle, scope_label, recency_label, is_primary)
    VALUES (a_tarl,
      'Does the duration-of-response tail change how you read the reported median DoR?',
      'Reading Figure 2, a meaningful share of responders appear to remain in response past the median follow-up, which makes the reported median feel like it understates the tail rather than describes it. I want to know whether others read the curve the same way, or whether I am over-indexing on data that has not matured.',
      '@thoracic_msl_47', 'ONCOLOGY / SCLC', '2 hours ago', true) RETURNING id INTO t1;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_tarl, 'How are people reading the cytokine-release monitoring burden as described in the safety table?', '@squamous_signal', '1 hour ago', false) RETURNING id INTO t7;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_nivo, 'How much of the OS separation tracks with pCR in the published subgroups?', '@methods_first', 'yesterday', true) RETURNING id INTO t2;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_nivo, 'Was the surgical-resection rate reported by stage, or pooled?', '@stage_iv_flow', 'yesterday', false) RETURNING id INTO t8;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_amiv, 'Was the CNS-progression analysis prespecified or post hoc?', '@io_seq_2026', '3 days ago', true) RETURNING id INTO t3;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_path, 'What validation would you want before a model-called biomarker is treated as decision-grade?', '@ctdna_practice', '4 days ago', true) RETURNING id INTO t4;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_neversmk, 'Does the signature work change how you answer etiology questions at the podium?', '@kras_watch', '5 days ago', true) RETURNING id INTO t5;
  INSERT INTO field_intel_threads(anchor_id, question_title, author_handle, recency_label, is_primary)
    VALUES (a_osi, 'Which endpoint did people read as the primary signal here — MPR or EFS?', '@squamous_signal', '6 days ago', true) RETURNING id INTO t6;

  -- ── Exemplar thread T1 posts — Design's verbatim bodies, four compliance states ──
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label)
    VALUES (t1, NULL, 1, 1, '@squamous_signal',
      'Same read. I would add that the confidence interval around the median is wide enough that the point estimate is close to uninformative on its own — the responder-status-over-time panel carries more of the information than the median does.',
      'on_anchor', 'REPORTED RESULT', '1h ago') RETURNING id INTO p1;
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label)
    VALUES (t1, p1, 2, 2, '@methods_first',
      'A design question rather than a results one: how were patients handled at the point of subsequent therapy? The supplement describes censoring but I could not tell from the text whether it applied uniformly across both arms. If it did not, the survival comparison is doing less work than the abstract implies.',
      'on_anchor', 'STUDY DESIGN', '52m ago') RETURNING id INTO p2;
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, recency_label)
    VALUES (t1, NULL, 1, 3, '@io_seq_2026',
      'Worth putting this next to the amivantamab–lazertinib survival readout (PMID 40923797) — the hazard ratios land in a similar range, which to me suggests the magnitude of benefit here is not modality-specific so much as a function of how refractory the population is.',
      'context_note', '44m ago') RETURNING id INTO p3;
  INSERT INTO field_intel_post_notes(post_id, note_type, label, body_text, disposition_text)
    VALUES (p3, 'auto_signal', 'CROSS-TRIAL COMPARISON',
      'This reply compares endpoints across two trials with different populations and comparators. Neither publication reports a head-to-head comparison. The post stays visible; this note is attached automatically and the author was notified. A moderator reviews the signal within 4 hours.',
      'Signal raised to the author and to moderation only. Peers see the reply unannotated; the note becomes public if a moderator upholds the signal.');
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, recency_label)
    VALUES (t1, NULL, 1, 4, '@stage_iv_flow',
      'The subgroup with prior immunotherapy exposure looks like where the effect concentrates. The n is small and I know it was not powered for that, but if it holds it changes where I would expect this agent to sit in the sequence — and that is roughly what I am hearing from thoracic groups in my region.',
      'under_review', '31m ago') RETURNING id INTO p4;
  INSERT INTO field_intel_post_notes(post_id, note_type, label, body_text, disposition_text)
    VALUES (p4, 'peer_flag', '2 FLAGS · UNPOWERED SUBGROUP INFERENCE, SEQUENCING PREFERENCE',
      'Reply remains visible while under review. Author notified and offered an edit before any action. Reviewers are weighing whether the closing clause reads as a sequencing position rather than an observation about the paper.',
      'Queued 28m ago · target action within 4h · author may edit until resolved');
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, recency_label, removed_body, removed_detected_phrases, placeholder_shown)
    VALUES (t1, NULL, 1, 5, '@ctdna_practice', '', 'removed', '26m ago',
      'Practically I would move this into second line for any platinum-refractory patient with adequate performance status, and that is what I have been telling my accounts. Waiting on the confirmatory readout does not serve those patients.',
      ARRAY['I would move this into second line','telling my accounts'], true) RETURNING id INTO p5;
  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, recency_label, placeholder_shown)
    VALUES (t1, p5, 2, 6, '@kras_watch', '', 'removed', '20m ago', false) RETURNING id INTO p6;

  -- ── Non-exemplar threads: small, strictly on-anchor reply sets (real content) ──
  -- T7 · Tarlatamab safety-table thread
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t7, 1, 1, '@thoracic_msl_47', 'The safety table reports CRS by grade and timing; as written, most events cluster in the first cycle, which is what the monitoring text emphasizes. I read the burden as front-loaded rather than sustained, per what the paper reports.', 'on_anchor', 'REPORTED RESULT', '58m ago');
  -- T2 · Neoadjuvant nivolumab OS/pCR
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t2, 1, 1, '@squamous_signal', 'The subgroup tables report pCR-stratified OS, but the paper is explicit that the trial was not powered to test OS within the pCR and non-pCR strata separately — so I read those curves as descriptive rather than inferential.', 'on_anchor', 'REPORTED RESULT', '22h ago'),
    (t2, 1, 2, '@io_seq_2026', 'Adding that the OS follow-up is still maturing per the manuscript; any read of how much tracks with pCR is bounded by the reported confidence intervals, which the authors flag directly.', 'on_anchor', 'STUDY DESIGN', '20h ago');
  -- T3 · Amivantamab–Lazertinib CNS analysis
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t3, 1, 1, '@methods_first', 'The methods list the CNS endpoints among the secondary analyses and note they were not alpha-controlled — the paper says as much, so I would read them as exploratory rather than confirmatory.', 'on_anchor', 'STUDY DESIGN', '3 days ago'),
    (t3, 1, 2, '@squamous_signal', 'Same read. As reported here the CNS-progression comparison is described in the supplement as exploratory; calling it prespecified would over-state what the analysis plan supports.', 'on_anchor', 'REPORTED RESULT', '3 days ago');
  -- T4 · Pathology foundation model validation
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t4, 1, 1, '@ctdna_practice', 'As published, concordance is reported against a single reference standard per site, and the paper frames the model output as assistive rather than standalone — which seems like the right boundary for reading this result.', 'on_anchor', 'REPORTED RESULT', '4 days ago'),
    (t4, 1, 2, '@kras_watch', 'The external-validation cohort is described as retrospective — the authors say so — so a decision-grade read would wait on the prospective work they list as future.', 'on_anchor', 'STUDY DESIGN', '4 days ago');
  -- T5 · Never-smoker genomes signatures
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t5, 1, 1, '@kras_watch', 'The signatures are reported at cohort level; the paper is explicit that they are associations across the never-smoker genomes studied, not individual-level attributions, which is the boundary I would keep to.', 'on_anchor', 'REPORTED RESULT', '5 days ago'),
    (t5, 1, 2, '@methods_first', 'The signature calls depend on the sequencing depth described in methods — the limitations paragraph is worth reading before generalizing beyond the cohort.', 'on_anchor', 'STUDY DESIGN', '5 days ago');
  -- T6 · Neoadjuvant osimertinib endpoints
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t6, 1, 1, '@squamous_signal', 'The methods name the primary endpoint explicitly: MPR is reported as primary and EFS among the secondary readouts, so I would anchor the read on MPR as published.', 'on_anchor', 'REPORTED RESULT', '6 days ago'),
    (t6, 1, 2, '@thoracic_msl_47', 'EFS is still maturing per the follow-up table — the manuscript flags it as not yet reaching the prespecified number of events, so I read it as directional only.', 'on_anchor', 'STUDY DESIGN', '6 days ago');
  -- T8 · Nivolumab surgical-resection thread
  INSERT INTO field_intel_posts(thread_id, depth, ordinal, author_handle, body, compliance_state, anchor_fragment, recency_label) VALUES
    (t8, 1, 1, '@methods_first', 'The resection rates are reported in the CONSORT flow; as written they are pooled across stages, with the stage breakdown left to the supplement rather than the primary table.', 'on_anchor', 'REPORTED RESULT', '22h ago');

  -- ── Moderation records ──
  INSERT INTO field_intel_moderation_records(case_number, post_id, thread_id, anchor_pubmed_id, author_handle, queue_state, sla_label, anchor_check_text, classifier_score, account_history, audit_log)
    VALUES ('2026-0714-118', p4, t1, '40454646', '@stage_iv_flow', 'open_peer_flag', '3h 32m of SLA remaining',
      'PMID 40454646 reports the exploratory subgroup, but the analysis was not powered for it and the paper draws no sequencing conclusion. The first two sentences are on anchor; the third is an inference the paper does not support.',
      0.61, '0 prior actions, 84 posts',
      '[{"t":"31m","event":"reply posted — classifier 0.61 — below auto-hold"},{"t":"28m","event":"peer flag received (reason: goes beyond what the paper reports)"},{"t":"24m","event":"peer flag received (reason: reads as clinical recommendation)"},{"t":"24m","event":"queued to Oncology reviewer pool — author notified of review"},{"t":"—","event":"awaiting reviewer decision"}]'::jsonb);
  INSERT INTO field_intel_moderation_records(case_number, post_id, thread_id, anchor_pubmed_id, author_handle, queue_state, timing_label, anchor_check_text)
    VALUES ('2026-0714-117', p3, t1, '40454646', '@io_seq_2026', 'open_auto_signal', '44m ago',
      'The reply compares endpoints across two trials with different populations and comparators. Neither publication reports a head-to-head comparison; the note is attached automatically and a moderator reviews the signal within 4 hours.');
  INSERT INTO field_intel_moderation_records(case_number, post_id, anchor_pubmed_id, author_handle, queue_state, timing_label, blocked_reason, notification_state, decision_text)
    VALUES ('2026-0714-116', NULL, NULL, '@kras_watch', 'blocked_at_composer', '1h ago',
      'Question submitted without a publication anchor', 'never published',
      'Drafts blocked here are logged but never visible to peers — this queue lane exists so the volume of prevented posts is auditable alongside the volume of removals.');
  INSERT INTO field_intel_moderation_records(case_number, post_id, thread_id, anchor_pubmed_id, author_handle, queue_state, timing_label, clause_cited, clause_text, notification_state, appeal_window_days, classifier_score, decision_text, follow_up_text, audit_log)
    VALUES ('2026-0714-119', p5, t1, '40454646', '@ctdna_practice', 'resolved_removed', 'time to action 41m',
      'Scope 3.2 + 3.4',
      'Removed under Scope 3.2 — clinical recommendation, and 3.4 — describing influence on prescriber decisions. Two distinct failures: advice to peers, and a self-report of promotional conduct in territory.',
      'Author notified with both clauses', 7, 0.91,
      'Removed under Scope 3.2 — clinical recommendation. The reply advised a treatment sequence and described directing prescriber behaviour, neither of which is a discussion of what the anchored publication reports.',
      'Second action on this account in 90 days → posting rate limit applied. Third action → referral to the author''s own compliance contact under the MSL attestation. Retained for 7 years — exportable on request from a member company''s compliance function.',
      '[{"t":"67m","event":"reply posted — classifier 0.91 recommendation likelihood — auto-held from view"},{"t":"67m","event":"author shown the clause and offered an edit; no edit made"},{"t":"44m","event":"peer flag received (reason: reads as clinical recommendation)"},{"t":"26m","event":"reviewer M. Okonkwo removed the reply, clauses 3.2 + 3.4 cited"},{"t":"26m","event":"placeholder published in thread — reply chain preserved"}]'::jsonb);
END
$seed$;

-- ── Recompute all displayed counts as COUNT(*) of what was actually seeded ──
-- "Visible" = occupies a peer slot (placeholder_shown): on-anchor, under-review,
-- context-note, and removed-with-placeholder. The nested no-placeholder removal
-- is excluded from every count — peers never see it.
UPDATE public.field_intel_threads t SET
  reply_count        = (SELECT count(*) FROM public.field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown),
  under_review_count = (SELECT count(*) FROM public.field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'under_review'),
  removed_count      = (SELECT count(*) FROM public.field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'removed'),
  context_note_count = (SELECT count(*) FROM public.field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'context_note'),
  participant_count  = (SELECT count(DISTINCT h) FROM (
                          SELECT t.author_handle AS h
                          UNION
                          SELECT p.author_handle FROM public.field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown
                        ) s);

UPDATE public.field_intel_anchors a SET
  thread_count = (SELECT count(*) FROM public.field_intel_threads t WHERE t.anchor_id = a.id),
  reply_count  = (SELECT count(*) FROM public.field_intel_posts p
                    JOIN public.field_intel_threads t ON t.id = p.thread_id
                    WHERE t.anchor_id = a.id AND p.placeholder_shown);

COMMIT;
