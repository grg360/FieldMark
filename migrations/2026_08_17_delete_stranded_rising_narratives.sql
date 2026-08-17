-- ============================================================================
-- Delete the stranded rising_star/nsclc narratives. Date: 2026-08-17
-- Branch: resurfacing
--
-- Restore:  sql/revert/2026_08_17_stranded_rising_narratives_RESTORE.sql
-- Manifest: migrations/2026_08_17_delete_stranded_rising_narratives.MANIFEST.tsv
--
-- ── What made them stranded ─────────────────────────────────────────────────
-- scripts/score/rising_star_scoring.py raised MIN_VELOCITY_DELTA from > 0 to >= 3
-- on 2026-08-17. The board went 619 -> 251 (US 123 -> 57, EU 132 -> 48). These
-- rows describe people that rescore removed from hcp_rising_star_ranks_v3.
--
-- This is a ONE-TIME consequence of that threshold change, not recurring drift.
-- The generator's own gate is already correct: fetch_rising_star_top_hcp_ids_v3()
-- in scripts/narrative/generate_narratives_v2.py selects
-- `us_rank IS NOT NULL ORDER BY us_rank`, which now returns the 57 survivors and
-- cannot re-create these. The v4.1 run wrote 123 narratives against the then-US
-- board of 123; the floor then cut US to 57, stranding exactly 66 of them.
--
-- ── The 278, measured 2026-08-17 ────────────────────────────────────────────
--   158  now on the established board (hcp_established_ranks_v3, nsclc)
--        -- all 158 are cohort='established' in hcp_cohort_classification_v2
--   120  boardless: on no nsclc board at all
--        -- all 120 are cohort='rising_eligible' in hcp_cohort_classification_v2.
--        Eligible is a WIDER career-structure gate than ranked, so these are
--        candidates that did not clear the new floor, not misclassifications.
--   0    on the community board.
-- The two taxonomies agree exactly, which is why the split is stated with no
-- residual bucket.
--
-- ── Known and accepted: 270 people are left with NO narrative ───────────────
-- Only 7 of the 158 established-board members already carry an established
-- narrative; 1 more carries a community one. Deleting leaves 150 of them and all
-- 120 boardless people with nothing. That is correct for the ledgers, which read
-- narratives by (hcp_id, slug, cohort) and were already finding nothing for a
-- non-member -- but a narrative REGENERATION for the established cohort is the
-- natural follow-on, and the 150 are its work-list. Deleting first is still right:
-- these texts describe a rising trajectory the board no longer asserts.
--
-- ── Safety ─────────────────────────────────────────────────────────────────
-- Deletes by EXPLICIT ID, not by predicate, so it removes exactly the 278 rows
-- that were manifested and backed up even if the board moves between authoring
-- and applying. Two guards below refuse to proceed on any drift.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _stranded_narratives (id uuid PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _stranded_narratives (id) VALUES
  ('02b08cc6-e979-4629-a954-4453ef69bff4'),
  ('044a564d-3b51-48bc-b939-40f6a70147e3'),
  ('05b0656e-7f31-41fe-ba1b-1fc43b27ad1c'),
  ('06799847-e1e9-4c1e-a604-ed2e05e20885'),
  ('08594c7c-b3d2-43df-aeb1-d67af1fca362'),
  ('0a6cbda8-3dad-4823-a2b5-ccdf6eadf38f'),
  ('0ad64a63-003c-4ab9-8f65-252d9cc353a8'),
  ('0bd58481-a93c-41fe-841b-8794d4bafba4'),
  ('0cc2a10e-707c-485f-b433-cf2bc445d568'),
  ('0d88b80d-f6e8-4bc3-854e-337635b0bc08'),
  ('0daf3a86-79c4-422d-839e-f5f9e4accc8d'),
  ('0ebb9979-c5b8-459f-b355-8c866693fc47'),
  ('1033b02e-889a-4bd9-aa88-18d4e09397df'),
  ('109a5da5-7528-4c78-985b-98dbbec47146'),
  ('10a219d7-a5e9-45ae-9c8a-b39bb83cad43'),
  ('1234283f-3300-4c24-873e-cb078201af5f'),
  ('128f0819-6a73-45b8-a2e8-eecda069f0ec'),
  ('12cedcf1-75ea-45e0-944b-b7ef553d3e73'),
  ('1314c5f8-fb6c-4fdd-a4be-2fe6dce23244'),
  ('14ea1c55-edc7-4fee-b38e-009aa34db3d4'),
  ('159f3a28-2fb0-421d-84e0-38f0d7f73d52'),
  ('165226ac-32b3-47f9-b369-b0a4bdc173ca'),
  ('181db383-6e67-4c8f-b5f6-03231d88786a'),
  ('1b92ef5f-ee98-4264-b092-39f1657f9e7d'),
  ('1c1db27b-d40e-4106-ad2d-605c63816bfa'),
  ('1d1708f0-a569-4088-913d-cdef5454b987'),
  ('1d1cf71c-d7ce-4575-bec7-15f06a9fde4d'),
  ('1d3d06be-3b36-45cf-89ca-4692fd9b4e61'),
  ('1f929c92-64a4-402d-ae90-ffbe2dbb3f60'),
  ('1f9f5638-26ec-49b7-9ce6-53097b8eb947'),
  ('1f9ffce4-a6e7-4fdb-ae49-7721ebc1bf78'),
  ('2100401f-24a2-4f43-a3ea-80fef816d7f8'),
  ('21c5dd3c-9f54-4d7f-80df-afe874aac742'),
  ('22b9e3fc-ecea-4f41-ba28-af43068402bb'),
  ('22d273e0-bb35-4f41-aabe-86ed8f717c3e'),
  ('2467581a-62c5-47be-8ded-17ecfe7d5c64'),
  ('24896d20-2b6b-4bd6-ba68-ec740a57ceb9'),
  ('25f40482-1b55-459f-816d-6c7bf7be4fd6'),
  ('261cf43e-e487-461d-8b97-4b6fb28c2310'),
  ('27e0164b-bacc-4ec5-a2fa-4987966d46ae'),
  ('286b1e67-f5e1-4e64-972c-466b12e8026a'),
  ('28f2520a-ec57-4cac-a02e-07c962290f92'),
  ('298d8b85-ad8b-4bba-bd1d-634d3c051143'),
  ('2a88fd06-52ff-4f68-916e-0a86ba91a16e'),
  ('2aff21d5-3b05-4b94-b325-882862da932d'),
  ('2cf147e7-8bd6-45eb-956b-e2db23198021'),
  ('2d4b51a2-8a52-4f6d-8181-e0bc4a120889'),
  ('2dc576e9-5dd2-4cbf-93ff-68f44acb516a'),
  ('30d74531-0e5e-4676-a290-db9c7c65a1f7'),
  ('31392742-9a63-4373-914d-4a17e5db814c'),
  ('32bc6f53-360f-4fcf-b94b-b6892645986c'),
  ('330ea906-f283-4656-8818-0c883666f896'),
  ('3417b174-b0cd-4f7b-b99c-2eff999d0a99'),
  ('34540ede-6e50-4a16-baae-0eaa76d2e9a0'),
  ('35697a25-b97f-4107-8236-12d1ac83b4b1'),
  ('35ce092d-5b50-4bd6-810f-b5463142c68d'),
  ('3601dd78-6e21-4afe-836a-61f76eeaabf7'),
  ('36423998-bdec-4d0a-8d85-6964f439af11'),
  ('3699aaae-9ea1-48cc-b654-cc92797c487b'),
  ('372e39db-42ca-43bd-9677-6f8b51ece36c'),
  ('3740ee0d-0799-4132-826f-6d6f68b8e36f'),
  ('37dfcdeb-8c39-42a5-9437-e045cf8a8341'),
  ('382ed22e-0e81-4b61-aa3b-95a872059962'),
  ('39fc9196-7552-4cbb-93e2-22c78a8ab47d'),
  ('3a3717b0-c276-4a00-98a3-5d426a06c0d7'),
  ('3a5a3506-12bc-4a9b-860e-8fe710091eba'),
  ('3c9db795-41bc-46ff-93b4-cb91a8c709c6'),
  ('3ebe625e-b652-4dcd-a761-a95cd2fc3966'),
  ('4230225c-0b95-418a-b619-ae3b6cac26a1'),
  ('436047d6-2703-4899-ac5d-92a6d90d1e1f'),
  ('4391a041-de8a-4b68-a239-c9c5f72b0a39'),
  ('4447394f-b2aa-4f71-bd15-42fd4583712f'),
  ('45956e94-bf2a-4bbc-8ceb-9a2f63ae8dcf'),
  ('463ed7b6-3352-4d78-8204-10c0fd15bfe0'),
  ('46ab23fb-be5c-438a-ba8f-32bc5d64ca1d'),
  ('46cc51e3-8255-4b8b-bf08-3fe13df40edc'),
  ('4898a880-8046-4c55-8e28-b5a6b328b2cd'),
  ('489f519f-60f0-4045-860b-b930c6d81c17'),
  ('48ccc666-1564-441f-a107-565aa56251bb'),
  ('491c88de-f084-4d91-9a75-18c8ae7ae4c4'),
  ('49ba8b5b-0256-478d-acb0-18423b1d8045'),
  ('4a459034-a8a2-4d96-a2bf-63917e996868'),
  ('4a94251b-6c2b-4714-8884-fec58f7fa66e'),
  ('4b635c89-5ad1-4e8e-8cef-c01469ce3eda'),
  ('4bf602cf-a424-4e28-a903-465910b4d5ba'),
  ('4c7f15b2-34a1-4d51-98f5-4ff8c0d09ed3'),
  ('4c822888-48ea-4ff7-9fd1-39d025cca6d6'),
  ('4cd095a4-45e6-424f-b761-fb93f4d348ac'),
  ('4d289a3c-88c4-439c-8354-fd793ccade5d'),
  ('4d38fe0a-7b2e-42a3-bcaa-097cd87de56e'),
  ('4f07f8d0-9614-42fa-9ba8-668ce160a778'),
  ('4ff72ca3-fbe6-494f-8c7b-aa82d7ad6364'),
  ('516cf2b8-f720-41e0-b6e5-8636a45b2d29'),
  ('51a236d4-16c8-4837-82f3-e94d487fa992'),
  ('526bc878-d050-40fd-ab37-86800b09bb7b'),
  ('52c06faf-b163-4595-bf77-fcbab6f51b59'),
  ('54831705-39ba-47b4-988c-ef08e3fa8012'),
  ('54a213f9-0862-4b4a-8023-eaae26e3ca75'),
  ('54cfeffd-1f00-4a57-9ba5-8f290394f15f'),
  ('5521a4c3-4e53-457c-b939-8baef197b726'),
  ('5562310d-20ec-4210-8296-cd52a474e4d4'),
  ('562b61f0-b4b8-4ea8-8dd1-7e1b93871f58'),
  ('5678d1aa-6eb3-44cb-98dd-041452bdcc3f'),
  ('57bf623d-53e8-4bf8-b92a-c6699cf2421a'),
  ('5a017edf-6f4d-48ae-9607-cfc2b25e5841'),
  ('5c47e36b-a53b-41fc-bae0-8c95d8d09ec7'),
  ('5c61c8f6-d7a1-434f-b5a0-2c6fe8c46c33'),
  ('5e370fa9-9118-423d-9c7e-b6175c11f840'),
  ('5fa1bf38-64c6-41a6-83af-04f148153766'),
  ('60a37246-a84b-41e0-90e3-ead0e7c337f8'),
  ('653a3a52-dc3f-4db0-810e-6107b2fdc218'),
  ('658cf0ef-7516-4f7a-aed7-6c20d9a2f44d'),
  ('65badf87-56b9-4204-83c3-8d1b811baccc'),
  ('671ab26a-c674-4258-8905-980316d7ae83'),
  ('6b6349c5-a093-4a8c-9f8e-972778007c52'),
  ('6b8d3c5a-1786-4ab6-8abe-6cc1a9b91b4f'),
  ('6d540757-01f9-46bd-b2bf-09483282b9fb'),
  ('6d6fc3d5-bb90-4d78-9e15-e18ec49be033'),
  ('6dab1480-d705-479d-a7fc-63af5b456860'),
  ('6f32e23c-c0fa-4b0e-9bf3-69a163b50f67'),
  ('7004a545-4c98-44a8-b150-0c86a48fe322'),
  ('706bfe50-2cc8-4a64-8cd7-7cc6ee8f9196'),
  ('70cf2d9b-09a3-43be-b492-85eefe07c745'),
  ('725e3e33-cb36-4d07-9e49-854d2a69b539'),
  ('73379490-a586-4de5-856d-331bf1d6d23a'),
  ('73a2322e-2a51-45f0-8d4e-6d6ee6622f20'),
  ('741d36ea-9691-43f9-8166-2ccbe032c639'),
  ('7ae7aaaa-809b-4d7e-9263-35f2ef1d918f'),
  ('7bb4e096-d343-48c1-b7ab-9398b28168ee'),
  ('7be9590a-fd94-4ace-96d5-85cba49a17f1'),
  ('7c11f62b-3f92-4752-9fc5-47ac4eb7f557'),
  ('7e72d0ae-3031-4909-bb73-c9d51325d8a4'),
  ('7e73a438-ecd1-4f19-8440-ec1ccce65adf'),
  ('7edf3f3e-4d01-44fc-a7ec-d291d45abb64'),
  ('7f2111c7-119e-4cd7-a060-e021b4166b44'),
  ('7f236a4c-2730-4a35-b404-09ce825cd35b'),
  ('7fa2b392-6f8f-4a32-b7d9-f968f1c52b87'),
  ('80230e14-38df-4734-9b52-e22e13da11f8'),
  ('80f31aec-dd89-4456-9a1b-e779ac07e10a'),
  ('81e48b4b-6331-4a56-8a74-bc9c1548e627'),
  ('852ad61c-e9db-4f40-97bf-495ec4bfc84c'),
  ('855ce2f7-562d-4657-a3eb-6812da7bf130'),
  ('870f698d-d7f8-4ee4-b6a2-77d963df5ab7'),
  ('87456138-e9a0-4ac1-916c-7636e95efee4'),
  ('87cb1c2f-fb64-4f20-847d-a8de7827211e'),
  ('88a4d5fb-2977-4a78-b992-84bd8337bc04'),
  ('8c20e8da-5118-4a99-9646-e2cbd40c3a6b'),
  ('8d6f438c-1c1d-4eab-81b6-d779098e7cdb'),
  ('8eed6da8-6606-4856-9419-ea96d065e62e'),
  ('8f04a7c3-44b9-4ce0-862b-d6317139d32a'),
  ('8f664ee3-3c65-42bd-9661-985880a9731b'),
  ('8ffdec99-3a61-44b8-8640-c322dfe4775a'),
  ('926c1dbb-29bc-4d0c-817c-f32f5710ae76'),
  ('942b939e-45cd-4341-8996-681d4cd1b6fb'),
  ('94405880-2c95-4e35-9c40-022598ecf642'),
  ('9688c89b-345f-4698-b3ac-3b78f265bf05'),
  ('96c41650-0e87-4c38-ad65-4453e66a1919'),
  ('98579b27-accc-4b62-9359-617b478ee163'),
  ('98b675bc-fbc9-4925-8789-fd9a1a35fc53'),
  ('9a6415a8-93d9-4177-9cfa-98348f9a5e71'),
  ('9a6d2bca-8c7f-4c74-a480-5a94b2b04d78'),
  ('9b475cca-a1a8-47ca-99a9-9263cbec419e'),
  ('9b70e121-b4bf-4aff-a1ec-4ef25d06c2e0'),
  ('9db1241c-fc83-442f-8387-7e783bc55389'),
  ('9e604a72-63c6-4953-8882-146aeb421779'),
  ('a093b0a8-8e37-4835-bd8b-4235e59bffd6'),
  ('a11fe462-5b55-4b3f-8b8f-4369814e6fb4'),
  ('a2f1e517-feae-472b-b09f-d64a165da07c'),
  ('a3f151eb-4332-42e6-beeb-9b46a7facda7'),
  ('a426d3c2-9733-40ae-bce4-c955b1aa3c14'),
  ('a7dda541-4152-4323-8428-cfa0f173f861'),
  ('a7e20b14-938d-4eb1-bca9-a338bd037166'),
  ('a89e81fe-4eb3-4d80-9a1c-6c950b1eaa9f'),
  ('a8b4c603-0914-4967-ba5d-57e522a34416'),
  ('a8ba8151-08a8-4b66-9fb6-6a2d5e61fd98'),
  ('a921257a-d616-4a72-9656-77cbe435ac22'),
  ('aa81e32e-c352-4ec1-ae75-5bb331d4a83a'),
  ('ac4a5883-a033-430e-8120-d56371b9a6af'),
  ('ac7d1a45-8ebf-4f44-a3fd-b30d62f2539b'),
  ('ace2241e-5ec3-41b6-920f-c7f6ec97bbfa'),
  ('afc22f14-ca26-4c3c-9be9-d29673c69689'),
  ('b022e113-55f3-445d-8e15-880f8885542c'),
  ('b063d5ec-d6c2-4ba0-808a-d0743b47ea2f'),
  ('b1031057-56bb-4ae9-8338-50fb9715748b'),
  ('b198633a-79e5-4aa9-a166-6c3cba485ef2'),
  ('b2017104-3009-48cd-990d-4b76ae4dc3d4'),
  ('b2198db3-4ae2-456f-b816-c6a54af5fa1f'),
  ('b3b5dd11-fb43-4646-a16b-65cf2b4912e2'),
  ('b51ecef8-9d17-4a51-a5c8-cd1481a6175e'),
  ('b539ca36-5e4c-4de9-80a2-dc8e997e64e1'),
  ('b57c8672-5c70-4d71-b019-523614af3eaf'),
  ('b86d0c9f-0a2a-466b-b9dd-ea3eacc0f94a'),
  ('bace574b-c817-4a23-9b9a-854273ebd13d'),
  ('bb232d90-47e5-433f-9233-8571988b410a'),
  ('bb893850-e226-49cf-8451-0df388c6b968'),
  ('bbc58adc-4d40-4dce-a6ca-db3702fa6e01'),
  ('bd5cd6db-0d20-4397-a806-1a9adb1bbc65'),
  ('bef5558c-f5aa-439d-b875-2f9bdb4aa095'),
  ('bf711d6a-7c85-472e-8e16-0a2cc53691cf'),
  ('c09b154a-9f96-47e2-9cb9-5256cc4e3634'),
  ('c157728b-50e9-4f31-9ca9-2c2af0b87152'),
  ('c2d7c717-c0e1-46d5-8a9a-6292e95e0b51'),
  ('c2e4deba-96ca-44db-83d0-fd9977c12de3'),
  ('c3635966-ef82-4d21-8772-6c89b963ddbb'),
  ('c4d7db4a-efa5-428e-9bda-17686cde330e'),
  ('c4f77846-af98-4e40-ac5f-397eb7babd25'),
  ('c566bd7c-c6b8-42e9-bc9f-43514bfc2898'),
  ('c63dc7b8-5ff2-4511-81c5-5fbbb695f831'),
  ('c732874d-0a29-41b0-9349-4127c4090922'),
  ('c7446bd8-37a3-4298-bb9b-b36f464a84ec'),
  ('c7cc6f7a-99c0-4c31-bcb4-c8a6f4f576d5'),
  ('c7f2f8c7-89ef-4a63-9038-fae728ab086f'),
  ('c90e4179-083b-4316-b39e-d6bc93525d5a'),
  ('c94a729f-cea3-41ad-878d-198c09b7f2e2'),
  ('c9e140f8-c8a1-4212-8a16-f2b13e0b5240'),
  ('cb0d88a5-29ce-47c3-a918-fcc73f83b5f0'),
  ('cb9bfaaa-6ff6-4e25-afb6-787f4f2762ca'),
  ('cbb61b43-5cfc-4c89-826f-2c26bc785c2a'),
  ('cc082d5a-253a-4378-9abf-34406354b7ad'),
  ('cc9a5123-1f07-432e-bcf3-836ea82208d7'),
  ('ccd55189-d394-44ee-b690-ebd129bd56be'),
  ('cdd5f9b5-b03c-477d-86c6-5d9730433af1'),
  ('cebcc855-2465-4816-bd79-ee1b61310340'),
  ('cf8be82c-23a5-4a5e-8738-2a92710bfc10'),
  ('cfcdede9-3393-4953-a545-2436af343adf'),
  ('cfefc5b5-ff83-4cf4-a1c9-9f8f9988685a'),
  ('d1116e8b-7d39-4991-a402-16b783d2dc81'),
  ('d25ade74-5eb5-46fc-8e4c-123f86403445'),
  ('d3d53137-a5cb-400a-b296-547ec16772b0'),
  ('d4bd4ca1-4c71-4978-9433-956a6c35d88b'),
  ('d52f8e8d-99f7-43b2-bbc3-1ec601863bd3'),
  ('d563d180-0136-4a04-9f14-80c91ab0c6d8'),
  ('d64db819-66ca-42cc-b952-3600fa8dfd3d'),
  ('d66f9e2d-efc2-4a47-9b19-5b6fcafe4fde'),
  ('d6bde1dc-2bb7-4498-83fb-8964a56c18e9'),
  ('d798240c-4ea0-4b47-99a5-6419d8a628e3'),
  ('d79b3142-f208-43d7-8556-cf43c2e8e80c'),
  ('d967b5b4-5ed1-472c-9e00-6943c8265f4c'),
  ('d9990935-42eb-474e-ace8-66e930aea122'),
  ('db4eec15-4c85-4e6e-a553-d1277dfc1f50'),
  ('dbff154f-333d-4aa7-bbfe-18958097fbc1'),
  ('dc31bce5-ceec-4a69-a2a2-bcbae2fcdd30'),
  ('dca22d60-d945-49cc-bfa3-0b5890632b14'),
  ('dcfcb827-11fb-4806-80f0-a656f90184b6'),
  ('dd03d690-96b6-4d3c-9ceb-41995bb8c1ca'),
  ('ddb86115-edf2-4f84-8d2d-a1ea9b817296'),
  ('debee90f-ed56-4445-938e-e421f5e675d1'),
  ('df0418fc-08b5-430c-bf56-a98ca0ed4b18'),
  ('e4a5205d-09e7-4f87-a429-c026532eee74'),
  ('e51c7edc-a085-43ec-9aad-e4d6e5eae670'),
  ('e55d8fa1-cabe-4f0c-b173-2a6a0a6a50e9'),
  ('e5f56333-1ff5-4830-a129-e2cb08fe4d74'),
  ('e66cb91a-2062-41c5-a9ec-2b90bd295143'),
  ('e6bf1d9f-3293-4638-8562-3cb44f921142'),
  ('e6cd4569-eeee-4a8f-943d-b420088b199c'),
  ('e72694d3-b05e-410c-9881-8940bccaf05e'),
  ('e73a1b76-bad2-4760-8ef8-99524172879b'),
  ('e7b4611b-025b-413e-a08e-ae6996a302f8'),
  ('ebf7c08d-eb11-43f5-9955-8520adb25188'),
  ('ec5c3ada-0832-4f13-b3f0-79a7bdf9661c'),
  ('ec6ce08f-e0c8-44f5-b861-a8f395544018'),
  ('ecd8ac50-2d6a-4657-8889-85efbe55fccc'),
  ('ef417a61-c38e-4c8d-bf56-0bb3069b23d2'),
  ('f0537ee1-f4cc-4550-8aba-77d6dce2b4ea'),
  ('f1219458-650f-4143-89a3-ebc745d4cfbd'),
  ('f193bb6b-7831-452c-9d7b-e6d694de0d59'),
  ('f2e62c40-2f9f-4a90-b280-cff526b11afa'),
  ('f46df4da-164a-4f8a-9cc7-c78f36d819d0'),
  ('f63db81f-bf62-4fc3-97d1-3cdfc19bd5a0'),
  ('f75b58a4-95d5-4fcc-8fcb-d34f3430fbfc'),
  ('f8b39bce-a0fb-418d-9dc2-f44e5caa0062'),
  ('f90439d9-1cf1-4f37-b2ac-00a226c0bcba'),
  ('fbc5e966-c61e-4f6e-a3fe-236e086a4b44'),
  ('fbd4838d-3398-4ef6-b3ca-b351f2b9aae7'),
  ('fcd141a2-e6c0-416f-8444-ff0a1a74945a'),
  ('ff10fb6b-b0c3-4206-a22b-e23fd3e4eb7a'),
  ('ff51957f-a43b-4261-931e-0fe56faa667f'),
  ('ffdea4ef-7710-447c-8907-e6bbfee76804')
;

-- GUARD 1 — the manifest must still match the table exactly.
DO $$
DECLARE n_listed int; n_found int;
BEGIN
  SELECT count(*) INTO n_listed FROM _stranded_narratives;
  SELECT count(*) INTO n_found  FROM hcp_narratives_v2 x JOIN _stranded_narratives d ON d.id = x.id;
  IF n_listed <> 278 THEN
    RAISE EXCEPTION 'manifest drift: expected 278 ids, list carries %', n_listed;
  END IF;
  IF n_found <> 278 THEN
    RAISE EXCEPTION 'manifest drift: % of 278 ids no longer present in hcp_narratives_v2', n_found;
  END IF;
END $$;

-- GUARD 2 — every listed row must STILL be off the board. If the board was
-- rescored upward between authoring and applying, some of these people are
-- members again and their narratives must not be deleted.
DO $$
DECLARE n_back_on_board int;
BEGIN
  SELECT count(*) INTO n_back_on_board
  FROM hcp_narratives_v2 x
  JOIN _stranded_narratives d ON d.id = x.id
  WHERE x.hcp_id IN (
    SELECT r.hcp_id FROM hcp_rising_star_ranks_v3 r
    WHERE r.therapeutic_area_id = (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc')
  );
  IF n_back_on_board > 0 THEN
    RAISE EXCEPTION 'board moved: % listed narratives now belong to board members', n_back_on_board;
  END IF;
END $$;

DELETE FROM hcp_narratives_v2 x USING _stranded_narratives d WHERE x.id = d.id;

-- Post-condition: the 132 survivors are exactly the rising narratives whose
-- subject is on the 251-row board.
DO $$
DECLARE n_left int; n_orphan int;
BEGIN
  SELECT count(*) INTO n_left FROM hcp_narratives_v2
   WHERE cohort = 'rising_star' AND therapeutic_area_slug = 'nsclc';
  SELECT count(*) INTO n_orphan FROM hcp_narratives_v2 x
   WHERE x.cohort = 'rising_star' AND x.therapeutic_area_slug = 'nsclc'
     AND x.hcp_id NOT IN (
       SELECT r.hcp_id FROM hcp_rising_star_ranks_v3 r
       WHERE r.therapeutic_area_id = (SELECT id FROM therapeutic_areas WHERE slug = 'nsclc'));
  IF n_left <> 132 OR n_orphan <> 0 THEN
    RAISE EXCEPTION 'post-condition failed: % rows left, % still stranded', n_left, n_orphan;
  END IF;
  RAISE NOTICE 'OK: 278 deleted, % rising narratives remain, all on the board', n_left;
END $$;

COMMIT;
