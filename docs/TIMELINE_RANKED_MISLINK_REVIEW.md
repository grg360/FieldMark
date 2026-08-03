# Timeline mis-link review — 7 ranked HCPs

Pre-2001 `publication_authors_v2` links on ranked HCPs (established v3 /
rising composite). The display axis guard already hides these from the axis
without data loss, so there is **no urgency** — decide each link individually.
`gap` = years between this paper and the HCP's earliest modern (>=2001) paper.
Decide per row: **DROP** (disambiguation error) or **KEEP** (genuine history).

DELETE for the chosen links (fill in publication_ids):
```sql
DELETE FROM publication_authors_v2
WHERE hcp_id = '<hcp>' AND publication_id IN ('<pub>', ...);
```

## Kathrin Thormann  ·  [rising_composite]
cfpy_v2 = 2021 · modern cluster starts 2001 · 3 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1982 | 19 | — | [The dream of love and the reality of contraception. Current adolescent sexual behaviour a | `0389454e-bbe5-4551-92fb-5903a795167f` |
|  | 1984 | 17 | — | [Usefulness of the S-S-G, a questionnaire for measuring attitude to pregnancy, sexuality a | `e6281420-124d-4b34-b7df-a0ce09e016db` |
|  | 1984 | 17 | — | [Premature uterine contraction from the psychosomatic viewpoint. A critical literature rev | `8b65c80d-1ecd-496b-97f1-130c4cc4e067` |

## Pierfrancesco Tassone  ·  [established]
cfpy_v2 = 1998 · modern cluster starts 2016 · 8 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1992 | 24 | high | UN-1, a murine monoclonal antibody recognizing a human thymocyte undescribed antigen. | `4eda8468-b0f9-4757-9ff6-de49e9d1db60` |
|  | 1994 | 22 | high | UN1, a murine monoclonal antibody recognizing a novel human thymic antigen. | `19e3d1e8-4e0d-4be8-9dd0-1f3aefef10a0` |
|  | 1994 | 22 | high | A novel monoclonal antibody recognizing human thymocytes and B-cell chronic lymphocytic le | `2cb32e36-9b54-438c-8bf2-39467cfdfeb4` |
|  | 1995 | 21 | high | Detection of an antigenic marker expressed by peripheral blood monocytes and platelets by  | `f08f6269-621a-48af-a775-937c85c082dd` |
|  | 1996 | 20 | high | CD69 expression on primitive progenitor cells and hematopoietic malignancies. | `0229b870-c59c-4c6d-aa8a-30e9c4ce6443` |
|  | 1998 | 18 | high | Purification and characterization of a human sialoglycoprotein antigen expressed in immatu | `49409576-57e0-41df-bcf7-476a70061094` |
|  | 1998 | 18 | high | Identification by differential display of transcripts regulated during hematopoietic diffe | `a260162d-4f87-4323-93d4-edf0cfca1695` |
|  | 1998 | 18 | high | CD36 is rapidly and transiently upregulated on phytohemagglutinin (PHA)-stimulated periphe | `48d6392b-baf0-479e-9829-0de724bd0b5c` |

## Loris De Cecco  ·  [established]
cfpy_v2 = 1986 · modern cluster starts 2015 · 21 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1972 | 43 | — | Some properties of lysine-rich histones of normal and neoplastic tissues. | `c8831cd7-c2dd-4533-b46e-21c59b357799` |
|  | 1977 | 38 | — | Sub-fractionation and characterization of lysine-rich histones from Oberling Guerin-Guerin | `822b54ce-e8ed-4872-810a-08a3208cfef9` |
|  | 1979 | 36 | — | DNA and oestradiol receptor distribution in human breast cancer. | `573d169b-ccf1-40e8-8794-9b3c467f0ece` |
|  | 1980 | 35 | — | Polyamines as biological markers of the effectiveness of therapy in acute leukemia. | `4b19a91e-ee05-43be-aee1-c556f3e862a8` |
|  | 1981 | 34 | — | Levels of polyamines and nucleic acids in human breast carcinoma. | `67ae15ca-a353-45fe-b858-339eabeb85e9` |
|  | 1985 | 30 | — | Polyamines and nucleic acids in gestational trophoblastic tumors. | `a0bbd0e9-6c75-4626-87ae-6fb11d3af4d6` |
|  | 1986 | 29 | — | Differences in polyamine metabolism between carcinomatous and uninvolved human breast tiss | `63f6c5f3-b6f1-4ce9-be37-88da9f9af792` |
|  | 1992 | 23 | — | UN-1, a murine monoclonal antibody recognizing a human thymocyte undescribed antigen. | `4eda8468-b0f9-4757-9ff6-de49e9d1db60` |
|  | 1992 | 23 | — | Pattern and concentration of free and acetylated polyamines in urine of cirrhotic patients | `51771088-4ddc-4ffb-a676-fee658778254` |
|  | 1994 | 21 | — | A novel monoclonal antibody recognizing human thymocytes and B-cell chronic lymphocytic le | `2cb32e36-9b54-438c-8bf2-39467cfdfeb4` |
|  | 1994 | 21 | — | Analysis of peripheral blood normal and malignant cells with the novel murine monoclonal a | `cca15391-e609-45b3-b8b7-bea4b0e9436a` |
|  | 1994 | 21 | — | UN1, a murine monoclonal antibody recognizing a novel human thymic antigen. | `19e3d1e8-4e0d-4be8-9dd0-1f3aefef10a0` |
|  | 1995 | 20 | — | Detection of an antigenic marker expressed by peripheral blood monocytes and platelets by  | `f08f6269-621a-48af-a775-937c85c082dd` |
|  | 1995 | 20 | — | Epidermal growth factor receptor in human breast cancer comparison with steroid receptors  | `c069d411-cb44-4931-9a5d-9399d796a8e1` |
|  | 1996 | 19 | — | CD69 expression on primitive progenitor cells and hematopoietic malignancies. | `0229b870-c59c-4c6d-aa8a-30e9c4ce6443` |
|  | 1996 | 19 | — | Determination of estrogen and progesterone receptors in human breast cancer cytosols: a co | `cbe0bc77-08bc-4d12-889a-83f15b46a381` |
|  | 1996 | 19 | — | Breast cancer estrogen and progesterone receptors. | `1b611403-6fee-4efd-94f9-df6ebd661c43` |
|  | 1998 | 17 | — | Does a relationship exist between trends in estrogen receptor levels and breast cancer inc | `eaf15371-54c1-4807-81ac-d141250d1e23` |
|  | 1998 | 17 | — | Identification by differential display of transcripts regulated during hematopoietic diffe | `a260162d-4f87-4323-93d4-edf0cfca1695` |
|  | 1998 | 17 | — | Purification and characterization of a human sialoglycoprotein antigen expressed in immatu | `49409576-57e0-41df-bcf7-476a70061094` |
|  | 1998 | 17 | — | CD36 is rapidly and transiently upregulated on phytohemagglutinin (PHA)-stimulated periphe | `48d6392b-baf0-479e-9829-0de724bd0b5c` |

## Marco Montella  ·  [established]
cfpy_v2 = 2004 · modern cluster starts 2020 · 3 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1995 | 25 | high | Epidermal growth factor receptor in human breast cancer comparison with steroid receptors  | `c069d411-cb44-4931-9a5d-9399d796a8e1` |
|  | 1996 | 24 | high | Breast cancer estrogen and progesterone receptors. | `1b611403-6fee-4efd-94f9-df6ebd661c43` |
|  | 1996 | 24 | high | Determination of estrogen and progesterone receptors in human breast cancer cytosols: a co | `cbe0bc77-08bc-4d12-889a-83f15b46a381` |

## Luisa Bercich  ·  [established]
cfpy_v2 = 2006 · modern cluster starts 2021 · 2 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1997 | 24 | high | Virological response to interferon treatment in hepatitis C virus carriers with normal ami | `57cc5f10-d78e-430d-b48d-a4d9413afd16` |
|  | 1997 | 24 | high | Virological characterization and liver histology in HCV positive subjects with normal and  | `a0902bb4-701e-4198-b7e3-5caa2b2b18cb` |

## Gerardo Botti  ·  [established]
cfpy_v2 = 1990 · modern cluster starts 2016 · 3 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1995 | 21 | high | Epidermal growth factor receptor in human breast cancer comparison with steroid receptors  | `c069d411-cb44-4931-9a5d-9399d796a8e1` |
|  | 1996 | 20 | high | Breast cancer estrogen and progesterone receptors. | `1b611403-6fee-4efd-94f9-df6ebd661c43` |
|  | 1998 | 18 | high | Does a relationship exist between trends in estrogen receptor levels and breast cancer inc | `eaf15371-54c1-4807-81ac-d141250d1e23` |

## Vito Barbieri  ·  [established]
cfpy_v2 = 2009 · modern cluster starts 2019 · 2 pre-2001 link(s)

| decide | pub_year | gap | conf | title | publication_id |
|---|---|---|---|---|---|
|  | 1998 | 21 | high | CD36 is rapidly and transiently upregulated on phytohemagglutinin (PHA)-stimulated periphe | `48d6392b-baf0-479e-9829-0de724bd0b5c` |
|  | 1998 | 21 | high | Identification by differential display of transcripts regulated during hematopoietic diffe | `a260162d-4f87-4323-93d4-edf0cfca1695` |
