---
configs:
  - config_name: wixqa_expertwritten
    data_files: "wixqa_expertwritten/test.jsonl"
    default: true  
  - config_name: wixqa_simulated
    data_files: "wixqa_simulated/test.jsonl"
  - config_name: wixqa_synthetic
    data_files: "wixqa_synthetic/test.jsonl"
  - config_name: wix_kb_corpus
    data_files: "wix_kb_corpus/wix_kb_corpus.jsonl"

dataset_name: WixQA
pretty_name: WixQA — Enterprise RAG Question-Answering Benchmark + Knowledge-Base Corpus
homepage: "https://arxiv.org/abs/2505.08643"
license: mit
language:
- en
task_categories:
- question-answering
- table-question-answering
task_ids:
- open-domain-qa
annotations_creators:
- expert-generated
- machine-generated
source_datasets:
- original
multilinguality:
- monolingual
size_categories:
- 1K<n<10K
library_name: datasets
---

# WixQA: Enterprise RAG Question-Answering Benchmark

📄 **Full Paper Available:** For comprehensive details on dataset design, methodology, evaluation results, and analysis, please see our complete research paper:

**[WixQA: A Multi-Dataset Benchmark for Enterprise Retrieval-Augmented Generation](https://arxiv.org/abs/2505.08643)**

*Cohen et al. (2025)* - arXiv:2505.08643

## Dataset Summary
**WixQA** is a three-config collection for evaluating and training Retrieval-Augmented Generation (RAG) systems in enterprise customer-support scenarios:

| Config | Purpose | Scale |
|--------|---------|------:|
| **wixqa_expertwritten** | Authentic tickets + expert, step-by-step answers (multi-doc) | 200 |
| **wixqa_simulated** | Concise answers distilled from user–expert chats (multi-doc) | 200 |
| **wixqa_synthetic** | Large-scale LLM-extracted Q-A pairs (single-doc) | 6221 |
| **wix_kb_corpus** | Full Wix Help-Center snapshot for retrieval | 6221 |

All answers are grounded in the **knowledge-base corpus** and ExpertWritten + Simulated often require synthesis of multiple articles.

## Paper

For full details on dataset design, creation and evaluation, see:
**Cohen et al. (2025)**. *WixQA: A Multi-Dataset Benchmark for Enterprise Retrieval-Augmented Generation*.  
arXiv: [2505.08643](https://arxiv.org/abs/2505.08643)


## Supported Tasks
* **Retrieval-Augmented QA** (all Q-A configs + corpus)
* **Multi-Hop Reasoning** (ExpertWritten & Simulated)
* **Dense / Sparse Retrieval Benchmarking** (article_ids serve as ground-truth)

## Languages
English (US).

## Dataset Structure

### Data Fields

| Config | Field | Type | Description |
|--------|-------|------|-------------|
| **Q-A configs** | `question` | `string` | End-user query |
| | `answer` | `string` | Markdown answer |
| | `article_ids` | `list[string]` | IDs of KB docs required to answer |
| **KB corpus** | `id` | `string` | Unique article ID (matches `article_ids`) |
| | `url` | `string` | Public Wix Help-Center URL |
| | `contents` | `string` | Full HTML-stripped article text |
| | `article_type` | `string` | `article` \| `feature_request` \| `known_issue` |

## Dataset Creation

### ExpertWritten
* Source: anonymised real support tickets.
* Answers: drafted and triple-reviewed by support experts (majority vote).

### Simulated
* Source: user–expert chat logs → distilled to single-turn Q-A by GPT-4o.
* Validation: automatic filtering → 3-expert review → simulation replay.

### Synthetic
* Source: each KB article passed through a type-specific GPT-4o prompt.
* Validation: sample manually verified (≥ 90 % accuracy) before full run.

### KB Corpus
Snapshot date: **2024-12-02** (English-only).

## Usage Example

```python
from datasets import load_dataset

qa_ds = load_dataset("Wix/WixQA", "wixqa_expertwritten")
kb_ds = load_dataset("Wix/WixQA", "wix_kb_corpus")

# Example: map article IDs to actual documents
kb_lookup = {row["id"]: row for row in kb_ds}
sample = qa_ds[0]
docs = [kb_lookup[x]["contents"] for x in sample["article_ids"]]
```

## Intended Uses
* Benchmark end-to-end RAG pipelines in procedural, enterprise contexts.
* Pre-train / fine-tune retrieval models on domain-specific language.
* Study hallucination vs. missing-context errors using `article_ids`.

### Out-of-Scope Uses
* Generating personal, legal, or medical advice.
* Deanonymisation of user tickets.

## Licensing
Released under the **MIT License**. Cite “Wix.com AI Research” when using the data.

## Citation
```bibtex
@misc{cohen2025wixqamultidatasetbenchmarkenterprise,
      title={WixQA: A Multi-Dataset Benchmark for Enterprise Retrieval-Augmented Generation}, 
      author={Dvir Cohen and Lin Burg and Sviatoslav Pykhnivskyi and Hagit Gur and Stanislav Kovynov and Olga Atzmon and Gilad Barkan},
      year={2025},
      eprint={2505.08643},
      archivePrefix={arXiv},
      primaryClass={cs.AI},
      url={https://arxiv.org/abs/2505.08643}, 
}
```

## Contributions
Dataset engineered by the Wix AI Research team. External annotators are acknowledged in the paper.